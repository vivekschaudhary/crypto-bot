---
id: CB-3-ARCH
type: bet-architecture
parent: CB-3
status: approved
created: 2026-06-08
author: Enterprise Architect (per the Compass discipline that bet-architectures live with the bet)
inherits_from: docs/foundation/architecture.md
---

# CB-3 — Bet-specific Architecture (Pluggable Strategy Authoring)

> Architectural decisions that go BEYOND what `docs/foundation/architecture.md` defines. Created because the CB-3 pluggable pivot (per [brief PM DRI Decision #6](brief.md#decisions)) introduces a portable module boundary (`lib/strategy-core/`), an interface contract (`AssetAdapter`), and a data model (`asset_class` discriminator + `selected_assets: jsonb`) that the foundation architecture does not specify. Surfaced by Codex PR #42 round-1 BLOCKER on widening architecture scope inside a brief.
>
> This file is the canonical source for those decisions. The brief references it; the stories inherit from it.

## What this file is NOT

- NOT a re-statement of foundation architecture (read [`docs/foundation/architecture.md`](../../foundation/architecture.md) for ULID identity, append-only event log, secrets-at-rest posture, fitness functions, etc.)
- NOT a story-level Engineer DRI Log (Engineer Decisions land in story.md DRI sections)
- NOT a forecast — only what's load-bearing for CB-3.0 / .1 / .2 / .3 / .4 to consume

## Inherits from foundation architecture

Without re-stating: CB-3 inherits ULID identity, append-only event log (for `strategies` revisions), pooler DATABASE_URL via Supabase, `lib/db/migrate.ts` runner, fitness functions (bot tick reliability, success rate, etc.), and the secrets-at-rest posture for any future credential storage in `lib/strategy-*/`.

## Decisions

### 1. `lib/strategy-core/` is a portable module boundary

A new top-level lib directory with **zero dependencies on Coinbase-specific code or any in-repo singletons** (no `lib/coinbase/*` imports; no `lib/env/*` reads; no DB reads). Exports types + interfaces + pure functions only.

**Contents (canonical shape):**
- `types.ts` — `Strategy`, `Asset` (`{assetClass: AssetClass, identifier: string}`), `AssetClass` (string enum: `"crypto-coinbase" | "equity-broker" | ...`), `EntryRules`, `ExitRules`. All exported as Zod schemas + inferred TS types.
- `adapter.ts` — `AssetAdapter` interface (see Decision #2).
- `validate.ts` — universal rule validation. Pure functions; no I/O. Rules:
  - RSI thresholds in `[0, 100]`
  - MA periods in `{5, 10, 20, 50}`
  - Entry RSI < Exit RSI (no contradictions)
  - `position_size_usd > 0`
  - `per_session_buy_count_cap > 0`
  - `per_session_dollar_cap > 0`
  - Selected assets count in `[1, 5]`
- `supersession.ts` — pure-function versioning helpers. Takes the old strategy ID + new strategy payload; emits the new row + the update to apply to the old row (`superseded_by_strategy_id = new.id`). DB-agnostic; caller wires the actual `INSERT` / `UPDATE`.
- `top-n.ts` — generic top-N-by-volume ranking. Takes an `AssetAdapter` + N; returns top-N assets sorted by 24h volume. No knowledge of which asset class; relies on adapter for both candidate-fetch and ranking-data.
- `form-schema.ts` — Zod schema for the form-submitted payload. Consumes `Asset` from `types.ts`.

**Architectural invariant**: every file in `lib/strategy-core/` must be importable by an external package consumer without pulling in crypto-app singletons. Verified by a build-time test that imports each file in isolation against a mock environment.

### 2. `AssetAdapter` interface — the seam where asset classes plug in

```ts
// lib/strategy-core/adapter.ts
export interface AssetAdapter {
  /**
   * Which asset class this adapter handles. Used by the form to display
   * the right label/copy and by save action to set the strategies.asset_class column.
   */
  readonly assetClass: AssetClass;

  /**
   * Returns the candidate set of assets the operator can select from
   * (e.g., all Coinbase products; or all listed S&P 500 tickers for equity).
   * Adapter handles caching / pagination / etc. internally.
   */
  getCandidateAssets(): Promise<Asset[]>;

  /**
   * Ranks the given assets by 24h volume (or analog signal). Returns
   * sorted descending. Universal across asset classes; the data source
   * differs per adapter.
   */
  rankByVolume(assets: Asset[]): Promise<Asset[]>;

  /**
   * Returns the identifier string used as the FK / external ID for an asset.
   * For crypto-coinbase: the Coinbase `product_id` (e.g., "BTC-USD").
   * For equity: the broker's symbol (e.g., "AAPL") possibly with venue suffix.
   */
  getAssetIdentifier(asset: Asset): string;
}
```

The adapter is the ONLY place asset-class-specific logic lives. Everywhere else in `lib/strategy-core/` operates on `Asset` (the abstract pair) and the indicator math (`EntryRules` / `ExitRules`).

### 3. `lib/strategy-coinbase/` is the crypto-coinbase adapter

```
lib/strategy-coinbase/
└── adapter.ts        ← implements AssetAdapter; uses lib/coinbase/*
```

The single file in this module imports from `lib/coinbase/{client, market}` to fetch products + product details, ranks by `volume_24h`, returns the top-N via the universal ranking helper from `lib/strategy-core/top-n.ts`. **This is the ONLY place `lib/strategy-core/` would be coupled to Coinbase if we were sloppy — keep the import boundary firmly here.**

When the equity app is ready, a parallel `lib/strategy-alpaca/` (or `lib/strategy-tradier/`, etc.) sits alongside; both implement `AssetAdapter`; the form picks the right one at module load.

### 4. Strategies DB schema (overrides foundation's "strategies" placeholder mention)

```sql
-- 0004-strategies.sql (CB-3.2)
CREATE TABLE strategies (
  id                          ulid PRIMARY KEY,
  name                        text NOT NULL,
  asset_class                 text NOT NULL,  -- discriminator: 'crypto-coinbase' | 'equity-broker' | ...
  selected_assets             jsonb NOT NULL, -- array of {assetClass, identifier}; validated app-layer
  entry_rules                 jsonb NOT NULL, -- Zod-validated; RSI threshold, MA period, MA reinforcement
  exit_rules                  jsonb NOT NULL, -- Zod-validated; RSI threshold, min-profit %, sell-fraction
  position_size_usd           numeric NOT NULL CHECK (position_size_usd > 0),
  per_session_buy_count_cap   integer NOT NULL CHECK (per_session_buy_count_cap > 0),
  per_session_dollar_cap      numeric NOT NULL CHECK (per_session_dollar_cap > 0),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by_user_id          ulid NOT NULL REFERENCES auth_users(id),
  superseded_by_strategy_id   ulid REFERENCES strategies(id)
);

-- bot_sessions: append-only FK reference
ALTER TABLE bot_sessions
  ADD COLUMN active_strategy_id ulid REFERENCES strategies(id);
```

**Append-only at app layer:**
- No `UPDATE strategies` paths from app code.
- Revising a strategy: INSERT a new row + UPDATE the old row's `superseded_by_strategy_id` (this is the ONE allowed UPDATE — supersession-only; never strategy content).
- `bot_sessions.active_strategy_id` IS mutable (changes when operator activates a new revision).

**Validation invariants enforced by DB CHECK + app-layer Zod:**
- DB CHECK: `position_size_usd > 0`, `per_session_*_cap > 0` (defense-in-depth; same constraints in `lib/strategy-core/validate.ts`).
- App-layer Zod: `entry_rules` + `exit_rules` shape validation; `selected_assets` cardinality `[1, 5]`; entry vs exit RSI ordering.

### 5. Extraction path to `@vc1023/strategy-core` npm package

When the equity app is ready to consume:

1. Move `lib/strategy-core/` to `packages/strategy-core/` (new workspace) OR a separate repo.
2. Add `package.json`: `"name": "@vc1023/strategy-core"`, semver-stable v0.1.0.
3. Publish via `npm publish --access public` (per the `@vc1023/passkey-2fa` precedent's npm namespace).
4. Crypto-app: find/replace `from "@/lib/strategy-core/..."` → `from "@vc1023/strategy-core"`. Estimated ~30 minutes; no semantic changes.
5. Equity-app: consume directly; install its own adapter (e.g., `lib/strategy-alpaca/`).

**The architectural invariant from Decision #1 (no crypto-app singletons in `lib/strategy-core/`)** is what makes this extraction a half-day job vs a multi-week refactor. Verified during CB-3.0 build by the build-time import-isolation test.

### 6. Form architecture — server component shell + client component generic form

`/dashboard/strategy/` route:

- `page.tsx` (Server Component) — fetches the adapter from a static module-load registry (e.g., `getAdapter(env.ASSET_CLASS)`), wraps `_form.tsx`
- `_form.tsx` (Client Component) — takes `adapter: AssetAdapter` as a prop; renders the asset multi-select + rule sections. Asset-class-agnostic.
- `_selector.tsx` (Client Component) — wraps the multi-select dropdown; calls `adapter.getCandidateAssets()` via a server action; renders options.
- `_actions.ts` — server actions: `saveStrategy(formData, adapterKey)`. Validates via `lib/strategy-core/validate`; inserts via supersession; updates `bot_sessions.active_strategy_id`.

The form is generic; the asset selector is generic; the save action is generic. Only the adapter choice is asset-class-specific, and that choice happens at module-boundary (env-var-driven for now; could become a tab-switch UI later).

### 7. Observability shape

CB-3 reuses the structured-JSON `console.log` pattern from CB-2.5's `lib/coinbase/trace.ts`. Form submit handler emits:

```json
{
  "event": "strategy.save",
  "success": true | false,
  "asset_class": "crypto-coinbase",
  "strategy_id_new": "...",
  "strategy_id_superseded": "..." | null,
  "validation_errors": ["..."]
}
```

Same retention caveat as CB-2.5: Vercel Pro 1-day; aspirational 30-day requires Observability Plus / Sentry / DB persistence. Per CB-2 brief amendment 2026-06-08.

## Risks

- **Adapter interface ossification** — once an `AssetAdapter` shape is exported via `@vc1023/strategy-core` v0.1.0, breaking changes require coordinated rollout across consumers. Mitigation: keep the interface MINIMAL during CB-3.0 build; resist adding fields until a real second consumer requires them. Operator-accepted per [brief PM Risk: pluggable scope cost](brief.md#risks).

- **DB CHECK constraint vs Zod validation duplication** — both layers enforce `position_size_usd > 0` etc. Risk: one layer drifts from the other. Mitigation: CB-3.2 (DB schema) story.md AC explicitly asserts that every DB CHECK has a corresponding Zod constraint in `lib/strategy-core/validate.ts`; CI test verifies the alignment.

- **bot_sessions migration timing** — adding `bot_sessions.active_strategy_id` requires `bot_sessions` table to exist; foundation architecture mentions it but no migration has shipped yet. Resolution path: CB-3.2 ships BOTH the `strategies` table AND the `bot_sessions` table in the same migration if `bot_sessions` doesn't exist yet; OR CB-4 (bot runtime) creates `bot_sessions` first and CB-3.2 only adds the column.

## Issues

- [2026-06-08] [Architect] **Determine bot_sessions migration ownership** — does CB-3.2 ship the `bot_sessions` table or just the FK column?
  - **Severity (required, mandatory):** P3 (resolvable at `/create-story CB-3.2` time)
  - **Owner (required, mandatory):** Engineer at CB-3.2 build time
  - **Status:** open
  - **Area (required, tag):** data-model / migration-ownership
  - **Resolution (filled when closed):** [to be filled at CB-3.2 story creation — check whether `bot_sessions` table exists in any prior migration; if not, CB-3.2 ships both tables; if so, CB-3.2 only adds the FK column]

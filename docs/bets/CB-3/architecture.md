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

The single file in this module imports from `lib/coinbase/market` to call `getProducts()` (single endpoint; returns the full product list with `approximate_quote_24h_volume` already attached per product per CB-2.2's Zod schema after the 2026-06-08 extension). Ranks by **`approximate_quote_24h_volume`** (Coinbase's pre-computed DOLLAR volume; parsed via `parseFloat`); returns the top-N via the universal ranking helper from `lib/strategy-core/top-n.ts`. **This is the ONLY place `lib/strategy-core/` would be coupled to Coinbase if we were sloppy — keep the import boundary firmly here.**

**Decision #3 amended 2026-06-08 during `/create-story CB-3.1`** (per Codex PR #46 round-1 BLOCKER on the original "products + product details" framing being out of sync with the story's contract): the original wording implied calling `getProducts()` for the list + `getProduct(id)` per asset for details. After confirming CB-2.2's schema already returns `volume_24h` on every product in the `getProducts()` response, the adapter uses a SINGLE `getProducts()` call for both candidate-discovery AND ranking-data — no per-asset `getProduct(id)` loop needed.

**Decision #3 further amended 2026-06-08 during `/build CB-3.1`** — empirical discovery: Coinbase's `volume_24h` is **base-currency token count**, not dollar value. PEPE-USD has ~10^14 tokens traded ≈ $80M USD; BTC-USD has ~10^4 tokens traded ≈ $685M USD. Raw `volume_24h` ranks PEPE/SHIB at the top (10^11+ token counts beat 10^4); operator's intent ("top by liquidity") requires **dollar volume**. Coinbase pre-computes this as `approximate_quote_24h_volume` (base × price for trailing 24h; returned as string). The ranking field switched from `volume_24h` to `approximate_quote_24h_volume` during the build PR (CB-3.1's commit), with concurrent amendments to CB-3 brief + CB-3.1 story + CB-2.2's product schema (`market-schemas.ts:84`) to type the field. Live integration test confirmed top-5 by dollar volume = `[BTC-USD, ETH-USD, ZEC-USD, XRP-USD, SOL-USD]` (BTC ranks #1 of 114 USD-quoted spot products). Lesson encoded in CB-3.1's commit body: **when a field name implies a quantity, verify the unit empirically before committing to it across artifacts.**

When the equity app is ready, a parallel `lib/strategy-alpaca/` (or `lib/strategy-tradier/`, etc.) sits alongside; both implement `AssetAdapter`; the form picks the right one at module load.

### 4. Strategies DB schema (overrides foundation's "strategies" placeholder mention)

```sql
-- 0004-strategies.sql (CB-3.2)
-- ULIDs stored as text per foundation architecture.md § Identity strategy
-- (Crockford base32; 26 chars; debuggable; matches external-tool expectations).
CREATE TABLE strategies (
  id                          text PRIMARY KEY,
  name                        text NOT NULL,
  asset_class                 text NOT NULL,  -- discriminator: 'crypto-coinbase' | 'equity-broker' | ...
  selected_assets             jsonb NOT NULL, -- array of {assetClass, identifier}; validated app-layer
  entry_rules                 jsonb NOT NULL, -- Zod-validated; RSI threshold, MA period, MA reinforcement
  exit_rules                  jsonb NOT NULL, -- Zod-validated; RSI threshold, min-profit %, sell-fraction
  position_size_usd           numeric NOT NULL CHECK (position_size_usd > 0),
  per_session_buy_count_cap   integer NOT NULL CHECK (per_session_buy_count_cap > 0),
  per_session_dollar_cap      numeric NOT NULL CHECK (per_session_dollar_cap > 0),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by_user_id          text NOT NULL REFERENCES auth_users(id),
  superseded_by_strategy_id   text REFERENCES strategies(id)
);

-- bot_sessions: append-only FK reference. ULID stored as text per foundation.
ALTER TABLE bot_sessions
  ADD COLUMN active_strategy_id text REFERENCES strategies(id);
```

**Note on ULID column type:** Per [foundation architecture § Identity strategy](../../foundation/architecture.md#identity-strategy), ULIDs are stored as Postgres `text` (NOT a hypothetical `ulid` column type). The 26-char Crockford base32 representation goes in plain `text` columns; FK constraints work the same way. The CB-3.2 migration MUST use `text` to stay consistent with prior migrations (e.g., `auth_users.id` is `text` for the same reason).

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

- `page.tsx` (Server Component) — invokes the concrete adapter (`makeCoinbaseAdapter()`); resolves the top-5 + active-strategy data SERVER-SIDE; passes only PRIMITIVES (`assetClass: AssetClass`, `candidates: Asset[]`, `initialPayload: StrategyFormPayload`, `topFiveAsOf: Date`, `isRevise: boolean`) to the Client Component
- `strategy-form-client.tsx` (Client Component; was `_form.tsx` in original sketch) — takes asset-class primitives as props (NOT the adapter object itself); renders the asset multi-select + rule sections. Asset-class-agnostic at the data-shape level.
- Asset selector — inline within the form Client Component; consumes the resolved `candidates: Asset[]` prop. Does NOT call adapter methods directly (the server-rendered initial state is sufficient).
- `strategy-actions.ts` (was `_actions.ts`) — server actions: `saveStrategy(formData)`. Validates via `lib/strategy-core/validate`; inserts via supersession; updates `bot_sessions.active_strategy_id`.

The form is generic over asset-class data; the save action is generic. Only the adapter choice is asset-class-specific, and that choice happens at the Server Component (`page.tsx`) boundary — env-var-driven for now; could become a tab-switch UI later.

**Decision #6 amended 2026-06-09 during PR #50** (post-merge defect fix on CB-3.3): the originally approved sketch named `_form.tsx` taking `adapter: AssetAdapter` as a prop + `_selector.tsx` calling `adapter.getCandidateAssets()` via a server action. Production deploy of CB-3.3 (PR #49 merged 2026-06-08) revealed that React Server Components cannot serialize regular function methods across the RSC boundary — only Server Actions can cross. Passing the adapter object to a Client Component caused three broken `E{digest:...}` reference errors at runtime (one per AssetAdapter method), crashing every GET /dashboard/strategy with a 500. The fix moves all adapter invocation to the Server Component layer + passes resolved primitives across the RSC boundary. **Architectural intent preserved**: the form is still generic over asset-class portability (the data shape is asset-class-agnostic); the adapter is still the seam where asset-class-specific logic lives (CB-3.1's `makeCoinbaseAdapter` / future `lib/strategy-alpaca/` / etc.). Future asset-class-specific UI behavior that needs runtime adapter calls in the browser must be exposed as discrete Server Actions, not passed as adapter prop members. **Lesson encoded for future Server/Client Component prop design**: RSC props must be JSON-serializable OR Server Actions; never pass structural types with function members across the RSC boundary. Local `pnpm dev` + `pnpm build` are too lenient to catch this — only Vercel runtime surfaces it. Worth a Compass-original anti-pattern name in a future `/retro` (`[rsc-prop-serialization]`).

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
  - **Owner (required, mandatory):** Engineer at CB-3.2 build time → **resolved at PM `/create-story CB-3.2` time 2026-06-08** (earlier than expected; PM verified migration history)
  - **Status:** **CLOSED 2026-06-08**
  - **Area (required, tag):** data-model / migration-ownership
  - **Resolution:** **FK column ONLY** — `bot_sessions` table already exists in [`db/migrations/0001-init.sql:23-30`](../../../db/migrations/0001-init.sql) (created at v1 foundation scaffold per architecture intent). CB-3.2 ships ONLY `ALTER TABLE bot_sessions ADD COLUMN active_strategy_id text REFERENCES strategies(id)` — NOT a second creation. Codified in [CB-3.2 story.md AC 2](stories/CB-3.2/story.md) + [PM DRI Decision in story DRI Log](stories/CB-3.2/story.md). Closed at story drafting time, not at build time, because the resolution check (`grep bot_sessions db/migrations/*.sql`) is mechanical and the answer is unambiguous.

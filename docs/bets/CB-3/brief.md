---
id: CB-3
type: feature
status: approved
priority: P0
parent: FOUNDATION-PRODUCT
portfolio_stub: false
depends_on: [CB-1, CB-2]
parallel_with: []
architecture_required: true
created: 2026-05-31
promoted: 2026-06-08
author: PM
sources:
  - docs/foundation/product.md
  - docs/foundation/architecture.md
  - docs/foundation/portfolio.md
  - docs/bets/CB-2/brief.md
key_metric:
  name: Strategy-config-write success rate (operator clicks Save → DB row persisted without form-level validation rejection, on operator's first 10 authoring attempts)
  baseline: n/a (greenfield — no strategy authoring UI in production yet)
  target: ">= 95% over the first 10 attempts. Below 95% signals the validation rules are too strict (operator-friction) or too permissive (false-confidence about strategy validity)."
  source: structured-JSON Vercel runtime log emitted by the form's submit handler — same observability pattern shipped in CB-2.5 (`lib/coinbase/trace.ts`); CB-3 reuses the structured-log shape for form submit events.
guardrails:
  - name: Strategy validation completeness (no overlapping/contradictory entry rules; no negative position sizes; per-session caps > 0)
    threshold: 100% of accepted strategies pass the documented validation rules; CI test asserts every rule branch
  - name: Strategy versioning preserves audit (revising a strategy creates a new row; old strategies stay queryable)
    threshold: append-only at the data layer per [architecture.md § Append-only event log](../../foundation/architecture.md#identity-strategy); no UPDATE paths from app code
  - name: Single active strategy per bot session (MVP simplicity)
    threshold: UNIQUE constraint on `(session_id)` for active strategy reference; enforced at DB layer
  - name: Top-5 ranking based on Coinbase's global 24h volume (NOT operator's personal trading volume)
    threshold: ranking algorithm calls `lib/coinbase/getProducts()` only and ranks by **`approximate_quote_24h_volume`** (Coinbase's pre-computed DOLLAR volume; the response attaches this field to each product per CB-2.2's schema as extended 2026-06-08); no per-asset `getProduct(id)` loop needed; no `lib/coinbase/getAccountTradeHistory()` reads; CI test asserts no auth'd-account reads in the top-5 path. **NOT `volume_24h`** — that field is base-currency token count (PEPE-USD has ~10^14 tokens traded but ~$80M dollar volume; BTC-USD has ~10^4 tokens but ~$685M); ranking by raw `volume_24h` would surface meme coins, defeating the operator's "currently liquid" intent. See [architecture Decision #3 amendments 2026-06-08](architecture.md#3-libstrategy-coinbase-is-the-crypto-coinbase-adapter).
measurement_window_days: 7
check_in_cadence: weekly
area_tags: [strategy, ui, validation, dependency-management, data-model]
estimate:
  duration_weeks: 3
  confidence: medium
  refined_by: brief-approval
  refined_at: 2026-06-08
  estimated_start: 2026-06-09
  estimated_end: 2026-06-29
---

# CB-3 — Strategy authoring + top-5 selection

> The bet where the operator's intent becomes a typed config the bot can read. Without CB-3, CB-4's cron tick has nothing to evaluate against — the bot is RSI/MA math with no inputs.

## Problem

The operator needs to author a named DCA strategy: which cryptos to consider (top-5 from CB-2), what RSI thresholds trigger entries (e.g., `RSI < 30 → buy`), what MA conditions reinforce them (e.g., `price < MA20 + RSI < 35`), what take-profit conditions exit positions (e.g., `RSI > 65 + ≥ 1.5% profit → sell 50%`), what per-buy position sizes apply, and what per-session caps prevent runaway deployment.

Today, none of that exists. CB-2 ships the Coinbase wrapper and CB-1 ships passkey auth, but the bot has no config to read. The operator can't author a strategy. CB-4's bot tick is blocked on this bet.

Per [product.md § In scope](../../foundation/product.md#in-scope), the product promises **"signal-driven entries"** and **"take-profit exits"** that the operator configures. Per [product.md § DRI Decision: deterministic signal rules](../../foundation/product.md), ML/AI signal config is explicitly out — the strategy is a typed-rule structure the operator hand-authors. CB-3 is the bet that materializes this.

## User

**Primary user: the operator.** CB-3 is the first UI surface since [CB-1.6](../CB-1/stories/CB-1.6/story.md) (onboarding-UX) — the operator opens a form, picks 5 cryptos from a top-5 selector, authors their rule structure, hits Save. The whole flow happens in the authenticated `/dashboard` Server-Component routes.

**Secondary user: CB-4 (bot runtime, separate bet) as the typed config consumer.** CB-4's `*/15` cron tick reads the active strategy row, evaluates signals against CB-2's market data, emits a decision. CB-3's data model is the contract between operator intent and bot behavior.

CB-5 (dashboard) reads CB-3's strategy rows too — surfaces the active strategy alongside the bot's decision-trace log. CB-3 → CB-4 is the load-bearing flow; CB-3 → CB-5 is informational.

## Why this matters

CB-3 sits on the **critical path** per [plan.md § Full schedule](../../foundation/plan.md#full-schedule) — it's the binding-dep for CB-4 (the bot runtime). CB-2 finished 11 days ahead of v7's estimate (2026-06-08 vs 2026-06-13), pulling CB-3's `estimated_start` from 2026-06-15 to 2026-06-09. If CB-3 also ships ahead of estimate, the MVP target keeps compressing.

CB-3 is also **the first UI re-engagement after 5 stories of pure library code** (CB-2.1–.5). The forward-reference e2e expectation notes added to this stub during CB-2.5 development warned about this exact context loss: static mocks reliably masked real bugs in CB-1.6 (Playwright surfaced 2 production issues — `@simplewebauthn/browser@11` API drift + begin-response shape mismatch). Same risk class applies here.

Getting CB-3's data model right once means CB-4 inherits a stable typed contract for every bot tick. Getting it wrong once means coordinated migrations + cross-bet rewrites of CB-4's tick handler.

## Hypothesis (the bet)

If we ship a strategy-authoring form UI at `/dashboard/strategy` (Server Component shell + Client Component form for editor controls) backed by a `strategies` DB table (append-only revisions; one active per `bot_session`) with deterministic validation rules (RSI thresholds in [0, 100]; MA periods in {5, 10, 20, 50}; position sizes > 0; per-session caps > 0; entry / exit rules don't contradict), driven by a top-5-by-global-DOLLAR-volume algorithm that picks the candidate cryptos via a single CB-2 `getProducts()` call (the response attaches `approximate_quote_24h_volume` — the dollar-volume field — to each product), then **the operator can author + persist a valid strategy within 5 minutes on first attempt; CB-4 can read it as a typed Zod-validated row on every tick; and the "create a strategy" clause of the MVP loop ([product.md](../../foundation/product.md))** is delivered.

## Defensibility

**None.** Per [product.md § Defensibility](../../foundation/product.md#defensibility--moat): RSI/MA are public indicators; Coinbase data is API-public; no proprietary intelligence accrues. The bet's "moat" — to the extent there is one — is the **deterministic-not-ML** posture: when the operator inspects a bot decision via CB-5's dashboard, the strategy's rules are legible (RSI < 30 + price < MA20 → buy) instead of opaque ("the model said buy"). That's process moat for the single operator; not transferable.

**Moat impact (one line):** None. CB-3 enables the loop; it doesn't earn user lock-in beyond the operator's process trust.

## Scope

### In scope

**Architectural pivot (PM DRI Decision #6 below):** CB-3 ships a **pluggable strategy core** designed for extraction to a shared npm package later — same pattern as `@vc1023/passkey-2fa`. Crypto-coinbase adapter is the only consumer in this bet; equity adapter slots in via a future bet when the operator's equity app is ready to consume. **All architectural shapes (`lib/strategy-core/` boundary, `AssetAdapter` interface, DB schema, form architecture) are defined in [`docs/bets/CB-3/architecture.md`](architecture.md)** — the brief lists scope, the architecture file defines structure.

- **`lib/strategy-core/`** — portable; asset-class-agnostic; designed for extraction:
  - `types.ts` — `Strategy`, `Asset` (`{assetClass, identifier}`), `AssetClass` (enum), `EntryRules`, `ExitRules` + Zod schemas
  - `adapter.ts` — `AssetAdapter` interface: `getCandidateAssets()`, `rankByVolume(assets)`, `getAssetIdentifier(asset)`. Pure interface; no impl
  - `validate.ts` — universal rule validation (RSI thresholds in [0, 100]; MA periods in {5, 10, 20, 50}; entry RSI < exit RSI; position size > 0; per-session caps > 0). Indicator math is asset-class-agnostic
  - `supersession.ts` — pure-function versioning logic (DB-agnostic; caller wires); used by save action
  - `top-n.ts` — generic top-N-by-volume ranking; takes an `AssetAdapter` + returns top-N assets
  - `form-schema.ts` — Zod schema for form payload; consumes `Asset` types from `types.ts`
- **`lib/strategy-coinbase/`** — crypto-coinbase adapter:
  - `adapter.ts` — implements `AssetAdapter`: `getCandidateAssets()` calls `lib/coinbase/getProducts()`; `rankByVolume()` ALSO calls `lib/coinbase/getProducts()` to build a `product_id → approximate_quote_24h_volume` (dollar-volume) lookup map (CB-2.2's schema attaches `approximate_quote_24h_volume` to every product per the 2026-06-08 schema extension — no per-asset `getProduct(id)` loop needed; see [architecture Decision #3 amendments 2026-06-08](architecture.md#3-libstrategy-coinbase-is-the-crypto-coinbase-adapter) for the field-choice rationale); `getAssetIdentifier()` returns the Coinbase `product_id` (e.g., `"BTC-USD"`). The ONLY file in this story that imports from `lib/coinbase/`; `lib/strategy-core/` stays Coinbase-free.
- **`strategies` DB schema** via a new migration (e.g., `0004-strategies.sql`):
  - Primary key: ULID (per [architecture.md § Identity strategy](../../foundation/architecture.md#identity-strategy))
  - Columns: `id`, `name`, `asset_class` (text — discriminator: `"crypto-coinbase" | "equity-broker" | ...`), `selected_assets` (jsonb — array of `{assetClass, identifier}`), `entry_rules` (jsonb), `exit_rules` (jsonb), `position_size_usd` (numeric), `per_session_buy_count_cap` (int), `per_session_dollar_cap` (numeric), `created_at`, `created_by_user_id`, `superseded_by_strategy_id` (self-FK for versioning)
  - Append-only at app layer; supersession via the new row + FK pattern (per architecture.md)
  - `bot_sessions.active_strategy_id` FK to latest revision
- **Strategy authoring form** Client Component (`/dashboard/strategy/_form.tsx`):
  - Takes an `adapter: AssetAdapter` prop — generic across asset classes
  - Name field, asset multi-select (uses `adapter.getCandidateAssets()` for the dropdown options), entry rules, exit rules, position size, per-session caps, inline validation feedback
- **Server action** at `/dashboard/strategy/_actions.ts`:
  - `saveStrategy(formData)` — generic; validates via `lib/strategy-core/validate`; inserts via `lib/strategy-core/supersession`; takes adapter param for any asset-class-specific transformation
- **Structured-log emit** per submit: `{event: "strategy.save", success: boolean, asset_class: string, validation_errors?: string[]}` (reuses CB-2.5's pattern + adds `asset_class` discriminator)
- **Test coverage:**
  - Unit tests for `lib/strategy-core/*` (asset-class-agnostic; both crypto-coinbase + a mock equity adapter to prove pluggability)
  - Unit tests for `lib/strategy-coinbase/adapter.ts` (mocked CB-2 wrapper)
  - Unit tests for the server action (mocked DB)
  - Integration tests against real Coinbase via the top-5 algorithm using the coinbase adapter (operator-gated)
  - **Playwright e2e** for the authoring flow (CB-1.6 lesson load-bearing)

### Out of scope (deferred to other bets or follow-ups)

- **CB-4 bot tick** that reads the active strategy + evaluates signals (separate bet)
- **CB-5 dashboard surfaces** beyond the strategy authoring view itself (full bot state + decision-trace log lives in CB-5)
- **Multiple parallel strategies** (operator switches between named strategies) — deferred; MVP is single-active per session; revision via supersession is the versioning model
- **AI/ML signal config** (explicitly OUT per [product.md DRI Decision](../../foundation/product.md))
- **Auto-rebalancing** / portfolio reconciliation
- **Multi-exchange** (Coinbase only at MVP)
- **Strategy import/export** (out-of-MVP per [portfolio.md § Deliberately out](../../foundation/portfolio.md))
- **Auto-suggest strategy parameters** based on the operator's historical Coinbase trade fills — interesting; deferred to post-MVP

## Open questions for Researcher

1. **Top-5 stability cadence**: how often does Coinbase's top-5-by-24h-volume actually churn? If BTC/ETH/SOL/DOGE/ADA are the same week-over-week 95% of the time, the algorithm can be simpler (cached daily). If churn is high, the top-5 selection UI needs to surface "yesterday's top-5 vs today's" to avoid surprising the operator mid-session. (Affects [Story CB-3.1 design](#stories).) **Seeded empirically 2026-06-08** via CB-3.1's integration test: `[BTC-USD, ETH-USD, ZEC-USD, XRP-USD, SOL-USD]`. Full closure ~7 days post-CB-3.3 ship via runtime-log review.
2. ~~**RSI period default**~~ — **CLOSED 2026-06-08** at `/create-story CB-3.3` via PM + Engineer DRI Decision: **RSI period is NOT operator-configurable in the form**; the `EntryRules` Zod type from CB-3.0 has no `rsiPeriod` field (only `rsiThreshold`). RSI period is a CB-4 bot-tick concern; fixed at **RSI(14)** per retail-trader convention. The form exposes RSI THRESHOLD (operator-tuned per-strategy) but not RSI PERIOD (architectural constant). See [CB-3.3 story Engineer DRI Decision #7](stories/CB-3.3/story.md).

## Research findings

Researcher item 1 (top-5 churn) — addressable empirically once CB-3.1 ships and the algorithm runs against live Coinbase data for a week. CB-3.1's integration test logs the top-5 result; check-in 1 captures the variability. **Seeded 2026-06-08**; full closure pending ~7 days of CB-3.3 production usage.

Researcher item 2 (RSI period default) — **CLOSED 2026-06-08** at `/create-story CB-3.3`. Resolution: RSI period not exposed in form; CB-4 bot tick hardcodes RSI(14) per retail convention.

## User pain input (from Support)

_n=1 single-operator product — Support pain mirrors the operator's own UX experience. The operator has noted (informally, during foundation review):_

- **The 3Commas form fatigue**: the operator tried 3Commas + bailed because the strategy-config UI is overwhelming (15+ tabs, opaque "DCA" + "GRID" + "Smart Trade" modes). CB-3's authoring form must NOT replicate this. Single form. Single strategy. Inline validation feedback. No multi-tab modal.
- **Coinbase Recurring Buy frustration**: the operator burned half a day on Recurring Buy that fired on rips. CB-3's strategy semantics MUST surface "this strategy only buys on RSI < 30 entries" prominently in the form's review step so the operator can sanity-check before saving.
- **Operator's spreadsheet history**: pre-CB-3, the operator tracked their DCA intent in a Google Sheet (RSI buckets, position sizes, dollar caps). CB-3 replaces that sheet. Form should feel like a structured version of the sheet, not a different paradigm.

## Stories (forecast — decomposed one at a time via `/create-story CB-3`)

_**4 stories** (was 5 at brief approval; CB-3.4 FOLDED into CB-3.3 at `/create-story CB-3.3` per PM Decision 2026-06-08 — see story.md DRI Log). Not authoritative; the workflow estimate model fires the "Stories created" trigger as each story.md file lands._

Expected decomposition (forecast for planning only; not committed scope):

- **CB-3.0 — `lib/strategy-core/` foundation (pluggability primitive)** ✅ SHIPPED 2026-06-08 (PR #45) — types + Zod schemas + `AssetAdapter` interface + universal validation + supersession + generic top-N ranking. NO Coinbase dependency at this layer; designed for extraction to `@vc1023/strategy-core` npm package when the equity app is ready to consume (per the [`@vc1023/passkey-2fa` precedent](https://www.npmjs.com/package/@vc1023/passkey-2fa)). Includes a mock equity adapter in tests to prove the abstraction holds.
- **CB-3.1 — `lib/strategy-coinbase/` adapter + first integration against CB-2** ✅ SHIPPED 2026-06-08 (PR #47) — implements `AssetAdapter` for crypto-coinbase; ranks Coinbase products by **DOLLAR volume** via a single `getProducts()` call using the `approximate_quote_24h_volume` field (CB-2.2's schema attaches this field to each product per the 2026-06-08 extension; raw `volume_24h` is base-currency TOKEN count and biases to meme coins — see [architecture Decision #3 amendments 2026-06-08](architecture.md#3-libstrategy-coinbase-is-the-crypto-coinbase-adapter) for the empirical discovery during `/build CB-3.1`). Integration test against real Coinbase **seeds the first empirical observation** for Researcher Open Question #1 (top-5 stability cadence; first observed 2026-06-08: `[BTC-USD, ETH-USD, ZEC-USD, XRP-USD, SOL-USD]`); full closure happens after ~1 week of runtime-log accumulation post-CB-3.3. Server-only — no UI yet.
- **CB-3.2 — `strategies` DB schema + migration** ✅ SHIPPED 2026-06-08 (PR #48) — new migration creates the table with `asset_class` discriminator + `selected_assets: jsonb`; reuses `lib/strategy-core/types.ts` Zod schemas (no duplicate type definitions). Wired through `lib/db/migrate.ts` (auto-applies on Vercel production deploys). Architecture Issue #1 (bot_sessions ownership) RESOLVED at story drafting: CB-3.2 adds the FK column only; table already exists in 0001-init.sql.
- **CB-3.3 — Strategy authoring form UI + save action + activation (folds CB-3.4)** — `/dashboard/strategy` Server Component + Client Component generic form (takes `adapter: AssetAdapter` prop) + server action that validates + INSERTs strategy + wires supersession + UPSERTs `bot_sessions.active_strategy_id` + emits structured log. **First Playwright e2e of CB-3** — operator authors a strategy → save → reload → strategy persists; second spec verifies supersession on revise. CB-1.6 lesson applies in force. Form is asset-class-agnostic; CB-3 ships only the crypto-coinbase adapter wired into the route. **Folds CB-3.4** per PM Decision at `/create-story CB-3.3` 2026-06-08: architecture Decision #6 already specifies the save action does validate + supersession + activation; single-active model means save = activate; no separate UI step needed at MVP.
- ~~**CB-3.4 — Strategy activation + bot_session wiring**~~ — **FOLDED into CB-3.3** per PM Decision at `/create-story CB-3.3` 2026-06-08. The architecture-documented save action already updates `bot_sessions.active_strategy_id` in the same server-action transaction; a standalone CB-3.4 story would either be empty or an over-engineered re-litigation of what CB-3.3 already ships. CB-3 collapses 5 → 4 stories.

Per [CB-2's actual velocity ≈ 0.6 days/story](../../foundation/plan.md) + CB-3.0/.1/.2 actuals all shipped 2026-06-08 (same-day cadence), CB-3 likely ships in 4-6 calendar days total (3 stories already shipped on day 1; CB-3.3 medium-confidence estimate). Confidence holds at `medium` until CB-3.3 merges.

## Scan summary

- **Last scanned:** n/a (no scan-report yet — first scan happens after first story shipped per `/scan` pattern)
- **Current phase:** brief promotion (HITL approval granted 2026-06-08 — operator-confirmed by firing `/create-brief CB-3`)
- **Open findings:** n/a (no `/scan` run yet)
- **Blocking advance:** no
- **Full report:** [`scan-report.md`](./scan-report.md) (will exist after first `/build` + `/scan CB-3` fires)

## Check-in log

| Date | Phase | Notes |
|------|-------|-------|
| 2026-06-08 | Promotion + HITL approval | Operator fires `/create-brief CB-3` immediately after CB-2 ship (PR #41 merged 2026-06-08). Initial brief had 4 PM DRI Decisions / 3-4 stories forecast / 2 wk medium-confidence estimate. Estimate refined from stub (2 wk / `low`) to brief-approval (2 wk / `medium`). |
| 2026-06-08 | Same-session pivot to pluggable architecture | Operator surfaced (during PR #42 review) that the second app they're building (equity trading) needs the same strategy authoring UX, and they've already lived the build-twice-extract-later pattern with [`@vc1023/passkey-2fa`](https://www.npmjs.com/package/@vc1023/passkey-2fa). Brief amended same-session: NEW PM DRI Decision #6 (pluggable strategy authoring via `lib/strategy-core/` + `AssetAdapter` interface) + NEW PM Risk (pluggable scope cost if equity app never ships) + Stories forecast bumped 3-4 → 5 (added CB-3.0 strategy-core foundation as first story) + estimate refined 2 wk → 3 wk medium-confidence + `architecture_required: false → true` (Codex PR #42 round-1 BLOCKER on widening architecture scope inside brief — bet-specific architecture artifact created at `docs/bets/CB-3/architecture.md`). |
| 2026-06-08 | CB-3.0 + CB-3.1 + CB-3.2 same-day ship | All three lib/server stories shipped same day via PRs #45 (strategy-core), #47 (crypto-coinbase adapter; empirical ranking-field switch `volume_24h → approximate_quote_24h_volume`), #48 (DB schema + migration). Three calendar days remaining of CB-2 velocity carryover; CB-3.3 ready for `/build` same day. |
| 2026-06-08 | CB-3.4 fold + Researcher Q2 closed at `/create-story CB-3.3` | Stories forecast collapsed 5 → 4 (CB-3.4 activation wiring folded into CB-3.3 since architecture Decision #6's save action already does validate + INSERT + supersession + bot_session UPSERT in one server action; single-active model means save = activate). Researcher Q2 (RSI period default) closed at story drafting via PM + Engineer DRI Decision: RSI period not exposed in form; CB-4 bot tick hardcodes RSI(14) per retail convention. Researcher Q1 (top-5 churn) seeded empirically 2026-06-08; full closure pending ~7 days of CB-3.3 production usage. |

## DRI Log

### Decisions

- [2026-06-08] [PM] **Top-5 ranking basis = global 24h volume from Coinbase** — NOT operator's personal trading volume
  - **Rationale (required):** Coinbase's product surface provides DOLLAR volume via the `approximate_quote_24h_volume` field on every product in the `getProducts()` response (per CB-2.2's schema as extended 2026-06-08 — see `market-schemas.ts:84`); that's the canonical signal for "currently liquid trading pairs" in operator-meaningful units, and a single list call suffices for both candidate-discovery AND ranking. **NOT `volume_24h`** — that field is base-currency token count; ranking by it would surface PEPE/SHIB (10^11+ tokens traded for ~$80M dollar volume) over BTC (10^4 tokens but ~$685M dollar volume). Personal trading volume would bias toward what the operator already holds — defeating the purpose (the operator wants the discipline to consider all liquid options, not just their existing holdings). Matches the stub's framing ("review coinbase data to highlight the top 5") explicitly.
  - **Area (required, tag):** product / algorithm
  - **Alternatives considered (required):** rank by operator's personal 24h volume (rejected — bias confirmation); rank by 7-day volume average (rejected — smooths out the signal CB-3 is meant to surface; the operator wants timely "currently liquid" not "stable liquid"); rank by market cap (rejected — proxy for size, not liquidity; less useful for tactical DCA entry decisions); use a pre-curated allowlist (rejected — too operator-opinionated; defeats the discovery purpose)
  - **Reversibility:** trivial (change one line in `lib/strategy/top5.ts`; ranking logic is centralized)

- [2026-06-08] [PM] **Single active strategy per bot session** — multi-active deferred
  - **Rationale (required):** MVP simplicity. Multi-active introduces UI complexity (switcher), data complexity (which session is reading which strategy?), and decision complexity (what if two strategies disagree?). Per [product.md MVP definition](../../foundation/product.md): the loop is "create A strategy, try it with paper money, once comfortable move to real money" — singular. Operator can revise the strategy via supersession (append-only audit; old strategies stay queryable).
  - **Area (required, tag):** product / scope
  - **Alternatives considered (required):** ship multi-active with a UI switcher (rejected — over-scoped for MVP; adds 1+ wk; doesn't pay off until the operator wants A/B-style strategy comparisons, which is a post-MVP affordance); ship single-active but make the schema multi-ready (rejected — speculative scope; adds friction now for an unclear future); ship a draft-and-activate model where the operator can have multiple saved drafts but only one active (deferred — could fold into CB-3.4 if scope allows)
  - **Reversibility:** easy at the data layer (`bot_sessions.active_strategy_id` is already nullable + FK; multi-active would need a join table) — but if a multi-strategy UX surfaces as a real need, it likely involves user-research first

- [2026-06-08] [PM] **Strategy versioning via append-only supersession** — NOT in-place edit
  - **Rationale (required):** [Architecture.md § Append-only event log](../../foundation/architecture.md#identity-strategy) names `strategies` as an append-only-at-application-layer table (decision-history immutable). Revising a strategy creates a new row with `superseded_by_strategy_id` linking back; the old row stays queryable so CB-5's dashboard can render historical bot decisions WITH the strategy active at decision-time. Avoids the "what strategy was active when this tick fired?" mystery that plagues mutable-config systems.
  - **Area (required, tag):** data-model / audit
  - **Alternatives considered (required):** in-place UPDATE with a `updated_at` timestamp (rejected — loses the strategy-at-decision-time context CB-5 needs); soft-delete with `deleted_at` (rejected — semantically wrong; old strategies aren't "deleted," they're "superseded"); fully-versioned table separate from active-state table (rejected — adds join complexity for marginal benefit at MVP scale)
  - **Reversibility:** hard once CB-4 + CB-5 consume the supersession semantics (their reads assume the model). Easy to add now; coordinated rewrite later.

- [2026-06-08] [PM] **`architecture_required: false`** — CB-3 inherits the foundation architecture; no per-bet architecture file needed (**SUPERSEDED 2026-06-08 by the same-session pluggable-pivot — see entry below**)
  - **Rationale (required):** [Architecture.md § Foundational Data Model](../../foundation/architecture.md#foundational-data-model) already names `strategies`, `bot_sessions`, append-only event log, ULID identity — CB-3's schema is a direct materialization of decisions made there. No new architectural ground.
  - **Area (required, tag):** architectural / scope-boundary
  - **Alternatives considered (required):** require a CB-3 bet-architecture file (rejected — duplicates foundation arch's coverage); defer the call to first story (rejected — `architecture_required: false` is a brief-frontmatter field; setting it now is the honest call)
  - **Reversibility:** trivial — set to `true` later if CB-3 surfaces an architectural decision outside foundation scope
  - **Superseded by:** the pluggable-pivot Decision #6 below introduces new architectural concepts (`lib/strategy-core/` module boundary, `AssetAdapter` interface contract, `asset_class` discriminator + `selected_assets: jsonb` data model that foundation architecture doesn't define, extraction path to `@vc1023/strategy-core` npm package). Per Codex PR #42 round-1 BLOCKER: widening architecture scope inside a brief without a bet-architecture artifact is a discipline violation. Flipping `architecture_required: false → true` 2026-06-08 + creating [`docs/bets/CB-3/architecture.md`](architecture.md) which captures the new architectural decisions explicitly.

- [2026-06-08] [PM] **`architecture_required: true`** — pluggable pivot introduces architectural concepts outside the foundation architecture's scope
  - **Rationale (required):** Decision #6 (pluggable architecture) introduces `lib/strategy-core/` as a portable module boundary, the `AssetAdapter` interface contract that defines how non-coinbase asset classes plug in, and a data model (`asset_class` discriminator + `selected_assets: jsonb [{assetClass, identifier}]`) that the foundation architecture's mention of "strategies" table does NOT actually specify. These are architectural decisions, not implementation details. Per Compass discipline, architectural decisions live in a bet-architecture artifact, not in the brief's DRI Decisions section.
  - **Area (required, tag):** architectural / scope-boundary / compass-discipline
  - **Alternatives considered (required):** keep `architecture_required: false` and embed the architectural decisions in PM DRI Decision #6's body (rejected — Codex's PR #42 round-1 BLOCKER correctly identifies this as widening architecture scope inside a brief; brief Decisions are PM-owned, architecture Decisions are Architect-owned); flip but defer creating the architecture file to `/build CB-3.0` (rejected — the architecture decisions are LOAD-BEARING for CB-3.0's design and the whole pluggable-extraction path; the artifact MUST exist before the first story is built); amend `docs/foundation/architecture.md` directly to add the new concepts (rejected — these are bet-specific, not foundation-level; bloating the foundation artifact is the wrong shape)
  - **Reversibility:** moderate (architecture file lives at the bet scope; can be deprecated if CB-3 scope changes)
  - **Surfaced by:** Codex code review of PR #42 round-1 BLOCKER on architecture scope widening

- [2026-06-08] [PM] **`duration_weeks: 3` and `confidence: medium`** at brief-approval — bumped from stub's 2 wk by the pluggability pivot (Decision #6 below); confidence advances `low` → `medium`
  - **Rationale (required):** Workflow estimate model: brief-approval → small/medium/large → 1/2/4 weeks. CB-3 with the pluggability pivot is **medium-to-large** — 5 stories (was 4) at ~0.6-0.8 days/story per CB-2's actuals + the new `lib/strategy-core/` foundation story (CB-3.0) + careful API surface design at every story to preserve future-extraction shape. Bumped from 2 wk → 3 wk to honestly capture +3-5 days for the pluggability scope.
  - **Area (required, tag):** scheduling / estimation
  - **Alternatives considered (required):** hold at 2 wk + absorb pluggability into existing story budget (rejected — would compress quality on a foundation story that downstream bets + the equity app both consume); jump to 4 wk (rejected — overstates; CB-2 velocity + the operator's clear scope vision suggest ~3 wk is honest); set confidence: high (rejected — pluggable abstraction has API surface risks that brief-approval can't predict; high is reserved for build-actuals)
  - **Reversibility:** trivial — next `/plan` after CB-3.0 ships will fire the "Stories created" trigger and recompute

- [2026-06-08] [PM] **Strategy authoring is pluggable from day-one (`lib/strategy-core/` + `AssetAdapter` interface); CB-3 ships only the crypto-coinbase adapter; extraction to npm package deferred until the equity app is ready to consume**
  - **Rationale (required):** The operator is concurrently building a second app (equity trading) that needs the same strategy authoring UX (form structure + Zod validation + supersession versioning + universal RSI/MA validation). Per the operator's lived precedent with [`@vc1023/passkey-2fa`](https://www.npmjs.com/package/@vc1023/passkey-2fa) — passkey auth was first built in this crypto-app, then later extracted to a shared npm package when the equity app couldn't consume it. That extraction cost MORE than building pluggable from the start would have. CB-3 captures the lesson: design for extraction NOW (clean `AssetAdapter` interface; `lib/strategy-core/` Coinbase-free), ship only the crypto adapter, extract to npm later when the second consumer materializes. RSI/MA math + form schema + supersession logic are universal across asset classes; only the candidate-asset source + identifier shape differ. The abstraction is honest, not speculative.
  - **Area (required, tag):** architecture / reuse / cross-app
  - **Alternatives considered (required):** ship single-purpose crypto-only and extract later (rejected — the `@vc1023/passkey-2fa` precedent proves this is more expensive than pluggable-from-start; the operator has direct evidence); ship as a monorepo workspace with both apps under one repo (rejected — major restructuring; out of scope for CB-3; could land later); publish `@vc1023/strategy-core` from this repo NOW (rejected — npm publishing pipeline + versioning discipline + breaking-change management is overhead before the second consumer exists; defer until equity app actually consumes); make the form generic without the adapter layer (rejected — assets vary in identification shape and candidate-source provider; a single seam at the adapter is the right place to vary, NOT scattered through form internals)
  - **Reversibility:** moderate — the API surface of `lib/strategy-core/` becomes load-bearing for two consumers (crypto + equity) once extracted. Breaking changes require coordinated rollout. Within this bet (only crypto consumer), reversibility is high.
  - **Scope cost:** +1 story (CB-3.0); +3-5 days estimated; estimate bumped from 2 wk to 3 wk at brief-approval per Decision #5 above. Operator confirmed cost acceptance.
  - **Extraction path (forward-looking):** when the equity app is ready to consume — (1) move `lib/strategy-core/` to a separate repo (or this repo's `packages/strategy-core/` workspace), (2) publish as `@vc1023/strategy-core`, (3) crypto-app find/replace `from "@/lib/strategy-core/..."` → `from "@vc1023/strategy-core"` (~30 min), (4) equity-app consumes directly. Half-day extraction job vs the multi-day re-architecting that single-purpose CB-3 would have required.
  - **Lesson tag for future bets:** when a UI/data-model layer has plausible reuse value across multiple operator apps + the operator has direct evidence of "build-twice-then-extract" being expensive, **design for extraction at brief-approval time** even if the second consumer isn't ready yet. Costs +3-5 days; saves 1-2 weeks of re-architecting later.
  - **Architectural decisions live in [`docs/bets/CB-3/architecture.md`](architecture.md)** — `lib/strategy-core/` module boundary, `AssetAdapter` interface, `strategies` table schema with `asset_class` discriminator, extraction path, form-layer architecture, and observability shape. The brief states the WHAT and WHY; architecture.md states the HOW. Per Compass discipline (Codex PR #42 round-1 BLOCKER on widening architecture scope inside brief): the brief flipped `architecture_required: false → true` 2026-06-08 and the artifact was created in the same session.

### Risks

- [2026-06-08] [PM] **UI re-engagement context loss — 5 stories of pure library code → first UI surface in CB-3 has elevated bug risk**
  - **Likelihood (required):** medium (the forward-reference e2e expectation note in this stub flagged this risk explicitly during CB-2.5; CB-1.6's history of Playwright catching real bugs is the precedent)
  - **Impact (required):** medium (a UI bug in strategy authoring blocks CB-4 from reading a valid strategy; downstream cascade risk)
  - **Mitigation (required):** AC for CB-3.3 (form UI story) MUST include at least one Playwright e2e covering the operator's golden path (author → save → reload → verify persisted). Engineer DRI Decisions at /create-story time include "Standard Experience Checklist categories not all `n/a`" — most categories are load-bearing for a UI surface. Static mocks alone are insufficient; e2e is load-bearing.
  - **Area (required, tag):** technical / ui-resurfacing

- [2026-06-08] [PM] **Validation rule completeness — overlapping or contradictory rules pass validation, bot fires unexpected orders**
  - **Likelihood (required):** medium-to-high (validation logic complexity; entry vs exit rule interactions; per-session caps interact with position sizes)
  - **Impact (required):** medium (a strategy with overlap/contradiction would surface as unexpected bot behavior in CB-4 — not real-money loss in dry-run, but in `LIVE_MODE` could be real-money harm)
  - **Mitigation (required):** Zod schema + handwritten rule-validation tests cover EVERY documented rule branch; CB-3.3 + CB-3.4 ACs include "every validation rule has a unit test that triggers it" (every false-path is tested). CB-5's dashboard surfaces the strategy's rules verbatim so the operator can sanity-check what they authored before turning `LIVE_MODE=true`. Defense-in-depth via dry-run-first product principle.
  - **Area (required, tag):** validation / safety

- [2026-06-08] [PM] **Pluggable abstraction has API surface that crypto-only would have skipped — if the equity app never ships, the `AssetAdapter` interface + `lib/strategy-core/` foundation is scope that didn't pay off**
  - **Likelihood (required):** low (operator is actively building the equity app concurrent with this bet; the precedent of `@vc1023/passkey-2fa` extraction proves the operator's pattern of finishing what they start)
  - **Impact (required):** medium (a wasted abstraction is +3-5 days of CB-3 scope; not catastrophic but real cost). Note: even crypto-only CB-3 would benefit from the cleaner `selected_assets: {assetClass, identifier}[]` shape vs the original `selected_products: string[]` — so some of the abstraction's value is captured even in the worst case.
  - **Mitigation (required):** operator-accepted cost trade per Decision #6 above. Re-evaluation point: if the equity app stalls or pivots away from RSI/MA strategies before CB-3 ships, the pluggable scope can be collapsed to single-purpose with a 1-2 day refactor (the `AssetAdapter` indirection removed; types simplified). Earliest re-evaluation: before `/build CB-3.0` fires.
  - **Area (required, tag):** architecture / scope-risk

- [2026-06-08] [PM] **Top-5 churn surprise — operator authored a strategy when BTC/ETH/SOL/DOGE/ADA was top-5; next day's top-5 is different and operator doesn't notice**
  - **Likelihood (required):** low-to-medium (Researcher Open Question #1 explicitly tracks this; will be addressable empirically)
  - **Impact (required):** low (the operator's selected_products are persisted in the strategy row — bot doesn't auto-rebalance to today's top-5). But surprise-factor exists: operator may think "the bot is trading top-5" when actually it's trading their selected_products which were top-5 last week.
  - **Mitigation (required):** strategy authoring form prominently shows "Selected from top-5 as of YYYY-MM-DD"; CB-5's dashboard surfaces the same; operator can revise the strategy (creates new row via supersession) if they want to update the selected_products against today's top-5.
  - **Area (required, tag):** UX / discoverability

### Issues

- [2026-06-08] [PM] **Two Researcher Open Questions logged above (top-5 churn; RSI period default)** — Researcher fills before CB-3.3 starts
  - **Severity (required, mandatory):** P3 (informational; doesn't block brief approval)
  - **Owner (required, mandatory):** Researcher
  - **Status:** **partially closed 2026-06-08** — Item 2 fully closed; Item 1 seeded empirically, full closure pending ~7 days of CB-3.3 production usage
  - **Area (required, tag):** research / dependency
  - **Resolution (filled when closed):** Item 1 (top-5 churn) — first empirical observation 2026-06-08 via CB-3.1 integration test (`[BTC-USD, ETH-USD, ZEC-USD, XRP-USD, SOL-USD]`); full closure after ~1 week of runtime-log accumulation post-CB-3.3 ship. Item 2 (RSI period default) — **CLOSED 2026-06-08** at `/create-story CB-3.3` via PM Decision + Engineer DRI Decision #7: RSI period not exposed in form; CB-4 bot tick hardcodes RSI(14) per retail-trader convention.

## Fixes (post-merge)

_If post-merge bugs are found, stories are re-opened and fixes live under `docs/bets/CB-3/stories/CB-3.X/fixes/`._

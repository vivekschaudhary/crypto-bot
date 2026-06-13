---
id: CB-4.3
bet: CB-4
type: story
status: ready
priority: P0
created: 2026-06-13
author: PM
design_link: n/a — server-side order placement; no UI surface (CB-4.0/4.1/4.2 precedent)
area_tags: [bot-runtime, live-mode, order-placement, unified-ledger, schema-migration, idempotency, limit-orders, real-money]
dependencies:
  - CB-4 brief approved 2026-06-09 (PR #56); PM Decisions #7 + #8 logged 2026-06-11 (PR #61)
  - CB-4.2 shipped + verified in prod 2026-06-13 (PR #63 — cron tick handler; 84 ticks/0 errors/100% over 21h)
  - CB-2.4 placeOrder (market_market_ioc + limit_limit_gtc) — real-money write path verified
  - CB-2.3 getAccountTradeHistory — cost-basis source (PM Decision #7)
estimate:
  effort: medium
  confidence: medium
e2e: false
---

# CB-4.3 — LIVE_MODE order placement + unified transaction ledger (FOURTH CB-4 STORY)

## Description

Add the **`LIVE_MODE` behavioral gate** to the cron tick: when `env().LIVE_MODE === true`, a `buy`/`sell` decision places a real Coinbase limit order via CB-2.4's `placeOrder`; when `false` (the default), no order is placed. **Either way**, every `buy`/`sell` decision writes a row to the `orders` ledger (per [brief PM Decision #8](../../brief.md#decisions)) — `dry_run` rows in paper mode, live rows with the Coinbase order id in live mode. This is the bet's **first real-money-capable story** and the one that makes the operator's dry-run ledger queryable for would-have-PnL before the `LIVE_MODE` flip.

This is the **last load-bearing CB-4 story**. After it ships, the bot can (when the operator flips the env var) trade autonomously on the typed strategy authored in CB-3. CB-4.4 (take-profit polish) is evaluated AFTER this ships — the sell logic is already firing correctly in CB-4.2 production (exit-rule reasons observed live), so CB-4.4 likely drops or folds.

### Headline finding: the `orders` table can't accept a write today (third CB-1-era schema mismatch)

During drafting the PM verified the `orders` table against this story's write path and found it **structurally unwritable**: `orders.account_id REFERENCES accounts(id)` and `orders.asset_id REFERENCES assets(id)`, but **nothing populates `accounts` or `assets`** (verified: zero INSERT paths in `lib/`+`app/`+`db/`). Any `orders` INSERT fails the FK. This is the same root cause migration 0005 fixed for `signals` (the unpopulated `assets` dimension FK), now recurring for `orders` — the CB-1-era foundation scaffold assumed dimension tables that the MVP never populated.

The `orders` table is **EMPTY in production** (no writes have ever happened — CB-4.2 is dry-run and writes only `bot_ticks`/`signals`), so the reshape is zero-data-risk. Per the CB-4.2 Principle #16 lesson, the **architecture `Order` entity is amended upstream in this same PR** (not deferred to Codex escalation), and migration 0006 executes it.

### After this story

- The operator flips `LIVE_MODE=true` (deliberate ceremony) when the ≥60-dry-run-session guardrail is met → the bot places real orders
- CB-5's dashboard reads the unified `orders` ledger (both modes) for the transaction history + would-have-PnL
- Researcher Q3 (limit-order slippage) closes at this build via Engineer DRI Decision against the real-Coinbase integration test

## Acceptance Criteria

- [ ] **AC 1 — Migration `0006-orders-writable.sql`** reshapes `orders` to be writable: DROP the `account_id REFERENCES accounts(id)` column (single-operator MVP — there is exactly one Coinbase account; the column is dead weight) and replace `asset_id REFERENCES assets(id)` with `asset_identifier text NOT NULL` (matches `strategy-core` `Asset.identifier`, mirroring the 0005 `signals` reshape). `session_id`, `source`, `side`, `amount`, `status` (free-form text), `coinbase_order_id` (nullable), `created_at` unchanged. Tables empty in prod → DROP+recreate or ALTER, Engineer's call; zero-data-risk verified in the migration header. `db/schema.sql` swept in the same PR (0004 Decision #5 precedent).

- [ ] **AC 2 — Architecture `Order` entity amended** in the same PR (per AGENTS.md Principle #16; CB-4.2 migration-0005 precedent): entity-table row + ER diagram updated to drop `account_id`/`asset_id` FKs in favor of `asset_identifier text`; DRI Log entry by the Enterprise/Solution Architect documenting the same-root-cause-as-0005 rationale + zero-data-risk.

- [ ] **AC 3 — `LIVE_MODE` behavioral gate** in `app/api/cron/tick/route.ts`: for each `buy`/`sell` decision, IF `env().LIVE_MODE === true` → call `placeOrder` with a limit order; IF `false` → skip placement entirely. `hold` decisions never place an order in either mode. The `live_mode` value is still logged per tick (CB-4.2 AC 10 preserved).

- [ ] **AC 4 — Unified ledger write (Decision #8)**: every `buy`/`sell` decision writes one `orders` row REGARDLESS of mode — `source='bot'`, `session_id`, `asset_identifier`, `side`, `amount`. Dry-run: `status='dry_run'`, `coinbase_order_id=NULL`. Live success: `status='submitted'`, `coinbase_order_id` = Coinbase's `success_response.order_id`. Live failure: `status='failed'`, `coinbase_order_id=NULL`, with the sanitized failure reason captured (see AC 8). `hold` decisions write NO `orders` row (a hold is not a transaction).

- [ ] **AC 5 — Idempotent `clientOrderId`** = deterministic `f(session_id, tick_started_at, asset_identifier)` (e.g. a stable hash/ULID-from-seed; NOT a random ULID). Per the [brief's cron-overlap layered defense item #3](../../brief.md#risks): if a cron double-fire or a retry re-places the same logical order, Coinbase rejects the duplicate `client_order_id` rather than executing twice. This is the load-bearing real-money idempotency guarantee — tested for determinism (AC 12).

- [ ] **AC 6 — Limit-order pricing (Researcher Q3 closure)**: limit-only orders (`limit_limit_gtc`), never market. Buy-limit price = `last_close × (1 + SLIPPAGE)`; sell-limit price = `last_close × (1 - SLIPPAGE)` with `SLIPPAGE = 0.005` (0.5%) — the bot is willing to pay up to 0.5% above market to fill a buy / accept 0.5% below to fill a sell. Engineer DRI Decision pins the exact value + price/size rounding (Coinbase product increment) at build, validated against the real-Coinbase integration test (CB-2.4 showed 50%-away rejects with `PREVIEW_LIMIT_PRICE_TOO_FAR_FROM_MARKET`; 0.5% is well within acceptance). Buy `base_size` = `BuySizing.dollars / limit_price`; sell `base_size` = `SellSizing.fraction × currentPosition.quantity`.

- [ ] **AC 7 — Order placement failure is per-asset isolated, NOT tick-fatal** (PM Decision #2): a `placeOrder` throw OR a Coinbase `error_response` for one asset records that asset's `orders` row with `status='failed'` + reason, and the tick CONTINUES — sibling assets' decisions/orders are unaffected, the `bot_ticks` + `signals` rows still write, and the tick returns 200. Rationale: one asset's rejection (min-size, insufficient funds, price-too-far) must not blind the bot to the other assets or trip the tick-reliability fitness function. (Contrast CB-4.2 AC 8: a SIGNAL/eval failure is still tick-fatal → 500; an ORDER failure is per-asset.)

- [ ] **AC 8 — Order-failure reason is sanitized** before persistence (reuse `lib/ticks/trace.ts:sanitizeErrorDetail` from CB-4.2's security fix): Coinbase order errors can echo request context; the `orders` row's failure reason + any log line must redact token-shaped material. Stored in a new nullable `orders` column OR in the structured log keyed by `client_order_id` (Engineer DRI picks; if a column, it's part of migration 0006).

- [ ] **AC 9 — Placement-before-persistence ordering + dual-write honesty**: in live mode, `placeOrder` is called BEFORE the tick's DB transaction; the `orders` row records the actual outcome. PM Risk #1 documents the place-succeeded-but-DB-write-failed window; the mitigation is two-fold and tested where unit-testable: (a) idempotent `clientOrderId` means a retry can't double-place; (b) cost basis comes from Coinbase (`getAccountTradeHistory`, Decision #7) NOT the local ledger, so the bot's NEXT tick sees the real position even if a local `orders` row was lost — the decision loop self-heals its market view.

- [ ] **AC 10 — `amount` semantics pinned**: `orders.amount` = USD notional. Buy: `BuySizing.dollars` (= `strategy.position_size_usd`). Sell: `base_size × limit_price` (the USD value of the sold fraction). Documented in `lib/ticks/orders.ts` JSDoc + the migration comment.

- [ ] **AC 11 — Invariant test UPDATED, not just added**: CB-4.2's `tests/app/api/cron/tick/invariants.test.ts` currently asserts the route's module graph NEVER imports `lib/coinbase/orders` — that is now intentionally false. Replace that case with a BEHAVIORAL gate test: with `LIVE_MODE=false` the route runs a buy/sell decision and `placeOrder` is NEVER called; with `LIVE_MODE=true` it IS called for buy/sell and NEVER for hold. The append-only grep (no `UPDATE bot_ticks`/`signals`) + no-silent-swallow checks stay. (This is itself a `[cross-artifact-sweep-on-contract-shift]` instance — the contract the test pinned has deliberately shifted; the test must shift with it in the same PR.)

- [ ] **AC 12 — Unit tests (~20, mocked placeOrder + db)**: LIVE_MODE=false buy → dry_run row, no placeOrder; LIVE_MODE=true buy → placeOrder called + submitted row + coinbase_order_id; LIVE_MODE=true sell → correct base_size = fraction × quantity; hold → no orders row either mode; placeOrder throws → failed row + tick still 200 + sibling assets unaffected; Coinbase error_response → failed row; clientOrderId determinism (same session+tick+asset → same id; different asset → different id); limit-price math (buy = close×1.005, sell = close×0.995); amount semantics (buy USD notional, sell USD value); failure reason sanitized.

- [ ] **AC 13 — Triple-gated real-Coinbase integration test** (`RUN_REAL_ORDER_TESTS=1` env gate per CB-2.4 precedent; skipped in normal CI): places ONE real limit order far enough from market to rest unfilled (or min-size), asserts the `orders` row + `coinbase_order_id`, then cancels. Documents the manual run command. This is the empirical Q3 closure.

- [ ] **AC 14 — Gates + cross-artifact sweep**: typecheck/lint/test/build clean; `pnpm test` ~673 → ~693+. Same-PR sweep: brief CB-4.3 forecast row → shipped framing; brief Researcher Q3 → closed; `docs/status.md` CB-4 row; **the CB-4.2 verified-shipped fold** (CB-4.2 `story.md` → `status: done` + production-verification note; status.md). Architecture amendment (AC 2) is part of this sweep.

## Standard Experience Checklist

Server-side order placement; no UI surface. **4 of 6 `n/a`** + **2 of 6 covered by ACs** (CB-4.0/4.1/4.2 corrected-shape precedent).

- [ ] **Navigation** — `n/a — no UI; order placement is autonomous within the cron tick.`
- [ ] **States** — `n/a — no UI states; the order lifecycle (dry_run / submitted / failed) is the orders.status taxonomy, persisted not rendered.`
- [ ] **Feedback** — `n/a — operator-facing feedback is the orders ledger + structured log; rendered feedback is CB-5's dashboard.`
- [ ] **Accessibility** — `n/a — no rendered UI.`
- [ ] **Edge cases** — `covered by AC 5/7/9/12 — cron double-fire idempotency, per-asset order-failure isolation, dual-write window, limit-never-fills (next tick re-evaluates).`
- [ ] **Cross-surface consistency** — `covered by AC 4 + AC 11 — the unified ledger renders identically for dry-run + live in CB-5; the invariant test shifts with the deliberately-changed import contract.`

## Tech notes

### Engineer DRI Decisions to commit at first build commit

1. **Migration 0006 shape** — DROP+recreate vs ALTER (empty table; Engineer's call); whether the sanitized failure reason (AC 8) is a new `orders` column or log-only.
2. **`clientOrderId` derivation** — the exact deterministic function over `(session_id, tick_started_at, asset_identifier)`; must fit Coinbase's `client_order_id` constraints (length/charset).
3. **Slippage value + rounding** — 0.5% pinned; price rounded to the product's `quote_increment`, size to `base_increment` (fetch from the product, or hardcode per-asset for the top-5 — Engineer's call against the integration test).
4. **Placement/persistence ordering** — confirm placeOrder-before-transaction; how a mid-tick placement failure threads into the per-asset `failed` row without aborting the transaction.
5. **Limit-order rest behavior** — GTC limits rest on the book if unfilled; MVP does NOT cancel stale limits (next tick re-evaluates and may place a new one). Cancellation of unfilled limits is explicitly deferred (CB-4.4/CB-5 candidate) — logged so it's a known posture, not an oversight.

### Patterns to mirror at `/build CB-4.3`

1. **Migration discipline** — 0005 precedent (header attribution, empty-table verification, schema.sql sweep same PR).
2. **placeOrder usage** — CB-2.4's `limit_limit_gtc` order configuration + the `success`/`error_response` envelope handling.
3. **Sanitization** — reuse `sanitizeErrorDetail` (don't re-implement).
4. **Triple-gated real test** — CB-2.4's `RUN_REAL_ORDER_TESTS` precedent.
5. **Transactional write** — `insertTickWithDecisions` extended (or a sibling) to include the `orders` rows in the same `sql.begin`.

### What this story does NOT include

- Cancellation of unfilled/stale limit orders — deferred (CB-4.4/CB-5)
- Order-fill polling / `trade_fills` population — deferred (the cost-basis read from Coinbase covers the bot's needs; CB-5 may add fill history)
- Take-profit polish (CB-4.4) — evaluated after this ships
- Override controls (pause/resume/force-buy/sell-N/reset) — CB-5
- Multi-operator `account_id` — dropped for MVP; reintroduced with a real accounts table if multi-operator ever lands

## DRI Log

### Decisions

- [2026-06-13] [PM] **Migration 0006 makes `orders` writable by executing an upstream architecture `Order`-entity amendment (drop accounts/assets FKs → asset_identifier text; drop account_id)** — same pattern + same root cause as CB-4.2's migration 0005
  - **Rationale (required):** The CB-1-era `orders` table FKs two dimension tables (`accounts`, `assets`) that nothing populates — any INSERT fails. This is the third instance of the single-asset/dimension-table assumption from the 2026-05-29 scaffold colliding with the shipped MVP (after `signals.kind/value` and `signals.assets` FK). `asset_identifier text` matches the `strategy-core` contract + the reshaped `signals` table; `account_id` is dead weight at single-operator. `orders` is empty in prod → zero-data-risk. Per the CB-4.2 Principle #16 lesson, the architecture `Order` entity is amended UPSTREAM in this same PR (AC 2), and the migration executes it — not deferred to a Codex escalation round.
  - **Area (required, tag):** architectural / schema-evolution / real-money-write-path
  - **Alternatives considered (required):** populate `accounts` + `assets` dimension tables so the FKs resolve (rejected — speculative dimension modeling for a single-operator/5-asset MVP; the `signals` reshape already set the asset_identifier-text precedent); keep FKs + insert placeholder dimension rows (rejected — fabricated rows pollute the schema's meaning); new `bot_orders` table separate from `orders` (rejected — splits the unified-ledger contract Decision #8 depends on; CB-5 would need two reads)
  - **Reversibility:** low-cost now (empty table); the `account_id` drop is the only one-way door, mitigated by single-operator reality (reintroduce with a real accounts table if multi-operator lands)
- [2026-06-13] [PM] **Order-placement failure is per-asset isolated, NOT tick-fatal**
  - **Rationale (required):** A `placeOrder` rejection for one asset (min-size, insufficient funds, price-too-far) must record a `status='failed'` audit row but must NOT abort the tick or block sibling assets' decisions. The tick-reliability fitness function (≥99%) measures whether the DECISION LOOP ran end-to-end — order placement is a downstream side effect. Contrast CB-4.2 AC 8 where a signal/eval failure IS tick-fatal (500) because without signals there's no honest decision to record. An order failure still has a full, honest decision trace — only the execution of one leg failed.
  - **Area (required, tag):** reliability / error-isolation / fitness-function-integrity
  - **Alternatives considered (required):** any order failure fails the whole tick → 500 (rejected — one asset's min-size rejection would zero out the tick-reliability metric + discard 4 good decisions); silently skip the failed order with no row (rejected — violates the unified-ledger audit + Decision #8; the operator must see the failed attempt)
  - **Reversibility:** trivial — the isolation boundary is a try/catch per asset
- [2026-06-13] [PM] **CB-4.3 is the last REQUIRED CB-4 story; CB-4.4 (take-profit polish) is evaluated AFTER and likely drops**
  - **Rationale (required):** CB-4.1's sell/exit logic is firing correctly in CB-4.2 production (exit-rule + no-position reasons observed in live ticks 2026-06-13). The "maybe" CB-4.4 from the brief was hedged against the sell logic needing iteration; production evidence says it doesn't. The fold/drop decision is deferred to a post-CB-4.3 check-in (mirrors the CB-3.4 fold), but the lean is DROP.
  - **Area (required, tag):** scope / bet-closure
  - **Alternatives considered (required):** commit to building CB-4.4 now (rejected — no evidence of need; speculative); commit to dropping it now (rejected — premature before CB-4.3's real-money path is verified; a live-mode sell might surface an edge)
  - **Reversibility:** trivial — it's a forecast, not a built artifact

### Risks

- [2026-06-13] [PM] **Dual-write hazard — live order placed but the local `orders` row write fails**
  - **Likelihood (required):** low (DB write follows a successful placement by milliseconds; both are reliable)
  - **Impact (required):** medium (a real order exists with no local ledger row → the operator's would-have-PnL + CB-5 dashboard under-count; NOT a money-loss, a record-integrity gap)
  - **Mitigation (required):** (a) idempotent `clientOrderId` (AC 5) — a retry re-places the SAME logical order, which Coinbase rejects as a duplicate rather than executing twice; (b) cost basis is read from Coinbase (Decision #7), not the local ledger, so the bot's next-tick market view self-heals regardless of the missing row; (c) the structured log records the placement outcome independently of the DB row. Reconciliation tooling (compare Coinbase order history vs local ledger) is a CB-5 candidate.
  - **Area (required, tag):** data-integrity / dual-write
- [2026-06-13] [PM] **The `LIVE_MODE` flip is the single most dangerous action in the project — first real money**
  - **Likelihood (required):** n/a (operator-initiated, deliberate)
  - **Impact (required):** high (real capital at risk the moment the env var flips)
  - **Mitigation (required):** the flip is a deliberate env-var ceremony (no UI toggle — the single safety primitive per brief PM Decision #4); the ≥60-dry-run-session product guardrail must be met first (clock started 2026-06-12 21:45; CB-4.2 ledger gives would-have-PnL to inform the decision); limit-only orders with 0.5% slippage cap; per-session dollar + buy-count caps (CB-4.1, now live-relevant once `orders` rows exist) bound exposure per session.
  - **Area (required, tag):** safety / real-money
- [2026-06-13] [PM] **Limit order never fills (price moves away before the GTC limit is hit)**
  - **Likelihood (required):** medium (0.5% is a tight band; volatile assets can move past it)
  - **Impact (required):** low (the bot "decided buy" but holds no position; next tick re-evaluates against fresh signals — no capital lost, just a missed entry; the resting GTC limit may fill later or be superseded)
  - **Mitigation (required):** MVP accepts unfilled limits resting on the book (Engineer Decision #5); the next tick's decision is independent; cancellation of stale limits is a documented deferral (CB-4.4/CB-5), not an oversight. The operator sees `submitted` rows that never progress to a fill in the ledger — a CB-5 dashboard signal.
  - **Area (required, tag):** execution / fill-risk

### Issues

_None at story creation. Engineer adds as discovered during /build._

## Tests

_~20 unit tests (mocked placeOrder + db) at `tests/app/api/cron/tick/*.test.ts` + `tests/lib/ticks/*.test.ts`; the UPDATED invariants test (AC 11); 1 triple-gated real-Coinbase integration test (AC 13, RUN_REAL_ORDER_TESTS). Suite ~673 → ~693+._

## PRs

_Auto-populated as PRs open._

---

_Story closed: <pending>, brief link: docs/bets/CB-4/brief.md, retro watch: docs/retros/2026-06-09-cb-3-production-only-defects-retro.md (first real-money path — LIVE_MODE flip discipline + dual-write integrity on watch)_

---
id: CB-4
type: feature
status: approved
priority: P0
parent: FOUNDATION-PRODUCT
portfolio_stub: false
depends_on: [CB-2, CB-3]
parallel_with: []
architecture_required: false
created: 2026-05-31
promoted: 2026-06-09
author: PM
sources:
  - docs/foundation/product.md
  - docs/foundation/architecture.md
  - docs/foundation/portfolio.md
  - docs/bets/CB-2/brief.md
  - docs/bets/CB-3/brief.md
  - docs/retros/2026-06-09-cb-3-production-only-defects-retro.md
key_metric:
  name: Bot tick reliability — % of scheduled `*/15` cron invocations that execute end-to-end (read strategy → fetch candles → evaluate → write `bot_ticks` row) without throwing, over a rolling 30-day window
  baseline: n/a (greenfield — no bot runtime in production yet; CB-2's wrapper + CB-3's strategies table are the load-bearing dependencies)
  target: ">= 99% over a rolling 30-day window. Matches the foundation architecture's [bot tick reliability fitness function](../../foundation/architecture.md#fitness-functions); breach signals either a structural cron failure (Vercel scheduling regression), a Coinbase candle-API drift the wrapper didn't catch, or a transient signal-math throw that needs hardening."
  source: Vercel cron logs (`*/15` invocation count vs success count) + `bot_ticks` row count vs expected (96 ticks/day; 2880 over 30d). The two should agree within 1% rounding.
guardrails:
  - name: No order placement while `LIVE_MODE=false` (dry-run is the default; the env-var flip is the deliberate ceremony)
    threshold: 100% — zero tolerance. Verified by integration test that asserts `lib/coinbase/orders:placeOrder` is NOT called in dry-run; per-tick structured-JSON log emits `live_mode: true|false` for audit.
  - name: Tick uniqueness — `UNIQUE (session_id, tick_started_at)` constraint rejects double-fires at the DB layer per [architecture.md DRI Risk: cron overlap](../../foundation/architecture.md)
    threshold: zero `ON CONFLICT` errors per week. > 0 indicates cron-overlap regression or `tick_started_at` rounding bug.
  - name: Per-session cap enforcement — bot emits `hold` regardless of signal when current session totals reach `per_session_dollar_cap` OR `per_session_buy_count_cap`
    threshold: zero cap violations across the integration-test suite; CI grep test enforces the cap-check branch exists in `lib/decisions/`.
  - name: Append-only decision audit — `bot_ticks` + `signals` rows are INSERT-only at app layer (no UPDATE paths in code); enforces the [architecture's append-only event log invariant](../../foundation/architecture.md)
    threshold: CI grep test asserts zero `UPDATE bot_ticks` / `UPDATE signals` paths exist in the codebase.
  - name: Coinbase rate-limit budget — bot's actual sustained RPS stays at ≤ 10% of the auth'd-brokerage 30 RPS ceiling per CB-2.5's empirical finding (`x-ratelimit-*` headers)
    threshold: tick logs show < 3 RPS sustained across any 1-minute window; CB-2.5's `lib/coinbase/trace.ts` already surfaces this for runtime audit.
measurement_window_days: 30
check_in_cadence: weekly
area_tags: [bot-runtime, cron, signals, decisions, live-mode, order-placement, decision-trace, append-only-audit]
estimate:
  duration_weeks: 1
  confidence: medium
  refined_by: brief-approval
  refined_at: 2026-06-09
  estimated_start: 2026-06-09
  estimated_end: 2026-06-16
---

# CB-4 — DCA bot runtime (cron tick → signal eval → decision → dry-run / live order)

> The bet where the operator's typed strategy (CB-3) actually does something. Without CB-4, every `strategies` row is a static config no process consults; the `bot_ticks` table is empty; the dry-run-first product principle is theoretical because there's nothing to dry-run.

## Problem

The operator has authored strategies in `strategies` (CB-3 shipped 2026-06-09) and has a typed Coinbase wrapper (CB-2 shipped 2026-06-08) that can fetch market data + place orders. What's missing is the **autonomous process that reads one, calls the other, and emits decisions on a schedule**. Today, nothing reads `strategies.*`; the `*/15` Vercel cron at `/api/cron/tick` returns `{ok: true}` heartbeat-only ([per canary verification 2026-05-31](../../foundation/architecture.md)); no `bot_ticks` rows exist; `LIVE_MODE` has never gated a real-money write.

This is the bet that turns the authored strategy into actual trading behavior — first in dry-run for ≥ 60 sessions (per the brief-approval guardrail in [product.md](../../foundation/product.md)), then conditionally in live mode when the operator flips the env var.

## User

**Primary user: the operator.** CB-4 has **no UI surface** — the bot is autonomous; the operator doesn't interact with it per-tick. The only operator-visible artifact is the structured-JSON log emitted per tick (consumed by CB-5's future dashboard for the decision-trace observability surface).

**Secondary user: CB-5's future dashboard.** CB-5 reads `bot_ticks` + `signals` rows to render the decision-trace history + the override controls (pause/resume/force-buy/sell-N/reset). CB-4 → CB-5 is the data-producer-consumer relationship that closes the **"log all transactions"** + **"full decision-trace observability"** clauses of [product.md § In scope](../../foundation/product.md#in-scope).

**Out-of-MVP secondary user:** the equity-app variant (per CB-3's extraction-readiness invariant) would consume the same `lib/signals/` + `lib/decisions/` modules with an equity-broker order-placement adapter. `lib/signals/` is asset-class-agnostic (just operates on a candle array); `lib/decisions/` consumes a `Strategy` row from `lib/strategy-core/` so it's already universal.

## Why this matters

CB-4 sits on the **critical path** per [plan.md § Full schedule](../../foundation/plan.md#full-schedule) — it's the binding-dep for CB-5 (the dashboard). CB-3 finished ~17x ahead of its 3 wk brief-approval estimate (1.5 calendar days actual), pulling CB-4's `estimated_start` from 2026-06-29 to 2026-06-09. If CB-4 holds the velocity pattern (CB-1/2/3 all cleared 5-15x ahead), the MVP target end compresses further.

CB-4 is also when the [architecture's bot tick reliability fitness function (≥ 99% of scheduled ticks)](../../foundation/architecture.md#fitness-functions) **starts being measured** — it's been a theoretical target since 2026-05-29's foundation architecture approval; CB-4 is when the first real tick fires.

CB-4 is also the **first bet where `LIVE_MODE` actually matters in production**. CB-2.4 demonstrated the wrapper places real orders; CB-3 confirmed strategies persist correctly. CB-4 layers the safety gate on top. The dry-run-first product principle's load-bearing test happens here.

## Hypothesis (the bet)

If a Vercel cron `*/15 * * * *` invocation authenticates via `CRON_SECRET`, reads the active strategy from `bot_sessions.active_strategy_id → strategies` (with the single-active-per-session contract from [CB-3 brief PM Decision #2](../CB-3/brief.md#decisions)), fetches the latest candles via `lib/coinbase/market:getProductCandles` for each `selected_assets[i].identifier`, computes RSI(14) + MA(period) via deterministic pure functions in `lib/signals/`, evaluates entry/exit rules against the strategy's `entry_rules` + `exit_rules` via pure functions in `lib/decisions/` (emit `buy | sell | hold` + a reason-string), writes a `bot_ticks` row + N `signals` rows (one per asset evaluated — per-asset `decision` + `reason` + nullable `rsi`/`ma` values per the amended `Signal` entity at [architecture.md DRI Log 2026-06-11](../../foundation/architecture.md#dri-log), executed by migration 0005 at [CB-4.2](stories/CB-4.2/story.md); the CB-1-era `kind`/`value` shape predated multi-asset strategies) in a single transaction, and conditionally places a Coinbase limit order via `lib/coinbase/orders:placeOrder` ONLY when `env().LIVE_MODE === true` — then the **"try with paper money, then move to real money"** clause of the [product.md MVP definition](../../foundation/product.md) is satisfied, the **bot tick reliability fitness function** has its first real measurement window open, and the operator has an honest automated execution loop sitting on the typed config they authored in CB-3.

## Defensibility

**None.** Per [product.md § Defensibility](../../foundation/product.md#defensibility--moat): same as CB-1/CB-2/CB-3. RSI/MA are public indicators; Coinbase data is API-public; no proprietary intelligence accrues. The bet's "moat" — to the extent there is one — is the **deterministic-not-ML posture made operator-legible at execution time**: every decision in `bot_ticks.reason` is a literal rule check string ("RSI=27.3 < entry_threshold=30 AND MA20=42000 > price=41850 → buy 50 USD BTC-USD"). When the operator opens CB-5's future dashboard to audit a decision, the math is right there in plain text instead of being opaque ("the model said buy"). That's process moat for the single operator, not transferable.

**Moat impact (one line):** None. CB-4 enables the bot runtime; it doesn't earn user lock-in beyond the operator's process trust in the deterministic decision trail.

## Scope

### In scope

- **`lib/signals/`** — pure-function calculators (asset-class-agnostic; no I/O; no Coinbase imports):
  - `rsi(period: number, closes: number[]): number` — Wilder's smoothing-style RSI; computes against the last `period + warmup` bars
  - `ma(period: number, closes: number[]): number` — simple moving average over the last `period` bars
  - Inputs: `Candle[]` arrays from CB-2.2's wrapper. Outputs: scalar number per signal kind. Pure; deterministic; no side effects.
- **`lib/decisions/`** — pure decision engine (asset-class-agnostic per the [CB-3 strategy-core extraction-readiness invariant](../CB-3/architecture.md)):
  - `evaluate(strategy: Strategy, perAssetSignals: Map<identifier, {rsi, ma, lastClose}>, sessionTotals: {dollarSpent, buyCount}): Array<{asset: Asset, decision: 'buy' | 'sell' | 'hold', reason: string}>`
  - Per-session cap enforcement (read prior `bot_ticks` + `orders` for the active session to compute current totals)
  - Take-profit semantics: operator's single `exit_rules.{rsiThreshold, minProfitPct, sellFraction}` per [CB-3.0 ExitRulesSchema](../CB-3/architecture.md) — NO two-tier ladder (PM Decision #3 below)
- **`app/api/cron/tick/route.ts`** — the cron handler:
  - `CRON_SECRET` auth per [architecture.md § Foundational Identity & Access Posture](../../foundation/architecture.md)
  - Reads `bot_sessions` (singleton; respects `status='paused'` early-out per PM Decision #5 below)
  - Reads the active strategy via `bot_sessions.active_strategy_id → strategies`
  - Fan-out fetches candles for each `selected_assets[i]` (N=1..5 assets)
  - Computes signals via `lib/signals/`
  - Evaluates decisions via `lib/decisions/`
  - Writes `bot_ticks` row + N `signals` rows in a transaction
  - Conditionally places order via `lib/coinbase/orders:placeOrder` when `env().LIVE_MODE === true`
  - Emits structured-JSON log per CB-2.5's `lib/coinbase/trace.ts` pattern + a CB-4-specific event shape: `{event: "bot.tick", session_id, tick_started_at, strategy_id, decisions: [...], live_mode: boolean, order_ids: string[] | null}`
- **Integration tests** against the real Coinbase candle endpoint (public path; no JWT needed; mirrors CB-2.2's gating pattern)
- **Real-Coinbase order test** triple-gated via `RUN_REAL_ORDER_TESTS=1` per CB-2.4's pattern (operator-controlled opt-in; ships a 50%-below-market limit that gets cancelled immediately)
- **Append-only invariant grep test** — CI asserts zero `UPDATE bot_ticks` or `UPDATE signals` paths exist in the codebase

### Out of scope (deferred to other bets or post-MVP)

- **Override UI / endpoints** (pause / resume / force-buy / sell-N / reset) → **CB-5** (operator-confirmed at brief intake; CB-4 stays purely server-side)
- **Dashboard / decision-trace view** → CB-5
- **Auto-pause on drawdown** + reserve floor → post-MVP per [product.md PM Risk #3](../../foundation/product.md)
- **Market orders** — limit-only at MVP per CB-2.4's precedent (`limit_limit_gtc` configuration); market orders deferred for post-MVP emergency-exit affordances
- **Multi-strategy / strategy switching** — deferred per [CB-3 brief PM Decision #2](../CB-3/brief.md#decisions) (single-active model)
- **Candle backfill on miss / catch-up logic** — tick = stateless cron-and-exit per [architecture.md](../../foundation/architecture.md); missed ticks are missed
- **Slippage-adaptive sizing** — fixed `position_size_usd` per operator's strategy row
- **Multi-exchange** — Coinbase only at MVP (the `lib/strategy-coinbase/` adapter pattern from CB-3 leaves room for `lib/strategy-alpaca/` in the equity app; for CB-4, Coinbase-only is the right shape)
- **Two-tier exit ladder** — the stub mentioned "RSI > 65 + 1.5% → sell 50%; RSI > 75 + 2.5% → sell 80%" — that's overruled by CB-3's single-rule `ExitRulesSchema` contract. Two-tier ladder would require a CB-3 schema change (out of scope here)
- **Per-asset cooldown after a buy** (e.g., "don't buy BTC-USD twice in same session") — deferred; per-session caps + signal RSI thresholds provide implicit rate-limiting

## Open questions for Researcher

1. **Candle granularity** — `ONE_HOUR` vs `FOUR_HOUR` vs operator-configurable. `*/15` cron rate means the bot reads intra-bar; signal updates happen at bar close. `ONE_HOUR` gives 15-min latency on signal updates (good for active signals); `FOUR_HOUR` gives 1h latency but smoother signals (less noise). **Lean: fixed `ONE_HOUR` at MVP**; revisit if operator wants tighter or smoother. Closes at `/build CB-4.0` (signal calculators ship with the chosen granularity baked in).
2. **Look-back window for RSI/MA computation** — RSI(14) needs ≥ 14 bars + warmup (~30 for stable values); MA(50) needs ≥ 50 bars. With `ONE_HOUR` granularity, fetching last 60 bars per asset per tick is comfortable (Coinbase max = 350 per request per [CB-2.2's `getProductCandles`](../CB-2/brief.md)). **Lean: 60 bars per asset per tick** as a safe upper bound; can tune down if rate-limit pressure shows up. Closes at `/build CB-4.0`.
3. **Limit-order pricing for `LIVE_MODE`** — limit at last close ± slippage tolerance. CB-2.4 used "50% below market" as a far-from-market integration-test fixture; production needs a tighter spread (e.g., 0.5% of last close for buy-limit; 0.5% above for sell-limit). **Lean: 0.5% slippage tolerance** for MVP. Operator-configurable post-MVP. Closes at `/build CB-4.3` (LIVE_MODE order placement).

## Research findings

Researcher Q1 (candle granularity) — empirically resolvable during `/build CB-4.0` against fixture data + known-input known-output golden values. Will commit at first commit per the Engineer DRI Decision pattern.

Researcher Q2 (look-back window) — same closure path as Q1.

Researcher Q3 (limit slippage) — empirically resolvable during `/build CB-4.3` against the real-Coinbase order integration test. CB-2.4's far-from-market test showed Coinbase rejects with `PREVIEW_LIMIT_PRICE_TOO_FAR_FROM_MARKET` at 50% below; 0.5% is well within acceptance. Engineer DRI Decision at build commit.

## User pain input (from operator)

_n=1 single-operator product — Support pain mirrors the operator's own UX experience. The operator has noted (informally, during foundation review + CB-3 brief drafting):_

- **The Coinbase Recurring Buy frustration**: the operator burned half a day on Recurring Buy that fired on rips (local price highs). **CB-4 is literally what fixes this** — signal-driven entries (`RSI < entry_threshold`) by construction never fire when price is at local highs (`RSI > 70`). Every `bot_ticks.reason` string the operator audits via CB-5's future dashboard reinforces this: "RSI=27.3 < 30 → buy 50 USD BTC-USD" makes the entry intent legible at decision time. This is the operator's strongest pain point + CB-4's clearest payoff.
- **The spreadsheet history**: pre-CB-3 the operator tracked DCA intent in a Google Sheet (RSI buckets, position sizes, dollar caps). CB-3 replaced authoring; CB-4 replaces the spreadsheet's evaluation logic. The form (CB-3) + the bot (CB-4) together close the loop.
- **The 3Commas form fatigue**: already addressed by CB-3; not relevant to CB-4.

## Stories (forecast — decomposed one at a time via `/create-story CB-4`)

_4-5 stories likely. Not authoritative; the workflow estimate model fires the "Stories created" trigger as each story.md file lands._

Expected decomposition (forecast for planning only; not committed scope):

- **CB-4.0** — `lib/signals/` pure RSI + MA calculators — asset-class-agnostic; no I/O; no Coinbase imports. Wilder's-smoothing RSI(period) + simple-MA(period). Unit tests against TA-Lib-style golden-value fixtures to verify deterministic correctness across edge cases (insufficient bars; flat-price series; monotonic-trend series). Closes Researcher Q1 + Q2 via Engineer DRI Decisions on candle granularity + look-back window. Likely effort: small/high-confidence; CB-3.0 precedent.
- **CB-4.1** — `lib/decisions/` decision engine — pure functions; given `{strategy, perAssetSignals, sessionTotals}` → `Array<{asset, decision, reason}>`. Includes per-session cap enforcement (caller queries prior `bot_ticks` + `orders` for the active session; decision engine sees aggregated totals). Universal across asset classes (consumes `Strategy` type from `lib/strategy-core/`). Unit tests against scenario fixtures (operator at $400/$500 dollar cap with buy signal → hold; operator under cap with buy signal → buy; RSI > exit_threshold + profit > min_profit → sell; etc.). Likely effort: medium/medium.
- **CB-4.2** — Cron tick handler at `app/api/cron/tick/route.ts` — replaces the current heartbeat stub. Reads active strategy → fan-out fetches candles for N=1..5 assets → **fan-out fetches `getAccountTradeHistory` per asset (CB-2.3 wrapper) → aggregates fills into `currentPosition: {avgCostUsd, quantity}` per asset for the decision engine's `PerAssetSignal` bundle (per PM DRI Decision #7 below)** → computes signals (CB-4.0) → evaluates decisions (CB-4.1) → writes `bot_ticks` row + N `signals` rows in a transaction (migration 0005 reshapes `signals` into per-asset decision rows first — shape owned by the amended `Signal` entity at [architecture.md DRI Log 2026-06-11](../../foundation/architecture.md#dri-log); tables empty in prod so zero-risk) → emits structured-JSON log per architecture Decision #7 pattern. **Dry-run only**; no order placement in this story. First live cron exercise; Vercel-runtime-only constraints likely to surface per the [CB-3 retro 2026-06-09 lessons](../../retros/2026-06-09-cb-3-production-only-defects-retro.md). Likely effort: medium/medium.
- **CB-4.3** — `LIVE_MODE` gate at order placement — `if (env().LIVE_MODE) await placeOrder(...)`. Persists Coinbase order id to `orders` table (matches CB-2.4's schema). Limit-only orders with the slippage tolerance from Researcher Q3 closure. Triple-gated integration test against real Coinbase via `RUN_REAL_ORDER_TESTS=1` per CB-2.4 precedent. **Writes ALL transactions to the `orders` ledger regardless of mode (per PM DRI Decision #8 below)** — dry-run rows with `status='dry_run'` + `coinbase_order_id=NULL`; live rows with `status='filled' | 'pending' | etc.` + `coinbase_order_id` populated. Likely effort: small/medium.
- **CB-4.4 (maybe)** — Take-profit polish + sell evaluation refinement — if the decision engine's sell logic needs separate iteration after CB-4.1 + CB-4.3 land. May fold into CB-4.1 + CB-4.3; PM Decision at `/create-story CB-4.4` time (mirrors the CB-3.4 fold decision pattern).

Per CB-3's actual velocity (1.5 calendar days end-to-end / 4 stories shipped + 4 polish PRs), CB-4 likely ships in 2-5 calendar days. Confidence holds at `medium` until first story merges; will refine to `high` after CB-4.0 + CB-4.1 ship (pure-function stories with deterministic test fixtures should ship cleanly).

## Scan summary

- **Last scanned:** n/a (no scan-report yet — first scan happens after first story shipped per `/scan` pattern; or, per the CB-3 retro precedent, scan deferrable to post-ship `/measure` cycle if velocity stays tight)
- **Current phase:** brief promotion (HITL approval pending — operator fires `/create-brief CB-4`)
- **Open findings:** n/a (no `/scan` run yet)
- **Blocking advance:** no
- **Full report:** [`scan-report.md`](./scan-report.md) (will exist after first `/build` + `/scan CB-4` fires)

## Check-in log

| Date       | Phase                                   | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-31 | Portfolio stub                          | Created via `/create-bet-portfolio` (5-bet MVP wedge); stub estimate 3 wk / `low`; sketched scope (`lib/signals/`, `lib/decisions/`, cron handler, LIVE_MODE gate, append-only audit).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-06-09 | Brief promotion + HITL approval pending | Operator fires `/create-brief CB-4` immediately after CB-3 ship (PR #54 merged 2026-06-09). 6 PM DRI Decisions + 5 PM Risks logged; 3 Researcher Open Questions logged (closure forecast at /build CB-4.0 + .3); estimate refined 3 wk / `low` → 1 wk / `medium` (operator-confirmed at intake per CB-1/2/3's 5-15x-ahead velocity pattern); `architecture_required: false` (all needed architectural decisions already in foundation architecture — bot tick reliability function, append-only event log, LIVE_MODE gate posture, cron stateless-and-exit pattern). Override scope (pause/resume/force-buy/sell-N/reset) DEFERRED to CB-5 per operator confirmation. |
| 2026-06-11 | CB-4.0 + CB-4.1 shipped; PM Decisions #7 + #8 logged for forward stories | CB-4.0 (`lib/signals/`) shipped 2026-06-09 via PR #58 (+39 net tests; surfaced `[silent-optimization-vs-explicit-contract]` named anti-pattern via Codex round-1). CB-4.1 (`lib/decisions/`) shipped 2026-06-11 via PR #60 (+33 initial → +35 net after 2 BLOCKER closes — round-1 AC 8 sell-signal-no-position branch + relative-import boundary check; round-2 spec-honest reason amendment surfaced `[implementation-spec-gap-undetected-by-own-tests]` named anti-pattern + cross-artifact-sweep-on-latent-drift variant). 2 NEW PM DRI Decisions logged in this brief amendment for forward CB-4.2 + CB-4.3 stories: Decision #7 pins `getAccountTradeHistory` as the cost-basis source (uniform dry-run + LIVE_MODE; operator's REAL portfolio drives bot's view), Decision #8 pins ALL transactions written to `orders` ledger regardless of mode (dry_run + live unified for CB-5's audit dashboard + operator's would-have-PnL computation). Forecast rows for CB-4.2 + CB-4.3 amended to reflect the locked decisions. 2 of 4 stories shipped; CB-4.2 + CB-4.3 (+ maybe CB-4.4) remain. Operator's velocity target — bet on track to ship in 2-3 more days vs the 1-week medium-confidence estimate. |

## DRI Log

### Decisions

- [2026-06-09] [PM] **Defer override scope (pause / resume / force-buy / sell-N / reset) to CB-5** — operator-confirmed at brief intake 2026-06-09
  - **Rationale (required):** [Portfolio.md § Stream 4](../../foundation/portfolio.md) already names CB-5 as "ledger + dashboard + override buttons"; the scope split is portfolio-design intent. Keeping CB-4 purely server-side means no UI surface in this bet → no recurrence of the 3 production-only-defect lessons from [CB-3 retro 2026-06-09](../../retros/2026-06-09-cb-3-production-only-defects-retro.md) (`[rsc-prop-serialization]`, `[server-action-file-export-purity]`, `[empty-numeric-input-zero-trap]`). The bot CAN respect `bot_sessions.status='paused'` if external code (CB-5 future override) flips it — that's a one-line early-out in the cron handler — but no operator-facing surface ships here.
  - **Area (required, tag):** scope / bet-decomposition
  - **Alternatives considered (required):** include override endpoints + minimal UI in CB-4 (rejected — bloats the bet by ~5d, re-introduces UI-surface defect class flagged in retro); ship only the data layer for overrides in CB-4 (rejected — the data layer is the existing `bot_sessions.status` + `override_events` table from `0001-init.sql`; nothing to add)
  - **Reversibility:** trivial — if a real override emergency surfaces before CB-5, fold a minimal pause endpoint as a CB-4 follow-up

- [2026-06-09] [PM] **Limit orders only at MVP; market orders deferred**
  - **Rationale (required):** CB-2.4's precedent: `placeOrder` shipped with `limit_limit_gtc` configuration as the supported path. Limit orders give the operator price control + match the operator's stated preference (Recurring Buy frustration was about price control). Market orders defer to post-MVP emergency-exit affordances (e.g., a CB-5 dashboard "sell all" button that needs market fill).
  - **Area (required, tag):** order-type / safety
  - **Alternatives considered (required):** market orders for buys only (rejected — operator's pain is specifically about price control on buys); both order types (rejected — doubles surface area for marginal MVP value); market-only (rejected — defeats operator price control)
  - **Reversibility:** trivial — CB-2.4 already supports market order configuration; adding to CB-4 is single-digit lines

- [2026-06-09] [PM] **Single-tier exit rule per [CB-3.0 `ExitRulesSchema`](../CB-3/architecture.md)** — overrules the stub's two-tier ladder hypothesis ("RSI > 65 + 1.5% → 50%; RSI > 75 + 2.5% → 80%")
  - **Rationale (required):** CB-3 shipped a SINGLE `exit_rules: {rsiThreshold, minProfitPct, sellFraction}` per strategy. The operator authors ONE exit rule; the bot evaluates it. Two-tier ladder would require a CB-3 schema change (out of scope here) + form UI revision. The single-tier shape is operator-discoverable (one explanation in the help text) + deterministically evaluatable. The brief stub predates CB-3 ship; this decision aligns with what CB-3 actually shipped.
  - **Area (required, tag):** scope / strategy-contract
  - **Alternatives considered (required):** amend CB-3 schema to support two-tier (rejected — out of scope; CB-3 is shipped; would re-open a closed bet); hardcode the two-tier ladder in CB-4 outside the operator-authored config (rejected — defeats the operator-authored config model + makes audit non-legible)
  - **Reversibility:** moderate — if operator wants two-tier post-MVP, the CB-3 schema + form would extend cleanly per the `ExitRulesSchema` shape

- [2026-06-09] [PM] **`LIVE_MODE` env-var is the ONE safety primitive** — no UI toggle; no "are you sure" prompt; no operator confirmation
  - **Rationale (required):** Per [product.md § DRI Decision: dry-run is the default](../../foundation/product.md). The env-var flip in Vercel's Production scope IS the deliberate ceremony — it requires logging into the Vercel dashboard, navigating to Settings → Environment Variables → Production scope, editing one value, and triggering a redeploy. That's already ~5 minutes of friction; layering a UI confirmation ceremony on top adds zero safety + signal "I don't really mean it." The structured-JSON log emits `live_mode: true | false` on every tick for audit. The operator can grep runtime logs to confirm posture at any time.
  - **Area (required, tag):** safety / dry-run-first
  - **Alternatives considered (required):** UI toggle in dashboard (rejected — defeats the env-var-only invariant; introduces a code path that could flip without a redeploy); API endpoint to flip with CRON_SECRET auth (rejected — same class as UI toggle; adds attack surface); requires-2-of-2-conditions (env var + DB flag) (rejected — convoluted; the env var is already a friction-with-meaning ceremony)
  - **Reversibility:** trivial — adding a UI toggle later is straightforward if the safety model proves over-restrictive

- [2026-06-09] [PM] **Cron handler respects `bot_sessions.status='paused'`** — the ONE non-decision-engine state field the cron reads
  - **Rationale (required):** Leaves room for CB-5's future override endpoints to set `status='paused'` (no override UI in CB-4 per Decision #1 above). The cron's early-out is one line: `if (session.status === 'paused') return earlyOut(...)`. Costs nothing now; saves a CB-5 redesign later.
  - **Area (required, tag):** future-compatibility / minimal-surface
  - **Alternatives considered (required):** don't read status (rejected — leaves CB-5 without an obvious integration point); read all override_events (rejected — over-engineering at this scope; status is the aggregate)
  - **Reversibility:** trivial

- [2026-06-09] [PM] **`duration_weeks: 1` and `confidence: medium`** at brief-approval — bumped from stub's 3 wk / `low`
  - **Rationale (required):** Operator-confirmed at brief intake. Honest read of CB-1/2/3 velocity (all 5-15x ahead of estimate). CB-3 cleared in 1.5d for 4 stories + 4 polish PRs. CB-4's complexity is genuine (signal-math determinism testing + LIVE_MODE first live exercise + cron integration) but bounded. 1 wk is a comfortable upper bound; actual likely 2-5 days.
  - **Area (required, tag):** scheduling / estimation
  - **Alternatives considered (required):** 2-3d high-confidence (rejected — too aggressive given LIVE_MODE first live exercise + 3 unresolved Researcher Qs that could each surface a story extension); keep stub's 3 wk low (rejected — ignores 3-bet velocity trend; flags as "unknown unknowns" rather than acknowledging the pattern)
  - **Reversibility:** trivial — next `/plan` refresh after CB-4.0 ships will recompute

- [2026-06-11] [PM] **CB-4.2 cost basis source = Coinbase `getAccountTradeHistory` (CB-2.3 wrapper)** — operator-confirmed during CB-4.1 PR #60 review cycle
  - **Rationale (required):** The decision engine's `PerAssetSignal.currentPosition: {avgCostUsd, quantity} | null` must come from somewhere at every cron tick. Three options were considered: (a) query Coinbase via `getAccountTradeHistory`, (b) aggregate from local `orders` + `trade_fills` rows, (c) parallel "intended orders" table for dry-run. Option (a) is the only path that works UNIFORMLY across dry-run and `LIVE_MODE`: even before the bot has placed any real-money orders, the operator's manual Coinbase buys are visible — so the bot's view of "current position" in dry-run reflects the operator's REAL portfolio. This makes dry-run validation meaningful: the operator can audit "what would the bot do against my actual holdings?" before flipping `LIVE_MODE`. Per CB-2.5's empirical rate-limit headers (30 RPS auth'd-brokerage ceiling), the per-tick fan-out (5 assets × 1 trade-history call = ~5 RPS burst over ~1s) is comfortable.
  - **Area (required, tag):** architecture / data-source / cost-basis
  - **Alternatives considered (required):** aggregate from local `orders` + `trade_fills` (rejected — broken in dry-run; no writes happen until CB-4.3's `LIVE_MODE` gate places at least one order; would force the operator to flip `LIVE_MODE` to get cost-basis data, defeating the dry-run-first principle); parallel "intended orders" table that tracks dry-run synthetic positions (rejected — adds schema work + reconciliation problem when `LIVE_MODE` flips and synthetic positions need to converge with real ones); pass cost basis as zero/null in dry-run and skip take-profit evaluation (rejected — operator gets a half-broken decision trace; dry-run loses validation value)
  - **Reversibility:** moderate — if per-tick `getAccountTradeHistory` calls surface rate-limit pressure post-ship, cache cost basis per session in a new table or in-memory (would amortize the per-tick fetch over multiple ticks; cost basis only changes when a fill happens)
  - **Forward reference:** Engineer commits cost-basis-aggregation logic at `/build CB-4.2`; integration test exercises against real Coinbase fill data (operator's own portfolio)

- [2026-06-11] [PM] **CB-4.3+ writes ALL transactions to the `orders` ledger regardless of mode** — operator-confirmed during CB-4.1 PR #60 review cycle
  - **Rationale (required):** From CB-4.3 onwards, every bot-decided buy/sell writes a row to `orders` — dry-run AND `LIVE_MODE`. Dry-run rows get `status='dry_run'` + `coinbase_order_id=NULL`; live rows get `status='filled' | 'pending' | etc.` + `coinbase_order_id` populated. The `orders` table becomes the unified buy/sell audit ledger across modes: CB-5's future dashboard renders identical views for both modes; the operator can compute "would-have-PnL" before flipping `LIVE_MODE`; the operator's explicit requirement that all transactions land in a ledger is satisfied. Schema note: `orders.status` is `text NOT NULL` with no CHECK constraint per [`0001-init.sql:40`](../../../db/migrations/0001-init.sql) — free-form values accepted today, no migration needed. `coinbase_order_id` is already nullable.
  - **Area (required, tag):** architecture / observability / unified-audit-ledger
  - **Alternatives considered (required):** dry-run only writes to `bot_ticks.reason` (rejected — text-parsing reason strings to compute PnL is brittle; CB-5 dashboard would need two divergent code paths for dry-run vs live render; defeats unified audit); parallel "intended_orders" table separate from `orders` (rejected — adds schema; complicates the CB-5 dashboard's render layer; reconciliation problem when `LIVE_MODE` flips)
  - **Reversibility:** moderate — adding a CHECK constraint on `orders.status` post-ship would require migration but historical rows would survive (append-only invariant per architecture). If the schema needs to evolve (e.g., new status values), the `text NOT NULL` flexibility means no schema migration is needed for value additions.
  - **Forward reference:** CB-4.3 ships the dry-run ledger writes (Engineer DRI Decision at build for exact `status` value taxonomy + handling of partial fills); CB-5 dashboard reads from `orders` for the unified audit view.

### Risks

- [2026-06-09] [PM] **Signal computation error → bot trades wrong (high impact in LIVE_MODE)**
  - **Likelihood (required):** medium (signal math is non-trivial; off-by-one indexing, Wilder's-smoothing vs simple-RSI variant differences, NaN handling on insufficient bars are all classic foot-guns)
  - **Impact (required):** medium-high (in dry-run: bot_ticks.reason shows wrong math, but no real money. In LIVE_MODE: real-money damage at scale)
  - **Mitigation (required):** deterministic pure functions in `lib/signals/`; unit tests against TA-Lib-style golden values (known input candle series → known RSI/MA values across edge cases — insufficient bars, flat series, monotonic trends, NaN inputs); dry-run-first product principle gates real-money exposure; CB-5's future dashboard surfaces `bot_ticks.reason` for operator audit before live mode flip
  - **Area (required, tag):** correctness / safety

- [2026-06-09] [PM] **`LIVE_MODE` accidental flip → real-money damage**
  - **Likelihood (required):** LOW (env-var flip in Vercel Production scope is a deliberate UI ceremony; no API or code path can flip it)
  - **Impact (required):** HIGH (loss of operator money if the bot's signal computation is wrong AND LIVE_MODE is on AND the operator hasn't validated in dry-run first)
  - **Mitigation (required):** env-var-only per PM Decision #4 above; structured log emits `live_mode: true | false` on every tick for audit; runbook documents the LIVE_MODE flip ceremony (Vercel → Settings → Env Vars → Production → edit → redeploy); operator's ≥ 60 dry-run-sessions guardrail before flipping (per [product.md § Hypothesis](../../foundation/product.md) + [portfolio.md PM Risk #3](../../foundation/portfolio.md))
  - **Area (required, tag):** safety / dry-run-first

- [2026-06-09] [PM] **Cron overlap → double-fire (same `tick_started_at`; duplicate decisions)**
  - **Likelihood (required):** medium-low. **Correction from prior draft:** Vercel cron CAN double-fire — per [Vercel cron docs](https://vercel.com/docs/cron-jobs), a second invocation can be triggered while the first is still running if the prior tick exceeds the schedule interval (the original draft incorrectly said "non-overlapping by default"). Bot's expected tick duration is well under 15 min (5 candle fetches × ~300ms each + Postgres writes ≈ 2-3s), but cold starts + Coinbase latency tails could occasionally push past edge cases.
  - **Impact (required):** MEDIUM (two tick rows for the same instant would corrupt the `bot_ticks` audit log + potentially double-place orders in LIVE_MODE)
  - **Mitigation (required):** **Layered defense:**
    1. **DB-level `UNIQUE (session_id, tick_started_at)` constraint** per [architecture.md DRI Risk: cron overlap](../../foundation/architecture.md) + [`0001-init.sql:62`](../../../db/migrations/0001-init.sql); the constraint rejects the second INSERT, so the second tick's transaction rolls back. **This is the load-bearing defense regardless of why the double-fire happened.**
    2. **Tick-duration bound** via Vercel function `maxDuration` configured at the cron handler — set to a safe ceiling (e.g., 60s) to fail-fast on a stuck tick rather than letting it overrun the 15-min schedule.
    3. **Idempotent order placement** in LIVE_MODE — CB-2.4's `placeOrder` already accepts `clientOrderId`; the cron handler will compute a deterministic clientOrderId from `(session_id, tick_started_at, asset_identifier)` so Coinbase rejects the duplicate place even if a second tick reaches the order endpoint before the first's INSERT raises the UNIQUE violation.
    4. **CI grep test** asserts the cron handler does NOT catch + swallow the constraint violation silently — the violation MUST surface as a tick failure (counted against the 99% reliability metric, not hidden).
  - **Area (required, tag):** concurrency / data-integrity / fail-loud

- [2026-06-09] [PM] **Coinbase rate-limit on candle fetches** — operator's up to 5 `selected_assets` × 1 candle fetch per tick = **5 calls per tick, burst-of-5 over the ~1s fan-out window; sustained 5 calls per 900s ≈ 0.006 RPS averaged over the day**
  - **Likelihood (required):** low. **Math correction from prior draft:** the sustained load is ~0.006 RPS (5 calls every 900-second tick interval), well under 0.1% of the 30 RPS ceiling — the original "5 RPS sustained" framing conflated the burst-within-tick window with sustained-over-time. The actual concern is the burst-within-tick: 5 back-to-back GETs during the fan-out, which momentarily registers as 5 RPS for ~1 second — that's 17% of the 30 RPS ceiling at the burst window, above the 10% guardrail. Coinbase's rate-limit windowing matters here: if Coinbase counts per-second (most common for token-bucket implementations), a 5-call burst within a single second is fine; if it counts smaller sub-second windows, the burst is a real concern. CB-2.5's empirical headers showed only `x-ratelimit-remaining` per response — granularity not yet confirmed.
  - **Impact (required):** medium (rate-limit rejection → tick failure → bot_tick reliability metric breach at 99% target)
  - **Mitigation (required):**
    1. CB-2.5's `lib/coinbase/trace.ts` already logs `x-ratelimit-*` headers per response — production runtime data will resolve the windowing question empirically within the first 24h of CB-4.2 ship.
    2. The cron handler degrades gracefully per-asset (try/catch around each candle fetch; emit `hold` + reason for rate-limit-blocked assets; the tick row still writes successfully).
    3. **Burst-shaping option (deferrable)**: add a 100-200ms inter-call delay between candle fetches if rate-limit pressure shows up. Spreads the 5-call burst over ~1s window deterministically; reduces peak RPS to 5 calls / 1s = sustainable.
    4. **Batch endpoint check (Researcher Q-adjacent)**: Coinbase Advanced Trade may have a multi-product candle endpoint that returns N products' candles in one call; CB-2.2 didn't implement it but `getProductCandles` is per-product today. If a batch endpoint exists, use it (1 call instead of 5).
  - **Area (required, tag):** external-api / rate-limit-budget / burst-vs-sustained

- [2026-06-09] [PM] **Take-profit semantics drift from operator intent** — operator authored `exit_rules` once in CB-3's form; bot evaluates deterministically; operator may think they meant something different
  - **Likelihood (required):** medium (operator hasn't seen the bot actually act on their exit rules yet; the form preserves what they typed but the runtime interpretation is what matters)
  - **Impact (required):** medium-high (in LIVE_MODE: premature sells leave profit on the table OR delayed sells let drawdowns happen)
  - **Mitigation (required):** `bot_ticks.reason` surfaces the literal rule check in plain text ("RSI=72.1 > exit_threshold=70 AND profit_pct=2.3 > min_profit=1.5 → sell 50% of BTC-USD position"); CB-5's dashboard will surface these decision-trace strings for operator audit; the ≥ 60 dry-run-sessions guardrail before LIVE_MODE means the operator validates exit semantics in paper-mode FIRST. Plus: operator can revise the strategy via CB-3's supersession contract any time
  - **Area (required, tag):** correctness / operator-trust

### Issues

- [2026-06-09] [PM] **Three Researcher Open Questions logged above (candle granularity; look-back window; limit-order slippage)** — Researcher fills empirically at build time per the Engineer DRI Decision pattern
  - **Severity (required, mandatory):** P3 (informational; doesn't block brief approval; closes at /build CB-4.0 + .3)
  - **Owner (required, mandatory):** Researcher → Engineer at build time
  - **Status:** open
  - **Area (required, tag):** research / build-time-decisions
  - **Resolution (filled when closed):** Q1 (candle granularity) — closes at `/build CB-4.0` with Engineer DRI Decision. Q2 (look-back window) — closes at `/build CB-4.0` with Engineer DRI Decision. Q3 (limit-order slippage) — closes at `/build CB-4.3` with Engineer DRI Decision against real-Coinbase integration test.

## Fixes (post-merge)

_If post-merge bugs are found, stories are re-opened and fixes live under `docs/bets/CB-4/stories/CB-4.X/fixes/`. Per the [CB-3 retro 2026-06-09](../../retros/2026-06-09-cb-3-production-only-defects-retro.md), watch for: Vercel-runtime-only constraints (CB-3.3 surfaced 3); operator UX edge cases (CB-3.3 surfaced 1 — though CB-4 has no UI so this class shouldn't recur); cross-artifact-drift recurrence on contract shifts._

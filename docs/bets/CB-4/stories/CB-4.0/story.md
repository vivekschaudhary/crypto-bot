---
id: CB-4.0
bet: CB-4
type: story
status: ready
priority: P0
created: 2026-06-09
author: PM
design_link: n/a — pure library code; no UI surface (CB-3.0 precedent)
area_tags: [bot-runtime, signals, rsi, ma, pure-functions, asset-class-agnostic, foundation]
dependencies:
  - CB-4 brief approved 2026-06-09 (PR #56)
estimate:
  effort: small
  confidence: high
e2e: false
---

# CB-4.0 — `lib/signals/` foundation (pure RSI + MA calculators)

## Description

Ship the **pure, asset-class-agnostic, no-I/O signal calculators** that the rest of CB-4 builds on. Per [CB-4 brief Stories forecast](../../brief.md#stories-forecast--decomposed-one-at-a-time-via-create-story-cb-4): "CB-4.0 — `lib/signals/` pure RSI + MA calculators — asset-class-agnostic; no I/O; no Coinbase imports. Wilder's-smoothing RSI(period) + simple-MA(period)."

This is the foundation slice — the math layer the decision engine (CB-4.1) will compose against and the cron handler (CB-4.2) will fan out across the operator's `selected_assets`. Once this ships:

- CB-4.1 can build the `evaluate(strategy, signals, sessionTotals)` decision engine on top of typed `Map<identifier, {rsi, ma, lastClose}>` results
- CB-4.2 can read CB-2.2's `getProductCandles` response → extract `close` values → call `rsi()` + `ma()` → emit decision
- The equity-app variant (per CB-3's extraction-readiness invariant) can consume the same `lib/signals/` modules with zero changes — the signals only consume `closes: number[]`, not any Coinbase/Alpaca-shaped Candle

No DB writes; no live Coinbase calls; no UI; no env reads; no LIVE_MODE consultation. Pure number-in / number-out functions + Zod-flavored type discipline. Mirrors the CB-3.0 precedent (foundation primitive ships first; downstream concretes against it). `e2e: false`.

## Acceptance Criteria

- [ ] **AC 1** — `lib/signals/rsi.ts` exports `rsi(period: number, closes: number[]): number | null`. **Wilder's smoothing variant** (matches TradingView's "Standard" RSI implementation; retail-trader convention). Returns null when `closes.length < period + 1` (insufficient bars) — the sentinel CB-4.1's decision engine maps to "hold + reason 'insufficient_bars'".

- [ ] **AC 2** — `lib/signals/ma.ts` exports `ma(period: number, closes: number[]): number | null`. **Simple Moving Average** over the last `period` bars (arithmetic mean of `closes.slice(-period)`). Returns null when `closes.length < period`. Per [CB-3.0 `MaPeriodSchema`](../../../CB-3/architecture.md), `period` is one of `{5, 10, 20, 50}` — but `lib/signals/ma.ts` accepts any positive integer (the strict-set check lives in CB-3.0's validation layer, not here).

- [ ] **AC 3** — `lib/signals/index.ts` re-exports `rsi` + `ma` for clean consumer-facing import path: `import { rsi, ma } from "@/lib/signals"`.

- [ ] **AC 4** — **Pure functions; no side effects; no imports from `@/lib/coinbase/*`, `@/lib/db/*`, `@/lib/env/*`, or `@/lib/strategy-*/*`.** The architectural invariant per the [CB-4 brief Hypothesis](../../brief.md#hypothesis-the-bet) and the equity-app portability discipline from [CB-3 brief PM DRI Decision #6](../../../CB-3/brief.md#decisions). Verified by AC 7 + AC 8 invariant tests.

- [ ] **AC 5** — **Insufficient-bars sentinel = `null`** (NOT `NaN`; NOT `undefined`; NOT thrown error). NaN would propagate silently through arithmetic and CB-4.1's decision engine; undefined breaks TypeScript exhaustiveness; throw would force every caller to try/catch. Null is type-safe + decision-engine-mappable to `{decision: "hold", reason: "insufficient_bars"}`. Documented inline in JSDoc.

- [ ] **AC 6** — **NaN in input array → null return** (defense-in-depth). If the caller passes `closes` containing any `NaN` (e.g., Coinbase returned a candle with malformed `close` string that `parseFloat` couldn't resolve), the signal function returns null rather than computing a contaminated value. Documented inline.

- [ ] **AC 7** — **Architectural invariant test**: `tests/lib/signals/no-coupling.test.ts` (transitive walk; CB-3.0 precedent). Reads every `.ts` file under `lib/signals/`, parses imports, asserts NO `@/lib/coinbase/*`, `@/lib/db/*`, `@/lib/env/*`, or `@/lib/strategy-*/*` import paths appear. The test is the structural proof that `lib/signals/` stays extraction-ready for the equity-app per CB-3's pluggability discipline.

- [ ] **AC 8** — **Sibling LIVE_MODE-free invariant test**: `tests/lib/signals/no-live-mode.test.ts`. Same shape as `tests/lib/strategy-core/no-live-mode.test.ts` + `tests/lib/strategy-coinbase/no-live-mode.test.ts` (CB-3.0 + CB-3.1 precedents). Asserts no `LIVE_MODE` env read paths exist in `lib/signals/` (defense-in-depth; the LIVE_MODE gate is CB-4.3's concern at the order-placement layer, NOT the signal-computation layer).

- [ ] **AC 9** — **Unit tests against TA-Lib-style golden values** (~30 tests across both functions):
  - RSI: flat-price series (e.g., `[100, 100, 100, ...]` × 30 bars) → RSI = 50 (Wilder's convention; no gains or losses)
  - RSI: monotonic-up series (e.g., `[100, 101, 102, ...]` × 30 bars) → RSI approaches 100
  - RSI: monotonic-down series (e.g., `[100, 99, 98, ...]` × 30 bars) → RSI approaches 0
  - RSI: classic textbook series (specific input → specific expected output verified against TradingView's "Standard" RSI; pinned exact values in test fixtures)
  - RSI: insufficient bars (`closes.length === period`) → returns null
  - RSI: NaN in input → returns null
  - MA: trivial arithmetic mean cases (`[1, 2, 3, 4, 5]`, MA(5) → 3.0; `[10, 20]`, MA(2) → 15.0)
  - MA: only the last `period` bars are used (e.g., `[1, 2, 3, 4, 5, 6, 7]`, MA(3) → `(5+6+7)/3 = 6.0`, NOT mean of all 7)
  - MA: insufficient bars (`closes.length < period`) → returns null
  - MA: NaN in input → returns null
  - MA: period = 1 (degenerate but legal) → returns the last close value verbatim

- [ ] **AC 10** — **Gates**: `pnpm typecheck` zero errors; `pnpm lint` zero warnings; `pnpm test` ~554 → ~585+ (+~30 new); `pnpm build` green; `lib/signals/` source size under 5K LOC (well under the 100K bundle alarm at the lib level).

## Standard Experience Checklist

CB-4.0 is pure library code (server-only; no UI surface; no rendered output). **4 of 6 categories `n/a`** (Navigation / States / Feedback / Accessibility — no UI surface) + **2 of 6 covered by AC items** (Edge cases via AC 9; Cross-surface consistency via AC 4 + AC 7's architectural-invariant tests). Mirrors the [CB-3.0 precedent](../../../CB-3/stories/CB-3.0/story.md) shape — pure-library stories typically have non-trivial Edge cases (sentinel handling, NaN, insufficient bars) + Cross-surface (asset-class portability invariants) coverage that ISN'T `n/a` even though no UI ships.

- [ ] **Navigation** — `n/a — no UI surface in this story; lib/signals/ exports number-in / number-out pure functions consumed by CB-4.1's decision engine + CB-4.2's cron handler in later stories.`
- [ ] **States** — `n/a — pure functions return either a number (computed result) or null (insufficient-bars / NaN-in-input sentinel). No UI loading/empty/error states ship in this story; those are CB-5 dashboard concerns.`
- [ ] **Feedback** — `n/a — no UI feedback surface. The null sentinel IS the structured feedback contract that CB-4.1's decision engine consumes to emit hold + reason 'insufficient_bars'. No user-facing strings here.`
- [ ] **Accessibility** — `n/a — no rendered UI; accessibility surfaces at CB-5's future dashboard.`
- [ ] **Edge cases** — `covered by AC 9 — insufficient-bars + NaN-in-input + flat-series + monotonic-up/down + last-N-only MA + degenerate-period-1 MA all explicitly tested. Coinbase rate-limit + cron-overlap + LIVE_MODE edge cases are CB-4.2 + CB-4.3 concerns, not lib/signals/.`
- [ ] **Cross-surface consistency** — `covered by AC 4 + AC 7 — architectural invariant proves lib/signals/ stays asset-class-agnostic (the equity-app extraction discipline from CB-3 brief PM Decision #6). Cross-asset-class portability is the load-bearing dimension here, not UI multi-target.`

## Tech notes

The build materializes the pure-function math layer per [CB-4 brief Scope § lib/signals/](../../brief.md#scope). Engineer DRI Decisions called out here (Engineer commits at first build commit):

1. **RSI variant = Wilder's smoothing** — matches TradingView's "Standard" RSI implementation; retail-trader convention. The alternative (simple-RSI = gain/loss SMA without Wilder's smoothing exponential adjustment) gives slightly different values; Wilder's is what every modern charting tool ships. Engineer commits as Decision #1. Reference: Welles Wilder, "New Concepts in Technical Trading Systems" (1978). The smoothing formula: `avg_gain[i] = ((period - 1) × avg_gain[i-1] + gain[i]) / period`; `avg_loss` mirrors; `RSI = 100 - (100 / (1 + avg_gain / avg_loss))`.

2. **Candle granularity for production cron = `ONE_HOUR`** — closes [Researcher Q1 from brief](../../brief.md#open-questions-for-researcher). Rationale: `*/15` tick reads intra-bar; signal updates happen at bar close. ONE_HOUR gives 15-min latency on signal updates (good for active signals + operator's deterministic-decision posture). FOUR_HOUR gives 1h latency but smoother signals; ONE_HOUR is the right MVP balance. **NOTE**: lib/signals/ pure functions themselves are granularity-agnostic — they only consume `closes: number[]`; the meaning of those bars is set by CB-4.2's cron handler at fetch time. This decision documents the choice for the consuming layer. Engineer commits as Decision #2.

3. **Look-back window = 65 bars per asset per tick** — closes [Researcher Q2 from brief](../../brief.md#open-questions-for-researcher). Rationale: MA(50) needs 50 bars; RSI(14) with Wilder's smoothing needs ~30 bars for stable convergence (14 period + ~16 warmup); max needed = 64; 65 bars adds safety margin. Coinbase max per request = 350 (per [CB-2.2's `getProductCandles`](../../../CB-2/brief.md)), well within. **NOTE**: same as Decision #2 — this is a CB-4.2 cron-handler concern; lib/signals/ functions just compute correctly given N bars. Documented here as the implicit assumption underlying the test fixtures + golden-value series lengths. Engineer commits as Decision #3.

4. **Insufficient-bars sentinel = `null`** (per AC 5) — NOT `NaN`, NOT `undefined`, NOT thrown error. Rationale: NaN propagates silently through arithmetic (decision engine could emit nonsense without realizing); undefined breaks TypeScript's exhaustiveness checks downstream; throw forces every caller into try/catch boilerplate. Null is type-safe + the CB-4.1 decision engine maps it cleanly to `{decision: "hold", reason: "insufficient_bars"}`. Engineer commits as Decision #4.

5. **Input type = `closes: number[]`** (per AC 1 + AC 2) — NOT `Candle[]` from CB-2.2's schema. Rationale: decouples `lib/signals/` from any specific exchange's Candle shape. CB-4.2's cron handler does the extraction via `candles.map(c => parseFloat(c.close))`; the signal functions only care about the close prices. This is the same shape as CB-3.0's strategy-core invariant — keeps the equity-app extraction a half-day find/replace per [CB-3 brief PM DRI Decision #6](../../../CB-3/brief.md#decisions). Engineer commits as Decision #5.

6. **NaN in input array → null** (per AC 6) — defense-in-depth. If Coinbase ever returns a candle with a `close` string that `parseFloat` can't resolve (rare; would indicate API contract drift per CB-2.5's empirical posture), the resulting NaN in the input array should short-circuit the signal computation rather than propagate. CB-4.2 + CB-4.1 layer their own NaN guards on top (cron handler catches per-asset; decision engine maps to hold + reason). Engineer commits as Decision #6.

### Patterns to mirror at `/build CB-4.0`

1. **Architectural invariant tests** — CB-3.0's `no-coupling.test.ts` transitive walk + CB-3.0/.1's `no-live-mode.test.ts` sibling pattern. Same shape adapted for `lib/signals/` boundary.
2. **Pure-function library shape** — CB-3.0's `lib/strategy-core/` precedent (types + Zod schemas + pure functions; zero I/O; zero crypto-app singletons in scope).
3. **Golden-value unit tests** — same discipline as CB-3.0's validate.ts rule-branch tests (specific input → specific expected output; no fuzziness).

### What this story does NOT include

- `lib/decisions/` decision engine — CB-4.1 (next story)
- Cron tick handler at `app/api/cron/tick/route.ts` — CB-4.2
- `LIVE_MODE` gate at order placement — CB-4.3
- Take-profit polish — CB-4.4 (maybe; PM Decision at `/create-story CB-4.4` time)
- Multi-timeframe signals (e.g., 15-min RSI + 1-hour MA) — deferred post-MVP
- Volume-weighted moving average (VWMA) or exponential moving average (EMA) — deferred post-MVP; simple MA is the operator's spreadsheet convention
- Bollinger bands / MACD / Stochastic — out of MVP per [product.md DRI Decision: deterministic signal rules](../../../../foundation/product.md) (operator authors RSI + MA only)

### Why this story ships FIRST in CB-4

The decision engine (CB-4.1) and cron handler (CB-4.2) both consume `rsi()` + `ma()` as their math primitives. Shipping in this order means CB-4.1 can immediately compose them into the decision logic without re-litigating signal semantics; CB-4.2 can fan out across `selected_assets` without inventing its own RSI variant. Reversing the order would force every downstream story to either mock the signals or stub them.

This is the same shape as CB-3.0 (foundation primitive) → CB-3.1 (real adapter) → CB-3.2 (persistence) → CB-3.3 (UI). Foundation primitive first, concretes against it.

## DRI Log

### Decisions

- [2026-06-09] [PM] **CB-4.0 ships ZERO Coinbase / DB / env / strategy-* coupling — the architectural invariant test is load-bearing**
  - **Rationale (required):** Per [CB-4 brief Hypothesis](../../brief.md#hypothesis-the-bet) + [CB-3 brief PM DRI Decision #6 extraction-readiness invariant](../../../CB-3/brief.md#decisions). Without an automated invariant test (AC 7), this couple-zero discipline rots: a future Engineer slips in an import "just for convenience," then the equity-app extraction becomes a multi-day surgery instead of a half-day find/replace. AC 7 is the test that protects the extraction path. Pattern precedent: CB-3.0's `no-coupling.test.ts` transitive walk.
  - **Area (required, tag):** architecture / extraction-readiness / invariant-enforcement
  - **Alternatives considered (required):** drop the test, rely on convention (rejected — CB-3.0 already established this is necessary for the strategy-core boundary; same logic applies here); manual grep at CI level (rejected — test belongs with the code, not with the CI YAML; CB-3.0 precedent); add only as a JSDoc comment (rejected — Codex correctly catches "widening" patterns without enforcement)
  - **Reversibility:** trivial — remove the test if the invariant is ever explicitly relaxed (it won't be without a brief amendment)

- [2026-06-09] [PM] **Golden-value unit tests against TA-Lib-style reference data are MANDATORY at CB-4.0 (NOT deferred to CB-4.1 or CB-4.2)**
  - **Rationale (required):** Per [CB-4 brief PM Risk #1: signal computation error → bot trades wrong](../../brief.md#risks): "Mitigation: deterministic pure functions in `lib/signals/`; unit tests against TA-Lib-style golden values." The risk impact is medium-high (real money in LIVE_MODE); the mitigation is THIS story's golden-value test discipline. Deferring to a later story would mean signal math ships unverified through CB-4.1 + CB-4.2, with the first wrong-math signal arriving in operator-visible `bot_ticks.reason` strings. The discovery moment for math bugs needs to be at CB-4.0 build time, not at CB-4.2 production cron time.
  - **Area (required, tag):** test-discipline / safety / risk-mitigation
  - **Alternatives considered (required):** defer golden-value tests to CB-4.1 (rejected — pushes the math-correctness verification window to a later, riskier story); fuzzy tolerance tests against approximate values (rejected — RSI/MA are deterministic; pinning exact values is the right discipline); skip golden-value tests + rely on production observation (rejected — defeats the dry-run-first product principle; CB-4 brief Risk #1 mitigation calls for exactly this)
  - **Reversibility:** trivial — if golden values prove brittle across reference-library updates (TradingView formula drift, etc.), tighten tolerances at that point

- [2026-06-09] [PM] **`closes: number[]` input type (NOT `Candle[]`) — decouples lib/signals/ from any specific exchange's Candle shape**
  - **Rationale (required):** Per [CB-3 brief PM DRI Decision #6 extraction-readiness invariant](../../../CB-3/brief.md#decisions): the pluggable architecture pattern requires that math/decision libraries consume primitive inputs, not exchange-shaped DTOs. CB-2.2's `Candle` type is Coinbase-specific (`{start, low, high, open, close, volume}` all strings); a future Alpaca adapter would have its own Candle shape. Forcing both adapters through a shared "Candle" type would require either a) a common abstract Candle in `lib/signals/types.ts` that every adapter maps to (over-engineering for MVP) OR b) signals consume the primitive `closes: number[]` and the cron handler does the extraction (cleaner). The brief's [Scope § lib/signals/](../../brief.md#scope) names "Inputs: Candle[] arrays from CB-2.2's wrapper" — that's a CB-4.2 caller-side concern (the cron handler extracts close prices); this Engineer DRI Decision documents the caller-vs-callee split.
  - **Area (required, tag):** architecture / extraction-readiness / type-discipline
  - **Alternatives considered (required):** signals consume `Candle[]` from CB-2 directly (rejected — couples to Coinbase shape; defeats extraction-readiness); define an abstract `lib/signals/types.ts:Candle` type that adapters map to (rejected — over-engineered for MVP; the only field signals need is `close`; pass primitives); signals consume a callback to extract close (rejected — pure-function shape is cleaner; let the caller do the map)
  - **Reversibility:** trivial — if a future story needs more candle fields (high/low for stochastic, volume for VWMA, etc.), introduce the abstract Candle type then

### Risks

- [2026-06-09] [PM] **TA-Lib reference value mismatch — Wilder's RSI implementation has variants (Cutler-RSI vs Wilder-RSI; rolling-window vs full-history smoothing)**
  - **Likelihood (required):** medium (TradingView's "Standard" RSI is widely cited but exact-formula references vary slightly; reference libraries like talib-node, ta-lib-python, etc. each have subtle differences)
  - **Impact (required):** medium (golden-value tests would fail if Engineer picks a slightly different smoothing formula than the reference test fixtures use; would surface as a test-fixture-vs-implementation mismatch, not a production bug)
  - **Mitigation (required):** Engineer DRI Decision #1 explicitly pins "TradingView Standard RSI" as the reference; first commit includes a JSDoc comment with the exact formula + a citation to Welles Wilder's 1978 textbook. Test fixtures use that specific formula's expected outputs. Cross-check against TradingView's live RSI(14) output on BTC-USD for a known historical date to spot-verify.
  - **Area (required, tag):** test-discipline / external-reference-drift

- [2026-06-09] [PM] **Off-by-one in last-N bars extraction** — `closes.slice(-period)` vs `closes.slice(closes.length - period)` vs `closes.slice(0, period)` — easy to ship the wrong window
  - **Likelihood (required):** low-to-medium (one-line bug; reviewable; TypeScript helps via array methods)
  - **Impact (required):** medium-high (MA computed over wrong window → bot's MA signal wrong → bot trades on wrong signal in LIVE_MODE)
  - **Mitigation (required):** AC 9 includes the explicit "only the last `period` bars are used" test case (`[1, 2, 3, 4, 5, 6, 7]`, MA(3) → 6.0, NOT mean of all 7). That test fails fast on off-by-one. Codex review will also flag.
  - **Area (required, tag):** correctness / off-by-one

### Issues

_None at story creation. Engineer adds as discovered during /build._

## Tests

_Engineer writes unit tests co-located with code at `tests/lib/signals/*.test.ts`. Expected count: ~30 unit tests + 2 architectural invariant tests (AC 7 no-coupling transitive walk + AC 8 no-LIVE_MODE sibling) = ~32 total new tests. Test suite goes ~554 → ~585+._

_No integration tests in this story — no live Coinbase, no DB, no env._

## PRs

_Auto-populated as PRs open._

---

_Story closed: <pending>, brief link: docs/bets/CB-4/brief.md, retro precedent: docs/retros/2026-06-09-cb-3-production-only-defects-retro.md (production-only-defect lessons watched-for though no UI surface in this story)_

---
id: CB-4
type: feature
status: proposed
portfolio_stub: true
parent: FOUNDATION-PRODUCT
depends_on: [CB-2, CB-3]
parallel_with: []
created: 2026-05-31
author: PM
estimate:
  duration_weeks: 3
  confidence: low
  refined_by: stub
  refined_at: 2026-05-31
  estimated_start: 2026-06-29
  estimated_end: 2026-07-19
---

# CB-4 — DCA bot runtime (cron tick → signal eval → decision → dry-run/live order)

**One-line hypothesis (traced to product.md):** If a Vercel cron `*/15 * * * *` invocation reads the active strategy (CB-3), fetches latest prices via the Coinbase client (CB-2), evaluates RSI/MA signals deterministically in `lib/signals/` + `lib/decisions/`, writes the decision + reason to `bot_ticks` (with append-only audit), and conditionally places a real-money order only when `LIVE_MODE=true` — then the **"try it with paper money, once comfortable move to real money"** clause of the MVP definition is satisfied and the **bot tick reliability fitness function (≥ 99% of scheduled ticks)** in [architecture.md § Fitness Functions](../../foundation/architecture.md#fitness-functions) is being measured.

## Status: portfolio stub

Full brief content filled when promoted via `/create-brief CB-4`.

## Quick scope sketch

- Pure-function signal calculators (`lib/signals/`): RSI(period, candles); MA(period, candles)
- Pure-function decision evaluators (`lib/decisions/`): given strategy + signals, emit `buy | sell | hold` + reason
- Tick handler (`app/api/cron/tick/route.ts`): authenticate via `CRON_SECRET`, load active strategy, evaluate against all selected cryptos, write `bot_ticks` + `signals` rows, place order via Coinbase client gated by `LIVE_MODE` env
- Tick uniqueness: `UNIQUE (session_id, tick_started_at)` constraint per [architecture.md DRI Risk: cron overlap](../../foundation/architecture.md) — rejects double-fires at DB layer
- **Take-profit exits** included per [product.md § In scope](../../foundation/product.md#in-scope): RSI > 65 + ≥ 1.5% profit → sell 50%; RSI > 75 + ≥ 2.5% profit → sell 80% — configurable via CB-3
- Dry-run vs live mode behavior: in dry-run, log the decision + intended order to `bot_ticks.reason` but never call Coinbase order endpoint; in live, place the order and persist the Coinbase order ID

## Cross-cutting requirement

This bet implements the core safety primitive (dry-run-first) per [product.md DRI Decision](../../foundation/product.md): dry-run is the default; live requires explicit `LIVE_MODE=true` env flip. The bet must enforce this at the order-placement gate, with zero code paths that bypass it.

## E2E test expectation (forward-reference, captured 2026-06-08)

**CB-4 is mostly server-side** (Vercel cron → signal eval → decision → conditional order placement); the cron handler has no UI surface and is exercised via unit + integration tests (against the real Coinbase wrapper from CB-2, with `LIVE_MODE=false` for safety). Most CB-4 stories will likely have `e2e: false` similar to CB-2.

**Exception (e2e MAY be needed):** if CB-4 ships any operator-facing surface — e.g., a "force-tick" button that triggers an immediate evaluation outside the cron cadence, or an inline "current decision preview" inside the dashboard — those surfaces engage Playwright per CB-3's pattern. Otherwise CB-4 inherits CB-2's "no UI; e2e false" posture.

**`LIVE_MODE` gate has NO UI** — it's an env-var flip per the foundational product decision. E2E is not the verification mechanism for the safety primitive; integration tests with mocked `LIVE_MODE=true` + real-Coinbase-rejection of dry-run paths are. CB-2.4 already proved the wrapper places real orders unconditionally; CB-4's job is to layer the gate on top.

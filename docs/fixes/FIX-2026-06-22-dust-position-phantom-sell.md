---
id: FIX-2026-06-22-dust-position
type: fix
status: in-review
severity: high
bet: CB-6
reported: 2026-06-22
reporter: operator
area: [decisions, cockpit, money-path]
---

# Fix — dust position drives a phantom SELL (live)

## Symptom (operator-reported, live)

Cockpit Signals showed `NEXT ACTION: SELL · "sell: rsi=71.48 > exit_threshold=70 AND profit=3.09% >= min_profit=1.00%; sell 90% of position at ETH-USD"` — but **there was nothing to sell**. Post-`LIVE_MODE`-flip, the bot attempted real sells at 13:45 + 14:00 UTC, both **failed** (qty `0.000000009` ETH ≈ $0.000016 — below Coinbase's minimum order size).

## Root cause

The decision engine reads the **real Coinbase account position** (`aggregatePosition(getAccountTradeHistory().fills)`), and `evaluate()` treated **any** `quantity > 0` as an open position ([evaluate.ts](../../lib/decisions/evaluate.ts)). A **dust** residual (~`1e-8` ETH) therefore satisfied "position open" → with RSI overbought + a computed profit, the exit rule fired → "sell 90% of position" → an order below Coinbase's minimum notional → **failed every tick** (a stuck loop, plus a Telegram alert each time). No money moved (the sells were rejected), but the behavior + the cockpit "Next Action" were wrong.

## Fix

1. **Dust floor (logic).** `evaluate()` now treats a position **worth < `MIN_SELLABLE_POSITION_USD` ($1)** as **flat**: never sold (it's not exitable — Coinbase rejects sub-minimum orders) and **eligible to buy** (a real dip rebuilds a position). The floor only applies when `lastClose` is finite (a non-finite price still routes to `evaluateExit` for its NaN/zero-cost-basis audit reasons). The no-position reason is dust-aware for audit honesty.
2. **Next Action (cockpit) — DB-only.** The Signals card derives the badge from the **persisted** signal alone (decision + the engine's reason; **no Coinbase re-read**): a `hold` for an **open** position → `HOLDING` (reason verbatim); a `hold` while **flat** (no position / dust / no buy signal) → **`WAITING TO BUY · Enters when RSI < <entry> (currently <rsi>, <zone>)`**; `buy`/`sell` render verbatim. Open-vs-flat is detected via the engine's `isOpenPositionHold(reason)`. Because the engine's dust floor (step 1) already *decides* a dust position as a flat hold, the persisted decision is the source of truth — the display never overrides it.
   - **Codex BLOCKER (round 1) — reverted:** the first attempt derived `hasRealPosition` from `loadCockpitPosition()`, which degrades to `null` on a Coinbase error → a transient account-fetch failure would rewrite a real SELL/HOLD into WAITING TO BUY, violating CB-6.3's DB-only contract + diverging from the engine's own non-finite-price guard. Replaced with the DB-only derivation above.
   - Tradeoff: a **stale** pre-fix dust `sell` row shows `SELL` until the next tick overwrites it with the corrected hold (the DB-only contract — the card reflects the latest persisted decision). Resume the bot after deploy → one tick clears it.

3. **Artifacts (Codex BLOCKER round 1).** Amended the approved CB-6.3 copy/design/story for the new labels (`HOLDING` / `WAITING TO BUY`) + this DRI, so the UX change is approved + traceable.

The dust threshold (`MIN_SELLABLE_POSITION_USD`) + `isOpenPositionHold` are exported from `evaluate.ts` and shared by the cockpit so the engine + the display agree.

## Tests

- `evaluate.test.ts` (+3): dust + overbought + profit → **hold, not sell** (reason names dust); real position (≥ $1) + overbought + profit → **sell** (no regression); dust + oversold → **buy** (flat ⇒ eligible to enter).
- `signals-card.test.ts` (+4, DB-only): flat dust-hold → `WAITING TO BUY` + condition + live RSI; no-buy-signal hold → `WAITING TO BUY`; open-position hold → `HOLDING` (reason verbatim); `sell` → `SELL` verbatim.
- Gates: typecheck / lint / test / build green.

## Notes / follow-ups

- `$1` is a conservative floor (DCA position sizes ≫ $1); the exact per-product Coinbase minimum isn't threaded into the pure engine by design. A narrow band ($1–~$1.11 where 90% < $1) could still fail a single sell, but the nano-dust loop — the reported bug — is robustly fixed.
- Operator paused the bot during triage; safe to resume once this merges + deploys (a fresh tick then writes a `hold`/`WAITING TO BUY` signal).

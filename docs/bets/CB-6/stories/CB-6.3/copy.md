# CB-6.3 — Copy (verbatim)

_UX Writer artifact. VERBATIM (refusal rule #5). Anchored to `ETH_USD Bot — Coinbase.pdf` (SIGNALS / NEXT ACTION block). Decision wording matches the bot's `decision` values; the `reason` string is rendered verbatim from the signal._

## Signals card
- Section label: `SIGNALS`
- RSI zone row label: `RSI ZONE`
- RSI zone words (derived from the strategy's own thresholds): `Oversold` · `Neutral` · `Overbought`
- Price-vs-MA row label: `PRICE vs MA<period>` — `<period>` is the strategy's `entry_rules.maPeriod` (e.g. `PRICE vs MA20`).
- Price-vs-MA words: `Above` · `Below` · `At`
- Next-action label: `NEXT ACTION`
- **Next-action badge — AMENDED 2026-06-22** (dust phantom-sell fix; operator-approved, see [FIX-2026-06-22](../../../fixes/FIX-2026-06-22-dust-position-phantom-sell.md)). Derived from the **persisted** decision + reason (DB-only; no Coinbase):
  - `BUY` (decision = buy) · `SELL` (decision = sell) — `reason` rendered **verbatim** below.
  - `HOLDING` (a `hold` for an **open** position) — `reason` rendered **verbatim**.
  - `WAITING TO BUY` (a `hold` while **flat** — no position / dust / no buy signal) — shown with the forward-looking detail **`Enters when RSI < <entryThreshold> (currently <rsi>, <zone>)`** instead of the raw hold reason.
  - _Was: a single `BUY · SELL · HOLD` badge + the reason verbatim. That surfaced confusing exit/sell wording when flat — incl. a dust position rendering "sell 90% of position" with nothing to sell. The raw `reason` is still available verbatim in `/dashboard/trace`._

## Number formatting
- RSI: 1 decimal (e.g. `42.1`).
- Price / MA: `$` + thousands separators + 2 decimals (matches Current Position / Profit-Loss), e.g. `$1,792.39`.
- Relation glyph between price and MA: `>` (above) · `<` (below) · `=` (at).

## Empty / degraded states
- No signal yet for the viewed pair: `No signals yet — the bot hasn't evaluated this pair yet.`
- RSI unavailable (insufficient bars): RSI ZONE value shows the em dash `—` (no zone word).
- MA unavailable (insufficient bars): PRICE vs MA value shows the em dash `—` (no relation word); the `MA<period>` label still shows.

## Notes for the build
- The zone is **strategy-relative**: `Oversold` = `rsi ≤ entry_rules.rsiThreshold`; `Overbought` = `rsi ≥ exit_rules.rsiThreshold`; else `Neutral`. Do NOT hardcode 30/70.
- Only the **one** MA the bot uses (`entry_rules.maPeriod`) is shown — see the story's single-MA decision. No MA50 unless the strategy's period is 50.
- `NEXT ACTION` is the bot's most recent decision for the pair (what it would do next given current signals); the bot adds no new strategy here — CB-6 displays only.

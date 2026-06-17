# CB-6.3 — Copy (verbatim)

_UX Writer artifact. VERBATIM (refusal rule #5). Anchored to `ETH_USD Bot — Coinbase.pdf` (SIGNALS / NEXT ACTION block). Decision wording matches the bot's `decision` values; the `reason` string is rendered verbatim from the signal._

## Signals card
- Section label: `SIGNALS`
- RSI zone row label: `RSI ZONE`
- RSI zone words (derived from the strategy's own thresholds): `Oversold` · `Neutral` · `Overbought`
- Price-vs-MA row label: `PRICE vs MA<period>` — `<period>` is the strategy's `entry_rules.maPeriod` (e.g. `PRICE vs MA20`).
- Price-vs-MA words: `Above` · `Below` · `At`
- Next-action label: `NEXT ACTION`
- Decision words: `BUY` · `SELL` · `HOLD`
- Reason: render the signal's `reason` string **verbatim** (it already reads operator-facing, e.g. `hold: rsi=42.10 < entry_threshold=30 BUT price=1792.39 >= ma20=1740.10 ...`). Do not paraphrase or reformat.

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

# CB-6.1 — Copy (verbatim)

_UX Writer artifact. VERBATIM (refusal rule #5). Anchored to `ETH_USD Bot — Coinbase.pdf`._

## Title + selector
- Per-pair title pattern: `<PAIR> Trading Bot` — e.g., `ETH/USD Trading Bot`. (Render the pair with a slash: `ETH-USD` → `ETH/USD`.)
- Selector label: `Pair`

## Current Position card
- Section label: `CURRENT POSITION`
- Holding cell heading: `<BASE> HELD` — e.g., `ETH HELD` (base symbol = the part before `-`, uppercased).
- Avg cost line: `Avg cost: $<amount>` (2-dp, thousands-separated).
- Live price cell heading: `LIVE PRICE`
- RSI line: `RSI: <n>` (integer; `RSI: —` when no recent signal).

## Degraded / empty states
- No position in the viewed pair: `No position yet`
- Live price unavailable (Coinbase read failed): `Live price unavailable`
- No active strategy / no selected assets: `No active session. Save a strategy to start the bot.` (reuse — consistent with Bot Status) + the strategy link `Create or revise your DCA strategy`.

## Notes for the build
- Quantity: show the held base quantity as returned (e.g., `0.069004 ETH`) — do not round away precision.
- Price + avg cost: USD, `$` prefix, 2 decimals, thousands separators (e.g., `$2,173.78`), matching the live-state holdings format.
- The pair shown in the title/selector is the operator's `selected_assets` identifier; default to the first when `?pair` is absent or not in the set.

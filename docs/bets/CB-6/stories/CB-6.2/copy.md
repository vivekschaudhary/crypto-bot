# CB-6.2 — Copy (verbatim)

_UX Writer artifact. VERBATIM (refusal rule #5). Anchored to `ETH_USD Bot — Coinbase.pdf` (PROFIT / LOSS card). Signed-PnL formatting matches CB-5.2's ledger PnL panel._

## Profit / Loss card
- Section label: `PROFIT / LOSS`
- Invested cell heading: `TOTAL INVESTED`
- Buys line: `<n> buys this session` — singular `1 buy this session`; zero `0 buys this session`.
- Current value cell heading: `CURRENT VALUE`
- P&L line (when available): `P&L: <±value> (<±pct>) · Realized: <±value>`

## Signed value formatting (reuse CB-5.2 PnlPanel)
- Gain: `+$1,234.56` · Loss: `−$1,234.56` (the `−` is the minus glyph U+2212, NOT a hyphen — matches CB-5.2 `−$1.00`) · zero: `$0.00`.
- Percent: `+22.85%` / `−22.85%` (2 dp).
- Not-applicable (flat / no position / degraded value): em dash `—`.

## Degraded / empty states
- Coinbase read failed → the CURRENT VALUE cell shows: `P&L unavailable` (TOTAL INVESTED + buys still render — DB-only session read).
- No active session → reuse the cockpit "no session" treatment: `No active session. Save a strategy to start the bot.` + `Create or revise your DCA strategy`.

## Notes for the build
- TOTAL INVESTED + buys are **this session** (current `bot_session`, viewed pair). CURRENT VALUE + P&L + Realized reflect the **real position** for the pair (all-time via Coinbase fills) — see the story's scoping decision. Do not relabel realized as "this session".
- USD format: `$` + thousands separators + 2 decimals (matches Current Position / live-state).

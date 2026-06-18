# CB-6.6 — Copy (verbatim)

_UX Writer artifact. VERBATIM (refusal rule #5). Anchored to `ETH_USD Bot — Coinbase.pdf` (MANUAL OVERRIDES). Real-money surface — confirm wording is mode-aware (paper while dark, REAL post-flip)._

## Manual Overrides card
- Section label: `MANUAL OVERRIDES`
- Paper-mode line (only while `LIVE_MODE=false`): `Paper mode — orders are simulated (dry-run).`
- Buttons:
  - Buy: `Buy $<n>` — `<n>` is the strategy's `position_size_usd` (e.g. `Buy $50`).
  - `Sell 50%`
  - `Sell All`
  - `Reset Session`

## Confirm prompts (mode-aware)
- Buy, while dark: `Simulate a $<n> buy of <pair>?` · post-flip: `Place a REAL $<n> buy of <pair>?`
- Sell 50%, while dark: `Simulate selling 50% of your <pair> position?` · post-flip: `Sell 50% of your REAL <pair> position?`
- Sell All, while dark: `Simulate selling your entire <pair> position?` · post-flip: `Sell your ENTIRE REAL <pair> position?`
- Confirm button: `Confirm` · Cancel button: `Cancel`
- (`<pair>` is the viewed pair shown as `ETH/USD`.)
- Reset Session keeps the existing CB-5.3 reset confirm copy.

## Feedback
- Working: `Placing…`
- Success: `Order recorded — see the trade log.`
- Rejected — session cap reached (buy): `Session cap reached — can't buy.`
- Rejected — no position (sell): `No position to sell.`
- Error (auth / rate-limit / network): `Override failed — try again.`

## Notes for the build
- Overrides act on the **viewed pair**; Reset Session is session-wide.
- While `LIVE_MODE=false` every override records a `dry_run` order (paper) — no real money, and it does NOT count toward the session caps. Post-flip, a Buy records a real (`submitted`) order and DOES count toward + is blocked by the per-session caps (bot + manual combined).
- Do NOT place a zero-size order: Sell 50% / Sell All with no held position → `No position to sell.`

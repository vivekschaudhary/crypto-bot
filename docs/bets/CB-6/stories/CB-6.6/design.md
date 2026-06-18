# CB-6.6 — Design (Manual Overrides — real-money)

_Designer artifact. Layout reference: `ETH_USD Bot — Coinbase.pdf` (the MANUAL OVERRIDES row). Fills cockpit **section 5 (Manual Overrides)** for the viewed pair. Reuses the CB-5.3 override-controls confirm-before-submit pattern. Real-money path — **paper while `LIVE_MODE=false`**. Copy VERBATIM (refusal rule #5)._

## Section 5 — Manual Overrides (per the PDF)

```
│  MANUAL OVERRIDES                                         │
│  Paper mode — orders are simulated (dry-run).            │   ← while LIVE_MODE=false
│  [ Buy $50 ]  [ Sell 50% ]  [ Sell All ]  [ Reset Session ]│
│                                                           │
│  Place a REAL $50 buy of ETH/USD?  [ Confirm ]  [ Cancel ]│   ← confirm step
└───────────────────────────────────────────────────────────┘
```

- **Four controls** for the viewed pair: **Buy $<position_size_usd>** (the strategy's per-buy size — dynamic label) · **Sell 50%** (half the held position) · **Sell All** (the whole position) · **Reset Session** (the existing CB-5.3 reset, surfaced here).
- **Confirm-before-submit** (reuse `override-controls-client.tsx`'s reset confirm): clicking Buy/Sell 50%/Sell All shows a confirm prompt + **Confirm**/**Cancel** before anything is sent. Reset keeps its existing confirm. The prompt wording is **mode-aware**: while dark → "Simulate a …"; post-flip (`LIVE_MODE=true`) → "Place a REAL …".
- **Mode indicator:** while `LIVE_MODE=false`, a line states orders are simulated (dry-run). Post-flip this line is absent (the confirm's "REAL" wording carries the warning). The operator always knows whether a click moves real money.
- On success → `router.refresh()` so the new order shows in the **Trade Log** (6.4) + the **Profit/Loss** / **Current Position** cards update.

## States
- **Buy** → confirm → working ("Placing…") → success ("Order recorded — see the trade log.") / rejected / error.
- **Sell 50% / Sell All** → confirm → same outcomes; **no held position** → rejected ("No position to sell.") (no zero order placed).
- **Buy rejected by caps** (post-flip, session real-money cap reached) → "Session cap reached — can't buy." (the per-session caps are a hard ceiling, bot + manual combined — resolved decision).
- **No active session / no viewed pair** → the controls are unavailable (the cockpit's no-session treatment; Reset already handles no-session via its 409).
- **Rate-limited / auth / network error** → "Override failed — try again."

## Accessibility
- Real-money actions are **two-step** (confirm) — no single-click real order. Keyboard-operable `<button>`s; feedback is text (not color/spinner only); the confirm prompt names the pair + dollar amount + (post-flip) "REAL".

## Out of scope (design)
- Editing the buy size inline (it's the strategy's `position_size_usd`; change it in the strategy form). Partial-percent sells other than 50% / 100%. Equity overrides (CB-7). The `LIVE_MODE` flip itself (operator ceremony).

# CB-6.2 — Design (Profit/Loss card)

_Designer artifact. Layout reference: `ETH_USD Bot — Coinbase.pdf` (the PROFIT / LOSS card). Builds cockpit **section 2 (Profit/Loss)** for the viewed pair (CB-6.1's selector). Inline styles per CB-5/CB-6.x; signed-PnL formatting reuses the CB-5.2 ledger PnL panel's approach. SSR per load._

## Section 2 — Profit / Loss (two cells, per the PDF)

```
│  PROFIT / LOSS                                             │
│   TOTAL INVESTED            CURRENT VALUE                  │
│   $150.00                   $123.68                       │
│   4 buys this session       P&L: −$34.27 (−22.85%) · Realized: −$7.95   │
```

- **TOTAL INVESTED cell:** `TOTAL INVESTED` + the session-scoped invested USD for the viewed pair + "<n> buys this session".
- **CURRENT VALUE cell:** `CURRENT VALUE` + (held qty × live price) + a P&L line: `P&L: <±unrealized> (<±pct>) · Realized: <±realized>`.
- **Signed + colored** (reuse CB-5.2 `PnlPanel`): gains green (`+$`), losses red (`−$`); zero/flat neutral. The `−` is the minus glyph used in CB-5.2 (`−$1.00`), not a hyphen.
- **% base:** unrealized % is relative to the **held position's cost basis** (avg cost × qty) — the standard "your position is up/down X%". (UX Writer/Designer confirm the denominator; documented as a story detail.)

## Scoping (the resolved modeling call — surfaced in the card)
- **Invested + buys** = **this session** (current `bot_session`, viewed pair, bot buys) — matches the "this session" label.
- **Current value + unrealized + realized + avg cost** = the **real (all-time) position** for the pair via `computeAssetPnl` over Coinbase fills (fills are NOT tagged with our `session_id`, so position P&L can't be session-scoped — it's the honest actual P&L). The card does not imply realized is session-only.

## Degraded / empty states (don't blank the cockpit)
- **No active session** → the card shows the "no session" treatment (consistent with Bot Status / Current Position) — no invested/P&L.
- **Coinbase read fails** (fills/price) → "P&L unavailable" for the CURRENT VALUE cell (CB-5.2 `loadPnl` precedent: degrade on Coinbase READ failure only). TOTAL INVESTED (DB-only, session orders) still renders.
- **No buys this session** → "0 buys this session" + invested $0.00.
- **Flat / no position** → current value $0.00, unrealized em dash ("—").

## Accessibility
- Values are text (signed numbers); color is reinforcement, not the sole signal (the `+`/`−` sign carries meaning).

## Out of scope (design)
- Signals card (CB-6.3); Trade Log (CB-6.4); Run-now; real-money overrides. Per-pair selector + Current Position already shipped (CB-6.1). A session-scoped realized figure (not feasible — fills aren't session-tagged).

# CB-6.7 — Design (paper-aware cockpit P&L + position)

_Designer artifact. No layout change — the Profit/Loss (CB-6.2) + Current Position (CB-6.1) cards keep their shape. CB-6.7 fixes the **data source** so the numbers are internally consistent in both modes, for ALL viewed crypto pairs. Copy VERBATIM (refusal rule #5)._

## The bug (what the operator sees)

`TOTAL INVESTED $400` (from the `orders` ledger, which counts `dry_run` paper buys) next to `CURRENT VALUE $0.00` (from the operator's REAL Coinbase fills — paper buys never executed → real qty 0). The card compares **paper invested** against a **real position** → a misleading "−100%".

## The fix — mode-switched position source (paper while dark, real post-flip)

Both cockpit read cards derive the **position** by mode (`env().LIVE_MODE`), for the viewed pair:

```
LIVE_MODE = false (dark)  → PAPER position from the dry_run orders ledger
LIVE_MODE = true  (flip)  → REAL position from Coinbase fills  (today's behavior)
```

- **Paper position (dark):** synthesize fill-shaped rows from this session's `dry_run` orders for the pair — `side`, `size = orders.base_quantity` (new column), `price = amount / base_quantity`, `trade_time = created_at` — and feed the SAME `computeAssetPnl` used today. Result: paper qty / avg cost / value (= paper qty × live price) / unrealized + realized P&L. Now `TOTAL INVESTED` ($, session orders) ↔ `CURRENT VALUE` (paper qty × price) ↔ P&L are all the same paper position → consistent.
- **Real position (post-flip):** unchanged — `computeAssetPnl` over real Coinbase fills.
- Applies to **both** the Profit/Loss card AND the Current Position card (qty + avg cost), so the whole "hold / worth / made" block is consistent — for **every** selected crypto pair (the per-pair view).

## Paper indicator
While dark, the Profit/Loss + Current Position cards show a small **`Paper`** marker (consistent with the Manual Overrides card's "Paper mode" line) so the operator always knows the figures are simulated, not real holdings.

## States
- **Dark, with dry_run buys** → paper position + value + P&L (the operator's paper-testing view).
- **Dark, no dry_run buys** → $0 / no position (correct).
- **Post-flip** → real position (today's behavior), `Paper` marker absent.
- **Coinbase degraded (post-flip)** → the existing "P&L unavailable" / "—" degrade (unchanged).

## Forward-only caveat (operator-acknowledged)
Existing `dry_run` orders have no stored `base_quantity` (the column is new) → they're **excluded** from the paper position (NULL qty). The operator's current 4 dry_run buys won't retro-populate; a **Reset Session** clears them and fresh buys show the paper P&L.

## Out of scope (design)
- Changing real-mode behavior. A historical paper-vs-real toggle. Equity (CB-7).

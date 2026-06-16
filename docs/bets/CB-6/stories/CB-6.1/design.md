# CB-6.1 — Design (per-pair selector + Current Position card)

_Designer artifact. Layout reference: `ETH_USD Bot — Coinbase.pdf` (the CURRENT POSITION card + the per-pair title). Builds cockpit **section 3 (Current Position)** + introduces **pair selection** (the cockpit becomes a per-pair VIEW of the multi-asset bot — resolved brief decision). Inline styles per the CB-5/CB-6.0 convention. SSR per load (brief PM Decision #2 — no polling)._

## Per-pair selector + title

```
   DCA + SIGNAL EXIT · COINBASE
   ETH/USD Trading Bot            ◀ per-pair title (was generic "Crypto Trading Bot" in CB-6.0)
   Pair: [ ETH-USD ▾ ]           ◀ selector — the operator's strategy.selected_assets
```

- The cockpit now shows **one pair at a time**. A **pair selector** sits under the title, listing the active strategy's `selected_assets` (e.g., BTC-USD, ETH-USD, …). Selecting a pair sets the viewed pair via a **`?pair=<id>` query param** (SSR re-render — the page reads `searchParams.pair`, loads that pair's data server-side). Default = the first selected asset (or `?pair` if valid).
- The **title becomes per-pair**: `<PAIR> Trading Bot` (e.g., "ETH/USD Trading Bot"), replacing CB-6.0's generic "Crypto Trading Bot".
- Selector is a real control (a `<select>` that navigates, or links) — keyboard-operable; the current pair is conveyed by text.
- **No active strategy / no selected assets** → no selector; the Current Position card shows the "no session / save a strategy" treatment (consistent with Bot Status).

## Section 3 — Current Position (the build target)

Two sub-cells, matching the PDF:

```
│  CURRENT POSITION                                          │
│   ETH HELD                    LIVE PRICE                   │
│   0.069004 ETH                $1,792.39                    │
│   Avg cost: $2,173.78         RSI: 50                      │
```

- **Holding cell:** `<base> HELD` (e.g., "ETH HELD") + quantity + "Avg cost: $<avg>". Source: `aggregatePosition` over the pair's Coinbase fills (reuse CB-5.0 `loadHoldings` logic). No position → "No position yet" (muted).
- **Live price cell:** `LIVE PRICE` + current price (Coinbase `getProduct(pair).price`) + "RSI: <n>" (the latest tick's signal RSI for this pair, from `bot_ticks ⋈ signals` — CB-5.1 data). Price unavailable (Coinbase read fail) → "Live price unavailable" (degrade the cell, not the page). No recent signal → "RSI: —".
- **Degraded states (don't blank the cockpit):** Coinbase failure degrades only the affected cell (CB-5.0 best-effort precedent); the rest of the cockpit (Bot Status, placeholders) renders.

## Scope (this story)
- Built: pair selector + per-pair title + Current Position card (section 3).
- Unchanged placeholders: Profit/Loss (section 2 — CB-6.2), Signals/Manual Overrides/Trade Log.
- Bot Status (section 1, CB-6.0) is unchanged but is **session-level** (not per-pair); the selector scopes only the per-pair read panels (Current Position now; P&L/Signals/Trade-Log later).

## Accessibility
- Selector keyboard-operable + labelled; values are text (qty/price/RSI), not color-coded.
- Degraded-cell messages are text (no color-only signalling).

## Out of scope (design)
- Profit/Loss + session-scoped invested/buys (CB-6.2). Signals card content (CB-6.x). Trade Log (CB-6.x). Run-now (later). Real-money overrides (last). A persisted "last viewed pair" preference (query-param only for now).

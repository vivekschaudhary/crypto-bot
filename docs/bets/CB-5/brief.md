---
id: CB-5
type: feature
status: proposed
portfolio_stub: true
parent: FOUNDATION-PRODUCT
depends_on: [CB-1, CB-4]
parallel_with: []
created: 2026-05-31
author: PM
estimate:
  duration_weeks: 3
  confidence: low
  refined_by: stub
  refined_at: 2026-05-31
  estimated_start: 2026-07-20
  estimated_end: 2026-08-09
---

# CB-5 — Transaction ledger + bot dashboard + override buttons

**One-line hypothesis (traced to product.md):** If the dashboard surfaces real-time bot state (status, balances, average cost, total invested, buy count, session start) + the full append-only `bot_ticks` + `orders` + `trade_fills` history with the **reason for every action**, plus operator controls for pause/resume/force-buy/sell-N/reset-session, then the **"log all transactions"** clause of the MVP definition is satisfied and the **"full decision-trace observability"** in-scope item in [product.md § In scope](../../foundation/product.md#in-scope) is delivered.

## Status: portfolio stub

Full brief content filled when promoted via `/create-brief CB-5`.

## Quick scope sketch

- Dashboard views (Server Components):
  - **Live state:** active session status, ETH/BTC/etc. held, average cost, total invested, buy count, session start time
  - **Decision-trace log:** chronological `bot_ticks` rows with RSI/MA at decision time, decision, reason, dry-run badge
  - **Transaction history:** `orders` + `trade_fills` joined, with manual vs bot source separation
  - **Live-mode banner:** dashboard prominently surfaces `LIVE_MODE` state so operator always knows
- Override buttons (Client Component → `/api/bot/*` routes):
  - **Pause / Resume** — flip session status; bot ticks log decision but emit no orders
  - **Force buy / Sell 50% / Sell all** — emit immediate orders gated by `LIVE_MODE`; persisted to `override_events`
  - **Reset session** — end current `bot_sessions` row, start a new one; ledger preserved (per [product.md DRI Decision: "Reset clears the session ledger, not the exchange"](../../foundation/product.md))

## Out of MVP (per portfolio)

Auto-pause on drawdown and reserve floor enforcement are deliberately deferred per [portfolio.md § Deliberately out of MVP](../../foundation/portfolio.md). Operator self-monitors during dry-run phase.

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

## E2E test expectation (forward-reference, captured 2026-06-08)

**CB-5 ships the dashboard** — the largest UI surface of MVP. Every story that touches a rendered view MUST include at least one Playwright spec covering the operator's golden path through that view. Specific high-value e2e candidates per the Quick scope sketch above:

- **Live state view**: load dashboard → assert balances + average cost + buy count render from real `bot_sessions` + `auth_*` data (Server Component data flow)
- **Decision-trace log**: load dashboard → click a `bot_ticks` row → assert reason + signals render with the dry-run badge visible
- **Override buttons**: pause/resume/force-buy/sell-N/reset-session — golden path per button (assert UI confirmation → API call → state update)
- **LIVE_MODE banner**: assert banner visibly reflects current env state (load with `LIVE_MODE=false` and `LIVE_MODE=true`, verify the banner color/text matches)

**CB-1.6's lesson applies in full force here.** Static mocks of `@simplewebauthn/browser@11` masked real bugs that only surfaced under Playwright. CB-5's React + Server Component + Client Component data hand-offs are exactly the kind of seam where mocks-only tests give false confidence — e2e is load-bearing for the dashboard's correctness.

Story-level Standard Experience Checklist categories (Navigation / States / Feedback / Accessibility / Edge cases / Cross-surface consistency) should NOT all be `n/a` — most are load-bearing for the dashboard's user-facing nature. Operator-confirmed pattern (2026-06-08): CB-2.x deliberately marked `e2e: false` because it's pure library code; the discipline re-engages here.

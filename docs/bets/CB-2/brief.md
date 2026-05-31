---
id: CB-2
type: feature
status: proposed
portfolio_stub: true
parent: FOUNDATION-PRODUCT
depends_on: []
parallel_with: [CB-1]
created: 2026-05-31
author: PM
estimate:
  duration_weeks: 2
  confidence: low
  refined_by: stub
  refined_at: 2026-05-31
  estimated_start: 2026-06-01
  estimated_end: 2026-06-14
---

# CB-2 — Coinbase data integration + top-5 crypto discovery

**One-line hypothesis (traced to product.md):** If we wrap Coinbase Advanced Trade API (CDP JWT auth) in a typed `lib/coinbase/` client and surface the operator's top-5 traded cryptos as a selectable set, then every downstream bet (strategy authoring, bot runtime, dashboard, manual trading) has a single source of truth for Coinbase reads + the operator's selection of which cryptos the strategy operates on — implementing the **"review coinbase data to highlight the top 5 traded cryptos and use these cryptos"** clause of [the MVP definition in portfolio.md](../../foundation/portfolio.md) and the **"top-5 cryptocurrencies"** in-scope item in [product.md § In scope](../../foundation/product.md#in-scope).

## Status: portfolio stub

Full brief content filled when promoted via `/create-brief CB-2`.

## Quick scope sketch

- Wrap Coinbase Advanced Trade REST endpoints in `lib/coinbase/` using a maintained TS SDK (per [architecture.md DRI Issue #1](../../foundation/architecture.md), final SDK pick at promotion time; current lean is `tiagosiebler/coinbase-api`)
- Endpoints: account balances, account trade history, product prices, place order (gated by `LIVE_MODE`), cancel order
- Read account trade history → compute top-5 most-traded cryptos by recent volume; persist operator's selection
- Server-side rate-limit-aware caching (well under [arch-research.md §2.2](../../foundation/architecture-research.md#2-benchmarks) ceilings)

## Open question (resolve at promotion)

**"Top-5 traded"** = (a) operator's personal trading volume on Coinbase, or (b) Coinbase's global top-5 by 24h volume? Default lean: (a) — uses the operator's actual portfolio activity to pick the most relevant cryptos. To confirm during `/create-brief CB-2`.

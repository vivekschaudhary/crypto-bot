---
id: CB-5.2
bet: CB-5
type: story
status: ready
priority: P0
created: 2026-06-14
author: PM
design_link: docs/bets/CB-5/stories/CB-5.2/design.md
copy_link: docs/bets/CB-5/stories/CB-5.2/copy.md
area_tags: [dashboard, ledger, orders, pnl, cost-basis, server-components, e2e, accessibility]
dependencies:
  - CB-5 brief approved 2026-06-14 (PM DRI Decision #7 — per-execution paper/live status lives here)
  - CB-5.0 shipped (lib/dashboard/ read model + LiveModeBanner + shell + e2e/helpers + invariants)
  - CB-4.3 shipped (orders ledger writable; lib/ticks/cost-basis:aggregatePosition; CB-2 getProduct/getAccountTradeHistory)
estimate:
  effort: medium
  confidence: medium
e2e: true
---

# CB-5.2 — Transaction ledger + per-asset PnL

## Description

The third CB-5 view: the **transaction ledger** — `orders` rows (dry_run + live), manual-vs-bot source, status — **plus per-asset PnL** (realized + unrealized). This is where brief PM DRI Decision #7's relocated **per-execution paper/live status** lives (`orders.status`), and where **Researcher Q1 closes: PnL IS in MVP scope** (operator decision at story creation 2026-06-14). The "log all transactions" product clause, made visible — with profit/loss so the operator can judge whether the dry-run strategy is actually working before the `LIVE_MODE` flip.

Reuses the CB-5.0 foundation (`lib/dashboard/` read model, `LiveModeBanner`, shell, `e2e/helpers`, dir-scoped invariants). The new weight is the **PnL math** — which is correctness-sensitive on a money surface, so it's a pure, exhaustively-unit-tested function + an explicit accuracy caveat.

## Acceptance Criteria

- [ ] **AC 1 — PnL pure function** (`lib/dashboard/pnl.ts` or an extension of `lib/ticks/cost-basis.ts` — Engineer DRI #1): `computeAssetPnl(fills, currentPrice): { quantity, avgCostUsd, realizedPnlUsd, unrealizedPnlUsd }` using **weighted-average** cost basis (CONSISTENT with `aggregatePosition` — same fill-replay semantics, NOT FIFO). Realized PnL accrues on each SELL: `(sellPrice − avgCostAtSale) × sellQty`; unrealized = `(currentPrice − avgCostUsd) × quantity` (null when `currentPrice` is null or quantity is 0). Pure; chronological replay; malformed fills throw loud (CB-4.3 cost-basis precedent). Reuses/extends the existing replay rather than duplicating it (Engineer DRI).

- [ ] **AC 2 — Read model `lib/dashboard/ledger.ts`** (server-only, SELECT-only): `loadLedger(limit?=50)` → `{ orders: LedgerRow[], pnl: AssetPnl[] | null, hasMore }`:
  - `LedgerRow = { id, assetIdentifier, source: 'manual'|'bot', side: 'buy'|'sell', amount, status, createdAt }` — latest `limit` `orders` by `created_at DESC`; `hasMore` via limit+1 (CB-5.1 precedent).
  - `AssetPnl = { assetIdentifier, quantity, avgCostUsd, currentPrice: number|null, realizedPnlUsd, unrealizedPnlUsd: number|null }` — per active-strategy selected asset: `aggregatePosition`/PnL over `getAccountTradeHistory` fills + `getProduct(id).price` for the current price.
  - `pnl: null` when the Coinbase reads fail (degrade the PnL panel; the orders table still renders — AC 6).

- [ ] **AC 3 — Ledger view at `/dashboard/ledger`** (Server Component; **`force-dynamic`** — SSR per load, the CB-5.1 lesson: a DB-reading dashboard route must be dynamic or Next prerenders a build-time read; auth via proxy): `LiveModeBanner` + chrome + nav. Renders (a) the **per-asset PnL summary** (quantity, avg cost, current price, realized PnL, unrealized PnL — gains/losses sign-and-color coded but ALWAYS text/number-labeled, never color-only) and (b) the **transaction table** (time, asset, source manual-vs-bot, side, amount, **status** — the paper/live indicator: `dry_run`/`submitted`/`failed`). Copy verbatim from [copy.md](copy.md).

- [ ] **AC 4 — Per-execution paper/live status shown** (executes brief PM DRI Decision #7): each order row shows its `orders.status` (`dry_run` = paper, `submitted`/etc. = live, `failed`). This is the per-execution mode indicator relocated from the decision-trace. A `dry_run`-vs-live visual distinction (text-labeled).

- [ ] **AC 5 — Manual-vs-bot source separation** (product.md "manual orders logged separately from bot orders"): the `source` column distinguishes `manual` from `bot`; design.md may group or tag. (Today all orders are `source='bot'`; the column is load-bearing for when manual logging arrives.)

- [ ] **AC 6 — Graceful degradation**: a Coinbase failure (getProduct / getAccountTradeHistory) degrades the **PnL panel only** (`pnl: null` → "PnL unavailable…"); the orders table (pure DB read) renders regardless. (CB-5.0 holdings-degradation precedent.)

- [ ] **AC 7 — PnL accuracy caveat surfaced**: the PnL panel carries a caption that the figures derive from recent Coinbase fills (the CB-4.3 cost-basis pagination window can under-count a very long history) + current price at page load. Honest labeling on a money surface (copy.md). Inherited known limitation, not a defect.

- [ ] **AC 8 — Empty + edge states**: no orders → "No transactions yet."; no holdings → PnL panel shows no open positions; zero quantity → unrealized null/"—"; null current price (fetch failed) → unrealized "—" but realized + position still show. Copy from copy.md.

- [ ] **AC 9 — Navigation**: `/dashboard` ↔ `/dashboard/ledger` (+ the trace ↔ ledger cross-links as design.md lays out). "View transaction ledger →" added to live-state.

- [ ] **AC 10 — Bounded read + note** (CB-5.1 precedent): default `limit=50` recent orders; "more exist" note when truncated; pagination deferred.

- [ ] **AC 11 — READ-ONLY + no-orders-PLACEMENT invariants**: `/dashboard/ledger` + `lib/dashboard/ledger.ts`/`pnl.ts` are SELECT-only (no mutation verbs / mutating-helper imports) and the route graph never reaches `lib/coinbase/orders` (placement) — auto-covered by the dir-scoped `tests/lib/dashboard/invariants.test.ts`. NOTE: reading `orders` (the table) is fine; the ban is on `lib/coinbase/orders` (placement) + on writes.

- [ ] **AC 12 — Tests**: unit (`tests/lib/dashboard/pnl.test.ts` — realized/unrealized math: buys-only, partial sell realizes gain, full exit, null current price → null unrealized, zero qty, malformed throw; `tests/lib/dashboard/ledger.test.ts` — orders ordering/limit/hasMore, pnl degrade on Coinbase failure) + e2e (`e2e/dashboard/ledger.spec.ts` — seed orders (dry_run + a submitted) → assert table rows + status + the bounded/empty paths; PnL panel render with mocked-or-real holdings). + page-render test for the PnL/orders/empty/degraded render (CB-5.1 trace.test.ts precedent — assert rendered output, not just the read model).

- [ ] **AC 13 — Gates**: typecheck/lint/test/build clean; `/dashboard/ledger` builds as `ƒ` (dynamic); e2e CI/on-demand.

## Standard Experience Checklist

UI view — mostly load-bearing.
- [ ] **Navigation** — `covered by AC 9: live-state ↔ ledger ↔ trace cross-links.`
- [ ] **States** — `covered by AC 6 + AC 8: PnL degrade, empty orders, no holdings, null price, bounded.`
- [ ] **Feedback** — `covered: PnL (realized/unrealized) + per-order status are the operator's "is the strategy working / was this paper or real" feedback.`
- [ ] **Accessibility** — `covered by design.md: gains/losses + status are sign/number/text-labeled, not color-only; semantic table; WCAG AA contrast.`
- [ ] **Edge cases** — `covered by AC 6/7/8/10: Coinbase failure, pagination caveat, null price, zero qty, bounded read.`
- [ ] **Cross-surface consistency** — `covered: reuses LiveModeBanner + chrome + inline styles; force-dynamic per CB-5.1; PnL uses the same weighted-average basis as aggregatePosition (live-state holdings).`

## Tech notes

### Engineer DRI Decisions
1. **PnL fn placement** — extend the `aggregatePosition` replay to also yield realized PnL, OR a sibling `lib/dashboard/pnl.ts` that reuses a shared replay core; do NOT duplicate the fill-replay loop. Weighted-average, consistent with the position math the live-state already shows.
2. **Current price source** — `getProduct(id).price` (ProductSchema `price` field); per selected asset on SSR load (bounded, operator-only). Fallback: latest candle close if `price` absent (Engineer DRI).
3. **`force-dynamic`** on `/dashboard/ledger` (CB-5.1 lesson).
4. **Bounded `limit=50`** + "more exist" note; pagination deferred.

### Patterns to mirror
- CB-5.0/5.1: `lib/dashboard/*` read fns + recording-mock tests; `LiveModeBanner`; page-render tests (`tests/app/dashboard/trace.test.ts`); `e2e/helpers.ts`; `force-dynamic`; dir-scoped invariants. `aggregatePosition` (`lib/ticks/cost-basis.ts`); `getProduct` (`lib/coinbase/market.ts`).

### What this story does NOT include
- Override controls (CB-5.3); real-money overrides (CB-5.4).
- `trade_fills` join (CB-4 deferred; ledger shows `orders`).
- Full pagination (deferred); historical PnL charts / time-series (post-MVP); retrofitting unrealized PnL onto the live-state view (optional fast-follow — CB-5.2 owns the PnL surface; live-state keeps avg-cost holdings).

## DRI Log

### Decisions
- [2026-06-14] [PM] **Researcher Q1 CLOSED — per-asset PnL (realized + unrealized) IS in MVP scope** (operator decision at CB-5.2 story creation)
  - **Rationale (required):** the operator chose to include PnL now (over history-only) — seeing profit/loss directly is the most decision-relevant signal for the `LIVE_MODE` flip ("is the strategy actually making money on paper?"). PnL is computed with the same weighted-average cost basis the live-state holdings already use (consistency) + current price at load.
  - **Area (required, tag):** scope / observability / pnl
  - **Alternatives considered (required):** history + holdings only (the brief's lean — rejected by the operator; PnL deferral would leave the core "is it working?" question to manual arithmetic); FIFO cost basis (rejected — inconsistent with `aggregatePosition`'s weighted-average; would show different numbers than live-state holdings)
  - **Reversibility:** moderate — PnL is additive; could be hidden if it proves noisy, but the operator wants it
- [2026-06-14] [PM] **Per-execution paper/live status renders here** (executes brief PM DRI Decision #7) — each order row shows `orders.status` (dry_run/submitted/failed); the per-execution mode indicator relocated from the decision-trace lives in the ledger where `orders` data is.
  - **Area:** read-model-separation / observability
  - **Reversibility:** trivial

### Risks
- [2026-06-14] [PM] **PnL accuracy under the cost-basis pagination window** — **Likelihood:** medium (CB-4.3 reads a bounded fill page; long history under-counts realized + basis) · **Impact:** medium (wrong PnL erodes trust right at the flip decision) · **Mitigation:** AC 7 honest caveat caption; pure-fn unit tests pin the math; weighted-average consistent with holdings so the two agree; pagination is a known inherited limit (CB-4.3 Risk #3) · **Area:** data-accuracy
- [2026-06-14] [PM] **Current-price fetch failure / latency** (N getProduct calls on SSR load) — **Likelihood:** medium · **Impact:** low-medium (unrealized PnL unavailable) · **Mitigation:** AC 6 degrade — null currentPrice → unrealized "—"; realized + position + orders table still render · **Area:** reliability
- [2026-06-14] [PM] **Realized-PnL semantics surprise** (weighted-average vs the operator's mental FIFO model) — **Likelihood:** low-medium · **Impact:** low (display interpretation) · **Mitigation:** weighted-average matches the holdings avg-cost the operator already sees; AC 7 caption notes the basis; documented · **Area:** ux/correctness

### Issues
_None at story creation._

## Tests
_Unit: `tests/lib/dashboard/pnl.test.ts` + `ledger.test.ts`. Page-render: `tests/app/dashboard/ledger.test.ts`. e2e: `e2e/dashboard/ledger.spec.ts`. Invariants: dir-scoped existing test._

## PRs
_Auto-populated._

---
_Story closed: <pending>, brief: docs/bets/CB-5/brief.md_

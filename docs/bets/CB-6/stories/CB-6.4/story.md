---
id: CB-6.4
bet: CB-6
type: story
status: shipped
priority: P1
created: 2026-06-17
author: PM
design_link: docs/bets/CB-6/stories/CB-6.4/design.md
copy_link: docs/bets/CB-6/stories/CB-6.4/copy.md
area_tags: [frontend, dashboard, multi-asset, cockpit, trade-log]
dependencies:
  - CB-6.1 shipped (per-pair selector; resolveViewedPair)
  - CB-5.2 orders ledger (loadLedger SELECT + table formatting) + CB-5.1 decision-trace (signals⋈bot_ticks, reasons verbatim) — reused
e2e: true
---

# CB-6.4 — Cockpit Trade Log table (FIFTH CB-6 STORY)

## Description

Fills cockpit **section 6 (Trade Log)** for the viewed pair: one chronological, newest-first table merging the **orders ledger** (actual trades) with **decision-trace skips** (hold ticks that placed no order, with reasons), plus a **status filter**. Columns: `Time · Side · USD · Reason · Status` (Price/Qty deferred — see AC 5). Pure read recomposition of CB-5.1 + CB-5.2 — **DB-only, no Coinbase, no new backend, no migration, no write-path change.**

## Acceptance Criteria

- [ ] **AC 1 — Trade Log table (section 6).** Per the viewed pair, a newest-first table with columns `Time · Side · USD · Reason · Status`. **TRADE rows** (from `orders`): `Side` buy/sell, `USD` = `amount`, `Status` = raw order status (`dry_run`/`submitted`/`failed`), `Reason` `—`. **SKIP rows** (from `signals⋈bot_ticks` where `decision='hold'`): `Side` `—`, `USD` `—`, `Reason` = `signals.reason` verbatim, `Status` `SKIPPED`. `failed` red (reuse ledger `LOSS`), reinforced by text. Copy + headers verbatim ([copy.md](copy.md)).
- [ ] **AC 2 — Read fn** `lib/dashboard/cockpit-trade-log.ts` `loadCockpitTradeLog(pair, status, limit?)` → `{ rows: TradeLogRow[], hasMore }`. `TradeLogRow` = a `trade`|`skip` union `{ id, kind, time, side, usd, status, reason }`. Merges the two streams (orders + hold signals) for the pair, **non-overlapping** by the atomic write contract (`insertTickWithDecisions`: each buy/sell → one order; each hold → none), sorted by time DESC. **SELECT-only, DB-only** (no Coinbase → no scoped try/catch).
- [ ] **AC 3 — Status filter.** A labelled control (default `All statuses`) filtering by `All statuses · Dry run · Submitted · Failed · Skipped` via `?txStatus=` (SSR, mirroring CB-6.1's pair selector). `skipped` → hold rows only; an order status → orders with that status only; `all` → both merged. The filter scopes the SQL **before** the latest-N limit (correct "latest N after filter"). Copy verbatim.
- [ ] **AC 4 — Scoping (resolved).** All-time recent per pair (latest N, newest-first) — **NOT session-scoped** (matches the decision-trace/Signals philosophy; section 2 already carries "this run"). Includes all orders for the pair (bot today; future CB-6.6 manual overrides appear automatically — no `source` filter).
- [ ] **AC 5 — Price/Qty deferred (resolved 2026-06-17, operator).** `orders` stores only USD `amount`; real price+qty live in `trade_fills`, populated **only for live fills**. Dark-mode `dry_run` orders have no fill → Price/Qty have no honest value. CB-6.4 ships `Time·Side·USD·Reason·Status`; **Price·Qty (from `trade_fills`) is a post-LIVE_MODE-flip follow-up**. Documented, not a silent omission.
- [ ] **AC 6 — Empty states.** No activity for the pair → `No activity yet for this pair.`; a filter matching nothing → `No matching activity for this pair.`. Copy verbatim.
- [ ] **AC 7 — Read-only invariant holds.** `cockpit-trade-log.ts` is SELECT-only; imports no mutating helpers; never reaches `lib/coinbase/orders` (reaches no Coinbase). The dashboard read-only invariant test stays green.
- [ ] **AC 8 — No regression.** Bot Status (6.0) / Current Position (6.1) / Profit-Loss (6.2) / Signals (6.3) / CB-5 surfaces unchanged; `/dashboard` stays dynamic (`ƒ`). The `TRADE LOG` placeholder is replaced; the `View transaction ledger →` link is retained.
- [ ] **AC 9 — Tests.** Unit `loadCockpitTradeLog`: trades+skips merged newest-first; `skipped`→holds only; an order status→orders only; `all`→both; empty→`[]`; `hasMore`. Component: table render (trade row side+USD+status; skip row `SKIPPED`+reason verbatim; `—` cells; `failed` color; both empty states); status-filter control render. (Render tests use single-string template literals — the CB-6.1 split-text-node lesson.) e2e (Codex): seeded orders+holds → trade + `SKIPPED` rows; filter to `Skipped` hides trades; filter to a status shows only those.
- [ ] **AC 10 — Gates.** typecheck / lint / test / build clean; e2e via the test DB.

## Standard Experience Checklist

UI story — load-bearing.
- [ ] **Navigation** — `covered by AC 3: the status filter navigates via ?txStatus= (SSR). The pair selector shipped in CB-6.1.`
- [ ] **States** — `covered by AC 1/6: trades; skips; no-activity; filtered-empty.`
- [ ] **Feedback** — `covered by AC 1/3: status (incl. SKIPPED) + verbatim skip reasons + the filter; failed rows colored (reinforced by text). Read-only.`
- [ ] **Accessibility** — `covered by AC 1/3: status is text (failed red is reinforcement only); the filter is a labelled <select>; the table has a header row.`
- [ ] **Edge cases** — `covered by AC 6 + the filter: hold-row flooding (every 15-min hold is a SKIP) is mitigated by filtering out "Skipped"; latest-N bounds the table; filter-matches-nothing handled.`
- [ ] **Cross-surface consistency** — `covered by AC 1/4: same statuses as /dashboard/ledger + same reasons (verbatim) as /dashboard/trace — the cockpit never contradicts them.`

## Tech notes

### Reuse (DB-only — no new backend, no migration, no Coinbase)
- `lib/dashboard/ledger.ts:loadLedger` — the `orders` SELECT pattern (`amount::float8`, status, `created_at`); `LedgerRow` shape; `app/dashboard/ledger/page.tsx` `fmtTs`/`fmtUsd` + the `failed`→`LOSS` red.
- `lib/dashboard/decision-trace.ts` — the `signals⋈bot_ticks` query + `Decision` type; reasons rendered verbatim.
- `lib/dashboard/cockpit-signals.ts` / `cockpit-position.ts` — per-pair `asset_identifier = ${pair}` scoping.
- `app/dashboard/pair-selector-client.tsx` — the **template for the status-filter client `<select>`** (URL param + SSR).
- `app/dashboard/cockpit-section.tsx` scaffold.

### Engineer DRI (confirm at build)
- Two SQL streams, each `LIMIT N+1`: orders for the pair (optionally `WHERE status = ?`) + hold signals for the pair. `status='skipped'` → holds only; an order status → orders only; `all` → both, merged + sorted time DESC + sliced to N. In `all` mode, `hasMore` is approximate (two N-limited streams merged then sliced) — acceptable for a single-operator recent view; the ledger/trace links remain for full history.
- `TradeLogRow` union: `trade` (time=`orders.created_at`) | `skip` (time=`bot_ticks.tick_started_at`); both ≈ tick time.
- The status filter is a `'use client'` `<select>` navigating `?txStatus=` (mirror `PairSelector`); the table itself is a presentational server component.

### What this story does NOT include
- `Price · Qty` columns (post-flip — resolved). Run-now (CB-6.5); real-money manual overrides (CB-6.6 — their order rows will appear here once they exist). Buy/sell per-row reasons (skips-only — resolved; no `orders.tick_id` migration). No write-path change.

## PRs
_Auto-populated._

## Tests
_Unit/component co-located; e2e by Codex in `e2e/dashboard/` (test DB; issue #80 may gate local e2e)._

## DRI Log

### Decisions
- [2026-06-17] [Operator/PM] **Price/Qty deferred to post-LIVE_MODE-flip.** Dark-mode `dry_run` orders have no real fill (price/qty live in `trade_fills`, live-only), so the columns would be empty/dishonest now. Ship `Time·Side·USD·Reason·Status`; add Price·Qty from `trade_fills` when live. — area: scope — alternatives: show now with `—` (rejected — empty columns); derive from `last_close` (rejected — not the real execution price) — reversibility: easy (additive columns later).
- [2026-06-17] [Operator/PM] **Reason on SKIP rows only — no `orders.tick_id` migration.** `orders` has no reason and no decision link; skips carry the operator-critical "why it didn't trade". Buy/sell reasons already live in the Signals card + `/dashboard/trace`. Avoids a write-path migration on a display story. — area: scope/data-model — alternatives: add `orders.tick_id` + set it in `insertTickWithDecisions` (rejected for now — touches the bot write path; old orders get NULL) — reversibility: medium.
- [2026-06-17] [PM] **All-time recent per pair, NOT session-scoped** (differs from CB-6.2). A trade log is a recent-activity view; section 2 already frames "this run". Matches the decision-trace + Signals card. — area: ux — reversibility: easy.
- [2026-06-17] [Engineer] **Two-stream merge** (`orders` + hold `signals`), non-overlapping by the atomic write contract (buy/sell⟺order, hold⟺skip). The status filter scopes the stream(s) in SQL **before** the limit; the filter control is a `'use client'` `<select>` navigating `?txStatus=` (mirrors `PairSelector`). — area: read-model/ui — reversibility: easy.
- [2026-06-17] [Engineer] **Built (confirms the above).** `loadCockpitTradeLog(pair, status, limit)` runs the orders stream when `status≠'skipped'` (SQL `AND (${status}='all' OR status=${status})`) + the hold-signals stream when `status∈{all,skipped}`, merges + sorts time DESC + slices `limit` (`hasMore`). `parseTradeLogStatus` (pure, exported) guards `?txStatus=`. `TradeLogStatusFilter` ('use client') navigates `?pair=&txStatus=` preserving the pair (changing the pair via `PairSelector` resets the filter — acceptable). `TradeLogCard` presentational: Time·Side·USD·Reason·Status, `—` for N/A cells, `failed`→`LOSS` red (reused from the ledger), skip reason verbatim. Page renders the card when `viewedPair && tradeLog`, else the placeholder (both keep the ledger link). Gates: typecheck/lint clean; 843 tests; `/dashboard` stays `ƒ` Dynamic; read-only invariant green. — area: ui/read-model — reversibility: easy.

### Risks
- [2026-06-17] [Engineer] **Hold-row flooding** — every 15-min hold tick is a SKIP row, so the log is mostly skips — likelihood: high — impact: low — mitigation: the status filter (filter out `Skipped` → only trades); latest-N bounds the table — area: ux.
- [2026-06-17] [Engineer] **`all`-mode `hasMore` is approximate** (two N-limited streams merged then sliced) — likelihood: high — impact: low (single operator; `View transaction ledger →` + the trace remain for full history) — mitigation: documented; per-stream filters are exact — area: correctness.
- [2026-06-17] [Engineer] **Render-test split-text trap** (CB-6.1 lesson) — adjacent JSX text nodes aren't contiguous in `JSON.stringify` — mitigation: assert single-string template literals — area: testing.
- [2026-06-17] [PM] **Trade rows show no reason** (skips-only) could read as "missing" — likelihood: low — impact: low — mitigation: copy/design note + the reason is in the Signals card / trace; revisit with `orders.tick_id` if the operator wants per-trade reasons — area: ux.

### Issues
_None at story creation._

---
_Story closed: 2026-06-17 (SHIPPED via PR #94; Codex-clean code + Codex e2e committed & CI-typechecked — local e2e EXECUTION deferred under issue #80 / Docker test-DB availability, as for CB-6.0–6.3), brief: docs/bets/CB-6/brief.md. **FIFTH CB-6 STORY — Trade Log; orders⋈skips merge, status filter. Read-only, no migration.**_

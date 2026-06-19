---
id: CB-6.7
bet: CB-6
type: story
status: ready
priority: P1
created: 2026-06-18
author: PM
design_link: docs/bets/CB-6/stories/CB-6.7/design.md
copy_link: docs/bets/CB-6/stories/CB-6.7/copy.md
area_tags: [frontend, backend, dashboard, cockpit, pnl, paper-trading, migration]
dependencies:
  - CB-6.2 Profit/Loss card + CB-6.1 Current Position (read-models reworked here)
  - CB-4.3 buildLimitOrder (baseQuantity) + lib/dashboard/pnl computeAssetPnl/replayFills — reused
e2e: true
security_review: standard
---

# CB-6.7 — Paper-aware cockpit P&L + Current Position (POST-SHIP FIX)

## Description

Fixes a money-display inconsistency the operator hit on the live cockpit: `TOTAL INVESTED` ($, from the `orders` ledger — which counts `dry_run` paper buys) is shown against `CURRENT VALUE` (real Coinbase position → qty 0 while dark), reading as a misleading "−100%". CB-6.7 makes the Profit/Loss (CB-6.2) **and** Current Position (CB-6.1) cards **mode-switched**: a consistent **paper** position while dark (`LIVE_MODE=false`), the **real** position post-flip — for **all** viewed crypto pairs. Adds a `base_quantity` column so the paper position is reconstructable from the dry_run ledger. Reuses the existing `computeAssetPnl` math (synthesizes paper fills); no new P&L logic.

## Acceptance Criteria

- [ ] **AC 1 — Mode-switched position source.** For the viewed pair, the cockpit derives the position by `env().LIVE_MODE`: `false` → **paper** position from this session's `dry_run` orders; `true` → **real** position from Coinbase fills (today's behaviour, unchanged). Applies to BOTH `loadCockpitPnl` (CB-6.2) and `loadCockpitPosition` (CB-6.1).
- [ ] **AC 2 — Migration `0008`** adds `orders.base_quantity numeric` (nullable; additive — INSERT-only ledger preserved). No backfill (existing rows stay NULL).
- [ ] **AC 3 — Write-path stores qty.** `insertTickWithDecisions` (bot) and `insertManualOrder` (manual) persist `buildLimitOrder`'s `baseQuantity` into `orders.base_quantity` (thread it through `OrderRowInsert` + the manual-order arg; `buildLimitOrder` already returns it). Dry_run + live both store it.
- [ ] **AC 4 — Paper position via reused math.** While dark, synthesize fill-shaped rows from the session's `dry_run` orders for the pair (`side`; `size = base_quantity`; `price = amount / base_quantity`; `trade_time = created_at`; rows with NULL `base_quantity` skipped) and feed the SAME `computeAssetPnl` (`replayFills`) used for real fills → paper qty / avgCost / realized / unrealized. `currentValue = paper_qty × live price`. No duplicate P&L logic.
- [ ] **AC 5 — Consistency.** While dark with dry_run buys: `TOTAL INVESTED` ($, session orders) ↔ `CURRENT VALUE` (paper_qty × price) ↔ P&L all reflect the SAME paper position (no more $400 / $0). Current Position shows the paper qty + avg cost. No dry_run buys → $0 / no position.
- [ ] **AC 6 — Paper marker.** While `LIVE_MODE=false`, the Profit/Loss + Current Position cards show a `Paper` marker (copy.md). Absent post-flip.
- [ ] **AC 7 — Real mode unchanged.** With `LIVE_MODE=true`, both cards use real Coinbase fills exactly as today (incl. the CB-5.2 scoped-try/catch degrade — "P&L unavailable" / "—"). No behaviour change post-flip.
- [ ] **AC 8 — Read-only invariant holds.** `cockpit-pnl.ts` / `cockpit-position.ts` stay SELECT + (real-mode) Coinbase-read only; no mutating-helper imports; never reach `lib/coinbase/orders`. The dashboard read-only invariant test stays green. (The `base_quantity` WRITE lives in the bot/override write path, not the dashboard.)
- [ ] **AC 9 — No regression.** Bot Status / Signals / Trade Log / CB-5 surfaces unchanged; the cron tick + manual-order placement behave as before (they just also persist `base_quantity`); `/dashboard` stays dynamic; the cap aggregation + caps unchanged.
- [ ] **AC 10 — Forward-only (acknowledged).** Existing dry_run orders (NULL `base_quantity`) are excluded from the paper position; a `Reset Session` clears them so fresh buys show paper P&L. Documented in the card design + here.
- [ ] **AC 11 — Tests.** Unit: paper P&L/position from a seeded dry_run ledger (qty/value/unrealized; sells reduce qty); NULL-base_quantity rows skipped; real-mode unchanged (LIVE_MODE=true → Coinbase-fills path); the migration + write-path store base_quantity. Component: the `Paper` marker shows only while dark. e2e (Codex): a dry_run Buy via Run Now/override → the P&L + Current Position cards show a consistent paper position (not $X / $0).
- [ ] **AC 12 — Gates.** typecheck / lint / test / build clean; e2e via the test DB. Codex review (Security glance — it touches the order write path, though the LIVE_MODE gate + placement are unchanged).

## Standard Experience Checklist

UI + read-model story.
- [ ] **Navigation** — `n/a — the pair selector (CB-6.1) sets the pair; this changes the cards' data source.`
- [ ] **States** — `covered by AC 5/6/7: dark+dry_run (paper); dark+no-buys ($0); post-flip (real); degraded (unchanged).`
- [ ] **Feedback** — `covered by AC 6: the Paper marker tells the operator the figures are simulated while dark.`
- [ ] **Accessibility** — `the Paper marker is text, not color-only; cards otherwise unchanged (CB-6.1/6.2 a11y holds).`
- [ ] **Edge cases** — `covered by AC 4/10: NULL base_quantity rows skipped; existing orders forward-only (Reset clears); paper sells reduce qty.`
- [ ] **Cross-surface consistency** — `covered by AC 1: both cards (P&L + Position) use the same mode-switched source → no internal contradiction; applies to every selected pair.`

## Tech notes

### Reuse (no new P&L math)
- `lib/dashboard/pnl.ts:computeAssetPnl` + `lib/ticks/cost-basis.ts:replayFills` — fed synthesized paper fills (AC 4).
- `lib/ticks/orders.ts:buildLimitOrder` — already returns `baseQuantity`; thread into the order inserts.
- `lib/dashboard/cockpit-pnl.ts` (CB-6.2) + `cockpit-position.ts` (CB-6.1) — the read-models to mode-switch.
- `@/lib/coinbase/account-schemas:Fill` — the shape to synthesize (minimal fields `replayFills` reads: side, size, price, trade_time).

### Engineer DRI (confirm at build)
- Synthesize paper fills from `SELECT side, amount::float8, base_quantity::float8, created_at FROM orders WHERE session_id = <current> AND asset_identifier = pair AND source IN ('bot','manual') AND status = 'dry_run' AND base_quantity IS NOT NULL`. `price = amount / base_quantity` (skip if base_quantity 0/NULL). Order by created_at for the weighted-average replay.
- Mode switch: read `env().LIVE_MODE` in the read-model; dark → paper-fill path; live → existing real-fill path. Keep the two paths behind one well-named branch.
- `Paper` marker: pass `liveMode` (already loaded at the page) to the cards.

### What this story does NOT include
- Changing real-mode (post-flip) behaviour. Backfilling existing dry_run orders (forward-only; Reset clears). A paper/real history toggle. Equity (CB-7). The other "few errors" the operator mentioned (triaged separately).

## PRs
_Auto-populated._

## Tests
_Unit/component co-located; e2e by Codex; Security glance (order write-path touch). (test DB; issue #80 may gate local e2e execution.)_

## DRI Log

### Decisions
- [2026-06-18] [Operator/PM] **Paper-aware P&L (fuller option chosen over real-only).** The cockpit is the operator's daily driver while dark (paper-testing) — they want a consistent paper P&L, not a blank card. Applies to ALL crypto pairs. — area: ux/scope — alternatives: real-only invested (exclude dry_run — rejected: blank while dark) — reversibility: medium (migration).
- [2026-06-18] [Architect/Engineer] **Mode-switched position source** (`LIVE_MODE`: dark → ledger paper, live → real Coinbase fills). Post-flip, real fills are the truth (limit orders may not fill as recorded), so the ledger drives ONLY the paper (dark) view. — area: read-model — reversibility: easy.
- [2026-06-18] [Engineer] **Reuse `computeAssetPnl` via synthesized paper fills** rather than a parallel paper-P&L implementation — one source of truth for the math. Needs `orders.base_quantity` (migration 0008) since the ledger stores USD `amount` only. — area: reuse/data-model — reversibility: medium.
- [2026-06-18] [PM] **Forward-only** — existing dry_run orders lack `base_quantity`; they're excluded (a Reset clears them). Accepted (the operator acknowledged this when choosing the fuller option). — area: scope — reversibility: n/a.

### Risks
- [2026-06-18] [Engineer] **Write-path change to the bot tick + manual orders** (persisting base_quantity) — likelihood: low — impact: medium (the order write path is load-bearing) — mitigation: additive column + the existing cron/manual-order tests pin behaviour; base_quantity comes straight from `buildLimitOrder` — area: correctness.
- [2026-06-18] [Engineer] **Two position paths (paper/real) could drift** — likelihood: low — impact: medium — mitigation: BOTH feed the same `computeAssetPnl`; only the fill SOURCE differs (synthesized vs Coinbase) — area: correctness.
- [2026-06-18] [PM] **Operator confusion if the `Paper` marker is missed** (paper figures mistaken for real) — likelihood: low — impact: medium — mitigation: AC 6 marker on both cards + the Manual Overrides paper-mode line; all gone post-flip — area: ux.

### Issues
- [2026-06-18] [Operator] **Reported on the live cockpit:** TOTAL INVESTED $400 vs CURRENT VALUE $0 (paper invested vs real position). This story resolves it. Other "few errors" mentioned by the operator are triaged separately. — severity: medium — owner: PM.

---
_Story closed: <pending>, brief: docs/bets/CB-6/brief.md. **POST-SHIP FIX — paper-aware cockpit P&L; reopens CB-6 for one follow-up story.**_

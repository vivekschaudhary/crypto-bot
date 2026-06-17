---
id: CB-6.2
bet: CB-6
type: story
status: ready
priority: P1
created: 2026-06-17
author: PM
design_link: docs/bets/CB-6/stories/CB-6.2/design.md
copy_link: docs/bets/CB-6/stories/CB-6.2/copy.md
area_tags: [frontend, dashboard, multi-asset, cockpit, pnl]
dependencies:
  - CB-6.1 shipped (per-pair selector + Current Position)
  - CB-5.2 computeAssetPnl + loadPnl scoped-try/catch pattern + PnlPanel formatting — reused
e2e: true
---

# CB-6.2 — Cockpit Profit/Loss card (THIRD CB-6 STORY)

## Description

Fills cockpit **section 2 (Profit / Loss)** for the viewed pair: session-scoped TOTAL INVESTED + buy count, alongside the real position's CURRENT VALUE + signed unrealized P&L (with %) + realized. Completes the "hold / worth / made" block with CB-6.1's Current Position. Reuses CB-5.2's `computeAssetPnl` + the `loadPnl` scoped-try/catch discipline; no new backend, no migration. **Resolves the session-vs-all-time PnL scoping** (the CB-6.1 open issue).

## Acceptance Criteria

- [ ] **AC 1 — Profit/Loss card (section 2).** For the viewed pair: `TOTAL INVESTED` ($) + "<n> buys this session"; `CURRENT VALUE` ($) + `P&L: <±unrealized> (<±pct>) · Realized: <±realized>`. Copy + signed formatting verbatim ([copy.md](copy.md)).
- [ ] **AC 2 — Read fn** `lib/dashboard/cockpit-pnl.ts` `loadCockpitPnl(pair)` → `{ invested, buys, currentValue, unrealizedPnlUsd, realizedPnlUsd, unrealizedPct }` (the four position-derived fields null when degraded). Resolves the current session id itself (`WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1` — the multi-row current-session definition).
- [ ] **AC 3 — Scoping (resolved).** Invested + buys = **session-scoped** (current session, viewed pair, bot buys, `status <> 'failed'` incl. `dry_run` — mirrors `loadSessionActivity`). Current value + unrealized + realized + avg cost = the **real all-time position** via `computeAssetPnl(fills, livePrice)` (fills aren't `session_id`-tagged). Documented; the card never labels realized as session-only.
- [ ] **AC 4 — Scoped try/catch (the PR #73 BLOCKER lesson).** Coinbase reads (`getAccountTradeHistory` + `getProduct`) in the `try` → on failure the P&L fields degrade to null; `computeAssetPnl` runs **OUTSIDE** the catch so a malformed-fill throw **propagates** (fail loud, not swallowed as "unavailable"). Mirror `lib/dashboard/ledger.ts:loadPnl`.
- [ ] **AC 5 — Degraded / empty.** No active session → the cockpit "no session" treatment (no card). Coinbase read fail → "P&L unavailable" on the CURRENT VALUE cell; TOTAL INVESTED + buys (DB-only) still render. 0 buys → "$0.00" + "0 buys this session". Flat / no position → current value "$0.00", unrealized "—". Copy verbatim.
- [ ] **AC 6 — Signed formatting.** Reuse CB-5.2 `PnlPanel` formatting (gain `+$`, loss `−$` minus-glyph, `—` when N/A); color reinforces the sign, never the sole signal.
- [ ] **AC 7 — Read-only invariant holds.** `cockpit-pnl.ts` is SELECT + Coinbase reads only; no mutating-helper imports; never reaches `lib/coinbase/orders`. The dashboard read-only invariant test stays green.
- [ ] **AC 8 — No regression.** Bot Status (6.0) / Current Position (6.1) / CB-5 surfaces unchanged; `/dashboard` stays dynamic.
- [ ] **AC 9 — Tests.** Unit `loadCockpitPnl`: happy (invested/buys + value/unrealized/realized); Coinbase read fail → P&L null, invested/buys intact; **malformed fill → throws (NOT swallowed)** (PR #73 regression); flat/no-position; 0 buys. Component: Profit/Loss card render (signed gain/loss, buys pluralization, "P&L unavailable", flat "—"). e2e (Codex): a pair with session buys shows invested + signed P&L; a degraded path.
- [ ] **AC 10 — Gates.** typecheck / lint / test / build clean; e2e via the test DB.

## Standard Experience Checklist

UI story — load-bearing.
- [ ] **Navigation** — `n/a — the pair selector (navigation) shipped in CB-6.1; this story adds a read-only card.`
- [ ] **States** — `covered by AC 1/5: invested/buys; current value + P&L; degraded ("P&L unavailable"); 0-buys; flat ("—"); no-session.`
- [ ] **Feedback** — `covered by AC 5/6: signed +$/−$ P&L communicates gain/loss; "P&L unavailable" discriminates a Coinbase-read failure from a real $0. No actions (read-only).`
- [ ] **Accessibility** — `covered by AC 6: signed numeric text carries the gain/loss meaning; color is reinforcement only.`
- [ ] **Edge cases** — `covered by AC 4/5: Coinbase read failure → degrade value cell (page intact); malformed fill → fail loud; 0 buys; flat position.`
- [ ] **Cross-surface consistency** — `n/a — single web target.`

## Tech notes

### Reuse (no new backend, no migration)
- `lib/dashboard/pnl.ts:computeAssetPnl(fills, currentPrice)` → `{ quantity, avgCostUsd, currentPrice, realizedPnlUsd, unrealizedPnlUsd }`.
- `lib/dashboard/ledger.ts:loadPnl` — the **scoped-try/catch shape to mirror** (AC 4).
- `app/dashboard/ledger/page.tsx:PnlPanel` — signed-PnL formatting (`+$`/`−$`/`—`); lift the helper or share it.
- `lib/coinbase/{accounts,market}` reads; CB-6.1's `loadCockpitPosition` already fetches fills + price for the pair — share if cheap (Engineer DRI), else an independent read mirroring it is fine.

### Engineer DRI (confirm at build)
- `currentValue = quantity × livePrice`; `unrealizedPct = unrealizedPnlUsd / (avgCostUsd × quantity)` (null when flat or degraded).
- The session-orders query mirrors `live-state.ts:loadSessionActivity` but scoped to `asset_identifier = pair`.

### What this story does NOT include
- Signals card (CB-6.3); Trade Log (CB-6.4); Run-now (CB-6.5); real-money overrides (CB-6.6). A session-scoped realized figure (infeasible — fills aren't `session_id`-tagged).

## PRs
_Auto-populated._

## Tests
_Unit/component co-located; e2e by Codex in `e2e/dashboard/` (test DB; issue #80 may gate local e2e)._

## DRI Log

### Decisions
- [2026-06-17] [PM] **PnL scoping resolved: session-scoped invested/buys; all-time position for value/unrealized/realized.** Fills aren't `session_id`-tagged, so position P&L is the real (all-time) position — the honest number; only invested/buys (from `orders`) are session-scoped. Closes the CB-6.1 open issue. — area: data-model — alternatives: all session-scoped (rejected — can't session-scope fills); all all-time (rejected — loses the "this session" framing the design shows) — reversibility: medium.
- [2026-06-17] [PM] **Reuse CB-5.2 `computeAssetPnl` + the `loadPnl` scoped-try/catch + `PnlPanel` formatting** rather than new PnL math. — area: reuse — reversibility: easy.
- [2026-06-17] [Engineer] **`loadCockpitPnl` mirrors `loadPnl`'s scoped try/catch** (Coinbase reads degrade → null; `computeAssetPnl` OUTSIDE → propagate). Current session resolved via `ended_at IS NULL` latest; session-orders query mirrors `loadSessionActivity` scoped to `asset_identifier`. `currentValue = quantity × livePrice`; `unrealizedPct = unrealized / (avgCost × qty)`; degraded = both currentValue + realized null. — area: read-model — reversibility: easy.
- [2026-06-17] [Engineer] **`ProfitLossCard` duplicates the small signed-format helpers** (`fmtSignedUsd`/`fmtSignedPct`/`pnlColor`) locally rather than refactoring `ledger/page.tsx` — keeps the slice contained; a later cleanup could lift them to a shared module. — area: ui — reversibility: easy.

### Risks
- [2026-06-17] [Engineer] **Repeating the PR #73 swallow** (catching a malformed-fill throw as "Coinbase unavailable") — likelihood: medium (the trap is structural) — impact: high (hides data-contract drift on a money surface) — mitigation: `computeAssetPnl` OUTSIDE the Coinbase try/catch (AC 4) + a unit test asserting a malformed fill PROPAGATES — area: correctness.
- [2026-06-17] [Engineer] **Duplicate Coinbase fetch for the viewed pair** — `loadCockpitPnl` AND CB-6.1's `loadCockpitPosition` each fetch `getAccountTradeHistory` + `getProduct` for the same pair → 2× the Coinbase calls per cockpit load — likelihood: high (every load) — impact: low (single-operator, on-demand; bounded by page loads, not traffic) — mitigation: accepted for now; a later refactor could merge the two reads into one shared fetch (or one `loadCockpit(pair)` returning both position + P&L) — area: cost/coinbase.
- [2026-06-17] [PM] **Mixed scoping reads as confusing** ("this session" invested next to all-time P&L) — likelihood: low — impact: low — mitigation: the "this session" label is only on invested/buys; copy keeps realized unlabelled-as-session — area: ux.

### Issues
_None at story creation._

---
_Story closed: <pending>, brief: docs/bets/CB-6/brief.md. **THIRD CB-6 STORY — Profit/Loss; resolves the session-vs-all-time scoping.**_

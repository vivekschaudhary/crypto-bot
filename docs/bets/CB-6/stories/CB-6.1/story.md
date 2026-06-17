---
id: CB-6.1
bet: CB-6
type: story
status: shipped
priority: P1
created: 2026-06-16
author: PM
design_link: docs/bets/CB-6/stories/CB-6.1/design.md
copy_link: docs/bets/CB-6/stories/CB-6.1/copy.md
area_tags: [frontend, dashboard, multi-asset, cockpit]
dependencies:
  - CB-6.0 shipped (cockpit scaffold + Bot Status + 3-tab shell)
  - CB-5.0 loadHoldings/aggregatePosition + CB-5.2 getProduct + CB-5.1 signals read — reused
e2e: true
---

# CB-6.1 — Per-pair selector + Current Position card (SECOND CB-6 STORY)

## Description

The cockpit becomes a **per-pair view** (resolved brief decision): a **pair selector** lets the operator choose one of their strategy's assets, the **title becomes per-pair** ("ETH/USD Trading Bot"), and cockpit **section 3 (Current Position)** is filled — held quantity + average cost (real Coinbase position), live price, and the latest RSI for the viewed pair. The bot still trades all selected assets unchanged; this is a per-pair *detail view*. Profit/Loss (section 2, session-scoped) is the next story (CB-6.2). All read data is reused from CB-5 (no new backend, no migration).

## Acceptance Criteria

- [ ] **AC 1 — Pair selector.** Under the title, a real (keyboard-operable) selector lists the active strategy's `selected_assets`. Selecting a pair sets `?pair=<identifier>` and the cockpit re-renders SSR for that pair. The viewed pair = `?pair` if present AND in `selected_assets`, else the first selected asset. Label "Pair" (copy verbatim).
- [ ] **AC 2 — Per-pair title.** The title renders `<PAIR> Trading Bot` (identifier slash-formatted, e.g., `ETH-USD` → "ETH/USD Trading Bot"), replacing CB-6.0's generic "Crypto Trading Bot".
- [ ] **AC 3 — Current Position card (section 3).** Two cells: (a) **`<BASE> HELD`** + held quantity + "Avg cost: $<avg>" — from `aggregatePosition` over the viewed pair's Coinbase fills (reuse CB-5.0 `loadHoldings` logic); (b) **`LIVE PRICE`** + current price (`getProduct(pair).price`) + "RSI: <n>" — RSI from the latest `bot_ticks ⋈ signals` row for the pair (CB-5.1 data). Copy + number formatting verbatim from copy.md.
- [ ] **AC 4 — Read fn.** A new `lib/dashboard/cockpit-position.ts` (`loadCockpitPosition(pair)` → `{ held, avgCostUsd, livePrice, rsi }`, all nullable) composes `aggregatePosition` + `getProduct` + a latest-signal RSI query. SELECT/Coinbase-read only. **Best-effort degrade** (CB-5.0 precedent): a Coinbase failure yields a null cell, never blanks the page.
- [ ] **AC 5 — Degraded / empty states.** No position → "No position yet"; price read fails → "Live price unavailable" (that cell only); no recent signal → "RSI: —"; no active strategy / no selected assets → no selector + "No active session. Save a strategy to start the bot." + the strategy link. Copy verbatim.
- [ ] **AC 6 — Read-only invariant holds.** The new cockpit-position read code (in `lib/dashboard/**` + `app/dashboard/**`) performs no mutations, imports no mutating helpers, and never transitively reaches `lib/coinbase/orders` (it uses `lib/coinbase/market`'s `getProduct` + `accounts` reads — both allowed, as CB-5 already does). The CB-5 dashboard read-only invariant test stays green.
- [ ] **AC 7 — No regression.** Bot Status (CB-6.0) + the CB-5 surfaces (live-state/trace/ledger) are unchanged; `/dashboard` stays dynamic (it already reads `headers()`/`loadLiveState`).
- [ ] **AC 8 — Tests.** Unit: `resolveViewedPair(searchParamPair, selectedAssets)` pure helper; `loadCockpitPosition` (position / price / rsi happy + each degraded path) via the recording-mock + mocked Coinbase pattern. Component: Current Position render (held / no-position / price-unavailable / RSI-dash). e2e (Codex): pick a pair → Current Position shows held + live price + RSI; switch pair → updates; an unavailable-price path degrades.
- [ ] **AC 9 — Gates.** typecheck / lint / test / production build clean; e2e via the test DB.

## Standard Experience Checklist

UI story — load-bearing.
- [ ] **Navigation** — `covered by AC 1: pair selector switches the viewed pair (?pair=); the cockpit is the home (no back). The 3-tab shell (CB-6.0) is unchanged.`
- [ ] **States** — `covered by AC 3/5: position present / empty; live price available / unavailable; RSI present / "—"; no-strategy.`
- [ ] **Feedback** — `covered by AC 5: degraded-cell messages discriminate (no position vs live-price-unavailable vs RSI absent). No destructive actions in this story.`
- [ ] **Accessibility** — `covered by AC 1 + design.md: selector is a real keyboard-operable, labelled control; values (qty/price/RSI) are text, not color-coded.`
- [ ] **Edge cases** — `covered by AC 1/4/5: invalid/absent ?pair → default first asset; Coinbase read failure → degrade the cell, page intact; no recent signal → RSI "—"; no selected assets → no selector.`
- [ ] **Cross-surface consistency** — `n/a — single web target.`

## Tech notes

### Reuse (no new backend, no migration)
- `lib/ticks/cost-basis.ts` `aggregatePosition` + `lib/coinbase/accounts` `getAccountTradeHistory` (held qty + avg cost — same path as CB-5.0 `loadHoldings`).
- `lib/coinbase/market` `getProduct(pair)` → `.price` (live price — same as CB-5.2 ledger PnL's current-price read).
- `lib/strategies/db` `getActiveStrategy()` → `.selected_assets` (the selector options).
- Latest RSI: a SELECT over `bot_ticks ⋈ signals` for the pair's most recent `signals.rsi` (CB-5.1 decision-trace read pattern).

### Engineer DRI (confirm at build)
- Pair-selection mechanism = `?pair=<identifier>` query param (SSR-per-load; no client polling — brief PM Decision #2). The selector is a `<select>`/links that navigates. `resolveViewedPair` is a pure exported helper (unit-tested).
- New read in `lib/dashboard/cockpit-position.ts`; the page passes the resolved pair + result into a presentational `CurrentPositionCard` (exported for render tests).

### What this story does NOT include
- Profit/Loss + session-scoped invested/buys/realized (CB-6.2 — that story owns the session-vs-all-time PnL modeling). Signals card (latest RSI/MA20/MA50 + next action). Trade Log. Run-now. Real-money overrides. A persisted last-viewed-pair preference.

## PRs
_Auto-populated._

## Tests
_Unit/component co-located; e2e by Codex in `e2e/dashboard/` (runs vs the test DB; issue #80 may gate local e2e until the Next-16 two-dev-server follow-up lands)._

## DRI Log

### Decisions
- [2026-06-16] [PM] **Slice = per-pair selector + Current Position only; Profit/Loss → CB-6.2.** The PDF's CURRENT POSITION card is self-contained + all-reusable data, and it's the natural first home for pair selection (the foundational per-pair-view piece). P&L needs new session-scoped aggregation + a session-vs-all-time modeling call → its own slice. — area: scope — reversibility: easy.
- [2026-06-16] [PM] **Pair selection via `?pair=` query param (SSR), default = first selected asset.** Fits the SSR-per-load model (no polling); server-readable; shareable. — area: ui/routing — alternatives: client-only state (rejected — loses SSR); persisted preference (deferred) — reversibility: easy.
- [2026-06-16] [PM] **Current Position = the real (all-time) Coinbase position**, not session-scoped: held qty + avg cost via `aggregatePosition`, live price via `getProduct`, RSI from the latest signal. (Session-scoping applies to P&L invested/buys in CB-6.2, not to the actual current holding.) — area: data-model — reversibility: easy.
- [2026-06-16] [Engineer] **`lib/dashboard/cockpit-position.ts`** = `loadCockpitPosition(pair)` (best-effort degrade like CB-5.0 `loadHoldings`) + the pure `resolveViewedPair`. Reuses `aggregatePosition` + `getProduct` (`.price` via `Number(...)`, mirroring CB-5.2 ledger PnL) + a latest-signal RSI SELECT (`signals ⋈ bot_ticks ORDER BY tick_started_at DESC LIMIT 1`). SELECT-only → read-only invariant holds. — area: read-model — reversibility: easy.
- [2026-06-16] [Engineer] **Pair selector = native `<select>` (`pair-selector-client.tsx`) navigating to `/dashboard?pair=`**; per-pair title via `pair.replace("-","/")`. `CurrentPositionCard` uses single-string template-literal headings (`\`${base} HELD\``) so the rendered text is contiguous (render-test-friendly). — area: ui — reversibility: easy.
- [2026-06-16] [Engineer] **`getActiveStrategy` is now called twice per cockpit load** (once inside `loadLiveState` for holdings, once directly for the selector's `selected_assets`) — accepted for single-operator/on-demand; a future refactor could thread it through. `tests/app/dashboard.test.ts` mocks the direct call → null. 811 unit tests + read-only invariant green; `/dashboard` confirmed dynamic. — area: perf/tests — reversibility: easy.

### Risks
- [2026-06-16] [PM] **getProduct adds a Coinbase call per cockpit load (per viewed pair)** — likelihood: high (every load) — impact: low (operator-only, on-demand; bounded by page loads, not traffic) — mitigation: degrade the cell on failure; single product read per render — area: cost/coinbase.
- [2026-06-16] [PM] **RSI staleness** — the "latest signal" may be from an older tick if the cron skipped (paused/no-strategy) — likelihood: medium — impact: low — mitigation: show the latest available RSI; "RSI: —" when none — area: correctness.

### Issues
- [2026-06-16] [PM] **Session-vs-all-time PnL scoping** (invested/buys "this session" vs all-time realized from fills) is a real modeling question — severity: low — owner: PM — status: resolved 2026-06-16 in CB-6.2 (invested/buys session-scoped; value/unrealized/realized = real all-time position via computeAssetPnl — see CB-6.2 DRI Decision) — area: scope.

---
_Story closed: 2026-06-17 (SHIPPED via PR #87 + Codex e2e), brief: docs/bets/CB-6/brief.md. **SECOND CB-6 STORY — per-pair view begins.**_

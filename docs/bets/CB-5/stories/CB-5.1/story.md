---
id: CB-5.1
bet: CB-5
type: story
status: ready
priority: P0
created: 2026-06-14
author: PM
design_link: docs/bets/CB-5/stories/CB-5.1/design.md
copy_link: docs/bets/CB-5/stories/CB-5.1/copy.md
area_tags: [dashboard, decision-trace, bot-ticks, signals, server-components, e2e, accessibility]
dependencies:
  - CB-5 brief approved 2026-06-14
  - CB-5.0 shipped (lib/dashboard/ read model + LiveModeBanner + dashboard shell + e2e/helpers + invariant patterns)
  - CB-4.2 shipped (bot_ticks + per-asset signals rows; migration 0005 shape)
estimate:
  effort: small
  confidence: high
e2e: true
---

# CB-5.1 — Decision-trace log view

## Description

The second CB-5 view: render the bot's **decision trace** — the chronological history of `bot_ticks` joined to their per-asset `signals`, so the operator can read *why the bot decided what it decided* at every tick, without psql. This is the observability clause's core ("full decision-trace observability", product.md) made visible: the operator-readable reason strings CB-4.1 produced render verbatim here.

Reuses the CB-5.0 foundation wholesale: the `lib/dashboard/` read-model home, the shared `LiveModeBanner`, the dashboard shell + auth-via-proxy, `e2e/helpers.ts`, and the read-only + no-orders invariant tests (which already scan `app/dashboard/**`, auto-covering the new route). So this is **small/high** — a read fn + a view + its e2e.

### Scope reality: `bot_ticks` does not record `live_mode`

Noticed at story drafting: `bot_ticks`/`signals` carry the DECISION (buy/sell/hold + reason + RSI/MA) but NOT whether the tick ran in dry-run or live mode (that's recorded per-execution in `orders.status` = `dry_run`/`submitted`). So a faithful **per-tick** dry-run badge isn't derivable from the decision-trace tables alone. PM Decision #2 resolves this: CB-5.1's page-level `LiveModeBanner` provides the mode context; per-EXECUTION dry-run/live status is the **ledger's** job (CB-5.2, which joins `orders`). The decision-trace is about DECISIONS; the ledger is about EXECUTIONS — keeping the `orders` join in one place (CB-5.2), not duplicated.

## Acceptance Criteria

- [ ] **AC 1 — Read fn `loadDecisionTrace(limit?: number)`** in `lib/dashboard/decision-trace.ts` (server-only, SELECT-only): returns the latest `limit` (default 50) `bot_ticks` by `tick_started_at DESC`, each with its per-asset `signals` rows, typed:
  - `Tick = { id, tickStartedAt: Date, decision: 'buy'|'sell'|'hold', reason: string, errorDetail: string | null, signals: SignalRow[] }`
  - `SignalRow = { assetIdentifier, decision: 'buy'|'sell'|'hold', rsi: number | null, ma: number | null, maPeriod: number | null, lastClose: number | null, reason: string }`
  - Two queries (ticks, then signals for those tick ids) or one join, Engineer DRI; signals grouped under their tick, preserving a stable per-asset order.

- [ ] **AC 2 — Decision-trace view at `/dashboard/trace`** (Server Component; SSR per load; inline styles; auth via proxy — the route is non-public so proxy.ts gates it): renders the shared `LiveModeBanner` + chrome, then a chronological (newest-first) list of ticks. Each tick shows `tick_started_at` (UTC) + the aggregate decision; under it, the per-asset signal rows (asset · decision · `rsi`/`ma` · reason). Reason strings render VERBATIM (they're already operator-readable from CB-4.1). Copy from [copy.md](copy.md).

- [ ] **AC 3 — Error ticks render**: a `bot_ticks` row with `reason='tick_error'` + `error_detail` set + no signals (CB-4.2 AC 8 error path) renders as an error row showing the (already-sanitized) `error_detail`, not a blank/crash. Copy from [copy.md](copy.md).

- [ ] **AC 4 — Insufficient-signal rows render honestly**: a signal row with `rsi=null`/`ma=null` (CB-4.0 sentinel) shows "—" (or the null-state copy), not "0" or a crash — the reason string already explains "insufficient signal data".

- [ ] **AC 5 — Navigation**: `/dashboard` (live-state) links to `/dashboard/trace` ("View decision trace →"); `/dashboard/trace` links back to `/dashboard`. Copy from [copy.md](copy.md).

- [ ] **AC 6 — Empty state**: no ticks yet → "No decisions logged yet." (copy.md), banner + chrome still render.

- [ ] **AC 7 — Bounded read + deferral noted**: default `limit=50` most-recent ticks (≈ 12.5h at 96 ticks/day); full pagination is DEFERRED (a fast-follow) and the view shows a note when more ticks exist than shown (copy.md). Prevents an unbounded render as history grows.

- [ ] **AC 8 — READ-ONLY + no-orders invariants extended**: the existing `tests/lib/dashboard/invariants.test.ts` (read-only all-mutations + no-orders-import transitive walk) already scans `app/dashboard/**` + `lib/dashboard/**` — confirm it covers the new route + read fn (it auto-does; add a smoke assertion that `lib/dashboard/decision-trace.ts` is in the scanned set if helpful). No new mutation/orders path.

- [ ] **AC 9 — e2e Playwright spec** (`e2e/dashboard/decision-trace.spec.ts`, default project): seed `bot_sessions` + `bot_ticks` + `signals` rows (incl. one error tick + one insufficient-signal row); auth; load `/dashboard/trace` → assert a tick's reason + per-asset signal rows render, the error tick shows its detail, and the empty-state path (separate case, no seed). Reuses `e2e/helpers.ts`. (Banner-both-states is already covered by CB-5.0; not re-litigated here.)

- [ ] **AC 10 — Unit tests** (`tests/lib/dashboard/decision-trace.test.ts`, recording-mock DB): ticks ordered newest-first; signals grouped under their tick; `limit` honored; error tick (no signals) handled; null rsi/ma preserved as null.

- [ ] **AC 11 — Gates**: typecheck/lint/test/build clean; e2e passes in CI/on-demand.

## Standard Experience Checklist

UI view — mostly load-bearing.

- [ ] **Navigation** — `covered by AC 5: bidirectional links between live-state and decision-trace.`
- [ ] **States** — `covered by AC 3 + AC 4 + AC 6: error ticks, insufficient-signal rows, empty state; SSR (no client loading).`
- [ ] **Feedback** — `covered: the reason strings ARE the feedback — the operator reads exactly why each decision was made. LiveModeBanner gives mode context (PM Decision #2).`
- [ ] **Accessibility** — `covered by design.md: semantic table/list structure, headers, readable contrast; reason text is plain language.`
- [ ] **Edge cases** — `covered by AC 3 + AC 4 + AC 7: error ticks, null signals, bounded read + "more exist" note.`
- [ ] **Cross-surface consistency** — `covered: reuses the CB-5.0 LiveModeBanner + chrome + inline-style conventions; same dashboard shell.`

## Tech notes

### Engineer DRI Decisions
1. **Read fn in `lib/dashboard/decision-trace.ts`** (sibling to `live-state.ts`); SELECT-only; two-query (ticks then signals) or join — Engineer's call; group signals under ticks in code.
2. **Per-tick dry-run badge NOT shown** (bot_ticks lacks `live_mode`); page-level `LiveModeBanner` gives mode context; per-execution status is CB-5.2's ledger (`orders.status`). Avoids duplicating the orders join.
3. **Bounded `limit=50`**; pagination deferred (AC 7) with a "more exist" note.
4. **New route `/dashboard/trace`** (own Server Component), reusing `LiveModeBanner` + chrome.

### Patterns to mirror
- CB-5.0: `lib/dashboard/live-state.ts` (read fn + recording-mock test), `app/dashboard/live-mode-banner.tsx`, `app/dashboard/live-state-panels.tsx`, `e2e/dashboard/live-state.spec.ts`, `e2e/helpers.ts`, `tests/lib/dashboard/invariants.test.ts`.

### What this story does NOT include
- Transaction ledger / `orders` join + per-execution dry_run/live status (CB-5.2).
- Override controls (CB-5.3); real-money overrides (CB-5.4).
- Full pagination (deferred fast-follow); per-asset PnL (Researcher Q1 → CB-5.2).
- Recording `live_mode` on `bot_ticks` (a possible future migration if per-tick mode history is wanted; not MVP).

## DRI Log

### Decisions
- [2026-06-14] [PM] **Decision-trace shows DECISIONS; per-execution dry_run/live status is the ledger's job (CB-5.2)** — `bot_ticks` doesn't record `live_mode`, so a faithful per-tick badge isn't derivable here; the page-level `LiveModeBanner` supplies mode context, and the `orders` join (with `status`) lives once in CB-5.2.
  - **Area:** scope / read-model-separation
  - **Alternatives considered:** join `orders` per buy/sell decision here (rejected — duplicates CB-5.2's ledger join across two views; the decision-trace is about *why*, the ledger about *what executed*); add `live_mode` to `bot_ticks` via migration (rejected for MVP — extra schema + backfill for a nice-to-have; the banner covers current-mode context)
  - **Reversibility:** moderate — a future `bot_ticks.live_mode` migration would enable per-tick badges without changing this view's contract

### Risks
- [2026-06-14] [PM] **Unbounded render as tick history grows** — **Likelihood:** medium (96 ticks/day × N assets) · **Impact:** medium (slow page) · **Mitigation:** AC 7 bounded `limit=50` + "more exist" note; pagination fast-follow · **Area:** performance
- [2026-06-14] [PM] **e2e seeding of bot_ticks+signals FK chain** — **Likelihood:** low · **Impact:** low · **Mitigation:** reuse `e2e/helpers.ts` reset + seed pattern; signals.tick_id → bot_ticks.id ordering in the seed · **Area:** test-discipline

### Issues
_None at story creation._

## Tests
_Unit: `tests/lib/dashboard/decision-trace.test.ts`. e2e: `e2e/dashboard/decision-trace.spec.ts`. Invariants: covered by the existing `tests/lib/dashboard/invariants.test.ts` (dir-scoped)._

## PRs
_Auto-populated._

---
_Story closed: <pending>, brief: docs/bets/CB-5/brief.md_

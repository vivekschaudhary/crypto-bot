---
id: CB-5.3
bet: CB-5
type: story
status: ready
priority: P0
created: 2026-06-14
author: PM
design_link: docs/bets/CB-5/stories/CB-5.3/design.md
copy_link: docs/bets/CB-5/stories/CB-5.3/copy.md
area_tags: [dashboard, override-controls, api-bot, bot-sessions, override-events, auth, write-surface, e2e]
dependencies:
  - CB-5 brief approved 2026-06-14
  - CB-5.0/5.1/5.2 shipped (dashboard shell + LiveModeBanner + read views + live-state activity)
  - CB-4.2 cron respects bot_sessions.status='paused'/'reset' (the consumer exists)
  - CB-1.5 sign-out route (operator-auth write-route precedent: verifySession + CSRF + typed 405)
estimate:
  effort: medium
  confidence: medium
e2e: true
---

# CB-5.3 — Safe override controls (pause / resume / reset) — LAST CB-5 STORY

## Description

The final MVP story and CB-5's **only write surface**: in-product controls to **pause**, **resume**, and **reset** the bot — writing `bot_sessions.status` + an `override_events` audit row via a new operator-authenticated `/api/bot/*` route, with buttons on the dashboard. The cron tick already honors `paused`/`reset` (CB-4.2 early-outs) — this story builds the **producer** of those state changes. When it ships, the operator's full loop is closed (author → paper-trade → review → **control**) and the MVP wedge is complete.

**SAFE controls only.** pause/resume/reset are state-only writes — zero real-money risk, no order placement. The real-money overrides (force-buy / sell-50% / sell-all) stay **deferred to CB-5.4** (post-LIVE_MODE-flip, per brief PM Decision #1) — the route rejects those kinds with 400.

## Acceptance Criteria

- [ ] **AC 1 — `/api/bot/override` route handler** (`app/api/bot/override/route.ts`): `POST { kind: 'pause' | 'resume' | 'reset' }`. Operator-authenticated **exactly like the CB-1.5 sign-out route** — rate-limit by Origin; verify Origin/Referer == APP_ORIGIN (CSRF); read the session cookie + `verifySession()` (re-verify; NEVER trust proxy `x-session-*` headers for a state mutation, CVE-2025-29927 lineage); null → 401. Typed 405 for non-POST. Body validated: `kind` outside `{pause,resume,reset}` → **400** (and `force_buy`/`sell_50`/`sell_all` explicitly 400 with a "deferred to CB-5.4" reason, even though the `override_events.kind` CHECK permits them).

- [ ] **AC 2 — pause**: `kind='pause'` → `bot_sessions.status = 'paused'` + INSERT `override_events(kind='pause')`, in ONE transaction. Idempotent-friendly: pausing an already-paused session is a no-op status-wise but still logs the event (audit of the operator action).

- [ ] **AC 3 — resume**: `kind='resume'` → `status='active'` + `override_events(kind='resume')`, one transaction.

- [ ] **AC 4 — reset** (PM Decision #1 — single-row semantics): `kind='reset'` → UPDATE the singleton `bot_sessions` row to `status='active'` + `started_at=now()` (a fresh session start) + INSERT `override_events(kind='reset')`, one transaction. **Historical `orders`/`bot_ticks`/`signals` are PRESERVED (never deleted)** — "reset clears the session, not the exchange or the audit history" (product.md). The same row id is kept (the `bot_sessions` singleton invariant + `loadSingletonSession`'s `LIMIT 1` stay intact — NO second row).

- [ ] **AC 5 — "this session" activity re-anchors to `started_at`**: so reset actually resets the live-state activity count, `loadSessionActivity` (CB-5.0) counts orders with `created_at >= bot_sessions.started_at` (not all session orders). After a reset, "this session" shows 0 buys until new ones occur; the **ledger view (CB-5.2) still shows full history** (audit preserved). This is the refinement that makes reset meaningful without multi-row sessions.

- [ ] **AC 6 — Override controls UI** (Client Component on `/dashboard` live-state): **Pause** (shown when status='active'), **Resume** (shown when 'paused'), **Reset** (always). Each POSTs to `/api/bot/override`; on success the page reflects the new state (refresh/`router.refresh()` — SSR re-render shows the updated status/activity). **Reset requires a confirm step** (it re-anchors the session) — confirmation copy from [copy.md](copy.md). Copy verbatim.

- [ ] **AC 7 — Concurrency: "takes effect next tick"**: an override during an in-flight tick doesn't abort it — the cron reads `status` at the top of each tick (CB-4.2), so a pause is honored from the NEXT tick. The UI copy states this ("Pause takes effect on the next 15-minute tick.", copy.md). The `override_events` row + the next tick's early-out make it auditable.

- [ ] **AC 8 — NO real-money / no order placement**: `/api/bot/**` never imports `lib/coinbase/orders` (no placement — safe controls only). Invariant test (transitive walk, CB-4.2/4.3 pattern) over `app/api/bot/**`. `force_buy`/`sell_*` kinds rejected (AC 1). This is the load-bearing "safe controls only" guarantee.

- [ ] **AC 9 — Write-surface scoping**: `/api/bot/**` is a deliberate WRITE surface (bot_sessions + override_events) — it is OUTSIDE the dashboard read-only invariant (which scans `app/dashboard/**` + `lib/dashboard/**`, already excludes it). The override DB ops live in a new `lib/bot/overrides.ts` (or extend `lib/ticks/db.ts`) — Engineer DRI; the write is transactional + append-only on `override_events`.

- [ ] **AC 10 — Auth + method tests** (unit, mocked): 401 (no/invalid session), CSRF reject (bad Origin), 405 (GET/PUT/etc.), 400 (unknown kind + deferred force_buy/sell_*); happy path per kind writes the correct `status` + `override_events.kind` (transactional).

- [ ] **AC 11 — e2e Playwright spec** (`e2e/dashboard/override.spec.ts`): auth → /dashboard → click Pause → assert status shows paused (+ DB `override_events` row) → Resume → active → Reset (confirm) → active + fresh session start. Golden path per button. Reuses `e2e/helpers.ts`.

- [ ] **AC 12 — Gates**: typecheck/lint/test/build clean; e2e CI/on-demand.

## Standard Experience Checklist

UI + write surface — load-bearing.
- [ ] **Navigation** — `covered: controls live on /dashboard (the live-state home); no new route for the UI (the API is /api/bot/override).`
- [ ] **States** — `covered by AC 6: buttons are status-aware (pause vs resume); reset confirm step; post-action SSR re-render reflects new status/activity.`
- [ ] **Feedback** — `covered: status change is visible in the live-state Bot status panel; "takes effect next tick" copy sets expectations (AC 7).`
- [ ] **Accessibility** — `covered by design.md: buttons are real <button>s with labels; confirm is keyboard-operable; status conveyed by text not color-only.`
- [ ] **Edge cases** — `covered by AC 2/4/7: pause-when-already-paused (logs event, no-op status), reset re-anchor, override-races-tick (next-tick semantics), unknown/deferred kind → 400.`
- [ ] **Cross-surface consistency** — `covered: reuses LiveModeBanner + chrome; the cron consumer (CB-4.2) already honors the statuses this writes.`

## Tech notes

### Engineer DRI Decisions
1. **Single route `/api/bot/override`** with a `kind` body (vs three routes) — extensible for CB-5.4's force_buy/sell on the same route; the safe-kind allow-list gates it now.
2. **Reset = single-row UPDATE** (status + started_at), NOT a second bot_sessions row — preserves the singleton `LIMIT 1` contract that `loadSingletonSession`/`upsertSingletonBotSession` rely on (a second row would make `LIMIT 1` non-deterministic). Activity re-anchors via `started_at` (AC 5).
3. **Auth reuse** — `verifySession` + the CSRF/Origin + rate-limit + cookie helpers from the CB-1.5 sign-out route; do not reinvent.
4. **Override DB ops in `lib/bot/overrides.ts`** (server-only; transactional status + override_events). The live-state activity query refinement (AC 5) lands in `lib/dashboard/live-state.ts`.

### Patterns to mirror
- Auth-write route: `app/api/auth/sign-out/route.ts` (CB-1.5). Transactional write: `lib/strategies/db.ts` `sql.begin`. Client action button: `app/dashboard/sign-out-client.tsx`. Invariant walk: `tests/app/api/cron/tick/invariants.test.ts`. e2e: `e2e/helpers.ts`.

### What this story does NOT include
- Real-money overrides force_buy/sell_50/sell_all (CB-5.4, post-flip — rejected with 400 here).
- Multi-row session history (reset is single-row re-anchor).
- The LIVE_MODE flip itself (operator env ceremony).

## DRI Log

### Decisions
- [2026-06-14] [PM] **Reset = single-row re-anchor (status='active' + started_at=now), history preserved; activity counts since started_at**
  - **Rationale (required):** product.md says "reset clears the session, not the exchange." The honest local meaning: a fresh session (status active, new start time, activity counter reset) WITHOUT deleting historical orders/ticks (audit) or touching the real Coinbase account. A single-row UPDATE preserves the `bot_sessions` singleton invariant that `loadSingletonSession`'s `LIMIT 1` (CB-4.2) + `upsertSingletonBotSession` (CB-3.3) depend on — a second "new session" row would make `LIMIT 1` non-deterministic (a shipped-code hazard). Activity re-anchors to `started_at` (AC 5) so "this session" resets; the ledger keeps full history.
  - **Area (required, tag):** session-model / reset-semantics
  - **Alternatives considered (required):** multi-row sessions (current row → status='reset' + ended_at, INSERT a new active row) (rejected — breaks `loadSingletonSession` `LIMIT 1`; would require changing shipped CB-3/CB-4 reads to "latest" selection — scope + risk); delete session orders on reset (rejected — destroys the audit ledger; product.md says preserve the ledger)
  - **Reversibility:** moderate — moving to multi-row sessions later is a migration + read-path change if historical-session views are ever wanted
- [2026-06-14] [PM] **Safe controls only; force_buy/sell_* rejected (400) — deferred to CB-5.4** (executes brief PM Decision #1) — the route + UI ship pause/resume/reset; the real-money kinds are gated until the LIVE_MODE path is proven post-flip.
  - **Area:** scope / real-money-safety
  - **Reversibility:** trivial — CB-5.4 adds the kinds to the same route + buttons

### Risks
- [2026-06-14] [PM] **Override races the in-flight tick** — **Likelihood:** medium · **Impact:** low (one more tick may run before pause; dry-run = harmless; auditable via override_events + next-tick early-out) · **Mitigation:** AC 7 next-tick semantics + UI copy; the cron reads status at tick top · **Area:** concurrency
- [2026-06-14] [PM] **Write-path auth** (a state-mutating route) — **Likelihood:** low · **Impact:** high if wrong (unauth'd pause/reset) · **Mitigation:** AC 1 reuses the CB-1.5 sign-out auth exactly (verifySession re-verify + CSRF + rate-limit); never trusts proxy headers; unit-tested (AC 10) · **Area:** security
- [2026-06-14] [PM] **reset re-anchor correctness** (activity must reset, history must survive) — **Likelihood:** low-medium · **Impact:** medium (wrong reset confuses the operator) · **Mitigation:** AC 5 explicit started_at filter; unit + e2e assert post-reset activity=0 + ledger history intact · **Area:** correctness

### Issues
_None at story creation._

## Tests
_Unit: route auth/method/kind + per-action writes (`tests/app/api/bot/override.test.ts`); activity re-anchor (`tests/lib/dashboard/live-state.test.ts` extension); override DB ops. Invariant: `/api/bot/**` no-orders-import. e2e: `e2e/dashboard/override.spec.ts`._

## PRs
_Auto-populated._

---
_Story closed: <pending>, brief: docs/bets/CB-5/brief.md. **LAST MVP STORY — closes the operator loop.**_

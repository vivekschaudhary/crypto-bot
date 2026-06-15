---
id: CB-5.3
bet: CB-5
type: story
status: in-review
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

- [ ] **AC 4 — reset** (PM Decision #1 — MULTI-ROW, per the architecture `BotSession` model): `kind='reset'` → in ONE transaction, END the current `bot_sessions` row (`status='reset'`, `ended_at=now()`) AND INSERT a NEW active row (`status='active'`, `started_at=now()`, `active_strategy_id` carried over from the ended session) + INSERT `override_events(kind='reset')`. **Historical `orders`/`bot_ticks`/`signals` are PRESERVED** (their `session_id` points at the now-ended session — audit intact); "reset clears the session, not the exchange or the audit history" (product.md). The new row becomes the current session. NO migration (`bot_sessions.ended_at` already exists in 0001-init).

- [ ] **AC 5 — current-session selection updated for multi-row** (the shipped-read change this requires): `loadSingletonSession` (CB-4.2) + the `bot_sessions` read inside `upsertSingletonBotSession` (CB-3.3) select the LATEST session by `started_at` (`ORDER BY started_at DESC LIMIT 1`, `FOR UPDATE` where it locks) — the current running session — instead of `LIMIT 1` over a presumed singleton. After a reset, the cron + dashboard naturally operate on the new active row; **"this session" activity resets to 0 automatically** because `loadSessionActivity` counts by the (new) current `session_id` — NO `started_at` filter needed (multi-row is cleaner than the single-row workaround would have been). The **ledger view (CB-5.2) still shows all orders across all sessions** (audit). NOTE: with multi-row, the current session is never `status='reset'` (reset immediately creates an active row), so CB-4.2's `status='reset'` cron early-out is unreachable for the current session — leave it as harmless defense-in-depth; the Engineer documents this.

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
2. **Reset = MULTI-ROW** (end current row + insert new active row, carry `active_strategy_id`) per the architecture model; update `loadSingletonSession` + `upsertSingletonBotSession`'s reads to latest-session (`ORDER BY started_at DESC`). Activity resets naturally by the new `session_id` (no `started_at` filter). No migration (`ended_at` exists). The cron `status='reset'` early-out becomes unreachable-for-current-session (document; leave as defense-in-depth).
3. **Auth reuse** — `verifySession` + the CSRF/Origin + rate-limit + cookie helpers from the CB-1.5 sign-out route; do not reinvent.
4. **Override DB ops in `lib/bot/overrides.ts`** (server-only; transactional status + override_events). The live-state activity query refinement (AC 5) lands in `lib/dashboard/live-state.ts`.

### Patterns to mirror
- Auth-write route: `app/api/auth/sign-out/route.ts` (CB-1.5). Transactional write: `lib/strategies/db.ts` `sql.begin`. Client action button: `app/dashboard/sign-out-client.tsx`. Invariant walk: `tests/app/api/cron/tick/invariants.test.ts`. e2e: `e2e/helpers.ts`.

### What this story does NOT include
- Real-money overrides force_buy/sell_50/sell_all (CB-5.4, post-flip — rejected with 400 here).
- A per-session HISTORY view (the multi-row data now exists — ended sessions with `started_at`/`ended_at` — but rendering a session-by-session breakdown is post-MVP; CB-5.0 live-state shows only the current session, the ledger shows all orders).
- The LIVE_MODE flip itself (operator env ceremony).

## DRI Log

### Decisions
- [2026-06-14] [PM] **Reset = MULTI-ROW (end current session + start a new one), per the foundational architecture `BotSession` model** — operator decision at the PR #74 round-1 BLOCKER (Codex flagged the story diverging from the architecture; Principle #16)
  - **Rationale (required):** the [foundation architecture](../../../../foundation/architecture.md) defines `BotSession` as "a contiguous run of the bot, operator-resettable" with reset ending one session + starting a new one (multi-row). The shipped CB-3/CB-4 code was single-row singleton — a **pre-existing doc-vs-code drift** (the architecture's multi-row intent was never implemented). The BLOCKER is resolved by ALIGNING the story to the architecture (conform the downstream to the owning artifact — NOT amending the architecture down to the shipped shortcut, which would have been soft-spec rationalization). The operator chose multi-row for true per-session history. **No architecture amendment** (the story now matches it); **no migration** (`bot_sessions.ended_at` already exists). Activity resets naturally by the new `session_id` (cleaner than the single-row `started_at`-filter would have been). Cost: the shipped `loadSingletonSession` + `upsertSingletonBotSession` reads change to latest-session selection (PM Risk below).
  - **Area (required, tag):** session-model / reset-semantics / upstream-first
  - **Alternatives considered (required):** single-row re-anchor (the story's original draft — rejected by the operator; it diverged from the architecture + foreclosed per-session history); amend the architecture DOWN to single-row to match the shipped code (rejected — that's conforming the spec to a shortcut, soft-spec rationalization; the architecture's model is the richer/correct one); delete session orders on reset (rejected — destroys the audit ledger)
  - **Reversibility:** moderate — the read-path change is localized to an `ORDER BY started_at DESC`; reverting to singleton would re-drift from the architecture
- [2026-06-14] [PM] **Safe controls only; force_buy/sell_* rejected (400) — deferred to CB-5.4** (executes brief PM Decision #1) — the route + UI ship pause/resume/reset; the real-money kinds are gated until the LIVE_MODE path is proven post-flip.
  - **Area:** scope / real-money-safety
  - **Reversibility:** trivial — CB-5.4 adds the kinds to the same route + buttons

### Risks
- [2026-06-14] [PM] **Override races the in-flight tick** — **Likelihood:** medium · **Impact:** low (one more tick may run before pause; dry-run = harmless; auditable via override_events + next-tick early-out) · **Mitigation:** AC 7 next-tick semantics + UI copy; the cron reads status at tick top · **Area:** concurrency
- [2026-06-14] [PM] **Write-path auth** (a state-mutating route) — **Likelihood:** low · **Impact:** high if wrong (unauth'd pause/reset) · **Mitigation:** AC 1 reuses the CB-1.5 sign-out auth exactly (verifySession re-verify + CSRF + rate-limit); never trusts proxy headers; unit-tested (AC 10) · **Area:** security
- [2026-06-14] [PM] **Changing the SHIPPED cron session lookup** (`loadSingletonSession` + `upsertSingletonBotSession` → latest-session selection) — **Likelihood:** medium · **Impact:** high if wrong (the LIVE cron resolves the wrong session → ticks against a stale/ended session) · **Mitigation:** the change is localized to the read query's `ORDER BY started_at DESC` (no logic change in the cron route, which mocks these in tests); NEW unit tests assert latest-session selection + that the post-reset active row is the one picked + that an ended (`reset`) row is never returned as current; the existing CB-4.2 route tests (mocked) stay green · **Area:** regression / shipped-code
- [2026-06-14] [PM] **reset multi-row correctness** (new session active, old session ended + preserved, activity resets) — **Likelihood:** low-medium · **Impact:** medium · **Mitigation:** transactional end+insert; unit + e2e assert post-reset: a new active row exists, the old row is `status='reset'` + `ended_at` set, historical orders survive (ledger), and "this session" activity = 0 · **Area:** correctness

- [2026-06-14] [Engineer] **reset `override_events` row is attached to the ENDED (old) session_id**; pause/resume attach to the current session_id — **Likelihood:** n/a (design choice) · **Impact:** audit clarity · **Rationale:** the reset action acted ON the session it terminated, so the audit row belongs to that session; the new session begins clean. Keeps `override_events` a faithful per-session log. · **Area:** reset-semantics / audit
- [2026-06-14] [Engineer] **`loadSessionState` in `lib/dashboard/live-state.ts` ALSO changed to latest-session selection** (beyond the two reads named in AC 5) — **Likelihood:** n/a · **Impact:** correctness · **Rationale:** the dashboard's own session read is separate from `loadSingletonSession`; without the same `ORDER BY started_at DESC` it would render the just-ended `reset` row after a reset instead of the new active session. Regression-tested. · **Area:** multi-row / dashboard

### Engineer DRI Decisions (build)
- [2026-06-14] [Engineer] **Session-integrity fix (round-1 review BLOCKER — Reviewer + Security).** The first build resolved the session id in the route, then mutated it in a separate transaction, and defined "current" by `started_at` ordering alone — so a stale/concurrent request could reopen an ended session or fork into two active sessions. **Fix, three parts:** (1) the override helpers take NO sessionId — each resolves AND locks the current session INSIDE its own transaction (`SELECT … WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1 FOR UPDATE`), so the mutated row is proven-current at commit; (2) "current" is redefined as the not-yet-ended run (`ended_at IS NULL`) in ALL current-session reads (loadSingletonSession, loadSessionState, upsertSingletonBotSession) — an ended row is never returned as current, even transiently; (3) **migration 0007** adds a partial unique index `bot_sessions_single_current` (at most one `ended_at IS NULL` row) as a structural backstop — a forked second active insert fails 23505, which the route maps to **409 conflict**. **Area:** session-integrity / concurrency · **Amends AC 4/5's "no migration" assumption** (the reset's column writes need none; the integrity index does — 0007 must be applied to prod, like 0005/0006).
- [2026-06-14] [Engineer] **`/api/bot/override` returns `409 no-session`** when no session has been bootstrapped (no strategy saved yet) — the request is well-formed but the state doesn't permit an override. (Story didn't specify; 409 over 500 since it's not a server fault.) **Area:** api-contract
- [2026-06-14] [Engineer] **Override DB ops live in a new `lib/bot/overrides.ts`** (not folded into `lib/ticks/db.ts`) — keeps the cron's tick-write module append-only/INSERT-only and the operator-write surface separate. Each action is ONE `sql.begin` transaction (status write + `override_events` audit commit together). **Area:** module-boundary
- [2026-06-14] [Engineer] **The override-controls client imports `OverrideKind` as `import type`** (type-only, erased at build) so the `"use client"` component never bundles the server-only `lib/bot/overrides` (which pulls `postgres`). The write itself happens via `fetch('/api/bot/override')`, never a direct helper import — enforced by the dashboard read-only invariant (override write helpers added to its forbidden-import list). **Area:** rsc-client-boundary

### Issues
_None at build._

## Tests
_Unit: route auth/method/kind + per-action writes (`tests/app/api/bot/override.test.ts`); reset multi-row (end+insert, history preserved) + latest-session selection in `loadSingletonSession`/`upsertSingletonBotSession` (regression tests); override DB ops. Invariant: `/api/bot/**` no-orders-import. e2e: `e2e/dashboard/override.spec.ts` (pause→resume→reset; post-reset new active session)._

## PRs
_Auto-populated._

---
_Story closed: <pending>, brief: docs/bets/CB-5/brief.md. **LAST MVP STORY — closes the operator loop.**_

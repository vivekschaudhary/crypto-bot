---
id: CB-6.5
bet: CB-6
type: story
status: ready
priority: P1
created: 2026-06-17
author: PM
design_link: docs/bets/CB-6/stories/CB-6.5/design.md
copy_link: docs/bets/CB-6/stories/CB-6.5/copy.md
area_tags: [frontend, backend, dashboard, cockpit, bot-control, run-now]
dependencies:
  - CB-6.0 shipped (cockpit Bot Status row + the DISABLED Run Now button + Start/Pause/Stop wiring)
  - CB-4.2/4.3 cron tick handler (app/api/cron/tick) + CB-5.3 operator-auth + the /api/bot/** no-orders invariant — reused
e2e: true
security_review: true
---

# CB-6.5 — Cockpit Run Now (on-demand bot evaluation) (SIXTH CB-6 STORY)

## Description

Enables the **disabled "Run Now" button** (CB-6.0): an operator-authenticated, on-demand trigger of **one** bot evaluation — the same logic the `*/15` cron runs — **dry-run while `LIVE_MODE=false`** (no bypass). Reuses the CB-4 tick handler (extracted to a shared function) + the CB-5.3 operator-auth stack. The cockpit refreshes on success so the new tick shows in Signals (6.3) + the Trade Log (6.4). Touches the bot's write path + a new authenticated mutation endpoint → **Security Reviewer engages** (auth + order-trigger surface).

## Acceptance Criteria

- [ ] **AC 1 — Run Now enabled + wired.** The CB-6.0 disabled button becomes a live control in the Bot Status row: `onClick` → `POST /api/run-now` (operator-auth). Phase feedback (reuse CB-5.3 controls' pattern): `Running…` / `Done — see the trade log.` / `Bot is paused — resume to run.` / `Run failed — try again.`; disabled while in flight (no double-submit). On success → `router.refresh()` (the new tick shows in Signals + Trade Log). Copy verbatim ([copy.md](copy.md)).
- [ ] **AC 2 — Run-now route** `app/api/run-now/route.ts` (`POST`). Operator-authenticated reusing the **CB-5.3 override stack**: `consumeOrThrow` rate-limit (own `keyPrefix`) → `verifyOriginOrThrow` (CSRF) → cookie + `verifySession` re-verify (proxy headers NEVER trusted as auth — CVE-2025-29927 lineage). Triggers ONE evaluation via the shared tick function (AC 3). **Lives OUTSIDE `app/api/bot/**`** — see AC 7.
- [ ] **AC 3 — Extract the shared tick function.** Move the cron tick's evaluation orchestration (load session → strategy → per-asset signals → `evaluate` → `buildOrderRows` → `insertTickWithDecisions`) into a reusable `lib/ticks/run-tick.ts` (e.g. `runBotTick({ source })`), called by **both** `app/api/cron/tick` (GET, cron) and `app/api/run-now` (POST, operator). Single source of truth — no duplicated orchestration. **The cron GET behavior is UNCHANGED** (same flooring, same 23505 dedupe, same response shape); existing cron tests stay green.
- [ ] **AC 4 — Dedupe / uniqueness (resolved — the brief's open Q).** The **manual** run uses a **precise (non-floored) `tick_started_at`** so it ALWAYS runs a fresh evaluation — it never no-ops as a "duplicate" against a recent cron tick on the 15-min grid. The **cron** keeps flooring to the quarter-hour. `UNIQUE(session_id, tick_started_at)` still guards exact double-submits (caught as `23505` → a benign "already ran" outcome). Manual ticks are intentionally off the 15-min grid.
- [ ] **AC 5 — Paused / no active session.** When the current session is paused/stopped, the evaluation **skips** (same as cron) and the route returns a distinct outcome the button surfaces as `Bot is paused — resume to run.` — never a silent no-op.
- [ ] **AC 6 — LIVE_MODE honored (NO bypass).** The shared tick function reads `env().LIVE_MODE` exactly as the cron does: dark → `dry_run` orders; post-flip → real orders (bounded by the per-session caps). Run Now adds NO dry-run-only path and NO live bypass. (Post-flip real-money **confirmation** UX is OUT of scope — CB-6.6; logged.)
- [ ] **AC 7 — Invariants hold.** The CB-5.3 **`/api/bot/** no-orders invariant** (`tests/app/api/bot/invariants.test.ts`) stays green — run-now is NOT under `app/api/bot/**` (it legitimately reaches `placeOrder` via the tick function, the bot's normal path, unlike the safe override route). The dashboard **read-only invariant** stays green (the cockpit POSTs to `/api/run-now`; `app/dashboard/**` adds no mutation/`lib/coinbase/orders` reach — the button is a client `fetch`).
- [ ] **AC 8 — No regression.** The cron tick (`/api/cron/tick`) is behaviourally unchanged (flooring, dedupe, return shape, auth); its tests stay green. Bot Status / cockpit sections unchanged except the now-enabled button.
- [ ] **AC 9 — Tests.** Unit: `runBotTick` (cron behavior preserved — flooring, `23505` dedupe, `dry_run`, skipped-when-paused) + the run-now route (401 no-session / 403 origin / 429 rate-limit; happy → triggers a tick with a precise timestamp + `dry_run`; skipped-when-paused outcome). Component: Run Now button render (enabled; working/success/skipped/error feedback). e2e (Codex): click Run Now → a fresh tick → the cockpit reflects it (Trade Log / Signals). Security-relevant: auth-failure paths asserted.
- [ ] **AC 10 — Gates.** typecheck / lint / test / build clean; e2e via the test DB. **Security Reviewer pass** (Codex) on the new authenticated order-triggering endpoint.

## Standard Experience Checklist

UI + action story — load-bearing.
- [ ] **Navigation** — `n/a — Run Now is an in-place action in the Bot Status row; no navigation.`
- [ ] **States** — `covered by AC 1/5: idle (enabled) · working ("Running…") · success · skipped (paused) · error.`
- [ ] **Feedback** — `covered by AC 1/5: each outcome has a verbatim line; the cockpit refreshes on success so the effect is visible in Signals + Trade Log.`
- [ ] **Accessibility** — `covered by AC 1: keyboard-operable <button> (loses disabled); feedback is text, not spinner/color-only.`
- [ ] **Edge cases** — `covered by AC 4/5 + AC 2: paused → skip feedback; double-click → in-flight disable + rate-limit; exact same-ms double-submit → 23505 benign; auth failures → error.`
- [ ] **Cross-surface consistency** — `n/a — single web target; the triggered evaluation is the SAME code path as the cron (AC 3), so manual + scheduled ticks are identical.`

## Tech notes

### Reuse
- `app/api/cron/tick/route.ts` — the evaluation orchestration to **extract** into `lib/ticks/run-tick.ts` (AC 3); `lib/ticks/tick-helpers.ts:floorToQuarterHour` stays the cron's (manual passes a precise timestamp).
- `app/api/bot/override/route.ts` — the **operator-auth stack to mirror** (rate-limit → origin → session re-verify) + `parseCookieHeader`/`SESSION_COOKIE_NAME`/`verifySession`/`verifyOriginOrThrow`/`consumeOrThrow`.
- `app/dashboard/bot-controls-client.tsx` — enable the disabled Run Now button + reuse the `submit()`/phase pattern (extend `ACTION_KIND` or add a `runNow()` path; on success `router.refresh()`).
- `lib/ticks/db.ts:insertTickWithDecisions` (the atomic write) + `evaluate` + `buildPerAssetSignal` (called inside `runBotTick`).

### Engineer / Architect DRI (confirm at build)
- **Route location:** `app/api/run-now/route.ts` (NOT `app/api/bot/run-now`) — keeps the `/api/bot/** no-orders invariant green while letting run-now legitimately reach `placeOrder` via `runBotTick`. (Alternative: a POST handler on `app/api/cron/tick` — also invariant-safe; the Engineer may co-locate. Default = dedicated route.)
- **`runBotTick({ source })`:** `source: "cron"` floors `tick_started_at`; `source: "manual"` uses a precise `new Date()` (AC 4). Both share the rest of the orchestration + the `23505` handling.
- **Skipped outcome:** the function returns a discriminated result (`ran` | `skipped` | `duplicate`); the route maps it to the JSON the button surfaces (AC 5).

### What this story does NOT include
- Real-money overrides (Buy/Sell — CB-6.6). A post-flip real-money **confirmation** dialog for Run Now (logged; CB-6.6/follow-up). Any change to the strategy/decision logic. Changing the cron schedule.

## PRs
_Auto-populated._

## Tests
_Unit/component co-located; e2e by Codex in `e2e/dashboard/`; **Security Reviewer pass** on the new endpoint (test DB; issue #80 may gate local e2e execution)._

## DRI Log

### Decisions
- [2026-06-17] [Architect] **Run-now lives OUTSIDE `app/api/bot/**`** (`app/api/run-now`). The CB-5.3 no-orders invariant bans `/api/bot/**` from reaching `lib/coinbase/orders`; run-now legitimately reaches `placeOrder` via the tick function (the bot's normal evaluation), unlike the safe override route — so it must not sit under `/api/bot/**`. This does NOT invert the invariant (that's CB-6.6); it stays outside its scope. — area: architecture — reversibility: medium.
- [2026-06-17] [Architect/Engineer] **Extract `runBotTick()` shared by cron + run-now** (single source of truth; cron GET behaviour unchanged). Avoids a second copy of the evaluation orchestration drifting from the cron. — area: refactor — reversibility: medium.
- [2026-06-17] [Engineer] **Manual run uses a precise (non-floored) `tick_started_at`** → always a fresh evaluation, no cron-window `23505` collision; cron keeps quarter-hour flooring. Resolves the brief's run-now-dedupe open question. — area: data-model — alternatives: floor manual too (rejected — a recent cron tick would make Run Now a confusing no-op) — reversibility: easy.
- [2026-06-17] [PM] **Run Now respects `LIVE_MODE` (no bypass).** Dark → dry_run; post-flip → real orders bounded by the per-session caps. A real-money confirmation UX is deferred to CB-6.6. — area: safety/scope — reversibility: easy.
- [2026-06-17] [PM] **Paused → skip + "Bot is paused — resume to run."** (no silent no-op) — the operator learns why nothing changed. — area: ux — reversibility: easy.

### Risks
- [2026-06-17] [Engineer] **Extracting the cron tick orchestration risks regressing the bot's core path** — likelihood: medium — impact: high (the tick is the bot) — mitigation: mechanical extraction + the existing cron tests pin behaviour + new `runBotTick` unit tests + Codex review; the cron GET stays a thin caller — area: correctness.
- [2026-06-17] [PM/Security] **Post-flip, Run Now is a real-money trigger on a click** — likelihood: low (dark now) — impact: high (real orders) — mitigation: bounded by the per-session buy-count/dollar caps + `LIVE_MODE`; Security Reviewer pass on the auth + trigger; the real-money confirmation UX lands with CB-6.6 — area: safety.
- [2026-06-17] [Engineer] **Rapid double-click / hammering** → multiple ticks + dry-run orders — likelihood: medium — impact: low (dry-run; caps) — mitigation: the override rate-limit (reused) + the in-flight button disable — area: abuse.
- [2026-06-17] [Engineer] **Off-grid manual ticks** interleave with the 15-min cron ticks in the trace/trade-log — likelihood: high — impact: low (expected; they're operator-initiated and labelled by time) — area: ux.

### Issues
_None at story creation._

---
_Story closed: <pending>, brief: docs/bets/CB-6/brief.md. **SIXTH CB-6 STORY — Run Now; on-demand tick via the shared handler. Security Reviewer engages (auth + order-trigger).**_

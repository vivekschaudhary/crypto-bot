---
id: CB-6.8
bet: CB-6
type: story
status: shipped
priority: P1
created: 2026-06-21
author: PM
area_tags: [backend, observability, ops, alerting, security]
security_review: true
dependencies:
  - CB-6 shipped (cockpit + real-money order paths)
e2e: false
---

# CB-6.8 — Operator alerting via Telegram (flip-ceremony: monitoring)

## Description

Closes scan finding **PROD_READY-03 (monitoring not wired)** — the highest-value gate before the `LIVE_MODE` flip. Today a **failed real-money order is silent** (it's recorded + logged as JSON, but nothing notifies the operator). This adds a minimal **Telegram** alerter (`lib/ops/alert.ts`) that pushes a message to the operator on (1) any **failed order** (bot or manual) and (2) a **bot-tick error**. Env-gated (no token → no-op), fire-and-forget, and it can **never** break the bot tick or order path. Per the SLO ([slo.md](../../slo.md)) alert set; reduces the operator's reliance on manually scanning the Trade Log.

## Acceptance Criteria

- [ ] **AC 1 — Telegram alerter.** `lib/ops/alert.ts` exports `sendAlert(text)` → `POST https://api.telegram.org/bot<token>/sendMessage` with `{ chat_id, text }`. **Env-gated:** if `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID` is unset → **no-op** (graceful degradation, like other optional integrations). **Never throws** into the caller (try/catch swallows network/HTTP errors) — an alert failure must not affect a bot tick or order placement.
- [ ] **AC 2 — Failed-order alerts (bot + manual).** When a **live** order is recorded `status='failed'` — in BOTH the bot path (`lib/ticks/run-tick.ts`) and the manual path (`lib/bot/manual-orders.ts`) — `sendAlert` fires with asset · side · amount · sanitized reason. Dry-run rows do **not** alert (paper, expected). Reason text is run through `sanitizeErrorDetail` (no secret-shaped material egresses — extends the CB-4.3 PR #63 redaction posture to the new sink).
- [ ] **AC 3 — Tick-error alert.** A top-level bot-tick failure (the `runBotTick` error path) fires one `sendAlert` (sanitized). Per-asset placement failures are covered by AC 2 (not double-alerted at tick level).
- [ ] **AC 4 — Awaited, bounded.** The alert is `await`ed at the failure site (so the HTTP completes before the serverless function freezes) with a short timeout; on timeout/error it's swallowed. Latency added only on the (rare) failure path, never on the success path.
- [ ] **AC 5 — Env contract.** `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` added to the env schema as **optional**; `.env.example` documents them + the "unset → alerting disabled" behavior. No other env required.
- [ ] **AC 6 — Tests.** Unit: a pure `formatOrderFailureAlert(...)` (+ `formatTickErrorAlert`) message formatter (asset/side/amount/reason → string); `sendAlert` is a no-op when env unset (mock env, assert `fetch` not called); `sendAlert` POSTs the correct Telegram URL + `{chat_id,text}` when env set (mock `fetch`); `sendAlert` swallows a rejected `fetch` (never throws). Hook-site tests: a failed live order triggers `sendAlert`; a dry-run order does NOT.
- [ ] **AC 7 — No regression / invariants.** Order/tick success paths unchanged; `dry_run` behavior unchanged; the read-only + `/api/bot/**` invariants hold (alerting is outbound-only, places no orders); typecheck/lint/test/build green.
- [ ] **AC 8 — Security review (mandatory).** Touches a **secret** (`TELEGRAM_BOT_TOKEN`) + **external egress** (order metadata → Telegram). Codex Security Reviewer confirms: token never logged/echoed; only sanitized, non-sensitive order metadata egresses (asset/side/amount/reason — no keys, no PII); env-gated; failure-isolated.

## Standard Experience Checklist

Backend/observability story — no UI surface.
- [ ] **Navigation** — `n/a — no UI.`
- [ ] **States** — `covered by AC 1: enabled (env set) / disabled (env unset → no-op). No UI states.`
- [ ] **Feedback** — `covered by AC 2/3: the alert IS the operator feedback (failed order / tick error); messages name what failed + why (sanitized reason).`
- [ ] **Accessibility** — `n/a — no UI.`
- [ ] **Edge cases** — `covered by AC 1/4: token unset → no-op; Telegram down/timeout → swallowed (never breaks the caller); secret-shaped reason → redacted (AC 2).`
- [ ] **Cross-surface consistency** — `n/a — single backend sink.`

## Tech notes

### Reuse
- `lib/ticks/trace.ts` `sanitizeErrorDetail` — reuse for the alert reason (same redaction the log drain uses; AC 2).
- Hook sites: `lib/ticks/run-tick.ts` (the `status:"failed"` live-placement sites, alongside the existing `emitOrderPlacementTrace`) + `lib/bot/manual-orders.ts` (the `status="failed"` branch ~L116-154) + the `runBotTick` top-level catch (AC 3).
- `lib/env/index.ts` — add the two optional vars (matches the existing optional-env pattern, e.g. `APP_ORIGIN`).

### Engineer DRI (confirm at build)
- **Never-throw is load-bearing:** `sendAlert` wraps everything in try/catch (incl. a fetch timeout via `AbortSignal.timeout`) — an alert path must never take down a tick/order (mirrors the trace emitters' "logging must never take down a tick").
- **Egress minimalism (security):** send only asset · side · amount(USD) · sanitized reason. Never the token, keys, raw errors, or session internals.
- **No new dependency** — native `fetch` to the Telegram Bot API.

### What this story does NOT include
- Tick-gap (missed-cron) detection — the app can't self-detect a cron that didn't fire; that's an external dead-man's-switch / Vercel cron monitor (documented in `slo.md`, operator infra). 5xx-endpoint alerts (the failed-order + tick-error alerts cover the money path; route 5xx is a later add). No success/"order submitted" confirmations (failures only, minimal scope). No UI.

## PRs
- #110 — operator alerting via Telegram. Merged 2026-06-21. Codex code + security clean (after the AC-6 hook-site-tests BLOCKER).

## Tests
_Unit co-located; no e2e (outbound alert; covered by unit + the existing cockpit e2e for order paths)._

## DRI Log

### Decisions
- [2026-06-21] [PM] **Reopen CB-6 with CB-6.8 (post-ship), like CB-6.7.** Closing the scan's PROD_READY-03 (monitoring) is a flip-ceremony prerequisite; it's CB-6's money surface, so it belongs on CB-6 (not a new bet). — area: planning — reversibility: easy.
- [2026-06-21] [Operator/Engineer] **Telegram (not Slack/Discord/Sentry).** Simplest bot API (one POST, two secrets), operator already uses it. Generic-webhook abstraction rejected as over-engineering for n=1. — area: ops — alternatives: Slack/Discord webhook (heavier setup), Vercel log-drain alert rule (no code but external-infra-dependent, unverifiable here) — reversibility: easy.
- [2026-06-21] [Architect] **Failures-only, env-gated, never-throw, awaited-on-failure-path.** Minimal high-signal alert (the SLO's page-worthy events) without touching the success path or risking the tick. — area: observability — reversibility: easy.

### Risks
- [2026-06-21] [Engineer] **Alert path breaks a tick/order** — likelihood: low — impact: high — mitigation: total try/catch + AbortSignal timeout; env-gated no-op; unit test asserts a rejected fetch is swallowed — area: correctness.
- [2026-06-21] [Security] **Secret/PII egress to Telegram** — likelihood: low — impact: high — mitigation: send only sanitized order metadata (asset/side/amount/reason via `sanitizeErrorDetail`); token never logged; mandatory Security Reviewer (AC 8) — area: security.

### Issues
- [2026-06-21] [Engineer] **Codex BLOCKER closed — hook-site tests added (AC 6).** Round-1 shipped only the `alert.ts` unit tests (formatters + `sendAlert` gating/payload/swallow); AC 6 also required proving the bot + manual failure branches actually call `sendAlert` and dry-run stays silent. Added: `run-tick.test.ts` (+4 — a DECLINING candle series produces a buy → LIVE placement failure fires `sendAlert`; dark dry_run + LIVE submitted do NOT; top-level tick error fires the tick-error alert) and `manual-orders.test.ts` (+3 — LIVE failed manual order fires; dry_run + submitted do not). 940 tests green. — severity: high (closed) — owner: Engineer — area: testing.

---
_Story closed: 2026-06-21 (PR #110, shipped), brief: docs/bets/CB-6/brief.md. **POST-SHIP — closes scan PROD_READY-03 (monitoring) for the LIVE_MODE flip ceremony. Reopens CB-6.**_

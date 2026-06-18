---
id: SCAN-CB-6
type: scan-report
status: living
bet_id: CB-6
current_phase: Production Ready
scanned_at: 2026-06-18 22:31 UTC
scanner_version: 1
open_findings:
  critical: 4
  high: 2
  medium: 1
  low: 0
suppressed_findings: 0
blocking_advance: true
---

# Scan Report — CB-6 (Multi-asset shell + crypto cockpit redesign)

> Continuous quality scanner output. Findings, not failures. Re-render with `/scan CB-6`. Never hand-edited — the next `/scan` run will overwrite (suppressions preserved by ID). Owners triage; the scanner informs.

**Scanned:** 2026-06-18 22:31 UTC · **Current phase:** Production Ready · **Mode:** strict (per `compass/config.yaml` `scanner.per_phase.production_ready: strict`)

## Summary

- **Open findings:** 7 total (4 critical · 2 high · 1 medium · 0 low)
- **Suppressed:** 0
- **Blocking phase advance:** **yes** — strict mode + open Criticals in the Production Ready phase. (Informational: phase transitions are operator status-flips; nothing auto-blocks. The flag signals "production-readiness ops artifacts are absent.")
- **Top pattern:** identical to the CB-5 first-production-readiness posture — the bet shipped cleanly through Product → Build (7 stories, full Codex review on every PR, **mandatory Security Reviewer pass on the real-money story CB-6.6**), but **no Production-Ready ops artifacts exist** (no runbook, SLO, wired monitoring, or rollback-test record), and the **committed e2e suite has never been executed** (issue #80). Most prod-readiness gaps are gated by the `LIVE_MODE=true` flip — the bot is paper-only (dark) today, so the real-money overrides + Run Now currently record `dry_run` orders.

## Findings by phase

Each finding follows the canonical shape: severity · confidence · location · reason · fix · applies-to · suppressible. Sorted within each phase by severity descending.

### Product

_No open findings._ Brief is `shipped` (was HITL-approved); `key_metric` has name/baseline/target/source (PROD-04 pass); in/out scope defined (PROD-03 pass); moat line present (PROD-06 pass); 3 load-bearing decisions recorded with operator attribution.

### Architecture

_No open findings._ `architecture_required: auto` was **resolved to story-level architecture with a documented decline** of a separate bet-arch doc (brief + `docs/status.md`: "skip a separate bet-arch doc; patterns exist: CB-4.3 placeOrder + CB-5.3 route + override_events kinds already in schema"), so ARCH-01 (no arch doc **and** no DRI decline) does not fire. The load-bearing per-story architecture calls (the CB-6.6 invariant inversion; the CB-6.5 `runBotTick` extraction + route location) are recorded in their story DRI logs with alternatives + reversibility.

### Build

#### [HIGH] E2E authored but never executed (coverage unverified)

- **Phase:** Build
- **Severity:** High
- **Confidence:** High
- **Location:** `e2e/dashboard/cockpit.spec.ts`; issue #80; CB-6.0–6.6 story close-lines ("local e2e EXECUTION deferred under #80")
- **Reason:** Codex authored + committed the cockpit e2e for every CB-6 story (status/PnL/position/signals/trade-log/run-now/manual-overrides), and CI **typechecks + lints** it — but CI does **not** run Playwright, and the suite has **never been executed** against the test DB (issue #80: the Next-16 two-`next dev` lock; the local Docker test DB on :5433 was also unavailable in-session). So the AC user-flows have authored-but-**unverified** e2e coverage. → High confidence (the gap is documented in #80 + the story close-lines; CI config confirms e2e is not in the pipeline).
- **Fix:** Run the cockpit spec against the test DB once — the **external-server mode works** (`PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_EXTERNAL_DB_OK=1` + one `next dev` on the test DB sidesteps #80; verified in-session up to the DB connection). Then resolve #80 (two `next start` instances) so the full suite runs in CI. Prioritise the **real-money override** + **Run Now** flows before the `LIVE_MODE` flip.
- **Applies to bet types:** feature
- **Suppressible:** Yes (DRI justification required).

_Other Build checks pass:_ BUILD-01/02 (every story shipped with unit + component tests; 903 in the suite) · BUILD-04 (no open PRs / zero open review BLOCKERs) · **BUILD-05 (security review NOT skipped — CB-6.5 + the real-money CB-6.6 both had the Security Reviewer pass; CB-6.6 mandatory)** · BUILD-06 (Codex architect-compliance on every PR) · BUILD-07 (no perf budget defined → n/a).

### Production Ready

#### [CRITICAL] Runbook missing

- **Phase:** Production Ready
- **Severity:** Critical
- **Confidence:** High
- **Location:** `docs/bets/CB-6/runbook.md` (absent)
- **Reason:** No runbook for the cockpit operator surface. CB-6 adds operator-facing **control** surfaces (Start/Pause/Stop, **Run Now**, and **real-money Manual Overrides**) — the highest-consequence of which place real orders post-`LIVE_MODE`-flip. There is no documented procedure for reading the cockpit, responding to a failed/stuck order, or the operator runbook for the overrides. → High confidence (file absent).
- **Fix:** Author `docs/bets/CB-6/runbook.md`: what each cockpit section means, how to use the controls, how to read a `failed` order in the Trade Log, the `LIVE_MODE` flip procedure (the ≥60-dry-run guardrail), and how to halt (Pause/Stop) if a manual override misbehaves.
- **Applies to bet types:** all except continuous-improvement
- **Suppressible:** Yes (DRI).

#### [CRITICAL] SLO undefined

- **Phase:** Production Ready
- **Severity:** Critical
- **Confidence:** High
- **Location:** `docs/bets/CB-6/slo.md` (absent)
- **Reason:** No SLO for the cockpit (SSR availability) or the new authenticated mutation endpoints (`/api/run-now`, the real-money `/api/bot/override` kinds) — no SLI / target / error budget / alert thresholds. CB-4's ≥99% tick-reliability metric exists but does not cover the cockpit or the override/run-now success rates. → High confidence (file absent).
- **Fix:** Define `docs/bets/CB-6/slo.md`: cockpit availability, override/run-now success rate + latency, and (post-flip) a real-order placement success SLI; set error-budget + alert thresholds.
- **Applies to bet types:** all except continuous-improvement
- **Suppressible:** Yes (HITL approval).

#### [CRITICAL] Monitoring not wired

- **Phase:** Production Ready
- **Severity:** Critical
- **Confidence:** Medium
- **Location:** observability config / alerts (none found for CB-6 surfaces)
- **Reason:** The app emits structured traces (`emitTickTrace` / `emitOrderPlacementTrace`) but there are **no alerts** on failed orders, override/run-now errors, or tick failures, and no observability MCP is connected to corroborate dashboards. A failed real-money override (post-flip) or a run-now error would be silent. → Medium confidence (trace logging exists, but no alerting wired and no MCP to confirm).
- **Fix:** Wire alerts on `status='failed'` order rows, 5xx from `/api/run-now` + `/api/bot/override`, and tick-error traces; surface them to the operator's status channel.
- **Applies to bet types:** all production-bound bets
- **Suppressible:** Yes (HITL approval).

#### [CRITICAL] Rollback untested

- **Phase:** Production Ready
- **Severity:** Critical
- **Confidence:** High
- **Location:** `docs/bets/CB-6/` ops DRI (no rollback-test entry)
- **Reason:** No DRI entry confirms a rollback test for CB-6. The deploy is additive (no migration — `override_events.kind` CHECK + `orders.source='manual'` pre-existed), so rollback = redeploy the prior build, but this has not been recorded as tested. → High confidence (no DRI record).
- **Fix:** Confirm + log that reverting to the pre-CB-6 deployment cleanly removes the cockpit surfaces without orphaning data (manual orders persist as audit rows — fine); record the test date + outcome in an ops DRI entry.
- **Applies to bet types:** all except continuous-improvement
- **Suppressible:** Yes (HITL approval).

#### [HIGH] On-call unprepared

- **Phase:** Production Ready
- **Severity:** High
- **Confidence:** High
- **Location:** `docs/bets/CB-6/` (no on-call ack on a runbook that doesn't exist)
- **Reason:** No on-call acknowledgement. The single operator IS on-call, but there is no recorded ack of the (missing) runbook — particularly load-bearing because the operator personally triggers the real-money overrides + the `LIVE_MODE` flip. → High confidence.
- **Fix:** Once the runbook exists, record the operator's ack (date) in an ops DRI entry.
- **Applies to bet types:** all production-bound bets
- **Suppressible:** Yes (DRI).

#### [MEDIUM] Cost monitoring absent

- **Phase:** Production Ready
- **Severity:** Medium
- **Confidence:** Medium
- **Location:** Coinbase API usage / Vercel function invocations (no cost alerts)
- **Reason:** CB-6 adds Coinbase reads per cockpit load (the logged `loadCockpitPnl`/`loadCockpitPosition` dup-fetch + signals/trade-log queries) and on-demand Run Now ticks, with no cost/rate-limit alerting. No cost guardrail was set in the brief → Medium (not High). → Medium confidence (real but bounded — single operator, on-demand, not traffic-driven).
- **Fix:** Add a Coinbase API rate/usage alert + a Vercel function-invocation budget alert; optionally dedupe the per-pair Coinbase reads (already logged as a CB-6.2 DRI risk).
- **Applies to bet types:** all production-bound bets
- **Suppressible:** Yes (owner accept).

_Not applicable this bet:_ **PROD_READY-06 (backup)** — CB-6 introduced **no new data store** (no migration; reused `orders`/`override_events`/`bot_sessions`/`signals`). **PROD_READY-08 (regulated-data compliance)** — CB-6 executes the **operator's own** trades via their **own** Coinbase API key (single-operator self-custody); it does not handle third-party / regulated financial data, so the compliance check does not fire. The relevant real-money control is the **`LIVE_MODE` flip ceremony + ≥60-dry-run guardrail**, which is documented. **PROD_READY-09 (vendor capability)** — CB-6 adds no new vendor dependency; real-order placement (`placeOrder`) shipped + was capability-verified in CB-4.3.

### GTM

_Phase not yet active._ (Single-operator internal tool; GTM checks are largely n/a, but not evaluated until the bet enters GTM.)

### Operate

_Phase not yet active._ The bet is `shipped` but pre-`LIVE_MODE`-flip (paper/dark); Operate checks (SLO breach, incident rate, adoption, cost actuals) begin once it's live + measuring.

## Suppressed findings

_No suppressions._

## Owner actions

Choose one (and reflect the decision in the bet's DRI):

- [ ] **Resolve all open findings before advancing** (recommended before the `LIVE_MODE` flip)
- [ ] **Resolve Critical + High; accept Medium as quality debt** (auto-logged in DRI)
- [ ] **Suppress Critical findings with justification** (requires HITL approval + risk-acceptance entry in DRI)

**Scanner's note (informational, not a decision):** every Production-Ready Critical here is gated by the **`LIVE_MODE=true` flip** — while dark, the cockpit is read + paper (`dry_run`) only. The natural sequencing is to clear the runbook / SLO / monitoring / rollback findings **as part of the flip ceremony**, since that's when real money first moves. The one finding worth closing **before** the flip regardless is the **unexecuted e2e** (run the real-money override + Run Now flows once).

## Scan history

| Date | Version | Open (C / H / M / L) | Suppressed | Blocking | Triggered by |
|------|---------|----------------------|------------|----------|--------------|
| 2026-06-18 22:31 | 1 | 4 / 2 / 1 / 0 | 0 | yes | `/scan CB-6` |

---

_Living artifact — re-run `/scan CB-6` to refresh. Auto-invoked at phase boundaries by `/build`._

---
id: SCAN-CB-6
type: scan-report
status: living
bet_id: CB-6
current_phase: Production Ready
scanned_at: 2026-06-21 19:30 UTC
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

**Scanned:** 2026-06-21 19:30 UTC · **Current phase:** Production Ready · **Mode:** strict (per `compass/config.yaml` `scanner.per_phase.production_ready: strict`) · **Re-scan v2** (prior: 2026-06-18)

## Summary

- **Open findings:** 7 total (4 critical · 2 high · 1 medium · 0 low)
- **Suppressed:** 0
- **Blocking phase advance:** **yes** — strict mode + open Criticals in the Production Ready phase. (Informational: phase transitions are operator status-flips; nothing auto-blocks. The flag signals "production-readiness ops artifacts are absent.")
- **Changed since v1 (2026-06-18):** (a) **CB-6.7 shipped** (PR #100) — paper-aware cockpit P&L + Current Position, adding **migration 0008** (`orders.base_quantity`, additive/nullable; applied to prod 2026-06-19 + Reset Session done). (b) **The cockpit e2e was freshly executed 2026-06-21 and is now RED on `main`** — CB-8's sidebar nav redesign (icons `aria-hidden`) changed the nav links' accessible names, breaking the cockpit spec's stale `"📈 Equity"`/`"🤖 Crypto"`/`"📊 Mutual Funds"` assertions (it expects the old top-tab combined names). **This is a real cross-bet regression in the e2e, undetected because the spec isn't in CI (#80).** See BUILD-03 below.
- **Top pattern (unchanged):** CB-6 shipped cleanly through Product → Build (8 stories incl. CB-6.7, full Codex review on every PR, **mandatory Security Reviewer on the real-money CB-6.6**), but **no Production-Ready ops artifacts exist** (no runbook, SLO, wired monitoring, rollback-test record). **Unlike CB-8 (pure chrome), these are real gates** — CB-6 is the **money surface** (Run Now + real-money Manual Overrides place real orders once `LIVE_MODE=true`). They should be authored as part of the **flip ceremony**, not suppressed.

## Findings by phase

Each finding follows the canonical shape: severity · confidence · location · reason · fix · applies-to · suppressible. Sorted within each phase by severity descending.

### Product

_No open findings._ Brief is `shipped` (was HITL-approved); `key_metric` has name/baseline/target/source (PROD-04 pass); in/out scope defined (PROD-03 pass); moat line present (PROD-06 pass); operator-attributed load-bearing decisions recorded.

### Architecture

_No open findings._ `architecture_required: auto` was resolved to story-level architecture with a documented decline of a separate bet-arch doc (ARCH-01 does not fire); the load-bearing per-story calls (CB-6.6 invariant inversion; CB-6.5 `runBotTick` extraction + route location; CB-6.7 mode-switched paper/real position source) are recorded in their story DRI logs with alternatives + reversibility.

### Build

#### [HIGH] Cockpit e2e RED on main (CB-8 nav drift) + fragile to run (was: never executed)

- **Phase:** Build
- **Severity:** High
- **Confidence:** High (reproduced 2026-06-21)
- **Location:** `e2e/dashboard/cockpit.spec.ts:232-234`; `app/dashboard/dashboard-sidebar.tsx:120` (`nav-icon aria-hidden`); issue #80
- **Reason:** The cockpit spec was documented green on 2026-06-19, but a **fresh run on 2026-06-21 fails**: CB-8's sidebar nav makes the emoji icons `aria-hidden="true"`, so the nav links' accessible names are now `"Crypto"`/`"Equity"`/`"Mutual Funds"` — the spec still asserts the **old top-tab combined names** `"🤖 Crypto"`/`"📈 Equity"`/`"📊 Mutual Funds"` (`getByRole("link", { name: "📈 Equity" })`). The cockpit itself renders fine (setup journey + per-pair heading + pair selector all passed); only the stale nav-name assertions fail. **The drift was invisible because the cockpit spec isn't in CI** (#80: the two-`next dev` lock). Separately, runs are **fragile**: a first attempt failed at the setup-journey landing page (the `unstable_cache` credential-count gotcha — a stale non-zero count from a prior spec run in the same session; fixed only by pre-truncating the test DB before server start). → High confidence (both failures reproduced this scan).
- **Fix:** (1) Update the 3 stale nav-name assertions in `cockpit.spec.ts` to the CB-8 accessible names (drop the emoji: `"Equity"`, `"Crypto"`, `"Mutual Funds"`) — Codex-owned e2e. (2) Resolve #80 (two `next start` in CI) so cross-bet nav/chrome drift is caught automatically. (3) Harden the recipe against the credential-count cache (invalidate `getCredentialCount`'s `unstable_cache` on `resetAllTables`, or document the pre-truncate step). Re-run the **real-money override + Run Now flows green before the `LIVE_MODE` flip.**
- **Applies to bet types:** feature
- **Suppressible:** Yes (DRI) — but **strongly recommend fixing before the flip** (this is the money-path e2e).

_Other Build checks pass:_ BUILD-01/02 (every story incl. CB-6.7 shipped with unit + component tests) · BUILD-04 (no open PRs / zero open review BLOCKERs) · **BUILD-05 (security review NOT skipped — CB-6.5 + the real-money CB-6.6 both had the Security Reviewer pass; CB-6.6 mandatory; CB-6.7 had a security glance)** · BUILD-06 (Codex architect-compliance on every PR) · BUILD-07 (no perf budget defined → n/a).

### Production Ready

> **These are real gates, not artifact-absence noise.** CB-6 owns the operator's real-money controls (Run Now + Manual Overrides Buy/Sell). Post-`LIVE_MODE`-flip they place real Coinbase orders. The four Criticals below are the production-readiness work of the **flip ceremony** — recommend authoring (not suppressing) before going live.

#### [CRITICAL] Runbook missing

- **Phase:** Production Ready
- **Severity:** Critical
- **Confidence:** High
- **Location:** `docs/bets/CB-6/runbook.md` (absent)
- **Reason:** No runbook for the cockpit operator surface — the highest-consequence controls (real-money Manual Overrides, Run Now) place real orders post-flip, and there's no documented procedure for reading the cockpit, responding to a failed/stuck order, the `LIVE_MODE` flip steps, or halting (Pause/Stop) a misbehaving override. → High confidence (file absent).
- **Fix:** Author `docs/bets/CB-6/runbook.md`: cockpit section meanings; how to use Start/Pause/Stop/Run Now + Manual Overrides; how to read a `failed` order in the Trade Log; the `LIVE_MODE` flip procedure (the ≥60-dry-run guardrail); the paper-vs-real P&L modes (CB-6.7); emergency-halt steps.
- **Applies to bet types:** all except continuous-improvement
- **Suppressible:** Yes (DRI) — not recommended (money surface).

#### [CRITICAL] SLO undefined

- **Phase:** Production Ready
- **Severity:** Critical
- **Confidence:** High
- **Location:** `docs/bets/CB-6/slo.md` (absent)
- **Reason:** No SLO for the cockpit (SSR availability) or the authenticated mutation endpoints (`/api/run-now`, the real-money `/api/bot/override` kinds) — no SLI / target / error budget / alert thresholds. CB-4's ≥99% tick-reliability metric doesn't cover the cockpit or override/run-now success rates. → High confidence (file absent).
- **Fix:** Define `docs/bets/CB-6/slo.md`: cockpit availability; override/run-now success rate + latency; (post-flip) real-order placement success SLI; error-budget + alert thresholds.
- **Applies to bet types:** all except continuous-improvement
- **Suppressible:** Yes (HITL approval) — not recommended.

#### [CRITICAL] Monitoring not wired

- **Phase:** Production Ready
- **Severity:** Critical
- **Confidence:** Medium
- **Location:** observability config / alerts (none found for CB-6 surfaces)
- **Reason:** Structured traces exist (`emitTickTrace`/`emitOrderPlacementTrace`) but **no alerts** on failed orders, override/run-now errors, or tick failures, and no observability MCP connected to corroborate. A failed real-money override (post-flip) or a run-now error would be silent. → Medium confidence (trace logging exists; no alerting wired; no MCP).
- **Fix:** Wire alerts on `status='failed'` order rows, 5xx from `/api/run-now` + `/api/bot/override`, and tick-error traces; surface to the operator's status channel.
- **Applies to bet types:** all production-bound bets
- **Suppressible:** Yes (HITL approval) — not recommended.

#### [CRITICAL] Rollback untested

- **Phase:** Production Ready
- **Severity:** Critical
- **Confidence:** High
- **Location:** `docs/bets/CB-6/` ops DRI (no rollback-test entry)
- **Reason:** No DRI entry confirms a rollback test. **Updated for CB-6.7:** the deploy now includes **migration 0008** (`orders.base_quantity`) — additive + nullable, so reverting the app build leaves the column unused/harmless (no destructive down-migration needed). But rollback (redeploy prior build; column stays) has **not been recorded as tested**. → High confidence (no DRI record).
- **Fix:** Confirm + log that reverting to the pre-CB-6 (or pre-CB-6.7) build cleanly removes the cockpit surfaces; note that 0008 is additive/nullable and safe to leave in place; record date + outcome in an ops DRI entry.
- **Applies to bet types:** all except continuous-improvement
- **Suppressible:** Yes (HITL approval) — not recommended.

#### [HIGH] On-call unprepared

- **Phase:** Production Ready
- **Severity:** High
- **Confidence:** High
- **Location:** `docs/bets/CB-6/` (no on-call ack)
- **Reason:** No on-call acknowledgement. The single operator IS on-call and personally triggers the real-money overrides + the `LIVE_MODE` flip — but there's no recorded ack of the (missing) runbook. → High confidence.
- **Fix:** Once the runbook exists, record the operator's ack (date) in an ops DRI entry.
- **Applies to bet types:** all production-bound bets
- **Suppressible:** Yes (DRI).

#### [MEDIUM] Cost monitoring absent

- **Phase:** Production Ready
- **Severity:** Medium
- **Confidence:** Medium
- **Location:** Coinbase API usage / Vercel function invocations (no cost alerts)
- **Reason:** CB-6 adds Coinbase reads per cockpit load + on-demand Run Now ticks, with no cost/rate-limit alerting. No cost guardrail in the brief → Medium. → Medium confidence (real but bounded — single operator, on-demand, not traffic-driven).
- **Fix:** Add a Coinbase API rate/usage alert + a Vercel function-invocation budget alert; optionally dedupe the per-pair Coinbase reads (logged as a CB-6.2 DRI risk).
- **Applies to bet types:** all production-bound bets
- **Suppressible:** Yes (owner accept).

_Not applicable this bet:_ **PROD_READY-06 (backup)** — CB-6.7's migration 0008 added a **column to an existing table**, not a new data store; no backup/restore regime change. **PROD_READY-08 (regulated-data compliance)** — CB-6 executes the **operator's own** trades via their **own** Coinbase key (single-operator self-custody); no third-party/regulated financial data. **PROD_READY-09 (vendor capability)** — no new vendor dependency; `placeOrder` was capability-verified in CB-4.3.

### GTM

_Phase not yet active._ (Single-operator internal tool; GTM checks largely n/a, not evaluated until the bet enters GTM.)

### Operate

_Phase not yet active._ The bet is `shipped` but pre-`LIVE_MODE`-flip (paper/dark); Operate checks begin once live + measuring.

## Suppressed findings

_No suppressions._ (Unlike CB-8, CB-6's Production-Ready Criticals are real money-surface gates — recommend resolving as part of the flip ceremony, not suppressing.)

## Owner actions

Choose one (and reflect the decision in the bet's DRI):

- [ ] **Resolve all open findings before the `LIVE_MODE` flip** (recommended — this is the money surface)
- [ ] **Fix the cockpit e2e (3 stale nav names) + author runbook/SLO + wire minimal alerts + log a rollback test, as the flip ceremony**
- [ ] **Suppress Critical findings with justification** (requires HITL approval + risk-acceptance — not recommended for the real-money surface)

**Scanner's note (informational):** the four Production-Ready Criticals are gated by the `LIVE_MODE=true` flip — while dark, the cockpit is read + paper (`dry_run`) only. Natural sequencing: clear runbook / SLO / monitoring / rollback **as the flip ceremony**. The one finding to fix **regardless of the flip** is the **cockpit e2e** — it's currently RED on `main` (CB-8 nav-name drift), a quick 3-string fix, and it's the money-path verification you'll want green before going live.

## Scan history

| Date | Version | Open (C / H / M / L) | Suppressed | Blocking | Triggered by |
|------|---------|----------------------|------------|----------|--------------|
| 2026-06-18 22:31 | 1 | 4 / 2 / 1 / 0 | 0 | yes | `/scan CB-6` |
| 2026-06-21 19:30 | 2 | 4 / 2 / 1 / 0 | 0 | yes | `/scan CB-6` (CB-6.7+0008 noted; cockpit e2e found RED on main — CB-8 nav drift) |

---

_Living artifact — re-run `/scan CB-6` to refresh. Auto-invoked at phase boundaries by `/build`._

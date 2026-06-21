---
id: SCAN-CB-8
type: scan-report
status: living
bet_id: CB-8
current_phase: Production Ready
scanned_at: 2026-06-21 18:22 UTC
scanner_version: 1
open_findings:
  critical: 0
  high: 0
  medium: 0
  low: 0
suppressed_findings: 5
blocking_advance: false
---

# Scan Report — CB-8 (Responsive left-sidebar dashboard navigation)

> Continuous quality scanner output. Findings, not failures. Re-render with `/scan CB-8`. Never hand-edited — the next `/scan` run will overwrite (suppressions preserved by ID). Owners triage; the scanner informs.

**Scanned:** 2026-06-21 18:22 UTC · **Current phase:** Production Ready · **Mode:** strict (per `compass/config.yaml` `scanner.per_phase.production_ready: strict`)

## Summary

- **Open findings:** 0 (all triaged 2026-06-21 — see below)
- **Suppressed:** 5 (4 Production-Ready Criticals + on-call; operator risk-acceptance, recorded in `brief.md` DRI)
- **Resolved:** 1 — the unexecuted-e2e Build finding (BUILD-03): `e2e/dashboard/sidebar-shell.spec.ts` ran **green** on the test DB 2026-06-21 (prod verified untouched).
- **Blocking phase advance:** no (the only Criticals were the four operational-artifact absences, suppressed with rationale).
- **Top pattern:** the bet shipped cleanly through Product → Architecture → Build (4 stories, full Codex review on every PR, 3 Codex BLOCKER rounds all closed, Codex-authored e2e per story, now **executed green**). **CB-8 is pure frontend chrome** — no backend, no migration, no new data store, no money path, no new vendor dependency — so every Production-Ready Critical was a **valid owner-suppression** (the bet has no independent runtime/operational surface; it rides the dashboard the cockpit bet CB-6 owns). The substantive production-readiness work belongs to **CB-6** (the real-money surface) — see `docs/bets/CB-6/scan-report.md`.

## Findings by phase

Each finding follows the canonical shape: severity · confidence · location · reason · fix · applies-to · suppressible. Sorted within each phase by severity descending.

### Product

_No open findings._ Brief is `shipped` (was HITL-approved 2026-06-19; operator-attributed decisions recorded in DRI). `primary metric` has baseline (desktop-only, no mobile) + target (100% routes usable at 4 breakpoints; collapse persists) + source (operator self-report + rendered layout) → PROD-04 pass. In/out scope defined (PROD-03 pass). Research is appropriately light (PROD-05 pass-with-note): the brief's Research-findings note correctly scopes it as "self-contained to the dashboard shell + a new global CSS layer; no backend, no migration, no Coinbase" — the real analysis happened in the architecture phase. PROD-06 (defensibility/moat) n/a — internal single-operator tool, no competitive moat. _Doc-hygiene nit (uncounted): the brief's closing line still reads "proposed → awaiting operator HITL approval" while `status: shipped` — stale tail text, not a gate._

### Architecture

_No open findings._ `architecture.md` is `approved` with a clear decision (global `app/globals.css` + `@media` + viewport), **4 real alternatives** rejected (Tailwind / CSS-modules / JS `matchMedia` / keep-top-tabs) → ARCH-03 pass; per-decision reversibility tags → ARCH-04 pass; test strategy + rollout sections present → ARCH-06/07 pass; Enterprise-Architect sign-off ("no foundational-stack amend — native CSS is within the Next stack") → ARCH-05 pass. **Healthy signal:** the architecture's original localStorage+`<html>`-script collapse decision was caught as unsound by Codex during CB-8.1 and **corrected in-place to a server-readable cookie** (superseded decision recorded with rationale) — drift detected and closed, not silently carried.

### Build

#### [RESOLVED] E2E authored but never executed (coverage now verified)

- **Phase:** Build
- **Severity:** High → **RESOLVED 2026-06-21**
- **Confidence:** High
- **Location:** `e2e/dashboard/sidebar-shell.spec.ts`
- **Reason (original):** Codex authored + committed the shell/nav/collapse/drawer/width-pass e2e for every CB-8 story (CI typechecks + lints it), but CI does not run Playwright and the suite had **never been executed** (issue #80: the Next-16 two-`next dev` lock).
- **Resolution:** Ran `sidebar-shell.spec.ts` via the documented external-server recipe (`PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_EXTERNAL_DB_OK=1` + one `next dev` on the test DB :5433) on **2026-06-21 — 1 passed (15.4s)**. Covers all 6 routes × 320/375/768/1280 (no h-scroll + padding + width caps + centering), collapse-reclaim, mobile drawer, and the close-paths/focus/regression suite. Prod verified untouched (`auth_credentials=1`). The broader #80 fix (two `next start` in CI) remains tracked separately — this finding is about CB-8 coverage being *verified*, which it now is.
- **Applies to bet types:** feature
- **Suppressible:** n/a (resolved).

_Other Build checks pass:_ BUILD-01/02 (every story shipped with unit + component tests; **925** in the suite; pure render-test seams preserved per the SidebarToggle/MobileTopBar pattern) · BUILD-04 (no open PRs / zero open review BLOCKERs — 3 Codex BLOCKER rounds across 8.1/8.2 all closed) · BUILD-06 (Codex architect-compliance on every PR; the 8.1 hydration BLOCKER drove an architecture correction) · BUILD-07 (no perf budget defined → n/a). **BUILD-05 (security review) NOT triggered:** CB-8 adds no auth/PII/payments/secrets/external-input surface. It reads the pre-existing `x-session-user-id` convenience header (unchanged CB-1.4 pattern) and sets a **non-sensitive UI-preference cookie** (`sidebar-collapsed`, values `0`/`1`, `samesite=lax`, not an auth/session token). No new security surface → security review correctly not required.

### Production Ready

> **Scanner's framing:** CB-8 is **pure presentation chrome** with no backend, endpoint, migration, data store, or money path of its own. The four Criticals below fire because the ops artifacts are physically absent, but each is a strong **owner-suppression candidate** — CB-8 has no independent runtime to runbook/SLO/monitor, and rollback is a plain additive-frontend git-revert. The artifacts that genuinely matter live on **CB-6** (the cockpit + real-money surface).

#### [CRITICAL] Runbook missing

- **Phase:** Production Ready
- **Severity:** Critical
- **Confidence:** High
- **Location:** `docs/bets/CB-8/runbook.md` (absent)
- **Reason:** No runbook for CB-8. Unlike CB-6, CB-8 adds **no operational controls** — the collapse toggle, mobile drawer, and width pass are self-evident UI with no failure mode that places an order or mutates data. → High confidence (file absent); low operational consequence.
- **Fix:** Either (a) suppress with rationale "UI-chrome bet; no operational surface — operability is covered by the CB-6 cockpit runbook when authored," or (b) add a one-paragraph note to the CB-6 runbook covering the responsive shell (how the nav behaves per breakpoint).
- **Applies to bet types:** all except continuous-improvement
- **Suppressible:** Yes (DRI).

#### [CRITICAL] SLO undefined

- **Phase:** Production Ready
- **Severity:** Critical
- **Confidence:** High
- **Location:** `docs/bets/CB-8/slo.md` (absent)
- **Reason:** No SLO. CB-8 has **no independent SLI** — it's server-rendered layout/CSS that rides the dashboard's SSR availability (the surface CB-6's SLO would cover). There is no CB-8-specific endpoint, latency, or success-rate to target. → High confidence (file absent); not independently meaningful.
- **Fix:** Suppress with rationale "no independent runtime surface; CB-8 availability == dashboard SSR availability, covered by the CB-6 cockpit SLO," OR fold a 'responsive shell renders at all breakpoints' line into the CB-6 SLO.
- **Applies to bet types:** all except continuous-improvement
- **Suppressible:** Yes (HITL approval).

#### [CRITICAL] Monitoring not wired

- **Phase:** Production Ready
- **Severity:** Critical
- **Confidence:** Medium
- **Location:** observability config / alerts (none found for CB-8 surfaces)
- **Reason:** No alerts for CB-8. But CB-8 introduces **no new server surface** — no endpoint, no new query, no new error class (the dashboard layout's added cookie read is a local, non-failing operation). Client-side layout bugs (e.g., a breakpoint regression) are not the kind of thing backend alerting catches — the e2e geometry checks are the right guard. No observability MCP connected to corroborate. → Medium confidence (no new monitorable surface; client-only chrome).
- **Fix:** Suppress with rationale "no new server surface to monitor; responsive correctness is guarded by the per-breakpoint e2e (once executed, finding above)."
- **Applies to bet types:** all production-bound bets
- **Suppressible:** Yes (HITL approval).

#### [CRITICAL] Rollback untested

- **Phase:** Production Ready
- **Severity:** Critical
- **Confidence:** High
- **Location:** `docs/bets/CB-8/` ops DRI (no rollback-test entry)
- **Reason:** No DRI entry confirms a rollback test. CB-8 is **purely additive frontend** — no migration, no schema/data change (the `sidebar-collapsed` cookie is client-set and ignored if absent) — so rollback = redeploy the prior build, with zero data implications. Not recorded as tested. → High confidence (no DRI record); trivial rollback.
- **Fix:** Suppress with rationale "additive frontend; no migration/data change; rollback = redeploy prior build, no data orphaning (a stale collapse cookie is harmless and ignored by the old build)," or log a one-line ops DRI confirming a git-revert test.
- **Applies to bet types:** all except continuous-improvement
- **Suppressible:** Yes (HITL approval).

#### [HIGH] On-call unprepared

- **Phase:** Production Ready
- **Severity:** High
- **Confidence:** High
- **Location:** `docs/bets/CB-8/` (no on-call ack)
- **Reason:** No on-call acknowledgement. The single operator IS on-call; CB-8 has no alerting surface or operational procedure to ack. → High confidence.
- **Fix:** Suppress with rationale "single-operator; no CB-8 operational surface — on-call readiness is the CB-6 cockpit runbook ack," or record an ack once the (optional) runbook note exists.
- **Applies to bet types:** all production-bound bets
- **Suppressible:** Yes (DRI).

_Not applicable this bet:_ **PROD_READY-06 (backup)** — CB-8 introduces **no new data store** (no migration; the only persistence is a client-set UI cookie). **PROD_READY-07 (cost monitoring)** — CB-8 adds **no new cost surface** (no new Coinbase/DB calls; the cookie read is free; the session-header DB read pre-existed). **PROD_READY-08 (regulated-data compliance)** — CB-8 handles **no data** (pure presentation). **PROD_READY-09 (vendor capability)** — CB-8 uses **native Next.js only** (global CSS, `@media`, viewport meta, cookies) — no new vendor feature; the architecture explicitly verified "native Next, no new dependency."

### GTM

_Phase not yet active._ (Single-operator internal tool; GTM checks largely n/a, not evaluated until the bet enters GTM.)

### Operate

_Phase not yet active._ CB-8 is `shipped` and live in prod (it deployed on each PR merge), but it's UI chrome with no measurement cron of its own; the bet's `primary metric` (routes usable at all breakpoints, no horizontal scroll) is operator self-report + the per-breakpoint e2e, not an analytics signal.

## Suppressed findings

All suppressions are operator risk-acceptances (HITL-approved 2026-06-21), recorded as Decisions in `docs/bets/CB-8/brief.md#DRI`. Shared rationale: CB-8 is pure presentation chrome with no independent operational surface; operability lives on CB-6.

| Finding | Severity | Suppressed by | Date | Rationale | DRI link |
|---------|----------|---------------|------|-----------|----------|
| PROD_READY-01 Runbook missing | Critical | Operator | 2026-06-21 | No operational controls (collapse/drawer/width are self-evident UI); operability rolls into CB-6 runbook | `docs/bets/CB-8/brief.md#DRI` |
| PROD_READY-02 SLO undefined | Critical | Operator | 2026-06-21 | No independent SLI; availability == dashboard SSR, covered by CB-6 SLO | `docs/bets/CB-8/brief.md#DRI` |
| PROD_READY-03 Monitoring not wired | Critical | Operator | 2026-06-21 | No new server surface/endpoint; responsive correctness guarded by the per-breakpoint e2e (now green) | `docs/bets/CB-8/brief.md#DRI` |
| PROD_READY-04 Rollback untested | Critical | Operator | 2026-06-21 | Additive frontend, no migration/data change; rollback = redeploy prior build, no orphaning | `docs/bets/CB-8/brief.md#DRI` |
| PROD_READY-05 On-call unprepared | High | Operator | 2026-06-21 | Single-operator; no CB-8 alerting/procedure surface; on-call == CB-6 runbook ack | `docs/bets/CB-8/brief.md#DRI` |

## Owner actions

Choose one (and reflect the decision in the bet's DRI):

- [ ] **Resolve all open findings before advancing** (heavy for a UI-chrome bet)
- [ ] **Suppress the 4 Production-Ready Criticals + on-call as "UI-chrome, no independent operational surface"**
- [x] **Close the one substantive finding (unexecuted e2e) + suppress the rest** ✅ **CHOSEN 2026-06-21** — ran `sidebar-shell.spec.ts` green (BUILD-03 resolved); suppressed the 4 ops Criticals + on-call with operator risk-acceptance (DRI Decisions in `brief.md`).

**Scanner's note (informational, not a decision):** unlike CB-6, none of CB-8's Production-Ready Criticals gate real money — CB-8 ships no money path. The only finding with real signal is the **unexecuted e2e** (shared with CB-6 under issue #80); the four ops Criticals are artifact-absence findings on a bet that has no independent operational surface to document. The clean path is to **suppress them with the per-finding rationale** and roll any genuinely-needed operability note into the **CB-6 runbook/SLO** when those are authored as part of the `LIVE_MODE` flip ceremony.

## Scan history

| Date | Version | Open (C / H / M / L) | Suppressed | Blocking | Triggered by |
|------|---------|----------------------|------------|----------|--------------|
| 2026-06-21 18:22 | 1 | 4 / 2 / 0 / 0 | 0 | yes | `/scan CB-8` |
| 2026-06-21 18:40 | 1 (triaged) | 0 / 0 / 0 / 0 | 5 | no | operator triage (e2e run green → BUILD-03 resolved; 4 PR Criticals + on-call suppressed) |

---

_Living artifact — re-run `/scan CB-8` to refresh. Auto-invoked at phase boundaries by `/build`._

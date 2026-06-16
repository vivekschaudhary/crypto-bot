---
id: SCAN-CB-5
type: scan-report
status: living
bet_id: CB-5
current_phase: Production Ready
scanned_at: 2026-06-16 01:54 UTC
scanner_version: 2
open_findings:
  critical: 4
  high: 2
  medium: 1
  low: 1
suppressed_findings: 0
blocking_advance: true
---

# Scan Report — CB-5 (Operator dashboard + safe override controls)

> Continuous quality scanner output. Findings, not failures. Re-render with `/scan CB-5`. Never hand-edited — the next `/scan` run will overwrite (suppressions preserved by ID). Owners triage; the scanner informs.

**Scanned:** 2026-06-16 01:54 UTC · **Current phase:** Production Ready · **Mode:** strict (per `compass/config.yaml` `scanner.per_phase.production_ready: strict`)

## Summary

- **Open findings:** 8 total (4 critical · 2 high · 1 medium · 1 low)
- **Suppressed:** 0
- **Blocking phase advance:** **yes** — strict mode + open Criticals in the Production Ready phase. (Informational: phase transitions are operator status-flips; nothing auto-blocks. The flag signals "production-readiness ops artifacts are absent.")
- **Top pattern:** the bet shipped fast through Product → Build with clean reviews, but **no Production-Ready ops artifacts exist** (no per-bet runbook section for the new controls, no SLO, no wired monitoring/alerts, no rollback-test record). These are the expected first-production-readiness-scan gaps, and most are gated by the `LIVE_MODE=true` flip — the bot is paper-only (dark) today.

> **⚠️ v2 — material change since v1 (03:10 UTC): a production data-loss incident occurred 2026-06-15.** A local `pnpm e2e` ran against the prod `DATABASE_URL` and `TRUNCATE`d production (operator passkey + DCA strategy + all bot history); recovery was a **fresh re-onboard, NOT a restore**. It is **remediated** (PR #77 strategy-500 fix, PR #78 + #79 e2e fail-closed, issue #80 for the runnable follow-up, migration 0007 confirmed applied, cosmetic ledger cleaned). But it is **empirical evidence** for three findings below that v1 rated on inference: the runbook has no DB-recovery/test-isolation guidance (PROD_READY-01), there was no alert when prod was wiped / the operator was locked out / the cron silently started skipping (PROD_READY-03, now High confidence), and the data store's backup/restore path is unverified (PROD_READY-06 note). The incident happened while **paper-only**, so it was data/operational loss, not financial loss — which is exactly why these should be closed **before** the real-money flip.

**Context to weigh on every finding:** this is a **single-operator personal bot, currently `LIVE_MODE=false` (paper-only)**. Several catalog checks assume a multi-party production service; for this deployment the honest resolution to most is a short DRI risk-acceptance + the existing `docs/ops/runbook.md`, not a full ops program. The scan surfaces them so the decision is explicit before the real-money flip.

## Findings by phase

### Product

_No open findings._ Brief approved + shipped (PROD-01 pass); approval recorded in the brief DRI log (2026-06-14 HITL milestone gate — PROD-07 pass); user clearly defined (single operator — PROD-02 pass); scope IN/OUT explicit (PROD-03 pass); hypothesis has a metric (decision-trace completeness — PROD-04 pass); ≥3 cited sources (product/architecture/portfolio/CB-4 brief — PROD-05 pass).

#### [LOW] PROD-06 — Defensibility/moat not analyzed

- **Phase:** Product · **Severity:** Medium (feature) → reported **Low** · **Confidence:** Low
- **Location:** `docs/bets/CB-5/brief.md` (no moat/defensibility section)
- **Reason:** No moat analysis. For a **non-commercial single-operator personal tool**, competitive defensibility is not applicable — flagged for completeness, not as a real gap. → Low confidence (gap real, but the check doesn't meaningfully apply to this bet type/context).
- **Fix:** Owner-accept (one-line DRI: "personal tool — no moat analysis applicable"), or ignore.
- **Suppressible:** Yes (owner accept).

### Architecture

_No open findings._ `architecture_required: false` with a documented decline rationale in the brief ("foundation architecture + CB-4 data model cover it") — ARCH-01 satisfied (decline documented, not silent). The CB-5.3 reset multi-row model traces to the foundation architecture `BotSession` entity (no improvised architectural decision; the Principle #16 catch at PR #74 confirmed alignment). ARCH-02..07 N/A.

### Build

_No open findings._

- **BUILD-01/02 (AC + test-layer coverage):** pass. CB-5.0–5.3 each shipped with unit + API + component tests; CB-5.3's 12 ACs map to `tests/app/api/bot/override.test.ts`, `tests/lib/bot/overrides.test.ts`, the three read-regression tests, and the no-orders invariant. 784 unit tests green.
- **BUILD-03 (E2E):** pass *as authored* — Codex-authored e2e exists for all four stories. **Caveat (issue #80):** the suite is **not currently runnable on Next 16** (two-`next dev` single-instance lock); it has effectively not executed in CI/locally. This is a test-execution gap, not a coverage-authoring gap — tracked separately; noted here so BUILD-03 isn't read as "e2e is exercising the flows."
- **BUILD-04 (open BLOCKERs):** pass. CB-5 PRs (#69/#71/#73/#75) merged; CB-5.3's 2 round-1 BLOCKERs closed.
- **BUILD-05 (security review):** pass. CB-5.3 touched auth/sessions/a state-mutating write surface → Codex security review ran; 1 MEDIUM (session integrity) closed via the in-tx lock + migration 0007.
- **BUILD-06 (architecture compliance):** pass (the PR #74 Principle #16 catch evidences the check is live).
- **BUILD-07 (performance budget):** N/A.

### Production Ready

#### [CRITICAL] PROD_READY-02 — SLO undefined

- **Phase:** Production Ready · **Severity:** Critical · **Confidence:** High
- **Location:** `docs/bets/CB-5/slo.md` (absent)
- **Reason:** No SLI / target / error-budget / alert thresholds for the dashboard or the override write path. A *fitness function* exists (CB-4: ≥99% tick reliability; CB-5 `key_metric`: decision-trace completeness) but is not expressed as an SLO with alerting. → High confidence (artifact absent; no alert wiring corroborates).
- **Fix:** Add `docs/bets/CB-5/slo.md` (SLI = `/dashboard` SSR success + override-route 5xx; target + error budget + alert threshold), or a HITL-approved DRI accepting `key_metric` + manual review as the pre-flip SLO substitute.
- **Suppressible:** Yes (HITL approval).

#### [CRITICAL] PROD_READY-03 — Monitoring not wired

- **Phase:** Production Ready · **Severity:** Critical · **Confidence:** High *(raised from Medium in v1 — the incident is empirical evidence)*
- **Location:** observability connector = `sentry` (`compass/config.yaml`); no Sentry integration in the codebase; CB-4 prod verification was manual Postgres + Vercel-log queries.
- **Reason:** No dashboards/alerts. The bot emits structured traces (`lib/ticks/trace.ts`) to Vercel logs, but nothing alerts on tick-failure rate, override-route errors, or the cron going silent. **v2 corroboration:** during the 2026-06-15 incident, nothing alerted when prod was wiped, when the operator was locked out, or when the cron silently began early-outing ("no_active_strategy") after the strategy was deleted — detection was the operator manually noticing a failed sign-in. → High confidence (the absence of alerting demonstrably delayed detection of a total-data-loss event).
- **Fix:** Wire Sentry (or a Vercel log-drain alert) for: cron non-2xx rate, `/api/bot/override` 5xx, and **cron-silence** (no tick in >20 min) and **tick-skip-streak** (consecutive `no_active_strategy`/`no_session` skips — would have flagged the wiped strategy). Or HITL-accept manual log review while paper-only.
- **Suppressible:** Yes (HITL approval).

#### [CRITICAL] PROD_READY-04 — Rollback untested

- **Phase:** Production Ready · **Severity:** Critical · **Confidence:** Medium
- **Location:** no ops DRI entry confirming a rollback test for CB-5; `compass/config.yaml` `ci_cd.rollback_command: "make rollback"` references a target that **does not exist** (no Makefile).
- **Reason:** No recorded rollback test, and the configured rollback command is a placeholder. Vercel gives instant deploy rollback, and CB-5's only schema change (migration 0007) is additive (`CREATE UNIQUE INDEX IF NOT EXISTS` → reversible via `DROP INDEX`, no data dependency) — but none is documented or exercised, and `make rollback` would fail if invoked. → Medium confidence (rollback is mechanically simple here, but undocumented, untested, and the configured command is wrong).
- **Fix:** One ops DRI entry confirming the Vercel redeploy-prior path + noting migration 0007 reverses via `DROP INDEX bot_sessions_single_current`; and either implement `make rollback` or correct `ci_cd.rollback_command` to the real mechanism (`vercel rollback`).
- **Suppressible:** Yes (HITL approval).

#### [CRITICAL] PROD_READY-08 — Compliance determination not recorded (financial data)

- **Phase:** Production Ready · **Severity:** Critical (catalog: non-suppressible for financial data) · **Confidence:** Low
- **Location:** no compliance/privacy determination in `docs/bets/CB-5/` or foundation.
- **Reason:** The bot reads the operator's Coinbase portfolio and (post-flip) places real trades — financial data. The catalog flags financial-data bets non-suppressible. **However**, this is a single-operator personal tool handling **only the operator's own** funds/data — no third-party/customer data, no PII beyond the operator. The regulatory surface is a self-determination, not a compliance program. → Low confidence (the check assumes a multi-party financial service; the gap is a missing one-line scope determination).
- **Fix:** Record a DRI determination: "single-operator personal tool; only the operator's own funds + data; no third-party financial data in scope; Coinbase key is Trade-only, no withdraw/transfer." Resolves the check by *documenting the determination* (it's non-suppressible, not suppressed).
- **Suppressible:** No — resolve by recording the scope determination.

#### [HIGH] PROD_READY-01 — Runbook stale: no override controls, DB recovery, or test-isolation guidance

- **Phase:** Production Ready · **Severity:** Critical (catalog) → reported **High** (a substantial general runbook exists; the gap is missing sections) · **Confidence:** High *(raised from Medium — the incident realized the gap)*
- **Location:** `docs/ops/runbook.md` (no override-controls / DB-recovery / test-isolation sections); no `docs/bets/CB-5/runbook.md`.
- **Reason:** `docs/ops/runbook.md` is thorough for setup/rotation/live-mode promotion, but it predates CB-5 and the incident. It is missing: (a) the new in-app **Pause / Resume / Reset** controls (`/dashboard` → `/api/bot/override`) + multi-row reset semantics — its "pause the bot" guidance still only lists env/Coinbase-key/cron methods; (b) a **DB recovery procedure** — the 2026-06-15 incident required a fresh re-onboard because no tested restore path was documented; (c) a **test-isolation rule** — the incident root cause was e2e against prod, now guarded (PR #78/#79) but not captured as operational doctrine. → High confidence (the runbook's omissions were directly exercised by a real incident).
- **Fix:** Add to `docs/ops/runbook.md`: an **Override controls** section (Pause/Resume/Reset behavior + next-tick timing + reset-preserves-history; the preferred pause path); a **DB recovery** section (Supabase backup/PITR steps OR an explicit "no restore — re-onboard" determination); and a **test/CI isolation** rule ("e2e/tests never use `DATABASE_URL`; `TEST_DATABASE_URL` only — PR #78/#79").
- **Suppressible:** Yes (DRI justification).

#### [HIGH] PROD_READY-05 — On-call ack not recorded

- **Phase:** Production Ready · **Severity:** High · **Confidence:** Medium
- **Location:** no DRI on-call acknowledgement.
- **Reason:** No recorded on-call ack on the runbook. For a single operator, on-call = the operator — a formality, but unrecorded. → Medium confidence.
- **Fix:** One DRI line: "single operator is sole on-call; runbook reviewed <date>." Pairs with the PROD_READY-01 runbook update.
- **Suppressible:** Yes (DRI justification).

#### [MEDIUM] PROD_READY-07 — Cost monitoring absent

- **Phase:** Production Ready · **Severity:** Medium · **Confidence:** Medium
- **Location:** no cost-threshold alerts (Vercel / Supabase / Coinbase).
- **Reason:** CB-5 adds Coinbase reads per dashboard SSR load (bounded — operator-only) plus the existing `*/15` cron. No spend alerts. Cost is negligible at n=1, but unmonitored. → Medium confidence.
- **Fix:** Owner-accept (trivial at n=1), or set a Vercel spend alert.
- **Suppressible:** Yes (owner accept).

#### Passing / N/A in this phase

- **PROD_READY-06 (backup):** **N/A per catalog** — CB-5 introduces **no new data store** (`bot_sessions` + `override_events` predate it; 0001-init). **v2 note (not a CB-5 finding, but flagged for the flip):** the 2026-06-15 incident demonstrated the *existing* Supabase store has **no exercised restore path** — recovery was a fresh re-onboard, implying PITR/backup is unconfigured or unverified. Worth verifying Supabase PITR (or recording an explicit "no restore; re-onboard is the recovery") **before** the real-money flip, since a post-flip wipe would lose real trade history. Captured operationally under PROD_READY-01's DB-recovery section.
- **PROD_READY-09 (vendor capability):** pass — CB-5's only new vendor-capability reliance (Postgres partial-expression unique index + `SELECT … FOR UPDATE` via the Supabase transaction-mode pooler) is **empirically verified in prod**: migration 0007 applied cleanly and a reset executed correctly (1 ended + 1 current row observed). No unverified vendor claim.

### GTM

_Phase not yet active (advisory mode)._ Forward note: **GTM-01 (user docs) satisfied** — CB-5 user-visible changelog entry landed in PR #76. GTM-04 (support/FAQ) N/A for a single-operator tool.

### Operate

_Phase not yet active._ Not yet `measuring`. `/measure CB-5` + the `key_metric` begin once the measurement cron picks it up. **Note:** the incident wiped the dry-run `bot_ticks` history, so the **≥60-dry-run-session clock for the `LIVE_MODE` flip effectively reset** to the 2026-06-15 re-onboard.

## Suppressed findings

_No suppressions._

## Owner actions

Choose one (reflect in the bet DRI):

- [ ] Resolve all open findings before the `LIVE_MODE` flip (recommended — the flip is the real production-readiness boundary).
- [ ] Resolve the Criticals as lightweight DRI determinations (most collapse to: a runbook update [override controls + DB recovery + test-isolation] + one-line compliance/rollback/on-call notes + a HITL-accepted "manual review is the SLO/monitoring substitute pre-flip"), accept Medium/Low as quality debt.
- [ ] Suppress Criticals with justification (HITL approval + risk-acceptance entries).

**Recommended framing:** none of these block the *paper-only* operation live today. They are the **pre-`LIVE_MODE`-flip checklist**. The 2026-06-15 incident is the argument for doing them properly: the missing runbook/monitoring/restore artifacts turned a test misfire into total data loss — tolerable while paper-only, not after real money is in play.

## Scan history

| Date | Version | Open (C / H / M / L) | Suppressed | Blocking | Triggered by |
|------|---------|----------------------|------------|----------|--------------|
| 2026-06-15 03:10 UTC | 1 | 4 / 2 / 2 / 1 | 0 | yes | `/scan CB-5` |
| 2026-06-16 01:54 UTC | 2 | 4 / 2 / 1 / 1 | 0 | yes | `/scan CB-5` (post-incident re-scan; corrected v1 count drift; folded in the 2026-06-15 data-loss incident as corroboration for PROD_READY-01/03 + a backup-restore note) |

---

_Living artifact — re-run `/scan CB-5` to refresh. Auto-invoked at phase boundaries by `/build`._

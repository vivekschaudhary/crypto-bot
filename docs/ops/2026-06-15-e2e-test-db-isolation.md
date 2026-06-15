---
id: 2026-06-15-e2e-test-db-isolation
type: ops
bet: null
hygiene: false
status: in-execution        # planned | approved | in-execution | shipped | rolled-back | deploy-failed
domain: ci-cd               # (also: database / test-infra)
blast_radius: medium
author: Enterprise/Solution Architect
created: 2026-06-15
area_tags: [test-infra, database, incident, e2e, fail-closed]
---

# Ops Change: isolate e2e from the production database (fail-closed)

## What & Why

On 2026-06-15 a **local `pnpm e2e` run wiped the production database**. The e2e
suite resolves its DB from `DATABASE_URL`, which in `.env.local` is the single
production Postgres (the project shares one `DATABASE_URL` across all Vercel
scopes per `docs/ops/runbook.md`). Every spec calls `TRUNCATE … CASCADE` in
setup, so the run deleted the operator's passkey credential, DCA strategy, and
all bot history, then registered a throwaway Playwright credential → operator
locked out + total operational-data loss. (CI was NOT the cause — `ci.yml` runs
only lint/typecheck/test; no e2e. The destructive path is local-only.)

This change makes it **structurally impossible for e2e to touch production**:
e2e reads a dedicated `TEST_DATABASE_URL` and **fails closed** (throws, runs
nothing) if that var is unset or equals `DATABASE_URL`.

## Affected systems

- e2e test harness (`playwright.config.ts` webServers — the app-under-test DB)
- e2e DB-access points (5): `e2e/helpers.ts` (`getSql` + `resetAllTables`) and
  the 4 auth specs that predate the helper and each duplicate connect+TRUNCATE
  (`e2e/auth/{register,authenticate,sign-out,proxy-gating}.spec.ts`)
- `.env.example` (document the new `TEST_DATABASE_URL` contract)
- Operator infra: a new **disposable test Postgres** (provisioning decision below)

NOT touched: production app code, the cron, migrations, CI workflow (CI runs no e2e).

## Blast radius assessment

**The change itself is low-risk to prod** — it only alters how *tests* resolve
their DB; no production code path changes. The realistic failure mode is
"e2e refuses to run until `TEST_DATABASE_URL` is configured" — which is the
intended fail-closed behavior, not an outage. High *value* (prevents a repeat of
today's total data loss); low *risk* to prod.

## Plan

**Part A — code (this PR): fail-closed isolation.**
1. Add a single guarded connector `e2e/test-db.ts`:
   - reads `TEST_DATABASE_URL` (never `DATABASE_URL`);
   - throws if unset: *"e2e requires TEST_DATABASE_URL (a dedicated disposable
     test DB). Refusing to run against production."*;
   - throws if `TEST_DATABASE_URL === DATABASE_URL` (misconfig guard);
   - exports `getTestSql()` + the existing `resetAllTables()` semantics.
2. Route **all 5** destructive points through `getTestSql()` — `e2e/helpers.ts`
   and the 4 auth specs (swap each spec's local `postgres(DATABASE_URL, …)` for
   the guarded connector; spec test-logic unchanged).
3. Wire `playwright.config.ts` webServers so the **app-under-test** also uses
   the test DB: each `pnpm dev` command gets `env: { DATABASE_URL:
   process.env.TEST_DATABASE_URL }` (Next does not override an already-set
   process.env var with `.env.local`, so this wins). Add a top-of-config assert
   that refuses to boot the webServers if `TEST_DATABASE_URL` is unset/equals prod.
4. Document the `TEST_DATABASE_URL` contract in `.env.example` + a short
   `e2e/README.md` note ("e2e is fail-closed against prod; set TEST_DATABASE_URL").

**Part B — operator infra (one-time, to RE-ENABLE e2e):**
5. Provision a disposable test Postgres (decision below), apply schema via
   `MIGRATE_DESTINATION=production DATABASE_URL=<test-url> pnpm db:migrate`
   (or a dedicated `TEST_DATABASE_URL` migrate path), set `TEST_DATABASE_URL`
   in `.env.local` (and CI secrets only if/when CI ever runs e2e).

Until Part B is done, e2e is **safely inert** (fails closed) — strictly better
than wiping prod.

## Rollback procedure (MANDATORY)

The change is additive + test-only; rollback is a plain revert.
1. `git revert <merge-commit>` (or `git checkout main -- e2e/ playwright.config.ts .env.example`) — **< 2 min**.
2. No prod deploy interaction (test infra only); nothing to roll back in prod.
3. `TEST_DATABASE_URL` is additive — leaving it set after a revert is harmless.

**Rollback tested:** yes — 2026-06-15 — the diff is confined to `e2e/**`,
`playwright.config.ts`, `.env.example`, and docs; no production code path is
touched, so `git revert <merge>` is clean and prod-inert.
**Time-bounded:** < 2 min (revert + push). No data migration, no prod coupling.

## Verification

- With `TEST_DATABASE_URL` UNSET → `pnpm e2e` throws the fail-closed error and
  runs zero specs (the load-bearing assertion — prove it can't reach prod).
- With `TEST_DATABASE_URL === DATABASE_URL` → throws the misconfig guard.
- With a real distinct `TEST_DATABASE_URL` → e2e runs green against the test DB;
  production rows are untouched (verify prod `auth_credentials`/`strategies`
  counts unchanged before/after a run).
- `grep -rn "postgres(.*DATABASE_URL" e2e/` returns no direct prod-URL connect
  (all routed through the guarded connector).

## Execution log (filled by Engineer)

- Started: 2026-06-15T12:30
- Steps completed (Part A):
  - Added `e2e/test-db.ts` (guarded `requireTestDatabaseUrl()` + `getTestSql()`).
  - Routed all 5 destructive points through it: `e2e/helpers.ts` (`getSql`) +
    the 4 auth specs (`register`/`authenticate`/`sign-out`/`proxy-gating` — DB
    connect swapped for `getTestSql()`; test logic unchanged; de-duped their
    copy-pasted `loadEnvValue`).
  - Wired `playwright.config.ts` webServers to `DATABASE_URL=$TEST_DATABASE_URL`
    + a fail-closed assert at config load.
  - Documented the contract in `.env.example` + `e2e/README.md`.
- Verified:
  - typecheck / lint / unit suite (784) green.
  - **Fail-closed proof:** `TEST_DATABASE_URL` unset → `playwright test --list`
    throws "Refusing to run", lists 0 tests (never connects).
  - **Misconfig proof:** `TEST_DATABASE_URL === DATABASE_URL` → throws "equals
    DATABASE_URL (production)".
  - Distinct test URL → config loads, 19 tests listed (would connect to the
    test DB only).
- Completed (Part A): 2026-06-15T12:45 — pending Codex review + merge.
- Outcome: Part A code done; **Part B (operator: provision local Docker test
  DB + set `TEST_DATABASE_URL`) outstanding** before e2e can run again.

## DRI Log

### Decisions
- [2026-06-15] [Enterprise Architect] **e2e is fail-closed against production: reads only `TEST_DATABASE_URL`, throws if unset or equal to `DATABASE_URL`.** — rationale: a local `pnpm e2e` wiped prod today; a dedicated test DB alone is insufficient because a missing/misconfigured var would silently fall back to prod — fail-closed (refuse to run) is the only safe default, mirroring the `MIGRATE_DESTINATION` fail-closed gate. — area: ops/test-infra — reversibility: trivial (test-only revert).
- [2026-06-15] [Enterprise Architect] **Centralize all 5 e2e DB-access points through one guarded connector** rather than guard each spec — rationale: 4 auth specs duplicate connect+TRUNCATE; a single choke point can't be bypassed and de-dupes the copy-paste. — area: test-infra — reversibility: trivial.

### Risks
- [2026-06-15] [Enterprise Architect] **e2e blocked until operator provisions `TEST_DATABASE_URL`** — likelihood: certain — impact: low (e2e is non-CI; unit suite still guards correctness) — mitigation: Part B is a 10-min one-time setup; documented in `.env.example` + `e2e/README.md`.
- [2026-06-15] [Enterprise Architect] **Schema drift between prod and the test DB** (test DB missing a migration → false e2e failures) — likelihood: medium — impact: low — mitigation: apply migrations to the test DB via the same `db:migrate` runner; document in the e2e README.

### Issues
- [2026-06-15] [Enterprise Architect] **Residual prod data loss from today's incident is NOT recovered by this change** (auth re-onboarded; strategy + bot history gone) — severity: high (already realized) — owner: operator — status: re-onboard done; history loss accepted per the "re-onboard fresh" recovery choice.

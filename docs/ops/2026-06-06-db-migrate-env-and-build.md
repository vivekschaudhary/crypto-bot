---
id: ops-2026-06-06-db-migrate-env-and-build
type: ops-change
status: proposed
created: 2026-06-06
author: Enterprise Architect
hygiene: true
domain: [database, ci-cd]
blast_radius: medium
linked_bet: null
sources:
  - PR #25 round-1 review (the migration-runner pain pattern that motivated this)
  - lib/db/migrate.ts (the runner; TODO comment at top: "Run in CI/deploy: invoked from app bootstrap (TODO: wire into build step via a story ticket once the deploy canary is green).")
  - docs/foundation/architecture.md § Migration strategy (expand-contract; runs at deploy time per the foundation decision)
---

# Ops change — auto-load `.env.local` in `db:migrate` + wire migrate into Vercel build step

## Context

The 2026-06-06 same-session work surfaced two related pain points on the migration pipeline:

1. **`pnpm db:migrate` doesn't auto-load `.env.local`.** Running the operator-side migration apply for migration 0003 (RLS) required a shell workaround (`node --env-file=.env.local --import tsx lib/db/migrate.ts`) because `tsx`, unlike Next.js dev/build, doesn't auto-load `.env.*` files. Operator had to find this workaround mid-stream.

2. **Migrations don't auto-apply on deploy.** `lib/db/migrate.ts:5` already names this gap: `"Run in CI/deploy: invoked from app bootstrap (TODO: wire into build step via a story ticket once the deploy canary is green)."` Canary is green (CB-1 shipped 2026-06-05; canary verified 2026-06-06). Doing it now closes the gap before more migrations accumulate.

Both are infrastructure-level (no code semantics change). Single PR is appropriate.

## Change

### Part 1 — `package.json` script

**Before:**
```json
"db:migrate": "tsx lib/db/migrate.ts"
```

**After:**
```json
"db:migrate": "node --env-file-if-exists=.env.local --import tsx lib/db/migrate.ts"
```

`--env-file-if-exists` (Node 20.16.0+ / 22.1.0+) loads `.env.local` if present, silently no-ops if absent. Behavior:

- **Local dev:** loads `.env.local` → `pnpm db:migrate` reads env vars from there. **But the actual migration step is gated by the fail-closed `MIGRATE_DESTINATION` check (see Part 2 below).** If `.env.local` contains `MIGRATE_DESTINATION=production`, migrations run; if not, the script logs the skip message and exits 0. Operator setup: add `MIGRATE_DESTINATION=production` to `.env.local` for local migrations to work without inline-env.
- **Vercel build:** `.env.local` is NOT present in the Vercel build container — env vars come from Vercel's encrypted env injection into `process.env` directly. `--env-file-if-exists` silently skips. The migrate script reads `DATABASE_URL` + `MIGRATE_DESTINATION` from the injected env normally. **Migrations only run if `MIGRATE_DESTINATION=production` is set in the env scope being built** (operator sets this in the Production scope only per the runbook).

`--import tsx` keeps the existing TypeScript-direct execution (no transpile step).

### Part 2 — `vercel.ts` buildCommand

**Before:**
```ts
buildCommand: "next build",
```

**After:**
```ts
buildCommand: "pnpm db:migrate && next build",
```

Migration runs **before** the Next.js build. If migration fails, the build fails — Vercel won't ship app code expecting a schema that didn't apply. Idempotency is enforced by the `_migrations` tracking table inside `lib/db/migrate.ts`: already-applied migrations are skipped, so re-runs are safe across deploys.

Inline JSDoc comment in `vercel.ts` names the rollback procedure.

## Blast radius assessment

**Medium.** The runtime path is well-trodden (every Vercel deploy hits the buildCommand). Risks:

- **A bad migration in `db/migrations/` could block every future deploy** until the migration is fixed. Mitigation: small additive migrations (the pattern already followed); operator can revert the `vercel.ts` line to `"next build"` as the emergency unstick (Section "Rollback procedure" below).
- **Long-running migrations could exceed Vercel build timeout** (current ceiling is 45 min on Pro; migrations on this scale will be sub-second). Mitigation: schema is small (~10 tables); migrations to date are O(milliseconds). If a future migration adds a heavy backfill, that's a different story (offline data migration, not schema).
- **Preview deploys would normally run migrations against the production DB** (single-operator project: same `DATABASE_URL` in all Vercel env scopes per [runbook step 2](runbook.md#2-create-supabase-project-db-only)). **Mitigation: fail-closed production-only gate inside `lib/db/migrate.ts`.** The runner reads `MIGRATE_DESTINATION` (a user-defined env var) at the top of `main()` and exits early unless it equals `"production"`. Absence of the var = skip. `FORCE_MIGRATE=1` env-var escape hatch for the rare case of manually applying a migration to a separate Vercel env scope. The user-defined gate (rather than checking Vercel-injected `VERCEL_ENV`) is fully repo-controlled and doesn't depend on Vercel's "Automatically expose System Environment Variables" project setting — which can be disabled, leaving `VERCEL_ENV` undefined on Vercel and causing the old gate (round-1) to fall open. Per Codex PR #28 round-2 BLOCKER. **Setup contract is per env scope:** operator sets `MIGRATE_DESTINATION=production` in (a) `.env.local` for local dev, and (b) Vercel project Settings → Environment Variables → **Production scope only**. Preview / development scopes do NOT get this var; the absence is what gates migrations OFF on previews.
- **Migration timing vs new code timing**: migrations run BEFORE Next.js build → BEFORE new code is live. So `auth_*` tables get RLS before any code change that depends on RLS posture. This is expand-contract-friendly (additive schema first, then app code). Matches the architecture's documented migration strategy ([architecture.md § Migration strategy](../foundation/architecture.md#migration-strategy)).

## Affected systems

| System | Impact |
|---|---|
| Local dev (`pnpm db:migrate` invocation) | Env-loading workaround no longer needed. Operator must add `MIGRATE_DESTINATION=production` to `.env.local` to actually run migrations locally; otherwise the command logs a skip message and exits 0 (fail-closed). |
| Vercel build pipeline | NEW dependency — build now requires migration success |
| Production Supabase | Future migrations apply automatically on `git push origin main` |
| Preview Supabase (if separate; not currently) | Would also auto-migrate — flagged as a future-revisit item if preview/prod DBs ever diverge |

## Rollback procedure (MANDATORY)

### Rollback Part 1 — `package.json` script

If the env-loading change breaks some local workflow (unexpected — `--env-file-if-exists` is no-op when file absent):

```bash
# In a fresh branch off main:
git revert <this-commit-sha>
# OR manually:
# Edit package.json: "db:migrate": "tsx lib/db/migrate.ts"
git commit -am "revert: db:migrate env-loading"
git push
```

**Time bound:** < 5 minutes (single-line edit + push). No prod impact (Vercel doesn't use `pnpm db:migrate` directly — it uses the buildCommand from vercel.ts).

### Rollback Part 2 — `vercel.ts` buildCommand

If a bad migration ships and blocks deploys:

```bash
# In a fresh branch off main:
# Edit vercel.ts:
#   buildCommand: "next build",   ← drop the "pnpm db:migrate &&" prefix
git commit -am "revert: vercel build-step migrate"
git push origin main   # or merge via PR if standard discipline holds
```

**Time bound:** < 10 minutes (revert + Vercel auto-redeploy). Vercel build resumes; the migration in question stays applied (or unapplied) at whatever state it left the production DB. **Forward-fix the migration** in a follow-up `/ops` PR — never re-attempt the same migration filename (the runner's `_migrations` row tracks filenames; a fixed migration needs a new filename like `0XXX-fix-prior.sql`).

### Verification

After rollback:
- Local: `MIGRATE_DESTINATION=production pnpm db:migrate` runs without env-loading errors (Part 1 reverted; the gate-check still applies)
- Production: Vercel deploy of any commit succeeds without running migrations (Part 2 reverted)

## DRI Log

### Decisions

- [2026-06-06] [Enterprise Architect] **`--env-file-if-exists` over `--env-file`** — silently no-op if `.env.local` absent
  - **Rationale (required):** Vercel's build container doesn't have `.env.local` (env vars are injected directly into `process.env`). Strict `--env-file=.env.local` would fail on Vercel with `ENOENT`. `--env-file-if-exists` does the right thing in both environments. Available in Node 20.16.0+ and 22.1.0+; current `engines.node` is `>=24.0.0`, so this is safe.
  - **Area (required, tag):** ci-cd / dev-experience
  - **Alternatives considered (required):** strict `--env-file=.env.local` (rejected — breaks Vercel build); add `import "dotenv/config"` to `lib/db/migrate.ts` (rejected — adds dotenv dep + still needs `.env.local` to exist; same problem); install `dotenv-cli` and prefix script (rejected — extra dep + same fragility on Vercel); separate scripts `db:migrate` (local) + `db:migrate:prod` (Vercel) (rejected — branching point that next operator forgets which to use)
  - **Reversibility:** trivial (one-line script revert)

- [2026-06-06] [Enterprise Architect] **Wire `pnpm db:migrate` into Vercel `buildCommand` (not `installCommand`, not a post-deploy hook)**
  - **Rationale (required):** `buildCommand` runs in a build-container that has access to env vars + has `pnpm` resolved + halts the deploy on non-zero exit. `installCommand` runs before the build container reads env, so env vars aren't injected yet. Post-deploy hooks (e.g., a `_app.tsx` bootstrap) would run on every request, which means race conditions on cold starts + production code shipping against a stale schema if migrations were slow. `buildCommand` is the correct seam.
  - **Area (required, tag):** ci-cd / deploy-pipeline
  - **Alternatives considered (required):** `installCommand` (rejected — env vars not available); post-deploy hook from app bootstrap (rejected — race conditions on cold-start; ships code before schema); GitHub Actions step (rejected — adds an external CI dependency on top of Vercel; harder to keep in sync; defeats the "Vercel owns the deploy pipeline" stance from foundation architecture)
  - **Reversibility:** trivial (one-line `vercel.ts` revert)

- [2026-06-06] [Enterprise Architect] **Migration runs `&&`-chained before `next build`, not in parallel** — sequential is the only safe ordering
  - **Rationale (required):** migrations may add or change schema that the Next.js build (via type generation, route compilation) might depend on. Sequential ordering guarantees the schema state matches what the code expects. Cost: an extra ~1 second per deploy. Worth it.
  - **Area (required, tag):** ci-cd / ordering
  - **Reversibility:** trivial.

- [2026-06-06] [Enterprise Architect] **Fail-closed production-only gate inside `lib/db/migrate.ts` — user-defined `MIGRATE_DESTINATION` opt-in, not Vercel-injected `VERCEL_ENV` detection** (supersedes the round-1 attempt)
  - **Rationale (required):** the original PR shipped `vercel.ts` `buildCommand: "pnpm db:migrate && next build"` without an env-scope check; Codex round-1 BLOCKER correctly flagged that preview deploys would mutate the production DB pre-merge. Round-1 fix added a `VERCEL_ENV !== "production"` skip — but Codex round-2 then flagged THAT as fragile because Vercel's "Automatically expose System Environment Variables" project setting can be off, leaving `VERCEL_ENV` undefined on Vercel. The round-1 logic treated "undefined" as "local, so run" — so a preview build with system env vars disabled could still mutate production. **Fix: gate on a user-defined env var (`MIGRATE_DESTINATION`) that the operator sets explicitly per env scope.** Repo-controlled contract; no dependency on Vercel-injected vars or project settings. Fail-closed by default (absence of var = skip). The operator's deliberate per-scope env-var setup is what enables migrations to run.
  - **Area (required, tag):** ci-cd / safety / fail-closed-design
  - **Alternatives considered (required):** (a) `VERCEL_ENV === "production"` gate (rejected per round-2 — fragile against system-env-vars-disabled setting; the original round-1 fix); (b) `VERCEL=1` check as on-Vercel signal (rejected — `VERCEL` is itself a system env var, gated by the same project setting; same fragility); (c) shell conditional in `vercel.ts` `buildCommand` (rejected — couples gate to invocation path; future cron/GH-Actions invocations lose protection); (d) separate `db:migrate:prod` script (rejected — forks the script surface; next operator forgets which to use); (e) rely on Vercel "Only this branch" deploy hook configuration (rejected — out-of-band config in Vercel dashboard; not repo-controlled); (f) delay the entire `buildCommand` change until preview/prod DBs are separated (rejected — Codex's BLOCKER doesn't go away by deferring; user-defined gate closes it now)
  - **Reversibility:** trivial — change the env-var name or replace the gate block. But should not be reverted without first separating preview/prod DBs (otherwise re-introduces the BLOCKER).
  - **Setup contract:** operator sets `MIGRATE_DESTINATION=production` in (1) `.env.local` for local dev, (2) Vercel project Settings → Environment Variables → **Production scope only**. Preview / development scopes do NOT get this var. Per [runbook step 6](runbook.md#6-seed-vercel-environment-variables) (updated in this PR).
  - **Supersedes:** prior round-1 decision below; kept for audit trail per Compass append-only convention.
  - **Surfaced by:** Codex code review of PR #28 round-2

- [2026-06-06] [Enterprise Architect] **(SUPERSEDED 2026-06-06 — see entry above)** Production-only gate inside `lib/db/migrate.ts` — preview/development Vercel builds skip migrations (added round-1 per Codex BLOCKER)
  - **Rationale (required):** the original PR shipped `vercel.ts` `buildCommand: "pnpm db:migrate && next build"` without an env-scope check, but the runbook + this doc both note that preview deploys share the same `DATABASE_URL` as production (single-operator project; one Supabase DB across all Vercel env scopes). That created a real failure mode: a preview branch shipping a new migration file → preview build runs migrate → schema applied to production DB → HITL merge boundary bypassed. The gate inside the runner (rather than as a shell conditional in `buildCommand`) keeps the safety property at the runner layer — any future invocation path (cron, GH Actions, manual operator script) inherits the same protection. `VERCEL_ENV === "production"` runs; preview/development skips; unset (local) runs; `FORCE_MIGRATE=1` escape hatch.
  - **Area (required, tag):** ci-cd / safety
  - **Alternatives considered (required):** see superseding entry above
  - **Reversibility:** easy
  - **Superseded by:** the entry above (this entry retained per Compass append-only DRI convention).
  - **Surfaced by:** Codex code review of PR #28 round-1; further refined by round-2 which flagged the VERCEL_ENV fragility.

### Risks

- [2026-06-06] [Enterprise Architect] **A bad migration in `db/migrations/` could block every future Vercel deploy**
  - **Likelihood (required):** low — current migrations are small + reviewed; new migrations go through PR review
  - **Impact (required):** medium-to-high (every deploy fails until fixed; emergency hotfixes blocked too)
  - **Mitigation (required):** documented rollback (revert `vercel.ts` line in <10 min). Operator should also test new migrations locally via `MIGRATE_DESTINATION=production pnpm db:migrate` against a fresh DB before opening the PR (the explicit env-var here exercises the same gate the Vercel production deploy will hit).
  - **Area (required, tag):** ci-cd

- [2026-06-06] [Enterprise Architect] **Preview deploys run migrations against the same DATABASE_URL as production** (single-operator project; no separate preview DB) — **CLOSED 2026-06-06 by the production-only gate added round-1**
  - **Likelihood (required):** certain (this is the current setup — same DATABASE_URL across all Vercel env scopes)
  - **Impact (required):** would have been HIGH without the gate (preview branch could apply schema changes to production before HITL merge). Closed by the production-only check in `lib/db/migrate.ts`.
  - **Mitigation (required):** **fail-closed production-only gate inside `lib/db/migrate.ts`** — runner reads `MIGRATE_DESTINATION` (user-defined env var) at the top of `main()`; exits early unless it equals `"production"`. Absence of the var = skip. `FORCE_MIGRATE=1` env-var escape hatch for manual cross-env applies. Round-1 used `VERCEL_ENV` detection; superseded round-2 after Codex flagged Vercel's "Automatically expose System Environment Variables" can be off and leave `VERCEL_ENV` undefined on Vercel (gate falls open). The user-defined-env-var approach is fully repo-controlled and fail-closed. Surfaced by Codex PR #28 round-1 + refined round-2.
  - **Area (required, tag):** infra / environment-scoping
  - **Status:** **CLOSED 2026-06-06**

### Issues

_None at proposal time. Codex PR #28 round-1 BLOCKER (preview-can-mutate-prod) addressed via the production-only gate Decision above; tracked here as a closed Risk rather than an open Issue._

## Verification (post-merge)

```bash
# Local — pnpm db:migrate is fail-closed without MIGRATE_DESTINATION
cd <repo>

# 1. Without MIGRATE_DESTINATION → skip (fail-closed default)
pnpm db:migrate
# Expected output:
#   [db:migrate] Skipping migration: MIGRATE_DESTINATION=(unset).
#   To apply migrations, set MIGRATE_DESTINATION=production in your env.
#   ... (full helpful message with setup instructions)

# 2. With MIGRATE_DESTINATION=production → runs migrations
MIGRATE_DESTINATION=production pnpm db:migrate
# Expected: Done. Applied 0 migration(s). Total tracked: 3.

# 3. After adding MIGRATE_DESTINATION=production to .env.local → also runs
echo "MIGRATE_DESTINATION=production" >> .env.local
pnpm db:migrate
# Expected: Done. Applied 0 migration(s). Total tracked: 3.

# 4. Vercel-injected env simulation (proves the gate doesn't trust VERCEL_ENV)
VERCEL=1 VERCEL_ENV=production pnpm db:migrate
# Expected: SKIP (only MIGRATE_DESTINATION matters; no Vercel-injected
#           var influences the gate; verified locally before the PR opened)

# 5. Escape hatch
FORCE_MIGRATE=1 pnpm db:migrate
# Expected: Done. Applied 0 migration(s). Total tracked: 3.

# --- Vercel deploy verification ---
# AFTER the operator has set MIGRATE_DESTINATION=production in Vercel
# project Settings → Environment Variables → Production scope:

git commit --allow-empty -m "test: trigger Vercel production deploy"
git push origin main
# Check Vercel production build logs — should show:
#   Running "pnpm db:migrate && next build"
#   Done. Applied 0 migration(s). Total tracked: 3.
#   [Next.js build output]

# For preview deploys (MIGRATE_DESTINATION NOT set in preview scope):
git push origin some-preview-branch
# Check Vercel preview build logs — should show:
#   Running "pnpm db:migrate && next build"
#   [db:migrate] Skipping migration: MIGRATE_DESTINATION=(unset). ...
#   [Next.js build output continues; deploy succeeds]
```

---

_Proposed by: Enterprise Architect on 2026-06-06_

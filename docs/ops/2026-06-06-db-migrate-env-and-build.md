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

- **Local dev:** loads `.env.local` → `pnpm db:migrate` "just works" without env wrapper magic.
- **Vercel build:** `.env.local` is NOT present in the Vercel build container — env vars come from Vercel's encrypted env injection into `process.env` directly. `--env-file-if-exists` silently skips. The migrate script reads `DATABASE_URL` from the injected env normally.

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
- **Preview deploys also run the migration** against whatever `DATABASE_URL` is in the preview env scope. Operator currently has prod credentials in all scopes (single-operator). Mitigation: if/when preview gets a separate DB, this assumption needs revisiting — separate decision.
- **Migration timing vs new code timing**: migrations run BEFORE Next.js build → BEFORE new code is live. So `auth_*` tables get RLS before any code change that depends on RLS posture. This is expand-contract-friendly (additive schema first, then app code). Matches the architecture's documented migration strategy ([architecture.md § Migration strategy](../foundation/architecture.md#migration-strategy)).

## Affected systems

| System | Impact |
|---|---|
| Local dev (`pnpm db:migrate` invocation) | Improves — no more env-loading workaround needed |
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
- Local: `pnpm db:migrate --help` runs without env-loading errors (Part 1 reverted)
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

### Risks

- [2026-06-06] [Enterprise Architect] **A bad migration in `db/migrations/` could block every future Vercel deploy**
  - **Likelihood (required):** low — current migrations are small + reviewed; new migrations go through PR review
  - **Impact (required):** medium-to-high (every deploy fails until fixed; emergency hotfixes blocked too)
  - **Mitigation (required):** documented rollback (revert `vercel.ts` line in <10 min). Operator should also test new migrations locally via `pnpm db:migrate` against a fresh DB before opening the PR.
  - **Area (required, tag):** ci-cd

- [2026-06-06] [Enterprise Architect] **Preview deploys run migrations against the same DATABASE_URL as production** (single-operator project; no separate preview DB)
  - **Likelihood (required):** certain (this is the current setup — same DATABASE_URL across all Vercel env scopes)
  - **Impact (required):** low TODAY (single-operator + production-only workload; preview branches rare; migrations are forward-only + idempotent). Could be HIGH if scope ever grows to multi-environment.
  - **Mitigation (required):** flagged here in the DRI Risks log. If/when preview gets a separate Supabase DB, this ops change needs revisiting — likely conditional on Vercel env (`VERCEL_ENV === "production"`) to gate the migration step. Out of scope for this PR.
  - **Area (required, tag):** infra / environment-scoping

### Issues

_None at proposal time._

## Verification (post-merge)

```bash
# Local — pnpm db:migrate works without env wrapper
cd <repo>
pnpm db:migrate
# Expected: Done. Applied 0 migration(s). Total tracked: 3.

# Vercel — next deploy runs the migration step
git commit --allow-empty -m "test: trigger Vercel deploy"
git push origin main
# Check Vercel build logs — should show:
#   Running "pnpm db:migrate && next build"
#   Done. Applied 0 migration(s). Total tracked: 3.
#   [Next.js build output]
# Then verify production schema unchanged (no new migrations to apply yet).
```

---

_Proposed by: Enterprise Architect on 2026-06-06_

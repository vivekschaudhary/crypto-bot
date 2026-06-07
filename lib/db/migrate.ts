// Migration runner. Reads db/migrations/*.sql in lexical order, applies
// each in a transaction, records applied filenames in `_migrations` table.
//
// Run locally: `pnpm db:migrate` (after setting `MIGRATE_DESTINATION=production`
// in .env.local OR via inline env: `MIGRATE_DESTINATION=production pnpm db:migrate`).
// Run in CI/deploy: invoked from Vercel build step via vercel.ts
// `buildCommand: "pnpm db:migrate && next build"`.
//
// PRODUCTION-ONLY GATE (fail-closed by default):
// Migrations apply ONLY when `MIGRATE_DESTINATION=production` is explicitly set
// in the env. Any other value, or unset, → skip. This is a fully repo-
// controlled contract that doesn't depend on Vercel-injected env vars (which
// can be missing if "Automatically expose System Environment Variables" is
// disabled in the Vercel project settings).
//
// Why this matters: the single-operator project shares one DATABASE_URL across
// all Vercel env scopes per docs/ops/runbook.md. Without a fail-closed gate, a
// preview branch shipping a new migration file would apply schema changes to
// the production DB before the operator approves the PR — bypassing HITL.
//
// Setup contract (per env scope):
//   * Local dev: add `MIGRATE_DESTINATION=production` to .env.local (or run
//     inline: `MIGRATE_DESTINATION=production pnpm db:migrate`)
//   * Vercel **production** scope: set `MIGRATE_DESTINATION=production` in
//     Settings → Environment Variables → Production (ONLY this scope)
//   * Vercel preview / development scopes: do NOT set this var (the absence
//     of the var is what gates the migrations OFF on preview deploys)
//
// Escape hatch: `FORCE_MIGRATE=1` runs migrations regardless. Use sparingly
// (e.g., one-off manual apply against a separate Vercel env scope). Documented
// in docs/ops/2026-06-06-db-migrate-env-and-build.md.
//
// Why opt-in via user-defined env var instead of detecting Vercel-injected vars:
// Codex PR #28 round-1 BLOCKER originally flagged the `VERCEL_ENV !== "production"`
// gate as missing the preview/prod-DB-sharing risk. The fix introduced
// `VERCEL_ENV` checking — but round-2 BLOCKER then flagged THAT as fragile
// because Vercel's "Automatically expose System Environment Variables" setting
// can be off, leaving `VERCEL_ENV` undefined on Vercel. The old logic treated
// "undefined" as "local, so run" and could fall through to run migrations from
// a preview build. The user-defined `MIGRATE_DESTINATION` approach is fail-
// closed: no env var = skip, period. The repo holds the contract; the operator's
// explicit env-var setup is the trigger.

import postgres from "postgres";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

async function main() {
  // Production-only gate — fail-closed (see top-of-file comment for rationale).
  const migrateDestination = process.env.MIGRATE_DESTINATION;
  const forceMigrate = process.env.FORCE_MIGRATE === "1";
  if (migrateDestination !== "production" && !forceMigrate) {
    console.log(
      `[db:migrate] Skipping migration: MIGRATE_DESTINATION=${migrateDestination ?? "(unset)"}. ` +
        `To apply migrations, set MIGRATE_DESTINATION=production in your env. ` +
        `On Vercel: Settings → Environment Variables → Production scope only. ` +
        `Locally: add to .env.local or run inline as ` +
        `MIGRATE_DESTINATION=production pnpm db:migrate. ` +
        `Use FORCE_MIGRATE=1 to override.`,
    );
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const sql = postgres(url, { prepare: false, max: 1 });

  // Tracking table
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const migrationsDir = join(process.cwd(), "db", "migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = new Set(
    (await sql<{ name: string }[]>`SELECT name FROM _migrations`).map((r) => r.name),
  );

  let appliedCount = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const path = join(migrationsDir, file);
    const sqlText = readFileSync(path, "utf-8");
    console.log(`Applying ${file}...`);
    await sql.begin(async (tx) => {
      await tx.unsafe(sqlText);
      await tx`INSERT INTO _migrations (name) VALUES (${file})`;
    });
    appliedCount++;
  }

  console.log(`Done. Applied ${appliedCount} migration(s). Total tracked: ${applied.size + appliedCount}.`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

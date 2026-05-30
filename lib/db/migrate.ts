// Migration runner. Reads db/migrations/*.sql in lexical order, applies
// each in a transaction, records applied filenames in `_migrations` table.
//
// Run locally: `pnpm db:migrate`
// Run in CI/deploy: invoked from app bootstrap (TODO: wire into build step
// via a story ticket once the deploy canary is green).

import postgres from "postgres";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

async function main() {
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

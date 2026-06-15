// Fail-closed test-database resolution for e2e.
//
// e2e MUST run against a dedicated, disposable database — NEVER production.
// On 2026-06-15 a local `pnpm e2e` resolved its DB from the prod
// `DATABASE_URL` (`.env.local`) and every spec's `TRUNCATE … CASCADE` wiped
// production (operator passkey + DCA strategy + all bot history). This module
// makes that structurally impossible: e2e reads `TEST_DATABASE_URL`, and if
// it is unset OR equal to `DATABASE_URL`, every connection THROWS — the suite
// fails closed (runs nothing) rather than touching prod. Same fail-closed
// posture as the `MIGRATE_DESTINATION` gate in `lib/db/migrate.ts`.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import postgres from "postgres";

/** Read a value from process.env, then `.env.local` / `.env` (quoted-aware). */
export function loadEnvValue(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  for (const filename of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), filename);
    if (!existsSync(path)) continue;
    const line = readFileSync(path, "utf8")
      .split(/\r?\n/)
      .find((entry) => entry.startsWith(`${key}=`));
    if (!line) continue;
    const raw = line.slice(key.length + 1).trim();
    if (!raw) continue;
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      return raw.slice(1, -1);
    }
    return raw;
  }
  return undefined;
}

/**
 * Resolve the dedicated e2e test-database URL, or THROW (fail-closed):
 *   - `TEST_DATABASE_URL` unset             → throw (NEVER fall back to prod)
 *   - `TEST_DATABASE_URL === DATABASE_URL`  → throw (that IS production)
 *
 * This is the single guard every e2e DB connection (and the Playwright
 * webServers) routes through. Do not connect e2e to `DATABASE_URL` directly.
 */
export function requireTestDatabaseUrl(): string {
  const testUrl = loadEnvValue("TEST_DATABASE_URL");
  if (!testUrl) {
    throw new Error(
      "[e2e] TEST_DATABASE_URL is not set. e2e runs ONLY against a dedicated, " +
        "disposable test database — never production. Set TEST_DATABASE_URL in " +
        ".env.local (see e2e/README.md). Refusing to run.",
    );
  }
  const prodUrl = loadEnvValue("DATABASE_URL");
  if (prodUrl && testUrl === prodUrl) {
    throw new Error(
      "[e2e] TEST_DATABASE_URL equals DATABASE_URL (production). e2e must use a " +
        "SEPARATE database — a local `pnpm e2e` against prod wiped it on 2026-06-15. " +
        "Refusing to run.",
    );
  }
  return testUrl;
}

/** A postgres.js client bound to the guarded test database. */
export function getTestSql(): ReturnType<typeof postgres> {
  return postgres(requireTestDatabaseUrl(), { prepare: false, idle_timeout: 20, max: 1 });
}

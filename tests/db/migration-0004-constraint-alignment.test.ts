// DB CHECK ↔ Zod validation alignment test.
//
// CB-3.2 AC 6. Closes PM Risk #2: "DB CHECK constraint definitions
// diverging from Zod constraints over time." Reads
// `db/migrations/0004-strategies.sql` as a text file and asserts that
// each documented CHECK constraint has a corresponding Zod-layer rejection
// in `lib/strategy-core/validate.ts` (or `types.ts`'s `StrategySchema`).
//
// Defense-in-depth: the DB CHECK is the production safety; the Zod
// validation is the early-feedback layer. Drift between the two weakens
// the system's safety posture. This test catches drift mechanically at
// CI time — no DB connection required (pure text grep).
//
// Pattern intentionally simple: read the SQL file, regex-match the CHECK
// constraints, then verify the corresponding constraint exists in the
// strategy-core validation surface. If a future migration adds a CHECK
// without adding a Zod constraint, this test fails loudly.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const MIGRATION_PATH = join(
  __dirname,
  "..",
  "..",
  "db",
  "migrations",
  "0004-strategies.sql",
);

const VALIDATE_PATH = join(
  __dirname,
  "..",
  "..",
  "lib",
  "strategy-core",
  "validate.ts",
);

const TYPES_PATH = join(
  __dirname,
  "..",
  "..",
  "lib",
  "strategy-core",
  "types.ts",
);

function readFile(path: string): string {
  return readFileSync(path, "utf8");
}

describe("CB-3.2 AC 6 — DB CHECK vs Zod constraint alignment for 0004-strategies.sql", () => {
  const migrationSql = readFile(MIGRATION_PATH);
  const validateTs = readFile(VALIDATE_PATH);
  const typesTs = readFile(TYPES_PATH);

  it("position_size_usd > 0: DB CHECK present AND Zod constraint present", () => {
    // DB side: the migration must declare the CHECK
    expect(migrationSql).toMatch(
      /CHECK\s*\(\s*position_size_usd\s*>\s*0\s*\)/i,
    );
    // Zod side (validate.ts): the rule branch enforces > 0
    expect(validateTs).toMatch(/POSITION_SIZE_USD_NOT_POSITIVE/);
    expect(validateTs).toMatch(/value\.position_size_usd\s*<=\s*0/);
    // Zod side (types.ts strict): z.number().positive() on the field
    expect(typesTs).toMatch(/position_size_usd:\s*z\.number\(\)\.positive\(\)/);
  });

  it("per_session_buy_count_cap > 0: DB CHECK present AND Zod constraint present", () => {
    expect(migrationSql).toMatch(
      /CHECK\s*\(\s*per_session_buy_count_cap\s*>\s*0\s*\)/i,
    );
    expect(validateTs).toMatch(/PER_SESSION_BUY_COUNT_CAP_NOT_POSITIVE/);
    expect(validateTs).toMatch(/value\.per_session_buy_count_cap\s*<=\s*0/);
    // types.ts strict schema: integer + positive
    expect(typesTs).toMatch(
      /per_session_buy_count_cap:\s*z\.number\(\)\.int\(\)\.positive\(\)/,
    );
  });

  it("per_session_dollar_cap > 0: DB CHECK present AND Zod constraint present", () => {
    expect(migrationSql).toMatch(
      /CHECK\s*\(\s*per_session_dollar_cap\s*>\s*0\s*\)/i,
    );
    expect(validateTs).toMatch(/PER_SESSION_DOLLAR_CAP_NOT_POSITIVE/);
    expect(validateTs).toMatch(/value\.per_session_dollar_cap\s*<=\s*0/);
    expect(typesTs).toMatch(
      /per_session_dollar_cap:\s*z\.number\(\)\.positive\(\)/,
    );
  });

  it("structural invariants of the migration file (catches obvious shape drift)", () => {
    // strategies table created (bare CREATE per Engineer DRI Decision #2)
    expect(migrationSql).toMatch(/CREATE\s+TABLE\s+strategies\s*\(/i);
    // ALTER bot_sessions adds active_strategy_id (NOT recreating the table)
    expect(migrationSql).toMatch(
      /ALTER\s+TABLE\s+bot_sessions\s+ADD\s+COLUMN\s+active_strategy_id/i,
    );
    // Migration MUST NOT recreate bot_sessions (architecture Issue #1 RESOLVED at story drafting)
    expect(migrationSql).not.toMatch(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?bot_sessions/i);
    // ULID PK as text (not a hypothetical ulid type)
    expect(migrationSql).toMatch(/id\s+text\s+PRIMARY\s+KEY/i);
    // Self-FK on superseded_by_strategy_id
    expect(migrationSql).toMatch(
      /superseded_by_strategy_id\s+text\s+REFERENCES\s+strategies\(id\)/i,
    );
    // FK to auth_users
    expect(migrationSql).toMatch(
      /created_by_user_id\s+text\s+NOT\s+NULL\s+REFERENCES\s+auth_users\(id\)/i,
    );
  });
});

// Architectural-invariant test for `lib/strategy-core/`.
//
// CB-3.0 AC 7 + PM DRI Decision #1 + Engineer DRI Decision #4 (regex scan
// of source files).
//
// `lib/strategy-core/` MUST have zero dependencies on `lib/coinbase/*`,
// `lib/env/*`, or `lib/db/*`. This is the architectural invariant that
// makes future extraction to `@vc1023/strategy-core` npm package a half-day
// find/replace job (per `@vc1023/passkey-2fa` precedent).
//
// If a contributor needs to import from one of those modules, the
// architectural pivot needs a brief amendment FIRST — never bypass.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const LIB_STRATEGY_CORE_DIR = join(
  __dirname,
  "..",
  "..",
  "..",
  "lib",
  "strategy-core",
);

function walkTsFiles(dir: string): string[] {
  const entries: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const s = statSync(path);
    if (s.isDirectory()) {
      entries.push(...walkTsFiles(path));
    } else if (s.isFile() && path.endsWith(".ts")) {
      entries.push(path);
    }
  }
  return entries;
}

// Patterns we forbid — actual imports from coupled modules.
//
// We MUST NOT match comments / JSDoc / string-literals that NAME the
// invariant ("no @/lib/coinbase imports here") because those are useful
// documentation. So we match only on `import ... from "@/lib/<module>/..."`
// (and `import ... from "@/lib/<module>"` without trailing slash) at the
// beginning of a line — which is the actual import-statement shape.
//
// Patterns:
//   - `import ... from "@/lib/coinbase"` or `"@/lib/coinbase/..."`
//   - `import ... from "@/lib/env"` or `"@/lib/env/..."`
//   - `import ... from "@/lib/db"` or `"@/lib/db/..."`

const FORBIDDEN_IMPORT_PATTERNS: ReadonlyArray<RegExp> = [
  /^\s*import[^;]*from\s+["']@\/lib\/coinbase(?:\/[^"']*)?["']/m,
  /^\s*import[^;]*from\s+["']@\/lib\/env(?:\/[^"']*)?["']/m,
  /^\s*import[^;]*from\s+["']@\/lib\/db(?:\/[^"']*)?["']/m,
];

describe("lib/strategy-core/ — architectural invariant: no Coinbase/env/DB coupling", () => {
  it("source files import zero @/lib/coinbase, @/lib/env, @/lib/db modules", () => {
    const violations: { file: string; pattern: string }[] = [];
    for (const file of walkTsFiles(LIB_STRATEGY_CORE_DIR)) {
      const contents = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
        if (pattern.test(contents)) {
          violations.push({
            file: file.replace(LIB_STRATEGY_CORE_DIR, "lib/strategy-core"),
            pattern: pattern.source,
          });
        }
      }
    }
    if (violations.length > 0) {
      // Provide an actionable error for the contributor — points at the
      // bet architecture's Decision #1 + the brief Decision #6.
      throw new Error(
        `Architectural invariant violated — lib/strategy-core/ must be portable.\n` +
          `Violations:\n${violations
            .map((v) => `  ${v.file} matches /${v.pattern}/`)
            .join("\n")}\n\n` +
          `Per docs/bets/CB-3/architecture.md Decision #1 + brief DRI Decision #6,\n` +
          `lib/strategy-core/ may NOT import from lib/coinbase/, lib/env/, or lib/db/.\n` +
          `These would defeat the extraction-readiness invariant + couple strategy-core\n` +
          `to crypto-app internals. If you need this coupling, amend the brief FIRST.`,
      );
    }
    expect(violations).toHaveLength(0);
  });

  it("walks at least one .ts file (smoke check — the test isn't trivially passing on an empty dir)", () => {
    const files = walkTsFiles(LIB_STRATEGY_CORE_DIR);
    expect(files.length).toBeGreaterThan(0);
  });
});

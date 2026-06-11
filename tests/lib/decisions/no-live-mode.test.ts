// Architectural-invariant test for `lib/decisions/`.
//
// CB-4.1 AC 11 — sibling pattern of `tests/lib/strategy-core/no-live-mode.test.ts`
// + `tests/lib/strategy-coinbase/no-live-mode.test.ts` + `tests/lib/coinbase/no-live-mode.test.ts`
// + `tests/lib/signals/no-live-mode.test.ts`. Per Compass discipline:
// each policy-free lib gets its own architectural-invariant test for
// clearer ownership + failure attribution.
//
// `lib/decisions/` MUST be policy-free. It computes deterministic
// decision results from signal + strategy + session inputs; it doesn't
// know whether the bot is in dry-run or live mode. That's CB-4.3's
// concern at the order-placement gate, NOT this layer's.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const LIB_DECISIONS_DIR = join(
  __dirname,
  "..",
  "..",
  "..",
  "lib",
  "decisions",
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

// Policy-violation patterns — actual LIVE_MODE reads. Documentation
// comments naming the invariant are explicitly fine.
const POLICY_VIOLATION_PATTERNS: ReadonlyArray<RegExp> = [
  /env\(\)\.LIVE_MODE/,
  /process\.env\.LIVE_MODE/,
  /\["LIVE_MODE"\]/,
  /\['LIVE_MODE'\]/,
];

describe("lib/decisions/ — LIVE_MODE-free invariant (CB-4.1 AC 11)", () => {
  it("source files do not read LIVE_MODE env var (any access pattern)", () => {
    const violations: { file: string; pattern: string }[] = [];
    for (const file of walkTsFiles(LIB_DECISIONS_DIR)) {
      const contents = readFileSync(file, "utf8");
      // Strip out comment lines (// or *) before checking — documentation
      // mentions of LIVE_MODE are explicitly fine.
      const stripped = contents
        .split("\n")
        .filter((line) => !/^\s*(\/\/|\*)/.test(line))
        .join("\n");
      for (const pattern of POLICY_VIOLATION_PATTERNS) {
        if (pattern.test(stripped)) {
          violations.push({
            file: file.replace(LIB_DECISIONS_DIR, "lib/decisions"),
            pattern: pattern.source,
          });
        }
      }
    }
    if (violations.length > 0) {
      throw new Error(
        `LIVE_MODE-free invariant violated — lib/decisions/ must be policy-free.\n` +
          `Violations:\n${violations
            .map((v) => `  ${v.file} matches /${v.pattern}/`)
            .join("\n")}\n\n` +
          `Per CB-4 brief + foundation: decision computation is pure logic; the\n` +
          `LIVE_MODE gate lives at CB-4.3's order-placement layer, NOT here.\n` +
          `If you need this read, amend the brief FIRST.`,
      );
    }
    expect(violations).toHaveLength(0);
  });
});

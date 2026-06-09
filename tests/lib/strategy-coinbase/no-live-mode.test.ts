// Architectural-invariant test for `lib/strategy-coinbase/`.
//
// CB-3.1 Engineer DRI Decision #6 — sibling pattern of the existing
// no-live-mode invariant tests at `tests/lib/coinbase/no-live-mode.test.ts`
// and `tests/lib/strategy-core/no-live-mode.test.ts`. Per Compass
// discipline: each lib gets its own architectural-invariant test for
// clearer ownership + clearer failure attribution.
//
// strategy-coinbase MUST be policy-free. It calls CB-2's wrapper (which is
// itself LIVE_MODE-free per CB-2 brief PM Decision #3); it doesn't know
// whether the bot is in dry-run or live mode. That's CB-4's concern at the
// order-placement gate.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const LIB_STRATEGY_COINBASE_DIR = join(
  __dirname,
  "..",
  "..",
  "..",
  "lib",
  "strategy-coinbase",
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

describe("lib/strategy-coinbase/ — LIVE_MODE-free invariant (CB-3.1 Engineer DRI Decision #6)", () => {
  it("source files do not read LIVE_MODE env var (any access pattern)", () => {
    const violations: { file: string; pattern: string }[] = [];
    for (const file of walkTsFiles(LIB_STRATEGY_COINBASE_DIR)) {
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
            file: file.replace(LIB_STRATEGY_COINBASE_DIR, "lib/strategy-coinbase"),
            pattern: pattern.source,
          });
        }
      }
    }
    if (violations.length > 0) {
      throw new Error(
        `LIVE_MODE-free invariant violated — lib/strategy-coinbase/ must be policy-free.\n` +
          `Violations:\n${violations
            .map((v) => `  ${v.file} matches /${v.pattern}/`)
            .join("\n")}\n\n` +
          `Per CB-3 brief + foundation: strategy-coinbase calls CB-2's typed wrapper\n` +
          `(itself LIVE_MODE-free) to fetch product data. The LIVE_MODE gate lives at\n` +
          `CB-4's order-placement layer, NOT here. If you need this read, amend the\n` +
          `brief FIRST.`,
      );
    }
    expect(violations).toHaveLength(0);
  });
});

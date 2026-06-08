// Architectural-invariant test for `lib/strategy-core/`.
//
// CB-3.0 Engineer DRI Decision #6 — sibling pattern of
// `tests/lib/coinbase/no-live-mode.test.ts` for the `lib/strategy-core/`
// scope. Per Compass discipline: each lib gets its own invariant test
// rather than parameterizing one test across multiple libs (clearer
// ownership + clearer failure attribution).
//
// strategy-core MUST be policy-free. It doesn't know whether the bot is in
// dry-run or live mode; that's CB-4's concern at the order-placement gate.
// strategy-core is pure data + interfaces + validation; no LIVE_MODE reads.

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

// Policy-violation patterns — actual LIVE_MODE reads.
// Documentation comments that NAME the invariant are fine (they help
// future-engineer grep for the policy boundary).
const POLICY_VIOLATION_PATTERNS: ReadonlyArray<RegExp> = [
  /env\(\)\.LIVE_MODE/,
  /process\.env\.LIVE_MODE/,
  /\["LIVE_MODE"\]/,
  /\['LIVE_MODE'\]/,
];

describe("lib/strategy-core/ — LIVE_MODE-free invariant (CB-3.0 Engineer DRI Decision #6)", () => {
  it("source files do not read LIVE_MODE env var (any access pattern)", () => {
    const violations: { file: string; pattern: string }[] = [];
    for (const file of walkTsFiles(LIB_STRATEGY_CORE_DIR)) {
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
            file: file.replace(LIB_STRATEGY_CORE_DIR, "lib/strategy-core"),
            pattern: pattern.source,
          });
        }
      }
    }
    if (violations.length > 0) {
      throw new Error(
        `LIVE_MODE-free invariant violated — lib/strategy-core/ must be policy-free.\n` +
          `Violations:\n${violations
            .map((v) => `  ${v.file} matches /${v.pattern}/`)
            .join("\n")}\n\n` +
          `Per CB-3 brief + foundation: strategy-core is pure data + interfaces +\n` +
          `validation. The LIVE_MODE gate lives at CB-4's order-placement layer,\n` +
          `NOT here. If you need this read, amend the brief FIRST.`,
      );
    }
    expect(violations).toHaveLength(0);
  });
});

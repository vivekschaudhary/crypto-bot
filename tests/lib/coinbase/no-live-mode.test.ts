import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Architectural-invariant test per CB-2 brief PM DRI Decision #3:
// `lib/coinbase/` is policy-free. The wrapper does NOT read LIVE_MODE; the
// consumer (CB-4) owns the gate. This grep test enforces the invariant
// mechanically so a future contributor who reaches for `env().LIVE_MODE`
// inside the wrapper hits a test failure rather than a code-review note.
//
// If a legitimate need to read LIVE_MODE inside lib/coinbase/ ever arises,
// the right path is: amend the brief's PM DRI Decision #3 first (supersession-
// style entry) — THEN remove this test in the same PR. Never bypass.

const LIB_COINBASE_DIR = join(__dirname, "..", "..", "..", "lib", "coinbase");

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

// What we forbid: actual reads of the LIVE_MODE env var inside the wrapper.
// Documentation comments that NAME the invariant ("the wrapper is LIVE_MODE-
// free per ...") are fine and expected — they help future-engineer grep for
// the policy boundary.
//
// Patterns that constitute a policy violation:
//   - `env().LIVE_MODE`           (lib/env Zod-validated access)
//   - `process.env.LIVE_MODE`     (direct env read, also violates cross-cutting standards)
//   - `["LIVE_MODE"]` / `['LIVE_MODE']`  (dynamic property access; defensive)
const VIOLATION_PATTERNS = [
  /env\(\)\s*\.\s*LIVE_MODE/,
  /process\s*\.\s*env\s*\.\s*LIVE_MODE/,
  /\[\s*['"]LIVE_MODE['"]\s*\]/,
];

describe("lib/coinbase — architectural invariant", () => {
  it("no .ts file under lib/coinbase/ reads LIVE_MODE from env (PM DRI Decision #3)", () => {
    const files = walkTsFiles(LIB_COINBASE_DIR);
    expect(files.length).toBeGreaterThan(0); // sanity: the test runs against real files

    const offenders: { file: string; lines: number[] }[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");
      const hits = lines
        .map((line, i) => ({ line, idx: i + 1 }))
        .filter(({ line }) => VIOLATION_PATTERNS.some((p) => p.test(line)));
      if (hits.length > 0) {
        offenders.push({ file, lines: hits.map((h) => h.idx) });
      }
    }

    expect(offenders, formatOffenderMessage(offenders)).toEqual([]);
  });
});

function formatOffenderMessage(offenders: { file: string; lines: number[] }[]): string {
  if (offenders.length === 0) return "";
  const parts = offenders.map((o) => `  ${o.file}: lines ${o.lines.join(", ")}`);
  return `Found LIVE_MODE references inside lib/coinbase/ — violates the wrapper-is-policy-free invariant (CB-2 brief PM DRI Decision #3). Offenders:\n${parts.join("\n")}\n\nIf this reference is legitimate, amend the brief decision FIRST (supersession entry), then remove this test in the same PR.`;
}

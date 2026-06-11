// Architectural-invariant test for `lib/decisions/`.
//
// CB-4.1 AC 10.
//
// `lib/decisions/` may ONLY import from `@/lib/strategy-core/*` (Strategy
// + Asset + EntryRules + ExitRules types ARE the contract per [CB-3 PM
// DRI Decision #6 extraction-readiness invariant](../../docs/bets/CB-3/brief.md)).
// ALL other `@/lib/...` imports are FORBIDDEN — direct OR transitive.
//
// This is STRUCTURALLY different from `lib/strategy-core/`'s no-coupling
// test (which forbids ALL `@/lib/...` imports) and from `lib/signals/`'s
// (same zero-tolerance). Decisions has an ALLOW-LIST of one: strategy-core.
//
// The decision engine is STRUCTURALLY paired with strategy-core
// (consumes its types) but NOT with signals (sibling pure-function lib;
// the cron handler composes both; decisions receives already-computed
// RSI/MA values as numeric inputs, never the function references).
//
// IMPLEMENTATION mirrors `tests/lib/signals/no-coupling.test.ts`
// (CB-4.0 precedent) with one allow-list extension: an `@/lib/...`
// resolved path that starts with `LIB_STRATEGY_CORE_DIR` is ALLOWED;
// everything else outside `LIB_DECISIONS_DIR` is an escape.
//
// What's allowed:
//   * Relative imports within decisions itself (`./types`, `./evaluate`)
//   * `@/lib/strategy-core/*` imports (Strategy, Asset, EntryRules, etc.)
//   * External package imports (from package.json deps)
//
// If a contributor needs to import from another internal lib, the
// architectural pivot needs a brief amendment FIRST — never bypass.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const LIB_DECISIONS_DIR = join(
  __dirname,
  "..",
  "..",
  "..",
  "lib",
  "decisions",
);
const LIB_STRATEGY_CORE_DIR = join(
  __dirname,
  "..",
  "..",
  "..",
  "lib",
  "strategy-core",
);
const REPO_ROOT = join(__dirname, "..", "..", "..");

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

const INTERNAL_AT_IMPORT_PATTERN =
  /^\s*import[^;]*from\s+["']@\/([^"']+)["']/gm;

const RELATIVE_IMPORT_PATTERN =
  /^\s*import[^;]*from\s+["'](\.[^"']+)["']/gm;

function resolveAtImport(atPath: string): string | null {
  const candidates = [
    join(REPO_ROOT, `${atPath}.ts`),
    join(REPO_ROOT, atPath, "index.ts"),
  ];
  for (const c of candidates) {
    try {
      if (statSync(c).isFile()) return c;
    } catch {
      // doesn't exist; try next candidate
    }
  }
  return null;
}

function resolveRelativeImport(
  fromFile: string,
  relPath: string,
): string | null {
  const baseDir = dirname(fromFile);
  const resolved = resolve(baseDir, relPath);
  const candidates = [`${resolved}.ts`, join(resolved, "index.ts")];
  for (const c of candidates) {
    try {
      if (statSync(c).isFile()) return c;
    } catch {
      // doesn't exist; try next candidate
    }
  }
  return null;
}

function findEscapingImports(): {
  file: string;
  importedPath: string;
  resolvedPath: string;
}[] {
  const escapes: {
    file: string;
    importedPath: string;
    resolvedPath: string;
  }[] = [];
  const visited = new Set<string>();
  const queue = walkTsFiles(LIB_DECISIONS_DIR);
  for (const f of queue) visited.add(f);

  while (queue.length > 0) {
    const file = queue.shift()!;
    const contents = readFileSync(file, "utf8");

    INTERNAL_AT_IMPORT_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = INTERNAL_AT_IMPORT_PATTERN.exec(contents)) !== null) {
      const atPath = match[1];
      if (atPath === undefined) continue;
      const resolved = resolveAtImport(atPath);
      if (!resolved) continue;
      // ALLOW-LIST: decisions itself + strategy-core. Everything else escapes.
      const insideDecisions = resolved.startsWith(LIB_DECISIONS_DIR);
      const insideStrategyCore = resolved.startsWith(LIB_STRATEGY_CORE_DIR);
      if (!insideDecisions && !insideStrategyCore) {
        escapes.push({
          file: file.replace(REPO_ROOT + "/", ""),
          importedPath: `@/${atPath}`,
          resolvedPath: resolved.replace(REPO_ROOT + "/", ""),
        });
      }
      // Queue the resolved file for further transitive walking — but only
      // if it's within strategy-core or decisions; we don't recurse into
      // strategy-core's own imports here (that's strategy-core's no-coupling
      // test's responsibility, not ours).
      if (
        (insideDecisions || insideStrategyCore) &&
        !visited.has(resolved)
      ) {
        visited.add(resolved);
        queue.push(resolved);
      }
    }

    RELATIVE_IMPORT_PATTERN.lastIndex = 0;
    while ((match = RELATIVE_IMPORT_PATTERN.exec(contents)) !== null) {
      const relPath = match[1];
      if (relPath === undefined) continue;
      const resolved = resolveRelativeImport(file, relPath);
      if (resolved && resolved.startsWith(REPO_ROOT) && !visited.has(resolved)) {
        visited.add(resolved);
        queue.push(resolved);
      }
    }
  }

  return escapes;
}

describe("lib/decisions/ — architectural invariant: ONLY @/lib/strategy-core/* allowed", () => {
  it("transitive walk: no `@/lib/...` import escapes decisions OR strategy-core", () => {
    const escapes = findEscapingImports();
    if (escapes.length > 0) {
      throw new Error(
        `Architectural invariant violated — lib/decisions/ leaked coupling to a non-strategy-core lib.\n` +
          `Escaping imports (direct or transitive):\n${escapes
            .map(
              (e) =>
                `  ${e.file}\n    imports ${e.importedPath}\n    → resolves to ${e.resolvedPath}`,
            )
            .join("\n")}\n\n` +
          `Per docs/bets/CB-4/stories/CB-4.1/story.md AC 10,\n` +
          `lib/decisions/ may ONLY import from @/lib/strategy-core/* (Strategy types\n` +
          `ARE the contract). Imports from coinbase/db/env/signals/strategy-coinbase/strategies\n` +
          `are FORBIDDEN. If you need to couple, amend the brief FIRST.`,
      );
    }
    expect(escapes).toHaveLength(0);
  });

  it("smoke check: at least one decisions .ts file exists (test isn't trivially passing)", () => {
    const files = walkTsFiles(LIB_DECISIONS_DIR);
    expect(files.length).toBeGreaterThan(0);
  });
});

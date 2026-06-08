// Architectural-invariant test for `lib/strategy-core/`.
//
// CB-3.0 AC 7 + PM DRI Decision #1.
//
// `lib/strategy-core/` MUST have zero dependencies on any other crypto-app
// internal lib — direct OR transitive. This is the architectural invariant
// that makes future extraction to `@vc1023/strategy-core` npm package a
// half-day find/replace job (per `@vc1023/passkey-2fa` precedent).
//
// IMPLEMENTATION (per round-1 ISSUE fix — strengthened from regex-only
// option (b) to the transitive-graph approach AC 7 specified):
//
// The earlier implementation (Engineer DRI Decision #4 option b) was
// regex-scan-only of strategy-core files for `@/lib/(coinbase|env|db)`
// imports. That's necessary but not sufficient — a transitively-coupled
// path through a non-strategy-core lib (e.g., strategy-core → lib/util →
// lib/coinbase) would slip through. AC 7 explicitly required "transitive
// references" + "walk the resolved module graph".
//
// Strengthened approach: forbid ANY `@/lib/...` import that resolves to a
// file OUTSIDE `lib/strategy-core/`. This is strictly stronger than the
// transitive-coinbase/env/db check:
//   * Catches the original concern (no coinbase/env/db coupling) — direct
//     OR transitive (because the FIRST hop out of strategy-core fails)
//   * Future-proofs against new internal libs that might get added later
//     and accidentally pulled in
//   * Forces an explicit brief amendment if strategy-core ever needs to
//     consume from another internal lib (which would defeat extraction
//     readiness anyway)
//
// What's still allowed:
//   * Relative imports within strategy-core itself (`./types`, `./adapter`)
//   * External package imports (`zod`, future deps from package.json)
//
// If a contributor needs to import from another internal lib, the
// architectural pivot needs a brief amendment FIRST — never bypass.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

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

// Match: `import ... from "@/something"` or `import ... from '@/something'`
// at the start of a line (so we don't match a JSDoc / comment string).
const INTERNAL_AT_IMPORT_PATTERN =
  /^\s*import[^;]*from\s+["']@\/([^"']+)["']/gm;

// Match relative imports too — we need to know if a file ./something.ts
// transitively pulls in a forbidden module. Within strategy-core itself
// relative imports are fine; this regex extracts them for the transitive
// walk to follow.
const RELATIVE_IMPORT_PATTERN =
  /^\s*import[^;]*from\s+["'](\.[^"']+)["']/gm;

/**
 * Resolve an `@/foo` import path to an absolute filesystem path. Tries
 * `<root>/foo.ts` then `<root>/foo/index.ts`. Returns null if neither
 * resolves (shouldn't happen for a valid build).
 */
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

/**
 * Resolve a relative import path from a given file's directory.
 */
function resolveRelativeImport(fromFile: string, relPath: string): string | null {
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

/**
 * Walk the transitive import graph starting at strategy-core files.
 * Returns a list of every `@/lib/...` import (resolved absolute path)
 * that escapes the strategy-core boundary.
 */
function findEscapingImports(): { file: string; importedPath: string; resolvedPath: string }[] {
  const escapes: { file: string; importedPath: string; resolvedPath: string }[] = [];
  const visited = new Set<string>();
  const queue = walkTsFiles(LIB_STRATEGY_CORE_DIR);
  for (const f of queue) visited.add(f);

  while (queue.length > 0) {
    const file = queue.shift()!;
    const contents = readFileSync(file, "utf8");

    // Check `@/...` imports — any of these escaping strategy-core is a violation
    INTERNAL_AT_IMPORT_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = INTERNAL_AT_IMPORT_PATTERN.exec(contents)) !== null) {
      const atPath = match[1];
      if (atPath === undefined) continue;
      const resolved = resolveAtImport(atPath);
      if (!resolved) continue;
      if (!resolved.startsWith(LIB_STRATEGY_CORE_DIR)) {
        // The @ import resolves OUTSIDE strategy-core → violation.
        escapes.push({
          file: file.replace(REPO_ROOT + "/", ""),
          importedPath: `@/${atPath}`,
          resolvedPath: resolved.replace(REPO_ROOT + "/", ""),
        });
      }
      // Whether escape or internal: queue the resolved file for further walking
      // (only if not visited and inside the repo).
      if (resolved.startsWith(REPO_ROOT) && !visited.has(resolved)) {
        visited.add(resolved);
        queue.push(resolved);
      }
    }

    // Walk relative imports too — they may chain into a file that itself
    // imports from `@/lib/something`.
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

describe("lib/strategy-core/ — architectural invariant: NO transitive coupling to any internal lib", () => {
  it("transitive walk: no `@/lib/...` import (or chained import) escapes strategy-core", () => {
    const escapes = findEscapingImports();
    if (escapes.length > 0) {
      throw new Error(
        `Architectural invariant violated — lib/strategy-core/ leaked coupling to crypto-app internals.\n` +
          `Escaping imports (direct or transitive):\n${escapes
            .map(
              (e) =>
                `  ${e.file}\n    imports ${e.importedPath}\n    → resolves to ${e.resolvedPath}`,
            )
            .join("\n")}\n\n` +
          `Per docs/bets/CB-3/architecture.md Decision #1 + brief DRI Decision #6,\n` +
          `lib/strategy-core/ may NOT import from ANY other internal lib (transitively).\n` +
          `The only allowed imports are: (1) relative imports within strategy-core itself,\n` +
          `and (2) external packages (zod, etc.). If you need to couple, amend the brief FIRST.`,
      );
    }
    expect(escapes).toHaveLength(0);
  });

  it("smoke check: at least one strategy-core .ts file exists (test isn't trivially passing)", () => {
    const files = walkTsFiles(LIB_STRATEGY_CORE_DIR);
    expect(files.length).toBeGreaterThan(0);
  });
});

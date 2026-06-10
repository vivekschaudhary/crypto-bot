// Architectural-invariant test for `lib/signals/`.
//
// CB-4.0 AC 7 + PM DRI Decision #1.
//
// `lib/signals/` MUST have zero dependencies on any other crypto-app
// internal lib — direct OR transitive. Per [CB-4 brief Hypothesis](../../docs/bets/CB-4/brief.md)
// + the [CB-3 PM DRI Decision #6 extraction-readiness invariant](../../docs/bets/CB-3/brief.md):
// future equity-app variant consumes the same `lib/signals/` modules with
// an equity-broker order-placement adapter; this invariant is what makes
// that extraction a half-day find/replace, not a multi-day refactor.
//
// IMPLEMENTATION mirrors `tests/lib/strategy-core/no-coupling.test.ts`
// (CB-3.0 precedent): transitive walk that forbids ANY `@/lib/...` import
// from resolving to a file OUTSIDE `lib/signals/`. This is strictly
// stronger than a coinbase/db/env/strategy-* allow-list because it also
// catches transitive paths through future libs that don't exist yet.
//
// What's allowed:
//   * Relative imports within signals itself (`./rsi`, `./ma`)
//   * External package imports (from package.json deps)
//
// If a contributor needs to import from another internal lib, the
// architectural pivot needs a brief amendment FIRST — never bypass.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const LIB_SIGNALS_DIR = join(__dirname, "..", "..", "..", "lib", "signals");
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
  const queue = walkTsFiles(LIB_SIGNALS_DIR);
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
      if (!resolved.startsWith(LIB_SIGNALS_DIR)) {
        escapes.push({
          file: file.replace(REPO_ROOT + "/", ""),
          importedPath: `@/${atPath}`,
          resolvedPath: resolved.replace(REPO_ROOT + "/", ""),
        });
      }
      if (resolved.startsWith(REPO_ROOT) && !visited.has(resolved)) {
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

describe("lib/signals/ — architectural invariant: NO transitive coupling to any internal lib", () => {
  it("transitive walk: no `@/lib/...` import (or chained import) escapes signals", () => {
    const escapes = findEscapingImports();
    if (escapes.length > 0) {
      throw new Error(
        `Architectural invariant violated — lib/signals/ leaked coupling to crypto-app internals.\n` +
          `Escaping imports (direct or transitive):\n${escapes
            .map(
              (e) =>
                `  ${e.file}\n    imports ${e.importedPath}\n    → resolves to ${e.resolvedPath}`,
            )
            .join("\n")}\n\n` +
          `Per docs/bets/CB-4/stories/CB-4.0/story.md AC 7 + PM DRI Decision #1,\n` +
          `lib/signals/ may NOT import from ANY other internal lib (transitively).\n` +
          `The only allowed imports are: (1) relative imports within signals itself,\n` +
          `and (2) external packages. If you need to couple, amend the brief FIRST.`,
      );
    }
    expect(escapes).toHaveLength(0);
  });

  it("smoke check: at least one signals .ts file exists (test isn't trivially passing)", () => {
    const files = walkTsFiles(LIB_SIGNALS_DIR);
    expect(files.length).toBeGreaterThan(0);
  });
});

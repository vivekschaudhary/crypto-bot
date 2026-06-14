// Architectural-invariant tests for the cron tick pipeline.
//
// CB-4.2 AC 10/13 + CB-4.3 AC 11 (the order-wiring contract INVERTED).
//
//   1. ORDER-PLACEMENT WIRING (CB-4.3, inverted from CB-4.2) — the route's
//      transitive graph now DOES reach lib/coinbase/orders.ts (the LIVE_MODE
//      gate). CB-4.2 asserted the opposite (dry-run only); the contract
//      deliberately shifted, so the test shifted with it (a
//      [cross-artifact-sweep-on-contract-shift] instance). The behavioral
//      "never called in dry-run" guarantee lives in route.test.ts.
//
//   2. APPEND-ONLY GREP — no `UPDATE bot_ticks` / `UPDATE signals`
//      anywhere in lib/ + app/ source (brief guardrail, load-bearing now
//      that writes exist).
//
//   3. NARROW-CATCH PROOF — the duplicate handler matches Postgres code
//      23505 explicitly (AC 5: a bare swallow of the constraint violation
//      fails this test), and lib/ticks/ + the route contain no empty
//      catch blocks (the documented logging-only swallow in trace.ts is
//      the single allowed exception).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..", "..", "..", "..");
const ROUTE_FILE = join(REPO_ROOT, "app", "api", "cron", "tick", "route.ts");
const ORDERS_FILE = join(REPO_ROOT, "lib", "coinbase", "orders.ts");

const INTERNAL_AT_IMPORT_PATTERN =
  /^\s*import[^;]*from\s+["']@\/([^"']+)["']/gm;
const RELATIVE_IMPORT_PATTERN = /^\s*import[^;]*from\s+["'](\.[^"']+)["']/gm;

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

function resolveRelativeImport(fromFile: string, relPath: string): string | null {
  const base = resolve(dirname(fromFile), relPath);
  const candidates = [`${base}.ts`, join(base, "index.ts")];
  for (const c of candidates) {
    try {
      if (statSync(c).isFile()) return c;
    } catch {
      // doesn't exist; try next candidate
    }
  }
  return null;
}

/** Every .ts file transitively reachable from the route entry point. */
function walkModuleGraph(entry: string): Set<string> {
  const visited = new Set<string>([entry]);
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift()!;
    const contents = readFileSync(file, "utf8");
    const enqueue = (resolved: string | null) => {
      if (resolved && resolved.startsWith(REPO_ROOT) && !visited.has(resolved)) {
        visited.add(resolved);
        queue.push(resolved);
      }
    };
    INTERNAL_AT_IMPORT_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = INTERNAL_AT_IMPORT_PATTERN.exec(contents)) !== null) {
      if (match[1] !== undefined) enqueue(resolveAtImport(match[1]));
    }
    RELATIVE_IMPORT_PATTERN.lastIndex = 0;
    while ((match = RELATIVE_IMPORT_PATTERN.exec(contents)) !== null) {
      if (match[1] !== undefined) enqueue(resolveRelativeImport(file, match[1]));
    }
  }
  return visited;
}

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const s = statSync(path);
    if (s.isDirectory()) {
      if (name === "node_modules" || name === ".next" || name === ".git") continue;
      out.push(...walkTsFiles(path));
    } else if (s.isFile() && /\.tsx?$/.test(path)) {
      out.push(path);
    }
  }
  return out;
}

describe("cron tick — order-placement wiring (CB-4.3 AC 11; INVERTED from CB-4.2 AC 10)", () => {
  // CB-4.2 asserted the route's module graph NEVER reached lib/coinbase/orders.ts
  // (dry-run only). CB-4.3 DELIBERATELY inverts that contract — the route now
  // imports placeOrder for the LIVE_MODE gate. This is a textbook
  // [cross-artifact-sweep-on-contract-shift]: the pinned contract changed, so
  // the test moves WITH it in the same PR (not left asserting the old truth).
  // The BEHAVIORAL guarantee that placeOrder is never CALLED in dry-run lives
  // in route.test.ts (LIVE_MODE=false → placeOrder not called); here we only
  // prove the structural wiring exists.
  it("route's transitive imports now DO reach lib/coinbase/orders.ts", () => {
    const graph = walkModuleGraph(ROUTE_FILE);
    expect(graph.size).toBeGreaterThan(5); // smoke: the walk actually walked
    expect(graph.has(ORDERS_FILE)).toBe(true);
  });
});

describe("cron tick — append-only event log (AC 13; brief guardrail)", () => {
  it("no UPDATE bot_ticks / UPDATE signals path exists in lib/ or app/ source", () => {
    const sources = [
      ...walkTsFiles(join(REPO_ROOT, "lib")),
      ...walkTsFiles(join(REPO_ROOT, "app")),
    ];
    const violations: string[] = [];
    for (const file of sources) {
      const contents = readFileSync(file, "utf8");
      if (/UPDATE\s+(bot_ticks|signals)/i.test(contents)) {
        violations.push(file.replace(REPO_ROOT + "/", ""));
      }
    }
    expect(violations).toEqual([]);
  });
});

describe("cron tick — no-silent-swallow (AC 5)", () => {
  it("the duplicate catch matches Postgres 23505 explicitly", () => {
    const route = readFileSync(ROUTE_FILE, "utf8");
    expect(route).toContain('"23505"');
  });

  it("lib/ticks/ + the route contain no empty catch blocks (trace.ts logging swallow is the single documented exception)", () => {
    const files = [
      ROUTE_FILE,
      ...walkTsFiles(join(REPO_ROOT, "lib", "ticks")).filter(
        (f) => !f.endsWith("trace.ts"),
      ),
    ];
    const violations: string[] = [];
    for (const file of files) {
      const contents = readFileSync(file, "utf8");
      // Empty catch: `catch {}` / `catch (e) {}` with only whitespace.
      if (/catch\s*(\([^)]*\))?\s*\{\s*\}/m.test(contents)) {
        violations.push(file.replace(REPO_ROOT + "/", ""));
      }
    }
    expect(violations).toEqual([]);
  });
});

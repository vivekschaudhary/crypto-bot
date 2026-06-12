// Architectural-invariant tests for the CB-4.2 cron tick pipeline.
//
// CB-4.2 AC 10 (no order placement in the dry-run tick's module graph) +
// AC 13 (append-only grep + AC 5's no-silent-swallow proof).
//
//   1. NO-ORDERS-IMPORT WALK — transitive import walk starting at
//      app/api/cron/tick/route.ts; fails if ANY file in the graph resolves
//      to lib/coinbase/orders.ts. Order placement is CB-4.3's concern at
//      the LIVE_MODE gate; the dry-run tick must be structurally incapable
//      of placing an order. Same walker pattern as
//      tests/lib/decisions/no-coupling.test.ts (CB-4.0/4.1 precedent).
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

describe("cron tick — dry-run module graph (AC 10)", () => {
  it("route's transitive imports NEVER reach lib/coinbase/orders.ts", () => {
    const graph = walkModuleGraph(ROUTE_FILE);
    expect(graph.size).toBeGreaterThan(5); // smoke: the walk actually walked
    if (graph.has(ORDERS_FILE)) {
      throw new Error(
        `Dry-run invariant violated: app/api/cron/tick/route.ts transitively imports lib/coinbase/orders.ts.\n` +
          `Order placement is CB-4.3's concern at the LIVE_MODE gate — the CB-4.2 tick must be\n` +
          `structurally incapable of placing an order. If you're building CB-4.3, gate the import\n` +
          `behind the LIVE_MODE module per the brief, and update this test per that story's ACs.`,
      );
    }
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

// Architectural-invariant test for the /api/bot/** write surface (CB-5.3 AC 8).
//
// SAFE CONTROLS ONLY — the load-bearing guarantee. /api/bot/** ships the
// state-only overrides (pause/resume/reset); it must NEVER place a real
// Coinbase order. We assert it by walking the transitive import graph of
// every route under app/api/bot/ and failing if it ever reaches
// lib/coinbase/orders.ts. Same transitive-walk pattern as the cron tick
// invariant (tests/app/api/cron/tick/invariants.test.ts) — inverted: the
// cron DOES reach orders (LIVE_MODE placement); /api/bot/** must NOT.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const BOT_API_DIR = join(REPO_ROOT, "app", "api", "bot");
const ORDERS_FILE = join(REPO_ROOT, "lib", "coinbase", "orders.ts");

const AT_IMPORT = /^\s*import[^;]*from\s+["']@\/([^"']+)["']/gm;
const REL_IMPORT = /^\s*import[^;]*from\s+["'](\.[^"']+)["']/gm;

function resolveAt(p: string): string | null {
  for (const c of [join(REPO_ROOT, `${p}.ts`), join(REPO_ROOT, `${p}.tsx`), join(REPO_ROOT, p, "index.ts")]) {
    try { if (statSync(c).isFile()) return c; } catch { /* next */ }
  }
  return null;
}
function resolveRel(from: string, p: string): string | null {
  const base = resolve(dirname(from), p);
  for (const c of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    try { if (statSync(c).isFile()) return c; } catch { /* next */ }
  }
  return null;
}

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const s = statSync(path);
    if (s.isDirectory()) out.push(...walkTsFiles(path));
    else if (s.isFile() && /\.tsx?$/.test(path)) out.push(path);
  }
  return out;
}

function walkGraph(entries: string[]): Set<string> {
  const visited = new Set<string>(entries);
  const queue = [...entries];
  while (queue.length) {
    const file = queue.shift()!;
    const contents = readFileSync(file, "utf8");
    const enqueue = (r: string | null) => {
      if (r && r.startsWith(REPO_ROOT) && !visited.has(r)) { visited.add(r); queue.push(r); }
    };
    AT_IMPORT.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = AT_IMPORT.exec(contents)) !== null) if (m[1]) enqueue(resolveAt(m[1]));
    REL_IMPORT.lastIndex = 0;
    while ((m = REL_IMPORT.exec(contents)) !== null) if (m[1]) enqueue(resolveRel(file, m[1]));
  }
  return visited;
}

describe("/api/bot/** — SAFE controls only, no order placement (AC 8)", () => {
  it("transitive import graph never reaches lib/coinbase/orders.ts", () => {
    const entries = walkTsFiles(BOT_API_DIR);
    expect(entries.length).toBeGreaterThan(0); // smoke: the route exists
    const graph = walkGraph(entries);
    expect(graph.size).toBeGreaterThan(entries.length); // smoke: it walked
    expect(graph.has(ORDERS_FILE)).toBe(false);
  });
});

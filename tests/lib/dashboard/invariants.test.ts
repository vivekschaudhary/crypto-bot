// Architectural-invariant tests for the CB-5 dashboard (CB-5.0 AC 6 + AC 7).
//
//   1. READ-ONLY (all mutations) — app/dashboard/** + lib/dashboard/**
//      contain NO INSERT/UPDATE/DELETE/TRUNCATE/UPSERT(ON CONFLICT) SQL
//      and import NO mutating helpers. The dashboard is SELECT-only; the
//      append-only event log forbids deletes as much as updates. (AC 6 was
//      hardened from INSERT/UPDATE-only after PR #68 round-1.)
//   2. NO ORDER PLACEMENT — the dashboard's transitive import graph never
//      reaches lib/coinbase/orders.ts (the CB-5 brief guardrail; CB-4.2/4.3
//      transitive-walk pattern).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..", "..");
const DASHBOARD_DIRS = [
  join(REPO_ROOT, "app", "dashboard"),
  join(REPO_ROOT, "lib", "dashboard"),
];
const ORDERS_FILE = join(REPO_ROOT, "lib", "coinbase", "orders.ts");

// SCOPE NOTE (refines AC 6's "app/dashboard/**"): exclude
// app/dashboard/strategy/** — that's CB-3.3's strategy-AUTHORING surface,
// a LEGITIMATE write path (the saveStrategy server action writes via
// lib/strategies/db). AC 6's read-only invariant governs the CB-5
// decision-REVIEW views (live-state, and CB-5.1/5.2 to come), not the
// CB-3 authoring sub-route. CB-5.3's override controls will live in
// app/api/bot/** (a separate, intentional write surface), also outside
// this read-view invariant.
const EXCLUDE = /[/\\]dashboard[/\\]strategy[/\\]/;

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const s = statSync(path);
    if (s.isDirectory()) out.push(...walkTsFiles(path));
    else if (s.isFile() && /\.tsx?$/.test(path) && !EXCLUDE.test(path)) out.push(path);
  }
  return out;
}

// ── 1. read-only ───────────────────────────────────────────────────────────
const MUTATION_SQL = /\b(INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM|TRUNCATE|ON\s+CONFLICT)\b/i;
const MUTATING_HELPERS = [
  "insertTickWithDecisions",
  "upsertSingletonBotSession",
  "insertStrategy",
  "markSuperseded",
  // CB-5.3 override DB ops: dashboard read views must reach these only via
  // the /api/bot/override HTTP route (the override-controls client POSTs),
  // NEVER by importing the write helper directly. (The client imports the
  // `OverrideKind` TYPE only — `import type` is erased, so it doesn't match.)
  "pauseSession",
  "resumeSession",
  "resetSession",
];

describe("dashboard — READ-ONLY (all mutation verbs + helpers; AC 6)", () => {
  it("no INSERT/UPDATE/DELETE/TRUNCATE/UPSERT SQL in app/dashboard or lib/dashboard", () => {
    const violations: string[] = [];
    for (const dir of DASHBOARD_DIRS) {
      for (const file of walkTsFiles(dir)) {
        const stripped = readFileSync(file, "utf8")
          .split("\n")
          .filter((l) => !/^\s*(\/\/|\*)/.test(l)) // ignore comment lines
          .join("\n");
        if (MUTATION_SQL.test(stripped)) violations.push(file.replace(REPO_ROOT + "/", ""));
      }
    }
    expect(violations).toEqual([]);
  });

  it("imports no mutating helpers", () => {
    const violations: string[] = [];
    for (const dir of DASHBOARD_DIRS) {
      for (const file of walkTsFiles(dir)) {
        const contents = readFileSync(file, "utf8");
        for (const helper of MUTATING_HELPERS) {
          if (new RegExp(`\\bimport\\b[^;]*\\b${helper}\\b`).test(contents)) {
            violations.push(`${file.replace(REPO_ROOT + "/", "")} imports ${helper}`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

// ── 2. no order placement (transitive walk) ─────────────────────────────────
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

describe("dashboard — no order placement (AC 7)", () => {
  it("transitive import graph never reaches lib/coinbase/orders.ts", () => {
    const entries = DASHBOARD_DIRS.flatMap((d) => walkTsFiles(d));
    const graph = walkGraph(entries);
    expect(graph.size).toBeGreaterThan(entries.length); // smoke: it walked
    expect(graph.has(ORDERS_FILE)).toBe(false);
  });
});

// CB-6.4 unit tests for lib/dashboard/cockpit-trade-log.ts.
// Recording-mock DB tracks WHICH streams run (orders vs signals) — the
// status-filter stream-selection is the unit-testable contract; the SQL
// status= filter itself is delegated to the DB (covered by e2e). DB-only read.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface OrderRow {
  id: string;
  side: string;
  usd: number;
  status: string;
  created_at: Date;
}
interface SkipRow {
  id: string;
  tick_started_at: Date;
  reason: string;
}

let orderRows: OrderRow[] = [];
let skipRows: SkipRow[] = [];
let queriedOrders = false;
let queriedSignals = false;

function sqlMock(strings: TemplateStringsArray, ..._v: unknown[]) {
  const text = strings.join("?");
  if (/FROM orders/.test(text)) {
    queriedOrders = true;
    return Promise.resolve(orderRows);
  }
  if (/FROM signals/.test(text)) {
    queriedSignals = true;
    return Promise.resolve(skipRows);
  }
  return Promise.resolve([]);
}
vi.mock("@/lib/db/client", () => ({ db: () => sqlMock }));

import { loadCockpitTradeLog, parseTradeLogStatus } from "@/lib/dashboard/cockpit-trade-log";

beforeEach(() => {
  queriedOrders = false;
  queriedSignals = false;
  orderRows = [
    { id: "o1", side: "buy", usd: 25, status: "dry_run", created_at: new Date("2026-06-17T00:15:00Z") },
  ];
  skipRows = [
    { id: "s1", tick_started_at: new Date("2026-06-17T00:30:00Z"), reason: "hold: USD reserve" },
    { id: "s2", tick_started_at: new Date("2026-06-17T00:00:00Z"), reason: "hold: no buy" },
  ];
});
afterEach(() => vi.clearAllMocks());

describe("parseTradeLogStatus", () => {
  it("accepts valid statuses; defaults invalid/undefined to all", () => {
    expect(parseTradeLogStatus("skipped")).toBe("skipped");
    expect(parseTradeLogStatus("dry_run")).toBe("dry_run");
    expect(parseTradeLogStatus("bogus")).toBe("all");
    expect(parseTradeLogStatus(undefined)).toBe("all");
  });
});

describe("loadCockpitTradeLog", () => {
  it("all → both streams, merged newest-first", async () => {
    const { rows } = await loadCockpitTradeLog("ETH-USD", "all");
    expect(queriedOrders).toBe(true);
    expect(queriedSignals).toBe(true);
    // newest first: skip@00:30, trade@00:15, skip@00:00
    expect(rows.map((r) => r.id)).toEqual(["s1", "o1", "s2"]);
    expect(rows[1]).toMatchObject({ kind: "trade", side: "buy", usd: 25, status: "dry_run", reason: null });
    expect(rows[0]).toMatchObject({ kind: "skip", side: null, usd: null, status: "SKIPPED", reason: "hold: USD reserve" });
  });

  it("skipped → only the signals stream (no orders query)", async () => {
    const { rows } = await loadCockpitTradeLog("ETH-USD", "skipped");
    expect(queriedOrders).toBe(false);
    expect(queriedSignals).toBe(true);
    expect(rows.every((r) => r.kind === "skip")).toBe(true);
  });

  it("an order status → only the orders stream (no signals query)", async () => {
    const { rows } = await loadCockpitTradeLog("ETH-USD", "dry_run");
    expect(queriedOrders).toBe(true);
    expect(queriedSignals).toBe(false);
    expect(rows.every((r) => r.kind === "trade")).toBe(true);
  });

  it("empty → []", async () => {
    orderRows = [];
    skipRows = [];
    const { rows, hasMore } = await loadCockpitTradeLog("ETH-USD", "all");
    expect(rows).toEqual([]);
    expect(hasMore).toBe(false);
  });

  it("hasMore when the merged set exceeds the limit", async () => {
    const { rows, hasMore } = await loadCockpitTradeLog("ETH-USD", "all", 2);
    expect(rows).toHaveLength(2);
    expect(hasMore).toBe(true); // 1 trade + 2 skips = 3 > 2
  });
});

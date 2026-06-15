// Unit tests for lib/dashboard/decision-trace.ts (CB-5.1 read model).
//
// Recording-mock DB routed by query text (bot_ticks vs signals). Asserts
// newest-first ordering, signals grouped under ticks, limit honored,
// error-tick (no signals) handled, null rsi/ma preserved.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface TickRow {
  id: string;
  tick_started_at: Date;
  decision: string;
  reason: string;
  error_detail: string | null;
}
interface SignalRow {
  tick_id: string;
  asset_identifier: string;
  decision: string;
  rsi: number | null;
  ma: number | null;
  ma_period: number | null;
  last_close: number | null;
  reason: string;
}

const capturedQueries: string[] = [];
let tickResult: TickRow[] = [];
let signalResult: SignalRow[] = [];

function sqlMock(strings: TemplateStringsArray, ..._values: unknown[]) {
  const text = strings.join("?");
  capturedQueries.push(text);
  if (/FROM bot_ticks/.test(text)) return Promise.resolve(tickResult);
  if (/FROM signals/.test(text)) return Promise.resolve(signalResult);
  return Promise.resolve([]);
}
vi.mock("@/lib/db/client", () => ({ db: () => sqlMock }));

import { loadDecisionTrace } from "@/lib/dashboard/decision-trace";

beforeEach(() => {
  capturedQueries.length = 0;
  tickResult = [];
  signalResult = [];
});
afterEach(() => vi.clearAllMocks());

describe("loadDecisionTrace", () => {
  it("returns ticks newest-first with signals grouped under them", async () => {
    tickResult = [
      { id: "t2", tick_started_at: new Date("2026-06-14T17:15:00Z"), decision: "hold", reason: "agg2", error_detail: null },
      { id: "t1", tick_started_at: new Date("2026-06-14T17:00:00Z"), decision: "buy", reason: "agg1", error_detail: null },
    ];
    signalResult = [
      { tick_id: "t1", asset_identifier: "BTC-USD", decision: "buy", rsi: 27.3, ma: 42010, ma_period: 20, last_close: 41900, reason: "buy: rsi…" },
      { tick_id: "t2", asset_identifier: "BTC-USD", decision: "hold", rsi: 58.58, ma: 64103.95, ma_period: 20, last_close: 64160, reason: "hold: rsi…" },
    ];
    const { ticks } = await loadDecisionTrace();
    expect(ticks.map((t) => t.id)).toEqual(["t2", "t1"]); // SQL ORDER BY DESC preserved
    expect(ticks[0]?.signals).toHaveLength(1);
    expect(ticks[0]?.signals[0]?.assetIdentifier).toBe("BTC-USD");
    expect(ticks[1]?.signals[0]?.reason).toBe("buy: rsi…");
  });

  it("the ticks query orders by tick_started_at DESC", async () => {
    await loadDecisionTrace();
    const tq = capturedQueries.find((q) => /FROM bot_ticks/.test(q)) ?? "";
    expect(tq).toContain("ORDER BY tick_started_at DESC");
  });

  it("hasMore=true when more ticks exist than the limit (fetch limit+1)", async () => {
    // limit 1 → fetch 2; return 2 → hasMore, page sliced to 1.
    tickResult = [
      { id: "t2", tick_started_at: new Date("2026-06-14T17:15:00Z"), decision: "hold", reason: "a", error_detail: null },
      { id: "t1", tick_started_at: new Date("2026-06-14T17:00:00Z"), decision: "hold", reason: "b", error_detail: null },
    ];
    const { ticks, hasMore } = await loadDecisionTrace(1);
    expect(ticks).toHaveLength(1);
    expect(hasMore).toBe(true);
  });

  it("hasMore=false when ticks fit within the limit", async () => {
    tickResult = [
      { id: "t1", tick_started_at: new Date("2026-06-14T17:00:00Z"), decision: "hold", reason: "b", error_detail: null },
    ];
    const { hasMore } = await loadDecisionTrace(50);
    expect(hasMore).toBe(false);
  });

  it("error tick (no signals) is returned with errorDetail + empty signals", async () => {
    tickResult = [
      { id: "terr", tick_started_at: new Date("2026-06-14T16:45:00Z"), decision: "hold", reason: "tick_error", error_detail: "coinbase 502" },
    ];
    signalResult = [];
    const { ticks } = await loadDecisionTrace();
    expect(ticks[0]?.errorDetail).toBe("coinbase 502");
    expect(ticks[0]?.signals).toEqual([]);
  });

  it("null rsi/ma preserved (insufficient-signal sentinel), not coerced", async () => {
    tickResult = [
      { id: "t1", tick_started_at: new Date("2026-06-14T17:00:00Z"), decision: "hold", reason: "a", error_detail: null },
    ];
    signalResult = [
      { tick_id: "t1", asset_identifier: "BTC-USD", decision: "hold", rsi: null, ma: null, ma_period: null, last_close: null, reason: "hold: insufficient signal data" },
    ];
    const { ticks } = await loadDecisionTrace();
    expect(ticks[0]?.signals[0]?.rsi).toBeNull();
    expect(ticks[0]?.signals[0]?.ma).toBeNull();
  });

  it("no ticks → empty trace, no signals query issued", async () => {
    tickResult = [];
    const { ticks, hasMore } = await loadDecisionTrace();
    expect(ticks).toEqual([]);
    expect(hasMore).toBe(false);
    expect(capturedQueries.some((q) => /FROM signals/.test(q))).toBe(false);
  });
});

// CB-6.2 unit tests for lib/dashboard/cockpit-pnl.ts.
// Recording-mock DB (session-id + session-orders queries) + mocked Coinbase;
// real computeAssetPnl. Load-bearing: a malformed fill must PROPAGATE (the
// PR #73 fail-loud lesson), not degrade to null.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Fill } from "@/lib/coinbase/account-schemas";

let sessionRows: { id: string }[] = [];
let orderAgg: { buy_count: number; invested: number }[] = [];
function sqlMock(strings: TemplateStringsArray, ..._v: unknown[]) {
  const text = strings.join("?");
  if (/FROM bot_sessions/.test(text)) return Promise.resolve(sessionRows);
  if (/FROM orders/.test(text)) return Promise.resolve(orderAgg);
  return Promise.resolve([]);
}
vi.mock("@/lib/db/client", () => ({ db: () => sqlMock }));

const getAccountTradeHistory = vi.fn();
vi.mock("@/lib/coinbase/accounts", () => ({ getAccountTradeHistory: (a: unknown) => getAccountTradeHistory(a) }));
const getProduct = vi.fn();
vi.mock("@/lib/coinbase/market", () => ({ getProduct: (id: unknown) => getProduct(id) }));

import { loadCockpitPnl } from "@/lib/dashboard/cockpit-pnl";

function fill(o: Partial<Fill>): Fill {
  return {
    entry_id: "e", trade_id: "t", order_id: "o", trade_time: "2026-06-01T00:00:00Z",
    price: "2173.78", size: "0.069004", product_id: "ETH-USD", side: "BUY", ...o,
  } as Fill;
}

beforeEach(() => {
  sessionRows = [{ id: "session-1" }];
  orderAgg = [{ buy_count: 4, invested: 150 }];
  getAccountTradeHistory.mockResolvedValue({ fills: [fill({})] });
  getProduct.mockResolvedValue({ product_id: "ETH-USD", price: "1792.39" });
});
afterEach(() => vi.clearAllMocks());

describe("loadCockpitPnl", () => {
  it("session invested/buys + all-time position value/unrealized/realized", async () => {
    const r = (await loadCockpitPnl("ETH-USD"))!;
    expect(r.invested).toBe(150);
    expect(r.buys).toBe(4);
    expect(r.currentValue).toBeCloseTo(0.069004 * 1792.39, 4);
    expect(r.unrealizedPnlUsd).toBeCloseTo((1792.39 - 2173.78) * 0.069004, 4);
    expect(r.realizedPnlUsd).toBe(0);
    expect(r.unrealizedPct).toBeCloseTo(r.unrealizedPnlUsd! / (2173.78 * 0.069004), 6);
  });

  it("Coinbase read fail → P&L fields null, invested/buys intact", async () => {
    getAccountTradeHistory.mockRejectedValue(new Error("coinbase 503"));
    const r = (await loadCockpitPnl("ETH-USD"))!;
    expect(r.invested).toBe(150); // DB-only — unaffected
    expect(r.buys).toBe(4);
    expect(r.currentValue).toBeNull();
    expect(r.unrealizedPnlUsd).toBeNull();
    expect(r.realizedPnlUsd).toBeNull();
  });

  it("malformed fill PROPAGATES (NOT swallowed as unavailable) — PR #73 regression", async () => {
    getAccountTradeHistory.mockResolvedValue({ fills: [fill({ price: "not-a-number" })] });
    await expect(loadCockpitPnl("ETH-USD")).rejects.toThrow(/malformed fill/);
  });

  it("missing price → currentValue + unrealized null, realized still computed", async () => {
    getProduct.mockResolvedValue({ product_id: "ETH-USD" }); // no price
    const r = (await loadCockpitPnl("ETH-USD"))!;
    expect(r.currentValue).toBeNull();
    expect(r.unrealizedPnlUsd).toBeNull();
    expect(r.realizedPnlUsd).toBe(0); // computeAssetPnl still ran
  });

  it("no active session → returns null (no P&L card; AC 5)", async () => {
    sessionRows = [];
    expect(await loadCockpitPnl("ETH-USD")).toBeNull();
  });

  it("0 buys this session → invested $0", async () => {
    orderAgg = [{ buy_count: 0, invested: 0 }];
    const r = (await loadCockpitPnl("ETH-USD"))!;
    expect(r.invested).toBe(0);
    expect(r.buys).toBe(0);
  });
});

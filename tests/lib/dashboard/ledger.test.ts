// Unit tests for lib/dashboard/ledger.ts (CB-5.2 read model).
// Recording-mock DB (orders query) + mocked Coinbase + strategy.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Fill } from "@/lib/coinbase/account-schemas";

const capturedQueries: string[] = [];
let orderRows: Record<string, unknown>[] = [];

function sqlMock(strings: TemplateStringsArray, ..._v: unknown[]) {
  capturedQueries.push(strings.join("?"));
  return Promise.resolve(orderRows);
}
vi.mock("@/lib/db/client", () => ({ db: () => sqlMock }));

const getAccountTradeHistory = vi.fn();
vi.mock("@/lib/coinbase/accounts", () => ({ getAccountTradeHistory: (a: unknown) => getAccountTradeHistory(a) }));
const getProduct = vi.fn();
vi.mock("@/lib/coinbase/market", () => ({ getProduct: (id: unknown) => getProduct(id) }));
const getActiveStrategy = vi.fn();
vi.mock("@/lib/strategies/db", () => ({ getActiveStrategy: () => getActiveStrategy() }));

import { loadLedger } from "@/lib/dashboard/ledger";

function order(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "o1", asset_identifier: "BTC-USD", source: "bot", side: "buy",
    amount: 50, status: "dry_run", created_at: new Date("2026-06-14T17:00:00Z"), ...over,
  };
}
function fill(o: Partial<Fill>): Fill {
  return { entry_id: "e", trade_id: "t", order_id: "o", trade_time: "2026-06-01T00:00:00Z", price: "100", size: "1", product_id: "BTC-USD", side: "BUY", ...o } as Fill;
}

beforeEach(() => {
  capturedQueries.length = 0;
  orderRows = [];
  getActiveStrategy.mockResolvedValue({ selected_assets: [{ assetClass: "crypto-coinbase", identifier: "BTC-USD" }] });
  getAccountTradeHistory.mockResolvedValue({ fills: [fill({ price: "42000", size: "0.001" })] });
  getProduct.mockResolvedValue({ product_id: "BTC-USD", volume_24h: "1", price: "43000" });
});
afterEach(() => vi.clearAllMocks());

describe("loadLedger — orders", () => {
  it("orders newest-first, mapped to typed rows", async () => {
    orderRows = [order({ id: "o2", status: "submitted", side: "sell" }), order({ id: "o1" })];
    const { orders } = await loadLedger();
    expect(orders.map((o) => o.id)).toEqual(["o2", "o1"]);
    expect(orders[0]?.status).toBe("submitted");
    const q = capturedQueries.find((s) => /FROM orders/.test(s)) ?? "";
    expect(q).toContain("ORDER BY created_at DESC");
  });

  it("hasMore via limit+1", async () => {
    orderRows = [order({ id: "o2" }), order({ id: "o1" })];
    const { orders, hasMore } = await loadLedger(1);
    expect(orders).toHaveLength(1);
    expect(hasMore).toBe(true);
  });
});

describe("loadLedger — PnL", () => {
  it("computes per-asset PnL from fills + current price", async () => {
    orderRows = [order()];
    const { pnl } = await loadLedger();
    expect(pnl).not.toBeNull();
    const btc = pnl?.find((p) => p.assetIdentifier === "BTC-USD");
    expect(btc?.quantity).toBe(0.001);
    expect(btc?.avgCostUsd).toBe(42000);
    expect(btc?.currentPrice).toBe(43000);
    expect(btc?.unrealizedPnlUsd).toBeCloseTo((43000 - 42000) * 0.001, 6);
  });

  it("degrades pnl to null when a Coinbase READ fails (orders still load)", async () => {
    orderRows = [order()];
    getAccountTradeHistory.mockRejectedValue(new Error("coinbase 503"));
    const { orders, pnl } = await loadLedger();
    expect(pnl).toBeNull();
    expect(orders).toHaveLength(1); // orders table unaffected
  });

  it("FAILS LOUD on a malformed fill — does NOT swallow it as degradation (PR #73 BLOCKER)", async () => {
    orderRows = [order()];
    // Coinbase READS succeed, but a fill is malformed → replayFills throws.
    // That's contract drift, not a Coinbase outage: it must propagate, NOT
    // be caught and returned as pnl:null.
    getAccountTradeHistory.mockResolvedValue({ fills: [fill({ price: "not-a-number" })] });
    await expect(loadLedger()).rejects.toThrow(/malformed fill/);
  });

  it("missing product price → currentPrice null → unrealized null", async () => {
    orderRows = [order()];
    getProduct.mockResolvedValue({ product_id: "BTC-USD", volume_24h: "1" }); // no price
    const { pnl } = await loadLedger();
    expect(pnl?.[0]?.currentPrice).toBeNull();
    expect(pnl?.[0]?.unrealizedPnlUsd).toBeNull();
  });

  it("no active strategy → empty pnl array (not null)", async () => {
    orderRows = [order()];
    getActiveStrategy.mockResolvedValue(null);
    const { pnl } = await loadLedger();
    expect(pnl).toEqual([]);
  });
});

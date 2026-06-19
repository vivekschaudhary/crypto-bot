// CB-6.1 unit tests for lib/dashboard/cockpit-position.ts.
// Recording-mock DB (RSI query) + mocked Coinbase; lets the REAL
// aggregatePosition run on mocked fills (live-state.test.ts pattern).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Fill } from "@/lib/coinbase/account-schemas";

let rsiRows: { rsi: number | null }[] = [];
function sqlMock(strings: TemplateStringsArray, ..._v: unknown[]) {
  const text = strings.join("?");
  if (/FROM signals/.test(text)) return Promise.resolve(rsiRows);
  return Promise.resolve([]);
}
vi.mock("@/lib/db/client", () => ({ db: () => sqlMock }));
// CB-6.7: these tests exercise the REAL-fills path (LIVE_MODE=true); the
// paper-mode path is covered by cockpit-position-paper.test.ts.
vi.mock("@/lib/env", () => ({ env: () => ({ LIVE_MODE: true }) }));

const getAccountTradeHistory = vi.fn();
vi.mock("@/lib/coinbase/accounts", () => ({
  getAccountTradeHistory: (a: unknown) => getAccountTradeHistory(a),
}));
const getProduct = vi.fn();
vi.mock("@/lib/coinbase/market", () => ({ getProduct: (id: unknown) => getProduct(id) }));

import { loadCockpitPosition, resolveViewedPair } from "@/lib/dashboard/cockpit-position";

function fill(o: Partial<Fill>): Fill {
  return {
    entry_id: "e", trade_id: "t", order_id: "o", trade_time: "2026-06-01T00:00:00Z",
    price: "100", size: "1", product_id: "ETH-USD", side: "BUY", ...o,
  } as Fill;
}

beforeEach(() => {
  rsiRows = [{ rsi: 50 }];
  getAccountTradeHistory.mockResolvedValue({ fills: [fill({ price: "2173.78", size: "0.069004" })] });
  getProduct.mockResolvedValue({ product_id: "ETH-USD", price: "1792.39" });
});
afterEach(() => vi.clearAllMocks());

describe("resolveViewedPair", () => {
  it("no selected assets → null", () => expect(resolveViewedPair("ETH-USD", [])).toBeNull());
  it("requested + in set → requested", () => expect(resolveViewedPair("ETH-USD", ["BTC-USD", "ETH-USD"])).toBe("ETH-USD"));
  it("requested NOT in set → first", () => expect(resolveViewedPair("DOGE-USD", ["BTC-USD", "ETH-USD"])).toBe("BTC-USD"));
  it("no requested → first", () => expect(resolveViewedPair(undefined, ["BTC-USD", "ETH-USD"])).toBe("BTC-USD"));
});

describe("loadCockpitPosition", () => {
  it("composes position + live price + latest RSI", async () => {
    const r = await loadCockpitPosition("ETH-USD");
    expect(r.pair).toBe("ETH-USD");
    expect(r.position?.quantity).toBeCloseTo(0.069004, 6);
    expect(r.position?.avgCostUsd).toBeCloseTo(2173.78, 2);
    expect(r.livePrice).toBe(1792.39);
    expect(r.rsi).toBe(50);
  });

  it("no fills → null position (other cells intact)", async () => {
    getAccountTradeHistory.mockResolvedValue({ fills: [] });
    const r = await loadCockpitPosition("ETH-USD");
    expect(r.position).toBeNull();
    expect(r.livePrice).toBe(1792.39);
  });

  it("Coinbase holdings read fails → position null (degrade, no throw)", async () => {
    getAccountTradeHistory.mockRejectedValue(new Error("coinbase 503"));
    const r = await loadCockpitPosition("ETH-USD");
    expect(r.position).toBeNull();
    expect(r.livePrice).toBe(1792.39); // price unaffected
  });

  it("price read fails → livePrice null", async () => {
    getProduct.mockRejectedValue(new Error("coinbase 503"));
    const r = await loadCockpitPosition("ETH-USD");
    expect(r.livePrice).toBeNull();
    expect(r.position).not.toBeNull(); // holdings unaffected
  });

  it("missing price field → livePrice null", async () => {
    getProduct.mockResolvedValue({ product_id: "ETH-USD" });
    expect((await loadCockpitPosition("ETH-USD")).livePrice).toBeNull();
  });

  it("no signal row → rsi null", async () => {
    rsiRows = [];
    expect((await loadCockpitPosition("ETH-USD")).rsi).toBeNull();
  });
});

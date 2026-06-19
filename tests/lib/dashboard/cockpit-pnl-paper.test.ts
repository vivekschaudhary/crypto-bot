// CB-6.7 — loadCockpitPnl in PAPER mode (LIVE_MODE=false). The fix for the
// operator's "$400 invested / $0 value": the position comes from the dry_run
// ledger (synthesizePaperFills), so invested ↔ value ↔ P&L are consistent, and
// real Coinbase fills are NOT fetched. (Real-mode path: cockpit-pnl.test.ts.)

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
vi.mock("@/lib/env", () => ({ env: () => ({ LIVE_MODE: false }) }));

const getProduct = vi.fn();
vi.mock("@/lib/coinbase/market", () => ({ getProduct: (id: unknown) => getProduct(id) }));
const getAccountTradeHistory = vi.fn();
vi.mock("@/lib/coinbase/accounts", () => ({ getAccountTradeHistory: (a: unknown) => getAccountTradeHistory(a) }));

const synthesizePaperFills = vi.fn();
vi.mock("@/lib/dashboard/paper-fills", () => ({ synthesizePaperFills: (p: unknown) => synthesizePaperFills(p) }));

import { loadCockpitPnl } from "@/lib/dashboard/cockpit-pnl";

function fill(side: "BUY" | "SELL", size: string, price: string): Fill {
  return { entry_id: "e", trade_id: "t", order_id: "o", trade_time: "2026-06-18T00:00:00Z", price, size, product_id: "ETH-USD", side } as Fill;
}

beforeEach(() => {
  sessionRows = [{ id: "session-1" }];
  orderAgg = [{ buy_count: 2, invested: 150 }]; // dry_run buys this session
  getProduct.mockResolvedValue({ product_id: "ETH-USD", price: "2000" });
  // paper position: 0.07 ETH, cost $150 (avg ~2142.86)
  synthesizePaperFills.mockResolvedValue([fill("BUY", "0.05", "2000"), fill("BUY", "0.02", "2500")]);
});
afterEach(() => vi.clearAllMocks());

describe("loadCockpitPnl — paper mode (LIVE_MODE=false)", () => {
  it("derives value from the PAPER position, NOT real fills; consistent with invested", async () => {
    const r = (await loadCockpitPnl("ETH-USD"))!;
    expect(r.paper).toBe(true);
    expect(getAccountTradeHistory).not.toHaveBeenCalled(); // real fills NOT fetched while dark
    expect(synthesizePaperFills).toHaveBeenCalledWith("ETH-USD");
    expect(r.invested).toBe(150);
    // value = paper qty (0.07) × live price (2000) = 140 — NOT $0
    expect(r.currentValue).toBeCloseTo(0.07 * 2000, 4);
    expect(r.currentValue).not.toBe(0);
    // a real paper P&L (price below avg cost ~2142.86 → small loss)
    expect(r.unrealizedPnlUsd).toBeLessThan(0);
  });

  it("no dry_run buys → flat paper position ($0 value), still consistent (not $X / $0)", async () => {
    orderAgg = [{ buy_count: 0, invested: 0 }];
    synthesizePaperFills.mockResolvedValue([]);
    const r = (await loadCockpitPnl("ETH-USD"))!;
    expect(r.invested).toBe(0);
    expect(r.currentValue).toBe(0);
    expect(r.paper).toBe(true);
  });
});

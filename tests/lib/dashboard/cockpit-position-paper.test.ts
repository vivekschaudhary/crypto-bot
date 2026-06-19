// CB-6.7 — loadCockpitPosition in PAPER mode (LIVE_MODE=false): the held qty +
// avg cost come from the dry_run ledger (synthesizePaperFills → aggregatePosition),
// NOT real Coinbase fills. (Real-mode path: cockpit-position.test.ts.)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Fill } from "@/lib/coinbase/account-schemas";

function sqlMock(strings: TemplateStringsArray, ..._v: unknown[]) {
  const text = strings.join("?");
  if (/FROM signals/.test(text)) return Promise.resolve([{ rsi: 55 }]);
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

import { loadCockpitPosition } from "@/lib/dashboard/cockpit-position";

function fill(side: "BUY" | "SELL", size: string, price: string): Fill {
  return { entry_id: "e", trade_id: "t", order_id: "o", trade_time: "2026-06-18T00:00:00Z", price, size, product_id: "ETH-USD", side } as Fill;
}

beforeEach(() => {
  getProduct.mockResolvedValue({ product_id: "ETH-USD", price: "2000" });
  synthesizePaperFills.mockResolvedValue([fill("BUY", "0.05", "2000"), fill("BUY", "0.02", "2500")]);
});
afterEach(() => vi.clearAllMocks());

describe("loadCockpitPosition — paper mode (LIVE_MODE=false)", () => {
  it("derives the position from the dry_run ledger, NOT real fills; paper=true", async () => {
    const r = await loadCockpitPosition("ETH-USD");
    expect(r.paper).toBe(true);
    expect(getAccountTradeHistory).not.toHaveBeenCalled();
    expect(synthesizePaperFills).toHaveBeenCalledWith("ETH-USD");
    expect(r.position?.quantity).toBeCloseTo(0.07, 6);
    expect(r.livePrice).toBe(2000);
    expect(r.rsi).toBe(55);
  });

  it("no dry_run orders → no paper position", async () => {
    synthesizePaperFills.mockResolvedValue([]);
    const r = await loadCockpitPosition("ETH-USD");
    expect(r.position).toBeNull();
    expect(r.paper).toBe(true);
  });
});

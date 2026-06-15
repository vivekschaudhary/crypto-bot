// Unit tests for lib/dashboard/pnl.ts — computeAssetPnl (CB-5.2).
// Realized + unrealized PnL on the shared weighted-average replay.

import { describe, expect, it } from "vitest";

import type { Fill } from "@/lib/coinbase/account-schemas";
import { computeAssetPnl } from "@/lib/dashboard/pnl";

let seq = 0;
function fill(o: Partial<Fill>): Fill {
  seq += 1;
  return {
    entry_id: `e${seq}`, trade_id: `t${seq}`, order_id: `o${seq}`,
    trade_time: `2026-06-0${(seq % 9) + 1}T00:00:00Z`,
    price: "100", size: "1", product_id: "BTC-USD", side: "BUY", ...o,
  } as Fill;
}

describe("computeAssetPnl", () => {
  it("buys only: realized 0, unrealized from current price, weighted-avg cost", () => {
    const r = computeAssetPnl(
      [fill({ price: "100", size: "1", trade_time: "2026-06-01T00:00:00Z" }), fill({ price: "200", size: "1", trade_time: "2026-06-02T00:00:00Z" })],
      300,
    );
    expect(r.quantity).toBe(2);
    expect(r.avgCostUsd).toBe(150);
    expect(r.realizedPnlUsd).toBe(0);
    expect(r.unrealizedPnlUsd).toBe(300); // (300−150)×2
  });

  it("partial sell realizes gain at the avg cost; remaining position keeps avg", () => {
    const r = computeAssetPnl(
      [fill({ price: "100", size: "2", trade_time: "2026-06-01T00:00:00Z" }), fill({ price: "180", size: "1", side: "SELL", trade_time: "2026-06-02T00:00:00Z" })],
      100,
    );
    expect(r.quantity).toBe(1);
    expect(r.avgCostUsd).toBe(100);
    expect(r.realizedPnlUsd).toBe(80); // (180−100)×1
    expect(r.unrealizedPnlUsd).toBe(0); // (100−100)×1
  });

  it("full exit: quantity 0, realized = total gain, unrealized null (flat)", () => {
    const r = computeAssetPnl(
      [fill({ price: "100", size: "1", trade_time: "2026-06-01T00:00:00Z" }), fill({ price: "120", size: "1", side: "SELL", trade_time: "2026-06-02T00:00:00Z" })],
      999,
    );
    expect(r.quantity).toBe(0);
    expect(r.realizedPnlUsd).toBe(20);
    expect(r.unrealizedPnlUsd).toBeNull();
  });

  it("null current price → unrealized null, realized + position still computed", () => {
    const r = computeAssetPnl([fill({ price: "100", size: "1" })], null);
    expect(r.quantity).toBe(1);
    expect(r.avgCostUsd).toBe(100);
    expect(r.realizedPnlUsd).toBe(0);
    expect(r.currentPrice).toBeNull();
    expect(r.unrealizedPnlUsd).toBeNull();
  });

  it("loss case: unrealized negative when price below avg cost", () => {
    const r = computeAssetPnl([fill({ price: "100", size: "1" })], 90);
    expect(r.unrealizedPnlUsd).toBe(-10);
  });

  it("zero fills → flat, all zero, unrealized null", () => {
    const r = computeAssetPnl([], 100);
    expect(r).toEqual({ quantity: 0, avgCostUsd: 0, currentPrice: 100, realizedPnlUsd: 0, unrealizedPnlUsd: null });
  });

  it("malformed fill throws loud (via replayFills)", () => {
    expect(() => computeAssetPnl([fill({ price: "not-a-number" })], 100)).toThrow(/malformed fill/);
  });
});

// Unit tests for `lib/ticks/cost-basis.ts` — fills → net position.
//
// CB-4.2 AC 7 + AC 12 — weighted-average math, size_in_quote handling,
// chronological replay, oversell clamp, zero fills, malformed fills.

import { describe, expect, it } from "vitest";

import type { Fill } from "@/lib/coinbase/account-schemas";
import { aggregatePosition } from "@/lib/ticks/cost-basis";

let entrySeq = 0;
function makeFill(overrides: Partial<Fill>): Fill {
  entrySeq += 1;
  return {
    entry_id: `entry-${entrySeq}`,
    trade_id: `trade-${entrySeq}`,
    order_id: `order-${entrySeq}`,
    trade_time: "2026-06-01T00:00:00Z",
    price: "100",
    size: "1",
    product_id: "BTC-USD",
    side: "BUY",
    ...overrides,
  } as Fill;
}

describe("aggregatePosition — buys", () => {
  it("single buy → position at fill price", () => {
    const position = aggregatePosition([makeFill({ price: "42000", size: "0.5" })]);
    expect(position).toEqual({ avgCostUsd: 42000, quantity: 0.5 });
  });

  it("two buys at different prices → weighted-average cost", () => {
    const position = aggregatePosition([
      makeFill({ price: "100", size: "1", trade_time: "2026-06-01T00:00:00Z" }),
      makeFill({ price: "200", size: "1", trade_time: "2026-06-02T00:00:00Z" }),
    ]);
    // (1×100 + 1×200) / 2 = 150
    expect(position?.avgCostUsd).toBe(150);
    expect(position?.quantity).toBe(2);
  });

  it("size_in_quote=true converts USD size to base quantity", () => {
    // $500 at $100/unit → 5 units at avg cost $100.
    const position = aggregatePosition([
      makeFill({ price: "100", size: "500", size_in_quote: true }),
    ]);
    expect(position).toEqual({ avgCostUsd: 100, quantity: 5 });
  });
});

describe("aggregatePosition — sells (weighted-average reduction)", () => {
  it("partial sell reduces quantity but PRESERVES average cost", () => {
    const position = aggregatePosition([
      makeFill({ price: "100", size: "2", trade_time: "2026-06-01T00:00:00Z" }),
      makeFill({
        price: "180",
        size: "1",
        side: "SELL",
        trade_time: "2026-06-02T00:00:00Z",
      }),
    ]);
    // Selling at ANY price removes cost at the current avg (100) — avg of
    // the remaining unit stays 100; sale price affects realized PnL, not
    // the remaining basis.
    expect(position?.avgCostUsd).toBe(100);
    expect(position?.quantity).toBe(1);
  });

  it("sells consuming the full position → null (flat)", () => {
    const position = aggregatePosition([
      makeFill({ price: "100", size: "1", trade_time: "2026-06-01T00:00:00Z" }),
      makeFill({
        price: "120",
        size: "1",
        side: "SELL",
        trade_time: "2026-06-02T00:00:00Z",
      }),
    ]);
    expect(position).toBeNull();
  });

  it("oversell (sell > tracked buys) clamps to flat rather than negative", () => {
    const position = aggregatePosition([
      makeFill({ price: "100", size: "1", trade_time: "2026-06-01T00:00:00Z" }),
      makeFill({
        price: "120",
        size: "5",
        side: "SELL",
        trade_time: "2026-06-02T00:00:00Z",
      }),
    ]);
    expect(position).toBeNull();
  });

  it("replays fills in trade_time order even when input is newest-first (Coinbase order)", () => {
    // Newest-first input: the SELL appears before the BUY it depends on.
    // Chronological replay must process the buy first.
    const position = aggregatePosition([
      makeFill({
        price: "120",
        size: "1",
        side: "SELL",
        trade_time: "2026-06-02T00:00:00Z",
      }),
      makeFill({ price: "100", size: "2", trade_time: "2026-06-01T00:00:00Z" }),
    ]);
    expect(position?.quantity).toBe(1);
    expect(position?.avgCostUsd).toBe(100);
  });
});

describe("aggregatePosition — edges", () => {
  it("zero fills → null (no position)", () => {
    expect(aggregatePosition([])).toBeNull();
  });

  it("malformed fill (NaN price) throws loud (Coinbase contract drift)", () => {
    expect(() =>
      aggregatePosition([makeFill({ price: "not-a-number" })]),
    ).toThrow(/malformed fill/);
  });

  it("unknown side is ignored (passthrough spirit)", () => {
    const position = aggregatePosition([
      makeFill({ price: "100", size: "1" }),
      makeFill({ side: "CONVERT", price: "100", size: "1" }),
    ]);
    expect(position?.quantity).toBe(1);
  });
});

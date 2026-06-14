// Unit tests for `lib/ticks/orders.ts` — pure order helpers.
//
// CB-4.3 AC 12 — clientOrderId determinism, floor-to-increment rounding,
// limit-order price/size/amount math.

import { describe, expect, it } from "vitest";

import {
  SLIPPAGE,
  buildLimitOrder,
  deterministicClientOrderId,
  floorToIncrement,
} from "@/lib/ticks/orders";

const TICK = new Date("2026-06-14T14:00:00.000Z");

describe("deterministicClientOrderId (AC 5 — real-money idempotency guard)", () => {
  it("same (session, tick, asset) → same id", () => {
    const a = deterministicClientOrderId("s1", TICK, "BTC-USD");
    const b = deterministicClientOrderId("s1", TICK, "BTC-USD");
    expect(a).toBe(b);
  });

  it("different asset → different id", () => {
    const a = deterministicClientOrderId("s1", TICK, "BTC-USD");
    const b = deterministicClientOrderId("s1", TICK, "ETH-USD");
    expect(a).not.toBe(b);
  });

  it("different tick window → different id (next tick re-evaluates fresh)", () => {
    const a = deterministicClientOrderId("s1", TICK, "BTC-USD");
    const b = deterministicClientOrderId(
      "s1",
      new Date("2026-06-14T14:15:00.000Z"),
      "BTC-USD",
    );
    expect(a).not.toBe(b);
  });

  it("id is Coinbase-safe: ≤36 chars, alphanumeric", () => {
    const id = deterministicClientOrderId("s1", TICK, "BTC-USD");
    expect(id.length).toBeLessThanOrEqual(36);
    expect(id).toMatch(/^[a-z0-9]+$/);
  });
});

describe("floorToIncrement", () => {
  it("floors to the increment's precision", () => {
    expect(floorToIncrement(64402.5678, "0.01")).toBe("64402.56");
    expect(floorToIncrement(0.123456789, "0.00000001")).toBe("0.12345678");
    expect(floorToIncrement(5.9, "1")).toBe("5"); // 1-unit increment, 0 decimals (floor)
  });

  it("floors DOWN (never exceeds budget/holdings)", () => {
    // 0.019 at 0.01 increment → 0.01, not 0.02
    expect(floorToIncrement(0.019, "0.01")).toBe("0.01");
  });

  it("malformed increment → 8dp fallback (defensive, no crash)", () => {
    expect(floorToIncrement(1.23456789, "")).toBe("1.23456789");
  });
});

describe("buildLimitOrder — BUY", () => {
  it("limit price = lastClose × (1 + slippage); base_size = dollars / limitPrice; amount = dollars", () => {
    const r = buildLimitOrder({
      side: "BUY",
      lastClose: 1000,
      dollars: 50,
      quoteIncrement: "0.01",
      baseIncrement: "0.00000001",
    });
    expect(r.limitPrice).toBeCloseTo(1005, 5); // 1000 × 1.005
    expect(r.amountUsd).toBe(50);
    // base_size ≈ 50 / 1005 = 0.04975124, floored to 8dp
    expect(r.config).toHaveProperty("limit_limit_gtc");
    const cfg = r.config as { limit_limit_gtc: { base_size: string; limit_price: string } };
    expect(cfg.limit_limit_gtc.limit_price).toBe("1005.00");
    expect(Number(cfg.limit_limit_gtc.base_size)).toBeCloseTo(50 / 1005, 6);
  });
});

describe("buildLimitOrder — SELL", () => {
  it("limit price = lastClose × (1 − slippage); base_size = fraction × held; amount = base × price", () => {
    const r = buildLimitOrder({
      side: "SELL",
      lastClose: 2000,
      fraction: 0.5,
      heldQuantity: 3,
      quoteIncrement: "0.01",
      baseIncrement: "0.00000001",
    });
    expect(r.limitPrice).toBeCloseTo(1990, 5); // 2000 × 0.995
    expect(r.baseQuantity).toBeCloseTo(1.5, 6); // 0.5 × 3
    expect(r.amountUsd).toBeCloseTo(1.5 * 1990, 3);
    const cfg = r.config as { limit_limit_gtc: { base_size: string; limit_price: string } };
    expect(cfg.limit_limit_gtc.limit_price).toBe("1990.00");
    expect(Number(cfg.limit_limit_gtc.base_size)).toBeCloseTo(1.5, 6);
  });
});

describe("SLIPPAGE constant", () => {
  it("is 0.5% (Researcher Q3 closure value)", () => {
    expect(SLIPPAGE).toBe(0.005);
  });
});

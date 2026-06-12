// Unit tests for `lib/ticks/tick-helpers.ts`.
//
// CB-4.2 AC 4 (flooring) + AC 6 (aggregate + summary semantics).

import { describe, expect, it } from "vitest";

import type { DecisionResult } from "@/lib/decisions";
import type { Asset } from "@/lib/strategy-core/types";
import {
  aggregateTickDecision,
  floorToQuarterHour,
  summarizeTickReason,
} from "@/lib/ticks/tick-helpers";

const BTC: Asset = { assetClass: "crypto-coinbase", identifier: "BTC-USD" };
const ETH: Asset = { assetClass: "crypto-coinbase", identifier: "ETH-USD" };

function result(asset: Asset, decision: "buy" | "sell" | "hold"): DecisionResult {
  return { asset, decision, reason: `${decision}: test` };
}

describe("floorToQuarterHour (AC 4 — the UNIQUE-constraint overlap defense)", () => {
  it("14:07:33.250Z floors to 14:00:00.000Z", () => {
    const floored = floorToQuarterHour(new Date("2026-06-11T14:07:33.250Z"));
    expect(floored.toISOString()).toBe("2026-06-11T14:00:00.000Z");
  });

  it("14:59:59.999Z floors to 14:45:00.000Z", () => {
    const floored = floorToQuarterHour(new Date("2026-06-11T14:59:59.999Z"));
    expect(floored.toISOString()).toBe("2026-06-11T14:45:00.000Z");
  });

  it("an exact boundary maps to itself (idempotent)", () => {
    const boundary = new Date("2026-06-11T14:30:00.000Z");
    expect(floorToQuarterHour(boundary).getTime()).toBe(boundary.getTime());
  });

  it("two invocations inside the same window produce the SAME floor (double-fire defense)", () => {
    const a = floorToQuarterHour(new Date("2026-06-11T14:30:05.000Z"));
    const b = floorToQuarterHour(new Date("2026-06-11T14:44:59.000Z"));
    expect(a.getTime()).toBe(b.getTime());
  });
});

describe("aggregateTickDecision (AC 6 — 'buy' > 'sell' > 'hold')", () => {
  it("any buy wins", () => {
    expect(
      aggregateTickDecision([result(BTC, "hold"), result(ETH, "buy")]),
    ).toBe("buy");
  });

  it("sell wins over hold when no buy present", () => {
    expect(
      aggregateTickDecision([result(BTC, "hold"), result(ETH, "sell")]),
    ).toBe("sell");
  });

  it("all hold → hold; empty → hold", () => {
    expect(aggregateTickDecision([result(BTC, "hold")])).toBe("hold");
    expect(aggregateTickDecision([])).toBe("hold");
  });
});

describe("summarizeTickReason (AC 6 — compact scannable index)", () => {
  it("joins per-asset decisions in input order", () => {
    expect(
      summarizeTickReason([result(BTC, "buy"), result(ETH, "hold")]),
    ).toBe("BTC-USD: buy; ETH-USD: hold");
  });
});

// Unit tests for `lib/strategy-core/form-schema.ts`.

import { describe, expect, it } from "vitest";

import { StrategyFormPayloadSchema } from "@/lib/strategy-core/form-schema";

const VALID_ULID = "01H8XGJWBWBAQ4N7CHR3M9YT8K";

describe("StrategyFormPayloadSchema — Zod for form-submitted payload", () => {
  it("roundtrips a happy-path form payload (first-time authoring; null supersedes)", () => {
    const payload = {
      name: "First strategy",
      assetClass: "crypto-coinbase",
      selectedAssets: [
        { assetClass: "crypto-coinbase", identifier: "BTC-USD" },
      ],
      entryRules: { rsiThreshold: 30, maPeriod: 20 as const },
      exitRules: { rsiThreshold: 70, minProfitPct: 1.5, sellFraction: 0.5 },
      positionSizeUsd: 50,
      perSessionBuyCountCap: 10,
      perSessionDollarCap: 500,
      supersedesStrategyId: null,
    };
    const parsed = StrategyFormPayloadSchema.parse(payload);
    expect(parsed.name).toBe("First strategy");
    expect(parsed.supersedesStrategyId).toBeNull();
  });

  it("roundtrips a revision form payload (supersedesStrategyId set)", () => {
    const payload = {
      name: "Strategy v2",
      assetClass: "crypto-coinbase",
      selectedAssets: [
        { assetClass: "crypto-coinbase", identifier: "BTC-USD" },
        { assetClass: "crypto-coinbase", identifier: "ETH-USD" },
      ],
      entryRules: { rsiThreshold: 25, maPeriod: 10 as const, maReinforcement: true },
      exitRules: { rsiThreshold: 65, minProfitPct: 2, sellFraction: 0.75 },
      positionSizeUsd: 100,
      perSessionBuyCountCap: 5,
      perSessionDollarCap: 1000,
      supersedesStrategyId: VALID_ULID,
    };
    const parsed = StrategyFormPayloadSchema.parse(payload);
    expect(parsed.supersedesStrategyId).toBe(VALID_ULID);
    expect(parsed.selectedAssets).toHaveLength(2);
  });
});

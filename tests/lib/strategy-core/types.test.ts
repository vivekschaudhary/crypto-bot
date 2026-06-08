// Unit tests for `lib/strategy-core/types.ts`.
//
// Verifies Zod roundtrip per exported schema + branded-ULID type tagging.

import { describe, expect, it } from "vitest";

import {
  AssetClassSchema,
  AssetSchema,
  EntryRulesSchema,
  ExitRulesSchema,
  StrategyIdSchema,
  StrategySchema,
  MaPeriodSchema,
  UserIdSchema,
} from "@/lib/strategy-core/types";

// 26-char ULID-shaped string (Crockford base32; not validated for content
// at this layer — just length).
const VALID_ULID = "01H8XGJWBWBAQ4N7CHR3M9YT8K";

describe("StrategyIdSchema / UserIdSchema — branded ULIDs", () => {
  it("accepts a 26-char string and brands it as StrategyId", () => {
    const parsed = StrategyIdSchema.parse(VALID_ULID);
    expect(parsed).toBe(VALID_ULID);
    // The brand is a TS-level phantom; at runtime, it's just a string.
    expect(typeof parsed).toBe("string");
  });

  it("rejects strings shorter than 26 chars", () => {
    expect(() => StrategyIdSchema.parse("short")).toThrow();
  });

  it("UserId and StrategyId schemas are structurally identical (both 26-char) but type-distinct (brand tag)", () => {
    const uid = UserIdSchema.parse(VALID_ULID);
    const sid = StrategyIdSchema.parse(VALID_ULID);
    expect(uid).toBe(sid);
    // At the type level, sid is not assignable to UserId. We can't test
    // that at runtime; the existence of `.brand<"StrategyId">()` in the
    // schema is the contract.
  });
});

describe("AssetClassSchema + AssetSchema — open-ended asset classes", () => {
  it("AssetClass accepts arbitrary non-empty strings (per Engineer DRI Decision #2)", () => {
    expect(AssetClassSchema.parse("crypto-coinbase")).toBe("crypto-coinbase");
    expect(AssetClassSchema.parse("equity-mock")).toBe("equity-mock");
    expect(AssetClassSchema.parse("futures-deribit-future-class")).toBe(
      "futures-deribit-future-class",
    );
    expect(() => AssetClassSchema.parse("")).toThrow();
  });

  it("AssetSchema roundtrips cleanly", () => {
    const asset = { assetClass: "crypto-coinbase", identifier: "BTC-USD" };
    const parsed = AssetSchema.parse(asset);
    expect(parsed).toEqual(asset);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(asset);
  });
});

describe("MaPeriodSchema — strict-set validation (Engineer DRI Decision #3)", () => {
  it("accepts {5, 10, 20, 50}", () => {
    expect(MaPeriodSchema.parse(5)).toBe(5);
    expect(MaPeriodSchema.parse(10)).toBe(10);
    expect(MaPeriodSchema.parse(20)).toBe(20);
    expect(MaPeriodSchema.parse(50)).toBe(50);
  });

  it("rejects any other value (e.g., 7, 14, 100)", () => {
    expect(() => MaPeriodSchema.parse(7)).toThrow();
    expect(() => MaPeriodSchema.parse(14)).toThrow();
    expect(() => MaPeriodSchema.parse(100)).toThrow();
  });
});

describe("EntryRulesSchema + ExitRulesSchema", () => {
  it("EntryRulesSchema roundtrips a happy-path config", () => {
    const rules = { rsiThreshold: 30, maPeriod: 20 as const, maReinforcement: true };
    expect(EntryRulesSchema.parse(rules)).toEqual(rules);
  });

  it("ExitRulesSchema roundtrips a happy-path config", () => {
    const rules = { rsiThreshold: 70, minProfitPct: 1.5, sellFraction: 0.5 };
    expect(ExitRulesSchema.parse(rules)).toEqual(rules);
  });

  it("EntryRulesSchema rejects out-of-range RSI", () => {
    expect(() =>
      EntryRulesSchema.parse({ rsiThreshold: 150, maPeriod: 20 }),
    ).toThrow();
    expect(() =>
      EntryRulesSchema.parse({ rsiThreshold: -1, maPeriod: 20 }),
    ).toThrow();
  });
});

describe("StrategySchema — full row roundtrip", () => {
  it("roundtrips a fully-formed strategy row", () => {
    const strategy = {
      id: VALID_ULID,
      name: "Test Strategy",
      assetClass: "crypto-coinbase",
      selectedAssets: [
        { assetClass: "crypto-coinbase", identifier: "BTC-USD" },
        { assetClass: "crypto-coinbase", identifier: "ETH-USD" },
      ],
      entryRules: { rsiThreshold: 30, maPeriod: 20 as const, maReinforcement: true },
      exitRules: { rsiThreshold: 70, minProfitPct: 1.5, sellFraction: 0.5 },
      positionSizeUsd: 50,
      perSessionBuyCountCap: 10,
      perSessionDollarCap: 500,
      createdAt: new Date("2026-06-08T00:00:00Z"),
      createdByUserId: VALID_ULID,
      supersededByStrategyId: null,
    };
    const parsed = StrategySchema.parse(strategy);
    expect(parsed.name).toBe("Test Strategy");
    expect(parsed.selectedAssets).toHaveLength(2);
    expect(parsed.supersededByStrategyId).toBeNull();
  });

  it("rejects selectedAssets count > 5", () => {
    const selectedAssets = Array.from({ length: 6 }, (_, i) => ({
      assetClass: "crypto-coinbase",
      identifier: `PAIR-${i}-USD`,
    }));
    const strategy = {
      id: VALID_ULID,
      name: "Test",
      assetClass: "crypto-coinbase",
      selectedAssets,
      entryRules: { rsiThreshold: 30, maPeriod: 20 as const },
      exitRules: { rsiThreshold: 70, minProfitPct: 1, sellFraction: 0.5 },
      positionSizeUsd: 50,
      perSessionBuyCountCap: 10,
      perSessionDollarCap: 500,
      createdAt: new Date(),
      createdByUserId: VALID_ULID,
      supersededByStrategyId: null,
    };
    expect(() => StrategySchema.parse(strategy)).toThrow();
  });
});

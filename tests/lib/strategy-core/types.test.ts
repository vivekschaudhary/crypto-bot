// Unit tests for `lib/strategy-core/types.ts`.
//
// Field convention (round-2 BLOCKER fix):
//   * Top-level Strategy fields = snake_case (DB column names)
//   * Inner jsonb shapes (Asset, EntryRules, ExitRules) = camelCase

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

const VALID_ULID = "01H8XGJWBWBAQ4N7CHR3M9YT8K";

describe("StrategyIdSchema / UserIdSchema — branded ULIDs", () => {
  it("accepts a 26-char string and brands it as StrategyId", () => {
    const parsed = StrategyIdSchema.parse(VALID_ULID);
    expect(parsed).toBe(VALID_ULID);
    expect(typeof parsed).toBe("string");
  });

  it("rejects strings shorter than 26 chars", () => {
    expect(() => StrategyIdSchema.parse("short")).toThrow();
  });

  it("UserId and StrategyId schemas are structurally identical but type-distinct (brand tag)", () => {
    const uid = UserIdSchema.parse(VALID_ULID);
    const sid = StrategyIdSchema.parse(VALID_ULID);
    expect(uid).toBe(sid);
  });
});

describe("AssetClassSchema + AssetSchema — open-ended asset classes (camelCase inner shape)", () => {
  it("AssetClass accepts arbitrary non-empty strings (per Engineer DRI Decision #2)", () => {
    expect(AssetClassSchema.parse("crypto-coinbase")).toBe("crypto-coinbase");
    expect(AssetClassSchema.parse("equity-mock")).toBe("equity-mock");
    expect(() => AssetClassSchema.parse("")).toThrow();
  });

  it("AssetSchema roundtrips with camelCase {assetClass, identifier} (architecture Decision #4)", () => {
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

  it("rejects non-canonical values (7, 14, 100)", () => {
    expect(() => MaPeriodSchema.parse(7)).toThrow();
    expect(() => MaPeriodSchema.parse(14)).toThrow();
    expect(() => MaPeriodSchema.parse(100)).toThrow();
  });
});

describe("EntryRulesSchema + ExitRulesSchema — camelCase inner fields", () => {
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

describe("StrategySchema — full row roundtrip (top-level snake_case; inner camelCase)", () => {
  it("roundtrips a fully-formed strategy row", () => {
    const strategy = {
      id: VALID_ULID,
      name: "Test Strategy",
      asset_class: "crypto-coinbase",
      selected_assets: [
        { assetClass: "crypto-coinbase", identifier: "BTC-USD" },
        { assetClass: "crypto-coinbase", identifier: "ETH-USD" },
      ],
      entry_rules: { rsiThreshold: 30, maPeriod: 20 as const, maReinforcement: true },
      exit_rules: { rsiThreshold: 70, minProfitPct: 1.5, sellFraction: 0.5 },
      position_size_usd: 50,
      per_session_buy_count_cap: 10,
      per_session_dollar_cap: 500,
      created_at: new Date("2026-06-08T00:00:00Z"),
      created_by_user_id: VALID_ULID,
      superseded_by_strategy_id: null,
    };
    const parsed = StrategySchema.parse(strategy);
    expect(parsed.name).toBe("Test Strategy");
    expect(parsed.selected_assets).toHaveLength(2);
    expect(parsed.selected_assets[0]?.assetClass).toBe("crypto-coinbase");
    expect(parsed.superseded_by_strategy_id).toBeNull();
  });

  it("rejects selected_assets count > 5", () => {
    const selected_assets = Array.from({ length: 6 }, (_, i) => ({
      assetClass: "crypto-coinbase",
      identifier: `PAIR-${i}-USD`,
    }));
    const strategy = {
      id: VALID_ULID,
      name: "Test",
      asset_class: "crypto-coinbase",
      selected_assets,
      entry_rules: { rsiThreshold: 30, maPeriod: 20 as const },
      exit_rules: { rsiThreshold: 70, minProfitPct: 1, sellFraction: 0.5 },
      position_size_usd: 50,
      per_session_buy_count_cap: 10,
      per_session_dollar_cap: 500,
      created_at: new Date(),
      created_by_user_id: VALID_ULID,
      superseded_by_strategy_id: null,
    };
    expect(() => StrategySchema.parse(strategy)).toThrow();
  });
});

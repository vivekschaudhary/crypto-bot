// Unit tests for `lib/strategy-core/form-schema.ts`.
// Top-level snake_case + inner camelCase per round-2 BLOCKER fix.

import { describe, expect, it } from "vitest";

import { StrategyFormPayloadSchema } from "@/lib/strategy-core/form-schema";

const VALID_ULID = "01H8XGJWBWBAQ4N7CHR3M9YT8K";

describe("StrategyFormPayloadSchema — top-level snake_case + inner camelCase", () => {
  it("roundtrips first-time authoring payload (null supersedes)", () => {
    const payload = {
      name: "First strategy",
      asset_class: "crypto-coinbase",
      selected_assets: [
        { assetClass: "crypto-coinbase", identifier: "BTC-USD" },
      ],
      entry_rules: { rsiThreshold: 30, maPeriod: 20 as const },
      exit_rules: { rsiThreshold: 70, minProfitPct: 1.5, sellFraction: 0.5 },
      position_size_usd: 50,
      per_session_buy_count_cap: 10,
      per_session_dollar_cap: 500,
      supersedes_strategy_id: null,
    };
    const parsed = StrategyFormPayloadSchema.parse(payload);
    expect(parsed.name).toBe("First strategy");
    expect(parsed.supersedes_strategy_id).toBeNull();
    expect(parsed.selected_assets[0]?.assetClass).toBe("crypto-coinbase");
  });

  it("roundtrips revision payload (supersedes_strategy_id set)", () => {
    const payload = {
      name: "Strategy v2",
      asset_class: "crypto-coinbase",
      selected_assets: [
        { assetClass: "crypto-coinbase", identifier: "BTC-USD" },
        { assetClass: "crypto-coinbase", identifier: "ETH-USD" },
      ],
      entry_rules: {
        rsiThreshold: 25,
        maPeriod: 10 as const,
        maReinforcement: true,
      },
      exit_rules: { rsiThreshold: 65, minProfitPct: 2, sellFraction: 0.75 },
      position_size_usd: 100,
      per_session_buy_count_cap: 5,
      per_session_dollar_cap: 1000,
      supersedes_strategy_id: VALID_ULID,
    };
    const parsed = StrategyFormPayloadSchema.parse(payload);
    expect(parsed.supersedes_strategy_id).toBe(VALID_ULID);
    expect(parsed.selected_assets).toHaveLength(2);
    expect(parsed.entry_rules.maReinforcement).toBe(true);
  });
});

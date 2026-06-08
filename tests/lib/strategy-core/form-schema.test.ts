// Unit tests for `lib/strategy-core/form-schema.ts`.
// Snake_case shape per round-1 BLOCKER 1 fix.

import { describe, expect, it } from "vitest";

import { StrategyFormPayloadSchema } from "@/lib/strategy-core/form-schema";

const VALID_ULID = "01H8XGJWBWBAQ4N7CHR3M9YT8K";

describe("StrategyFormPayloadSchema — Zod for form-submitted payload (snake_case)", () => {
  it("roundtrips a happy-path form payload (first-time authoring; null supersedes)", () => {
    const payload = {
      name: "First strategy",
      asset_class: "crypto-coinbase",
      selected_assets: [
        { asset_class: "crypto-coinbase", identifier: "BTC-USD" },
      ],
      entry_rules: { rsi_threshold: 30, ma_period: 20 as const },
      exit_rules: { rsi_threshold: 70, min_profit_pct: 1.5, sell_fraction: 0.5 },
      position_size_usd: 50,
      per_session_buy_count_cap: 10,
      per_session_dollar_cap: 500,
      supersedes_strategy_id: null,
    };
    const parsed = StrategyFormPayloadSchema.parse(payload);
    expect(parsed.name).toBe("First strategy");
    expect(parsed.supersedes_strategy_id).toBeNull();
  });

  it("roundtrips a revision form payload (supersedes_strategy_id set)", () => {
    const payload = {
      name: "Strategy v2",
      asset_class: "crypto-coinbase",
      selected_assets: [
        { asset_class: "crypto-coinbase", identifier: "BTC-USD" },
        { asset_class: "crypto-coinbase", identifier: "ETH-USD" },
      ],
      entry_rules: { rsi_threshold: 25, ma_period: 10 as const, ma_reinforcement: true },
      exit_rules: { rsi_threshold: 65, min_profit_pct: 2, sell_fraction: 0.75 },
      position_size_usd: 100,
      per_session_buy_count_cap: 5,
      per_session_dollar_cap: 1000,
      supersedes_strategy_id: VALID_ULID,
    };
    const parsed = StrategyFormPayloadSchema.parse(payload);
    expect(parsed.supersedes_strategy_id).toBe(VALID_ULID);
    expect(parsed.selected_assets).toHaveLength(2);
  });
});

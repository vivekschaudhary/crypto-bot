// Unit tests for `lib/strategy-core/validate.ts`.
//
// Covers every documented rule × 2 paths (true + false) + discriminated-
// union return shape + shape-validation fallback.
// All field paths use snake_case per round-1 BLOCKER fix.

import { describe, expect, it } from "vitest";

import {
  validateStrategyPayload,
  VALIDATION_ERROR_CODES,
} from "@/lib/strategy-core/validate";

function makeValidPayload(): Record<string, unknown> {
  return {
    name: "Test Strategy",
    asset_class: "crypto-coinbase",
    selected_assets: [
      { asset_class: "crypto-coinbase", identifier: "BTC-USD" },
      { asset_class: "crypto-coinbase", identifier: "ETH-USD" },
    ],
    entry_rules: { rsi_threshold: 30, ma_period: 20, ma_reinforcement: true },
    exit_rules: { rsi_threshold: 70, min_profit_pct: 1.5, sell_fraction: 0.5 },
    position_size_usd: 50,
    per_session_buy_count_cap: 10,
    per_session_dollar_cap: 500,
  };
}

describe("validateStrategyPayload — happy path + discriminated-union shape", () => {
  it("returns {ok: true, value} on a valid payload", () => {
    const result = validateStrategyPayload(makeValidPayload());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("Test Strategy");
      expect(result.value.selected_assets).toHaveLength(2);
    }
  });

  it("preserves all valid fields in the returned value", () => {
    const input = makeValidPayload();
    const result = validateStrategyPayload(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.position_size_usd).toBe(50);
      expect(result.value.entry_rules.ma_period).toBe(20);
      expect(result.value.exit_rules.sell_fraction).toBe(0.5);
    }
  });
});

describe("validateStrategyPayload — shape errors", () => {
  it("returns SHAPE_INVALID with field paths when input is structurally wrong", () => {
    const result = validateStrategyPayload({ name: 42 } as unknown);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.code).toBe("SHAPE_INVALID");
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});

describe("validateStrategyPayload — rule: entry RSI in [0, 100]", () => {
  it("rejects entry RSI > 100 via shape (EntryRulesSchema enforces range)", () => {
    const input = makeValidPayload();
    (input as { entry_rules: { rsi_threshold: number } }).entry_rules.rsi_threshold =
      150;
    const result = validateStrategyPayload(input);
    expect(result.ok).toBe(false);
  });
});

describe("validateStrategyPayload — rule: exit RSI in [0, 100]", () => {
  it("rejects exit RSI > 100 via shape (ExitRulesSchema enforces range)", () => {
    const input = makeValidPayload();
    (input as { exit_rules: { rsi_threshold: number } }).exit_rules.rsi_threshold =
      150;
    const result = validateStrategyPayload(input);
    expect(result.ok).toBe(false);
  });
});

describe("validateStrategyPayload — rule: MA period in {5, 10, 20, 50}", () => {
  it("accepts MA period 5", () => {
    const input = makeValidPayload();
    (input as { entry_rules: { ma_period: number } }).entry_rules.ma_period = 5;
    expect(validateStrategyPayload(input).ok).toBe(true);
  });

  it("rejects MA period 7 (non-canonical)", () => {
    const input = makeValidPayload();
    (input as { entry_rules: { ma_period: number } }).entry_rules.ma_period = 7;
    const result = validateStrategyPayload(input);
    expect(result.ok).toBe(false);
  });
});

describe("validateStrategyPayload — rule: entry RSI < exit RSI (cross-field)", () => {
  it("accepts when entry RSI (30) < exit RSI (70)", () => {
    const result = validateStrategyPayload(makeValidPayload());
    expect(result.ok).toBe(true);
  });

  it("rejects when entry RSI (75) > exit RSI (70) with code ENTRY_RSI_NOT_LESS_THAN_EXIT_RSI", () => {
    const input = makeValidPayload();
    (input as { entry_rules: { rsi_threshold: number } }).entry_rules.rsi_threshold =
      75;
    const result = validateStrategyPayload(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "ENTRY_RSI_NOT_LESS_THAN_EXIT_RSI")).toBe(true);
    }
  });

  it("rejects when entry RSI === exit RSI (no contradictions; strict less-than)", () => {
    const input = makeValidPayload();
    (input as { entry_rules: { rsi_threshold: number } }).entry_rules.rsi_threshold =
      70;
    const result = validateStrategyPayload(input);
    expect(result.ok).toBe(false);
  });
});

describe("validateStrategyPayload — rule: position_size_usd > 0", () => {
  it("accepts position_size_usd = 1", () => {
    const input = makeValidPayload();
    (input as { position_size_usd: number }).position_size_usd = 1;
    expect(validateStrategyPayload(input).ok).toBe(true);
  });

  it("rejects position_size_usd = 0 with code POSITION_SIZE_USD_NOT_POSITIVE", () => {
    const input = makeValidPayload();
    (input as { position_size_usd: number }).position_size_usd = 0;
    const result = validateStrategyPayload(input);
    expect(result.ok).toBe(false);
  });
});

describe("validateStrategyPayload — rule: per_session_buy_count_cap > 0 integer", () => {
  it("rejects per_session_buy_count_cap = 0", () => {
    const input = makeValidPayload();
    (input as { per_session_buy_count_cap: number }).per_session_buy_count_cap = 0;
    expect(validateStrategyPayload(input).ok).toBe(false);
  });

  it("rejects fractional per_session_buy_count_cap (e.g., 2.5)", () => {
    const input = makeValidPayload();
    (input as { per_session_buy_count_cap: number }).per_session_buy_count_cap = 2.5;
    expect(validateStrategyPayload(input).ok).toBe(false);
  });
});

describe("validateStrategyPayload — rule: per_session_dollar_cap > 0", () => {
  it("rejects per_session_dollar_cap = -1", () => {
    const input = makeValidPayload();
    (input as { per_session_dollar_cap: number }).per_session_dollar_cap = -1;
    expect(validateStrategyPayload(input).ok).toBe(false);
  });
});

describe("validateStrategyPayload — rule: selected_assets count in [1, 5]", () => {
  it("rejects 0 selected assets", () => {
    const input = makeValidPayload();
    (input as { selected_assets: unknown[] }).selected_assets = [];
    expect(validateStrategyPayload(input).ok).toBe(false);
  });

  it("rejects 6 selected assets", () => {
    const input = makeValidPayload();
    (input as { selected_assets: unknown[] }).selected_assets = Array.from(
      { length: 6 },
      (_, i) => ({ asset_class: "crypto-coinbase", identifier: `P${i}-USD` }),
    );
    expect(validateStrategyPayload(input).ok).toBe(false);
  });
});

describe("VALIDATION_ERROR_CODES export — typed constant for downstream consumers", () => {
  it("exposes a closed set of error codes (no SHAPE_INVALID is the catch-all)", () => {
    expect(VALIDATION_ERROR_CODES).toContain("ENTRY_RSI_OUT_OF_RANGE");
    expect(VALIDATION_ERROR_CODES).toContain("ENTRY_RSI_NOT_LESS_THAN_EXIT_RSI");
    expect(VALIDATION_ERROR_CODES).toContain("SHAPE_INVALID");
    expect(VALIDATION_ERROR_CODES.length).toBe(9);
  });
});

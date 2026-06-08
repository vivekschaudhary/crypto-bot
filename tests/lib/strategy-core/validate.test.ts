// Unit tests for `lib/strategy-core/validate.ts`.
//
// Round-2 BLOCKER fix: every rule false-path must now fire its OWN named
// error code (not SHAPE_INVALID). validate.ts uses a permissive input
// schema so range/MA-set violations get attributed correctly.
//
// Convention: top-level snake_case + inner jsonb camelCase.

import { describe, expect, it } from "vitest";

import {
  validateStrategyPayload,
  VALIDATION_ERROR_CODES,
  type ValidationErrorCode,
} from "@/lib/strategy-core/validate";

function makeValidPayload(): Record<string, unknown> {
  return {
    name: "Test Strategy",
    asset_class: "crypto-coinbase",
    selected_assets: [
      { assetClass: "crypto-coinbase", identifier: "BTC-USD" },
      { assetClass: "crypto-coinbase", identifier: "ETH-USD" },
    ],
    entry_rules: { rsiThreshold: 30, maPeriod: 20, maReinforcement: true },
    exit_rules: { rsiThreshold: 70, minProfitPct: 1.5, sellFraction: 0.5 },
    position_size_usd: 50,
    per_session_buy_count_cap: 10,
    per_session_dollar_cap: 500,
  };
}

function expectCode(
  result: ReturnType<typeof validateStrategyPayload>,
  code: ValidationErrorCode,
): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.errors.some((e) => e.code === code)).toBe(true);
  }
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
    const result = validateStrategyPayload(makeValidPayload());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.position_size_usd).toBe(50);
      expect(result.value.entry_rules.maPeriod).toBe(20);
      expect(result.value.exit_rules.sellFraction).toBe(0.5);
    }
  });
});

describe("validateStrategyPayload — SHAPE_INVALID for truly malformed input", () => {
  it("returns SHAPE_INVALID when name is wrong type", () => {
    const result = validateStrategyPayload({ name: 42 } as unknown);
    expectCode(result, "SHAPE_INVALID");
  });

  it("returns SHAPE_INVALID when selected_assets is not an array", () => {
    const input = makeValidPayload();
    (input as { selected_assets: unknown }).selected_assets = "not an array";
    const result = validateStrategyPayload(input);
    expectCode(result, "SHAPE_INVALID");
  });
});

describe("validateStrategyPayload — rule: entry RSI in [0, 100] fires ENTRY_RSI_OUT_OF_RANGE", () => {
  it("fires ENTRY_RSI_OUT_OF_RANGE for RSI > 100 (NOT SHAPE_INVALID)", () => {
    const input = makeValidPayload();
    (input as { entry_rules: { rsiThreshold: number } }).entry_rules.rsiThreshold =
      150;
    const result = validateStrategyPayload(input);
    expectCode(result, "ENTRY_RSI_OUT_OF_RANGE");
  });

  it("fires ENTRY_RSI_OUT_OF_RANGE for RSI < 0", () => {
    const input = makeValidPayload();
    (input as { entry_rules: { rsiThreshold: number } }).entry_rules.rsiThreshold =
      -10;
    const result = validateStrategyPayload(input);
    expectCode(result, "ENTRY_RSI_OUT_OF_RANGE");
  });
});

describe("validateStrategyPayload — rule: exit RSI in [0, 100] fires EXIT_RSI_OUT_OF_RANGE", () => {
  it("fires EXIT_RSI_OUT_OF_RANGE for RSI > 100", () => {
    const input = makeValidPayload();
    (input as { exit_rules: { rsiThreshold: number } }).exit_rules.rsiThreshold =
      150;
    const result = validateStrategyPayload(input);
    expectCode(result, "EXIT_RSI_OUT_OF_RANGE");
  });
});

describe("validateStrategyPayload — rule: MA period in {5, 10, 20, 50} fires MA_PERIOD_INVALID", () => {
  it("accepts MA period 5", () => {
    const input = makeValidPayload();
    (input as { entry_rules: { maPeriod: number } }).entry_rules.maPeriod = 5;
    expect(validateStrategyPayload(input).ok).toBe(true);
  });

  it("fires MA_PERIOD_INVALID for non-canonical 7 (NOT SHAPE_INVALID)", () => {
    const input = makeValidPayload();
    (input as { entry_rules: { maPeriod: number } }).entry_rules.maPeriod = 7;
    const result = validateStrategyPayload(input);
    expectCode(result, "MA_PERIOD_INVALID");
  });

  it("fires MA_PERIOD_INVALID for 100", () => {
    const input = makeValidPayload();
    (input as { entry_rules: { maPeriod: number } }).entry_rules.maPeriod = 100;
    const result = validateStrategyPayload(input);
    expectCode(result, "MA_PERIOD_INVALID");
  });
});

describe("validateStrategyPayload — rule: entry RSI < exit RSI fires ENTRY_RSI_NOT_LESS_THAN_EXIT_RSI", () => {
  it("accepts when entry RSI (30) < exit RSI (70)", () => {
    expect(validateStrategyPayload(makeValidPayload()).ok).toBe(true);
  });

  it("fires ENTRY_RSI_NOT_LESS_THAN_EXIT_RSI when entry RSI (75) > exit RSI (70)", () => {
    const input = makeValidPayload();
    (input as { entry_rules: { rsiThreshold: number } }).entry_rules.rsiThreshold =
      75;
    const result = validateStrategyPayload(input);
    expectCode(result, "ENTRY_RSI_NOT_LESS_THAN_EXIT_RSI");
  });

  it("fires ENTRY_RSI_NOT_LESS_THAN_EXIT_RSI when entry RSI === exit RSI", () => {
    const input = makeValidPayload();
    (input as { entry_rules: { rsiThreshold: number } }).entry_rules.rsiThreshold =
      70;
    const result = validateStrategyPayload(input);
    expectCode(result, "ENTRY_RSI_NOT_LESS_THAN_EXIT_RSI");
  });
});

describe("validateStrategyPayload — rule: position_size_usd > 0 fires POSITION_SIZE_USD_NOT_POSITIVE", () => {
  it("accepts position_size_usd = 1", () => {
    const input = makeValidPayload();
    (input as { position_size_usd: number }).position_size_usd = 1;
    expect(validateStrategyPayload(input).ok).toBe(true);
  });

  it("fires POSITION_SIZE_USD_NOT_POSITIVE for 0", () => {
    const input = makeValidPayload();
    (input as { position_size_usd: number }).position_size_usd = 0;
    const result = validateStrategyPayload(input);
    expectCode(result, "POSITION_SIZE_USD_NOT_POSITIVE");
  });

  it("fires POSITION_SIZE_USD_NOT_POSITIVE for negative", () => {
    const input = makeValidPayload();
    (input as { position_size_usd: number }).position_size_usd = -10;
    const result = validateStrategyPayload(input);
    expectCode(result, "POSITION_SIZE_USD_NOT_POSITIVE");
  });
});

describe("validateStrategyPayload — rule: per_session_buy_count_cap fires PER_SESSION_BUY_COUNT_CAP_NOT_POSITIVE", () => {
  it("fires PER_SESSION_BUY_COUNT_CAP_NOT_POSITIVE for 0", () => {
    const input = makeValidPayload();
    (input as { per_session_buy_count_cap: number }).per_session_buy_count_cap = 0;
    const result = validateStrategyPayload(input);
    expectCode(result, "PER_SESSION_BUY_COUNT_CAP_NOT_POSITIVE");
  });

  it("fires PER_SESSION_BUY_COUNT_CAP_NOT_POSITIVE for fractional", () => {
    const input = makeValidPayload();
    (input as { per_session_buy_count_cap: number }).per_session_buy_count_cap =
      2.5;
    const result = validateStrategyPayload(input);
    expectCode(result, "PER_SESSION_BUY_COUNT_CAP_NOT_POSITIVE");
  });
});

describe("validateStrategyPayload — rule: per_session_dollar_cap > 0 fires PER_SESSION_DOLLAR_CAP_NOT_POSITIVE", () => {
  it("fires PER_SESSION_DOLLAR_CAP_NOT_POSITIVE for negative", () => {
    const input = makeValidPayload();
    (input as { per_session_dollar_cap: number }).per_session_dollar_cap = -1;
    const result = validateStrategyPayload(input);
    expectCode(result, "PER_SESSION_DOLLAR_CAP_NOT_POSITIVE");
  });
});

describe("validateStrategyPayload — rule: selected_assets count in [1, 5] fires SELECTED_ASSETS_COUNT_OUT_OF_RANGE", () => {
  it("fires SELECTED_ASSETS_COUNT_OUT_OF_RANGE for 0 assets", () => {
    const input = makeValidPayload();
    (input as { selected_assets: unknown[] }).selected_assets = [];
    const result = validateStrategyPayload(input);
    expectCode(result, "SELECTED_ASSETS_COUNT_OUT_OF_RANGE");
  });

  it("fires SELECTED_ASSETS_COUNT_OUT_OF_RANGE for 6 assets", () => {
    const input = makeValidPayload();
    (input as { selected_assets: unknown[] }).selected_assets = Array.from(
      { length: 6 },
      (_, i) => ({ assetClass: "crypto-coinbase", identifier: `P${i}-USD` }),
    );
    const result = validateStrategyPayload(input);
    expectCode(result, "SELECTED_ASSETS_COUNT_OUT_OF_RANGE");
  });
});

describe("validateStrategyPayload — collects multiple errors at once (no short-circuit)", () => {
  it("emits multiple named codes when several rules violated", () => {
    const input = makeValidPayload();
    (input as { entry_rules: { rsiThreshold: number } }).entry_rules.rsiThreshold =
      150; // ENTRY_RSI_OUT_OF_RANGE
    (input as { position_size_usd: number }).position_size_usd = -1; // POSITION_SIZE_USD_NOT_POSITIVE
    (input as { entry_rules: { maPeriod: number } }).entry_rules.maPeriod = 7; // MA_PERIOD_INVALID
    const result = validateStrategyPayload(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain("ENTRY_RSI_OUT_OF_RANGE");
      expect(codes).toContain("POSITION_SIZE_USD_NOT_POSITIVE");
      expect(codes).toContain("MA_PERIOD_INVALID");
    }
  });
});

describe("VALIDATION_ERROR_CODES export — typed constant for downstream consumers", () => {
  it("exposes the expected closed set of error codes", () => {
    expect(VALIDATION_ERROR_CODES).toContain("ENTRY_RSI_OUT_OF_RANGE");
    expect(VALIDATION_ERROR_CODES).toContain("ENTRY_RSI_NOT_LESS_THAN_EXIT_RSI");
    expect(VALIDATION_ERROR_CODES).toContain("SHAPE_INVALID");
    expect(VALIDATION_ERROR_CODES.length).toBe(9);
  });
});

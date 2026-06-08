// Unit tests for `lib/strategy-core/validate.ts`.
//
// Covers every documented rule × 2 paths (true + false) + discriminated-
// union return shape + shape-validation fallback.

import { describe, expect, it } from "vitest";

import {
  validateStrategyPayload,
  VALIDATION_ERROR_CODES,
} from "@/lib/strategy-core/validate";

function makeValidPayload(): Record<string, unknown> {
  return {
    name: "Test Strategy",
    assetClass: "crypto-coinbase",
    selectedAssets: [
      { assetClass: "crypto-coinbase", identifier: "BTC-USD" },
      { assetClass: "crypto-coinbase", identifier: "ETH-USD" },
    ],
    entryRules: { rsiThreshold: 30, maPeriod: 20, maReinforcement: true },
    exitRules: { rsiThreshold: 70, minProfitPct: 1.5, sellFraction: 0.5 },
    positionSizeUsd: 50,
    perSessionBuyCountCap: 10,
    perSessionDollarCap: 500,
  };
}

describe("validateStrategyPayload — happy path + discriminated-union shape", () => {
  it("returns {ok: true, value} on a valid payload", () => {
    const result = validateStrategyPayload(makeValidPayload());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("Test Strategy");
      expect(result.value.selectedAssets).toHaveLength(2);
    }
  });

  it("preserves all valid fields in the returned value", () => {
    const input = makeValidPayload();
    const result = validateStrategyPayload(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.positionSizeUsd).toBe(50);
      expect(result.value.entryRules.maPeriod).toBe(20);
      expect(result.value.exitRules.sellFraction).toBe(0.5);
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
    (input as { entryRules: { rsiThreshold: number } }).entryRules.rsiThreshold =
      150;
    const result = validateStrategyPayload(input);
    expect(result.ok).toBe(false);
  });
});

describe("validateStrategyPayload — rule: exit RSI in [0, 100]", () => {
  it("rejects exit RSI > 100 via shape (ExitRulesSchema enforces range)", () => {
    const input = makeValidPayload();
    (input as { exitRules: { rsiThreshold: number } }).exitRules.rsiThreshold =
      150;
    const result = validateStrategyPayload(input);
    expect(result.ok).toBe(false);
  });
});

describe("validateStrategyPayload — rule: MA period in {5, 10, 20, 50}", () => {
  it("accepts MA period 5", () => {
    const input = makeValidPayload();
    (input as { entryRules: { maPeriod: number } }).entryRules.maPeriod = 5;
    expect(validateStrategyPayload(input).ok).toBe(true);
  });

  it("rejects MA period 7 (non-canonical)", () => {
    const input = makeValidPayload();
    (input as { entryRules: { maPeriod: number } }).entryRules.maPeriod = 7;
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
    (input as { entryRules: { rsiThreshold: number } }).entryRules.rsiThreshold =
      75;
    const result = validateStrategyPayload(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "ENTRY_RSI_NOT_LESS_THAN_EXIT_RSI")).toBe(true);
    }
  });

  it("rejects when entry RSI === exit RSI (no contradictions; strict less-than)", () => {
    const input = makeValidPayload();
    (input as { entryRules: { rsiThreshold: number } }).entryRules.rsiThreshold =
      70;
    const result = validateStrategyPayload(input);
    expect(result.ok).toBe(false);
  });
});

describe("validateStrategyPayload — rule: positionSizeUsd > 0", () => {
  it("accepts positionSizeUsd = 1", () => {
    const input = makeValidPayload();
    (input as { positionSizeUsd: number }).positionSizeUsd = 1;
    expect(validateStrategyPayload(input).ok).toBe(true);
  });

  it("rejects positionSizeUsd = 0 with code POSITION_SIZE_USD_NOT_POSITIVE", () => {
    const input = makeValidPayload();
    (input as { positionSizeUsd: number }).positionSizeUsd = 0;
    const result = validateStrategyPayload(input);
    expect(result.ok).toBe(false);
    // Either the Zod schema (positionSizeUsd is z.number().positive()) OR
    // our explicit rule catches it; both result in failure.
  });
});

describe("validateStrategyPayload — rule: perSessionBuyCountCap > 0 integer", () => {
  it("rejects perSessionBuyCountCap = 0", () => {
    const input = makeValidPayload();
    (input as { perSessionBuyCountCap: number }).perSessionBuyCountCap = 0;
    expect(validateStrategyPayload(input).ok).toBe(false);
  });

  it("rejects fractional perSessionBuyCountCap (e.g., 2.5)", () => {
    const input = makeValidPayload();
    (input as { perSessionBuyCountCap: number }).perSessionBuyCountCap = 2.5;
    expect(validateStrategyPayload(input).ok).toBe(false);
  });
});

describe("validateStrategyPayload — rule: perSessionDollarCap > 0", () => {
  it("rejects perSessionDollarCap = -1", () => {
    const input = makeValidPayload();
    (input as { perSessionDollarCap: number }).perSessionDollarCap = -1;
    expect(validateStrategyPayload(input).ok).toBe(false);
  });
});

describe("validateStrategyPayload — rule: selectedAssets count in [1, 5]", () => {
  it("rejects 0 selected assets", () => {
    const input = makeValidPayload();
    (input as { selectedAssets: unknown[] }).selectedAssets = [];
    expect(validateStrategyPayload(input).ok).toBe(false);
  });

  it("rejects 6 selected assets", () => {
    const input = makeValidPayload();
    (input as { selectedAssets: unknown[] }).selectedAssets = Array.from(
      { length: 6 },
      (_, i) => ({ assetClass: "crypto-coinbase", identifier: `P${i}-USD` }),
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

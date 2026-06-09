// CB-3.3 unit tests for lib/strategies/defaults.ts.
//
// Per AC 14 (Copy verbatim) + AC 5 (inline-error code → field path mapping):
// every VALIDATION_ERROR_CODES value maps to BOTH a field path AND a verbatim
// copy.md string. This test enforces the mapping exhaustively so a future
// new code added to validate.ts without a corresponding defaults.ts mapping
// fails loud.

import { describe, expect, it } from "vitest";

import {
  DEFAULT_ENTRY_RULES,
  DEFAULT_EXIT_RULES,
  DEFAULT_PER_SESSION_BUY_COUNT_CAP,
  DEFAULT_PER_SESSION_DOLLAR_CAP,
  DEFAULT_POSITION_SIZE_USD,
  MA_PERIOD_CHOICES,
  buildEmptyStateDefaults,
  errorCodeToCopy,
  errorCodeToFieldPath,
  topErrorBannerCopy,
  formatAsOfStamp,
  topFiveAsOfText,
  topFiveFallbackCopy,
} from "@/lib/strategies/defaults";
import { VALIDATION_ERROR_CODES } from "@/lib/strategy-core/validate";
import { StrategyFormPayloadSchema } from "@/lib/strategy-core/form-schema";

describe("CB-3.3 — DEFAULT values (per design.md empty-state table)", () => {
  it("DEFAULT_ENTRY_RULES matches the design.md table", () => {
    expect(DEFAULT_ENTRY_RULES.rsiThreshold).toBe(30);
    expect(DEFAULT_ENTRY_RULES.maPeriod).toBe(20);
    expect(DEFAULT_ENTRY_RULES.maReinforcement).toBe(false);
  });

  it("DEFAULT_EXIT_RULES matches the design.md table", () => {
    expect(DEFAULT_EXIT_RULES.rsiThreshold).toBe(70);
    expect(DEFAULT_EXIT_RULES.minProfitPct).toBe(1.5);
    expect(DEFAULT_EXIT_RULES.sellFraction).toBe(0.5);
  });

  it("DEFAULT cap and size constants match the design.md table", () => {
    expect(DEFAULT_POSITION_SIZE_USD).toBe(50);
    expect(DEFAULT_PER_SESSION_BUY_COUNT_CAP).toBe(10);
    expect(DEFAULT_PER_SESSION_DOLLAR_CAP).toBe(500);
  });

  it("MA_PERIOD_CHOICES matches the MaPeriodSchema strict set", () => {
    expect([...MA_PERIOD_CHOICES]).toEqual([5, 10, 20, 50]);
  });
});

describe("buildEmptyStateDefaults — first-time authoring payload", () => {
  it("builds a payload that passes StrategyFormPayloadSchema for any valid asset selection", () => {
    const payload = buildEmptyStateDefaults({
      selectedAssets: [
        { assetClass: "crypto-coinbase", identifier: "BTC-USD" },
        { assetClass: "crypto-coinbase", identifier: "ETH-USD" },
      ],
      assetClass: "crypto-coinbase",
    });
    // Form payload schema requires non-empty name; default state ships
    // empty name. Operator must fill before the schema accepts. Verify
    // shape validates by overriding name only.
    const result = StrategyFormPayloadSchema.safeParse({
      ...payload,
      name: "Test",
    });
    expect(result.success).toBe(true);
  });

  it("uses the provided selected_assets verbatim (no filtering / reordering)", () => {
    const assets = [
      { assetClass: "crypto-coinbase", identifier: "SOL-USD" },
      { assetClass: "crypto-coinbase", identifier: "DOGE-USD" },
    ];
    const payload = buildEmptyStateDefaults({
      selectedAssets: assets,
      assetClass: "crypto-coinbase",
    });
    expect(payload.selected_assets).toEqual(assets);
  });

  it("sets supersedes_strategy_id to null (first-time authoring)", () => {
    const payload = buildEmptyStateDefaults({
      selectedAssets: [
        { assetClass: "crypto-coinbase", identifier: "BTC-USD" },
      ],
      assetClass: "crypto-coinbase",
    });
    expect(payload.supersedes_strategy_id).toBeNull();
  });
});

describe("errorCodeToFieldPath — every VALIDATION_ERROR_CODES value maps to a path", () => {
  it.each(VALIDATION_ERROR_CODES.map((c) => [c]))(
    "%s maps to a non-empty field path",
    (code) => {
      const path = errorCodeToFieldPath(code);
      expect(typeof path).toBe("string");
      expect(path.length).toBeGreaterThan(0);
    },
  );

  it("ENTRY_RSI_NOT_LESS_THAN_EXIT_RSI attaches to the entry field by UX convention (AC 5)", () => {
    expect(errorCodeToFieldPath("ENTRY_RSI_NOT_LESS_THAN_EXIT_RSI")).toBe(
      "entry_rules.rsiThreshold",
    );
  });

  it("SHAPE_INVALID routes to the top-of-form banner (sentinel `_form`)", () => {
    expect(errorCodeToFieldPath("SHAPE_INVALID")).toBe("_form");
  });

  it("position_size_usd error maps to the position_size_usd field path", () => {
    expect(errorCodeToFieldPath("POSITION_SIZE_USD_NOT_POSITIVE")).toBe(
      "position_size_usd",
    );
  });

  it("SELECTED_ASSETS_COUNT_OUT_OF_RANGE maps to selected_assets path", () => {
    expect(errorCodeToFieldPath("SELECTED_ASSETS_COUNT_OUT_OF_RANGE")).toBe(
      "selected_assets",
    );
  });
});

describe("errorCodeToCopy — every VALIDATION_ERROR_CODES value has a verbatim copy.md string", () => {
  it.each(VALIDATION_ERROR_CODES.map((c) => [c]))(
    "%s maps to a non-empty copy string",
    (code) => {
      const copy = errorCodeToCopy(code);
      expect(typeof copy).toBe("string");
      expect(copy.length).toBeGreaterThan(0);
    },
  );

  it("ENTRY_RSI_NOT_LESS_THAN_EXIT_RSI copy matches copy.md verbatim", () => {
    expect(errorCodeToCopy("ENTRY_RSI_NOT_LESS_THAN_EXIT_RSI")).toBe(
      "Entry RSI must be less than exit RSI — otherwise the bot would buy and sell at the same level.",
    );
  });

  it("SELECTED_ASSETS_COUNT_OUT_OF_RANGE copy matches copy.md verbatim", () => {
    expect(errorCodeToCopy("SELECTED_ASSETS_COUNT_OUT_OF_RANGE")).toBe(
      // PR #53: defaults.ts default is now asset-class-agnostic ("assets");
      // the crypto-coinbase form composes the verbatim "Pick between 1
      // and 5 cryptos." copy.md string via labels.errorOverrides in
      // page.tsx — see tests/app/dashboard/strategy/form-client.test.ts
      // for the override-path coverage.
      "Pick between 1 and 5 assets.",
    );
  });

  it("MA_PERIOD_INVALID copy matches copy.md verbatim", () => {
    expect(errorCodeToCopy("MA_PERIOD_INVALID")).toBe(
      "Must be 5, 10, 20, or 50.",
    );
  });
});

describe("topErrorBannerCopy — verbatim copy.md strings per discriminated type", () => {
  it("validation banner", () => {
    expect(topErrorBannerCopy("validation")).toBe(
      "Some fields need attention. See errors above.",
    );
  });

  it("network banner", () => {
    expect(topErrorBannerCopy("network")).toBe(
      "Save failed. Check your connection.",
    );
  });

  it("server banner", () => {
    expect(topErrorBannerCopy("server")).toBe(
      "Save failed on the server. Try again.",
    );
  });

  it("unknown banner", () => {
    expect(topErrorBannerCopy("unknown")).toBe(
      "Unexpected error. Try again or reload.",
    );
  });
});

describe("formatAsOfStamp — pure date formatter (asset-class-agnostic; PR #53)", () => {
  it("formats YYYY-MM-DD HH:mm in UTC", () => {
    const date = new Date("2026-06-08T12:34:56.000Z");
    expect(formatAsOfStamp(date)).toBe("2026-06-08 12:34");
  });

  it("zero-pads month / day / hour / minute", () => {
    const date = new Date("2026-01-05T03:09:00.000Z");
    expect(formatAsOfStamp(date)).toBe("2026-01-05 03:09");
  });
});

describe("topFiveAsOfText — crypto-coinbase selector header (composed via formatAsOfStamp)", () => {
  it("formats the crypto-coinbase verbatim copy.md string with the as-of stamp", () => {
    const date = new Date("2026-06-08T12:34:56.000Z");
    expect(topFiveAsOfText(date)).toBe(
      "Selected from top-5 by dollar volume (as of 2026-06-08 12:34)",
    );
  });

  it("zero-pads month / day / hour / minute via formatAsOfStamp delegation", () => {
    const date = new Date("2026-01-05T03:09:00.000Z");
    expect(topFiveAsOfText(date)).toBe(
      "Selected from top-5 by dollar volume (as of 2026-01-05 03:09)",
    );
  });
});

describe("topFiveFallbackCopy — verbatim copy.md strings", () => {
  it("timeout copy", () => {
    expect(topFiveFallbackCopy("timeout")).toBe(
      "Couldn't load top-5 — please try again later.",
    );
  });

  it("error copy", () => {
    expect(topFiveFallbackCopy("error")).toBe(
      "Couldn't load top-5 from Coinbase. Try reloading.",
    );
  });
});

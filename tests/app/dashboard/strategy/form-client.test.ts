// CB-3.3 — unit tests for pure helpers exported from strategy-form-client.tsx.
//
// No @testing-library/react in deps per Engineer DRI Decision #9 — full UI
// rendering is verified by the Playwright e2e Codex writes in Phase 3.
// Here we test the exported pure logic (isDirty + the PR #52 numeric-input
// helpers) which is the non-render-dependent part of the form.

import { describe, expect, it, vi } from "vitest";

import {
  allNumericFieldsFilled,
  isDirty,
  makeNumericChangeHandler,
  numericDisplay,
} from "@/app/dashboard/strategy/strategy-form-client";
import type {
  Asset,
  EntryRules,
  ExitRules,
} from "@/lib/strategy-core/types";

interface TestPayload {
  name: string;
  asset_class: string;
  selected_assets: Asset[];
  entry_rules: EntryRules;
  exit_rules: ExitRules;
  position_size_usd: number;
  per_session_buy_count_cap: number;
  per_session_dollar_cap: number;
  supersedes_strategy_id: string | null;
}

function makePayload(overrides: Partial<TestPayload> = {}): TestPayload {
  return {
    name: "Test",
    asset_class: "crypto-coinbase",
    selected_assets: [
      { assetClass: "crypto-coinbase", identifier: "BTC-USD" },
      { assetClass: "crypto-coinbase", identifier: "ETH-USD" },
    ],
    entry_rules: { rsiThreshold: 30, maPeriod: 20, maReinforcement: false },
    exit_rules: { rsiThreshold: 70, minProfitPct: 1.5, sellFraction: 0.5 },
    position_size_usd: 50,
    per_session_buy_count_cap: 10,
    per_session_dollar_cap: 500,
    supersedes_strategy_id: null,
    ...overrides,
  };
}

describe("isDirty — dirty-state detection for the unsaved-changes prompt (AC 7)", () => {
  it("returns false when the two payloads are deep-equal", () => {
    const initial = makePayload();
    const current = makePayload();
    expect(isDirty(current, initial)).toBe(false);
  });

  it("returns true when name changes", () => {
    const initial = makePayload({ name: "Original" });
    const current = makePayload({ name: "Edited" });
    expect(isDirty(current, initial)).toBe(true);
  });

  it("returns true when entry_rules.rsiThreshold changes", () => {
    const initial = makePayload();
    const current = makePayload({
      entry_rules: { rsiThreshold: 25, maPeriod: 20, maReinforcement: false },
    });
    expect(isDirty(current, initial)).toBe(true);
  });

  it("returns true when entry_rules.maReinforcement toggles", () => {
    const initial = makePayload({
      entry_rules: { rsiThreshold: 30, maPeriod: 20, maReinforcement: false },
    });
    const current = makePayload({
      entry_rules: { rsiThreshold: 30, maPeriod: 20, maReinforcement: true },
    });
    expect(isDirty(current, initial)).toBe(true);
  });

  it("returns true when exit_rules.sellFraction changes", () => {
    const initial = makePayload();
    const current = makePayload({
      exit_rules: { rsiThreshold: 70, minProfitPct: 1.5, sellFraction: 1 },
    });
    expect(isDirty(current, initial)).toBe(true);
  });

  it("returns true when selected_assets count changes", () => {
    const initial = makePayload();
    const current = makePayload({
      selected_assets: [
        { assetClass: "crypto-coinbase", identifier: "BTC-USD" },
      ],
    });
    expect(isDirty(current, initial)).toBe(true);
  });

  it("returns true when selected_assets order changes (deterministic ordering)", () => {
    const initial = makePayload({
      selected_assets: [
        { assetClass: "crypto-coinbase", identifier: "BTC-USD" },
        { assetClass: "crypto-coinbase", identifier: "ETH-USD" },
      ],
    });
    const current = makePayload({
      selected_assets: [
        { assetClass: "crypto-coinbase", identifier: "ETH-USD" },
        { assetClass: "crypto-coinbase", identifier: "BTC-USD" },
      ],
    });
    expect(isDirty(current, initial)).toBe(true);
  });

  it("returns true when position_size_usd or any cap changes", () => {
    const initial = makePayload();
    expect(
      isDirty(makePayload({ position_size_usd: 100 }), initial),
    ).toBe(true);
    expect(
      isDirty(makePayload({ per_session_buy_count_cap: 20 }), initial),
    ).toBe(true);
    expect(
      isDirty(makePayload({ per_session_dollar_cap: 1000 }), initial),
    ).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// PR #52 — empty-numeric-input regression tests
// ──────────────────────────────────────────────────────────────────────────
// Closes the Codex round-1 ISSUE on PR #52: the operator-reported "0 won't
// go away" UX bug. These tests prove the NaN-sentinel contract: cleared
// fields stay visually blank AND submit stays disabled.

describe("numericDisplay — clear → empty (PR #52 regression)", () => {
  it("returns the number unchanged when finite", () => {
    expect(numericDisplay(0)).toBe(0);
    expect(numericDisplay(1.5)).toBe(1.5);
    expect(numericDisplay(-7)).toBe(-7);
    expect(numericDisplay(100)).toBe(100);
  });

  it("returns empty string when value is NaN (operator cleared the field)", () => {
    expect(numericDisplay(NaN)).toBe("");
  });

  it("returns empty string for Infinity / -Infinity (defense in depth)", () => {
    expect(numericDisplay(Infinity)).toBe("");
    expect(numericDisplay(-Infinity)).toBe("");
  });
});

describe("makeNumericChangeHandler — empty input → NaN (PR #52 regression)", () => {
  it("maps an empty-string change event to NaN, NOT 0", () => {
    const setter = vi.fn<(n: number) => void>();
    const handler = makeNumericChangeHandler(setter);
    handler({
      target: { value: "" },
    } as React.ChangeEvent<HTMLInputElement>);
    expect(setter).toHaveBeenCalledOnce();
    const arg = setter.mock.calls[0]?.[0];
    expect(Number.isNaN(arg)).toBe(true);
  });

  it("maps a numeric-string change event to the parsed number", () => {
    const setter = vi.fn<(n: number) => void>();
    const handler = makeNumericChangeHandler(setter);
    handler({
      target: { value: "2" },
    } as React.ChangeEvent<HTMLInputElement>);
    expect(setter).toHaveBeenCalledWith(2);
  });

  it("maps a decimal-string change event to the parsed float", () => {
    const setter = vi.fn<(n: number) => void>();
    const handler = makeNumericChangeHandler(setter);
    handler({
      target: { value: "1.5" },
    } as React.ChangeEvent<HTMLInputElement>);
    expect(setter).toHaveBeenCalledWith(1.5);
  });

  it("maps zero-string '0' to literal 0 (zero is a legal value, not 'cleared')", () => {
    const setter = vi.fn<(n: number) => void>();
    const handler = makeNumericChangeHandler(setter);
    handler({
      target: { value: "0" },
    } as React.ChangeEvent<HTMLInputElement>);
    expect(setter).toHaveBeenCalledWith(0);
  });
});

describe("allNumericFieldsFilled — submit-gate predicate (PR #52 regression)", () => {
  const allFilled = {
    entryRsi: 30,
    exitRsi: 70,
    minProfitPct: 1.5,
    sellFraction: 0.5,
    positionSizeUsd: 50,
    perSessionBuyCountCap: 10,
    perSessionDollarCap: 500,
  };

  it("returns true when every numeric field is finite", () => {
    expect(allNumericFieldsFilled(allFilled)).toBe(true);
  });

  it("returns true even when fields are zero (0 is a finite value)", () => {
    expect(
      allNumericFieldsFilled({ ...allFilled, exitRsi: 0 }),
    ).toBe(true);
  });

  it("returns false when ANY single numeric field is NaN (cleared)", () => {
    // This is the load-bearing regression: clearing Min profit % must keep
    // Save disabled (the operator-reported bug + AC 5 + AC 8).
    expect(
      allNumericFieldsFilled({ ...allFilled, minProfitPct: NaN }),
    ).toBe(false);
    // Every other field individually:
    expect(allNumericFieldsFilled({ ...allFilled, entryRsi: NaN })).toBe(false);
    expect(allNumericFieldsFilled({ ...allFilled, exitRsi: NaN })).toBe(false);
    expect(allNumericFieldsFilled({ ...allFilled, sellFraction: NaN })).toBe(
      false,
    );
    expect(
      allNumericFieldsFilled({ ...allFilled, positionSizeUsd: NaN }),
    ).toBe(false);
    expect(
      allNumericFieldsFilled({ ...allFilled, perSessionBuyCountCap: NaN }),
    ).toBe(false);
    expect(
      allNumericFieldsFilled({ ...allFilled, perSessionDollarCap: NaN }),
    ).toBe(false);
  });

  it("returns false when Infinity slips through (defense in depth)", () => {
    expect(
      allNumericFieldsFilled({ ...allFilled, positionSizeUsd: Infinity }),
    ).toBe(false);
  });
});

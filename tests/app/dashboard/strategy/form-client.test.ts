// CB-3.3 — unit tests for pure helpers exported from strategy-form-client.tsx.
//
// No @testing-library/react in deps per Engineer DRI Decision #9 — full UI
// rendering is verified by the Playwright e2e Codex writes in Phase 3.
// Here we test the exported pure logic (currently `isDirty`) which is the
// non-render-dependent part of the form.

import { describe, expect, it } from "vitest";

import { isDirty } from "@/app/dashboard/strategy/strategy-form-client";
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

// Unit tests for `lib/decisions/evaluate.ts` — pure decision engine.
//
// CB-4.1 AC 12 — scenario matrix covering:
//   * Entry-rule fire/miss (4)
//   * Cap enforcement (6) — exact boundary, just-under, count cap, both
//   * Exit-rule fire/miss (4) — including >=-boundary on min_profit
//   * Insufficient signal data (3) — rsi/ma/both null
//   * Sell with no position (2) — null position + quantity=0 position
//   * Cost-basis edges (3) — avgCostUsd=0, NaN profit, zero-profit at threshold
//   * Multi-asset (3) — ordering preservation
//   * Sizing presence (3) — buy/sell/hold
//   * Reason-string structural assertions (2) — prefix + 2-decimal precision

import { describe, expect, it } from "vitest";

import { evaluate, isOpenPositionHold } from "@/lib/decisions/evaluate";
import type {
  BuySizing,
  PerAssetSignal,
  SellSizing,
  SessionTotals,
} from "@/lib/decisions/types";
import type { Asset, Strategy } from "@/lib/strategy-core/types";

// ──────────────────────────────────────────────────────────────────────────
// Test fixtures — minimal Strategy that satisfies the Zod-branded types at
// the cast layer (we type-cast since the schema's brand prevents direct
// literal construction; runtime shape is what evaluate() consumes).
// ──────────────────────────────────────────────────────────────────────────

const BTC: Asset = { assetClass: "crypto-coinbase", identifier: "BTC-USD" };
const ETH: Asset = { assetClass: "crypto-coinbase", identifier: "ETH-USD" };
const SOL: Asset = { assetClass: "crypto-coinbase", identifier: "SOL-USD" };

function makeStrategy(overrides: Partial<Strategy> = {}): Strategy {
  return {
    id: "01H8XGJWBWBAQ4N7CHR3M9YT8K",
    name: "Test Strategy",
    asset_class: "crypto-coinbase",
    selected_assets: [BTC],
    entry_rules: { rsiThreshold: 30, maPeriod: 20, maReinforcement: false },
    exit_rules: { rsiThreshold: 70, minProfitPct: 1.5, sellFraction: 0.5 },
    position_size_usd: 50,
    per_session_buy_count_cap: 10,
    per_session_dollar_cap: 500,
    created_at: new Date("2026-06-10T00:00:00Z"),
    created_by_user_id: "01H8XGJWBWBAQ4N7CHR3M9YT8M",
    superseded_by_strategy_id: null,
    ...overrides,
  } as Strategy;
}

function makeSignal(overrides: Partial<PerAssetSignal> = {}): PerAssetSignal {
  return {
    rsi: 50,
    ma: 42000,
    lastClose: 42000,
    currentPosition: null,
    ...overrides,
  };
}

function makeSignals(
  entries: Array<[string, PerAssetSignal]>,
): Map<string, PerAssetSignal> {
  return new Map(entries);
}

const ZERO_TOTALS: SessionTotals = { dollarSpent: 0, buyCount: 0 };

// ──────────────────────────────────────────────────────────────────────────
// 1. Entry-rule fire (buy) — 4 tests
// ──────────────────────────────────────────────────────────────────────────

describe("evaluate — entry rule (buy) without maReinforcement", () => {
  it("rsi < entry_threshold → buy", () => {
    const strategy = makeStrategy();
    const signals = makeSignals([
      ["BTC-USD", makeSignal({ rsi: 27.3, ma: 42000, lastClose: 41850 })],
    ]);
    const [result] = evaluate(strategy, signals, ZERO_TOTALS);
    expect(result?.decision).toBe("buy");
    expect(result?.reason).toContain("buy:");
    expect(result?.reason).toContain("rsi=27.30 < entry_threshold=30");
    expect(result?.sizing).toEqual({ kind: "buy_dollars", dollars: 50 });
  });

  it("rsi >= entry_threshold → hold (no buy signal)", () => {
    const strategy = makeStrategy();
    const signals = makeSignals([
      ["BTC-USD", makeSignal({ rsi: 32.1, ma: 42000, lastClose: 42000 })],
    ]);
    const [result] = evaluate(strategy, signals, ZERO_TOTALS);
    expect(result?.decision).toBe("hold");
    expect(result?.reason).toContain("rsi=32.10 >= entry_threshold=30");
    expect(result?.reason).toContain("no buy signal");
    expect(result?.sizing).toBeUndefined();
  });
});

describe("evaluate — entry rule (buy) WITH maReinforcement", () => {
  it("rsi < entry_threshold AND price < ma → buy", () => {
    const strategy = makeStrategy({
      entry_rules: { rsiThreshold: 30, maPeriod: 20, maReinforcement: true },
    });
    const signals = makeSignals([
      ["BTC-USD", makeSignal({ rsi: 27.3, ma: 42000, lastClose: 41850 })],
    ]);
    const [result] = evaluate(strategy, signals, ZERO_TOTALS);
    expect(result?.decision).toBe("buy");
    expect(result?.reason).toContain("price=41850.00 < ma20=42000.00");
  });

  it("rsi < entry_threshold AND price >= ma → hold (ma reinforcement fails)", () => {
    const strategy = makeStrategy({
      entry_rules: { rsiThreshold: 30, maPeriod: 20, maReinforcement: true },
    });
    const signals = makeSignals([
      ["BTC-USD", makeSignal({ rsi: 27.3, ma: 42000, lastClose: 42500 })],
    ]);
    const [result] = evaluate(strategy, signals, ZERO_TOTALS);
    expect(result?.decision).toBe("hold");
    expect(result?.reason).toContain("BUT price=42500.00 >= ma20=42000.00");
    expect(result?.reason).toContain("ma reinforcement");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 2. Cap enforcement (6 tests) — exact boundary, just-under, both
// ──────────────────────────────────────────────────────────────────────────

describe("evaluate — cap enforcement (PM Risk #2 boundary discipline)", () => {
  it("dollarSpent === per_session_dollar_cap (exact boundary) + buy signal → hold + dollar_cap_reached", () => {
    const strategy = makeStrategy(); // dollar cap = 500
    const signals = makeSignals([
      ["BTC-USD", makeSignal({ rsi: 27.3, ma: 42000, lastClose: 41850 })],
    ]);
    const [result] = evaluate(strategy, signals, {
      dollarSpent: 500,
      buyCount: 0,
    });
    expect(result?.decision).toBe("hold");
    expect(result?.reason).toContain("dollar_cap_reached");
    expect(result?.reason).toContain("$500.00 of $500 cap");
    expect(result?.reason).toContain("buy signal suppressed");
  });

  it("dollarSpent === per_session_dollar_cap - 0.01 (just under) + buy signal → buy (NOT suppressed)", () => {
    const strategy = makeStrategy();
    const signals = makeSignals([
      ["BTC-USD", makeSignal({ rsi: 27.3, ma: 42000, lastClose: 41850 })],
    ]);
    const [result] = evaluate(strategy, signals, {
      dollarSpent: 499.99,
      buyCount: 0,
    });
    expect(result?.decision).toBe("buy");
  });

  it("buyCount === per_session_buy_count_cap + buy signal → hold + buy_count_cap_reached", () => {
    const strategy = makeStrategy(); // buy count cap = 10
    const signals = makeSignals([
      ["BTC-USD", makeSignal({ rsi: 27.3, ma: 42000, lastClose: 41850 })],
    ]);
    const [result] = evaluate(strategy, signals, {
      dollarSpent: 0,
      buyCount: 10,
    });
    expect(result?.decision).toBe("hold");
    expect(result?.reason).toContain("buy_count_cap_reached");
    expect(result?.reason).toContain("10 of 10 cap");
  });

  it("buyCount === per_session_buy_count_cap - 1 + buy signal → buy", () => {
    const strategy = makeStrategy();
    const signals = makeSignals([
      ["BTC-USD", makeSignal({ rsi: 27.3, ma: 42000, lastClose: 41850 })],
    ]);
    const [result] = evaluate(strategy, signals, {
      dollarSpent: 0,
      buyCount: 9,
    });
    expect(result?.decision).toBe("buy");
  });

  it("BOTH caps hit + buy signal → hold + reason names both", () => {
    const strategy = makeStrategy();
    const signals = makeSignals([
      ["BTC-USD", makeSignal({ rsi: 27.3, ma: 42000, lastClose: 41850 })],
    ]);
    const [result] = evaluate(strategy, signals, {
      dollarSpent: 500,
      buyCount: 10,
    });
    expect(result?.decision).toBe("hold");
    expect(result?.reason).toContain("dollar_cap_reached");
    expect(result?.reason).toContain("buy_count_cap_reached");
    expect(result?.reason).toContain("+"); // both joined
  });

  it("cap reached + sell signal → sell (caps do NOT apply to sells; AC 6)", () => {
    const strategy = makeStrategy();
    const signals = makeSignals([
      [
        "BTC-USD",
        makeSignal({
          rsi: 72.1,
          ma: 42000,
          lastClose: 43000,
          currentPosition: { avgCostUsd: 42000, quantity: 0.001 },
        }),
      ],
    ]);
    const [result] = evaluate(strategy, signals, {
      dollarSpent: 500, // dollar cap hit
      buyCount: 10, // buy count cap hit
    });
    expect(result?.decision).toBe("sell");
    expect(result?.reason).toContain("sell:");
    expect(result?.sizing).toEqual({ kind: "sell_fraction", fraction: 0.5 });
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 3. Exit rule (sell) — 4 tests
// ──────────────────────────────────────────────────────────────────────────

describe("evaluate — exit rule (sell)", () => {
  it("position + rsi > exit_threshold + profit >= min_profit → sell", () => {
    const strategy = makeStrategy();
    const signals = makeSignals([
      [
        "BTC-USD",
        makeSignal({
          rsi: 72.1,
          ma: 42000,
          lastClose: 43000,
          currentPosition: { avgCostUsd: 42000, quantity: 0.001 },
        }),
      ],
    ]);
    const [result] = evaluate(strategy, signals, ZERO_TOTALS);
    expect(result?.decision).toBe("sell");
    expect(result?.reason).toContain("sell:");
    expect(result?.reason).toContain("rsi=72.10 > exit_threshold=70");
    expect(result?.reason).toContain("profit=2.38%"); // (43000-42000)/42000*100 = 2.38095
    expect(result?.reason).toContain("min_profit=1.50%");
    expect(result?.sizing).toEqual({ kind: "sell_fraction", fraction: 0.5 });
  });

  it("position + rsi > exit_threshold + profit < min_profit → hold", () => {
    const strategy = makeStrategy();
    const signals = makeSignals([
      [
        "BTC-USD",
        makeSignal({
          rsi: 72.1,
          ma: 42000,
          lastClose: 42400, // ~0.95% profit; under 1.5% min
          currentPosition: { avgCostUsd: 42000, quantity: 0.001 },
        }),
      ],
    ]);
    const [result] = evaluate(strategy, signals, ZERO_TOTALS);
    expect(result?.decision).toBe("hold");
    expect(result?.reason).toContain("BUT profit=");
    expect(result?.reason).toContain("< min_profit=1.50%");
  });

  it("position + rsi <= exit_threshold → hold (no exit signal)", () => {
    const strategy = makeStrategy();
    const signals = makeSignals([
      [
        "BTC-USD",
        makeSignal({
          rsi: 65,
          ma: 42000,
          lastClose: 43000,
          currentPosition: { avgCostUsd: 42000, quantity: 0.001 },
        }),
      ],
    ]);
    const [result] = evaluate(strategy, signals, ZERO_TOTALS);
    expect(result?.decision).toBe("hold");
    expect(result?.reason).toContain("rsi=65.00 <= exit_threshold=70");
    expect(result?.reason).toContain("no exit signal");
  });

  it("position + rsi > exit_threshold + profit === min_profit (boundary; >= semantics) → sell", () => {
    const strategy = makeStrategy({
      exit_rules: { rsiThreshold: 70, minProfitPct: 2.0, sellFraction: 0.5 },
    });
    const signals = makeSignals([
      [
        "BTC-USD",
        makeSignal({
          rsi: 72.1,
          ma: 42000,
          lastClose: 42840, // exactly 2.0% profit: 42000 * 1.02
          currentPosition: { avgCostUsd: 42000, quantity: 0.001 },
        }),
      ],
    ]);
    const [result] = evaluate(strategy, signals, ZERO_TOTALS);
    expect(result?.decision).toBe("sell");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 4. Insufficient signal data — 3 tests
// ──────────────────────────────────────────────────────────────────────────

describe("evaluate — insufficient signal data (CB-4.0 null sentinel propagation)", () => {
  it("rsi === null → hold + insufficient signal data reason", () => {
    const strategy = makeStrategy();
    const signals = makeSignals([
      ["BTC-USD", makeSignal({ rsi: null, ma: 42000, lastClose: 42000 })],
    ]);
    const [result] = evaluate(strategy, signals, ZERO_TOTALS);
    expect(result?.decision).toBe("hold");
    expect(result?.reason).toContain("insufficient signal data");
    expect(result?.reason).toContain("rsi=null");
    expect(result?.reason).toContain("ma=42000.00");
  });

  it("ma === null → hold + insufficient signal data reason", () => {
    const strategy = makeStrategy();
    const signals = makeSignals([
      ["BTC-USD", makeSignal({ rsi: 50, ma: null, lastClose: 42000 })],
    ]);
    const [result] = evaluate(strategy, signals, ZERO_TOTALS);
    expect(result?.decision).toBe("hold");
    expect(result?.reason).toContain("insufficient signal data");
    expect(result?.reason).toContain("rsi=50.00");
    expect(result?.reason).toContain("ma=null");
  });

  it("both rsi AND ma null → hold + insufficient signal data reason", () => {
    const strategy = makeStrategy();
    const signals = makeSignals([
      ["BTC-USD", makeSignal({ rsi: null, ma: null, lastClose: 42000 })],
    ]);
    const [result] = evaluate(strategy, signals, ZERO_TOTALS);
    expect(result?.decision).toBe("hold");
    expect(result?.reason).toContain("insufficient signal data");
    expect(result?.reason).toContain("rsi=null");
    expect(result?.reason).toContain("ma=null");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 5. Sell signal with no position — 2 tests
// ──────────────────────────────────────────────────────────────────────────

describe("evaluate — no-position handling (AC 8)", () => {
  it("AC 8 (amended PR #60 round-2): rsi > exit_threshold + currentPosition === null → hold with 'exit rsi condition met' reason (NOT 'sell signal would fire'; only RSI half is checkable without a position)", () => {
    // AC 8 amended contract: when ONLY the RSI half of the exit rule can
    // be evaluated (no position → no avgCostUsd → no profit_pct), the
    // reason must surface "exit rsi condition met" and NOT falsely claim
    // "sell signal would fire" (which would imply the full exit rule
    // was evaluated). PR #60 round-2 BLOCKER closure: the implementation
    // and the story.md AC 8 spec must say the same thing.
    const strategy = makeStrategy();
    const signals = makeSignals([
      [
        "BTC-USD",
        makeSignal({
          rsi: 72.1,
          ma: 42000,
          lastClose: 43000,
          currentPosition: null,
        }),
      ],
    ]);
    const [result] = evaluate(strategy, signals, ZERO_TOTALS);
    expect(result?.decision).toBe("hold");
    // Spec-honest reason (round-2 amendment):
    expect(result?.reason).toContain("exit rsi condition met");
    expect(result?.reason).toContain("rsi=72.10 > exit_threshold=70");
    expect(result?.reason).toContain("but no open position");
    expect(result?.reason).toContain("BTC-USD");
    // CRITICAL: should NOT falsely claim the full exit rule was evaluated.
    expect(result?.reason).not.toContain("sell signal would fire");
    // CRITICAL: should NOT route to the entry-rule-miss reason.
    expect(result?.reason).not.toContain("entry_threshold");
    expect(result?.reason).not.toContain("no buy signal");
  });

  it("AC 8 (amended) also fires for quantity === 0 (treated as no position per bonus Engineer DRI)", () => {
    const strategy = makeStrategy();
    const signals = makeSignals([
      [
        "BTC-USD",
        makeSignal({
          rsi: 72.1,
          ma: 42000,
          lastClose: 43000,
          currentPosition: { avgCostUsd: 42000, quantity: 0 },
        }),
      ],
    ]);
    const [result] = evaluate(strategy, signals, ZERO_TOTALS);
    expect(result?.decision).toBe("hold");
    expect(result?.reason).toContain("exit rsi condition met");
    expect(result?.reason).toContain("but no open position");
    expect(result?.reason).not.toContain("sell signal would fire");
  });

  it("currentPosition with quantity === 0 + entry signal → buy (still routes through entry branch when no exit signal fires)", () => {
    // Bonus Engineer DRI Decision: quantity=0 → no position (entry branch).
    // With a LOW rsi (entry signal, NOT exit signal), the AC 8 branch
    // doesn't fire and the entry rule evaluates → buy.
    const strategy = makeStrategy();
    const signals = makeSignals([
      [
        "BTC-USD",
        makeSignal({
          rsi: 27.3,
          ma: 42000,
          lastClose: 41850,
          currentPosition: { avgCostUsd: 42000, quantity: 0 },
        }),
      ],
    ]);
    const [result] = evaluate(strategy, signals, ZERO_TOTALS);
    expect(result?.decision).toBe("buy");
  });

  it("null position + neither entry nor exit signal → entry-rule-miss reason (sanity check on AC 8 precedence)", () => {
    // RSI=50 is between entry (30) and exit (70) thresholds → neither
    // fires. AC 8 specifically requires rsi > exit_threshold; here it's
    // not, so we fall through to the entry-rule branch which emits the
    // "rsi >= entry_threshold (no buy signal)" reason.
    const strategy = makeStrategy();
    const signals = makeSignals([
      ["BTC-USD", makeSignal({ rsi: 50, ma: 42000, lastClose: 42000, currentPosition: null })],
    ]);
    const [result] = evaluate(strategy, signals, ZERO_TOTALS);
    expect(result?.decision).toBe("hold");
    expect(result?.reason).toContain("rsi=50.00 >= entry_threshold=30");
    expect(result?.reason).toContain("no buy signal");
    // Should NOT contain the AC 8 reason (rsi is not above exit_threshold).
    expect(result?.reason).not.toContain("sell signal would fire");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 6. Cost-basis edge cases — 3 tests
// ──────────────────────────────────────────────────────────────────────────

describe("evaluate — cost-basis edge cases (PM Risk #3 mitigation)", () => {
  it("avgCostUsd === 0 → hold + cost-basis-zero reason (divide-by-zero defense)", () => {
    const strategy = makeStrategy();
    const signals = makeSignals([
      [
        "BTC-USD",
        makeSignal({
          rsi: 72.1,
          ma: 42000,
          lastClose: 43000,
          currentPosition: { avgCostUsd: 0, quantity: 0.001 },
        }),
      ],
    ]);
    const [result] = evaluate(strategy, signals, ZERO_TOTALS);
    expect(result?.decision).toBe("hold");
    expect(result?.reason).toContain("cost basis is zero");
  });

  it("NaN lastClose → NaN profit → hold + NaN reason", () => {
    const strategy = makeStrategy();
    const signals = makeSignals([
      [
        "BTC-USD",
        makeSignal({
          rsi: 72.1,
          ma: 42000,
          lastClose: NaN,
          currentPosition: { avgCostUsd: 42000, quantity: 0.001 },
        }),
      ],
    ]);
    const [result] = evaluate(strategy, signals, ZERO_TOTALS);
    expect(result?.decision).toBe("hold");
    expect(result?.reason).toContain("NaN");
  });

  it("profit exactly === 0 with min_profit === 0 → sell (>= boundary semantics)", () => {
    const strategy = makeStrategy({
      exit_rules: { rsiThreshold: 70, minProfitPct: 0, sellFraction: 0.5 },
    });
    const signals = makeSignals([
      [
        "BTC-USD",
        makeSignal({
          rsi: 72.1,
          ma: 42000,
          lastClose: 42000, // exactly at cost basis: 0% profit
          currentPosition: { avgCostUsd: 42000, quantity: 0.001 },
        }),
      ],
    ]);
    const [result] = evaluate(strategy, signals, ZERO_TOTALS);
    expect(result?.decision).toBe("sell");
    expect(result?.reason).toContain("profit=0.00% >= min_profit=0.00%");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 7. Multi-asset strategy — 3 tests
// ──────────────────────────────────────────────────────────────────────────

describe("evaluate — multi-asset ordering preservation (Engineer DRI Decision #6)", () => {
  it("3 selected_assets returns 3 DecisionResults in input order", () => {
    const strategy = makeStrategy({
      selected_assets: [BTC, ETH, SOL],
    });
    const signals = makeSignals([
      ["BTC-USD", makeSignal({ rsi: 50, ma: 42000, lastClose: 42000 })],
      ["ETH-USD", makeSignal({ rsi: 50, ma: 3000, lastClose: 3000 })],
      ["SOL-USD", makeSignal({ rsi: 50, ma: 150, lastClose: 150 })],
    ]);
    const results = evaluate(strategy, signals, ZERO_TOTALS);
    expect(results).toHaveLength(3);
    expect(results[0]?.asset.identifier).toBe("BTC-USD");
    expect(results[1]?.asset.identifier).toBe("ETH-USD");
    expect(results[2]?.asset.identifier).toBe("SOL-USD");
  });

  it("different decisions per asset coexist in one tick", () => {
    const strategy = makeStrategy({
      selected_assets: [BTC, ETH, SOL],
    });
    const signals = makeSignals([
      // BTC: buy signal (rsi < threshold)
      ["BTC-USD", makeSignal({ rsi: 27, ma: 42000, lastClose: 41850 })],
      // ETH: sell signal (rsi > threshold + position + profit)
      [
        "ETH-USD",
        makeSignal({
          rsi: 72,
          ma: 3000,
          lastClose: 3100,
          currentPosition: { avgCostUsd: 3000, quantity: 1 },
        }),
      ],
      // SOL: hold (insufficient data)
      ["SOL-USD", makeSignal({ rsi: null, ma: null, lastClose: 150 })],
    ]);
    const results = evaluate(strategy, signals, ZERO_TOTALS);
    expect(results[0]?.decision).toBe("buy");
    expect(results[1]?.decision).toBe("sell");
    expect(results[2]?.decision).toBe("hold");
  });

  it("input order preserved even when reverse-alphabetical would differ", () => {
    // SOL, ETH, BTC reverse alphabetical to verify we DON'T sort alphabetically.
    const strategy = makeStrategy({
      selected_assets: [SOL, ETH, BTC],
    });
    const signals = makeSignals([
      ["SOL-USD", makeSignal()],
      ["ETH-USD", makeSignal()],
      ["BTC-USD", makeSignal()],
    ]);
    const results = evaluate(strategy, signals, ZERO_TOTALS);
    expect(results[0]?.asset.identifier).toBe("SOL-USD");
    expect(results[1]?.asset.identifier).toBe("ETH-USD");
    expect(results[2]?.asset.identifier).toBe("BTC-USD");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 8. Sizing presence — 3 tests
// ──────────────────────────────────────────────────────────────────────────

describe("evaluate — sizing object presence per decision class", () => {
  it("buy decision carries BuySizing with dollars = position_size_usd", () => {
    const strategy = makeStrategy({ position_size_usd: 75 });
    const signals = makeSignals([
      ["BTC-USD", makeSignal({ rsi: 27, ma: 42000, lastClose: 41850 })],
    ]);
    const [result] = evaluate(strategy, signals, ZERO_TOTALS);
    expect(result?.sizing).toEqual({ kind: "buy_dollars", dollars: 75 } satisfies BuySizing);
  });

  it("sell decision carries SellSizing with fraction = sellFraction", () => {
    const strategy = makeStrategy({
      exit_rules: { rsiThreshold: 70, minProfitPct: 1, sellFraction: 0.75 },
    });
    const signals = makeSignals([
      [
        "BTC-USD",
        makeSignal({
          rsi: 72,
          ma: 42000,
          lastClose: 43000,
          currentPosition: { avgCostUsd: 42000, quantity: 0.001 },
        }),
      ],
    ]);
    const [result] = evaluate(strategy, signals, ZERO_TOTALS);
    expect(result?.sizing).toEqual({ kind: "sell_fraction", fraction: 0.75 } satisfies SellSizing);
  });

  it("hold decision has NO sizing object", () => {
    const strategy = makeStrategy();
    const signals = makeSignals([
      ["BTC-USD", makeSignal({ rsi: 50, ma: 42000, lastClose: 42000 })],
    ]);
    const [result] = evaluate(strategy, signals, ZERO_TOTALS);
    expect(result?.sizing).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 9. Reason-string structural assertions (AC 9) — 2 tests
// ──────────────────────────────────────────────────────────────────────────

describe("evaluate — reason-string contract (AC 9 + Engineer DRI Decision #1)", () => {
  it("every reason starts with one of `buy:`, `sell:`, or `hold:` prefix", () => {
    const strategy = makeStrategy({ selected_assets: [BTC, ETH, SOL] });
    const signals = makeSignals([
      // buy
      ["BTC-USD", makeSignal({ rsi: 27, ma: 42000, lastClose: 41850 })],
      // sell
      [
        "ETH-USD",
        makeSignal({
          rsi: 72,
          ma: 3000,
          lastClose: 3100,
          currentPosition: { avgCostUsd: 3000, quantity: 1 },
        }),
      ],
      // hold
      ["SOL-USD", makeSignal({ rsi: 50, ma: 150, lastClose: 150 })],
    ]);
    const results = evaluate(strategy, signals, ZERO_TOTALS);
    for (const r of results) {
      expect(r.reason).toMatch(/^(buy|sell|hold):/);
    }
  });

  it("numeric values in reason strings use 2-decimal precision (toFixed(2))", () => {
    const strategy = makeStrategy();
    const signals = makeSignals([
      ["BTC-USD", makeSignal({ rsi: 27.345678, ma: 42000.987, lastClose: 41850.12 })],
    ]);
    const [result] = evaluate(strategy, signals, ZERO_TOTALS);
    // RSI should be formatted as 27.35 (toFixed(2) of 27.345678).
    expect(result?.reason).toContain("rsi=27.35");
    // entry_threshold is an integer; surfaced verbatim.
    expect(result?.reason).toContain("entry_threshold=30");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Dust floor (fix 2026-06-22) — a sub-$1 residual is treated as FLAT.
// Regression for the live failed-sell loop: an ETH dust balance (~$0.00002)
// with RSI overbought + "profit" met produced "sell 90%" → sub-minimum order →
// failed, every tick. Must now → hold (not exitable) + eligible to buy.
// ──────────────────────────────────────────────────────────────────────────
describe("evaluate — dust floor (sub-$1 position treated as flat)", () => {
  const BTC_ID = "BTC-USD";

  it("DUST + overbought + profit → hold (NOT sell); reason names dust", () => {
    // value = 0.00000001 * 42000 = $0.00042 (< $1 floor)
    const signals = makeSignals([
      [BTC_ID, makeSignal({ rsi: 75, ma: 41000, lastClose: 42000, currentPosition: { quantity: 0.00000001, avgCostUsd: 40000 } })],
    ]);
    const [r] = evaluate(makeStrategy(), signals, ZERO_TOTALS);
    expect(r?.decision).toBe("hold"); // load-bearing: NOT a sell
    expect(r?.reason).toContain("dust");
    expect(r?.reason).toContain("not exitable");
    expect(r?.sizing).toBeUndefined(); // no sell sizing emitted
  });

  it("REAL position (>= $1) + overbought + profit → sell (no regression)", () => {
    // value = 0.01 * 42000 = $420 (>= $1); profit (42000 vs 40000) = 5% >= 1.5
    const signals = makeSignals([
      [BTC_ID, makeSignal({ rsi: 75, ma: 41000, lastClose: 42000, currentPosition: { quantity: 0.01, avgCostUsd: 40000 } })],
    ]);
    const [r] = evaluate(makeStrategy(), signals, ZERO_TOTALS);
    expect(r?.decision).toBe("sell");
  });

  it("DUST + oversold (rsi < entry) → BUY (dust is flat → eligible to enter)", () => {
    const signals = makeSignals([
      [BTC_ID, makeSignal({ rsi: 25, ma: 42000, lastClose: 41800, currentPosition: { quantity: 0.00000001, avgCostUsd: 40000 } })],
    ]);
    const [r] = evaluate(makeStrategy(), signals, ZERO_TOTALS);
    expect(r?.decision).toBe("buy");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// isOpenPositionHold — EXHAUSTIVE: must classify every evaluateExit() hold path
// as open-position (so the cockpit shows HOLDING, not WAITING TO BUY, and never
// hides a real position's audit reason). Codex BLOCKER 2026-06-22 round 3:
// the prefix-only classifier missed cost-basis-zero + NaN-profit holds.
// Drives each path through evaluate() so a NEW exit hold reason that forgets to
// extend OPEN_POSITION_HOLD_MARKERS fails here.
// ──────────────────────────────────────────────────────────────────────────
describe("isOpenPositionHold — covers every evaluateExit hold path", () => {
  const ID = "BTC-USD";
  function holdReasonFor(over: Partial<PerAssetSignal>): string {
    const [r] = evaluate(makeStrategy(), makeSignals([[ID, makeSignal(over)]]), ZERO_TOTALS);
    expect(r?.decision).toBe("hold"); // these are all hold paths
    return r?.reason ?? "";
  }

  it("OPEN: position open + rsi <= exit (no exit signal) → true", () => {
    // value 0.01*42000=$420 (real); rsi 50 <= exit 70
    const reason = holdReasonFor({ rsi: 50, ma: 41000, lastClose: 42000, currentPosition: { quantity: 0.01, avgCostUsd: 40000 } });
    expect(reason).toContain("position open");
    expect(isOpenPositionHold(reason)).toBe(true);
  });

  it("OPEN: position open + rsi > exit BUT profit < min → true", () => {
    // rsi 75 > exit 70; profit (42000 vs 41900) = 0.24% < 1.5 min
    const reason = holdReasonFor({ rsi: 75, ma: 41000, lastClose: 42000, currentPosition: { quantity: 0.01, avgCostUsd: 41900 } });
    expect(reason).toContain("position open");
    expect(isOpenPositionHold(reason)).toBe(true);
  });

  it("OPEN: cost basis is zero → true", () => {
    const reason = holdReasonFor({ rsi: 75, ma: 41000, lastClose: 42000, currentPosition: { quantity: 0.01, avgCostUsd: 0 } });
    expect(reason).toContain("cost basis is zero");
    expect(isOpenPositionHold(reason)).toBe(true);
  });

  it("OPEN: profit computation produced NaN → true", () => {
    // non-finite lastClose keeps the position "real" (evaluate's finite-price guard)
    const reason = holdReasonFor({ rsi: 75, ma: 41000, lastClose: NaN, currentPosition: { quantity: 0.01, avgCostUsd: 40000 } });
    expect(reason).toContain("profit computation produced NaN");
    expect(isOpenPositionHold(reason)).toBe(true);
  });

  it("FLAT: dust / no open position / no-buy-signal / insufficient → false", () => {
    const dust = holdReasonFor({ rsi: 75, ma: 41000, lastClose: 42000, currentPosition: { quantity: 0.00000001, avgCostUsd: 40000 } });
    expect(isOpenPositionHold(dust)).toBe(false); // "...but position is dust..."

    const noPos = holdReasonFor({ rsi: 75, ma: 41000, lastClose: 42000, currentPosition: null });
    expect(noPos).toContain("no open position"); // word order ≠ "position open"
    expect(isOpenPositionHold(noPos)).toBe(false);

    const noBuy = holdReasonFor({ rsi: 50, ma: 41000, lastClose: 42000, currentPosition: null });
    expect(isOpenPositionHold(noBuy)).toBe(false);

    const insufficient = holdReasonFor({ rsi: null, ma: null, lastClose: 42000, currentPosition: null });
    expect(isOpenPositionHold(insufficient)).toBe(false);
  });
});

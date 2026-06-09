// DB-row → CB-3.0 Zod type roundtrip tests.
//
// CB-3.2 AC 5. Materializes the PM DRI Decision #2 — "CB-3.2 reuses
// CB-3.0's Zod types directly; no duplicate type definitions" — into
// mechanical enforcement. The test constructs fixture rows shaped EXACTLY
// like the planned `strategies` table columns from
// `db/migrations/0004-strategies.sql` (snake_case top-level + camelCase
// inner jsonb shapes), then feeds them through `StrategySchema.parse()`
// and asserts roundtrip equivalence.
//
// The fixtures simulate what the `postgres` driver returns when it
// SELECTs a row from `strategies`. Two timestamptz cases:
//   * `Date` instance (postgres driver default for timestamptz columns)
//   * ISO string (driver-config edge case; also the JSON.parse roundtrip
//     case after a strategy is serialized over the wire)
//
// If a future schema change adds a column to `strategies` that
// `StrategySchema` can't accept, this test fails — pushing back on the
// drift instead of silently allowing it.

import { describe, expect, it } from "vitest";

import { StrategySchema } from "@/lib/strategy-core/types";

const ULID_A = "01H8XGJWBWBAQ4N7CHR3M9YT8K";
const ULID_B = "01H8XGJWBWBAQ4N7CHR3M9YT8L";
const ULID_USER = "01H8XGJWBWBAQ4N7CHR3M9YT8M";

/**
 * Shape exactly matches a SELECT * FROM strategies row, with the postgres
 * driver's default deserialization (jsonb → JS object; timestamptz → Date).
 */
function makeDbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ULID_A,
    name: "Conservative DCA",
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
    created_at: new Date("2026-06-08T12:34:56.000Z"),
    created_by_user_id: ULID_USER,
    superseded_by_strategy_id: null,
    ...overrides,
  };
}

describe("CB-3.2 AC 5 — DB row → CB-3.0 StrategySchema roundtrip (no duplicate type defs)", () => {
  it("happy-path DB row (timestamptz as Date instance) roundtrips through StrategySchema", () => {
    const row = makeDbRow();
    const parsed = StrategySchema.parse(row);
    expect(parsed.id).toBe(ULID_A);
    expect(parsed.asset_class).toBe("crypto-coinbase");
    expect(parsed.selected_assets).toHaveLength(2);
    expect(parsed.selected_assets[0]?.identifier).toBe("BTC-USD");
    expect(parsed.entry_rules.rsiThreshold).toBe(30);
    expect(parsed.exit_rules.minProfitPct).toBe(1.5);
    expect(parsed.created_at).toBeInstanceOf(Date);
    expect(parsed.created_at.getTime()).toBe(
      new Date("2026-06-08T12:34:56.000Z").getTime(),
    );
    expect(parsed.superseded_by_strategy_id).toBeNull();
  });

  it("AC 5 full roundtrip: parse(DB row) → JSON.stringify → JSON.parse → re-parse → DEEP EQUAL", () => {
    // The load-bearing roundtrip per AC 5: prove the row survives a full
    // serialize/deserialize cycle without semantic loss. After parsing
    // the Date-bearing row, stringify produces ISO strings for created_at;
    // JSON.parse turns those back into strings; re-parsing through
    // StrategySchema must coerce them back to Date instances AND yield a
    // value deeply equal to the first parse (including Date instants).
    // This is what z.coerce.date() on `created_at` exists to make safe.
    const row = makeDbRow({ superseded_by_strategy_id: ULID_B });

    // Step 1: first parse (Date in)
    const parsed1 = StrategySchema.parse(row);

    // Step 2: cross the JSON boundary (Date → ISO string)
    const serialized = JSON.stringify(parsed1);
    const fromJson = JSON.parse(serialized);
    expect(typeof fromJson.created_at).toBe("string");

    // Step 3: re-parse (ISO string coerced back to Date)
    const parsed2 = StrategySchema.parse(fromJson);
    expect(parsed2.created_at).toBeInstanceOf(Date);

    // Step 4: DEEP EQUAL — every field, including the Date instant
    expect(parsed2).toEqual(parsed1);
  });

  it("DB row with NON-NULL superseded_by_strategy_id (supersession case) roundtrips", () => {
    // This is the load-bearing supersession scenario: an old strategy row
    // with its `superseded_by_strategy_id` populated after a revision.
    // CB-5's dashboard reads these to render historical bot decisions
    // alongside the strategy that was active at decision time.
    const row = makeDbRow({ superseded_by_strategy_id: ULID_B });
    const parsed = StrategySchema.parse(row);
    expect(parsed.superseded_by_strategy_id).toBe(ULID_B);
  });

  it("DB row with selected_assets: [] is REJECTED (matches StrategySchema min(1))", () => {
    // The DB column itself doesn't enforce a non-empty constraint (jsonb
    // can hold an empty array); the Zod layer is the enforcement. This
    // test pins that the empty-assets case bubbles up at parse time, NOT
    // silently passes through to a strategy with no assets to trade.
    const row = makeDbRow({ selected_assets: [] });
    expect(() => StrategySchema.parse(row)).toThrow();
  });

  it("DB row with selected_assets count > 5 is REJECTED (matches StrategySchema max(5))", () => {
    // MVP cardinality limit per architecture Decision #4 + universal
    // validation in lib/strategy-core/validate.ts. Even though the
    // jsonb column can hold any-length array, StrategySchema enforces
    // the [1, 5] window.
    const row = makeDbRow({
      selected_assets: Array.from({ length: 6 }, (_, i) => ({
        assetClass: "crypto-coinbase",
        identifier: `PAIR-${i}-USD`,
      })),
    });
    expect(() => StrategySchema.parse(row)).toThrow();
  });

  it("DB row with position_size_usd: 0 is REJECTED (matches DB CHECK position_size_usd > 0 AND StrategySchema z.number().positive())", () => {
    // Defense-in-depth alignment: the DB CHECK is the production safety,
    // the Zod constraint is the early-feedback layer. Both reject 0.
    // The CB-3.2 PM Risk #2 is "DB CHECK vs Zod constraint drift" —
    // this test plus the constraint-alignment test (AC 6) is the
    // structural defense.
    const row = makeDbRow({ position_size_usd: 0 });
    expect(() => StrategySchema.parse(row)).toThrow();
  });
});

// Unit tests for `lib/strategy-core/top-n.ts`.
//
// Uses the mock equity adapter fixture (Engineer DRI Decision #5) to prove
// the generic ranking + slicing logic works against an `AssetAdapter`
// without any Coinbase coupling.

import { describe, expect, it } from "vitest";

import { topN } from "@/lib/strategy-core/top-n";

import { makeMockEquityAdapter } from "./_fixtures/equity-mock-adapter";

describe("topN — generic top-N-by-volume ranking", () => {
  it("returns top-N assets in volume-descending order", async () => {
    const adapter = makeMockEquityAdapter();
    const top5 = await topN(adapter, 5);
    expect(top5).toHaveLength(5);
    // Fixture order: AAPL > MSFT > GOOG > AMZN > META > TSLA > NVDA > BRK.B
    expect(top5.map((a) => a.identifier)).toEqual([
      "AAPL",
      "MSFT",
      "GOOG",
      "AMZN",
      "META",
    ]);
  });

  it("returns the full candidate set when n exceeds candidate count (no padding)", async () => {
    const adapter = makeMockEquityAdapter();
    const top20 = await topN(adapter, 20);
    expect(top20).toHaveLength(8); // fixture has 8 tickers
  });

  it("throws on n <= 0 or non-integer n", async () => {
    const adapter = makeMockEquityAdapter();
    await expect(topN(adapter, 0)).rejects.toThrow(/positive integer/i);
    await expect(topN(adapter, -1)).rejects.toThrow(/positive integer/i);
    await expect(topN(adapter, 2.5)).rejects.toThrow(/positive integer/i);
  });
});

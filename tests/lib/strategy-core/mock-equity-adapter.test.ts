// CB-3.0 AC 8 — Mock equity adapter test.
//
// LOAD-BEARING per PM DRI Decision #2 (mandatory at CB-3.0; NOT deferred to
// CB-3.1). Proves the `AssetAdapter` abstraction holds for an asset class
// OTHER than crypto-coinbase. If we defer this until the equity app tries
// to consume the extracted strategy-core package, we only learn the
// abstraction is wrong AFTER it's already published — exactly the
// build-twice-then-extract anti-pattern that CB-3 brief Decision #6 calls
// out (per the @vc1023/passkey-2fa precedent).
//
// The fact that this test exists + passes + is wired through `topN()`
// without any Coinbase imports is the proof.
//
// Asset shape uses snake_case (`asset_class`, `identifier`) per round-1
// BLOCKER 1 fix.

import { describe, expect, it } from "vitest";

import { topN } from "@/lib/strategy-core/top-n";

import { makeMockEquityAdapter } from "./_fixtures/equity-mock-adapter";

describe("AC 8 — mock equity adapter proves AssetAdapter seam is honest", () => {
  it("adapter exposes assetClass = 'equity-mock' (NOT crypto-coinbase)", () => {
    const adapter = makeMockEquityAdapter();
    expect(adapter.assetClass).toBe("equity-mock");
  });

  it("getCandidateAssets returns 8 fixture tickers, all tagged with equity-mock asset class (snake_case)", async () => {
    const adapter = makeMockEquityAdapter();
    const assets = await adapter.getCandidateAssets();
    expect(assets).toHaveLength(8);
    for (const a of assets) {
      expect(a.asset_class).toBe("equity-mock");
    }
    expect(assets.map((a) => a.identifier)).toEqual(
      expect.arrayContaining(["AAPL", "MSFT", "GOOG", "AMZN", "META", "TSLA", "NVDA", "BRK.B"]),
    );
  });

  it("topN() works against the mock equity adapter — proves the universal ranking helper is asset-class-agnostic", async () => {
    const adapter = makeMockEquityAdapter();
    const top3 = await topN(adapter, 3);
    expect(top3).toHaveLength(3);
    // Top-3 of fixture data: AAPL > MSFT > GOOG by volume
    expect(top3.map((a) => a.identifier)).toEqual(["AAPL", "MSFT", "GOOG"]);
    // Every result still tagged with equity-mock (NOT silently coerced
    // to crypto-coinbase or anything Coinbase-shaped)
    for (const a of top3) {
      expect(a.asset_class).toBe("equity-mock");
    }
  });

  it("getAssetIdentifier returns the broker symbol verbatim (no Coinbase product_id transformation)", () => {
    const adapter = makeMockEquityAdapter();
    expect(
      adapter.getAssetIdentifier({ asset_class: "equity-mock", identifier: "AAPL" }),
    ).toBe("AAPL");
    // No -USD suffix; no Coinbase-shaped transformation. Identifier
    // shape is asset-class-specific and the adapter owns it.
  });
});

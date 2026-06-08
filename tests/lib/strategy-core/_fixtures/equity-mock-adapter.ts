// `tests/lib/strategy-core/_fixtures/equity-mock-adapter.ts`
//
// Mock `AssetAdapter` for asset class "equity-mock". Returns 8 fixture
// tickers with pre-baked volume data. No real broker calls; no network.
//
// LOAD-BEARING per CB-3.0 story AC 8 + Engineer DRI Decision #5 (extract to
// fixture file for reuse). The fact that this fixture exists and works
// proves the `AssetAdapter` abstraction is honest — it can serve a NON-
// Coinbase asset class. If a future contributor accidentally couples
// `lib/strategy-core/*` to Coinbase, this fixture won't be able to drive
// `topN()` and the test fails.
//
// Reused by CB-3.3+ form UI tests when the form swap-adapter behavior gets
// tested with a non-real-broker class.
//
// FIELD NAMING — snake_case across Asset shape per AC 6.

import type { AssetAdapter } from "@/lib/strategy-core/adapter";
import type { Asset } from "@/lib/strategy-core/types";

/**
 * Fixture data: 8 S&P 500 ticker symbols with monotonically descending
 * volumes so ranking is testable + reproducible.
 *
 * Volume ordering: AAPL > MSFT > GOOG > AMZN > META > TSLA > NVDA > BRK.B.
 * Numbers are arbitrary; the descending order is the contract.
 */
const FIXTURE_DATA: ReadonlyArray<{ symbol: string; volume_24h: number }> = [
  { symbol: "AAPL", volume_24h: 80_000_000 },
  { symbol: "MSFT", volume_24h: 60_000_000 },
  { symbol: "GOOG", volume_24h: 50_000_000 },
  { symbol: "AMZN", volume_24h: 40_000_000 },
  { symbol: "META", volume_24h: 30_000_000 },
  { symbol: "TSLA", volume_24h: 20_000_000 },
  { symbol: "NVDA", volume_24h: 15_000_000 },
  { symbol: "BRK.B", volume_24h: 10_000_000 },
];

const MOCK_ASSET_CLASS = "equity-mock" as const;

/**
 * Build a fresh mock equity adapter. New instance per test (no shared
 * state) so test isolation holds.
 */
export function makeMockEquityAdapter(): AssetAdapter {
  return {
    assetClass: MOCK_ASSET_CLASS,

    async getCandidateAssets(): Promise<Asset[]> {
      return FIXTURE_DATA.map(({ symbol }) => ({
        asset_class: MOCK_ASSET_CLASS,
        identifier: symbol,
      }));
    },

    async rankByVolume(assets: Asset[]): Promise<Asset[]> {
      // Sort by the fixture's known volume; preserves the proven-descending
      // ordering. Any asset not in FIXTURE_DATA gets volume 0 (sorts last).
      const volumeByIdentifier = new Map(
        FIXTURE_DATA.map(({ symbol, volume_24h }) => [symbol, volume_24h]),
      );
      return [...assets].sort((a, b) => {
        const va = volumeByIdentifier.get(a.identifier) ?? 0;
        const vb = volumeByIdentifier.get(b.identifier) ?? 0;
        return vb - va;
      });
    },

    getAssetIdentifier(asset: Asset): string {
      return asset.identifier;
    },
  };
}

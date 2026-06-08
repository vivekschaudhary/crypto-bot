// `lib/strategy-core/adapter.ts` — the seam where asset classes plug in.
//
// CB-3.0 (FIRST CB-3 STORY) per bet architecture Decision #2. ONLY the
// interface lives here; implementations live in their own modules:
//   * lib/strategy-coinbase/adapter.ts (ships in CB-3.1 — crypto-coinbase)
//   * lib/strategy-alpaca/adapter.ts   (future; equity)
//   * tests/lib/strategy-core/_fixtures/equity-mock-adapter.ts (CB-3.0
//                                                                test fixture
//                                                                proving the
//                                                                seam works)
//
// ARCHITECTURAL INVARIANT (also stated in types.ts): NO `lib/coinbase/*`
// imports here. The interface is asset-class-agnostic; binding to a specific
// asset class happens in the adapter implementation module.

import type { Asset, AssetClass } from "./types";

/**
 * Adapter for one asset class. The single seam where asset-class-specific
 * logic lives in CB-3. Everywhere else in `lib/strategy-core/` operates on
 * `Asset` (the abstract pair) + indicator math (`EntryRules` / `ExitRules`).
 *
 * Implementations are responsible for:
 *   - Fetching the candidate set of assets for their class (Coinbase
 *     products; broker-listed tickers; etc.)
 *   - Ranking assets by 24h volume (or analog "currently liquid" signal)
 *   - Returning the external-system identifier string for an asset
 */
export interface AssetAdapter {
  /**
   * Which asset class this adapter handles. Used by:
   *   - Strategy save action to set `strategies.asset_class` discriminator
   *   - Form UI (CB-3.3) to display the right label/copy
   *   - Trace observability to tag emit lines with the asset class
   */
  readonly assetClass: AssetClass;

  /**
   * Returns the candidate set of assets the operator can select from
   * (all Coinbase products; all S&P 500 tickers; etc.). Adapter handles
   * caching / pagination / etc. internally — strategy-core just consumes
   * the array.
   */
  getCandidateAssets(): Promise<Asset[]>;

  /**
   * Ranks the given assets by 24h volume (or asset-class-appropriate
   * "currently liquid" signal). Returns sorted DESCENDING (most liquid
   * first). Universal across asset classes; the data source differs per
   * adapter.
   */
  rankByVolume(assets: Asset[]): Promise<Asset[]>;

  /**
   * Returns the identifier string used as the FK / external ID for an asset.
   *   - crypto-coinbase: the Coinbase `product_id` (e.g., "BTC-USD")
   *   - equity:          the broker's symbol (e.g., "AAPL")
   */
  getAssetIdentifier(asset: Asset): string;
}

// `lib/strategy-coinbase/adapter.ts` — crypto-coinbase implementation of
// the `AssetAdapter` interface from CB-3.0.
//
// CB-3.1 (SECOND CB-3 STORY) — per [bet architecture Decision #3](../../docs/bets/CB-3/architecture.md):
// this is the SINGLE file in CB-3 where crypto-coinbase coupling lives.
// strategy-core stays Coinbase-free (CB-3.0's architectural invariant test
// enforces); this adapter imports from `lib/coinbase/market` (CB-2's typed
// wrapper) and translates between Coinbase's product shape and strategy-
// core's abstract `Asset` shape.
//
// ENGINEER DRI DECISIONS (committed at first commit per story Tech notes):
//
//   1. FILTER SHAPE — `quote_currency_id === "USD"` AND `product_type === "SPOT"`.
//      Operator's market is US-listed USD-quoted spot per product.md.
//      Products missing either field are excluded. USDC-/EUR-quoted deferred.
//
//   2. RANKING FIELD = `approximate_quote_24h_volume` (DOLLAR VOLUME)
//      — NOT `volume_24h`. Discovered empirically during CB-3.1 `/build`
//      2026-06-08: Coinbase's `volume_24h` is base-currency token count
//      (PEPE-USD = ~10^11 tokens but ~$80M USD; BTC-USD = ~10^4 tokens but
//      ~$685M USD). Operator's intent is "top by dollar-volume liquidity,"
//      so the correct field is `approximate_quote_24h_volume` (Coinbase's
//      pre-computed base × price). Adapter uses `parseFloat`; non-parseable
//      / missing values → 0 → sort last (defense-in-depth). See CB-3
//      brief + architecture Decision #3 amendments 2026-06-08 for full
//      rationale + supersession of the original `volume_24h` choice.
//
//   3. STATELESS ADAPTER — both methods call `getProducts()` independently.
//      No internal cache; `makeCoinbaseAdapter()` returns a new instance per
//      call with no mutable state.
//
//   4. SINGLE getProducts() CALL FOR RANKING — `getProducts()` already
//      returns `approximate_quote_24h_volume` on every product (per CB-2.2's
//      schema after the 2026-06-08 extension). No per-asset `getProduct(id)`
//      loop needed; saves rate-limit budget for identical data. Per
//      architecture Decision #3 amendment 2026-06-08.
//
//   5. INTEGRATION TEST FORMAT — mirrors CB-2.5's trace integration test
//      pattern (gated; log-the-observation via `originalLog`); seeds
//      Researcher Open Question #1 empirical data.
//
//   6. NO LIVE_MODE READ — inherits CB-3-core's policy-free posture; the
//      LIVE_MODE gate lives at CB-4's order-placement layer. Sibling
//      invariant test at `tests/lib/strategy-coinbase/no-live-mode.test.ts`
//      enforces.

import { getProducts } from "@/lib/coinbase/market";
import type { AssetAdapter } from "@/lib/strategy-core/adapter";
import type { Asset, AssetClass } from "@/lib/strategy-core/types";

const COINBASE_ASSET_CLASS: AssetClass = "crypto-coinbase";

/**
 * Build a fresh crypto-coinbase `AssetAdapter` instance. Stateless — each
 * call returns a new instance with no shared state. Both `getCandidateAssets`
 * and `rankByVolume` call CB-2's `getProducts()` independently (per Engineer
 * DRI Decision #3 + #4); the list endpoint already returns
 * `approximate_quote_24h_volume` for each product, so no per-asset detail
 * call is needed.
 *
 * Consumer pattern (server action at CB-3.3 / bot tick at CB-4):
 *   ```ts
 *   const adapter = makeCoinbaseAdapter();
 *   const top5 = await topN(adapter, 5);  // uses strategy-core's topN
 *   ```
 */
export function makeCoinbaseAdapter(): AssetAdapter {
  return {
    assetClass: COINBASE_ASSET_CLASS,

    /**
     * Filter Coinbase's full product list to USD-quoted spot products
     * (Engineer DRI Decision #1). Returns `Asset[]` where each asset's
     * identifier is the Coinbase `product_id` (e.g., "BTC-USD").
     *
     * Products missing either `quote_currency_id` or `product_type`
     * are EXCLUDED — the adapter only surfaces products it can
     * definitively classify.
     */
    async getCandidateAssets(): Promise<Asset[]> {
      const products = await getProducts();
      return products
        .filter(
          (p) =>
            p.quote_currency_id === "USD" && p.product_type === "SPOT",
        )
        .map((p) => ({
          assetClass: COINBASE_ASSET_CLASS,
          identifier: p.product_id,
        }));
    },

    /**
     * Sort the given assets by Coinbase's `approximate_quote_24h_volume`
     * (DOLLAR volume; descending). Builds a `product_id → dollar_volume`
     * lookup map from a single `getProducts()` call (Engineer DRI
     * Decision #4). The field is parsed via `parseFloat`; non-parseable
     * values (NaN, missing entry, empty string, missing field) → 0 →
     * sort last (Engineer DRI Decision #2).
     *
     * Returns a NEW array (input not mutated).
     */
    async rankByVolume(assets: Asset[]): Promise<Asset[]> {
      const products = await getProducts();
      const dollarVolumeByProductId = new Map<string, number>();
      for (const p of products) {
        const parsed = parseFloat(p.approximate_quote_24h_volume ?? "");
        dollarVolumeByProductId.set(
          p.product_id,
          Number.isFinite(parsed) ? parsed : 0,
        );
      }

      return [...assets].sort((a, b) => {
        const va = dollarVolumeByProductId.get(a.identifier) ?? 0;
        const vb = dollarVolumeByProductId.get(b.identifier) ?? 0;
        return vb - va;
      });
    },

    /**
     * Returns the Coinbase `product_id` verbatim — it's already the
     * canonical identifier shape for the crypto-coinbase asset class.
     * No transformation needed.
     */
    getAssetIdentifier(asset: Asset): string {
      return asset.identifier;
    },
  };
}

// Zod schemas at the public market data wrapper boundary.
//
// Per [CB-2 brief PM Risk #2](../../docs/bets/CB-2/brief.md#risks)
// ("Coinbase changes a response shape mid-flight; wrapper's Zod schemas
// reject the new field; consumer surfaces opaque error"), every object
// schema below uses `.passthrough()` so new Coinbase response fields don't
// trigger Zod validation failures — forward-compat.
//
// Strict required fields are the ones downstream consumers (CB-3 top-5,
// CB-4 signal-input) actually depend on:
//   * `product_id` — used to filter / key the ranking
//   * candle OHLCV — used for RSI/MA computation
//
// Loose-optional everything else: present in Coinbase docs as of 2026,
// but the wrapper shouldn't crash if Coinbase removes / renames one.

import { z } from "zod";

/**
 * Coinbase Advanced Trade granularity enum for the candles endpoint.
 * Per [Coinbase Advanced Trade public-product-candles docs](https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/public/get-public-product-candles)
 * — 9 string-literal values.
 */
export const GranularitySchema = z.enum([
  "ONE_MINUTE",
  "FIVE_MINUTE",
  "FIFTEEN_MINUTE",
  "THIRTY_MINUTE",
  "ONE_HOUR",
  "TWO_HOUR",
  "FOUR_HOUR",
  "SIX_HOUR",
  "ONE_DAY",
]);

export type Granularity = z.infer<typeof GranularitySchema>;

/** Granularity → seconds. Used by `getProductCandles` range validation. */
export const GRANULARITY_SECONDS: Record<Granularity, number> = {
  ONE_MINUTE: 60,
  FIVE_MINUTE: 5 * 60,
  FIFTEEN_MINUTE: 15 * 60,
  THIRTY_MINUTE: 30 * 60,
  ONE_HOUR: 60 * 60,
  TWO_HOUR: 2 * 60 * 60,
  FOUR_HOUR: 4 * 60 * 60,
  SIX_HOUR: 6 * 60 * 60,
  ONE_DAY: 24 * 60 * 60,
};

/**
 * A single product entry. Two strict-required fields per Coinbase's public
 * product contract:
 *   * `product_id` — downstream consumers key off it
 *   * `volume_24h` — base-currency token count (NOT load-bearing for CB-3's
 *     dollar-volume ranking; see `approximate_quote_24h_volume` below).
 *     Kept required because Coinbase's docs guarantee it; surfaces an API
 *     contract change loudly if Coinbase ever removes it.
 *
 * CB-3's top-5-by-DOLLAR-volume ranking uses `approximate_quote_24h_volume`,
 * defined further down. Empirically discovered during CB-3.1 `/build`
 * 2026-06-08: `volume_24h` is base-currency token count (PEPE has ~10^14
 * tokens traded but ~$80M USD; BTC has ~10^4 tokens but ~$685M USD).
 * Ranking by raw `volume_24h` biases toward meme coins; operator's
 * "currently liquid" intent requires dollar volume. See CB-3 brief +
 * architecture Decision #3 amendments 2026-06-08.
 *
 * Other fields are loose-optional with `.passthrough()` at the object
 * level for forward-compat (CB-2 brief PM Risk #2).
 *
 * Per [Coinbase Get Public Product docs](https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/public/get-public-product),
 * `volume_24h` is a string field consistently returned in the response.
 */
export const ProductSchema = z
  .object({
    product_id: z.string().min(1),
    volume_24h: z.string().min(1),
    base_currency_id: z.string().optional(),
    quote_currency_id: z.string().optional(),
    base_name: z.string().optional(),
    quote_name: z.string().optional(),
    price: z.string().optional(),
    price_percentage_change_24h: z.string().optional(),
    status: z.string().optional(),
    trading_disabled: z.boolean().optional(),
    is_disabled: z.boolean().optional(),
    cancel_only: z.boolean().optional(),
    limit_only: z.boolean().optional(),
    post_only: z.boolean().optional(),
    auction_mode: z.boolean().optional(),
    product_type: z.string().optional(),
    // Coinbase's pre-computed approximate DOLLAR volume (base × price for
    // the trailing 24h). Returned as a string per Coinbase convention.
    // load-bearing for CB-3.1's top-N ranking: `volume_24h` alone is base-
    // currency token count, which biases ranking toward cheap-token meme
    // coins (PEPE-USD has ~10^11 tokens traded but ~$80M USD; BTC-USD has
    // ~10^4 tokens traded but ~$685M USD). Empirically discovered during
    // CB-3.1 `/build` 2026-06-08 — see CB-3 architecture Decision #3
    // amendment in the build commit.
    approximate_quote_24h_volume: z.string().optional(),
  })
  .passthrough();

export type Product = z.infer<typeof ProductSchema>;

/**
 * Envelope returned by `GET /api/v3/brokerage/market/products`.
 * Coinbase wraps the list in `{products, num_products, cursor}` and uses a
 * cursor-based pagination scheme.
 *
 * The `cursor` field is non-empty when more pages remain; empty / missing
 * signals end-of-list. `getProducts()` loops on this.
 */
export const ProductsResponseSchema = z
  .object({
    products: z.array(ProductSchema),
    num_products: z.number().int().nonnegative().optional(),
    cursor: z.string().optional(),
  })
  .passthrough();

export type ProductsResponse = z.infer<typeof ProductsResponseSchema>;

/**
 * A single OHLCV candle. Coinbase returns these as strings (their
 * convention for numeric values in API responses).
 *
 * Per Coinbase docs the field set is fixed; we mark them all required
 * (strict) because the candle is the load-bearing payload for CB-4 signal
 * computation. Still `.passthrough()` so a future trade-count field
 * wouldn't trigger Zod failure.
 */
export const CandleSchema = z
  .object({
    start: z.string().min(1),
    low: z.string().min(1),
    high: z.string().min(1),
    open: z.string().min(1),
    close: z.string().min(1),
    volume: z.string().min(1),
  })
  .passthrough();

export type Candle = z.infer<typeof CandleSchema>;

/**
 * Envelope returned by `GET /api/v3/brokerage/market/products/{product_id}/candles`.
 * Coinbase wraps the list in `{candles}`.
 */
export const CandlesResponseSchema = z
  .object({
    candles: z.array(CandleSchema),
  })
  .passthrough();

export type CandlesResponse = z.infer<typeof CandlesResponseSchema>;

/**
 * Coinbase Advanced Trade's per-request candle cap. Per
 * [Coinbase Get Public Product Candles docs](https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/public/get-public-product-candles)
 * the endpoint returns at most 350 candles per request. If a requested
 * range implies more, `getProductCandles()` throws
 * `CoinbaseClientError({code: "range-too-wide"})` (fail-loud) rather than
 * silently truncating.
 */
export const COINBASE_MAX_CANDLES_PER_REQUEST = 350;

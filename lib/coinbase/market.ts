// Public market data wrappers — `GET /api/v3/brokerage/market/*`.
//
// All three call `coinbase().publicRequest()` from `lib/coinbase/client.ts`
// (CB-2.1). NO JWT path exercised here — these are unauthenticated reads.
// CB-2.3 (`accounts.ts`) is the first story that exercises the auth'd
// request path against `/api/v3/brokerage/*` (where the EdDSA brokerage
// caveat documented in CB-2.1 may bite).
//
// Architectural invariants from CB-2 brief (enforced by tests):
//   * No `LIVE_MODE` reads (verified by `tests/lib/coinbase/no-live-mode.test.ts`)
//   * Zod schemas use `.passthrough()` for forward-compat (CB-2 brief PM Risk #2)
//   * Every error out of this file is a `CoinbaseClientError` (CB-2.1 contract)

import { coinbase } from "./client";
import {
  CandlesResponseSchema,
  GRANULARITY_SECONDS,
  type Candle,
  type Granularity,
  type Product,
  ProductSchema,
  ProductsResponseSchema,
  COINBASE_MAX_CANDLES_PER_REQUEST,
} from "./market-schemas";
import { CoinbaseClientError } from "./types";
import { ZodError } from "zod";

const PRODUCTS_PAGE_LIMIT = 250;

/**
 * List ALL Coinbase Advanced Trade products. Auto-paginates internally;
 * caller sees the full list.
 *
 * Coinbase's `/products` endpoint is cursor-based (default limit 49, max
 * 250). The wrapper requests `limit=250` per page and loops on the
 * response cursor until empty / missing.
 *
 * Consumed by CB-3 for the top-5-by-24h-volume ranking algorithm.
 */
export async function getProducts(): Promise<Product[]> {
  const collected: Product[] = [];
  let cursor: string | undefined;

  while (true) {
    const qs = new URLSearchParams();
    qs.set("limit", String(PRODUCTS_PAGE_LIMIT));
    if (cursor) qs.set("cursor", cursor);

    const raw = await coinbase().publicRequest<unknown>(
      "GET",
      `/api/v3/brokerage/market/products?${qs.toString()}`,
    );

    const parsed = parseOrThrow(ProductsResponseSchema, raw, "products list");
    collected.push(...parsed.products);

    if (!parsed.cursor) break;
    cursor = parsed.cursor;
  }

  return collected;
}

/**
 * Fetch a single product's full detail — includes 24h volume + price stats
 * (used by CB-3 top-5 ranking).
 *
 * Coinbase Advanced Trade v3 does NOT expose a separate stats endpoint;
 * the stats fields are returned by this single-product endpoint. See
 * [CB-2 brief PM DRI Decision](../../docs/bets/CB-2/brief.md#decisions)
 * "market.ts wrapper method renamed getProductStats → getProduct" for the
 * rename rationale.
 */
export async function getProduct(productId: string): Promise<Product> {
  if (!productId) {
    throw new CoinbaseClientError({
      code: "invalid-argument",
      message: "getProduct: productId is required",
    });
  }

  const raw = await coinbase().publicRequest<unknown>(
    "GET",
    `/api/v3/brokerage/market/products/${encodeURIComponent(productId)}`,
  );

  return parseOrThrow(ProductSchema, raw, "product detail");
}

/**
 * Fetch historical OHLCV candles for a product.
 *
 * Coinbase caps candles at 350 per request (per the current Get Public
 * Product Candles docs). If the requested range implies more than that,
 * throws `CoinbaseClientError({code: "range-too-wide"})` — fail-loud beats
 * silent truncation. The exact cap lives in `COINBASE_MAX_CANDLES_PER_REQUEST`
 * in `market-schemas.ts`; this comment narrates the contract at the call
 * site. CB-4's bot tick (every 15 min) reads small lookback windows (~14-30
 * candles for RSI/MA); this guard is for consumer bugs, not normal operation.
 */
export async function getProductCandles(args: {
  productId: string;
  granularity: Granularity;
  start: Date;
  end: Date;
}): Promise<Candle[]> {
  const { productId, granularity, start, end } = args;

  if (!productId) {
    throw new CoinbaseClientError({
      code: "invalid-argument",
      message: "getProductCandles: productId is required",
    });
  }

  const startSec = Math.floor(start.getTime() / 1000);
  const endSec = Math.floor(end.getTime() / 1000);
  if (endSec <= startSec) {
    throw new CoinbaseClientError({
      code: "invalid-argument",
      message: `getProductCandles: end (${endSec}) must be after start (${startSec})`,
    });
  }

  const granularitySeconds = GRANULARITY_SECONDS[granularity];
  const impliedCandles = Math.ceil((endSec - startSec) / granularitySeconds);
  if (impliedCandles > COINBASE_MAX_CANDLES_PER_REQUEST) {
    throw new CoinbaseClientError({
      code: "range-too-wide",
      message:
        `getProductCandles: requested range implies ${impliedCandles} candles ` +
        `at granularity ${granularity}; Coinbase caps responses at ` +
        `${COINBASE_MAX_CANDLES_PER_REQUEST}. Use a coarser granularity or a smaller range.`,
    });
  }

  const qs = new URLSearchParams();
  qs.set("start", String(startSec));
  qs.set("end", String(endSec));
  qs.set("granularity", granularity);

  const raw = await coinbase().publicRequest<unknown>(
    "GET",
    `/api/v3/brokerage/market/products/${encodeURIComponent(productId)}/candles?${qs.toString()}`,
  );

  const parsed = parseOrThrow(CandlesResponseSchema, raw, "product candles");
  return parsed.candles;
}

/**
 * Run a Zod schema's `.parse()` and wrap any failure as a
 * `CoinbaseClientError({code: "validation-failed"})`. Keeps the single-
 * error-type contract from CB-2.1 (every error out of `lib/coinbase/` is
 * a `CoinbaseClientError`).
 */
function parseOrThrow<T>(
  schema: { parse: (x: unknown) => T },
  raw: unknown,
  shapeLabel: string,
): T {
  try {
    return schema.parse(raw);
  } catch (e) {
    if (e instanceof ZodError) {
      const summary = e.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
        .join("; ");
      throw new CoinbaseClientError({
        code: "validation-failed",
        message: `Coinbase ${shapeLabel} response failed schema validation: ${summary}`,
        cause: e,
      });
    }
    throw e;
  }
}

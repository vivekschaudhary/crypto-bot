// Unit tests for `lib/coinbase/market.ts`.
//
// Mocks `coinbase().publicRequest` via `vi.mock("@/lib/coinbase/client", ...)`.
// This is cleaner-layered than mocking `global.fetch` (which is what
// `client.test.ts` does for `client.ts`-level behavior) — here we test the
// wrapper's contract against `publicRequest`, not the wire.

import { beforeEach, describe, expect, it, vi } from "vitest";

const publicRequest = vi.fn();

vi.mock("@/lib/coinbase/client", () => ({
  coinbase: () => ({
    request: vi.fn(),
    publicRequest,
  }),
}));

import {
  getProducts,
  getProduct,
  getProductCandles,
} from "@/lib/coinbase/market";
import { CoinbaseClientError } from "@/lib/coinbase/types";

beforeEach(() => {
  publicRequest.mockReset();
});

describe("getProducts — happy path + pagination", () => {
  it("returns the products array when the response has no cursor (single page)", async () => {
    publicRequest.mockResolvedValueOnce({
      products: [
        { product_id: "BTC-USD", price: "60000", volume_24h: "12345.67" },
        { product_id: "ETH-USD", price: "3000", volume_24h: "5678.9" },
      ],
      num_products: 2,
    });

    const products = await getProducts();

    expect(publicRequest).toHaveBeenCalledTimes(1);
    expect(publicRequest).toHaveBeenCalledWith(
      "GET",
      expect.stringContaining("/api/v3/brokerage/market/products?"),
    );
    const path = publicRequest.mock.calls[0]?.[1] as string;
    expect(path).toContain("limit=250");
    expect(path).not.toContain("cursor=");
    expect(products).toHaveLength(2);
    expect(products[0]?.product_id).toBe("BTC-USD");
  });

  it("auto-paginates and merges when the response carries a cursor", async () => {
    publicRequest
      .mockResolvedValueOnce({
        products: [
          { product_id: "BTC-USD", volume_24h: "12345.67" },
          { product_id: "ETH-USD", volume_24h: "5678.9" },
        ],
        cursor: "next-page-token",
      })
      .mockResolvedValueOnce({
        products: [{ product_id: "SOL-USD", volume_24h: "100.5" }],
        cursor: "",
      });

    const products = await getProducts();

    expect(publicRequest).toHaveBeenCalledTimes(2);
    expect(products.map((p) => p.product_id)).toEqual([
      "BTC-USD",
      "ETH-USD",
      "SOL-USD",
    ]);
    const secondCallPath = publicRequest.mock.calls[1]?.[1] as string;
    expect(secondCallPath).toContain("cursor=next-page-token");
  });

  it("wraps a Zod validation failure as CoinbaseClientError({code: 'validation-failed'})", async () => {
    publicRequest.mockResolvedValueOnce({ products: [{ price: "60000" }] }); // missing product_id + volume_24h

    await expect(getProducts()).rejects.toMatchObject({
      name: "CoinbaseClientError",
      code: "validation-failed",
    });
  });

  it("rejects products missing volume_24h (load-bearing for CB-3 top-5 ranking)", async () => {
    publicRequest.mockResolvedValueOnce({
      products: [{ product_id: "BTC-USD", price: "60000" /* no volume_24h */ }],
    });

    await expect(getProducts()).rejects.toMatchObject({
      name: "CoinbaseClientError",
      code: "validation-failed",
    });
  });
});

describe("getProduct — happy path + validation", () => {
  it("returns the typed product", async () => {
    publicRequest.mockResolvedValueOnce({
      product_id: "BTC-USD",
      base_currency_id: "BTC",
      quote_currency_id: "USD",
      price: "60000",
      volume_24h: "12345.67",
    });

    const product = await getProduct("BTC-USD");

    expect(publicRequest).toHaveBeenCalledWith(
      "GET",
      "/api/v3/brokerage/market/products/BTC-USD",
    );
    expect(product.product_id).toBe("BTC-USD");
    expect(product.volume_24h).toBe("12345.67");
  });

  it("throws on empty productId without hitting the network", async () => {
    await expect(getProduct("")).rejects.toBeInstanceOf(CoinbaseClientError);
    expect(publicRequest).not.toHaveBeenCalled();
  });

  it("wraps Zod validation failure as CoinbaseClientError({code: 'validation-failed'})", async () => {
    publicRequest.mockResolvedValueOnce({ not_a_product: true });

    await expect(getProduct("BTC-USD")).rejects.toMatchObject({
      name: "CoinbaseClientError",
      code: "validation-failed",
    });
  });

  it("rejects a product missing volume_24h (load-bearing for CB-3 top-5 ranking)", async () => {
    publicRequest.mockResolvedValueOnce({
      product_id: "BTC-USD",
      price: "60000" /* no volume_24h */,
    });

    await expect(getProduct("BTC-USD")).rejects.toMatchObject({
      name: "CoinbaseClientError",
      code: "validation-failed",
    });
  });
});

describe("getProductCandles — Date conversion + range validation", () => {
  const makeCandle = (start: string) => ({
    start,
    low: "59000",
    high: "61000",
    open: "60000",
    close: "60500",
    volume: "1.5",
  });

  it("converts Date inputs to Unix-seconds query params", async () => {
    publicRequest.mockResolvedValueOnce({
      candles: [makeCandle("1717689600"), makeCandle("1717693200")],
    });

    const start = new Date("2026-06-06T12:00:00Z");
    const end = new Date("2026-06-06T13:00:00Z");
    const candles = await getProductCandles({
      productId: "BTC-USD",
      granularity: "ONE_HOUR",
      start,
      end,
    });

    expect(publicRequest).toHaveBeenCalledTimes(1);
    const path = publicRequest.mock.calls[0]?.[1] as string;
    expect(path).toContain(`start=${Math.floor(start.getTime() / 1000)}`);
    expect(path).toContain(`end=${Math.floor(end.getTime() / 1000)}`);
    expect(path).toContain("granularity=ONE_HOUR");
    expect(path).toContain("/api/v3/brokerage/market/products/BTC-USD/candles?");
    expect(candles).toHaveLength(2);
  });

  it("throws CoinbaseClientError({code: 'range-too-wide'}) when implied candle count exceeds 350", async () => {
    // 24h at ONE_MINUTE = 1440 candles, well over the 350 cap (per current
    // Coinbase docs; cap lives in COINBASE_MAX_CANDLES_PER_REQUEST).
    const start = new Date("2026-06-06T00:00:00Z");
    const end = new Date("2026-06-07T00:00:00Z");

    await expect(
      getProductCandles({
        productId: "BTC-USD",
        granularity: "ONE_MINUTE",
        start,
        end,
      }),
    ).rejects.toMatchObject({
      name: "CoinbaseClientError",
      code: "range-too-wide",
    });
    expect(publicRequest).not.toHaveBeenCalled();
  });

  it("throws CoinbaseClientError({code: 'invalid-argument'}) when end <= start", async () => {
    const t = new Date("2026-06-06T12:00:00Z");
    await expect(
      getProductCandles({
        productId: "BTC-USD",
        granularity: "ONE_HOUR",
        start: t,
        end: t,
      }),
    ).rejects.toMatchObject({
      name: "CoinbaseClientError",
      code: "invalid-argument",
    });
    expect(publicRequest).not.toHaveBeenCalled();
  });

  it("throws CoinbaseClientError({code: 'invalid-argument'}) on empty productId", async () => {
    await expect(
      getProductCandles({
        productId: "",
        granularity: "ONE_HOUR",
        start: new Date("2026-06-06T12:00:00Z"),
        end: new Date("2026-06-06T13:00:00Z"),
      }),
    ).rejects.toMatchObject({
      name: "CoinbaseClientError",
      code: "invalid-argument",
    });
    expect(publicRequest).not.toHaveBeenCalled();
  });

  it("wraps Zod validation failure as CoinbaseClientError({code: 'validation-failed'})", async () => {
    publicRequest.mockResolvedValueOnce({
      candles: [{ start: "1717689600", low: "59000" /* missing other OHLCV fields */ }],
    });

    await expect(
      getProductCandles({
        productId: "BTC-USD",
        granularity: "ONE_HOUR",
        start: new Date("2026-06-06T12:00:00Z"),
        end: new Date("2026-06-06T13:00:00Z"),
      }),
    ).rejects.toMatchObject({
      name: "CoinbaseClientError",
      code: "validation-failed",
    });
  });
});

describe("URL encoding edge cases", () => {
  it("URL-encodes special characters in productId for getProduct", async () => {
    publicRequest.mockResolvedValueOnce({
      product_id: "FOO/BAR",
      volume_24h: "0",
    });

    await getProduct("FOO/BAR").catch(() => {
      /* schema may fail; we only care about the called URL */
    });

    const path = publicRequest.mock.calls[0]?.[1] as string;
    expect(path).toContain("FOO%2FBAR");
  });

  it("URL-encodes special characters in productId for getProductCandles", async () => {
    publicRequest.mockResolvedValueOnce({ candles: [] });

    await getProductCandles({
      productId: "FOO/BAR",
      granularity: "ONE_HOUR",
      start: new Date("2026-06-06T12:00:00Z"),
      end: new Date("2026-06-06T13:00:00Z"),
    }).catch(() => {
      /* may fail downstream; only care about URL */
    });

    const path = publicRequest.mock.calls[0]?.[1] as string;
    expect(path).toContain("FOO%2FBAR/candles");
  });
});

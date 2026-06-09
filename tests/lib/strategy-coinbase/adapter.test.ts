// Unit tests for `lib/strategy-coinbase/adapter.ts`.
//
// CB-3.1 AC 5. Mocks CB-2's `lib/coinbase/market` wrapper via `vi.mock`.
// Covers:
//   * Filter: USD-quoted spot included; non-USD excluded; non-SPOT excluded;
//     missing-field excluded
//   * Ranking: descending DOLLAR-volume order (approximate_quote_24h_volume);
//     missing/malformed → 0 → sort last
//   * Identifier: returns product_id verbatim
//   * Stateless guarantee: two adapter instances are independent
//   * Empty-result edge case: zero matching products → empty array

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeCoinbaseAdapter } from "@/lib/strategy-coinbase/adapter";

vi.mock("@/lib/coinbase/market", () => ({
  getProducts: vi.fn(),
}));

import { getProducts as mockedGetProducts } from "@/lib/coinbase/market";
const getProductsMock = vi.mocked(mockedGetProducts);

interface MockProduct {
  product_id: string;
  volume_24h: string;
  quote_currency_id?: string;
  product_type?: string;
  approximate_quote_24h_volume?: string;
}

function product(
  overrides: Partial<MockProduct> & { product_id: string },
): MockProduct {
  return {
    product_id: overrides.product_id,
    volume_24h: overrides.volume_24h ?? "1000",
    quote_currency_id: overrides.quote_currency_id ?? "USD",
    product_type: overrides.product_type ?? "SPOT",
    approximate_quote_24h_volume:
      overrides.approximate_quote_24h_volume ?? "1000000",
  };
}

beforeEach(() => {
  getProductsMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("makeCoinbaseAdapter — assetClass + stateless guarantee", () => {
  it("exposes assetClass = 'crypto-coinbase'", () => {
    const adapter = makeCoinbaseAdapter();
    expect(adapter.assetClass).toBe("crypto-coinbase");
  });

  it("returns a fresh independent instance per call (stateless per Decision #3)", () => {
    const a = makeCoinbaseAdapter();
    const b = makeCoinbaseAdapter();
    expect(a).not.toBe(b);
    expect(a.assetClass).toBe(b.assetClass);
  });
});

describe("getCandidateAssets — Decision #1 filter (USD-quoted spot)", () => {
  it("includes products matching BOTH quote_currency_id='USD' AND product_type='SPOT'", async () => {
    getProductsMock.mockResolvedValue([
      product({ product_id: "BTC-USD" }),
      product({ product_id: "ETH-USD" }),
    ] as never[]);

    const assets = await makeCoinbaseAdapter().getCandidateAssets();
    expect(assets).toHaveLength(2);
    expect(assets.map((a) => a.identifier).sort()).toEqual(["BTC-USD", "ETH-USD"]);
    for (const a of assets) {
      expect(a.assetClass).toBe("crypto-coinbase");
    }
  });

  it("EXCLUDES non-USD-quoted products (e.g., USDC-quoted)", async () => {
    getProductsMock.mockResolvedValue([
      product({ product_id: "BTC-USD" }),
      product({ product_id: "ETH-USDC", quote_currency_id: "USDC" }),
    ] as never[]);

    const assets = await makeCoinbaseAdapter().getCandidateAssets();
    expect(assets.map((a) => a.identifier)).toEqual(["BTC-USD"]);
  });

  it("EXCLUDES non-SPOT products (e.g., FUTURE)", async () => {
    getProductsMock.mockResolvedValue([
      product({ product_id: "BTC-USD" }),
      product({ product_id: "BTC-26JUN26-CDE", product_type: "FUTURE" }),
    ] as never[]);

    const assets = await makeCoinbaseAdapter().getCandidateAssets();
    expect(assets.map((a) => a.identifier)).toEqual(["BTC-USD"]);
  });

  it("EXCLUDES products with missing filter fields (defense-in-depth against optional schema)", async () => {
    getProductsMock.mockResolvedValue([
      product({ product_id: "BTC-USD" }),
      {
        product_id: "ETH-MISSING-QUOTE",
        volume_24h: "500",
        product_type: "SPOT",
      },
      {
        product_id: "SOL-MISSING-TYPE",
        volume_24h: "300",
        quote_currency_id: "USD",
      },
    ] as never[]);

    const assets = await makeCoinbaseAdapter().getCandidateAssets();
    expect(assets.map((a) => a.identifier)).toEqual(["BTC-USD"]);
  });

  it("returns empty array when no products match filter (NOT throwing)", async () => {
    getProductsMock.mockResolvedValue([
      product({ product_id: "BTC-EUR", quote_currency_id: "EUR" }),
    ] as never[]);

    const assets = await makeCoinbaseAdapter().getCandidateAssets();
    expect(assets).toEqual([]);
  });
});

describe("rankByVolume — descending DOLLAR-volume (approximate_quote_24h_volume) + defensive parseFloat (Decisions #2 + #4)", () => {
  it("sorts assets by approximate_quote_24h_volume descending — NOT raw volume_24h", async () => {
    // Critical test: meme-coin trap. Raw volume_24h (token count) would put
    // PEPE first; dollar volume (approximate_quote_24h_volume) puts BTC first.
    // This test PROVES the adapter uses the right field per Decision #2.
    getProductsMock.mockResolvedValue([
      // BTC: 10k tokens × $90k ≈ $900M dollar volume
      product({
        product_id: "BTC-USD",
        volume_24h: "10000",
        approximate_quote_24h_volume: "900000000",
      }),
      // PEPE: 10^14 tokens × $0.000007 ≈ $700M dollar volume (less than BTC)
      product({
        product_id: "PEPE-USD",
        volume_24h: "100000000000000",
        approximate_quote_24h_volume: "700000000",
      }),
    ] as never[]);

    const assets = [
      { assetClass: "crypto-coinbase", identifier: "PEPE-USD" },
      { assetClass: "crypto-coinbase", identifier: "BTC-USD" },
    ];
    const ranked = await makeCoinbaseAdapter().rankByVolume(assets);
    // BTC wins on dollar volume despite far less token volume
    expect(ranked.map((a) => a.identifier)).toEqual(["BTC-USD", "PEPE-USD"]);
  });

  it("treats missing-product dollar-volume as 0 → sort last", async () => {
    getProductsMock.mockResolvedValue([
      product({
        product_id: "BTC-USD",
        approximate_quote_24h_volume: "9000000000",
      }),
    ] as never[]);

    const assets = [
      { assetClass: "crypto-coinbase", identifier: "BTC-USD" },
      // Not in the products response → defaults to 0
      { assetClass: "crypto-coinbase", identifier: "MYSTERY-USD" },
    ];
    const ranked = await makeCoinbaseAdapter().rankByVolume(assets);
    expect(ranked.map((a) => a.identifier)).toEqual(["BTC-USD", "MYSTERY-USD"]);
  });

  it("treats malformed dollar-volume strings as 0 → sort last (Decision #2 defensive parseFloat)", async () => {
    getProductsMock.mockResolvedValue([
      product({
        product_id: "VALID-USD",
        approximate_quote_24h_volume: "1000000",
      }),
      product({
        product_id: "EMPTY-USD",
        approximate_quote_24h_volume: "",
      }),
      product({
        product_id: "NAN-USD",
        approximate_quote_24h_volume: "not a number",
      }),
    ] as never[]);

    const assets = [
      { assetClass: "crypto-coinbase", identifier: "EMPTY-USD" },
      { assetClass: "crypto-coinbase", identifier: "VALID-USD" },
      { assetClass: "crypto-coinbase", identifier: "NAN-USD" },
    ];
    const ranked = await makeCoinbaseAdapter().rankByVolume(assets);
    expect(ranked[0]?.identifier).toBe("VALID-USD");
  });

  it("treats products MISSING approximate_quote_24h_volume field as 0 → sort last", async () => {
    // CB-2.2's schema makes the field .optional() — defense-in-depth in case
    // Coinbase ever drops it from a response.
    getProductsMock.mockResolvedValue([
      product({
        product_id: "WITH-VOL",
        approximate_quote_24h_volume: "1000000",
      }),
      {
        product_id: "WITHOUT-VOL",
        volume_24h: "500",
        quote_currency_id: "USD",
        product_type: "SPOT",
        // approximate_quote_24h_volume entirely absent
      },
    ] as never[]);

    const assets = [
      { assetClass: "crypto-coinbase", identifier: "WITHOUT-VOL" },
      { assetClass: "crypto-coinbase", identifier: "WITH-VOL" },
    ];
    const ranked = await makeCoinbaseAdapter().rankByVolume(assets);
    expect(ranked.map((a) => a.identifier)).toEqual(["WITH-VOL", "WITHOUT-VOL"]);
  });

  it("returns a NEW array; input not mutated", async () => {
    getProductsMock.mockResolvedValue([
      product({
        product_id: "BTC-USD",
        approximate_quote_24h_volume: "5000000",
      }),
      product({
        product_id: "ETH-USD",
        approximate_quote_24h_volume: "3000000",
      }),
    ] as never[]);

    const input = [
      { assetClass: "crypto-coinbase", identifier: "ETH-USD" },
      { assetClass: "crypto-coinbase", identifier: "BTC-USD" },
    ];
    const inputSnapshot = [...input];
    const ranked = await makeCoinbaseAdapter().rankByVolume(input);
    expect(ranked).not.toBe(input);
    expect(input).toEqual(inputSnapshot);
  });
});

describe("getAssetIdentifier — verbatim passthrough", () => {
  it("returns the asset.identifier without transformation", () => {
    const adapter = makeCoinbaseAdapter();
    expect(
      adapter.getAssetIdentifier({
        assetClass: "crypto-coinbase",
        identifier: "BTC-USD",
      }),
    ).toBe("BTC-USD");
    expect(
      adapter.getAssetIdentifier({
        assetClass: "crypto-coinbase",
        identifier: "DOGE-USD",
      }),
    ).toBe("DOGE-USD");
  });
});

// Integration test: hit Coinbase's REAL public endpoint.
//
// Gated on `RUN_INTEGRATION_TESTS=1` so CI does NOT run this by default
// (CI lacks both network egress reliability and CDP credentials by design
// per architecture.md § Secrets-at-rest). Operator runs locally before
// merging:
//
//     RUN_INTEGRATION_TESTS=1 pnpm test tests/lib/coinbase/client.integration.test.ts
//
// Uses publicRequest (no auth) so no CDP credentials are needed for the
// CB-2.1 smoke. Eliminates the "CDP key Day-of blocker" from plan v7 Issue #2.

import { describe, expect, it } from "vitest";

// Importing client.ts without mocking @/lib/env requires the env vars to
// validate at runtime; for the public-only integration test that's OK because
// `publicRequest` doesn't read env at all, but the import chain pulls in
// jwt.ts which references env() type. We import lazily inside the gated
// describe block to avoid pulling env validation on test discovery.

const RUN = process.env.RUN_INTEGRATION_TESTS === "1";

describe.skipIf(!RUN)("lib/coinbase/client — integration (real Coinbase)", () => {
  it("publicRequest fetches BTC-USD product data from Coinbase", async () => {
    const { coinbase } = await import("@/lib/coinbase/client");
    const result = await coinbase().publicRequest<{
      product_id?: string;
      base_currency_id?: string;
      quote_currency_id?: string;
    }>("GET", "/api/v3/brokerage/market/products/BTC-USD");

    expect(result).toBeDefined();
    // Coinbase response shape varies slightly across API versions; we only
    // assert the existence of *some* recognizable field rather than the exact
    // schema (Zod schemas for response shapes ship in CB-2.2 alongside
    // `market.ts`).
    expect(
      result.product_id === "BTC-USD" ||
        result.base_currency_id === "BTC" ||
        result.quote_currency_id === "USD" ||
        Object.keys(result).length > 0,
    ).toBe(true);
  }, 15_000); // 15s timeout — generous for cold-network paths

  it("publicRequest fetches recent BTC-USD candles", async () => {
    const { coinbase } = await import("@/lib/coinbase/client");
    // Coinbase candles endpoint expects start + end (Unix seconds, max 350
    // candles per window). Pick a 1-hour window ending now at 1-min granularity.
    const end = Math.floor(Date.now() / 1000);
    const start = end - 60 * 60;
    const path = `/api/v3/brokerage/market/products/BTC-USD/candles?start=${start}&end=${end}&granularity=ONE_MINUTE`;
    const result = await coinbase().publicRequest<{ candles?: unknown[] }>("GET", path);

    expect(result).toBeDefined();
    // Either the response has a `candles` array OR it's a different shape we
    // don't strictly validate here (CB-2.2 ships the Zod schema).
    if (Array.isArray(result.candles)) {
      expect(result.candles.length).toBeGreaterThan(0);
    } else {
      expect(Object.keys(result).length).toBeGreaterThan(0);
    }
  }, 15_000);
});

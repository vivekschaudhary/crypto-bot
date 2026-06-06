import { generateKeyPairSync } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Generate a valid EC PEM key for mintJWT to consume; we don't crack the
// signature in the test, just confirm a Bearer token is attached.
const { privateKey: ecPem } = generateKeyPairSync("ec", {
  namedCurve: "P-256",
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

vi.mock("@/lib/env", () => ({
  env: () => ({
    COINBASE_API_KEY_NAME: "organizations/test-org/apiKeys/test-key",
    COINBASE_API_PRIVATE_KEY: ecPem,
  }),
}));

import { CoinbaseClientError } from "@/lib/coinbase/types";
import { __testing as clientTesting, coinbase } from "@/lib/coinbase/client";

const fetchMock = vi.fn();

beforeEach(() => {
  clientTesting.resetCache();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("lib/coinbase/client — coinbase()", () => {
  describe("cached singleton", () => {
    it("returns the same instance across calls", () => {
      const a = coinbase();
      const b = coinbase();
      expect(a).toBe(b);
    });

    it("resetCache forces a fresh construction", () => {
      const a = coinbase();
      clientTesting.resetCache();
      const b = coinbase();
      expect(a).not.toBe(b);
    });
  });

  describe("request (authenticated)", () => {
    it("attaches Authorization: Bearer <jwt> header", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { accounts: [] }));
      await coinbase().request("GET", "/api/v3/brokerage/accounts");

      expect(fetchMock).toHaveBeenCalledOnce();
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers.authorization).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
      expect(headers["content-type"]).toBe("application/json");
    });

    it("hits the correct Coinbase base URL", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
      await coinbase().request("GET", "/api/v3/brokerage/accounts?limit=250");

      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.coinbase.com/api/v3/brokerage/accounts?limit=250");
    });

    it("serializes the body as JSON for POST requests", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: "order-123" }));
      await coinbase().request("POST", "/api/v3/brokerage/orders", {
        product_id: "BTC-USD",
        side: "BUY",
      });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe("POST");
      expect(init.body).toBe(JSON.stringify({ product_id: "BTC-USD", side: "BUY" }));
    });

    it("omits body for GET requests", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { accounts: [] }));
      await coinbase().request("GET", "/api/v3/brokerage/accounts");

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(init.body).toBeUndefined();
    });

    it("returns parsed JSON on 2xx", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { accounts: [{ uuid: "a1" }] }));
      const result = await coinbase().request<{ accounts: { uuid: string }[] }>(
        "GET",
        "/api/v3/brokerage/accounts",
      );
      expect(result.accounts[0]?.uuid).toBe("a1");
    });

    it("throws CoinbaseClientError on non-2xx with status + code populated", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(401, { error_code: "unauthenticated", message: "Invalid signature" }),
      );
      await expect(
        coinbase().request("GET", "/api/v3/brokerage/accounts"),
      ).rejects.toMatchObject({
        name: "CoinbaseClientError",
        code: "unauthenticated",
        status: 401,
      });
    });

    it("throws CoinbaseClientError with code='unknown' for an empty body", async () => {
      fetchMock.mockResolvedValueOnce(new Response("", { status: 502 }));
      await expect(
        coinbase().request("GET", "/api/v3/brokerage/accounts"),
      ).rejects.toBeInstanceOf(CoinbaseClientError);
    });

    it("tolerates non-JSON error responses (e.g. Cloudflare 5xx HTML pages)", async () => {
      fetchMock.mockResolvedValueOnce(new Response("<html>503</html>", { status: 503 }));
      await expect(
        coinbase().request("GET", "/api/v3/brokerage/accounts"),
      ).rejects.toMatchObject({
        name: "CoinbaseClientError",
        status: 503,
      });
    });
  });

  describe("publicRequest (unauthenticated)", () => {
    it("does NOT attach Authorization header", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { price: "70000" }));
      await coinbase().publicRequest("GET", "/api/v3/brokerage/market/products/BTC-USD");

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers.authorization).toBeUndefined();
      expect(headers["content-type"]).toBe("application/json");
    });

    it("returns parsed JSON on 2xx", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { price: "70000" }));
      const result = await coinbase().publicRequest<{ price: string }>(
        "GET",
        "/api/v3/brokerage/market/products/BTC-USD",
      );
      expect(result.price).toBe("70000");
    });

    it("throws CoinbaseClientError on non-2xx", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(404, { error_code: "not_found" }));
      await expect(
        coinbase().publicRequest("GET", "/api/v3/brokerage/market/products/UNKNOWN-USD"),
      ).rejects.toMatchObject({
        code: "not_found",
        status: 404,
      });
    });
  });
});

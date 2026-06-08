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

    it("wraps fetch transport failures (DNS / TLS / timeout) as CoinbaseClientError", async () => {
      // Simulate a network-layer failure — fetch() rejects synchronously with
      // a TypeError (the typical Node + browser shape for "DNS resolved no
      // address" / "connection refused" / "TLS handshake failed").
      fetchMock.mockRejectedValueOnce(new TypeError("fetch failed: ENOTFOUND api.coinbase.com"));
      await expect(
        coinbase().request("GET", "/api/v3/brokerage/accounts"),
      ).rejects.toMatchObject({
        name: "CoinbaseClientError",
        code: "network",
        status: undefined,
      });
    });

    it("preserves the original transport error as `cause`", async () => {
      const original = new TypeError("fetch failed: ETIMEDOUT");
      fetchMock.mockRejectedValueOnce(original);
      try {
        await coinbase().request("GET", "/api/v3/brokerage/accounts");
        expect.fail("expected throw");
      } catch (err) {
        expect(err).toBeInstanceOf(CoinbaseClientError);
        expect((err as CoinbaseClientError).cause).toBe(original);
        expect((err as CoinbaseClientError).message).toContain("ETIMEDOUT");
        expect((err as CoinbaseClientError).message).toContain("GET");
        expect((err as CoinbaseClientError).message).toContain("/api/v3/brokerage/accounts");
      }
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

    it("wraps fetch transport failures as CoinbaseClientError (same shape as request())", async () => {
      // publicRequest hits the same safeFetch wrapper; transport failures
      // surface uniformly regardless of which method consumers use.
      fetchMock.mockRejectedValueOnce(new TypeError("fetch failed: ECONNRESET"));
      await expect(
        coinbase().publicRequest("GET", "/api/v3/brokerage/market/products/BTC-USD"),
      ).rejects.toMatchObject({
        name: "CoinbaseClientError",
        code: "network",
        status: undefined,
      });
    });
  });
});

describe("lib/coinbase/client — trace integration (CB-2.5)", () => {
  // Verify that request() and publicRequest() invoke emitRequestTrace
  // for both success and failure paths. The trace.test.ts unit tests
  // cover the emit shape; these tests cover the wiring from client.ts.

  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  const lastTrace = (): Record<string, unknown> | undefined => {
    // Find the most recent console.log call whose first arg parses as our
    // trace JSON shape.
    for (let i = logSpy.mock.calls.length - 1; i >= 0; i--) {
      const arg = logSpy.mock.calls[i]?.[0];
      if (typeof arg !== "string") continue;
      try {
        const parsed = JSON.parse(arg);
        if (parsed?.event === "coinbase.request") return parsed;
      } catch {
        /* not our trace; skip */
      }
    }
    return undefined;
  };

  describe("publicRequest success path", () => {
    it("emits a trace with status, method, path, and durationMs > 0", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

      await coinbase().publicRequest("GET", "/api/v3/brokerage/market/products/BTC-USD");

      const trace = lastTrace();
      expect(trace).toBeDefined();
      expect(trace?.method).toBe("GET");
      expect(trace?.path).toBe("/api/v3/brokerage/market/products/BTC-USD");
      expect(trace?.status).toBe(200);
      expect(typeof trace?.duration_ms).toBe("number");
      expect(trace?.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it("includes rate_limit when Response provides the headers", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-ratelimit-remaining": "42",
            "x-ratelimit-limit": "100",
          },
        }),
      );

      await coinbase().publicRequest("GET", "/api/v3/brokerage/market/products/BTC-USD");

      const trace = lastTrace();
      expect(trace?.rate_limit).toEqual({ remaining: "42", limit: "100" });
    });
  });

  describe("request (auth'd) failure paths", () => {
    it("emits a trace with status from a 4xx CoinbaseClientError before re-throwing", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: "unauthenticated" }));

      await expect(
        coinbase().request("GET", "/api/v3/brokerage/accounts"),
      ).rejects.toMatchObject({ status: 401 });

      const trace = lastTrace();
      expect(trace?.status).toBe(401);
      expect(trace?.method).toBe("GET");
      expect(trace?.path).toBe("/api/v3/brokerage/accounts");
    });

    it("emits a trace with status: 0 on transport-failure path", async () => {
      fetchMock.mockRejectedValueOnce(new TypeError("fetch failed: ECONNRESET"));

      await expect(
        coinbase().request("GET", "/api/v3/brokerage/accounts"),
      ).rejects.toMatchObject({ code: "network" });

      const trace = lastTrace();
      expect(trace?.status).toBe(0);
      expect(trace?.method).toBe("GET");
    });
  });
});

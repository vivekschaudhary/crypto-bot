import { describe, expect, it } from "vitest";

import { CoinbaseClientError } from "@/lib/coinbase/types";

describe("lib/coinbase/types — CoinbaseClientError", () => {
  describe("constructor", () => {
    it("sets name + code + message + status + cause", () => {
      const cause = new Error("inner");
      const err = new CoinbaseClientError({
        code: "rate_limited",
        message: "Too many requests",
        status: 429,
        cause,
      });
      expect(err.name).toBe("CoinbaseClientError");
      expect(err.message).toBe("Too many requests");
      expect(err.code).toBe("rate_limited");
      expect(err.status).toBe(429);
      expect(err.cause).toBe(cause);
      expect(err).toBeInstanceOf(Error);
    });

    it("allows optional status + cause", () => {
      const err = new CoinbaseClientError({ code: "network", message: "Fetch failed" });
      expect(err.code).toBe("network");
      expect(err.status).toBeUndefined();
      expect(err.cause).toBeUndefined();
    });
  });

  describe("fromHttpResponse", () => {
    it("extracts code from { error_code } body shape", () => {
      const err = CoinbaseClientError.fromHttpResponse({
        method: "GET",
        path: "/api/v3/brokerage/accounts",
        status: 401,
        body: { error_code: "unauthenticated" },
      });
      expect(err.code).toBe("unauthenticated");
      expect(err.status).toBe(401);
      expect(err.message).toContain("GET");
      expect(err.message).toContain("/api/v3/brokerage/accounts");
      expect(err.message).toContain("401");
    });

    it("extracts code from { error } body shape when error_code absent", () => {
      const err = CoinbaseClientError.fromHttpResponse({
        method: "POST",
        path: "/api/v3/brokerage/orders",
        status: 400,
        body: { error: "invalid_request" },
      });
      expect(err.code).toBe("invalid_request");
      expect(err.status).toBe(400);
    });

    it("appends body.message to the error message when present", () => {
      const err = CoinbaseClientError.fromHttpResponse({
        method: "GET",
        path: "/api/v3/brokerage/accounts",
        status: 401,
        body: { error: "unauthenticated", message: "Invalid signature" },
      });
      expect(err.message).toContain("Invalid signature");
    });

    it("appends body.error_description when message absent (OAuth-style shape)", () => {
      const err = CoinbaseClientError.fromHttpResponse({
        method: "POST",
        path: "/api/v3/brokerage/orders",
        status: 400,
        body: { error_code: "bad_request", error_description: "Missing field: side" },
      });
      expect(err.message).toContain("Missing field: side");
    });

    it("defaults code to 'unknown' when body has no recognized error fields", () => {
      const err = CoinbaseClientError.fromHttpResponse({
        method: "GET",
        path: "/api/v3/brokerage/accounts",
        status: 500,
        body: { foo: "bar" },
      });
      expect(err.code).toBe("unknown");
      expect(err.status).toBe(500);
    });

    it("defaults code to 'unknown' when body is undefined (empty response)", () => {
      const err = CoinbaseClientError.fromHttpResponse({
        method: "GET",
        path: "/api/v3/brokerage/accounts",
        status: 502,
        body: undefined,
      });
      expect(err.code).toBe("unknown");
      expect(err.status).toBe(502);
    });

    it("defaults code to 'unknown' when body is a string (non-JSON response)", () => {
      const err = CoinbaseClientError.fromHttpResponse({
        method: "GET",
        path: "/api/v3/brokerage/accounts",
        status: 503,
        body: "Service Unavailable",
      });
      expect(err.code).toBe("unknown");
      expect(err.status).toBe(503);
    });

    it("preserves the original body as `cause` for trace-up debugging", () => {
      const body = { error_code: "rate_limited", retry_after: 30 };
      const err = CoinbaseClientError.fromHttpResponse({
        method: "GET",
        path: "/api/v3/brokerage/accounts",
        status: 429,
        body,
      });
      expect(err.cause).toBe(body);
    });

    it("is idempotent when body is already a CoinbaseClientError", () => {
      const original = new CoinbaseClientError({
        code: "pre_wrapped",
        message: "Already wrapped",
        status: 500,
      });
      const result = CoinbaseClientError.fromHttpResponse({
        method: "GET",
        path: "/api/v3/brokerage/accounts",
        status: 500,
        body: original,
      });
      expect(result).toBe(original);
    });

    it("rejects non-string fields in body (defensive against malicious responses)", () => {
      const err = CoinbaseClientError.fromHttpResponse({
        method: "GET",
        path: "/api/v3/brokerage/accounts",
        status: 400,
        body: { error_code: { nested: "object" }, error: 42, message: ["arr"] },
      });
      // None of the fields are strings, so code falls back to "unknown" and
      // message stays at the default (no appended message text).
      expect(err.code).toBe("unknown");
      expect(err.message).not.toContain("nested");
      expect(err.message).not.toContain("42");
    });
  });
});

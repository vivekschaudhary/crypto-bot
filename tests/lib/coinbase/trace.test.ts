// Unit tests for `lib/coinbase/trace.ts`.
//
// Mocks `console.log` and `console.error` via `vi.spyOn` to verify the
// emit shape + defensive fallback behavior. Verifies:
//   * Trace JSON shape (event, method, path, status, duration_ms)
//   * Rate-limit headers included when populated
//   * Rate-limit OMITTED entirely when undefined (cleaner queryability)
//   * Sensitive-data hygiene: no body content in emit
//   * Defensive emit: never throws even if console.log itself errors
//   * extractRateLimit case-insensitive lookup + alternative header names

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { emitRequestTrace, extractRateLimit } from "@/lib/coinbase/trace";

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
  errorSpy.mockRestore();
});

describe("emitRequestTrace — JSON shape", () => {
  it("emits one console.log line with the documented event shape", () => {
    emitRequestTrace({
      method: "GET",
      path: "/api/v3/brokerage/accounts",
      status: 200,
      durationMs: 123,
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const arg = logSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(arg);
    expect(parsed).toEqual({
      event: "coinbase.request",
      method: "GET",
      path: "/api/v3/brokerage/accounts",
      status: 200,
      duration_ms: 123,
    });
  });

  it("includes rate_limit when populated", () => {
    emitRequestTrace({
      method: "POST",
      path: "/api/v3/brokerage/orders",
      status: 200,
      durationMs: 80,
      rateLimit: { remaining: "99", limit: "100" },
    });

    const arg = logSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(arg);
    expect(parsed.rate_limit).toEqual({ remaining: "99", limit: "100" });
  });

  it("OMITS rate_limit entirely when not provided (clean queryability)", () => {
    emitRequestTrace({
      method: "GET",
      path: "/api/v3/brokerage/market/products/BTC-USD",
      status: 200,
      durationMs: 50,
    });

    const arg = logSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(arg);
    expect(parsed).not.toHaveProperty("rate_limit");
  });

  it("status: 0 for transport-failure paths is preserved", () => {
    emitRequestTrace({
      method: "GET",
      path: "/api/v3/brokerage/accounts",
      status: 0,
      durationMs: 25,
    });

    const arg = logSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(arg);
    expect(parsed.status).toBe(0);
  });
});

describe("emitRequestTrace — sensitive-data hygiene (anti-echo)", () => {
  it("emit shape contains ONLY envelope metadata — never request body content", () => {
    // Caller has no way to even pass body content into emitRequestTrace
    // (its signature accepts only {method, path, status, durationMs,
    // rateLimit?}). This test makes that invariant explicit: the emitted
    // JSON must NEVER contain order/balance/body fields.
    emitRequestTrace({
      method: "POST",
      path: "/api/v3/brokerage/orders",
      status: 200,
      durationMs: 50,
    });

    const arg = logSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(arg);
    const stringified = JSON.stringify(parsed);
    // Sensitive field names that MUST NEVER appear in trace output:
    expect(stringified).not.toContain("body");
    expect(stringified).not.toContain("client_order_id");
    expect(stringified).not.toContain("limit_price");
    expect(stringified).not.toContain("base_size");
    expect(stringified).not.toContain("available_balance");
    expect(stringified).not.toContain("price");
    expect(stringified).not.toContain("size");
    // Only the documented envelope fields:
    expect(Object.keys(parsed).sort()).toEqual([
      "duration_ms",
      "event",
      "method",
      "path",
      "status",
    ]);
  });
});

describe("emitRequestTrace — defensive (never throws)", () => {
  it("falls back to console.error when console.log throws; does NOT re-throw", () => {
    logSpy.mockImplementation(() => {
      throw new Error("simulated console.log failure");
    });

    expect(() =>
      emitRequestTrace({
        method: "GET",
        path: "/api/v3/brokerage/accounts",
        status: 200,
        durationMs: 50,
      }),
    ).not.toThrow();

    // The fallback should have logged something to console.error
    expect(errorSpy).toHaveBeenCalled();
    const errorArg = errorSpy.mock.calls[0]?.[0] as string;
    expect(errorArg).toContain("[coinbase.trace] emit failed");
  });
});

describe("extractRateLimit — case-insensitive lookup with alternatives", () => {
  it("finds standard `x-ratelimit-*` headers", () => {
    const headers = new Headers({
      "x-ratelimit-remaining": "99",
      "x-ratelimit-limit": "100",
      "x-ratelimit-reset": "1700000000",
    });
    expect(extractRateLimit(headers)).toEqual({
      remaining: "99",
      limit: "100",
      reset: "1700000000",
    });
  });

  it("returns undefined when no rate-limit headers are present", () => {
    const headers = new Headers({
      "content-type": "application/json",
      "cf-cache-status": "DYNAMIC",
    });
    expect(extractRateLimit(headers)).toBeUndefined();
  });

  it("populates partial RateLimit when only some headers are present", () => {
    const headers = new Headers({ "x-ratelimit-remaining": "42" });
    expect(extractRateLimit(headers)).toEqual({ remaining: "42" });
  });

  it("falls back to alternative naming conventions (e.g., ratelimit-remaining without x- prefix)", () => {
    const headers = new Headers({
      "ratelimit-remaining": "75",
      "ratelimit-limit": "150",
    });
    expect(extractRateLimit(headers)).toEqual({
      remaining: "75",
      limit: "150",
    });
  });

  it("tolerates case differences via Headers.get (RFC-compliant header lookup)", () => {
    // Headers.get is case-insensitive per Fetch spec — verify our usage
    // doesn't introduce case sensitivity.
    const headers = new Headers({ "X-RateLimit-Remaining": "10" });
    expect(extractRateLimit(headers)).toEqual({ remaining: "10" });
  });
});

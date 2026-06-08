// Integration test for trace emission against the REAL Coinbase API.
//
// Double-gated (RUN_INTEGRATION_TESTS=1 + CDP credentials). No
// RUN_REAL_ORDER_TESTS gate needed — this test only does reads.
//
// LOAD-BEARING: resolves CB-2 brief Researcher Open Question #1
// (rate-limit headers). The test makes real public + auth'd + 4xx
// requests, captures the emitted trace JSON via console.log spy, AND
// logs ALL response headers so the Engineer can:
//   1. Confirm what (if any) rate-limit header names Coinbase actually
//      returns on Advanced Trade v3 endpoints
//   2. Extend `extractRateLimit`'s lookup list if a non-obvious
//      Coinbase-specific name surfaces empirically
//
// Operator runs locally via the new test:integration script:
//
//     RUN_INTEGRATION_TESTS=1 pnpm test:integration \
//       tests/lib/coinbase/trace.integration.test.ts
//
// The "observed headers" lines printed during the test run are the
// PRIMARY OUTPUT — they document Coinbase's actual response shape and
// drive the Researcher #1 closure entry in the CB-2 brief.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const RUN = process.env.RUN_INTEGRATION_TESTS === "1";
const HAS_CREDS = Boolean(
  process.env.COINBASE_API_KEY_NAME && process.env.COINBASE_API_PRIVATE_KEY,
);

if (RUN && !HAS_CREDS) {
  console.log(
    "[trace.integration] Skipping: RUN_INTEGRATION_TESTS=1 but " +
      "COINBASE_API_KEY_NAME or COINBASE_API_PRIVATE_KEY missing. Add to " +
      ".env.local and run via `pnpm test:integration`.",
  );
}

describe.skipIf(!RUN || !HAS_CREDS)(
  "lib/coinbase/trace — integration (real Coinbase responses)",
  () => {
    // Spy on console.log to capture traces; allow pass-through so the
    // operator still sees the diagnostic header output we're emitting.
    let logSpy: ReturnType<typeof vi.spyOn>;
    const originalLog = console.log.bind(console);

    beforeEach(() => {
      logSpy = vi.spyOn(console, "log").mockImplementation((...args) => {
        originalLog(...args);
      });
    });

    afterEach(() => {
      logSpy.mockRestore();
    });

    const findLastTrace = (): Record<string, unknown> | undefined => {
      for (let i = logSpy.mock.calls.length - 1; i >= 0; i--) {
        const arg = logSpy.mock.calls[i]?.[0];
        if (typeof arg !== "string") continue;
        try {
          const parsed = JSON.parse(arg);
          if (parsed?.event === "coinbase.request") return parsed;
        } catch {
          /* skip non-JSON log lines */
        }
      }
      return undefined;
    };

    it("public request (getProduct BTC-USD) emits a trace; observe rate-limit headers", async () => {
      // Patch fetch transiently to capture response headers BEFORE
      // client.ts consumes them. This is the load-bearing observation
      // for Researcher #1.
      const originalFetch = global.fetch;
      let capturedHeaders: Record<string, string> | undefined;
      global.fetch = (async (...args: Parameters<typeof fetch>) => {
        const res = await originalFetch(...args);
        // Clone so the body can still be read by client.ts
        capturedHeaders = Object.fromEntries(res.headers.entries());
        return res;
      }) as typeof fetch;

      try {
        const { getProduct } = await import("@/lib/coinbase/market");
        await getProduct("BTC-USD");

        const trace = findLastTrace();
        expect(trace).toBeDefined();
        expect(trace?.method).toBe("GET");
        expect(trace?.status).toBe(200);
        expect(typeof trace?.duration_ms).toBe("number");
        expect(trace?.duration_ms).toBeGreaterThan(0);

        // PRIMARY OUTPUT — Researcher #1 resolution data
        originalLog(
          "\n[trace.integration] PUBLIC ENDPOINT — observed response headers:",
        );
        originalLog(JSON.stringify(capturedHeaders, null, 2));
        originalLog(
          "[trace.integration] trace.rate_limit captured:",
          trace?.rate_limit ?? "(not populated)",
        );
      } finally {
        global.fetch = originalFetch;
      }
    }, 30_000);

    it("auth'd request (getAccountBalances) emits a trace; observe rate-limit headers", async () => {
      const originalFetch = global.fetch;
      let capturedHeaders: Record<string, string> | undefined;
      global.fetch = (async (...args: Parameters<typeof fetch>) => {
        const res = await originalFetch(...args);
        capturedHeaders = Object.fromEntries(res.headers.entries());
        return res;
      }) as typeof fetch;

      try {
        const { getAccountBalances } = await import("@/lib/coinbase/accounts");
        await getAccountBalances();

        const trace = findLastTrace();
        expect(trace).toBeDefined();
        expect(trace?.method).toBe("GET");
        expect(trace?.status).toBe(200);

        originalLog(
          "\n[trace.integration] AUTH'D BROKERAGE ENDPOINT — observed response headers:",
        );
        originalLog(JSON.stringify(capturedHeaders, null, 2));
        originalLog(
          "[trace.integration] trace.rate_limit captured:",
          trace?.rate_limit ?? "(not populated)",
        );
      } finally {
        global.fetch = originalFetch;
      }
    }, 30_000);

    it("auth'd 4xx (getAccount with invalid uuid) emits a trace with the 4xx status", async () => {
      const { getAccount } = await import("@/lib/coinbase/accounts");

      // Coinbase returns a 4xx (likely 400 or 404) for an unparseable uuid
      // path segment. We don't care which specific 4xx — only that the
      // trace captures the actual status.
      await expect(
        getAccount("not-a-real-uuid-aaaa-bbbb-cccc-dddddddddddd"),
      ).rejects.toMatchObject({ name: "CoinbaseClientError" });

      const trace = findLastTrace();
      expect(trace).toBeDefined();
      expect(trace?.method).toBe("GET");
      expect(typeof trace?.status).toBe("number");
      expect(trace?.status as number).toBeGreaterThanOrEqual(400);
      expect(trace?.status as number).toBeLessThan(500);
    }, 30_000);
  },
);

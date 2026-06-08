// Integration test: hit Coinbase's REAL auth'd brokerage endpoints.
//
// Double-gated:
//   1. RUN_INTEGRATION_TESTS=1 (CI lacks reliable network egress + by design
//      doesn't carry CDP credentials per architecture.md § Secrets-at-rest)
//   2. CDP credentials present (COINBASE_API_KEY_NAME + COINBASE_API_PRIVATE_KEY)
//
// Operator runs locally before merging via the new package.json script:
//
//     RUN_INTEGRATION_TESTS=1 pnpm test:integration \
//       tests/lib/coinbase/accounts.integration.test.ts
//
// The `test:integration` script wraps the run with
// `node --env-file-if-exists=.env.local` so .env.local's CDP creds load
// automatically (mirrors the db:migrate pattern).
//
// LOAD-BEARING: This is the FIRST end-to-end exercise of the JWT brokerage
// path. Per CB-2.1's EdDSA brokerage caveat, the outcome of these tests
// drives Engineer DRI Decision #8 (resolution status: pass / fail-eddsa /
// fail-other).

import { describe, expect, it } from "vitest";

const RUN = process.env.RUN_INTEGRATION_TESTS === "1";
const HAS_CREDS = Boolean(
  process.env.COINBASE_API_KEY_NAME && process.env.COINBASE_API_PRIVATE_KEY,
);

if (RUN && !HAS_CREDS) {
  console.log(
    "[accounts.integration] Skipping: RUN_INTEGRATION_TESTS=1 but " +
      "COINBASE_API_KEY_NAME or COINBASE_API_PRIVATE_KEY missing from env. " +
      "Add them to .env.local and run via `pnpm test:integration`.",
  );
}

describe.skipIf(!RUN || !HAS_CREDS)(
  "lib/coinbase/accounts — integration (real Coinbase auth'd reads)",
  () => {
    it("getAccountBalances() returns at least 1 account; each has uuid + parseable available_balance", async () => {
      const { getAccountBalances } = await import("@/lib/coinbase/accounts");
      const accounts = await getAccountBalances();

      // The operator has at least one account (the default fiat one).
      expect(accounts.length).toBeGreaterThanOrEqual(1);

      // Every account has the documented-required fields with parseable values.
      for (const account of accounts.slice(0, 5)) {
        expect(account.uuid).toBeTruthy();
        expect(account.currency).toBeTruthy();
        expect(account.available_balance.value).toBeTruthy();
        expect(account.available_balance.currency).toBeTruthy();
        const parsed = Number(account.available_balance.value);
        expect(Number.isFinite(parsed)).toBe(true);
        expect(parsed).toBeGreaterThanOrEqual(0);
      }
    }, 30_000);

    it("getAccount(uuid) returns the same shape as getAccountBalances()'s entries", async () => {
      const { getAccountBalances, getAccount } = await import(
        "@/lib/coinbase/accounts"
      );
      const accounts = await getAccountBalances();
      const first = accounts[0];
      expect(first).toBeDefined();

      const single = await getAccount(first!.uuid);
      expect(single.uuid).toBe(first!.uuid);
      expect(single.currency).toBe(first!.currency);
      expect(single.available_balance.value).toBe(first!.available_balance.value);
    }, 30_000);

    it("getAccountTradeHistory({productIds:['BTC-USD']}) returns a {fills, cursor?} shape AND filters apply", async () => {
      const { getAccountTradeHistory } = await import("@/lib/coinbase/accounts");

      // Use an obvious sentinel pair that the operator very likely has NO
      // trades for. If the wrapper sends the wrong filter (e.g., singular
      // product_id silently match-all), this would return fills for OTHER
      // products. By picking a sentinel that's almost certainly empty for
      // this account, an empty result is the expected outcome — anything
      // non-empty would signal the filter is being ignored.
      const sentinelResult = await getAccountTradeHistory({
        productIds: ["ZZZ-USDT-SENTINEL-NO-TRADES"],
      });
      expect(Array.isArray(sentinelResult.fills)).toBe(true);
      expect(sentinelResult.fills.length).toBe(0);

      // Now test the real shape with BTC-USD (which may or may not have fills).
      const result = await getAccountTradeHistory({ productIds: ["BTC-USD"] });

      expect(result).toBeDefined();
      expect(Array.isArray(result.fills)).toBe(true);
      // No assertion on fills.length — operator may have zero BTC-USD trades.

      // If there ARE fills, each one has the load-bearing required fields populated.
      for (const fill of result.fills.slice(0, 3)) {
        expect(fill.entry_id).toBeTruthy();
        expect(fill.trade_id).toBeTruthy();
        expect(fill.order_id).toBeTruthy();
        expect(fill.trade_time).toBeTruthy();
        expect(fill.price).toBeTruthy();
        expect(fill.size).toBeTruthy();
        // Filter actually applied: every returned fill is BTC-USD.
        expect(fill.product_id).toBe("BTC-USD");
        expect(fill.side).toBeTruthy();
      }
    }, 30_000);
  },
);

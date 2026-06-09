// CB-3.1 AC 6 — Integration test against the REAL Coinbase API.
//
// LOAD-BEARING per PM DRI Decision #1 (first REAL AssetAdapter
// implementation; CB-3.0's mock equity adapter proved the abstraction
// shape; this test proves it works against live Coinbase data).
//
// Double-gated (RUN_INTEGRATION_TESTS=1 + CDP creds). Even though
// `getProducts` is the public path, gate still applies for consistency
// with CB-2.5's pattern.
//
// SEEDS Researcher Open Question #1 (top-5 stability cadence): the
// "observed top-5" log line is the PRIMARY OUTPUT — it documents
// Coinbase's actual top-5 at test run time. Full closure of #1 happens
// after ~1 week of runtime-log accumulation post-CB-3.3, but every
// integration test run adds a data point.
//
// Operator runs locally via:
//
//     RUN_INTEGRATION_TESTS=1 pnpm test:integration \
//       tests/lib/strategy-coinbase/adapter.integration.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeCoinbaseAdapter } from "@/lib/strategy-coinbase/adapter";
import { topN } from "@/lib/strategy-core/top-n";

const RUN = process.env.RUN_INTEGRATION_TESTS === "1";
const HAS_CREDS = Boolean(
  process.env.COINBASE_API_KEY_NAME && process.env.COINBASE_API_PRIVATE_KEY,
);

if (RUN && !HAS_CREDS) {
  console.log(
    "[strategy-coinbase.integration] Skipping: RUN_INTEGRATION_TESTS=1 but " +
      "COINBASE_API_KEY_NAME or COINBASE_API_PRIVATE_KEY missing. Add to " +
      ".env.local and run via `pnpm test:integration`.",
  );
}

describe.skipIf(!RUN || !HAS_CREDS)(
  "lib/strategy-coinbase/adapter — integration (real Coinbase responses)",
  () => {
    // Allow pass-through logging so the operator sees the diagnostic output
    // (top-5 observation, headers, etc.) while the spy can still intercept.
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

    it("getCandidateAssets() returns ≥ 1 USD-quoted spot product", async () => {
      const adapter = makeCoinbaseAdapter();
      const assets = await adapter.getCandidateAssets();

      expect(assets.length).toBeGreaterThan(0);
      // Every returned asset is tagged correctly
      for (const a of assets) {
        expect(a.assetClass).toBe("crypto-coinbase");
        expect(typeof a.identifier).toBe("string");
        expect(a.identifier.length).toBeGreaterThan(0);
      }

      originalLog(
        `\n[strategy-coinbase.integration] getCandidateAssets — observed ${assets.length} USD-quoted spot products`,
      );
    }, 30_000);

    it("topN(5) returns 5 ranked assets; BTC-USD + ETH-USD both present (high-market-cap anchors)", async () => {
      // PM DRI Decision #2 — anchor assertion avoids brittle exact-order
      // checks. BTC + ETH together are the only two cryptos where "in top-5
      // by dollar volume" is essentially always true on Coinbase. Structure
      // check (5 items, valid Asset shape) + both anchors present = reliable
      // signal without false negatives. The other 3 slots may rotate among
      // SOL/XRP/DOGE/SUI/USDT etc.
      const adapter = makeCoinbaseAdapter();
      const top5 = await topN(adapter, 5);

      expect(top5).toHaveLength(5);
      for (const a of top5) {
        expect(a.assetClass).toBe("crypto-coinbase");
        expect(typeof a.identifier).toBe("string");
      }

      const identifiers = top5.map((a) => a.identifier);
      expect(identifiers).toContain("BTC-USD");
      expect(identifiers).toContain("ETH-USD");

      // PRIMARY OUTPUT — Researcher Open Question #1 seed data
      originalLog("\n[strategy-coinbase.integration] OBSERVED TOP-5 by DOLLAR VOLUME (Researcher #1 seed):");
      identifiers.forEach((id, i) => originalLog(`  ${i + 1}. ${id}`));
      originalLog(
        `[strategy-coinbase.integration] Run timestamp anchored by the test framework; ` +
          `seeds the top-5 stability cadence data feed.`,
      );
    }, 30_000);

    it("rankByVolume orders by Coinbase DOLLAR volume descending (BTC-USD top-10)", async () => {
      const adapter = makeCoinbaseAdapter();
      const allAssets = await adapter.getCandidateAssets();

      // Sanity: enough products to demonstrate ranking
      expect(allAssets.length).toBeGreaterThan(5);

      const ranked = await adapter.rankByVolume(allAssets);
      expect(ranked).toHaveLength(allAssets.length);

      // BTC-USD reliably ranks in the top-10 by dollar volume; this is the
      // load-bearing check that the adapter uses dollar volume
      // (approximate_quote_24h_volume) not token-count volume (volume_24h
      // would put PEPE/SHIB at the top — see Engineer DRI Decision #2).
      const btcRank = ranked.findIndex((a) => a.identifier === "BTC-USD");
      expect(btcRank).toBeGreaterThanOrEqual(0);
      expect(btcRank).toBeLessThan(10);

      originalLog(
        `\n[strategy-coinbase.integration] BTC-USD ranked at position ${btcRank + 1} of ${ranked.length} USD-quoted spot products (by dollar volume)`,
      );
    }, 30_000);
  },
);

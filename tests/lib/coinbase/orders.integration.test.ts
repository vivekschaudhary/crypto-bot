// Integration test: hit Coinbase's REAL write endpoints.
//
// ⚠️ THIS TEST PLACES A REAL ORDER ON YOUR COINBASE ACCOUNT ⚠️
//
// Strategy (Option A from CB-2.4 story AC 5, per Engineer DRI Decision
// #3): place a LIMIT BUY at 50% BELOW current market price (queried via
// getProduct first) with post_only=true (can't fill since limit is far
// below the bid; post_only ensures Coinbase rejects if it WOULD cross),
// then immediately cancel via cancelOrders. Verifies both `POST /orders`
// and `POST /orders/batch_cancel` end-to-end against the live API. Zero
// commission cost. No asset acquired.
//
// Calibration note: initial attempts used $1 BTC limit, which Coinbase
// rejected with PREVIEW_LIMIT_PRICE_TOO_FAR_FROM_MARKET. 50% below
// market is well within Coinbase's accepted distance and still
// guaranteed no-fill given current spreads.
//
// Triple-gated:
//   1. RUN_INTEGRATION_TESTS=1 (CI lacks reliable network egress + by
//      design doesn't carry CDP credentials per architecture.md §
//      Secrets-at-rest)
//   2. CDP credentials present (COINBASE_API_KEY_NAME +
//      COINBASE_API_PRIVATE_KEY)
//   3. RUN_REAL_ORDER_TESTS=1 — extra opt-in barrier because these tests
//      place REAL orders. Default skip; operator opts in only when
//      ready to verify the write path against live Coinbase.
//
// Operator runs (after explicit opt-in):
//
//     RUN_INTEGRATION_TESTS=1 RUN_REAL_ORDER_TESTS=1 \
//       pnpm test:integration tests/lib/coinbase/orders.integration.test.ts
//
// After the test passes, operator should verify via Coinbase web UI:
//   - A limit BUY order for 0.0001 BTC was placed at ~50% of current
//     market price (visible in order history with the sentinel
//     client_order_id `cb-2.4-integration-test-<unix-seconds>`)
//   - The order was immediately cancelled (status = CANCELLED)
//   - No fill occurred (no asset acquired)

import { describe, expect, it } from "vitest";

const RUN = process.env.RUN_INTEGRATION_TESTS === "1";
const HAS_CREDS = Boolean(
  process.env.COINBASE_API_KEY_NAME && process.env.COINBASE_API_PRIVATE_KEY,
);
const REAL_ORDERS = process.env.RUN_REAL_ORDER_TESTS === "1";

if (RUN && HAS_CREDS && !REAL_ORDERS) {
  console.log(
    "[orders.integration] Skipping: RUN_INTEGRATION_TESTS=1 + CDP creds " +
      "present, but RUN_REAL_ORDER_TESTS env var not set to '1'. These tests " +
      "place REAL orders on your Coinbase account. Set RUN_REAL_ORDER_TESTS=1 " +
      "to enable. The orders are limit-far-from-market + post_only=true (can't " +
      "fill) and are immediately cancelled, so zero commission and no asset " +
      "acquired — but the API calls ARE real.",
  );
}

if (RUN && !HAS_CREDS) {
  console.log(
    "[orders.integration] Skipping: RUN_INTEGRATION_TESTS=1 but " +
      "COINBASE_API_KEY_NAME or COINBASE_API_PRIVATE_KEY missing. Add to " +
      ".env.local and run via `pnpm test:integration`.",
  );
}

describe.skipIf(!RUN || !HAS_CREDS || !REAL_ORDERS)(
  "lib/coinbase/orders — integration (real Coinbase WRITE path)",
  () => {
    // Shared state across the place + cancel + verify chain.
    let placedOrderId: string | undefined;
    // Use a unique sentinel client_order_id so operator can spot the
    // test order in Coinbase UI if they look it up.
    const sentinelClientOrderId = `cb-2.4-integration-test-${Math.floor(
      Date.now() / 1000,
    )}`;

    it("placeOrder() submits a limit BUY 50% below market with post_only=true; returns success_response.order_id", async () => {
      const { placeOrder } = await import("@/lib/coinbase/orders");
      const { getProduct } = await import("@/lib/coinbase/market");

      // Coinbase rejects limit orders too far from market price with
      // PREVIEW_LIMIT_PRICE_TOO_FAR_FROM_MARKET. Query the current
      // market price and set our limit to 50% below — safely under
      // any spread (post_only ensures no fill if it WOULD cross) but
      // within Coinbase's accepted distance.
      const product = await getProduct("BTC-USD");
      const currentPrice = Number(product.price);
      expect(Number.isFinite(currentPrice)).toBe(true);
      expect(currentPrice).toBeGreaterThan(0);
      // 50% below market, rounded to integer dollars (Coinbase BTC-USD
      // ticks at $0.01 but integer dollars is fine and human-readable).
      const limitPrice = String(Math.floor(currentPrice * 0.5));

      const result = await placeOrder({
        productId: "BTC-USD",
        side: "BUY",
        orderConfiguration: {
          limit_limit_gtc: {
            base_size: "0.0001",
            limit_price: limitPrice,
            post_only: true,
          },
        },
        clientOrderId: sentinelClientOrderId,
      });

      if (!result.success) {
        // Debug: surface Coinbase's rejection reason so we can adjust the
        // test parameters (e.g., min size, allowed limit-price range).
        console.log(
          "[orders.integration] placeOrder returned success=false. error_response:",
          JSON.stringify(result.error_response, null, 2),
          "limit_price was:",
          limitPrice,
          "market was:",
          currentPrice,
        );
      }
      expect(result.success).toBe(true);
      expect(result.success_response).toBeDefined();
      expect(result.success_response?.order_id).toBeTruthy();
      expect(result.success_response?.product_id).toBe("BTC-USD");
      expect(result.success_response?.side).toBe("BUY");
      expect(result.success_response?.client_order_id).toBe(
        sentinelClientOrderId,
      );

      placedOrderId = result.success_response?.order_id;
    }, 30_000);

    it("cancelOrders() cancels the placed order; results[0].success === true", async () => {
      expect(placedOrderId).toBeTruthy();
      const { cancelOrders } = await import("@/lib/coinbase/orders");

      const result = await cancelOrders({
        orderIds: [placedOrderId!],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]?.order_id).toBe(placedOrderId);
      expect(result.results[0]?.success).toBe(true);
    }, 30_000);

    it("getAccountTradeHistory() shows no fills for our sentinel client_order_id (proves cancel beat any fill attempt)", async () => {
      const { getAccountTradeHistory } = await import(
        "@/lib/coinbase/accounts"
      );

      // Fills are filtered by product_id; if the order had filled, it
      // would show up here. Since post_only=true + limit-price ~50%
      // below current market (per Decision #3), the order couldn't have
      // crossed the spread — but verify to be safe.
      const result = await getAccountTradeHistory({
        productIds: ["BTC-USD"],
        // Last few minutes only — narrow the search window
        start: new Date(Date.now() - 5 * 60 * 1000),
        end: new Date(),
      });

      // Check no fill has our sentinel client_order_id. (Coinbase fills
      // include client_order_id linkage when available; if absent, the
      // sentinel check is a no-op and we rely on the order shape +
      // cancel success above to prove no fill.)
      const filledOurOrder = result.fills.some(
        (f) => f.order_id === placedOrderId,
      );
      expect(filledOurOrder).toBe(false);
    }, 30_000);
  },
);

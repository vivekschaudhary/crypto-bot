// Triple-gated REAL-COINBASE order integration test — CB-4.3 AC 13.
//
// This places a REAL limit order on the operator's Coinbase account, then
// cancels it. It is the empirical closure of Researcher Q3 (limit-order
// slippage acceptance) and the live-path validation before the operator
// flips LIVE_MODE.
//
// GATED — does NOT run in normal CI (CB-2.4 RUN_REAL_ORDER_TESTS precedent).
// All three must hold or the suite is skipped:
//   1. RUN_REAL_ORDER_TESTS=1
//   2. COINBASE_API_KEY_NAME + COINBASE_API_PRIVATE_KEY present (real creds)
//   3. run explicitly, e.g.:
//      RUN_REAL_ORDER_TESTS=1 pnpm vitest run \
//        tests/app/api/cron/tick/real-order.integration.test.ts
//
// SAFETY: places a tiny buy limit FAR BELOW market (won't fill), asserts
// the order id, then cancels it. Never places a fillable order.

import { afterAll, describe, expect, it } from "vitest";

const ENABLED =
  process.env.RUN_REAL_ORDER_TESTS === "1" &&
  !!process.env.COINBASE_API_KEY_NAME &&
  !!process.env.COINBASE_API_PRIVATE_KEY;

const d = ENABLED ? describe : describe.skip;

d("REAL Coinbase limit order (gated)", () => {
  const placed: string[] = [];

  afterAll(async () => {
    if (placed.length === 0) return;
    const { cancelOrders } = await import("@/lib/coinbase/orders");
    await cancelOrders({ orderIds: placed }).catch(() => undefined);
  });

  it("places a far-below-market BTC-USD buy limit, gets an order id, then cancels", async () => {
    const { getProduct } = await import("@/lib/coinbase/market");
    const { placeOrder } = await import("@/lib/coinbase/orders");
    const { buildLimitOrder, deterministicClientOrderId } = await import(
      "@/lib/ticks/orders"
    );

    const product = await getProduct("BTC-USD");
    const marketPrice = Number(product.price ?? "0");
    expect(marketPrice).toBeGreaterThan(0);

    // Far below market (50% down) → rests unfilled, like CB-2.4's fixture.
    const built = buildLimitOrder({
      side: "BUY",
      lastClose: marketPrice * 0.5,
      dollars: 10,
      quoteIncrement: product.quote_increment,
      baseIncrement: product.base_increment,
    });
    const clientOrderId = deterministicClientOrderId(
      "integration-test",
      new Date("2026-06-14T00:00:00.000Z"),
      "BTC-USD",
    );

    const resp = await placeOrder({
      productId: "BTC-USD",
      side: "BUY",
      orderConfiguration: built.config,
      clientOrderId,
    });

    expect(resp.success).toBe(true);
    expect(resp.success_response?.order_id).toBeTruthy();
    if (resp.success_response?.order_id) placed.push(resp.success_response.order_id);
  });
});

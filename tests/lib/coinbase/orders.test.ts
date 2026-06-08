// Unit tests for `lib/coinbase/orders.ts`.
//
// Mocks `coinbase().request` via `vi.mock("@/lib/coinbase/client", ...)`.
// CB-2.4 tests POST methods (vs CB-2.3's GET) — assertions cover body
// shape construction (client_order_id auto-gen, product_id, side,
// order_configuration) and the LIVE_MODE-free architectural invariant
// (no LIVE_MODE references; placement happens unconditionally).

import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.fn();

vi.mock("@/lib/coinbase/client", () => ({
  coinbase: () => ({
    request,
    publicRequest: vi.fn(),
  }),
}));

import { placeOrder, cancelOrders } from "@/lib/coinbase/orders";
import { CoinbaseClientError } from "@/lib/coinbase/types";

beforeEach(() => {
  request.mockReset();
});

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const makeSuccessResponse = (overrides: Record<string, unknown> = {}) => ({
  success: true,
  success_response: {
    order_id: "ord_abc-123",
    product_id: "BTC-USD",
    side: "BUY",
    client_order_id: "client-1",
    ...overrides,
  },
});

describe("placeOrder — happy paths per variant", () => {
  it("market_market_ioc with quote_size — POST /orders with correct body shape", async () => {
    request.mockResolvedValueOnce(makeSuccessResponse());

    const result = await placeOrder({
      productId: "BTC-USD",
      side: "BUY",
      orderConfiguration: {
        market_market_ioc: { quote_size: "50" },
      },
      clientOrderId: "client-1",
    });

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      "POST",
      "/api/v3/brokerage/orders",
      expect.objectContaining({
        client_order_id: "client-1",
        product_id: "BTC-USD",
        side: "BUY",
        order_configuration: { market_market_ioc: { quote_size: "50" } },
      }),
    );
    expect(result.success).toBe(true);
    expect(result.success_response?.order_id).toBe("ord_abc-123");
  });

  it("limit_limit_gtc with post_only — POST body construction verified", async () => {
    request.mockResolvedValueOnce(makeSuccessResponse({ side: "SELL" }));

    await placeOrder({
      productId: "ETH-USD",
      side: "SELL",
      orderConfiguration: {
        limit_limit_gtc: {
          base_size: "0.5",
          limit_price: "3500",
          post_only: true,
        },
      },
      clientOrderId: "client-2",
    });

    const body = request.mock.calls[0]?.[2];
    expect(body).toMatchObject({
      client_order_id: "client-2",
      product_id: "ETH-USD",
      side: "SELL",
      order_configuration: {
        limit_limit_gtc: {
          base_size: "0.5",
          limit_price: "3500",
          post_only: true,
        },
      },
    });
  });

  it("auto-generates a UUID v4 in client_order_id when clientOrderId is absent", async () => {
    request.mockResolvedValueOnce(makeSuccessResponse());

    await placeOrder({
      productId: "BTC-USD",
      side: "BUY",
      orderConfiguration: { market_market_ioc: { quote_size: "10" } },
      // clientOrderId omitted
    });

    const body = request.mock.calls[0]?.[2] as { client_order_id: string };
    expect(body.client_order_id).toMatch(UUID_V4_REGEX);
  });

  it("passes through caller-provided clientOrderId verbatim", async () => {
    request.mockResolvedValueOnce(makeSuccessResponse());

    const explicitId = "my-retry-key-2026-06-08-T-1234";
    await placeOrder({
      productId: "BTC-USD",
      side: "BUY",
      orderConfiguration: { market_market_ioc: { quote_size: "10" } },
      clientOrderId: explicitId,
    });

    const body = request.mock.calls[0]?.[2] as { client_order_id: string };
    expect(body.client_order_id).toBe(explicitId);
  });
});

describe("placeOrder — invalid-argument guards", () => {
  it("throws on empty productId without hitting the network", async () => {
    await expect(
      placeOrder({
        productId: "",
        side: "BUY",
        orderConfiguration: { market_market_ioc: { quote_size: "10" } },
      }),
    ).rejects.toMatchObject({
      name: "CoinbaseClientError",
      code: "invalid-argument",
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("throws when market_market_ioc has neither quote_size nor base_size", async () => {
    await expect(
      placeOrder({
        productId: "BTC-USD",
        side: "BUY",
        orderConfiguration: { market_market_ioc: {} },
      }),
    ).rejects.toMatchObject({
      name: "CoinbaseClientError",
      code: "invalid-argument",
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("throws when market_market_ioc has BOTH quote_size and base_size (ambiguous)", async () => {
    await expect(
      placeOrder({
        productId: "BTC-USD",
        side: "BUY",
        orderConfiguration: {
          market_market_ioc: { quote_size: "50", base_size: "0.001" },
        },
      }),
    ).rejects.toMatchObject({
      name: "CoinbaseClientError",
      code: "invalid-argument",
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("throws on invalid side value", async () => {
    await expect(
      placeOrder({
        productId: "BTC-USD",
        // @ts-expect-error — testing runtime guard
        side: "HOLD",
        orderConfiguration: { market_market_ioc: { quote_size: "10" } },
      }),
    ).rejects.toMatchObject({
      name: "CoinbaseClientError",
      code: "invalid-argument",
    });
    expect(request).not.toHaveBeenCalled();
  });
});

describe("placeOrder — Zod validation failure", () => {
  it("wraps unexpected response shape as CoinbaseClientError({code:'validation-failed'})", async () => {
    // success=true but missing required success_response fields
    request.mockResolvedValueOnce({ success: true, success_response: { order_id: "abc" /* missing product_id, side, client_order_id */ } });

    await expect(
      placeOrder({
        productId: "BTC-USD",
        side: "BUY",
        orderConfiguration: { market_market_ioc: { quote_size: "10" } },
      }),
    ).rejects.toMatchObject({
      name: "CoinbaseClientError",
      code: "validation-failed",
    });
  });
});

describe("cancelOrders — happy paths", () => {
  it("single-order cancel — POST body shape verified", async () => {
    request.mockResolvedValueOnce({
      results: [{ success: true, order_id: "ord_abc-123" }],
    });

    const result = await cancelOrders({ orderIds: ["ord_abc-123"] });

    expect(request).toHaveBeenCalledWith(
      "POST",
      "/api/v3/brokerage/orders/batch_cancel",
      { order_ids: ["ord_abc-123"] },
    );
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.success).toBe(true);
  });

  it("multi-order cancel — passes the full array", async () => {
    request.mockResolvedValueOnce({
      results: [
        { success: true, order_id: "ord_1" },
        { success: false, order_id: "ord_2", failure_reason: "ALREADY_FILLED" },
      ],
    });

    const result = await cancelOrders({ orderIds: ["ord_1", "ord_2"] });

    const body = request.mock.calls[0]?.[2];
    expect(body).toEqual({ order_ids: ["ord_1", "ord_2"] });
    expect(result.results).toHaveLength(2);
    expect(result.results[1]?.failure_reason).toBe("ALREADY_FILLED");
  });
});

describe("cancelOrders — invalid-argument guards", () => {
  it("throws on empty orderIds array", async () => {
    await expect(cancelOrders({ orderIds: [] })).rejects.toMatchObject({
      name: "CoinbaseClientError",
      code: "invalid-argument",
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("throws when orderIds contains an empty string", async () => {
    await expect(
      cancelOrders({ orderIds: ["ord_1", ""] }),
    ).rejects.toMatchObject({
      name: "CoinbaseClientError",
      code: "invalid-argument",
    });
    expect(request).not.toHaveBeenCalled();
  });
});

describe("cancelOrders — Zod validation failure", () => {
  it("wraps unexpected response shape as CoinbaseClientError({code:'validation-failed'})", async () => {
    request.mockResolvedValueOnce({ not_a_results_envelope: true });

    await expect(cancelOrders({ orderIds: ["ord_1"] })).rejects.toMatchObject({
      name: "CoinbaseClientError",
      code: "validation-failed",
    });
  });
});

describe("sensitive-data hygiene (anti-echo)", () => {
  it("does NOT echo order details (limit_price, base_size) into the .message of a thrown CoinbaseClientError", async () => {
    // Mock request rejecting with a CoinbaseClientError whose cause body
    // contains order details. This simulates the wrapper layer wrapping
    // a Coinbase 4xx that echoes the request body back in the error
    // response. Even if Coinbase does this, our error contract (per
    // CB-2.1's CoinbaseClientError.fromHttpResponse) extracts ONLY
    // error-shaped fields (error_code, message, error_description)
    // into .message — never request-body fields like limit_price.

    const sensitiveBody = {
      error: "invalid-order",
      message: "validation failed",
      // Simulated request-body echo containing sensitive order details:
      order_configuration: {
        limit_limit_gtc: {
          limit_price: "99999.99",
          base_size: "0.5",
          post_only: true,
        },
      },
    };

    request.mockRejectedValueOnce(
      new CoinbaseClientError({
        code: "invalid-order",
        message:
          "Coinbase POST /api/v3/brokerage/orders responded 400: validation failed",
        status: 400,
        cause: sensitiveBody,
      }),
    );

    let caught: unknown;
    try {
      await placeOrder({
        productId: "BTC-USD",
        side: "SELL",
        orderConfiguration: {
          limit_limit_gtc: {
            base_size: "0.5",
            limit_price: "99999.99",
            post_only: true,
          },
        },
      });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(CoinbaseClientError);
    const err = caught as CoinbaseClientError;
    // The .message MUST NOT contain sensitive order details
    expect(err.message).not.toContain("99999.99");
    expect(err.message).not.toContain("0.5");
    // But .cause preserves the body for debugging-at-call-site
    expect(err.cause).toBe(sensitiveBody);
  });
});

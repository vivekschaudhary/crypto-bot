// Authenticated WRITES — `POST /api/v3/brokerage/orders*`.
//
// Real-money write surface. Both wrappers call `coinbase().request()`
// from `lib/coinbase/client.ts` (CB-2.1; auth'd JWT path proved working
// against `/api/v3/brokerage/*` by CB-2.3).
//
// ============================================================
// THE LOAD-BEARING ARCHITECTURAL INVARIANT (CB-2 brief PM Risk #4):
// `orders.ts` is LIVE_MODE-free. The wrapper places real orders
// UNCONDITIONALLY whenever it's invoked. CB-4 (bot runtime, separate
// bet) owns the dry-run/live gate. The wrapper is plumbing; the
// policy lives in the consumer.
//
// Enforcement: tests/lib/coinbase/no-live-mode.test.ts auto-scans
// every .ts file under lib/coinbase/ and fails the build if LIVE_MODE
// appears anywhere.
// ============================================================
//
// Architectural invariants from CB-2 brief (enforced by tests):
//   * No LIVE_MODE reads (no-live-mode.test.ts)
//   * Zod schemas use .passthrough() for forward-compat (PM Risk #2)
//   * Every error out of this file is a CoinbaseClientError (CB-2.1 contract)
//   * Sensitive-data hygiene: error messages do NOT echo order details
//     (limit_price, base_size, quote_size, etc.) into logs. The existing
//     CoinbaseClientError.fromHttpResponse contract only extracts error-
//     shaped fields into .message; `cause` preserves the raw body without
//     surfacing it. AC 4's anti-echo test proves this end-to-end.

import { randomUUID } from "node:crypto";
import { coinbase } from "./client";
import {
  type CancelOrdersResponse,
  CancelOrdersResponseSchema,
  type OrderConfiguration,
  type OrderResponse,
  OrderResponseSchema,
} from "./order-schemas";
import { CoinbaseClientError } from "./types";
import { ZodError } from "zod";

/**
 * Submit a new order via POST /api/v3/brokerage/orders.
 *
 * The wrapper translates the idiomatic `{productId, side,
 * orderConfiguration, clientOrderId?}` shape to Coinbase's actual body:
 * `{client_order_id, product_id, side, order_configuration}`.
 *
 * `clientOrderId` is the IDEMPOTENCY KEY required by Coinbase. If
 * absent, the wrapper auto-generates a UUID v4 via `node:crypto`'s
 * `randomUUID()`. CB-4's retry-after-network-failure path can pass an
 * explicit `clientOrderId` to dedup retries (same key → Coinbase
 * recognizes the duplicate and doesn't double-place).
 *
 * Returns the FULL response envelope — caller checks `success` and
 * reads the appropriate nested response. CB-4 reads
 * `success_response.order_id` on placement; CB-5 reads the same for
 * the ledger view.
 *
 * Real-money surface. LIVE_MODE-free per the architectural invariant
 * above. CB-4 (bot runtime) owns the gate.
 */
export async function placeOrder(args: {
  productId: string;
  side: "BUY" | "SELL";
  orderConfiguration: OrderConfiguration;
  clientOrderId?: string;
}): Promise<OrderResponse> {
  const { productId, side, orderConfiguration, clientOrderId } = args;

  if (!productId) {
    throw new CoinbaseClientError({
      code: "invalid-argument",
      message: "placeOrder: productId is required",
    });
  }

  if (side !== "BUY" && side !== "SELL") {
    throw new CoinbaseClientError({
      code: "invalid-argument",
      message: `placeOrder: side must be 'BUY' or 'SELL' (got ${JSON.stringify(side)})`,
    });
  }

  // market_market_ioc requires EXACTLY ONE of quote_size or base_size.
  // Sending neither is a guaranteed 4xx from Coinbase; sending both is
  // ambiguous. Fail loud at the wrapper boundary instead of paying the
  // round-trip + potentially confusing error.
  if ("market_market_ioc" in orderConfiguration) {
    // `.passthrough()` widens the inferred type; narrow with a typed local.
    const market = orderConfiguration.market_market_ioc as {
      quote_size?: string;
      base_size?: string;
    };
    const hasQuote = typeof market.quote_size === "string" && market.quote_size.length > 0;
    const hasBase = typeof market.base_size === "string" && market.base_size.length > 0;
    if (hasQuote === hasBase) {
      // both true OR both false — same error either way
      throw new CoinbaseClientError({
        code: "invalid-argument",
        message:
          "placeOrder: market_market_ioc requires exactly one of quote_size or base_size " +
          "(quote_size for buy-by-USD; base_size for sell-by-asset-amount)",
      });
    }
  }

  // Build the body. Note: NO LIVE_MODE check here — that's CB-4's
  // responsibility. This wrapper places the order unconditionally.
  const body = {
    client_order_id: clientOrderId ?? randomUUID(),
    product_id: productId,
    side,
    order_configuration: orderConfiguration,
  };

  const raw = await coinbase().request<unknown>(
    "POST",
    "/api/v3/brokerage/orders",
    body,
  );

  return parseOrThrow(OrderResponseSchema, raw, "create order");
}

/**
 * Cancel one or more open orders via POST /api/v3/brokerage/orders/batch_cancel.
 *
 * Coinbase has NO singular cancel endpoint — batch_cancel with a
 * 1-element array is how you cancel a single order. The plural-array
 * surface here matches the API directly and naturally supports
 * multi-cancel for CB-5 dashboard override if it surfaces.
 *
 * Returns the per-order results array. Caller checks each result's
 * `success` boolean to handle partial-success scenarios (Coinbase may
 * succeed on some IDs and fail on others within the same batch).
 */
export async function cancelOrders(args: {
  orderIds: string[];
}): Promise<CancelOrdersResponse> {
  const { orderIds } = args;

  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    throw new CoinbaseClientError({
      code: "invalid-argument",
      message: "cancelOrders: orderIds must be a non-empty array",
    });
  }

  if (orderIds.some((id) => !id || typeof id !== "string")) {
    throw new CoinbaseClientError({
      code: "invalid-argument",
      message: "cancelOrders: orderIds entries must be non-empty strings",
    });
  }

  const body = { order_ids: orderIds };

  const raw = await coinbase().request<unknown>(
    "POST",
    "/api/v3/brokerage/orders/batch_cancel",
    body,
  );

  return parseOrThrow(CancelOrdersResponseSchema, raw, "cancel orders");
}

/**
 * Run a Zod schema's `.parse()` and wrap any failure as a
 * `CoinbaseClientError({code: "validation-failed"})`. Mirrors
 * `lib/coinbase/{accounts,market}.ts:parseOrThrow`.
 *
 * Sensitive-data note: Zod's issue summary uses `path` + `message`
 * fields which describe SCHEMA violations (e.g., "success_response.
 * order_id: Required") — NOT raw response values. Order details
 * (limit_price, base_size) never reach `.message` via this path. The
 * original Zod error is preserved on `.cause` for debugging-at-call-
 * site. AC 4's anti-echo test verifies this contract.
 */
function parseOrThrow<T>(
  schema: { parse: (x: unknown) => T },
  raw: unknown,
  shapeLabel: string,
): T {
  try {
    return schema.parse(raw);
  } catch (e) {
    if (e instanceof ZodError) {
      const summary = e.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
        .join("; ");
      throw new CoinbaseClientError({
        code: "validation-failed",
        message: `Coinbase ${shapeLabel} response failed schema validation: ${summary}`,
        cause: e,
      });
    }
    throw e;
  }
}

// Zod schemas at the auth'd writes wrapper boundary (`orders.ts`).
//
// Per [CB-2 brief PM Risk #2](../../docs/bets/CB-2/brief.md#risks)
// ("Coinbase changes a response shape mid-flight"), every object schema
// uses `.passthrough()` so new Coinbase response fields don't trigger
// Zod validation failures — forward-compat.
//
// Sources verified 2026-06-08:
//   * Create Order: https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/orders/create-order
//   * Cancel Orders: https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/orders/cancel-order
//
// Engineer DRI Decision #1: ship `market_market_ioc` + `limit_limit_gtc`
// variants in CB-2.4. Stop-limit + advanced variants deferred to a
// follow-up story when CB-4 surfaces a concrete need.
//
// Engineer DRI Decision #6: OrderResponseSchema uses Coinbase's nested-
// envelope shape — top-level `success: boolean` discriminator, with
// `success_response` (nested) when success=true and `error_response`
// (nested) when success=false. Per the PR #37 round-2 BLOCKER lesson —
// the earlier draft incorrectly hardcoded a top-level `order_id` which
// would have failed against the live API.

import { z } from "zod";

/**
 * `order_configuration` discriminated union. Coinbase's body shape for
 * POST /orders nests the order type under a single-key object.
 *
 * Note: we use `z.union` (not `z.discriminatedUnion`) because Coinbase
 * doesn't have an explicit discriminator FIELD — the variant is implied
 * by which top-level key is present. `z.union` tries each schema in
 * order and accepts the first match.
 */
export const OrderConfigurationSchema = z.union([
  z
    .object({
      market_market_ioc: z
        .object({
          quote_size: z.string().min(1).optional(),
          base_size: z.string().min(1).optional(),
          rfq_disabled: z.boolean().optional(),
        })
        .passthrough(),
    })
    .passthrough(),
  z
    .object({
      limit_limit_gtc: z
        .object({
          base_size: z.string().min(1),
          limit_price: z.string().min(1),
          post_only: z.boolean().optional(),
          rfq_disabled: z.boolean().optional(),
        })
        .passthrough(),
    })
    .passthrough(),
]);

export type OrderConfiguration = z.infer<typeof OrderConfigurationSchema>;

/**
 * Request body shape sent to POST /api/v3/brokerage/orders. Exported
 * for unit-test verification (assert wrapper constructs this shape
 * correctly); not consumer-facing.
 */
export const OrderRequestSchema = z
  .object({
    client_order_id: z.string().min(1),
    product_id: z.string().min(1),
    side: z.enum(["BUY", "SELL"]),
    order_configuration: OrderConfigurationSchema,
  })
  .passthrough();

export type OrderRequest = z.infer<typeof OrderRequestSchema>;

/**
 * Response shape from POST /api/v3/brokerage/orders. Coinbase's create-
 * order response uses a nested-envelope pattern: top-level `success`
 * boolean, with `success_response` populated on true and `error_response`
 * populated on false.
 *
 * Required strict-fields per consumer load-bearing:
 *   * `success` — top-level discriminator (CB-4 reads this before
 *     interpreting either nested response)
 *   * Inside `success_response`: `order_id`, `product_id`, `side`,
 *     `client_order_id` (per current Create Order docs)
 *
 * Loose-optional `.passthrough()` on every object level for forward-
 * compat per CB-2 brief PM Risk #2.
 */
export const OrderResponseSchema = z
  .object({
    success: z.boolean(),
    success_response: z
      .object({
        order_id: z.string().min(1),
        product_id: z.string().min(1),
        side: z.string().min(1),
        client_order_id: z.string().min(1),
      })
      .passthrough()
      .optional(),
    error_response: z
      .object({
        error: z.string().optional(),
        message: z.string().optional(),
        error_details: z.string().optional(),
        preview_failure_reason: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
  // Success-gated nested envelope: when `success === true`, success_response
  // MUST be present; when `success === false`, error_response MUST be
  // present. Without this refinement, `{success: true}` (no payload) or
  // `{success: false}` (no error details) would pass Zod validation and
  // leave placeOrder()'s callers unable to extract the response. Per
  // Codex PR #39 round-1 BLOCKER.
  .superRefine((data, ctx) => {
    if (data.success && !data.success_response) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["success_response"],
        message:
          "OrderResponseSchema: success_response is required when success=true",
      });
    }
    if (!data.success && !data.error_response) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error_response"],
        message:
          "OrderResponseSchema: error_response is required when success=false",
      });
    }
  });

export type OrderResponse = z.infer<typeof OrderResponseSchema>;

/**
 * Request body shape sent to POST /api/v3/brokerage/orders/batch_cancel.
 * Coinbase has NO singular cancel endpoint — batch_cancel with a
 * 1-element array is how you cancel a single order.
 */
export const CancelOrdersRequestSchema = z
  .object({
    order_ids: z.array(z.string().min(1)).min(1),
  })
  .passthrough();

export type CancelOrdersRequest = z.infer<typeof CancelOrdersRequestSchema>;

/**
 * Response shape from POST /api/v3/brokerage/orders/batch_cancel.
 * Coinbase wraps the per-order outcomes in a `results` array; each
 * result has its own `success` discriminator.
 */
export const CancelOrdersResponseSchema = z
  .object({
    results: z.array(
      z
        .object({
          success: z.boolean(),
          failure_reason: z.string().optional(),
          order_id: z.string().min(1),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export type CancelOrdersResponse = z.infer<typeof CancelOrdersResponseSchema>;

// Zod schemas at the auth'd reads wrapper boundary (`accounts.ts`).
//
// Per [CB-2 brief PM Risk #2](../../docs/bets/CB-2/brief.md#risks)
// ("Coinbase changes a response shape mid-flight"), every object schema
// uses `.passthrough()` so new Coinbase response fields don't trigger
// Zod validation failures — forward-compat.
//
// Required-field discipline (CB-2.2 round-1 lesson + CB-2.3 Decision #4/#5):
//   * AccountSchema strict-required matches Coinbase's documented
//     required-set per the List Accounts page — 9 fields. If Coinbase
//     ever stops returning one, fail loud (API contract change).
//   * FillSchema strict-required uses the consumer load-bearing set
//     (CB-5 ledger + CB-4 post-order verify) even though Coinbase
//     documents all Fill fields as optional. Same pattern as volume_24h.
//
// Sources verified 2026-06-07:
//   * https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/accounts/list-accounts
//   * https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/orders/list-fills

import { z } from "zod";

/**
 * Coinbase's `{value, currency}` money shape. Used by `available_balance`
 * (required) and `hold` (optional) on `AccountSchema`.
 *
 * `value` is a string (Coinbase's convention for numeric values in API
 * responses); caller parses to Number if arithmetic is needed.
 */
export const MoneyValueSchema = z
  .object({
    value: z.string().min(1),
    currency: z.string().min(1),
  })
  .passthrough();

export type MoneyValue = z.infer<typeof MoneyValueSchema>;

/**
 * A single Coinbase account (one per currency the operator holds).
 * Required-set matches Coinbase's documented required-set per the
 * List Accounts page (9 fields). See top-of-file comment for rationale.
 */
export const AccountSchema = z
  .object({
    uuid: z.string().min(1),
    name: z.string().min(1),
    currency: z.string().min(1),
    available_balance: MoneyValueSchema,
    default: z.boolean(),
    active: z.boolean(),
    created_at: z.string().min(1),
    updated_at: z.string().min(1),
    type: z.string().min(1),
    // Loose-optional per Coinbase docs:
    deleted_at: z.string().optional().nullable(),
    hold: MoneyValueSchema.optional(),
    retail_portfolio_id: z.string().optional(),
    ready: z.boolean().optional(),
    portfolio_id: z.string().optional(),
  })
  .passthrough();

export type Account = z.infer<typeof AccountSchema>;

/**
 * Envelope returned by `GET /api/v3/brokerage/accounts`.
 * Coinbase wraps the list in `{accounts, has_next, cursor?, size?}` and
 * uses cursor-based pagination with a required `has_next` boolean.
 * `getAccountBalances()` loops while `has_next === true`.
 */
export const AccountsResponseSchema = z
  .object({
    accounts: z.array(AccountSchema),
    has_next: z.boolean(),
    cursor: z.string().optional(),
    size: z.number().int().nonnegative().optional(),
  })
  .passthrough();

export type AccountsResponse = z.infer<typeof AccountsResponseSchema>;

/**
 * Envelope returned by `GET /api/v3/brokerage/accounts/{account_uuid}`.
 * Coinbase wraps the single account in `{account: {...}}` (verified
 * against the live API 2026-06-07 + Coinbase Get Account docs).
 * Note this differs from `/products/{id}` which returns the product
 * directly at the top level.
 */
export const AccountResponseSchema = z
  .object({
    account: AccountSchema,
  })
  .passthrough();

export type AccountResponse = z.infer<typeof AccountResponseSchema>;

/**
 * A single Fill (executed trade). Coinbase documents ALL fields as
 * optional in the schema, but the listed required-set below is what
 * CB-5 ledger + CB-4 post-order verify actually depend on. Marking
 * them required in Zod here surfaces a contract change loudly if
 * Coinbase ever drops one — same pattern as CB-2.2's `volume_24h`.
 */
export const FillSchema = z
  .object({
    entry_id: z.string().min(1),
    trade_id: z.string().min(1),
    order_id: z.string().min(1),
    trade_time: z.string().min(1), // RFC3339 timestamp
    price: z.string().min(1),
    size: z.string().min(1),
    product_id: z.string().min(1),
    side: z.string().min(1), // "BUY" | "SELL" but Coinbase may add more; keep as string per .passthrough() spirit
    // Loose-optional (Coinbase docs mark all optional; these aren't load-bearing):
    commission: z.string().optional(),
    trade_type: z.string().optional(),
    sequence_timestamp: z.string().optional(),
    liquidity_indicator: z.string().optional(),
    size_in_quote: z.boolean().optional(),
    user_id: z.string().optional(),
    retail_portfolio_id: z.string().optional(),
  })
  .passthrough();

export type Fill = z.infer<typeof FillSchema>;

/**
 * Envelope returned by `GET /api/v3/brokerage/orders/historical/fills`.
 * Coinbase wraps the list in `{fills, cursor?}`. Single-page surface
 * for the wrapper; caller drives pagination via the returned `cursor`.
 */
export const FillsResponseSchema = z
  .object({
    fills: z.array(FillSchema),
    cursor: z.string().optional(),
  })
  .passthrough();

export type FillsResponse = z.infer<typeof FillsResponseSchema>;

/**
 * Coinbase Advanced Trade `/accounts` pagination limit. Default 49,
 * max 250 per the List Accounts docs. The wrapper requests the max
 * to minimize round-trips for the operator's bounded account count
 * (~10-50 currencies held).
 */
export const ACCOUNTS_PAGE_LIMIT = 250;

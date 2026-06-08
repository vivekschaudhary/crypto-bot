// Authenticated reads — `GET /api/v3/brokerage/accounts*` + `/orders/historical/fills`.
//
// All three wrappers call `coinbase().request()` from `lib/coinbase/client.ts`
// (CB-2.1). This file exercises the JWT path for the first time end-to-end
// against `/api/v3/brokerage/*` — the EdDSA brokerage caveat from CB-2.1
// gets verified by AC 5's integration test.
//
// CB-2.4 (`orders.ts`) ships the auth'd WRITES (`placeOrder`, `cancelOrder`)
// with LIVE_MODE-free architectural invariant. CB-2.3 is read-only.
//
// Architectural invariants from CB-2 brief (enforced by tests):
//   * No `LIVE_MODE` reads (verified by `tests/lib/coinbase/no-live-mode.test.ts`)
//   * Zod schemas use `.passthrough()` for forward-compat (CB-2 brief PM Risk #2)
//   * Every error out of this file is a `CoinbaseClientError` (CB-2.1 contract)
//   * Sensitive-data hygiene: error messages do NOT echo balance values into
//     logs. The existing `CoinbaseClientError.fromHttpResponse` contract already
//     only extracts error-shaped fields into `.message`; `cause` preserves the
//     raw body for debugging without surfacing it. CB-2.3 AC 4 includes an
//     anti-echo test that proves this.

import { coinbase } from "./client";
import {
  ACCOUNTS_PAGE_LIMIT,
  type Account,
  AccountResponseSchema,
  AccountsResponseSchema,
  type Fill,
  FillsResponseSchema,
} from "./account-schemas";
import { CoinbaseClientError } from "./types";
import { ZodError } from "zod";

/**
 * List ALL the operator's Coinbase accounts (one per currency held).
 * Auto-paginates internally; caller sees the full list.
 *
 * Coinbase's `/accounts` endpoint is cursor-based with `has_next` flag
 * + top-level `cursor`. Loops while `has_next === true`, requesting
 * `limit=250` per page (the documented max).
 *
 * Consumed by CB-5 (dashboard ledger view) + CB-3 (top-5 ranking).
 */
export async function getAccountBalances(): Promise<Account[]> {
  const collected: Account[] = [];
  let cursor: string | undefined;

  while (true) {
    const qs = new URLSearchParams();
    qs.set("limit", String(ACCOUNTS_PAGE_LIMIT));
    if (cursor) qs.set("cursor", cursor);

    const raw = await coinbase().request<unknown>(
      "GET",
      `/api/v3/brokerage/accounts?${qs.toString()}`,
    );

    const parsed = parseOrThrow(AccountsResponseSchema, raw, "accounts list");
    collected.push(...parsed.accounts);

    if (!parsed.has_next) break;

    // Coinbase contract: when has_next is true, cursor MUST be present.
    // If we get here without a cursor, the upstream contract is broken —
    // fail loud rather than silently returning a partial list (which a
    // caller might mistake for the operator's complete account set).
    if (!parsed.cursor) {
      throw new CoinbaseClientError({
        code: "pagination-contract-violation",
        message:
          "Coinbase /accounts: response has has_next=true but cursor is missing; " +
          "cannot fetch next page. Refusing to return a partial account list.",
      });
    }
    cursor = parsed.cursor;
  }

  return collected;
}

/**
 * Fetch a single account's detail by uuid. Parallels CB-2.2's
 * `getProduct(productId)`. Used by CB-5 ledger drill-down.
 */
export async function getAccount(accountUuid: string): Promise<Account> {
  if (!accountUuid) {
    throw new CoinbaseClientError({
      code: "invalid-argument",
      message: "getAccount: accountUuid is required",
    });
  }

  const raw = await coinbase().request<unknown>(
    "GET",
    `/api/v3/brokerage/accounts/${encodeURIComponent(accountUuid)}`,
  );

  // Coinbase wraps the single account in `{account: {...}}` — verified
  // against the live API 2026-06-07. The list endpoint
  // (`/accounts`) returns accounts directly under the `accounts: [...]`
  // array, but the single-resource endpoint uses this envelope.
  const parsed = parseOrThrow(AccountResponseSchema, raw, "account detail");
  return parsed.account;
}

/**
 * Fetch a single page of historical fills (executed trades).
 * Single-page surface — caller drives pagination by passing the
 * returned `cursor` to the next call. Rationale: fills can be
 * unbounded (hundreds of thousands across long history); auto-paginate
 * would OOM. CB-5 ledger will likely page UI-side anyway.
 *
 * Time params convert from `Date` to Coinbase's RFC3339 format (NOTE:
 * different from CB-2.2's candles endpoint which uses Unix-seconds —
 * per Coinbase's actual API).
 */
export async function getAccountTradeHistory(args: {
  productIds?: string[];
  start?: Date;
  end?: Date;
  cursor?: string;
  limit?: number;
}): Promise<{ fills: Fill[]; cursor?: string }> {
  const { productIds, start, end, cursor, limit } = args;

  if (productIds !== undefined) {
    if (!Array.isArray(productIds) || productIds.length === 0) {
      throw new CoinbaseClientError({
        code: "invalid-argument",
        message: "getAccountTradeHistory: productIds must be a non-empty array when provided",
      });
    }
    if (productIds.some((p) => !p || typeof p !== "string")) {
      throw new CoinbaseClientError({
        code: "invalid-argument",
        message: "getAccountTradeHistory: productIds entries must be non-empty strings",
      });
    }
  }

  if (start && end && end.getTime() <= start.getTime()) {
    throw new CoinbaseClientError({
      code: "invalid-argument",
      message: `getAccountTradeHistory: end (${end.toISOString()}) must be after start (${start.toISOString()})`,
    });
  }

  // Coinbase's List Fills filter is `product_ids` (plural array) — pass
  // each id as a repeated query param so URLSearchParams encodes it as
  // `?product_ids=BTC-USD&product_ids=ETH-USD`. The historical singular
  // `product_id` is undocumented and may silently ignore/match-all,
  // which would cause filters to noop without erroring (caught by Codex
  // PR #34 round-1 BLOCKER).
  const qs = new URLSearchParams();
  if (productIds) {
    for (const id of productIds) qs.append("product_ids", id);
  }
  if (start) qs.set("start_sequence_timestamp", start.toISOString());
  if (end) qs.set("end_sequence_timestamp", end.toISOString());
  if (cursor) qs.set("cursor", cursor);
  if (limit !== undefined) qs.set("limit", String(limit));

  const path = qs.toString()
    ? `/api/v3/brokerage/orders/historical/fills?${qs.toString()}`
    : `/api/v3/brokerage/orders/historical/fills`;

  const raw = await coinbase().request<unknown>("GET", path);

  const parsed = parseOrThrow(FillsResponseSchema, raw, "trade history");
  return { fills: parsed.fills, cursor: parsed.cursor };
}

/**
 * Run a Zod schema's `.parse()` and wrap any failure as a
 * `CoinbaseClientError({code: "validation-failed"})`. Keeps the single-
 * error-type contract from CB-2.1 (every error out of `lib/coinbase/` is
 * a `CoinbaseClientError`).
 *
 * Mirrors `lib/coinbase/market.ts:parseOrThrow`. Could be extracted to a
 * shared helper in the future if a third consumer (CB-2.5's trace.ts)
 * needs it; for CB-2.3 the duplication is intentional (keeps each
 * wrapper file standalone-readable).
 *
 * Sensitive-data note: the issue summary is built from Zod's `path` +
 * `message` fields, which describe SCHEMA violations (e.g., "uuid:
 * Required") — NOT raw response values. Balance values never reach
 * `.message` via this path. The original Zod error is preserved on
 * `.cause` for debugging-at-call-site.
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

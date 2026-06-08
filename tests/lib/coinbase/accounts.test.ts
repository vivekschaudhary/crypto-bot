// Unit tests for `lib/coinbase/accounts.ts`.
//
// Mocks `coinbase().request` via `vi.mock("@/lib/coinbase/client", ...)`.
// Note: CB-2.3 mocks `request` (auth'd) not `publicRequest` (public) —
// these wrappers all hit the JWT path.

import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.fn();

vi.mock("@/lib/coinbase/client", () => ({
  coinbase: () => ({
    request,
    publicRequest: vi.fn(),
  }),
}));

import {
  getAccountBalances,
  getAccount,
  getAccountTradeHistory,
} from "@/lib/coinbase/accounts";
import { CoinbaseClientError } from "@/lib/coinbase/types";

beforeEach(() => {
  request.mockReset();
});

const makeAccount = (overrides: Record<string, unknown> = {}) => ({
  uuid: "uuid-1",
  name: "BTC Wallet",
  currency: "BTC",
  available_balance: { value: "1.5", currency: "BTC" },
  default: true,
  active: true,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-06-01T00:00:00Z",
  type: "ACCOUNT_TYPE_CRYPTO",
  ...overrides,
});

const makeFill = (overrides: Record<string, unknown> = {}) => ({
  entry_id: "entry-1",
  trade_id: "trade-1",
  order_id: "order-1",
  trade_time: "2026-06-07T12:00:00Z",
  price: "60000",
  size: "0.01",
  product_id: "BTC-USD",
  side: "BUY",
  ...overrides,
});

describe("getAccountBalances — happy path + pagination", () => {
  it("returns the accounts array on a single page (has_next=false)", async () => {
    request.mockResolvedValueOnce({
      accounts: [makeAccount({ uuid: "u1" }), makeAccount({ uuid: "u2", currency: "USD" })],
      has_next: false,
    });

    const accounts = await getAccountBalances();

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      "GET",
      expect.stringContaining("/api/v3/brokerage/accounts?"),
    );
    const path = request.mock.calls[0]?.[1] as string;
    expect(path).toContain("limit=250");
    expect(path).not.toContain("cursor=");
    expect(accounts).toHaveLength(2);
    expect(accounts[0]?.uuid).toBe("u1");
  });

  it("auto-paginates when has_next=true, stopping when has_next=false", async () => {
    request
      .mockResolvedValueOnce({
        accounts: [makeAccount({ uuid: "u1" })],
        has_next: true,
        cursor: "page-2-token",
      })
      .mockResolvedValueOnce({
        accounts: [makeAccount({ uuid: "u2", currency: "USD" })],
        has_next: false,
      });

    const accounts = await getAccountBalances();

    expect(request).toHaveBeenCalledTimes(2);
    const secondPath = request.mock.calls[1]?.[1] as string;
    expect(secondPath).toContain("cursor=page-2-token");
    expect(accounts.map((a) => a.uuid)).toEqual(["u1", "u2"]);
  });

  it("throws CoinbaseClientError({code:'pagination-contract-violation'}) when has_next=true but cursor is missing (fail-loud on upstream contract violation)", async () => {
    request.mockResolvedValueOnce({
      accounts: [makeAccount({ uuid: "u1" })],
      has_next: true,
      // cursor intentionally omitted — Coinbase contract violation
    });

    await expect(getAccountBalances()).rejects.toMatchObject({
      name: "CoinbaseClientError",
      code: "pagination-contract-violation",
    });
  });

  it("wraps Zod validation failure as CoinbaseClientError({code:'validation-failed'})", async () => {
    // Missing required `name` field — Coinbase docs mark it required.
    request.mockResolvedValueOnce({
      accounts: [{ uuid: "u1", currency: "BTC" }],
      has_next: false,
    });

    await expect(getAccountBalances()).rejects.toMatchObject({
      name: "CoinbaseClientError",
      code: "validation-failed",
    });
  });
});

describe("getAccount — happy path + invalid argument + validation", () => {
  it("returns the typed account (unwrapped from the {account: ...} envelope)", async () => {
    request.mockResolvedValueOnce({ account: makeAccount({ uuid: "abc-123" }) });

    const account = await getAccount("abc-123");

    expect(request).toHaveBeenCalledWith("GET", "/api/v3/brokerage/accounts/abc-123");
    expect(account.uuid).toBe("abc-123");
    expect(account.available_balance.value).toBe("1.5");
  });

  it("throws CoinbaseClientError({code:'invalid-argument'}) on empty uuid without hitting the network", async () => {
    await expect(getAccount("")).rejects.toMatchObject({
      name: "CoinbaseClientError",
      code: "invalid-argument",
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("URL-encodes special characters in the uuid", async () => {
    request.mockResolvedValueOnce({ account: makeAccount({ uuid: "weird/id" }) });

    await getAccount("weird/id").catch(() => {
      /* may fail schema; only care about the called URL */
    });

    const path = request.mock.calls[0]?.[1] as string;
    expect(path).toContain("weird%2Fid");
  });

  it("wraps Zod validation failure as CoinbaseClientError({code:'validation-failed'})", async () => {
    // Missing the `account` envelope key entirely.
    request.mockResolvedValueOnce({ not_an_account: true });

    await expect(getAccount("uuid-1")).rejects.toMatchObject({
      name: "CoinbaseClientError",
      code: "validation-failed",
    });
  });
});

describe("getAccountTradeHistory — RFC3339 conversion + cursor + filters + validation", () => {
  it("returns {fills, cursor?} when no filters are provided", async () => {
    request.mockResolvedValueOnce({
      fills: [makeFill()],
      cursor: "next-page",
    });

    const result = await getAccountTradeHistory({});

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      "GET",
      "/api/v3/brokerage/orders/historical/fills",
    );
    expect(result.fills).toHaveLength(1);
    expect(result.cursor).toBe("next-page");
  });

  it("converts Date start/end to RFC3339 query params + serializes productIds as repeated `product_ids` params", async () => {
    request.mockResolvedValueOnce({ fills: [] });

    const start = new Date("2026-06-01T00:00:00Z");
    const end = new Date("2026-06-07T00:00:00Z");
    await getAccountTradeHistory({ productIds: ["BTC-USD"], start, end });

    const path = request.mock.calls[0]?.[1] as string;
    expect(path).toContain("product_ids=BTC-USD");
    expect(path).not.toContain("product_id="); // singular form must NOT appear
    expect(path).toContain(`start_sequence_timestamp=${encodeURIComponent(start.toISOString())}`);
    expect(path).toContain(`end_sequence_timestamp=${encodeURIComponent(end.toISOString())}`);
  });

  it("serializes multiple productIds as repeated `product_ids` query params", async () => {
    request.mockResolvedValueOnce({ fills: [] });

    await getAccountTradeHistory({ productIds: ["BTC-USD", "ETH-USD"] });

    const path = request.mock.calls[0]?.[1] as string;
    const productIdsMatches = path.match(/product_ids=/g) ?? [];
    expect(productIdsMatches.length).toBe(2);
    expect(path).toContain("product_ids=BTC-USD");
    expect(path).toContain("product_ids=ETH-USD");
  });

  it("passes cursor + limit through verbatim", async () => {
    request.mockResolvedValueOnce({ fills: [] });

    await getAccountTradeHistory({ cursor: "prev-page", limit: 50 });

    const path = request.mock.calls[0]?.[1] as string;
    expect(path).toContain("cursor=prev-page");
    expect(path).toContain("limit=50");
  });

  it("throws CoinbaseClientError({code:'invalid-argument'}) on empty productIds array", async () => {
    await expect(getAccountTradeHistory({ productIds: [] })).rejects.toMatchObject({
      name: "CoinbaseClientError",
      code: "invalid-argument",
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("throws CoinbaseClientError({code:'invalid-argument'}) when productIds contains an empty string", async () => {
    await expect(
      getAccountTradeHistory({ productIds: ["BTC-USD", ""] }),
    ).rejects.toMatchObject({
      name: "CoinbaseClientError",
      code: "invalid-argument",
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("throws CoinbaseClientError({code:'invalid-argument'}) when end <= start", async () => {
    const t = new Date("2026-06-07T12:00:00Z");
    await expect(
      getAccountTradeHistory({ productIds: ["BTC-USD"], start: t, end: t }),
    ).rejects.toMatchObject({
      name: "CoinbaseClientError",
      code: "invalid-argument",
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("wraps Zod validation failure as CoinbaseClientError({code:'validation-failed'})", async () => {
    request.mockResolvedValueOnce({
      fills: [{ trade_id: "t1" /* missing entry_id, order_id, trade_time, price, size, product_id, side */ }],
    });

    await expect(getAccountTradeHistory({})).rejects.toMatchObject({
      name: "CoinbaseClientError",
      code: "validation-failed",
    });
  });
});

describe("sensitive-data hygiene", () => {
  it("does NOT echo balance values into the .message field of a thrown CoinbaseClientError", async () => {
    // Mock `request` rejecting with a CoinbaseClientError that has a `cause`
    // containing balance values. This simulates the wrapper layer wrapping
    // a Coinbase 4xx whose body contained sensitive data.
    const sensitiveBody = {
      error: "invalid-something",
      message: "request rejected",
      // The body Coinbase sends back in some 4xx paths CAN echo the request
      // shape, which might include balance hints. Even when it does, our
      // CoinbaseClientError.fromHttpResponse only extracts error_code +
      // message into .message — never balance fields.
      account_state: {
        available_balance: { value: "12345.67891234", currency: "USD" },
        hold: { value: "999.00", currency: "USD" },
      },
    };

    request.mockRejectedValueOnce(
      new CoinbaseClientError({
        code: "invalid-something",
        message: "Coinbase GET /api/v3/brokerage/accounts responded 400: request rejected",
        status: 400,
        cause: sensitiveBody,
      }),
    );

    let caught: unknown;
    try {
      await getAccountBalances();
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(CoinbaseClientError);
    const err = caught as CoinbaseClientError;
    // The .message MUST NOT contain the sensitive balance values
    expect(err.message).not.toContain("12345.67891234");
    expect(err.message).not.toContain("999.00");
    // But .cause preserves the body for debugging-at-call-site
    expect(err.cause).toBe(sensitiveBody);
  });
});

// CB-6.6 unit tests for lib/bot/manual-orders.ts — the real-money override
// helpers. The LOAD-BEARING (security) behaviours: dry_run while LIVE_MODE=false
// (placeOrder NEVER called); real placement only when LIVE_MODE=true; caps
// count+enforce (block); no-position / invalid-asset / no-session refusals
// place NO order. Mocks the DB + Coinbase + cap aggregation; real buildLimitOrder.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// currentSession()'s bot_sessions SELECT goes through db().
let sessionRows: { id: string; active_strategy_id: string | null }[] = [];
function sqlMock(strings: TemplateStringsArray, ..._v: unknown[]) {
  const text = strings.join("?");
  if (/FROM bot_sessions/.test(text)) return Promise.resolve(sessionRows);
  return Promise.resolve([]);
}
vi.mock("@/lib/db/client", () => ({ db: () => sqlMock }));

const aggregateSessionTotals = vi.fn();
const insertManualOrder = vi.fn();
vi.mock("@/lib/ticks/db", () => ({
  aggregateSessionTotals: (id: unknown) => aggregateSessionTotals(id),
  insertManualOrder: (o: unknown) => insertManualOrder(o),
}));

const getStrategyById = vi.fn();
vi.mock("@/lib/strategies/db", () => ({ getStrategyById: (id: unknown) => getStrategyById(id) }));

const getProduct = vi.fn();
vi.mock("@/lib/coinbase/market", () => ({ getProduct: (id: unknown) => getProduct(id) }));

const getAccountTradeHistory = vi.fn();
vi.mock("@/lib/coinbase/accounts", () => ({ getAccountTradeHistory: (a: unknown) => getAccountTradeHistory(a) }));

const placeOrder = vi.fn();
vi.mock("@/lib/coinbase/orders", () => ({ placeOrder: (a: unknown) => placeOrder(a) }));

const aggregatePosition = vi.fn();
vi.mock("@/lib/ticks/cost-basis", () => ({ aggregatePosition: (f: unknown) => aggregatePosition(f) }));

let liveModeMock = false;
vi.mock("@/lib/env", () => ({ env: () => ({ LIVE_MODE: liveModeMock }) }));

import { forceBuy, sellFraction } from "@/lib/bot/manual-orders";

const KEY = "idem-action-1";

function strategy() {
  return {
    selected_assets: [{ assetClass: "crypto-coinbase", identifier: "BTC-USD" }],
    position_size_usd: 50,
    per_session_dollar_cap: 500,
    per_session_buy_count_cap: 10,
    entry_rules: { rsiThreshold: 30, maPeriod: 20 },
    exit_rules: { rsiThreshold: 70, minProfitPct: 1.5, sellFraction: 0.5 },
  };
}

beforeEach(() => {
  sessionRows = [{ id: "session-1", active_strategy_id: "strat-1" }];
  getStrategyById.mockResolvedValue(strategy());
  aggregateSessionTotals.mockResolvedValue({ dollarSpent: 0, buyCount: 0 });
  insertManualOrder.mockResolvedValue(undefined);
  getProduct.mockResolvedValue({ price: "2000", quote_increment: "0.01", base_increment: "0.00000001" });
  getAccountTradeHistory.mockResolvedValue({ fills: [{ side: "BUY", size: "1", price: "1800" }] });
  aggregatePosition.mockReturnValue({ quantity: 1, avgCostUsd: 1800 });
  placeOrder.mockResolvedValue({ success: true, success_response: { order_id: "cb-1" } });
  liveModeMock = false;
});
afterEach(() => vi.clearAllMocks());

describe("forceBuy — LIVE_MODE gate (security)", () => {
  it("LIVE_MODE=false → dry_run row, placeOrder NEVER called", async () => {
    const r = await forceBuy("BTC-USD", KEY);
    expect(r).toMatchObject({ ok: true, status: "dry_run", side: "buy" });
    expect(placeOrder).not.toHaveBeenCalled();
    expect(insertManualOrder).toHaveBeenCalledWith(
      expect.objectContaining({ status: "dry_run", side: "buy", kind: "force_buy" }),
    );
    // amount = position_size_usd
    expect(insertManualOrder.mock.calls[0]?.[0].amount).toBe(50);
  });

  it("LIVE_MODE=true → placeOrder called, submitted row", async () => {
    liveModeMock = true;
    const r = await forceBuy("BTC-USD", KEY);
    expect(placeOrder).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ ok: true, status: "submitted" });
    expect(insertManualOrder).toHaveBeenCalledWith(expect.objectContaining({ status: "submitted", coinbaseOrderId: "cb-1" }));
  });
});

describe("forceBuy — caps + validation (no order placed on refusal)", () => {
  it("dollar cap reached → cap-reached, no placement/insert", async () => {
    aggregateSessionTotals.mockResolvedValue({ dollarSpent: 500, buyCount: 0 });
    const r = await forceBuy("BTC-USD", KEY);
    expect(r).toEqual({ ok: false, reason: "cap-reached" });
    expect(placeOrder).not.toHaveBeenCalled();
    expect(insertManualOrder).not.toHaveBeenCalled();
  });

  it("buy-count cap reached → cap-reached", async () => {
    aggregateSessionTotals.mockResolvedValue({ dollarSpent: 0, buyCount: 10 });
    expect(await forceBuy("BTC-USD", KEY)).toEqual({ ok: false, reason: "cap-reached" });
  });

  it("PROJECTED cap: a near-cap buy that WOULD cross the dollar cap is refused (regression)", async () => {
    // spent 490 + a 50 buy = 540 > 500 cap → must reject BEFORE placement.
    aggregateSessionTotals.mockResolvedValue({ dollarSpent: 490, buyCount: 0 });
    expect(await forceBuy("BTC-USD", KEY)).toEqual({ ok: false, reason: "cap-reached" });
    expect(placeOrder).not.toHaveBeenCalled();
    expect(insertManualOrder).not.toHaveBeenCalled();
  });

  it("PROJECTED cap: a buy that lands exactly AT the cap is allowed", async () => {
    // spent 450 + a 50 buy = 500 == cap (not over) → allowed.
    aggregateSessionTotals.mockResolvedValue({ dollarSpent: 450, buyCount: 0 });
    expect(await forceBuy("BTC-USD", KEY)).toMatchObject({ ok: true, status: "dry_run" });
  });

  it("asset not in the strategy → invalid-asset", async () => {
    expect(await forceBuy("DOGE-USD", KEY)).toEqual({ ok: false, reason: "invalid-asset" });
    expect(insertManualOrder).not.toHaveBeenCalled();
  });

  it("no current session → no-session", async () => {
    sessionRows = [];
    expect(await forceBuy("BTC-USD", KEY)).toEqual({ ok: false, reason: "no-session" });
  });
});

describe("sellFraction — held-qty + gate", () => {
  it("no held position → no-position, no placement", async () => {
    aggregatePosition.mockReturnValue(null);
    const r = await sellFraction("BTC-USD", 0.5, "sell_50", KEY);
    expect(r).toEqual({ ok: false, reason: "no-position" });
    expect(placeOrder).not.toHaveBeenCalled();
    expect(insertManualOrder).not.toHaveBeenCalled();
  });

  it("LIVE_MODE=false + held position → dry_run sell row, placeOrder NEVER called", async () => {
    const r = await sellFraction("BTC-USD", 0.5, "sell_50", KEY);
    expect(r).toMatchObject({ ok: true, status: "dry_run", side: "sell" });
    expect(placeOrder).not.toHaveBeenCalled();
    expect(insertManualOrder).toHaveBeenCalledWith(expect.objectContaining({ side: "sell", kind: "sell_50", status: "dry_run" }));
  });

  it("LIVE_MODE=true sell_all → placeOrder called, submitted", async () => {
    liveModeMock = true;
    const r = await sellFraction("BTC-USD", 1, "sell_all", KEY);
    expect(placeOrder).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ ok: true, status: "submitted", side: "sell" });
  });
});

describe("idempotency (real-money dedupe; AC 4)", () => {
  it("same idempotencyKey → SAME clientOrderId (Coinbase collapses the duplicate)", async () => {
    liveModeMock = true;
    await forceBuy("BTC-USD", KEY);
    await forceBuy("BTC-USD", KEY);
    expect(placeOrder).toHaveBeenCalledTimes(2);
    const first = (placeOrder.mock.calls[0]?.[0] as { clientOrderId: string }).clientOrderId;
    const second = (placeOrder.mock.calls[1]?.[0] as { clientOrderId: string }).clientOrderId;
    expect(first).toBe(second);
  });

  it("different idempotencyKey → DIFFERENT clientOrderId (a genuine new action)", async () => {
    liveModeMock = true;
    await forceBuy("BTC-USD", "idem-action-1");
    await forceBuy("BTC-USD", "idem-action-2");
    const first = (placeOrder.mock.calls[0]?.[0] as { clientOrderId: string }).clientOrderId;
    const second = (placeOrder.mock.calls[1]?.[0] as { clientOrderId: string }).clientOrderId;
    expect(first).not.toBe(second);
  });
});

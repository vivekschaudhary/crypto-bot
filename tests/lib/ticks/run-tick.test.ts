// CB-6.5 unit tests for lib/ticks/run-tick.ts (runBotTick).
//
// The cron PATH (source:"cron") is covered end-to-end by the cron route test;
// here we pin the NEW behaviour: source:"manual" uses a PRECISE (non-floored)
// tick_started_at, plus the discriminated result kinds (ran/skipped/duplicate/
// error). Mocks the Coinbase wrapper + the two DB modules; real signals/
// decisions/cost-basis run (deterministic fixtures), mirroring the route test.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Candle } from "@/lib/coinbase/market-schemas";

const loadSingletonSession = vi.fn();
const aggregateSessionTotals = vi.fn();
const insertTickWithDecisions = vi.fn();
vi.mock("@/lib/ticks/db", () => ({
  loadSingletonSession: () => loadSingletonSession(),
  aggregateSessionTotals: (id: unknown) => aggregateSessionTotals(id),
  insertTickWithDecisions: (tick: unknown) => insertTickWithDecisions(tick),
}));

const getStrategyById = vi.fn();
vi.mock("@/lib/strategies/db", () => ({ getStrategyById: (id: unknown) => getStrategyById(id) }));

const getProductCandles = vi.fn();
const getProduct = vi.fn();
vi.mock("@/lib/coinbase/market", () => ({
  getProductCandles: (a: unknown) => getProductCandles(a),
  getProduct: (id: unknown) => getProduct(id),
}));

const getAccountTradeHistory = vi.fn();
vi.mock("@/lib/coinbase/accounts", () => ({ getAccountTradeHistory: (a: unknown) => getAccountTradeHistory(a) }));

const placeOrder = vi.fn();
vi.mock("@/lib/coinbase/orders", () => ({ placeOrder: (a: unknown) => placeOrder(a) }));

let liveModeMock = false;
vi.mock("@/lib/env", () => ({ env: () => ({ CRON_SECRET: "test-secret", LIVE_MODE: liveModeMock }) }));

// CB-6.8 — alerting hook. Spy on sendAlert; formatters are passthroughs.
const sendAlert = vi.fn();
vi.mock("@/lib/ops/alert", () => ({
  sendAlert: (t: unknown) => sendAlert(t),
  formatOrderFailureAlert: () => "ORDER_ALERT",
  formatTickErrorAlert: () => "TICK_ALERT",
}));

import { runBotTick } from "@/lib/ticks/run-tick";

const BTC = { assetClass: "crypto-coinbase", identifier: "BTC-USD" };

function makeStrategy() {
  return {
    id: "01H8XGJWBWBAQ4N7CHR3M9YT8K",
    name: "Test Strategy",
    asset_class: "crypto-coinbase",
    selected_assets: [BTC],
    entry_rules: { rsiThreshold: 30, maPeriod: 20, maReinforcement: false },
    exit_rules: { rsiThreshold: 70, minProfitPct: 1.5, sellFraction: 0.5 },
    position_size_usd: 50,
    per_session_buy_count_cap: 10,
    per_session_dollar_cap: 500,
    created_at: new Date("2026-06-10T00:00:00Z"),
    created_by_user_id: "01H8XGJWBWBAQ4N7CHR3M9YT8M",
    superseded_by_strategy_id: null,
  };
}

function makeCandles(closesOldestFirst: number[]): Candle[] {
  const nowSec = Math.floor(Date.now() / 1000);
  const n = closesOldestFirst.length;
  return closesOldestFirst
    .map((close, i) => {
      const startSec = nowSec - (n - i) * 3600;
      const c = String(close);
      return { start: String(startSec), low: c, high: c, open: c, close: c, volume: "10" };
    })
    .reverse();
}

const FLAT_30 = Array(30).fill(100) as number[]; // RSI=50 → hold (no order)
// Strictly declining → RSI≈0 (< entry threshold 30) → BUY decision (an order is built).
const DECLINING_30 = Array.from({ length: 30 }, (_, i) => 200 - i * 3) as number[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-11T14:07:33.250Z"));
  loadSingletonSession.mockResolvedValue({ id: "session-1", status: "active", activeStrategyId: "01H8XGJWBWBAQ4N7CHR3M9YT8K" });
  aggregateSessionTotals.mockResolvedValue({ dollarSpent: 0, buyCount: 0 });
  insertTickWithDecisions.mockResolvedValue(undefined);
  getStrategyById.mockResolvedValue(makeStrategy());
  getProductCandles.mockResolvedValue(makeCandles(FLAT_30));
  getAccountTradeHistory.mockResolvedValue({ fills: [] });
  getProduct.mockResolvedValue({ product_id: "BTC-USD", quote_increment: "0.01", base_increment: "0.00000001" });
  liveModeMock = false;
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("runBotTick — tick_started_at by source", () => {
  it('source:"cron" floors to the quarter-hour', async () => {
    const r = await runBotTick({ source: "cron" });
    expect(r.kind).toBe("ran");
    const tick = insertTickWithDecisions.mock.calls[0]?.[0] as { tickStartedAt: Date };
    expect(tick.tickStartedAt.toISOString()).toBe("2026-06-11T14:00:00.000Z");
    if (r.kind === "ran") expect(r.tickStartedAt.toISOString()).toBe("2026-06-11T14:00:00.000Z");
  });

  it('source:"manual" uses a PRECISE (non-floored) timestamp — never a cron-window duplicate', async () => {
    const r = await runBotTick({ source: "manual" });
    expect(r.kind).toBe("ran");
    const tick = insertTickWithDecisions.mock.calls[0]?.[0] as { tickStartedAt: Date };
    expect(tick.tickStartedAt.toISOString()).toBe("2026-06-11T14:07:33.250Z");
    if (r.kind === "ran") expect(r.tickStartedAt.toISOString()).toBe("2026-06-11T14:07:33.250Z");
  });
});

describe("runBotTick — result kinds", () => {
  it("no session → skipped(no_session), no write", async () => {
    loadSingletonSession.mockResolvedValue(null);
    const r = await runBotTick({ source: "manual" });
    expect(r).toMatchObject({ kind: "skipped", reason: "no_session" });
    expect(insertTickWithDecisions).not.toHaveBeenCalled();
  });

  it("paused session → skipped(session_paused)", async () => {
    loadSingletonSession.mockResolvedValue({ id: "s", status: "paused", activeStrategyId: "x" });
    const r = await runBotTick({ source: "manual" });
    expect(r).toMatchObject({ kind: "skipped", reason: "session_paused" });
  });

  it("duplicate (23505) → duplicate", async () => {
    insertTickWithDecisions.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "23505" }));
    const r = await runBotTick({ source: "manual" });
    expect(r.kind).toBe("duplicate");
  });

  it("FK anomaly (strategy missing) → error + tick_error audit row", async () => {
    getStrategyById.mockResolvedValue(null);
    const r = await runBotTick({ source: "manual" });
    expect(r.kind).toBe("error");
    if (r.kind === "error") expect(r.message).toContain("FK integrity anomaly");
    // best-effort error row written for the audit trail
    const errorRow = insertTickWithDecisions.mock.calls.at(-1)?.[0] as { reason: string };
    expect(errorRow.reason).toBe("tick_error");
  });
});

describe("CB-6.8 — failed-order + tick-error alerting (hook site)", () => {
  it("LIVE + a placement FAILURE on a buy → sendAlert fires", async () => {
    liveModeMock = true;
    getProductCandles.mockResolvedValue(makeCandles(DECLINING_30)); // RSI≈0 → buy
    placeOrder.mockResolvedValue({ success: false, error_response: { message: "rejected" } });
    const r = await runBotTick({ source: "cron" });
    expect(r.kind).toBe("ran");
    expect(placeOrder).toHaveBeenCalled();
    expect(sendAlert).toHaveBeenCalled();
  });

  it("dark (LIVE_MODE=false) dry_run buy → placeOrder + sendAlert NOT called", async () => {
    liveModeMock = false;
    getProductCandles.mockResolvedValue(makeCandles(DECLINING_30)); // buy decision, but paper
    const r = await runBotTick({ source: "cron" });
    expect(r.kind).toBe("ran");
    expect(placeOrder).not.toHaveBeenCalled();
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it("LIVE + a SUBMITTED (success) buy → sendAlert NOT called (success path)", async () => {
    liveModeMock = true;
    getProductCandles.mockResolvedValue(makeCandles(DECLINING_30));
    placeOrder.mockResolvedValue({ success: true, success_response: { order_id: "cb-1" } });
    await runBotTick({ source: "cron" });
    expect(placeOrder).toHaveBeenCalled();
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it("top-level tick error → sendAlert fires (tick-error alert, AC 3)", async () => {
    getStrategyById.mockResolvedValue(null); // FK anomaly → throws → outer catch
    const r = await runBotTick({ source: "cron" });
    expect(r.kind).toBe("error");
    expect(sendAlert).toHaveBeenCalled();
  });
});

// Unit tests for the CB-4.2 cron tick route.
//
// CB-4.2 AC 12 — mocks the Coinbase wrapper + the two DB modules; lets the
// REAL lib/signals + lib/decisions + cost-basis + helpers run (honest
// pipeline coverage — fixtures drive deterministic decisions through the
// actual math instead of stubbing it).
//
// Date is faked (vi.useFakeTimers toFake:['Date']) so tick_started_at
// flooring is assertable; setTimeout stays REAL so the fan-out stagger
// doesn't hang the run.

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Candle } from "@/lib/coinbase/market-schemas";

// ── Mocks ────────────────────────────────────────────────────────────────

const loadSingletonSession = vi.fn();
const aggregateSessionTotals = vi.fn();
const insertTickWithDecisions = vi.fn();
vi.mock("@/lib/ticks/db", () => ({
  loadSingletonSession: () => loadSingletonSession(),
  aggregateSessionTotals: (id: unknown) => aggregateSessionTotals(id),
  insertTickWithDecisions: (tick: unknown) => insertTickWithDecisions(tick),
}));

const getStrategyById = vi.fn();
vi.mock("@/lib/strategies/db", () => ({
  getStrategyById: (id: unknown) => getStrategyById(id),
}));

const getProductCandles = vi.fn();
const getProduct = vi.fn();
vi.mock("@/lib/coinbase/market", () => ({
  getProductCandles: (args: unknown) => getProductCandles(args),
  getProduct: (id: unknown) => getProduct(id),
}));

const getAccountTradeHistory = vi.fn();
vi.mock("@/lib/coinbase/accounts", () => ({
  getAccountTradeHistory: (args: unknown) => getAccountTradeHistory(args),
}));

const placeOrder = vi.fn();
vi.mock("@/lib/coinbase/orders", () => ({
  placeOrder: (args: unknown) => placeOrder(args),
}));

// LIVE_MODE is per-test mutable (CB-4.3 gate tests both directions).
let liveModeMock = false;
vi.mock("@/lib/env", () => ({
  env: () => ({ CRON_SECRET: "test-secret", LIVE_MODE: liveModeMock }),
}));

import { GET } from "@/app/api/cron/tick/route";

// ── Fixtures ─────────────────────────────────────────────────────────────

const BTC = { assetClass: "crypto-coinbase", identifier: "BTC-USD" };
const ETH = { assetClass: "crypto-coinbase", identifier: "ETH-USD" };

function makeStrategy(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  };
}

/**
 * Generate `n` ONE_HOUR candles ending now, NEWEST-FIRST (Coinbase's order)
 * with close prices from `closesOldestFirst` (oldest entry = oldest bar).
 */
function makeCandles(closesOldestFirst: number[]): Candle[] {
  const nowSec = Math.floor(Date.now() / 1000);
  const n = closesOldestFirst.length;
  return closesOldestFirst
    .map((close, i) => {
      const startSec = nowSec - (n - i) * 3600;
      const c = String(close);
      return {
        start: String(startSec),
        low: c,
        high: c,
        open: c,
        close: c,
        volume: "10",
      };
    })
    .reverse(); // newest-first like the real API
}

const FLAT_30 = Array(30).fill(100) as number[]; // RSI=50 → hold
const FALLING_30 = Array.from({ length: 30 }, (_, i) => 200 - i * 2); // RSI→0 → buy

function makeRequest(secret = "test-secret"): NextRequest {
  return new NextRequest("http://localhost/api/cron/tick", {
    headers: { authorization: `Bearer ${secret}` },
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-11T14:07:33.250Z"));

  loadSingletonSession.mockResolvedValue({
    id: "session-1",
    status: "active",
    activeStrategyId: "01H8XGJWBWBAQ4N7CHR3M9YT8K",
  });
  aggregateSessionTotals.mockResolvedValue({ dollarSpent: 0, buyCount: 0 });
  insertTickWithDecisions.mockResolvedValue(undefined);
  getStrategyById.mockResolvedValue(makeStrategy());
  getProductCandles.mockResolvedValue(makeCandles(FLAT_30));
  getAccountTradeHistory.mockResolvedValue({ fills: [] });
  getProduct.mockResolvedValue({
    product_id: "BTC-USD",
    volume_24h: "1",
    quote_increment: "0.01",
    base_increment: "0.00000001",
  });
  placeOrder.mockResolvedValue({
    success: true,
    success_response: {
      order_id: "cb-order-123",
      product_id: "BTC-USD",
      side: "BUY",
      client_order_id: "det-123",
    },
  });
  liveModeMock = false; // default dry-run; LIVE_MODE tests opt in
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ── Auth ─────────────────────────────────────────────────────────────────

describe("tick route — auth gates", () => {
  it("401 without authorization header", async () => {
    const res = await GET(new NextRequest("http://localhost/api/cron/tick"));
    expect(res.status).toBe(401);
    expect(insertTickWithDecisions).not.toHaveBeenCalled();
  });

  it("401 with wrong secret", async () => {
    const res = await GET(makeRequest("wrong-secret"));
    expect(res.status).toBe(401);
  });
});

// ── Early-outs (PM Decision #3: no tick row on skip) ────────────────────

describe("tick route — skip early-outs write NO bot_ticks row", () => {
  it.each([
    ["no_session", null],
    ["session_paused", { id: "s", status: "paused", activeStrategyId: null }],
    ["session_reset", { id: "s", status: "reset", activeStrategyId: null }],
  ])("skips with %s", async (reason, session) => {
    loadSingletonSession.mockResolvedValue(session);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe(reason);
    expect(insertTickWithDecisions).not.toHaveBeenCalled();
  });

  it("skips with no_active_strategy when the session has no strategy pointer", async () => {
    loadSingletonSession.mockResolvedValue({
      id: "session-1",
      status: "active",
      activeStrategyId: null,
    });
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.skipped).toBe("no_active_strategy");
    expect(getStrategyById).not.toHaveBeenCalled();
    expect(insertTickWithDecisions).not.toHaveBeenCalled();
  });
});

// ── Strategy resolution via the session pointer (PR #63 BLOCKER 1) ──────

describe("tick route — strategy resolution follows bot_sessions.active_strategy_id", () => {
  it("loads the strategy BY THE SESSION'S POINTER, not the latest-non-superseded read", async () => {
    await GET(makeRequest());
    expect(getStrategyById).toHaveBeenCalledWith("01H8XGJWBWBAQ4N7CHR3M9YT8K");
  });

  it("dangling pointer (FK anomaly) → 500 error path, NOT a quiet skip", async () => {
    getStrategyById.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("FK integrity anomaly");
    // The error row preserves the audit trail.
    const errorRow = insertTickWithDecisions.mock.calls[0]?.[0] as {
      reason: string;
    };
    expect(errorRow.reason).toBe("tick_error");
  });
});

// ── Happy paths through the REAL signal + decision math ──────────────────

describe("tick route — happy paths", () => {
  it("flat closes → hold; one tick row + one per-asset signal row; floored tick_started_at", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.decisions).toHaveLength(1);
    expect(body.decisions[0].decision).toBe("hold");
    expect(body.tickStartedAt).toBe("2026-06-11T14:00:00.000Z"); // AC 4 floor

    expect(insertTickWithDecisions).toHaveBeenCalledTimes(1);
    const tick = insertTickWithDecisions.mock.calls[0]?.[0] as {
      decision: string;
      reason: string;
      tickStartedAt: Date;
      signals: { assetIdentifier: string; rsi: number | null; maPeriod: number }[];
    };
    expect(tick.decision).toBe("hold");
    expect(tick.reason).toBe("BTC-USD: hold");
    expect(tick.tickStartedAt.toISOString()).toBe("2026-06-11T14:00:00.000Z");
    expect(tick.signals).toHaveLength(1);
    expect(tick.signals[0]?.assetIdentifier).toBe("BTC-USD");
    expect(tick.signals[0]?.rsi).toBe(50); // flat series → Wilder RSI 50
    expect(tick.signals[0]?.maPeriod).toBe(20);
  });

  it("falling closes + no position → buy (real rsi/evaluate produce the decision)", async () => {
    getProductCandles.mockResolvedValue(makeCandles(FALLING_30));
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.decisions[0].decision).toBe("buy");
    expect(body.decisions[0].reason).toContain("rsi=0.00 < entry_threshold=30");

    const tick = insertTickWithDecisions.mock.calls[0]?.[0] as {
      decision: string;
    };
    expect(tick.decision).toBe("buy"); // aggregate (AC 6)
  });

  it("multi-asset: decisions in selected_assets order; compact summary reason", async () => {
    getStrategyById.mockResolvedValue(
      makeStrategy({ selected_assets: [BTC, ETH] }),
    );
    getProductCandles.mockImplementation((args: unknown) => {
      const { productId } = args as { productId: string };
      return Promise.resolve(
        makeCandles(productId === "BTC-USD" ? FALLING_30 : FLAT_30),
      );
    });

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.decisions.map((d: { asset: string }) => d.asset)).toEqual([
      "BTC-USD",
      "ETH-USD",
    ]);
    const tick = insertTickWithDecisions.mock.calls[0]?.[0] as {
      reason: string;
      signals: unknown[];
    };
    expect(tick.reason).toBe("BTC-USD: buy; ETH-USD: hold");
    expect(tick.signals).toHaveLength(2);
  });

  it("insufficient bars → hold; null rsi persists in the signal row (AC 12)", async () => {
    getProductCandles.mockResolvedValue(makeCandles([100, 101, 102, 103, 104]));
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.decisions[0].decision).toBe("hold");
    expect(body.decisions[0].reason).toContain("insufficient signal data");

    const tick = insertTickWithDecisions.mock.calls[0]?.[0] as {
      signals: { rsi: number | null; ma: number | null }[];
    };
    expect(tick.signals[0]?.rsi).toBeNull();
    expect(tick.signals[0]?.ma).toBeNull();
  });

  it("open position with profit + overbought RSI → sell flows through cost-basis + evaluate", async () => {
    // Rising-then-overbought series: monotonic up → RSI 100 > 70. Position
    // bought at 100; lastClose 158 → profit >> min 1.5% → sell.
    const rising = Array.from({ length: 30 }, (_, i) => 100 + i * 2);
    getProductCandles.mockResolvedValue(makeCandles(rising));
    getAccountTradeHistory.mockResolvedValue({
      fills: [
        {
          entry_id: "e1",
          trade_id: "t1",
          order_id: "o1",
          trade_time: "2026-06-01T00:00:00Z",
          price: "100",
          size: "1",
          product_id: "BTC-USD",
          side: "BUY",
        },
      ],
    });
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.decisions[0].decision).toBe("sell");
    expect(body.decisions[0].reason).toContain("profit=");
  });
});

// ── Duplicate + error paths ──────────────────────────────────────────────

describe("tick route — duplicate handling (AC 5: loud, narrow)", () => {
  it("23505 unique violation → 200 {duplicate: true}; no error row", async () => {
    const dup = Object.assign(new Error("duplicate key"), { code: "23505" });
    insertTickWithDecisions.mockRejectedValueOnce(dup);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.duplicate).toBe(true);
    // Only the original insert attempt — NOT a second error-row write.
    expect(insertTickWithDecisions).toHaveBeenCalledTimes(1);
  });

  it("non-23505 insert error → 500 + error row written (AC 8)", async () => {
    const dbErr = Object.assign(new Error("connection lost"), { code: "08006" });
    insertTickWithDecisions.mockRejectedValueOnce(dbErr);
    insertTickWithDecisions.mockResolvedValueOnce(undefined); // the error row
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    expect(insertTickWithDecisions).toHaveBeenCalledTimes(2);
    const errorRow = insertTickWithDecisions.mock.calls[1]?.[0] as {
      reason: string;
      errorDetail: string;
      signals: unknown[];
    };
    expect(errorRow.reason).toBe("tick_error");
    expect(errorRow.errorDetail).toContain("connection lost");
    expect(errorRow.signals).toHaveLength(0);
  });

  it("error row stays in the INVOCATION's window even when the failure crosses a quarter-hour boundary (PR #63 BLOCKER 2 regression)", async () => {
    // Invocation starts at 14:14:59 (window 14:00). The failing fetch
    // advances the clock past the 14:15 boundary before rejecting. The
    // earlier draft recomputed the floor in the catch → error row at
    // 14:15, squatting on the NEXT tick's UNIQUE slot. The fix anchors
    // tick_started_at to the invocation start.
    vi.setSystemTime(new Date("2026-06-11T14:14:59.000Z"));
    getProductCandles.mockImplementation(() => {
      vi.setSystemTime(new Date("2026-06-11T14:15:01.000Z"));
      return Promise.reject(new Error("slow upstream"));
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const errorRow = insertTickWithDecisions.mock.calls[0]?.[0] as {
      tickStartedAt: Date;
    };
    expect(errorRow.tickStartedAt.toISOString()).toBe(
      "2026-06-11T14:00:00.000Z",
    );
  });

  it("error_detail is sanitized — token-shaped material never reaches the row (PR #63 security closure)", async () => {
    // JWT fixture assembled at runtime — no literal 3-part token in
    // source, so secret scanners stay green (PR #63 round-2 CI fix).
    const fakeJwt = ["eyJhbGciOiJFUzI1NiJ9", "eyJzdWIiOiJ4In0", "c2lnbmF0dXJl"].join(".");
    getProductCandles.mockRejectedValue(
      new Error(`request failed with Authorization: Bearer ${fakeJwt}`),
    );
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const errorRow = insertTickWithDecisions.mock.calls[0]?.[0] as {
      errorDetail: string;
    };
    expect(errorRow.errorDetail).not.toContain("eyJ");
    expect(errorRow.errorDetail).toContain("[REDACTED");
  });

  it("coinbase fetch failure → 500 + error row (AC 8)", async () => {
    getProductCandles.mockRejectedValue(new Error("coinbase 502"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain("coinbase 502");
    const errorRow = insertTickWithDecisions.mock.calls[0]?.[0] as {
      reason: string;
      errorDetail: string;
    };
    expect(errorRow.reason).toBe("tick_error");
    expect(errorRow.errorDetail).toContain("coinbase 502");
  });
});

// ── CB-4.3: LIVE_MODE gate + unified ledger ──────────────────────────────

describe("tick route — LIVE_MODE gate (CB-4.3 AC 3/4/7)", () => {
  // A falling series → buy decision; gives us a buy/sell to gate on.
  function buyStrategy() {
    getProductCandles.mockResolvedValue(makeCandles(FALLING_30));
  }

  it("LIVE_MODE=false + buy decision → dry_run ledger row, placeOrder NEVER called", async () => {
    liveModeMock = false;
    buyStrategy();
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(placeOrder).not.toHaveBeenCalled();
    const tick = insertTickWithDecisions.mock.calls[0]?.[0] as {
      orders: { status: string; coinbaseOrderId: string | null; side: string; amount: number }[];
    };
    expect(tick.orders).toHaveLength(1);
    expect(tick.orders[0]?.status).toBe("dry_run");
    expect(tick.orders[0]?.coinbaseOrderId).toBeNull();
    expect(tick.orders[0]?.side).toBe("buy");
    expect(tick.orders[0]?.amount).toBe(50); // position_size_usd
  });

  it("LIVE_MODE=true + buy decision → placeOrder called + submitted row + coinbase_order_id", async () => {
    liveModeMock = true;
    buyStrategy();
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(placeOrder).toHaveBeenCalledTimes(1);
    const placeArgs = placeOrder.mock.calls[0]?.[0] as {
      side: string;
      clientOrderId: string;
      orderConfiguration: { limit_limit_gtc?: unknown };
    };
    expect(placeArgs.side).toBe("BUY");
    expect(placeArgs.clientOrderId).toMatch(/^[a-z0-9]{32}$/); // deterministic
    expect(placeArgs.orderConfiguration).toHaveProperty("limit_limit_gtc");
    const tick = insertTickWithDecisions.mock.calls[0]?.[0] as {
      orders: { status: string; coinbaseOrderId: string | null }[];
    };
    expect(tick.orders[0]?.status).toBe("submitted");
    expect(tick.orders[0]?.coinbaseOrderId).toBe("cb-order-123");
  });

  it("LIVE_MODE=true + hold decision → NO placeOrder, NO orders row", async () => {
    liveModeMock = true;
    getProductCandles.mockResolvedValue(makeCandles(FLAT_30)); // RSI 50 → hold
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(placeOrder).not.toHaveBeenCalled();
    const tick = insertTickWithDecisions.mock.calls[0]?.[0] as { orders: unknown[] };
    expect(tick.orders).toHaveLength(0);
  });

  it("LIVE_MODE=true + Coinbase error_response → failed row, tick still 200", async () => {
    liveModeMock = true;
    buyStrategy();
    placeOrder.mockResolvedValue({
      success: false,
      error_response: { error: "INSUFFICIENT_FUND", message: "not enough USD" },
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200); // tick survives
    const tick = insertTickWithDecisions.mock.calls[0]?.[0] as {
      orders: { status: string; errorDetail: string | null }[];
    };
    expect(tick.orders[0]?.status).toBe("failed");
    expect(tick.orders[0]?.errorDetail).toContain("not enough USD");
  });

  it("LIVE_MODE=true + placeOrder throws → failed row, tick still 200 (per-asset isolation)", async () => {
    liveModeMock = true;
    buyStrategy();
    placeOrder.mockRejectedValue(new Error("coinbase 503"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const tick = insertTickWithDecisions.mock.calls[0]?.[0] as {
      orders: { status: string; errorDetail: string | null }[];
    };
    expect(tick.orders[0]?.status).toBe("failed");
    expect(tick.orders[0]?.errorDetail).toContain("coinbase 503");
  });

  it("per-asset isolation: one asset's order failure does not block a sibling's success", async () => {
    liveModeMock = true;
    getStrategyById.mockResolvedValue(
      makeStrategy({ selected_assets: [BTC, ETH] }),
    );
    getProductCandles.mockResolvedValue(makeCandles(FALLING_30)); // both buy
    // BTC fails, ETH succeeds.
    placeOrder.mockImplementation((args: { productId: string }) => {
      if (args.productId === "BTC-USD") return Promise.reject(new Error("min size"));
      return Promise.resolve({
        success: true,
        success_response: {
          order_id: "cb-eth-9",
          product_id: "ETH-USD",
          side: "BUY",
          client_order_id: "x",
        },
      });
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const tick = insertTickWithDecisions.mock.calls[0]?.[0] as {
      orders: { assetIdentifier: string; status: string }[];
    };
    const byAsset = Object.fromEntries(tick.orders.map((o) => [o.assetIdentifier, o.status]));
    expect(byAsset["BTC-USD"]).toBe("failed");
    expect(byAsset["ETH-USD"]).toBe("submitted");
  });

  it("AC 9 leg (c): a live order's coinbase_order_id is logged BEFORE the DB write, so it survives a DB-write failure (PR #65 review finding)", async () => {
    liveModeMock = true;
    getProductCandles.mockResolvedValue(makeCandles(FALLING_30)); // buy
    placeOrder.mockResolvedValue({
      success: true,
      success_response: {
        order_id: "cb-survives-123",
        product_id: "BTC-USD",
        side: "BUY",
        client_order_id: "x",
      },
    });
    // The DB transaction fails AFTER the order was placed (the dual-write window).
    insertTickWithDecisions.mockRejectedValueOnce(
      Object.assign(new Error("connection lost"), { code: "08006" }),
    );
    insertTickWithDecisions.mockResolvedValueOnce(undefined); // the error row

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const res = await GET(makeRequest());
      expect(res.status).toBe(500); // DB write failed → tick error
      // The placement was logged independently of the (rolled-back) DB row,
      // so the real order id is recoverable from the log drain.
      const placementLog = logSpy.mock.calls
        .map((c) => String(c[0]))
        .find((line) => line.includes('"event":"bot_order_placed"'));
      expect(placementLog).toBeDefined();
      expect(placementLog).toContain('"coinbase_order_id":"cb-survives-123"');
      expect(placementLog).toContain('"status":"submitted"');
    } finally {
      logSpy.mockRestore();
    }
  });

  it("dry-run placements emit NO bot_order_placed log (nothing real was placed)", async () => {
    liveModeMock = false;
    getProductCandles.mockResolvedValue(makeCandles(FALLING_30)); // buy
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await GET(makeRequest());
      const placementLog = logSpy.mock.calls
        .map((c) => String(c[0]))
        .find((line) => line.includes('"event":"bot_order_placed"'));
      expect(placementLog).toBeUndefined();
    } finally {
      logSpy.mockRestore();
    }
  });
});

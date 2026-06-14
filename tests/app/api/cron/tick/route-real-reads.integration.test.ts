// Route-level end-to-end test against REAL Coinbase reads, in DRY-RUN.
//
// CB-4.3 AC 13(b) (PR #65 — closes Codex's "AC 13 not exercised through the
// cron route" finding, per PM-arbitrated split). Drives the real cron GET
// with LIVE_MODE=false against REAL Coinbase market reads (candles +
// trade history) and a CAPTURE-MOCKED DB — so the full route pipeline
// (buildPerAssetSignal → evaluate → buildOrderRows → persist) runs against
// real market data and we assert the dry_run orders row it builds, WITHOUT
// placing any real order or writing to the production DB.
//
// Why dry-run: the route prices limits across the spread (close × 1±0.5%),
// so a real placement through the route fills instantly. Real placement is
// covered safely + far-from-market in real-order.integration.test.ts (AC
// 13a). This test covers the "through the route, real data" leg (AC 13b).
//
// GATED — same triple gate as the wrapper test (does NOT run in CI):
//   RUN_REAL_ORDER_TESTS=1 + real COINBASE creds + CRON_SECRET. Run:
//     RUN_REAL_ORDER_TESTS=1 pnpm vitest run \
//       tests/app/api/cron/tick/route-real-reads.integration.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENABLED =
  process.env.RUN_REAL_ORDER_TESTS === "1" &&
  !!process.env.COINBASE_API_KEY_NAME &&
  !!process.env.COINBASE_API_PRIVATE_KEY &&
  !!process.env.CRON_SECRET;

// Capture-mock ONLY the DB + placeOrder. Coinbase market/accounts READS are
// REAL (not mocked). env() is REAL (the Coinbase client needs real creds).
const insertTickWithDecisions = vi.fn(async (_tick: unknown) => undefined);
const loadSingletonSession = vi.fn(async () => ({
  id: "integration-session",
  status: "active" as const,
  activeStrategyId: "integration-strategy",
}));
const aggregateSessionTotals = vi.fn(async (_id: unknown) => ({
  dollarSpent: 0,
  buyCount: 0,
}));

vi.mock("@/lib/ticks/db", () => ({
  loadSingletonSession: () => loadSingletonSession(),
  aggregateSessionTotals: (id: unknown) => aggregateSessionTotals(id),
  insertTickWithDecisions: (tick: unknown) => insertTickWithDecisions(tick),
}));

// Forced-buy strategy: rsiThreshold 100 → rsi < 100 (almost always) → buy,
// so the route deterministically produces a buy decision against real data.
// Single asset to bound the real read fan-out.
const getStrategyById = vi.fn(async () => ({
  id: "integration-strategy",
  name: "Integration",
  asset_class: "crypto-coinbase",
  selected_assets: [{ assetClass: "crypto-coinbase", identifier: "BTC-USD" }],
  entry_rules: { rsiThreshold: 100, maPeriod: 20, maReinforcement: false },
  exit_rules: { rsiThreshold: 70, minProfitPct: 1.5, sellFraction: 0.5 },
  position_size_usd: 1,
  per_session_buy_count_cap: 10,
  per_session_dollar_cap: 500,
  created_at: new Date("2026-06-14T00:00:00Z"),
  created_by_user_id: "u",
  superseded_by_strategy_id: null,
}));
vi.mock("@/lib/strategies/db", () => ({
  getStrategyById: () => getStrategyById(),
}));

// Guard: placeOrder must NEVER be called in dry-run. If the gate regresses,
// this throws loudly rather than silently placing a real order.
const placeOrder = vi.fn((_a: unknown) => {
  throw new Error("placeOrder must NOT be called in dry-run route test");
});
vi.mock("@/lib/coinbase/orders", () => ({
  placeOrder: (a: unknown) => placeOrder(a),
}));

const d = ENABLED ? describe : describe.skip;

d("cron route — end-to-end against REAL Coinbase reads (dry-run)", () => {
  beforeEach(() => {
    insertTickWithDecisions.mockClear();
    placeOrder.mockClear();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("builds a dry_run BTC-USD orders row from real market data, places nothing", async () => {
    const { NextRequest } = await import("next/server");
    const { GET } = await import("@/app/api/cron/tick/route");

    const req = new NextRequest("http://localhost/api/cron/tick", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);

    // No real order placed.
    expect(placeOrder).not.toHaveBeenCalled();

    // The route persisted a tick with a dry_run BTC-USD orders row + a
    // signals row carrying REAL rsi/ma computed from live candles.
    expect(insertTickWithDecisions).toHaveBeenCalledTimes(1);
    const tick = insertTickWithDecisions.mock.calls[0]?.[0] as {
      orders: { assetIdentifier: string; status: string; side: string; coinbaseOrderId: string | null }[];
      signals: { assetIdentifier: string; rsi: number | null; ma: number | null }[];
    };
    const order = tick.orders.find((o) => o.assetIdentifier === "BTC-USD");
    expect(order).toBeDefined();
    expect(order?.status).toBe("dry_run");
    expect(order?.side).toBe("buy");
    expect(order?.coinbaseOrderId).toBeNull();
    const sig = tick.signals.find((s) => s.assetIdentifier === "BTC-USD");
    expect(sig?.rsi).not.toBeNull(); // real RSI computed from live candles
  });
});

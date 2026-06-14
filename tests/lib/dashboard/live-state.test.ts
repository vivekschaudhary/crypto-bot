// Unit tests for lib/dashboard/live-state.ts (CB-5.0 read model).
//
// Recording-mock DB (routes by query text) + mocked Coinbase + strategy +
// env. Lets the REAL aggregatePosition run on mocked fills. The
// load-bearing assertion: the session-activity query INCLUDES dry_run
// (contrast aggregateSessionTotals, which excludes it for caps).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Fill } from "@/lib/coinbase/account-schemas";

// ── DB recording mock (routes results by query text) ──────────────────────
const capturedQueries: string[] = [];
let hasSession = true;

function sqlMock(strings: TemplateStringsArray, ...values: unknown[]) {
  const text = strings.join("?");
  capturedQueries.push(text);
  if (/FROM bot_sessions/.test(text)) {
    return Promise.resolve(
      hasSession
        ? [{ id: "session-1", status: "active", started_at: new Date("2026-06-12T21:45:00Z") }]
        : [],
    );
  }
  if (/FROM orders/.test(text)) {
    return Promise.resolve([{ buy_count: 3, total_invested: 150 }]);
  }
  return Promise.resolve([]);
  void values;
}
vi.mock("@/lib/db/client", () => ({ db: () => sqlMock }));

// ── Coinbase + strategy + env mocks ───────────────────────────────────────
const getAccountTradeHistory = vi.fn();
vi.mock("@/lib/coinbase/accounts", () => ({
  getAccountTradeHistory: (args: unknown) => getAccountTradeHistory(args),
}));

const getActiveStrategy = vi.fn();
vi.mock("@/lib/strategies/db", () => ({
  getActiveStrategy: () => getActiveStrategy(),
}));

let liveModeMock = false;
vi.mock("@/lib/env", () => ({ env: () => ({ LIVE_MODE: liveModeMock }) }));

import { loadLiveState } from "@/lib/dashboard/live-state";

function makeFill(o: Partial<Fill>): Fill {
  return {
    entry_id: "e", trade_id: "t", order_id: "o", trade_time: "2026-06-01T00:00:00Z",
    price: "100", size: "1", product_id: "BTC-USD", side: "BUY", ...o,
  } as Fill;
}

function strategyWith(ids: string[]) {
  return {
    selected_assets: ids.map((identifier) => ({ assetClass: "crypto-coinbase", identifier })),
  };
}

beforeEach(() => {
  capturedQueries.length = 0;
  hasSession = true;
  liveModeMock = false;
  getActiveStrategy.mockResolvedValue(strategyWith(["BTC-USD", "ETH-USD"]));
  getAccountTradeHistory.mockImplementation((args: { productIds: string[] }) =>
    args.productIds[0] === "BTC-USD"
      ? Promise.resolve({ fills: [makeFill({ product_id: "BTC-USD", price: "42000", size: "0.001" })] })
      : Promise.resolve({ fills: [] }), // ETH: no position
  );
});
afterEach(() => vi.clearAllMocks());

describe("loadLiveState — session activity INCLUDES dry_run (CB-5.0 load-bearing distinction)", () => {
  it("the activity query counts non-failed bot buys WITHOUT excluding dry_run", async () => {
    await loadLiveState();
    const activityQ = capturedQueries.find((q) => /FROM orders/.test(q)) ?? "";
    expect(activityQ).toContain("status <> 'failed'");
    // Must NOT exclude dry_run (that's the cap-totals predicate, not this one).
    expect(activityQ).not.toContain("dry_run");
    expect(activityQ).not.toContain("NOT IN");
  });

  it("returns the activity counts", async () => {
    const state = await loadLiveState();
    expect(state.activity).toEqual({ buyCount: 3, totalInvestedUsd: 150 });
  });
});

describe("loadLiveState — holdings from real Coinbase fills", () => {
  it("composes aggregatePosition per asset; no-fills asset → null position", async () => {
    const state = await loadLiveState();
    expect(state.holdings).not.toBeNull();
    const btc = state.holdings?.find((h) => h.assetIdentifier === "BTC-USD");
    const eth = state.holdings?.find((h) => h.assetIdentifier === "ETH-USD");
    expect(btc?.position).toEqual({ quantity: 0.001, avgCostUsd: 42000 });
    expect(eth?.position).toBeNull();
  });

  it("Coinbase failure → holdings null (panel degrades, page intact)", async () => {
    getAccountTradeHistory.mockRejectedValue(new Error("coinbase 503"));
    const state = await loadLiveState();
    expect(state.holdings).toBeNull(); // degraded
    expect(state.session).not.toBeNull(); // rest of page intact
    expect(state.activity.buyCount).toBe(3);
  });
});

describe("loadLiveState — session + mode", () => {
  it("no session → session null, holdings empty, activity zero; no orders/strategy reads", async () => {
    hasSession = false;
    const state = await loadLiveState();
    expect(state.session).toBeNull();
    expect(state.holdings).toEqual([]);
    expect(state.activity).toEqual({ buyCount: 0, totalInvestedUsd: 0 });
    expect(capturedQueries.some((q) => /FROM orders/.test(q))).toBe(false);
  });

  it("liveMode passes through from env()", async () => {
    liveModeMock = true;
    const state = await loadLiveState();
    expect(state.liveMode).toBe(true);
  });

  it("active session exposes status + startedAt", async () => {
    const state = await loadLiveState();
    expect(state.session?.status).toBe("active");
    expect(state.session?.startedAt.toISOString()).toBe("2026-06-12T21:45:00.000Z");
  });
});

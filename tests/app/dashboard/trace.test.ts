// CB-5.1 — DecisionTracePage render tests. Mirrors tests/app/dashboard.test.ts:
// render the async Server Component + JSON.stringify its element tree +
// assert DIRECT-JSX content (the bounded note, reasons, error detail, empty
// state are all in DecisionTracePage's own return — captured; the
// LiveModeBanner child's text is NOT, so it's e2e-covered instead).
//
// Closes PR #71 round-1 BLOCKER: AC 7's bounded-note RENDER was previously
// only proven at the read-model layer (hasMore flag), not at the page.

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DecisionTrace } from "@/lib/dashboard/decision-trace";

const hoisted = vi.hoisted(() => ({
  trace: { ticks: [], hasMore: false } as DecisionTrace,
}));

vi.mock("@/lib/dashboard/decision-trace", () => ({
  loadDecisionTrace: vi.fn(async () => hoisted.trace),
}));
vi.mock("@/lib/env", () => ({ env: () => ({ LIVE_MODE: false }) }));
vi.mock("@/app/dashboard/sign-out-client", () => ({ SignOutClient: () => null }));

import DecisionTracePage from "@/app/dashboard/trace/page";

const BOUNDED_NOTE = "Showing the 50 most recent ticks. Older ticks not shown.";

function tick(over: Partial<DecisionTrace["ticks"][number]> = {}) {
  return {
    id: "t1",
    tickStartedAt: new Date("2026-06-14T17:00:00Z"),
    decision: "buy" as const,
    reason: "BTC-USD: buy",
    errorDetail: null,
    signals: [
      {
        assetIdentifier: "BTC-USD",
        decision: "buy" as const,
        rsi: 27.3,
        ma: 42010,
        maPeriod: 20,
        lastClose: 41900,
        reason: "buy: rsi=27.30 < entry_threshold=30; buy $50 BTC-USD",
      },
    ],
    ...over,
  };
}

beforeEach(() => {
  hoisted.trace = { ticks: [], hasMore: false };
});

describe("DecisionTracePage render", () => {
  it("renders the bounded note when hasMore=true (AC 7)", async () => {
    hoisted.trace = { ticks: [tick()], hasMore: true };
    const json = JSON.stringify(await DecisionTracePage());
    expect(json).toContain(BOUNDED_NOTE);
  });

  it("does NOT render the bounded note when hasMore=false", async () => {
    hoisted.trace = { ticks: [tick()], hasMore: false };
    const json = JSON.stringify(await DecisionTracePage());
    expect(json).not.toContain(BOUNDED_NOTE);
  });

  it("renders a tick's reason + per-asset signal reason verbatim", async () => {
    hoisted.trace = { ticks: [tick()], hasMore: false };
    const json = JSON.stringify(await DecisionTracePage());
    expect(json).toContain("buy: rsi=27.30 < entry_threshold=30; buy $50 BTC-USD");
    expect(json).toContain("BTC-USD");
  });

  it("renders the error tick's error_detail (verbatim) and the ⚠ error marker", async () => {
    hoisted.trace = {
      ticks: [tick({ id: "terr", decision: "hold", reason: "tick_error", errorDetail: "coinbase 502", signals: [] })],
      hasMore: false,
    };
    const json = JSON.stringify(await DecisionTracePage());
    expect(json).toContain("coinbase 502");
    expect(json).toContain("error");
  });

  it("renders the empty state when there are no ticks", async () => {
    hoisted.trace = { ticks: [], hasMore: false };
    const json = JSON.stringify(await DecisionTracePage());
    expect(json).toContain("No decisions logged yet.");
    expect(json).not.toContain(BOUNDED_NOTE);
  });

  it("renders null rsi/ma as em dash, not 0", async () => {
    hoisted.trace = {
      ticks: [
        tick({
          signals: [
            { assetIdentifier: "ETH-USD", decision: "hold", rsi: null, ma: null, maPeriod: null, lastClose: null, reason: "hold: insufficient signal data" },
          ],
        }),
      ],
      hasMore: false,
    };
    const json = JSON.stringify(await DecisionTracePage());
    expect(json).toContain("—");
  });
});

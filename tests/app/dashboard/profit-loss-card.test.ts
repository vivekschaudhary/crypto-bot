// CB-6.2 — render test for the Profit/Loss card (JSON.stringify pattern).

import { describe, expect, it } from "vitest";

import { ProfitLossCard } from "@/app/dashboard/profit-loss-card";
import type { CockpitPnl } from "@/lib/dashboard/cockpit-pnl";

function data(over: Partial<CockpitPnl> = {}): CockpitPnl {
  return {
    pair: "ETH-USD",
    invested: 150,
    buys: 4,
    currentValue: 123.68,
    unrealizedPnlUsd: -26.32,
    realizedPnlUsd: 0,
    unrealizedPct: -0.1755,
    paper: false,
    ...over,
  };
}

describe("ProfitLossCard", () => {
  it("renders invested + buys + current value + signed P&L + realized", () => {
    const json = JSON.stringify(ProfitLossCard({ data: data() }));
    expect(json).toContain("TOTAL INVESTED");
    expect(json).toContain("$150.00");
    expect(json).toContain("4 buys this session");
    expect(json).toContain("CURRENT VALUE");
    expect(json).toContain("$123.68");
    expect(json).toContain("−$26.32"); // signed unrealized (minus glyph)
    expect(json).toContain("Realized:");
    expect(json).toContain("$0.00"); // zero realized is neutral/unsigned (copy.md)
    expect(json).not.toContain("+$0.00"); // not signed for zero
  });

  it("singular buy pluralization", () => {
    expect(JSON.stringify(ProfitLossCard({ data: data({ buys: 1 }) }))).toContain("1 buy this session");
  });

  it("Coinbase-degraded (value + realized null) → 'P&L unavailable'", () => {
    const json = JSON.stringify(ProfitLossCard({ data: data({ currentValue: null, unrealizedPnlUsd: null, realizedPnlUsd: null, unrealizedPct: null }) }));
    expect(json).toContain("P&L unavailable");
    expect(json).toContain("$150.00"); // invested still renders
  });

  it("paper=true → shows the Paper badge; paper=false → does not (CB-6.7)", () => {
    expect(JSON.stringify(ProfitLossCard({ data: data({ paper: true }) }))).toContain("Paper");
    expect(JSON.stringify(ProfitLossCard({ data: data({ paper: false }) }))).not.toContain("Paper");
  });

  it("flat (no position) → unrealized em dash", () => {
    const json = JSON.stringify(ProfitLossCard({ data: data({ currentValue: 0, unrealizedPnlUsd: null, unrealizedPct: null, realizedPnlUsd: 0 }) }));
    expect(json).toContain("—");
  });
});

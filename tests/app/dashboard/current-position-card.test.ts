// CB-6.1 — render test for the Current Position card (JSON.stringify pattern).

import { describe, expect, it } from "vitest";

import { CurrentPositionCard } from "@/app/dashboard/current-position-card";
import type { CockpitPosition } from "@/lib/dashboard/cockpit-position";

function data(over: Partial<CockpitPosition> = {}): CockpitPosition {
  return {
    pair: "ETH-USD",
    position: { quantity: 0.069004, avgCostUsd: 2173.78 },
    livePrice: 1792.39,
    rsi: 50,
    paper: false,
    ...over,
  };
}

describe("CurrentPositionCard", () => {
  it("paper=true → shows the Paper badge; paper=false → does not (CB-6.7)", () => {
    expect(JSON.stringify(CurrentPositionCard({ data: data({ paper: true }) }))).toContain("Paper");
    expect(JSON.stringify(CurrentPositionCard({ data: data({ paper: false }) }))).not.toContain("Paper");
  });

  it("renders held qty + avg cost + live price + RSI", () => {
    const json = JSON.stringify(CurrentPositionCard({ data: data() }));
    expect(json).toContain("ETH HELD");
    expect(json).toContain("0.069004");
    expect(json).toContain("$2,173.78");
    expect(json).toContain("LIVE PRICE");
    expect(json).toContain("$1,792.39");
    expect(json).toContain("RSI:");
    expect(json).toContain("50");
  });

  it("no position → 'No position yet'", () => {
    const json = JSON.stringify(CurrentPositionCard({ data: data({ position: null }) }));
    expect(json).toContain("No position yet");
  });

  it("null live price → 'Live price unavailable'", () => {
    const json = JSON.stringify(CurrentPositionCard({ data: data({ livePrice: null }) }));
    expect(json).toContain("Live price unavailable");
  });

  it("null RSI → em dash", () => {
    const json = JSON.stringify(CurrentPositionCard({ data: data({ rsi: null }) }));
    expect(json).toContain("—");
  });
});

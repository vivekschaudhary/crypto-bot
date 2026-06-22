// CB-6.3 — render test for the Signals + Next Action card (JSON.stringify
// pattern). Cell text is built as single strings in the card, so toContain
// sees contiguous values (the CB-6.1 split-text-node lesson). The load-bearing
// assertion: the RSI zone is STRATEGY-relative, not hardcoded 30/70.

import { describe, expect, it } from "vitest";

import { SignalsCard } from "@/app/dashboard/signals-card";
import type { CockpitSignal } from "@/lib/dashboard/cockpit-signals";

function sig(over: Partial<CockpitSignal> = {}): CockpitSignal {
  return {
    pair: "ETH-USD",
    rsi: 42.1,
    ma: 1740.1,
    maPeriod: 20,
    lastClose: 1792.39,
    decision: "hold",
    reason: "hold: rsi=42.10 < entry_threshold=30 BUT price>=ma20; no buy at ETH-USD",
    ...over,
  };
}
function render(
  signal: CockpitSignal,
  entry = 30,
  exit = 70,
  maPeriod = 20,
  hasRealPosition = true,
): string {
  return JSON.stringify(
    SignalsCard({ signal, hasRealPosition, entryRsiThreshold: entry, exitRsiThreshold: exit, maPeriod }),
  );
}

describe("SignalsCard", () => {
  it("renders RSI zone + price-vs-MA + next action + reason verbatim", () => {
    const json = render(sig());
    expect(json).toContain("RSI ZONE");
    expect(json).toContain("42.1");
    expect(json).toContain("Neutral"); // 42.1 between entry 30 and exit 70
    expect(json).toContain("PRICE vs MA20");
    expect(json).toContain("Above"); // 1792.39 > 1740.10
    expect(json).toContain("NEXT ACTION");
    expect(json).toContain("HOLD");
    expect(json).toContain("hold: rsi=42.10 < entry_threshold=30 BUT price>=ma20; no buy at ETH-USD");
  });

  it("zone is STRATEGY-relative (Oversold above 30 when entry=40, not generic 30/70)", () => {
    const json = render(sig({ rsi: 35 }), 40, 70);
    expect(json).toContain("Oversold");
    expect(json).not.toContain("Neutral");
  });

  it("zone is STRATEGY-relative (Overbought below 70 when exit=60)", () => {
    const json = render(sig({ rsi: 65, reason: "sell signal" }), 30, 60);
    expect(json).toContain("Overbought");
    expect(json).not.toContain("Neutral");
  });

  it("price below MA → Below", () => {
    expect(render(sig({ lastClose: 1700, ma: 1740.1, reason: "below ma" }))).toContain("Below");
  });

  it("rsi null → em dash, no zone word", () => {
    const json = render(sig({ rsi: null, reason: "insufficient data" }));
    expect(json).toContain("—");
    expect(json).not.toContain("Oversold");
    expect(json).not.toContain("Neutral");
    expect(json).not.toContain("Overbought");
  });

  it("ma null → price-vs-MA em dash, no relation word (MA period label still shows)", () => {
    const json = render(sig({ ma: null, maPeriod: null, reason: "insufficient data" }));
    expect(json).toContain("PRICE vs MA20"); // label from the strategy maPeriod prop
    expect(json).not.toContain("Above");
    expect(json).not.toContain("Below");
  });

  it("buy decision → BUY badge", () => {
    expect(render(sig({ decision: "buy", reason: "buy $25 ETH-USD" }))).toContain("BUY");
  });
});

// Next Action derivation (fix 2026-06-22): when FLAT (no real position) the
// card never shows SELL — it shows a forward-looking buy-watch. A stale dust
// sell decision is treated as flat too.
describe("SignalsCard — Next Action when flat (no real position)", () => {
  it("hold + flat → WAITING TO BUY with the entry condition + live RSI", () => {
    const json = render(sig({ rsi: 71.5, decision: "hold", reason: "irrelevant raw reason" }), 30, 70, 20, false);
    expect(json).toContain("WAITING TO BUY");
    expect(json).toContain("Enters when RSI < 30");
    expect(json).toContain("71.5");
    expect(json).toContain("Overbought");
    expect(json).not.toContain("SELL");
  });

  it("stale SELL decision + flat (dust/closed) → WAITING TO BUY, not SELL", () => {
    const json = render(
      sig({ rsi: 71.5, decision: "sell", reason: "sell: rsi=71.48 > exit_threshold=70 ...; sell 90%" }),
      30,
      70,
      20,
      false,
    );
    expect(json).toContain("WAITING TO BUY");
    expect(json).not.toContain("sell 90%");
  });

  it("sell + REAL position → SELL (unchanged)", () => {
    const json = render(sig({ rsi: 72, decision: "sell", reason: "sell 90% of position" }), 30, 70, 20, true);
    expect(json).toContain("SELL");
    expect(json).toContain("sell 90% of position");
  });

  it("hold + REAL position → HOLDING (reason verbatim)", () => {
    const json = render(sig({ decision: "hold", reason: "position open + no exit signal" }), 30, 70, 20, true);
    expect(json).toContain("HOLDING");
    expect(json).toContain("position open + no exit signal");
  });
});

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
    // open-position hold by default → renders HOLDING with the reason verbatim
    // (the engine's "hold: position open" prefix; see isOpenPositionHold).
    reason: "hold: position open + rsi=42.10 <= exit_threshold=70 (no exit signal) at ETH-USD",
    ...over,
  };
}
function render(signal: CockpitSignal, entry = 30, exit = 70, maPeriod = 20): string {
  return JSON.stringify(
    SignalsCard({ signal, entryRsiThreshold: entry, exitRsiThreshold: exit, maPeriod }),
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
    expect(json).toContain("HOLDING"); // open-position hold → HOLDING (reason verbatim)
    expect(json).toContain("hold: position open + rsi=42.10 <= exit_threshold=70 (no exit signal) at ETH-USD");
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

// Next Action derivation (fix 2026-06-22) — DB-ONLY, from the persisted signal
// (decision + the engine's reason). No Coinbase re-read: a flat/dust hold shows
// a forward-looking buy-watch; an open-position hold shows HOLDING; buy/sell
// render verbatim. The engine's dust floor ensures dust is decided as a flat
// hold, so the persisted decision is the source of truth.
describe("SignalsCard — Next Action derivation (DB-only)", () => {
  it("hold + FLAT (dust reason, not 'position open') → WAITING TO BUY + condition + live RSI", () => {
    const json = render(
      sig({
        rsi: 71.5,
        decision: "hold",
        reason:
          "hold: exit rsi condition met (rsi=71.50 > exit_threshold=70) but position is dust ($0.00 < $1.00 min sellable, not exitable) at ETH-USD",
      }),
    );
    expect(json).toContain("WAITING TO BUY");
    expect(json).toContain("Enters when RSI < 30");
    expect(json).toContain("71.5");
    expect(json).toContain("Overbought");
    expect(json).not.toContain("SELL");
  });

  it("hold + no-buy-signal (flat) → WAITING TO BUY (not a bare HOLD)", () => {
    const json = render(
      sig({ rsi: 50, decision: "hold", reason: "hold: rsi=50.00 >= entry_threshold=30 (no buy signal) at ETH-USD" }),
    );
    expect(json).toContain("WAITING TO BUY");
  });

  it("hold + OPEN position → HOLDING (reason verbatim, DB-only)", () => {
    const reason = "hold: position open + rsi=66.00 <= exit_threshold=70 (no exit signal) at ETH-USD";
    const json = render(sig({ decision: "hold", reason }));
    expect(json).toContain("HOLDING");
    expect(json).toContain(reason);
  });

  it("sell decision → SELL verbatim (engine only sells real >= $1 positions)", () => {
    const json = render(sig({ decision: "sell", reason: "sell: rsi=72 > exit_threshold=70; sell 90% of position at ETH-USD" }));
    expect(json).toContain("SELL");
    expect(json).toContain("sell 90% of position");
  });
});

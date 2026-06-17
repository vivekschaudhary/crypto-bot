// CB-6.3 unit tests for lib/dashboard/cockpit-signals.ts.
// Recording-mock DB (latest-signal query). DB-only read — no Coinbase mock
// needed. Asserts the latest-signal contract + null when the pair has no signal.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface SignalRow {
  rsi: number | null;
  ma: number | null;
  ma_period: number | null;
  last_close: number | null;
  decision: "buy" | "sell" | "hold";
  reason: string;
}

let signalRows: SignalRow[] = [];
function sqlMock(strings: TemplateStringsArray, ..._v: unknown[]) {
  const text = strings.join("?");
  if (/FROM signals/.test(text)) return Promise.resolve(signalRows);
  return Promise.resolve([]);
}
vi.mock("@/lib/db/client", () => ({ db: () => sqlMock }));

import { loadCockpitSignals } from "@/lib/dashboard/cockpit-signals";

beforeEach(() => {
  signalRows = [
    { rsi: 42.1, ma: 1740.1, ma_period: 20, last_close: 1792.39, decision: "hold", reason: "hold: no buy at ETH-USD" },
  ];
});
afterEach(() => vi.clearAllMocks());

describe("loadCockpitSignals", () => {
  it("latest signal → full row", async () => {
    const r = await loadCockpitSignals("ETH-USD");
    expect(r).toMatchObject({
      pair: "ETH-USD",
      rsi: 42.1,
      ma: 1740.1,
      maPeriod: 20,
      lastClose: 1792.39,
      decision: "hold",
    });
    expect(r?.reason).toBe("hold: no buy at ETH-USD");
  });

  it("no signal for the pair → null", async () => {
    signalRows = [];
    expect(await loadCockpitSignals("ETH-USD")).toBeNull();
  });

  it("rsi null (insufficient bars) → rsi null, other fields intact", async () => {
    signalRows = [
      { rsi: null, ma: 1740.1, ma_period: 20, last_close: 1792.39, decision: "hold", reason: "r" },
    ];
    const r = await loadCockpitSignals("ETH-USD");
    expect(r?.rsi).toBeNull();
    expect(r?.ma).toBe(1740.1);
  });

  it("ma null (insufficient bars) → ma + maPeriod null, decision intact", async () => {
    signalRows = [
      { rsi: 42.1, ma: null, ma_period: null, last_close: 1792.39, decision: "buy", reason: "r" },
    ];
    const r = await loadCockpitSignals("ETH-USD");
    expect(r?.ma).toBeNull();
    expect(r?.maPeriod).toBeNull();
    expect(r?.decision).toBe("buy");
  });
});

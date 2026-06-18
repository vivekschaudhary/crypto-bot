// CB-6.6 — render coverage for the Manual Overrides card (pure view + helpers).
// No @testing-library (CB-3.3 #9); ManualOverridesView is pure (no hooks) so it
// renders via JSON.stringify. Verifies every state + the mode-aware confirm copy.

import { describe, expect, it } from "vitest";

import {
  ManualOverridesView,
  manualOutcomeMessage,
  overrideConfirmPrompt,
  type ManualAction,
} from "@/app/dashboard/manual-overrides-card";

function render(over: Partial<Parameters<typeof ManualOverridesView>[0]> = {}): string {
  return JSON.stringify(
    ManualOverridesView({
      pair: "ETH-USD",
      buyDollars: 50,
      liveMode: false,
      confirming: null,
      phase: "idle",
      message: null,
      onAction: () => {},
      onConfirm: () => {},
      onCancel: () => {},
      ...over,
    }),
  );
}

describe("overrideConfirmPrompt — mode-aware (copy.md)", () => {
  it("buy: dark simulates, live warns REAL", () => {
    expect(overrideConfirmPrompt("force_buy", "ETH-USD", 50, false)).toBe("Simulate a $50 buy of ETH/USD?");
    expect(overrideConfirmPrompt("force_buy", "ETH-USD", 50, true)).toBe("Place a REAL $50 buy of ETH/USD?");
  });
  it("sell 50%: dark vs REAL", () => {
    expect(overrideConfirmPrompt("sell_50", "ETH-USD", 50, false)).toBe("Simulate selling 50% of your ETH/USD position?");
    expect(overrideConfirmPrompt("sell_50", "ETH-USD", 50, true)).toBe("Sell 50% of your REAL ETH/USD position?");
  });
  it("sell all: dark vs REAL", () => {
    expect(overrideConfirmPrompt("sell_all", "ETH-USD", 50, true)).toBe("Sell your ENTIRE REAL ETH/USD position?");
  });
  it("reset: the CB-5.3 reset prompt verbatim", () => {
    expect(overrideConfirmPrompt("reset", "ETH-USD", 50, false)).toBe(
      "Reset session? This starts a fresh session. Your transaction history is kept.",
    );
  });
});

describe("manualOutcomeMessage", () => {
  it("ok → order recorded", () => {
    expect(manualOutcomeMessage(true, null)).toBe("Order recorded — see the trade log.");
  });
  it("cap-reached / no-position → specific copy", () => {
    expect(manualOutcomeMessage(false, { error: "cap-reached" })).toBe("Session cap reached — can't buy.");
    expect(manualOutcomeMessage(false, { error: "no-position" })).toBe("No position to sell.");
  });
  it("other failure → generic error", () => {
    expect(manualOutcomeMessage(false, { error: "placement-failed" })).toBe("Override failed — try again.");
    expect(manualOutcomeMessage(false, null)).toBe("Override failed — try again.");
  });
});

describe("ManualOverridesView — render states", () => {
  it("idle (dark) → 4 buttons + paper-mode line", () => {
    const json = render();
    expect(json).toContain("MANUAL OVERRIDES");
    expect(json).toContain("Paper mode — orders are simulated (dry-run).");
    expect(json).toContain("Buy $50"); // dynamic label = position_size_usd
    expect(json).toContain("Sell 50%");
    expect(json).toContain("Sell All");
    expect(json).toContain("Reset Session");
  });

  it("live mode → no paper-mode line", () => {
    expect(render({ liveMode: true })).not.toContain("Paper mode");
  });

  it("confirming a buy → mode-aware prompt + Confirm/Cancel (buttons hidden)", () => {
    const json = render({ confirming: "force_buy" as ManualAction });
    expect(json).toContain("Simulate a $50 buy of ETH/USD?");
    expect(json).toContain("Confirm");
    expect(json).toContain("Cancel");
    expect(json).not.toContain("Sell 50%"); // action buttons replaced by the confirm
  });

  it("working → 'Placing…' on the confirm button", () => {
    expect(render({ confirming: "force_buy" as ManualAction, phase: "working" })).toContain("Placing…");
  });

  it("done → the success message", () => {
    expect(render({ phase: "done", message: "Order recorded — see the trade log." })).toContain(
      "Order recorded — see the trade log.",
    );
  });

  it("error → the error message", () => {
    expect(render({ phase: "error", message: "Session cap reached — can't buy." })).toContain(
      "Session cap reached — can't buy.",
    );
  });
});

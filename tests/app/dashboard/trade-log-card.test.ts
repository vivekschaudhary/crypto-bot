// CB-6.4 — render test for the Trade Log card (JSON.stringify pattern).
// Each table cell is a single value (no split-text-node risk). Verifies trade
// vs skip cells, the failed color, the verbatim skip reason, both empty states,
// and the retained ledger link.

import { describe, expect, it } from "vitest";

import { TradeLogCard } from "@/app/dashboard/trade-log-card";
import type { TradeLogRow } from "@/lib/dashboard/cockpit-trade-log";

const trade: TradeLogRow = {
  id: "o1",
  kind: "trade",
  time: new Date("2026-06-17T00:15:00Z"),
  side: "buy",
  usd: 25,
  status: "dry_run",
  reason: null,
};
const skip: TradeLogRow = {
  id: "s1",
  kind: "skip",
  time: new Date("2026-06-17T00:30:00Z"),
  side: null,
  usd: null,
  status: "SKIPPED",
  reason: "hold: USD reserve (need $10, available $1.77)",
};

function render(rows: TradeLogRow[], status: Parameters<typeof TradeLogCard>[0]["status"] = "all"): string {
  return JSON.stringify(TradeLogCard({ rows, status, pair: "ETH-USD" }));
}

describe("TradeLogCard", () => {
  it("renders trade + skip rows with the right cells", () => {
    const json = render([skip, trade]);
    expect(json).toContain("TRADE LOG");
    // headers
    expect(json).toContain("Time");
    expect(json).toContain("Reason");
    expect(json).toContain("Status");
    // trade cells
    expect(json).toContain("buy");
    expect(json).toContain("$25.00");
    expect(json).toContain("dry_run");
    // skip cells
    expect(json).toContain("SKIPPED");
    expect(json).toContain("hold: USD reserve (need $10, available $1.77)"); // verbatim
  });

  it("failed status renders in the loss color", () => {
    const json = render([{ ...trade, status: "failed" }]);
    expect(json).toContain("failed");
    expect(json).toContain("#b71c1c"); // LOSS
  });

  it("empty + all → 'No activity yet'", () => {
    const json = render([], "all");
    expect(json).toContain("No activity yet for this pair.");
  });

  it("empty + filtered → 'No matching activity'", () => {
    const json = render([], "skipped");
    expect(json).toContain("No matching activity for this pair.");
  });

  it("keeps the ledger link", () => {
    expect(render([trade])).toContain("View transaction ledger →");
  });
});

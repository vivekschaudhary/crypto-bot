// CB-6.4 — render test for the Trade Log status-filter control (AC 9).
// 'use client' component → mock useRouter so it can be called as a function.

import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { TradeLogStatusFilter } from "@/app/dashboard/trade-log-status-filter";

describe("TradeLogStatusFilter", () => {
  it("renders the Status label + the five verbatim options with correct values", () => {
    const json = JSON.stringify(TradeLogStatusFilter({ pair: "ETH-USD", current: "all" }));

    // Label (copy.md)
    expect(json).toContain("Status");

    // Option labels (verbatim, copy.md)
    expect(json).toContain("All statuses");
    expect(json).toContain("Dry run");
    expect(json).toContain("Submitted");
    expect(json).toContain("Failed");
    expect(json).toContain("Skipped");

    // Label → filter-value mapping
    expect(json).toContain('"value":"all"');
    expect(json).toContain('"value":"dry_run"');
    expect(json).toContain('"value":"submitted"');
    expect(json).toContain('"value":"failed"');
    expect(json).toContain('"value":"skipped"');
  });

  it("reflects the current filter as the selected value", () => {
    const json = JSON.stringify(TradeLogStatusFilter({ pair: "ETH-USD", current: "skipped" }));
    // the <select> value prop carries the current filter
    expect(json).toContain('"value":"skipped"');
  });
});

// CB-6.0 — render tests for the Equity + Mutual Funds "coming soon" placeholder
// pages (copy verbatim from copy.md).

import { describe, expect, it } from "vitest";

import EquityPage from "@/app/dashboard/equity/page";
import MutualFundsPage from "@/app/dashboard/mutual-funds/page";

describe("placeholder tabs", () => {
  it("Equity → 'Equity trading is coming soon.' + back link", () => {
    const json = JSON.stringify(EquityPage());
    expect(json).toContain("Equity trading is coming soon.");
    expect(json).toContain("← Back to Crypto");
    expect(json).toContain("/dashboard");
  });

  it("Mutual Funds → 'Mutual funds are coming soon.' + back link", () => {
    const json = JSON.stringify(MutualFundsPage());
    expect(json).toContain("Mutual funds are coming soon.");
    expect(json).toContain("← Back to Crypto");
  });
});

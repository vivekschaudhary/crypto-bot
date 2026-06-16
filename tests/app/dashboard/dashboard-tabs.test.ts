// CB-6.0 — unit test for the pure activeTab() helper of the 3-tab shell.
// (The rendered nav is verified by Playwright e2e, per CB-3.3 Decision #9.)

import { describe, expect, it } from "vitest";

import { activeTab } from "@/app/dashboard/dashboard-tabs";

describe("activeTab", () => {
  it("crypto is the default for /dashboard + its sub-routes", () => {
    expect(activeTab("/dashboard")).toBe("crypto");
    expect(activeTab("/dashboard/trace")).toBe("crypto");
    expect(activeTab("/dashboard/ledger")).toBe("crypto");
    expect(activeTab("/dashboard/strategy")).toBe("crypto");
  });

  it("equity + mutual-funds routes map to their tabs", () => {
    expect(activeTab("/dashboard/equity")).toBe("equity");
    expect(activeTab("/dashboard/mutual-funds")).toBe("mutual-funds");
  });
});

// CB-5.3 — unit tests for the pure logic exported from
// override-controls-client.tsx. No @testing-library/react in deps (CB-3.3
// Engineer DRI Decision #9 — vitest runs in the `node` env); the render +
// click flows are verified by the Playwright e2e Codex writes in Phase 3.
// Here we test controlsForStatus, the status→visible-buttons mapping that
// drives the design.md "status-aware" requirement.

import { describe, expect, it } from "vitest";

import { controlsForStatus } from "@/app/dashboard/override-controls-client";

describe("controlsForStatus — status-aware buttons (design.md)", () => {
  it("active → Pause + Reset (no Resume)", () => {
    expect(controlsForStatus("active")).toEqual({
      showPause: true,
      showResume: false,
      showReset: true,
    });
  });

  it("paused → Resume + Reset (no Pause)", () => {
    expect(controlsForStatus("paused")).toEqual({
      showPause: false,
      showResume: true,
      showReset: true,
    });
  });

  it("reset (legacy single-row only) → Reset only", () => {
    // With multi-row the current session is never 'reset' (reset immediately
    // creates an active row), but the mapping stays total/defensive.
    expect(controlsForStatus("reset")).toEqual({
      showPause: false,
      showResume: false,
      showReset: true,
    });
  });

  it("Reset is always available regardless of status", () => {
    for (const status of ["active", "paused", "reset"] as const) {
      expect(controlsForStatus(status).showReset).toBe(true);
    }
  });

  it("Pause and Resume are mutually exclusive (never both shown)", () => {
    for (const status of ["active", "paused", "reset"] as const) {
      const c = controlsForStatus(status);
      expect(c.showPause && c.showResume).toBe(false);
    }
  });
});

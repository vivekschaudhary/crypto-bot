// CB-6.0 — unit tests for the cockpit controls' pure logic:
//   - controlsForStatus: which buttons show per session status
//   - ACTION_KIND: the Start/Pause/Stop → override-route kind mapping
//     (the load-bearing "Stop = alias for paused, no migration" decision).
// (The rendered controls + POST flow are verified by Playwright e2e.)

import { describe, expect, it } from "vitest";

import { ACTION_KIND, controlsForStatus, runOutcomePhase } from "@/app/dashboard/bot-controls-client";

describe("controlsForStatus — status-aware controls", () => {
  it("active → Pause + Stop (no Start)", () => {
    expect(controlsForStatus("active")).toEqual({ showStart: false, showPause: true, showStop: true });
  });
  it("paused → Start (no Pause/Stop)", () => {
    expect(controlsForStatus("paused")).toEqual({ showStart: true, showPause: false, showStop: false });
  });
  it("reset → Start (treated as not-running)", () => {
    expect(controlsForStatus("reset")).toEqual({ showStart: true, showPause: false, showStop: false });
  });
});

describe("ACTION_KIND — control → override kind (Stop = alias for pause)", () => {
  it("Start → resume", () => expect(ACTION_KIND.start).toBe("resume"));
  it("Pause → pause", () => expect(ACTION_KIND.pause).toBe("pause"));
  it("Stop → pause (alias; no new override_events kind / no migration)", () => {
    expect(ACTION_KIND.stop).toBe("pause");
  });
});

describe("runOutcomePhase — CB-6.5 Run Now response → feedback phase", () => {
  it("ok + ran/duplicate body → done", () => {
    expect(runOutcomePhase(true, { ran: true })).toBe("done");
    expect(runOutcomePhase(true, { duplicate: true })).toBe("done");
  });
  it("ok + skipped body → skipped", () => {
    expect(runOutcomePhase(true, { skipped: "session_paused" })).toBe("skipped");
  });
  it("non-ok response → error", () => {
    expect(runOutcomePhase(false, { error: "boom" })).toBe("error");
    expect(runOutcomePhase(false, null)).toBe("error");
  });
});

// CB-6.0 — render test for the Bot Status panel (section 1). Asserts the
// panel's status-aware direct JSX via JSON.stringify of the element tree
// (the CB-5 render-test pattern; the nested BotControls client component's
// internals are verified by e2e).

import { describe, expect, it } from "vitest";

import type { SessionState } from "@/lib/dashboard/live-state";
import { BotStatusPanel } from "@/app/dashboard/bot-status-panel";

const startedAt = new Date("2026-06-12T21:45:00Z");

describe("BotStatusPanel", () => {
  it("active → ACTIVE badge + running one-liner", () => {
    const json = JSON.stringify(BotStatusPanel({ session: { status: "active", startedAt } as SessionState }));
    expect(json).toContain("ACTIVE");
    expect(json).toContain("Bot is active — running every 15 minutes.");
    expect(json).not.toContain("stopped by user");
  });

  it("paused → STOPPED badge + stopped one-liner + 'stopped by user' detail", () => {
    const json = JSON.stringify(BotStatusPanel({ session: { status: "paused", startedAt } as SessionState }));
    expect(json).toContain("STOPPED");
    expect(json).toContain("Bot is stopped — click Start to resume");
    expect(json).toContain("stopped by user");
  });

  it("no session → 'No active session' + strategy link", () => {
    const json = JSON.stringify(BotStatusPanel({ session: null }));
    expect(json).toContain("No active session. Save a strategy to start the bot.");
    expect(json).toContain("/dashboard/strategy");
  });
});

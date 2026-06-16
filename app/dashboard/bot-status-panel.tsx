// `app/dashboard/bot-status-panel.tsx` — CB-6.0 cockpit section 1 (Bot Status).
//
// Server Component, presentational: takes the current session (from
// loadLiveState — CB-5.0) and renders the status-aware status line + the
// Start/Pause/Stop/Run-Now controls. Copy VERBATIM from copy.md (refusal #5).
// Status mapping (operator decision — Stop = alias for paused): `active` →
// ACTIVE (running); `paused`/`reset` → STOPPED (not running). No data fetch
// here (the page fetches); pure render keeps it testable.

import type { JSX } from "react";

import type { SessionState } from "@/lib/dashboard/live-state";

import { BotControls } from "./bot-controls-client";

// Copy verbatim — copy.md.
const COPY = {
  label: "BOT STATUS",
  active: "ACTIVE",
  stopped: "STOPPED",
  runningLine: "Bot is active — running every 15 minutes.",
  stoppedLine: "Bot is stopped — click Start to resume",
  stoppedDetail: "stopped by user",
  noSession: "No active session. Save a strategy to start the bot.",
  strategyLink: "Create or revise your DCA strategy",
} as const;

const headingStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  letterSpacing: "0.08em",
  color: "#888",
  marginBottom: "0.5rem",
};
const badgeStyle: React.CSSProperties = { fontWeight: 700, marginRight: "0.5rem" };
const lineStyle: React.CSSProperties = { fontSize: "0.9375rem", marginBottom: "0.5rem" };
const detailStyle: React.CSSProperties = { color: "#888", fontSize: "0.8125rem", marginBottom: "0.5rem" };
const linkStyle: React.CSSProperties = { color: "#446", textDecoration: "underline" };

function fmtTs(d: Date): string {
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function BotStatusPanel({ session }: { session: SessionState | null }): JSX.Element {
  if (session === null) {
    return (
      <section>
        <h2 style={headingStyle}>{COPY.label}</h2>
        <p style={lineStyle}>{COPY.noSession}</p>
        <p>
          <a href="/dashboard/strategy" style={linkStyle}>
            {COPY.strategyLink}
          </a>
        </p>
      </section>
    );
  }

  const running = session.status === "active";
  return (
    <section>
      <h2 style={headingStyle}>{COPY.label}</h2>
      <p style={lineStyle}>{running ? COPY.runningLine : COPY.stoppedLine}</p>
      <p style={lineStyle}>
        <span style={badgeStyle}>{running ? `● ${COPY.active}` : `⏸ ${COPY.stopped}`}</span>
        <span style={{ color: "#888" }}>· session started {fmtTs(session.startedAt)}</span>
      </p>
      {!running && <p style={detailStyle}>{COPY.stoppedDetail}</p>}
      <BotControls status={session.status} />
    </section>
  );
}

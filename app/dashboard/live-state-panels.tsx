// `app/dashboard/live-state-panels.tsx` — live-state render (CB-5.0).
//
// Server Component, presentational: takes a LiveState (from
// lib/dashboard/live-state:loadLiveState) and renders the session /
// holdings / session-activity panels + empty + degraded states. Copy is
// VERBATIM from copy.md (refusal rule #5). Inline styles per the
// CB-1.6/CB-3.3 convention. No data fetching here — the page fetches; this
// renders (keeps it pure + testable).

import type { JSX } from "react";

import type { LiveState } from "@/lib/dashboard/live-state";

const headingStyle: React.CSSProperties = {
  fontSize: "1rem",
  fontWeight: 600,
  color: "#222",
  marginTop: "1.5rem",
  marginBottom: "0.5rem",
};
const captionStyle: React.CSSProperties = {
  color: "#888",
  fontSize: "0.8125rem",
  marginTop: "-0.25rem",
  marginBottom: "0.5rem",
};
const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "0.25rem 0",
  fontSize: "0.9375rem",
};
const mutedStyle: React.CSSProperties = { color: "#888" };
const linkStyle: React.CSSProperties = { color: "#446", textDecoration: "underline" };

function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtTs(d: Date): string {
  // YYYY-MM-DD HH:MM UTC (copy.md timestamp format)
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
function baseOf(assetIdentifier: string): string {
  return assetIdentifier.split("-")[0] ?? assetIdentifier;
}

export function LiveStatePanels({ state }: { state: LiveState }): JSX.Element {
  // No active session (AC 5).
  if (state.session === null) {
    return (
      <section>
        <p style={{ marginBottom: "0.75rem" }}>No active session. Save a strategy to start the bot.</p>
        <p style={{ marginBottom: "1.25rem" }}>
          <a href="/dashboard/strategy" style={linkStyle}>
            Create or revise your DCA strategy
          </a>
        </p>
      </section>
    );
  }

  const statusLabel =
    state.session.status === "active"
      ? "● Active"
      : state.session.status === "paused"
        ? "⏸ Paused"
        : "↺ Reset";
  const modeTag = state.liveMode ? "(live)" : "(paper)";

  return (
    <section>
      <h2 style={headingStyle}>Bot status</h2>
      <p style={{ fontSize: "0.9375rem" }}>
        {statusLabel}
        {" · session started "}
        {fmtTs(state.session.startedAt)}
      </p>

      <h2 style={headingStyle}>Holdings</h2>
      <p style={captionStyle}>From your Coinbase fills</p>
      {state.holdings === null ? (
        <p style={mutedStyle}>
          Holdings unavailable — couldn&apos;t reach Coinbase. Status and session activity below
          are unaffected.
        </p>
      ) : state.holdings.length === 0 || state.holdings.every((h) => h.position === null) ? (
        <p style={mutedStyle}>No positions yet.</p>
      ) : (
        state.holdings.map((h) => (
          <div key={h.assetIdentifier} style={rowStyle}>
            <span>{h.assetIdentifier}</span>
            <span style={h.position === null ? mutedStyle : undefined}>
              {h.position === null
                ? "no position"
                : `${h.position.quantity} ${baseOf(h.assetIdentifier)} · avg cost ${fmtUsd(h.position.avgCostUsd)}`}
            </span>
          </div>
        ))
      )}

      <h2 style={headingStyle}>This session</h2>
      {state.activity.buyCount === 0 ? (
        <p style={mutedStyle}>No bot orders this session yet.</p>
      ) : (
        <p style={{ fontSize: "0.9375rem" }}>
          {state.activity.buyCount === 1
            ? `1 bot buy · ${fmtUsd(state.activity.totalInvestedUsd)} invested ${modeTag}`
            : `${state.activity.buyCount} bot buys · ${fmtUsd(state.activity.totalInvestedUsd)} invested ${modeTag}`}
        </p>
      )}
    </section>
  );
}

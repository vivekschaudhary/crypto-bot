// `app/dashboard/trace/page.tsx` — decision-trace log view (CB-5.1).
//
// Server Component; SSR per load; auth via proxy.ts (non-public route).
// Reuses the CB-5.0 LiveModeBanner + chrome + inline-styles convention.
// Renders bot_ticks ⋈ signals (newest-first) with the operator-readable
// reason strings VERBATIM (CB-4.1). Executes brief PM DRI Decision #7:
// decisions + reasons here; per-execution paper/live status is the CB-5.2
// ledger's job. Copy VERBATIM from copy.md (refusal rule #5).

import type { JSX } from "react";

import { type Decision, loadDecisionTrace } from "@/lib/dashboard/decision-trace";
import { env } from "@/lib/env";

import { LiveModeBanner } from "../live-mode-banner";
import { SignOutClient } from "../sign-out-client";

// SSR per load (AC 2 / brief PM Decision #2). Without this the route reads
// no headers()/cookies() and Next would statically prerender it — baking a
// build-time DB read instead of rendering live ticks per request.
export const dynamic = "force-dynamic";

const pageStyle: React.CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  padding: "2rem",
  maxWidth: 960,
  margin: "0 auto",
};
const chromeStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  borderBottom: "1px solid #ddd",
  paddingBottom: "1rem",
  marginBottom: "2rem",
};
const titleStyle: React.CSSProperties = { fontSize: "1.25rem", fontWeight: 600 };
const headerRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  marginBottom: "1rem",
};
const headingStyle: React.CSSProperties = { fontSize: "1rem", fontWeight: 600, color: "#222" };
const linkStyle: React.CSSProperties = { color: "#446", textDecoration: "underline", fontSize: "0.875rem" };
const tickStyle: React.CSSProperties = {
  borderTop: "1px solid #eee",
  paddingTop: "0.75rem",
  marginBottom: "0.75rem",
};
const tickHeaderStyle: React.CSSProperties = { fontSize: "0.9375rem", fontWeight: 600 };
const sigLineStyle: React.CSSProperties = { fontSize: "0.875rem", marginTop: "0.35rem" };
const reasonStyle: React.CSSProperties = { fontSize: "0.8125rem", color: "#666", marginLeft: "1rem" };
const mutedStyle: React.CSSProperties = { color: "#888" };
const errorStyle: React.CSSProperties = { color: "#b71c1c", fontSize: "0.875rem", marginLeft: "1rem" };

const decisionColor: Record<Decision, string> = {
  buy: "#1b5e20",
  sell: "#8a6d00",
  hold: "#444",
};

function fmtTs(d: Date): string {
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
function fmtNum(n: number | null): string {
  return n === null ? "—" : n.toFixed(2);
}

export default async function DecisionTracePage(): Promise<JSX.Element> {
  const liveMode = env().LIVE_MODE;
  const { ticks, hasMore } = await loadDecisionTrace();

  return (
    <main style={pageStyle}>
      <div style={chromeStyle}>
        <div style={titleStyle}>crypto-bot</div>
        <SignOutClient />
      </div>
      <LiveModeBanner liveMode={liveMode} />
      <div style={headerRowStyle}>
        <h1 style={headingStyle}>Decision trace</h1>
        <a href="/dashboard" style={linkStyle}>
          ← Back to dashboard
        </a>
      </div>

      {ticks.length === 0 ? (
        <p style={mutedStyle}>No decisions logged yet.</p>
      ) : (
        <>
          {ticks.map((tick) => (
            <section key={tick.id} style={tickStyle}>
              <div style={tickHeaderStyle}>
                {fmtTs(tick.tickStartedAt)} ·{" "}
                <span style={{ color: decisionColor[tick.decision] }}>{tick.decision}</span>
                {tick.errorDetail !== null && <span style={{ color: "#b71c1c" }}> ⚠ error</span>}
              </div>
              {tick.errorDetail !== null ? (
                <p style={errorStyle}>{tick.errorDetail}</p>
              ) : (
                tick.signals.map((s) => (
                  <div key={`${tick.id}:${s.assetIdentifier}`}>
                    <div style={sigLineStyle}>
                      {s.assetIdentifier}{" "}
                      <span style={{ color: decisionColor[s.decision] }}>{s.decision}</span> rsi{" "}
                      {fmtNum(s.rsi)} ma {fmtNum(s.ma)}
                    </div>
                    <div style={reasonStyle}>{s.reason}</div>
                  </div>
                ))
              )}
            </section>
          ))}
          {hasMore && (
            <p style={{ ...mutedStyle, fontSize: "0.8125rem", marginTop: "1rem" }}>
              Showing the 50 most recent ticks. Older ticks not shown.
            </p>
          )}
        </>
      )}
    </main>
  );
}

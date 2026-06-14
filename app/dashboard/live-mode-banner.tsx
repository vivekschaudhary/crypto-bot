// `app/dashboard/live-mode-banner.tsx` — shared LIVE_MODE banner.
//
// CB-5.0 AC 3. Server Component; rendered at the top of every CB-5
// dashboard view (reused by CB-5.1/5.2/5.3). The single most important
// visual element: the operator must NEVER be unsure whether real money is
// in play. Color-coded AND text-labeled (never color-only — accessibility,
// per design.md). Copy VERBATIM from copy.md (refusal rule #5).
//
// `liveMode` is passed by the caller (the page reads it once via
// loadLiveState / env()), keeping a single env() read per render + making
// the banner trivially testable in both states.

import type { JSX } from "react";

const DRY_RUN_COPY =
  "DRY RUN — paper trading. The bot logs decisions but places no real orders.";
const LIVE_COPY =
  "● LIVE — real orders. The bot is placing real Coinbase orders with real money.";

// design.md palette — WCAG AA contrast (dark text on light bg, ≥ 4.5:1).
const dryStyle: React.CSSProperties = {
  background: "#eef2f7",
  color: "#33415c",
  border: "1px solid #c3cfe0",
  padding: "0.75rem 1rem",
  borderRadius: 4,
  marginBottom: "1.5rem",
  fontSize: "0.9375rem",
  fontWeight: 600,
};

const liveStyle: React.CSSProperties = {
  background: "#fdecea",
  color: "#b71c1c",
  border: "2px solid #f44336",
  padding: "0.75rem 1rem",
  borderRadius: 4,
  marginBottom: "1.5rem",
  fontSize: "0.9375rem",
  fontWeight: 700,
};

export function LiveModeBanner({ liveMode }: { liveMode: boolean }): JSX.Element {
  // role=alert for LIVE (assistive tech announces real-money state
  // assertively); role=status for dry-run.
  return (
    <div
      role={liveMode ? "alert" : "status"}
      data-testid="live-mode-banner"
      data-live-mode={liveMode ? "true" : "false"}
      style={liveMode ? liveStyle : dryStyle}
    >
      {liveMode ? LIVE_COPY : DRY_RUN_COPY}
    </div>
  );
}

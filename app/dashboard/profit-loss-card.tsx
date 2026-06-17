// `app/dashboard/profit-loss-card.tsx` — CB-6.2 cockpit section 2.
//
// Server Component, presentational: renders the viewed pair's session-scoped
// invested + buys and the real position's current value + signed P&L
// (unrealized + %) + realized. Two cells per the design. Signed-PnL formatting
// matches CB-5.2's PnlPanel (gain +$, loss −$ minus-glyph, "—" when N/A; color
// reinforces the sign). Copy VERBATIM (refusal rule #5).

import type { JSX } from "react";

import type { CockpitPnl } from "@/lib/dashboard/cockpit-pnl";

const GAIN = "#1b5e20";
const LOSS = "#b71c1c";

const headingStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  letterSpacing: "0.08em",
  color: "#888",
  marginBottom: "0.5rem",
};
const cellsStyle: React.CSSProperties = { display: "flex", gap: "2rem", flexWrap: "wrap" };
const cellLabelStyle: React.CSSProperties = { fontSize: "0.6875rem", letterSpacing: "0.06em", color: "#aaa" };
const valueStyle: React.CSSProperties = { fontSize: "1.125rem", fontWeight: 700 };
const subStyle: React.CSSProperties = { color: "#888", fontSize: "0.8125rem" };
const mutedStyle: React.CSSProperties = { color: "#888", fontSize: "0.9375rem" };

function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtSignedUsd(n: number): string {
  const sign = n < 0 ? "−" : "+";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtSignedPct(n: number): string {
  const sign = n < 0 ? "−" : "+";
  return `${sign}${Math.abs(n * 100).toFixed(2)}%`;
}
function pnlColor(n: number): string {
  return n < 0 ? LOSS : GAIN;
}
function buysLabel(n: number): string {
  return n === 1 ? "1 buy this session" : `${n} buys this session`;
}

export function ProfitLossCard({ data }: { data: CockpitPnl }): JSX.Element {
  // Coinbase reads failed → no position-derived figures at all.
  const degraded = data.currentValue === null && data.realizedPnlUsd === null;

  return (
    <section>
      <h2 style={headingStyle}>PROFIT / LOSS</h2>
      <div style={cellsStyle}>
        {/* Invested cell (session-scoped; DB-only — always renders). */}
        <div>
          <div style={cellLabelStyle}>TOTAL INVESTED</div>
          <div style={valueStyle}>{fmtUsd(data.invested)}</div>
          <div style={subStyle}>{buysLabel(data.buys)}</div>
        </div>

        {/* Current value + P&L cell (real position). */}
        <div>
          <div style={cellLabelStyle}>CURRENT VALUE</div>
          {degraded ? (
            <div style={mutedStyle}>P&amp;L unavailable</div>
          ) : (
            <>
              <div style={valueStyle}>{data.currentValue === null ? "—" : fmtUsd(data.currentValue)}</div>
              <div style={subStyle}>
                {"P&L: "}
                {data.unrealizedPnlUsd === null ? (
                  <span>—</span>
                ) : (
                  <span style={{ color: pnlColor(data.unrealizedPnlUsd) }}>{fmtSignedUsd(data.unrealizedPnlUsd)}</span>
                )}
                {" ("}
                {data.unrealizedPct === null ? "—" : fmtSignedPct(data.unrealizedPct)}
                {") · Realized: "}
                {data.realizedPnlUsd === null ? (
                  <span>—</span>
                ) : (
                  <span style={{ color: pnlColor(data.realizedPnlUsd) }}>{fmtSignedUsd(data.realizedPnlUsd)}</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

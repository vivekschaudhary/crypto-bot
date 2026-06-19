// `app/dashboard/current-position-card.tsx` — CB-6.1 cockpit section 3.
//
// Server Component, presentational: renders the viewed pair's held qty + avg
// cost, live price, and latest RSI (from loadCockpitPosition). Two cells per
// the operator design. Degraded/empty states per copy.md. Copy VERBATIM
// (refusal rule #5). Number formatting mirrors the CB-5.0 holdings panel.

import type { JSX } from "react";

import type { CockpitPosition } from "@/lib/dashboard/cockpit-position";

const COPY = {
  label: "CURRENT POSITION",
  livePrice: "LIVE PRICE",
  noPosition: "No position yet",
  priceUnavailable: "Live price unavailable",
} as const;

const headingStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  letterSpacing: "0.08em",
  color: "#888",
  marginBottom: "0.5rem",
};
// CB-6.7 — paper-mode badge next to the heading while LIVE_MODE=false.
const paperBadgeStyle: React.CSSProperties = {
  marginLeft: "0.5rem",
  padding: "0.05rem 0.4rem",
  fontSize: "0.625rem",
  fontWeight: 700,
  letterSpacing: "0.04em",
  color: "#8a6d00",
  background: "#fff8e1",
  border: "1px solid #f0e0a0",
  borderRadius: 3,
};
const cellsStyle: React.CSSProperties = { display: "flex", gap: "2rem", flexWrap: "wrap" };
const cellLabelStyle: React.CSSProperties = { fontSize: "0.6875rem", letterSpacing: "0.06em", color: "#aaa" };
const valueStyle: React.CSSProperties = { fontSize: "1.125rem", fontWeight: 700 };
const subStyle: React.CSSProperties = { color: "#888", fontSize: "0.8125rem" };
const mutedStyle: React.CSSProperties = { color: "#888", fontSize: "0.9375rem" };

function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function baseOf(pair: string): string {
  return (pair.split("-")[0] ?? pair).toUpperCase();
}

export function CurrentPositionCard({ data }: { data: CockpitPosition }): JSX.Element {
  const base = baseOf(data.pair);
  return (
    <section>
      <h2 style={headingStyle}>
        {COPY.label}
        {data.paper && <span style={paperBadgeStyle}>Paper</span>}
      </h2>
      <div style={cellsStyle}>
        {/* Holding cell */}
        <div>
          <div style={cellLabelStyle}>{`${base} HELD`}</div>
          {data.position === null ? (
            <div style={mutedStyle}>{COPY.noPosition}</div>
          ) : (
            <>
              <div style={valueStyle}>{`${data.position.quantity} ${base}`}</div>
              <div style={subStyle}>{`Avg cost: ${fmtUsd(data.position.avgCostUsd)}`}</div>
            </>
          )}
        </div>

        {/* Live price cell */}
        <div>
          <div style={cellLabelStyle}>{COPY.livePrice}</div>
          {data.livePrice === null ? (
            <div style={mutedStyle}>{COPY.priceUnavailable}</div>
          ) : (
            <div style={valueStyle}>{fmtUsd(data.livePrice)}</div>
          )}
          <div style={subStyle}>RSI: {data.rsi === null ? "—" : Math.round(data.rsi)}</div>
        </div>
      </div>
    </section>
  );
}

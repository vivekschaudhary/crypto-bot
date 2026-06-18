// `app/dashboard/trade-log-card.tsx` — CB-6.4 cockpit section 6.
//
// Server Component, presentational: renders the viewed pair's Trade Log — a
// newest-first table merging trades (orders) + skips (hold ticks) — plus the
// status filter + the ledger link. Columns: Time · Side · USD · Reason · Status
// (Price/Qty deferred to post-flip). Reuses the CB-5.2 ledger formatting
// (fmtTs/fmtUsd, failed→red) + reasons verbatim. Copy VERBATIM (refusal rule #5).

import type { JSX } from "react";

import type { TradeLogRow, TradeLogStatus } from "@/lib/dashboard/cockpit-trade-log";

import { TradeLogStatusFilter } from "./trade-log-status-filter";

const LOSS = "#b71c1c";

const headingStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  letterSpacing: "0.08em",
  color: "#888",
};
const headerRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  marginBottom: "0.75rem",
  gap: "1rem",
};
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "0.35rem 0.5rem", borderBottom: "1px solid #ddd", color: "#555" };
const tdStyle: React.CSSProperties = { padding: "0.35rem 0.5rem", borderBottom: "1px solid #f0f0f0" };
const mutedStyle: React.CSSProperties = { color: "#888", fontSize: "0.875rem" };
const reasonTdStyle: React.CSSProperties = { ...tdStyle, color: "#666" };
const linkStyle: React.CSSProperties = { color: "#446", textDecoration: "underline", fontSize: "0.875rem", display: "inline-block", marginTop: "0.75rem" };

function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtTs(d: Date): string {
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function TradeLogCard({
  rows,
  status,
  pair,
}: {
  rows: TradeLogRow[];
  status: TradeLogStatus;
  pair: string;
}): JSX.Element {
  return (
    <section>
      <div style={headerRowStyle}>
        <h2 style={headingStyle}>TRADE LOG</h2>
        <TradeLogStatusFilter pair={pair} current={status} />
      </div>

      {rows.length === 0 ? (
        <p style={mutedStyle}>
          {status === "all"
            ? "No activity yet for this pair."
            : "No matching activity for this pair."}
        </p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Time</th>
              <th style={thStyle}>Side</th>
              <th style={thStyle}>USD</th>
              <th style={thStyle}>Reason</th>
              <th style={thStyle}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={tdStyle}>{fmtTs(r.time)}</td>
                <td style={tdStyle}>{r.side ?? "—"}</td>
                <td style={tdStyle}>{r.usd === null ? "—" : fmtUsd(r.usd)}</td>
                <td style={reasonTdStyle}>{r.reason ?? "—"}</td>
                <td style={{ ...tdStyle, color: r.status === "failed" ? LOSS : "#333" }}>{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <a href="/dashboard/ledger" style={linkStyle}>
        View transaction ledger →
      </a>
    </section>
  );
}

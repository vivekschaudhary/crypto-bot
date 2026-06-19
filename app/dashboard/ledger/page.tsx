// `app/dashboard/ledger/page.tsx` — transaction ledger + per-asset PnL (CB-5.2).
//
// Server Component; force-dynamic (SSR per load — CB-5.1 lesson: a
// DB-reading dashboard route must be dynamic or Next prerenders a
// build-time read); auth via proxy. Reuses the CB-5.0 LiveModeBanner +
// chrome + inline styles. Copy VERBATIM from copy.md (refusal rule #5).
// Executes brief PM Decision #7 (per-execution paper/live status = orders.status).

import type { JSX } from "react";

import { type AssetPnlRow, type LedgerRow, loadLedger } from "@/lib/dashboard/ledger";
import { env } from "@/lib/env";

import { LiveModeBanner } from "../live-mode-banner";

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
const headingStyle: React.CSSProperties = { fontSize: "1rem", fontWeight: 600, color: "#222", marginTop: "1.5rem" };
const linkStyle: React.CSSProperties = { color: "#446", textDecoration: "underline", fontSize: "0.875rem" };
const captionStyle: React.CSSProperties = { color: "#888", fontSize: "0.8125rem", marginTop: "-0.25rem", marginBottom: "0.5rem" };
const mutedStyle: React.CSSProperties = { color: "#888" };
const rowStyle: React.CSSProperties = { padding: "0.3rem 0", fontSize: "0.9375rem" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "0.4rem 0.5rem", borderBottom: "1px solid #ddd", color: "#555" };
const tdStyle: React.CSSProperties = { padding: "0.4rem 0.5rem", borderBottom: "1px solid #f0f0f0" };

const GAIN = "#1b5e20";
const LOSS = "#b71c1c";

function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtSignedUsd(n: number): string {
  const sign = n < 0 ? "−" : "+";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtTs(d: Date): string {
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
function pnlColor(n: number): string {
  return n < 0 ? LOSS : GAIN;
}

export function PnlPanel({ pnl }: { pnl: AssetPnlRow[] | null }): JSX.Element {
  if (pnl === null) {
    return (
      <p style={mutedStyle}>
        PnL unavailable — couldn&apos;t reach Coinbase. Transactions below are unaffected.
      </p>
    );
  }
  const held = pnl.filter((p) => p.quantity > 0 || p.realizedPnlUsd !== 0);
  if (held.length === 0) return <p style={mutedStyle}>No open positions.</p>;
  return (
    <>
      {pnl.map((p) => {
        if (p.quantity <= 0 && p.realizedPnlUsd === 0) return null;
        return (
          <div key={p.assetIdentifier} style={rowStyle}>
            {p.quantity > 0 ? (
              <div>
                {p.assetIdentifier} {p.quantity} @ avg {fmtUsd(p.avgCostUsd)}
                {p.currentPrice !== null ? ` now ${fmtUsd(p.currentPrice)}` : ""}
              </div>
            ) : (
              <div>
                {p.assetIdentifier} <span style={mutedStyle}>no position</span>
              </div>
            )}
            <div style={{ fontSize: "0.875rem" }}>
              realized{" "}
              <span style={{ color: pnlColor(p.realizedPnlUsd) }}>{fmtSignedUsd(p.realizedPnlUsd)}</span>
              {" · unrealized "}
              {p.unrealizedPnlUsd === null ? (
                <span style={mutedStyle}>—</span>
              ) : (
                <span style={{ color: pnlColor(p.unrealizedPnlUsd) }}>{fmtSignedUsd(p.unrealizedPnlUsd)}</span>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

export function TransactionsTable({ orders }: { orders: LedgerRow[] }): JSX.Element {
  if (orders.length === 0) return <p style={mutedStyle}>No transactions yet.</p>;
  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={thStyle}>Time</th>
          <th style={thStyle}>Asset</th>
          <th style={thStyle}>Source</th>
          <th style={thStyle}>Side</th>
          <th style={thStyle}>Amount</th>
          <th style={thStyle}>Status</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => (
          <tr key={o.id}>
            <td style={tdStyle}>{fmtTs(o.createdAt)}</td>
            <td style={tdStyle}>{o.assetIdentifier}</td>
            <td style={tdStyle}>{o.source}</td>
            <td style={tdStyle}>{o.side}</td>
            <td style={tdStyle}>{fmtUsd(o.amount)}</td>
            <td style={{ ...tdStyle, color: o.status === "failed" ? LOSS : "#333" }}>{o.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function LedgerPage(): Promise<JSX.Element> {
  const liveMode = env().LIVE_MODE;
  const { orders, pnl, hasMore } = await loadLedger();

  return (
    <main style={pageStyle}>
      <div style={chromeStyle}>
        <div style={titleStyle}>crypto-bot</div>
      </div>
      <LiveModeBanner liveMode={liveMode} />
      <div style={headerRowStyle}>
        <h1 style={headingStyle}>Transaction ledger</h1>
        <span style={{ fontSize: "0.875rem" }}>
          <a href="/dashboard" style={linkStyle}>
            ← Back to dashboard
          </a>{" "}
          ·{" "}
          <a href="/dashboard/trace" style={linkStyle}>
            Decision trace
          </a>
        </span>
      </div>

      <h2 style={headingStyle}>Profit / loss</h2>
      <p style={captionStyle}>From your Coinbase fills + current price</p>
      <PnlPanel pnl={pnl} />

      <h2 style={headingStyle}>Transactions</h2>
      <TransactionsTable orders={orders} />
      {hasMore && (
        <p style={{ ...mutedStyle, fontSize: "0.8125rem", marginTop: "1rem" }}>
          Showing the 50 most recent transactions. Older transactions not shown.
        </p>
      )}
    </main>
  );
}

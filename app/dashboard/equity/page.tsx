// CB-6.0 — Equity tab placeholder. Equity (India / Zerodha) is CB-7; this
// ships only the entry point. Copy VERBATIM from copy.md (refusal rule #5).

import type { JSX } from "react";

const pageStyle: React.CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  padding: "2rem",
  maxWidth: 960,
  margin: "0 auto",
};
const cardStyle: React.CSSProperties = {
  border: "1px solid #eee",
  borderRadius: 6,
  padding: "2rem",
  textAlign: "center",
  color: "#555",
};
const linkStyle: React.CSSProperties = { color: "#446", textDecoration: "underline" };

export default function EquityPage(): JSX.Element {
  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={{ marginBottom: "1rem" }}>Equity trading is coming soon.</p>
        <a href="/dashboard" style={linkStyle}>
          ← Back to Crypto
        </a>
      </div>
    </main>
  );
}

// `app/dashboard/cockpit-section.tsx` — CB-6.0 cockpit card wrapper.
//
// A labelled card for a cockpit section. With no children it renders the
// "Coming soon" placeholder (copy.md) — used for sections 2–6, which are
// filled in CB-6.1–6.4. With children, it renders them (e.g., a link to the
// existing trace/ledger views so those stay reachable from the cockpit).

import type { JSX } from "react";

const cardStyle: React.CSSProperties = {
  border: "1px solid #eee",
  borderRadius: 6,
  padding: "1rem",
  marginTop: "1rem",
};
const headingStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  letterSpacing: "0.08em",
  color: "#888",
  marginBottom: "0.5rem",
};
const comingSoonStyle: React.CSSProperties = { color: "#aaa", fontSize: "0.875rem" };

export function CockpitSection({
  label,
  children,
}: {
  label: string;
  children?: React.ReactNode;
}): JSX.Element {
  return (
    <section style={cardStyle}>
      <h2 style={headingStyle}>{label}</h2>
      {children ?? <p style={comingSoonStyle}>Coming soon</p>}
    </section>
  );
}

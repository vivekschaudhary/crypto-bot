// CB-6.0 — dashboard shell. Renders the multi-asset 3-tab nav (Mutual Funds /
// Equity / Crypto) above every /dashboard/** route (Crypto cockpit, Equity +
// Mutual Funds placeholders, and the existing trace/ledger/strategy routes,
// which remain reachable). Server Component; the tabs themselves are a Client
// Component (usePathname). Thin wrapper — pages keep their own containers, so
// no change to the trace/ledger/strategy pages in this story.

import type { JSX } from "react";

import { DashboardTabs } from "./dashboard-tabs";

const shellStyle: React.CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  padding: "1rem 2rem 0",
  maxWidth: 960,
  margin: "0 auto",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <>
      <div style={shellStyle}>
        <DashboardTabs />
      </div>
      {children}
    </>
  );
}

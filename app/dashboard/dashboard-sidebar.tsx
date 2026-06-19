"use client";

// CB-8.0 — left-sidebar nav (replaces the CB-6.0 top 3-tab strip). The shell's
// responsive layout (docked ≥768 / stacked <768) lives in app/globals.css via
// the `.dashboard-sidebar` class; this component owns the internals (title, nav,
// footer) with inline styles. Active route via usePathname → activeNavKey.
// The footer is the single Sign out surface (relocated from per-page chrome) +
// the device label (passed from the server layout). Labels VERBATIM (copy.md).

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { JSX } from "react";

import { SignOutClient } from "./sign-out-client";

type NavKey = "crypto" | "equity" | "mutual-funds" | "strategy" | "trace" | "ledger";

interface NavItem {
  key: NavKey;
  href: string;
  label: string;
}

// Labels verbatim — copy.md. The three asset views keep their CB-6.0 emoji.
const NAV: readonly NavItem[] = [
  { key: "crypto", href: "/dashboard", label: "🤖 Crypto" },
  { key: "equity", href: "/dashboard/equity", label: "📈 Equity" },
  { key: "mutual-funds", href: "/dashboard/mutual-funds", label: "📊 Mutual Funds" },
  { key: "strategy", href: "/dashboard/strategy", label: "Strategy" },
  { key: "trace", href: "/dashboard/trace", label: "Decision trace" },
  { key: "ledger", href: "/dashboard/ledger", label: "Ledger" },
] as const;

/**
 * Which nav item a pathname belongs to. Extends CB-6.0's `activeTab` to six
 * keys — strategy/trace/ledger are now first-class items (previously folded
 * into "crypto"). `/dashboard` (+ unknown sub-routes) → "crypto" (the cockpit).
 * Pure — unit-tested (the rendered nav is verified by Playwright e2e).
 */
export function activeNavKey(pathname: string): NavKey {
  if (pathname.startsWith("/dashboard/equity")) return "equity";
  if (pathname.startsWith("/dashboard/mutual-funds")) return "mutual-funds";
  if (pathname.startsWith("/dashboard/strategy")) return "strategy";
  if (pathname.startsWith("/dashboard/trace")) return "trace";
  if (pathname.startsWith("/dashboard/ledger")) return "ledger";
  return "crypto";
}

const innerStyle: React.CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  height: "100%",
};
const titleStyle: React.CSSProperties = { fontSize: "1rem", fontWeight: 700, color: "#222" };
const navStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "0.25rem" };
const itemStyle: React.CSSProperties = {
  padding: "0.4rem 0.6rem",
  fontSize: "0.9375rem",
  borderRadius: 6,
  textDecoration: "none",
  color: "#446",
};
const activeItemStyle: React.CSSProperties = {
  ...itemStyle,
  background: "#f0f2f5",
  fontWeight: 700,
  color: "#222",
};
const footerStyle: React.CSSProperties = {
  marginTop: "auto",
  borderTop: "1px solid #eee",
  paddingTop: "1rem",
};
const deviceStyle: React.CSSProperties = { color: "#777", fontSize: "0.8125rem", marginBottom: "0.5rem" };

export function DashboardSidebar({ connectedDevice }: { connectedDevice: string }): JSX.Element {
  const pathname = usePathname() ?? "/dashboard";
  const active = activeNavKey(pathname);
  return (
    <aside className="dashboard-sidebar" style={innerStyle}>
      <div style={titleStyle}>crypto-bot</div>
      <nav aria-label="Primary" style={navStyle}>
        {NAV.map((item) => {
          const isActive = item.key === active;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              style={isActive ? activeItemStyle : itemStyle}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div style={footerStyle}>
        <div style={deviceStyle}>{`Connected device: ${connectedDevice}`}</div>
        <SignOutClient />
      </div>
    </aside>
  );
}

"use client";

// CB-8.0 — left-sidebar nav (replaces the CB-6.0 top 3-tab strip). CB-8.1 —
// each item is split into icon + label so the COLLAPSED rail shows icons while
// labels are visually hidden (kept as the link's accessible name); the collapse
// toggle lives in SidebarToggle. Shell responsiveness + the collapsed rules
// live in app/globals.css (`.dashboard-sidebar` / `[data-sidebar-collapsed]`);
// this component owns the internals (inline styles). Labels VERBATIM (copy.md).

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { JSX } from "react";

import { SidebarToggle } from "./sidebar-toggle";
import { SignOutClient } from "./sign-out-client";

type NavKey = "crypto" | "equity" | "mutual-funds" | "strategy" | "trace" | "ledger";

interface NavItem {
  key: NavKey;
  href: string;
  icon: string;
  label: string;
}

// Icon + label verbatim — copy.md. Icons on all six so the collapsed rail stays
// navigable (⚙️/🧭/📒 added in CB-8.1).
const NAV: readonly NavItem[] = [
  { key: "crypto", href: "/dashboard", icon: "🤖", label: "Crypto" },
  { key: "equity", href: "/dashboard/equity", icon: "📈", label: "Equity" },
  { key: "mutual-funds", href: "/dashboard/mutual-funds", icon: "📊", label: "Mutual Funds" },
  { key: "strategy", href: "/dashboard/strategy", icon: "⚙️", label: "Strategy" },
  { key: "trace", href: "/dashboard/trace", icon: "🧭", label: "Decision trace" },
  { key: "ledger", href: "/dashboard/ledger", icon: "📒", label: "Ledger" },
] as const;

/**
 * Which nav item a pathname belongs to. Six keys — strategy/trace/ledger are
 * first-class items (not folded into "crypto"). `/dashboard` (+ unknown
 * sub-routes) → "crypto" (the cockpit). Pure — unit-tested.
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
const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "0.5rem",
};
const titleStyle: React.CSSProperties = { fontSize: "1rem", fontWeight: 700, color: "#222" };
const navStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "0.25rem" };
const itemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
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
const iconStyle: React.CSSProperties = { flexShrink: 0, width: "1.25rem", textAlign: "center" };
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
      <div style={headerStyle}>
        <span className="sidebar-title" style={titleStyle}>
          crypto-bot
        </span>
        <SidebarToggle />
      </div>
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
              <span className="nav-icon" aria-hidden="true" style={iconStyle}>
                {item.icon}
              </span>
              <span className="nav-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div style={footerStyle}>
        <div className="sidebar-device" style={deviceStyle}>{`Connected device: ${connectedDevice}`}</div>
        <SignOutClient />
      </div>
    </aside>
  );
}

"use client";

// CB-6.0 — multi-asset top-nav shell (Mutual Funds / Equity / Crypto), per the
// operator design (ETH_USD Bot — Coinbase.pdf). Crypto → the cockpit at
// /dashboard; Equity + Mutual Funds → "coming soon" placeholders (Equity =
// CB-7 / Zerodha). Tab labels VERBATIM from copy.md (refusal rule #5). The
// active tab is conveyed by aria-current + weight, not color alone (a11y).

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { JSX } from "react";

type TabKey = "crypto" | "equity" | "mutual-funds";

interface Tab {
  key: TabKey;
  href: string;
  label: string;
}

// Labels verbatim — copy.md.
const TABS: readonly Tab[] = [
  { key: "mutual-funds", href: "/dashboard/mutual-funds", label: "📊 Mutual Funds" },
  { key: "equity", href: "/dashboard/equity", label: "📈 Equity" },
  { key: "crypto", href: "/dashboard", label: "🤖 Crypto" },
] as const;

/**
 * Which tab a pathname belongs to. Crypto is the default (the `/dashboard`
 * cockpit + its sub-routes like trace/ledger/strategy). Pure — unit-tested
 * (the rendered nav is verified by Playwright e2e, per CB-3.3 Decision #9).
 */
export function activeTab(pathname: string): TabKey {
  if (pathname.startsWith("/dashboard/equity")) return "equity";
  if (pathname.startsWith("/dashboard/mutual-funds")) return "mutual-funds";
  return "crypto";
}

const navStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  marginBottom: "1.5rem",
};
const baseTabStyle: React.CSSProperties = {
  padding: "0.4rem 0.9rem",
  fontSize: "0.9375rem",
  borderRadius: 6,
  border: "1px solid #ddd",
  textDecoration: "none",
  color: "#446",
};
const activeTabStyle: React.CSSProperties = {
  ...baseTabStyle,
  border: "1px solid #446",
  fontWeight: 700,
  color: "#222",
};

export function DashboardTabs(): JSX.Element {
  const pathname = usePathname() ?? "/dashboard";
  const active = activeTab(pathname);
  return (
    <nav style={navStyle} aria-label="Asset class">
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            style={isActive ? activeTabStyle : baseTabStyle}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

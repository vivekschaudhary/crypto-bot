"use client";

// CB-8.1 — the desktop collapse/expand toggle. Extracted from DashboardSidebar
// so the sidebar stays render-testable (this component owns the hooks). The
// VISUAL is CSS-driven via `data-sidebar-collapsed` on `.dashboard-shell`. The
// server renders that attribute from the COOKIE (see sidebar-state.ts), so the
// collapsed state is correct on first paint with NO flash and NO hydration
// mismatch. This component receives the server's value as `initialCollapsed`
// (server + first client render agree → button aria matches too), and on click
// it (a) flips the attribute on `.dashboard-shell` for instant feedback and
// (b) writes the cookie so the next server render persists the choice. The ◀/▶
// glyph is `.sidebar-toggle` CSS in app/globals.css. aria-labels VERBATIM (copy.md).

import { useState, type JSX } from "react";

import { COLLAPSE_COOKIE } from "./sidebar-state";

const toggleStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  background: "transparent",
  borderRadius: 6,
  cursor: "pointer",
  padding: "0.25rem 0.5rem",
  fontSize: "0.875rem",
  lineHeight: 1,
};

// 1 year — a durable per-browser UI preference.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function SidebarToggle({ initialCollapsed = false }: { initialCollapsed?: boolean }): JSX.Element {
  // Seeded from the server's cookie-derived value → SSR and first client render
  // agree (no hydration mismatch on aria-expanded / aria-label).
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  function toggle(): void {
    const next = !collapsed;
    // The `.dashboard-shell` attribute is the visual source of truth; flip it for
    // instant feedback (it also survives soft navigation — the layout stays mounted).
    const shell = document.querySelector<HTMLElement>(".dashboard-shell");
    if (next) shell?.setAttribute("data-sidebar-collapsed", "");
    else shell?.removeAttribute("data-sidebar-collapsed");
    // Persist server-side: the next hard render reads this and renders the attr.
    document.cookie = `${COLLAPSE_COOKIE}=${next ? "1" : "0"}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
    setCollapsed(next);
  }

  return (
    <button
      type="button"
      className="sidebar-toggle"
      onClick={toggle}
      aria-expanded={!collapsed}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      style={toggleStyle}
    />
  );
}

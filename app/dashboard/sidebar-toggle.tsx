"use client";

// CB-8.1 — the desktop collapse/expand toggle. Extracted from DashboardSidebar
// so the sidebar stays render-testable (this component owns the hooks). The
// VISUAL is CSS-driven via `data-sidebar-collapsed` on <html> (set pre-paint by
// the root-layout no-flash script + here on click) — so collapse works before
// hydration and there's no flash. React state drives only aria-expanded /
// aria-label, synced from the attr on mount (server + first client render both
// render expanded → no hydration mismatch). The ◀/▶ glyph is `.sidebar-toggle`
// CSS in app/globals.css. aria-labels VERBATIM (copy.md).

import { useEffect, useState, type JSX } from "react";

const STORAGE_KEY = "sidebar-collapsed";

/** Pure: parse the persisted collapse flag. "1" → collapsed; anything else → expanded. */
export function parseCollapsed(raw: string | null): boolean {
  return raw === "1";
}

const toggleStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  background: "transparent",
  borderRadius: 6,
  cursor: "pointer",
  padding: "0.25rem 0.5rem",
  fontSize: "0.875rem",
  lineHeight: 1,
};

export function SidebarToggle(): JSX.Element {
  // Default expanded; sync from the pre-paint <html> attr on mount. Server +
  // first client render both render expanded → no hydration mismatch.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(document.documentElement.hasAttribute("data-sidebar-collapsed"));
  }, []);

  function toggle(): void {
    const el = document.documentElement;
    const next = !el.hasAttribute("data-sidebar-collapsed");
    if (next) el.setAttribute("data-sidebar-collapsed", "");
    else el.removeAttribute("data-sidebar-collapsed");
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // storage disabled (private mode) — the attr still drives this session.
    }
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

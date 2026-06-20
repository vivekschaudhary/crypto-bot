// CB-8.1 — shared collapse-state contract. The collapse pref is a COOKIE so the
// server can read it and render the `.dashboard-shell` attribute to match (no
// flash, no hydration mismatch — the architecture's "server-readable source").
// Plain module (no "use client") so the Server-Component layout can import the
// parser without pulling client code into the server bundle.

export const COLLAPSE_COOKIE = "sidebar-collapsed";

/** Pure: parse the persisted collapse flag. "1" → collapsed; anything else → expanded. */
export function parseCollapsed(raw: string | null | undefined): boolean {
  return raw === "1";
}

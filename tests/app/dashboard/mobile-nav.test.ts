// CB-8.2 — pure-seam tests for the mobile drawer. MobileTopBar (the hamburger
// control) is hook-free → render-tested via JSON.stringify (the DashboardSidebar
// precedent). trapFocusTarget is a pure helper. The interactive drawer (open/
// close/focus/Esc/scroll-lock/close-on-navigate) is the Codex e2e (CB-3.3 #9).

import { describe, expect, it, vi } from "vitest";

// MobileTopBar is pure, but the module also imports next/navigation (for
// MobileNav) — mock it so the import graph loads under vitest.
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

import { MobileTopBar, trapFocusTarget } from "@/app/dashboard/mobile-nav";

describe("MobileTopBar render (the hamburger control)", () => {
  it("renders the hamburger with Open menu label, aria-controls, and the title", () => {
    const json = JSON.stringify(MobileTopBar({ open: false, onOpen: () => {} }));
    expect(json).toContain('"aria-label":"Open menu"');
    expect(json).toContain('"aria-controls":"dashboard-drawer"');
    expect(json).toContain('"aria-expanded":false');
    expect(json).toContain("crypto-bot"); // app title in the top bar
    expect(json).toContain('"className":"drawer-hamburger"');
  });
  it("reflects open state in aria-expanded", () => {
    expect(JSON.stringify(MobileTopBar({ open: true, onOpen: () => {} }))).toContain(
      '"aria-expanded":true',
    );
  });
});

describe("trapFocusTarget — focus-trap wrap decision", () => {
  // Stand-ins for HTMLElement; trapFocusTarget compares by reference only.
  const a = { id: "a" } as unknown as HTMLElement;
  const b = { id: "b" } as unknown as HTMLElement;
  const c = { id: "c" } as unknown as HTMLElement;
  const list = [a, b, c];

  it("Tab on the last element wraps to the first", () => {
    expect(trapFocusTarget(list, c, false)).toBe(a);
  });
  it("Shift+Tab on the first element wraps to the last", () => {
    expect(trapFocusTarget(list, a, true)).toBe(c);
  });
  it("no wrap needed mid-list (browser handles it)", () => {
    expect(trapFocusTarget(list, b, false)).toBeNull();
    expect(trapFocusTarget(list, b, true)).toBeNull();
  });
  it("empty drawer → no target", () => {
    expect(trapFocusTarget([], null, false)).toBeNull();
  });
  it("single focusable wraps to itself in both directions", () => {
    expect(trapFocusTarget([a], a, false)).toBe(a);
    expect(trapFocusTarget([a], a, true)).toBe(a);
  });
});

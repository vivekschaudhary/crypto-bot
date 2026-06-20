"use client";

// CB-8.2 — mobile off-canvas drawer + hamburger (<768). Replaces the CB-8.0
// stacked-block mobile placeholder. The OPEN state is ephemeral client state
// (always closed on load → server + first client render agree → no hydration
// mismatch; NOT persisted, unlike the CB-8.1 collapse cookie). The VISUAL is
// CSS-driven via `data-drawer-open` on `.dashboard-shell` (the same shell-attr
// hook pattern as the collapse `data-sidebar-collapsed`); React owns open-state
// only for a11y (focus move-in/return, Esc, focus trap, aria, scroll-lock).
//
// MobileNav (the hooks) wraps the shell content via context so the in-drawer
// ✕ (DrawerCloseButton) can close without coupling the render-testable
// DashboardSidebar to React state. MobileTopBar + trapFocusTarget are pure
// (render/unit-testable); the interactive flows are the Codex e2e.

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type JSX, type ReactNode } from "react";

const DrawerContext = createContext<{ close: () => void } | null>(null);

/** The in-drawer ✕ uses this to close; no-op outside a MobileNav (defensive). */
export function useDrawerClose(): () => void {
  return useContext(DrawerContext)?.close ?? (() => {});
}

/**
 * Pure focus-trap helper: given the drawer's focusable elements, the currently
 * active element, and whether Shift is held, return the element to wrap focus to
 * — or null when no wrap is needed (focus stays where the browser puts it).
 * Unit-tested (the parseCollapsed pure-seam precedent).
 */
export function trapFocusTarget(
  focusables: HTMLElement[],
  active: Element | null,
  shiftKey: boolean,
): HTMLElement | null {
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (!first || !last) return null;
  if (shiftKey && active === first) return last;
  if (!shiftKey && active === last) return first;
  return null;
}

/** Pure, render-testable mobile top bar (hamburger + app title). Mobile-only via CSS. */
export function MobileTopBar({ open, onOpen }: { open: boolean; onOpen: () => void }): JSX.Element {
  return (
    <div className="dashboard-topbar">
      <button
        type="button"
        className="drawer-hamburger"
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="dashboard-drawer"
        onClick={onOpen}
      >
        ☰
      </button>
      <span className="topbar-title">crypto-bot</span>
    </div>
  );
}

/** The in-drawer ✕ close button (mobile-only via CSS). Consumes the drawer context. */
export function DrawerCloseButton(): JSX.Element {
  const close = useDrawerClose();
  return (
    <button
      type="button"
      className="drawer-close"
      data-drawer-close
      aria-label="Close menu"
      onClick={close}
    />
  );
}

// Visible (not display:none) focusables inside the drawer — getClientRects()
// excludes the desktop-only collapse toggle (display:none on mobile).
function drawerFocusables(): HTMLElement[] {
  const aside = document.querySelector<HTMLElement>(".dashboard-sidebar");
  if (!aside) return [];
  return Array.from(aside.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')).filter(
    (el) => el.getClientRects().length > 0,
  );
}

export function MobileNav({ children }: { children: ReactNode }): JSX.Element {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close-on-navigate: tapping a nav link changes the route → close the drawer
  // (the layout persists across soft navigation, so without this it'd stay open).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const close = useCallback(() => {
    setOpen(false);
    document.querySelector<HTMLElement>(".drawer-hamburger")?.focus();
  }, []);

  // Reflect open → shell attr (CSS hook) + body scroll-lock; while open, manage
  // focus (move-in), Esc, and the focus trap.
  useEffect(() => {
    const shell = document.querySelector(".dashboard-shell");
    if (open) shell?.setAttribute("data-drawer-open", "");
    else shell?.removeAttribute("data-drawer-open");
    document.body.style.overflow = open ? "hidden" : "";

    if (!open) return;

    // Move focus into the drawer (the ✕, or the first focusable).
    const closeBtn = document.querySelector<HTMLElement>(".dashboard-sidebar [data-drawer-close]");
    (closeBtn ?? drawerFocusables()[0])?.focus();

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key === "Tab") {
        const target = trapFocusTarget(drawerFocusables(), document.activeElement, e.shiftKey);
        if (target) {
          e.preventDefault();
          target.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  return (
    <DrawerContext.Provider value={{ close }}>
      <MobileTopBar open={open} onOpen={() => setOpen(true)} />
      {children}
      {/* Scrim: CSS-hidden unless mobile + open. Click closes (Esc for keyboard). */}
      <div className="drawer-scrim" aria-hidden="true" onClick={close} />
    </DrawerContext.Provider>
  );
}

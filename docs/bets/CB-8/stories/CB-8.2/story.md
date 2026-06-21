---
id: CB-8.2
bet: CB-8
type: story
status: in-review
priority: P2
created: 2026-06-20
author: PM
design_link: docs/bets/CB-8/stories/CB-8.2/design.md
copy_link: docs/bets/CB-8/stories/CB-8.2/copy.md
area_tags: [frontend, dashboard, layout, responsive, css, a11y, client-state]
dependencies:
  - CB-8.0 shipped (responsive shell + sidebar + globals.css)
  - CB-8.1 shipped (desktop collapse — the drawer must not disturb it)
e2e: true
---

# CB-8.2 — Mobile off-canvas drawer + hamburger (THIRD CB-8 STORY)

## Description

On phones (`<768`) the dashboard nav is unusable: CB-8.0 stacked the full sidebar (title + 6 nav items + footer) as a block **above** the content, pushing the cockpit far down the page. This story replaces that with a proper **off-canvas drawer**: a slim mobile top bar with a **hamburger ☰** opens the sidebar as a panel that slides in over the content with a backdrop scrim; it closes via a **✕** button, tapping the scrim, **Esc**, or **navigating**. The drawer reuses the existing sidebar content. Desktop (≥768) docked sidebar + the CB-8.1 collapse toggle are untouched. Layout/chrome only — no content, route, or trading-logic change.

## Acceptance Criteria

- [ ] **AC 1 — Mobile top bar + hamburger (<768).** A slim top bar visible only `<768` with a hamburger `<button>` (left) + the `crypto-bot` title. Hidden `≥768` (docked sidebar + collapse toggle unchanged). Copy verbatim ([copy.md](copy.md)): glyph `☰`, `aria-label` `Open menu`.
- [ ] **AC 2 — Off-canvas drawer.** `<768`: `.dashboard-sidebar` is off-canvas (`position: fixed`, `transform: translateX(-100%)`). Tapping ☰ slides it in over the content with a **backdrop scrim** dimming the content behind. The drawer reuses the existing sidebar content (title, 6 nav items with icons, footer device line + Sign out) — no duplicate nav definition.
- [ ] **AC 3 — Four close paths.** The drawer closes via: (a) a **✕** close button in the drawer header (`aria-label` `Close menu`), (b) tapping the **scrim**, (c) pressing **Esc**, (d) **navigating** — tapping any nav link changes the route and closes the drawer (via a `usePathname()` effect, not per-link wiring).
- [ ] **AC 4 — Ephemeral state — no flash, no hydration mismatch.** Open state is **client-only and NOT persisted** → always closed on load → the server and first-client render both render closed → no hydration mismatch (contrast CB-8.1's persisted collapse). CSS-driven visual via `data-drawer-open` on `.dashboard-shell` (same shell-attribute hook pattern as the CB-8.1 collapse). No cookie, no pre-paint script.
- [ ] **AC 5 — Desktop unaffected (≥768).** Docked sidebar + the CB-8.1 collapse toggle behave exactly as before; the top bar, hamburger, and scrim are CSS-hidden; `data-drawer-open` has no visual effect `≥768`. Resizing mobile→desktop while the drawer is "open" strands no overlay (the desktop rules win).
- [ ] **AC 6 — Accessibility (load-bearing).** Hamburger: real `<button>` with `aria-label` (`Open menu`) + `aria-expanded` (reflects open) + `aria-controls` (the drawer). On open, focus moves into the drawer (the ✕ button); **Esc** closes; on close, focus returns to the hamburger; **focus is trapped** within the drawer while open. The drawer is a labeled dialog/region. Respects `@media (prefers-reduced-motion: reduce)` (no slide). Body scroll-locked while open.
- [ ] **AC 7 — No horizontal scroll / no regression.** `<768` no horizontal scroll in either state (closed or open); all 6 routes reachable from the drawer; active-route highlight intact; cockpit / trace / ledger / strategy content unchanged; `/dashboard` stays dynamic; read-only + `/api/bot/**` invariants green; CB-8.0 shell + CB-8.1 collapse behavior intact.
- [ ] **AC 8 — Tests.** Component/unit: `DashboardSidebar` stays **render-testable** (hook-free) — the drawer's open-state + focus/Esc/scrim live in an extracted client controller (mirror the `SidebarToggle` precedent); component-test the hamburger control (aria-label + aria-expanded) and any pure helper. e2e (Codex): mobile (375) — ☰ visible, drawer opens on tap, nav works + **closes on navigate**, scrim / Esc / ✕ each close it, focus moves in on open + returns on close, no horizontal scroll; desktop (1280) — ☰/top-bar/scrim hidden, docked + collapse unaffected.
- [ ] **AC 9 — Gates.** typecheck / lint / test / build clean; `/dashboard` Dynamic; the drawer/`data-drawer-open` rules confirmed in an emitted CSS asset; e2e via the test DB (external-mode recipe / #80).

## Standard Experience Checklist

UI story — load-bearing.
- [ ] **Navigation** — `covered by AC 1/2/3: open via the hamburger; close via ✕ / scrim / Esc / nav-link (close-on-navigate). Every nav route reachable from the drawer.`
- [ ] **States** — `covered by AC 2/3/5: closed (default) · open · desktop (hidden). loading/empty/error/success/disabled — n/a: static navigation chrome, no async data or actions.`
- [ ] **Feedback** — `covered by AC 2/6: visual feedback = slide-in + scrim + aria-expanded. error-type discrimination / success ack / destructive-confirm — n/a: no async, no errors, no destructive action in this chrome (Sign out keeps its existing footer behavior).`
- [ ] **Accessibility** — `covered by AC 6: hamburger aria-label/aria-expanded/aria-controls; focus move-in on open + return on close; focus trap; Esc; labeled dialog; prefers-reduced-motion; scroll-lock.`
- [ ] **Edge cases** — `covered by AC 3/5/6/7: close-on-navigate; resize mobile→desktop while open strands nothing; no horizontal scroll either state; reduced-motion.`
- [ ] **Cross-surface consistency** — `n/a — single web target; mobile vs desktop are responsive breakpoints of the same surface, both covered by AC 1/5.`

## Tech notes

### Reuse
- `app/globals.css` — the architecture already earmarked the `@media (max-width: 767px)` drawer rules here; this story replaces the CB-8.0 mobile stack rules with off-canvas + `.dashboard-shell[data-drawer-open]` + scrim. Same `.dashboard-shell` attribute-hook pattern as the CB-8.1 collapse.
- `app/dashboard/dashboard-sidebar.tsx` (CB-8.0/8.1) — the drawer IS this component's content; keep it hook-free/render-testable. The collapse `SidebarToggle` (CB-8.1) stays (desktop-only).
- `app/dashboard/layout.tsx` (server shell) — already renders `.dashboard-shell` + the sidebar; mount the mobile controller here (or inside the sidebar tree) so the hamburger/scrim are siblings of the off-canvas aside.

### Engineer DRI (confirm at build)
- **Open state is ephemeral** (always closed on load) → no SSR/persistence/hydration concern. Do NOT persist it (that's the collapse's job, and would reintroduce the CB-8.1 server-readable problem). The visual is CSS/attr-driven via `data-drawer-open` on `.dashboard-shell`; React owns open state for a11y (focus, Esc, aria, trap).
- **Render-testability seam:** extract the drawer hooks (open `useState`, focus management, Esc handler, `usePathname()` close-on-navigate) into a client controller so `DashboardSidebar` stays JSON.stringify-render-testable (the SidebarToggle precedent). Exact component boundary is the Engineer's call — but the no-hooks-in-DashboardSidebar invariant must hold.
- **Focus trap + scroll-lock** are the load-bearing a11y pieces; the interactive open/close + focus + Esc + close-on-navigate are e2e-verified (Codex).
- `≥768`: `data-drawer-open` must be inert (the desktop docked/collapse rules win) so a resize never strands an overlay.

### What this story does NOT include
- Per-page content-width pass (CB-8.3 — relax 960/640 `maxWidth`). No nav-item/route change. No swipe-to-open gesture (tap-only). Desktop collapse (CB-8.1) untouched.

## PRs
- #108 — mobile off-canvas drawer + hamburger. Open 2026-06-20; awaiting Codex review + Phase-3 e2e.

## Tests
_Unit/component co-located; e2e by Codex in `e2e/dashboard/` (test DB; external-mode recipe / #80)._

## DRI Log

### Decisions
- [2026-06-20] [PM] **Adaptive renumber — this is CB-8.2 (mobile drawer).** The brief forecast listed 8.2=collapse / 8.3=drawer, but execution folded the styling layer + sidebar into CB-8.0 and shipped collapse as CB-8.1; the next slice is the mobile drawer → CB-8.2 (per the CB-8.1 closing note "Next: 8.2 mobile drawer"). The per-page width pass becomes CB-8.3. — area: planning — alternatives: keep the brief's numbering (rejected — would skip a number / mislabel) — reversibility: easy.
- [2026-06-20] [Designer] **Off-canvas drawer + scrim, not a stacked block.** Replaces the CB-8.0 mobile placeholder (full sidebar stacked above content). Reuses the existing sidebar content (no duplicate nav). — area: ux — alternatives: top dropdown / bottom tab bar (rejected — drawer matches the approved architecture + the left-nav mental model) — reversibility: easy.
- [2026-06-20] [Architect/Engineer] **Ephemeral client open-state + CSS `[data-drawer-open]` hook; NOT persisted.** Unlike collapse, the drawer always starts closed → server + first-client render agree → no hydration mismatch, no cookie/script needed. Visual is CSS/attr-driven; React owns open-state for a11y. — area: client-state — alternatives: persist open-state (rejected — pointless + reintroduces the CB-8.1 SSR problem); pure-CSS checkbox hack (rejected — can't do focus-trap/Esc/return-focus accessibly) — reversibility: easy.
- [2026-06-20] [Designer] **Close-on-navigate via `usePathname()` effect.** Decouples "tap a nav link closes the drawer" from per-link wiring (the layout persists across soft navigation, so without this the drawer would stay open after navigating). — area: a11y/ux — reversibility: easy.
- [2026-06-20] [UX Writer] **Hamburger `aria-label` stays `Open menu` constant; `aria-expanded` carries state; the in-drawer ✕ (`Close menu`) is the close affordance.** — area: a11y — reversibility: easy.

### Risks
- [2026-06-20] [Engineer] **Focus trap / scroll-lock correctness** (accessible drawer is fiddly) — likelihood: medium — impact: medium — mitigation: standard dialog pattern; e2e asserts focus move-in/return + Esc; keep the controller small + tested — area: a11y.
- [2026-06-20] [Engineer] **Drawer state stranded on resize** (open on mobile → resize to desktop) — likelihood: low — impact: low — mitigation: `data-drawer-open` is inert `≥768` (desktop rules win); e2e covers the desktop viewport — area: correctness.
- [2026-06-20] [Engineer] **Breaking DashboardSidebar render-testability** by adding hooks — likelihood: medium — impact: low — mitigation: extract the drawer hooks into a client controller (SidebarToggle precedent); the no-hooks invariant is an AC-8 check — area: testability.

- [2026-06-20] [Engineer] **Codex BLOCKER ×2 closed (PR #108).** (1) **Drawer accessible identity (AC 6):** the `<aside id="dashboard-drawer">` had no accessible name → added `aria-label="Sidebar"` (a labeled complementary region — Codex's endorsed "labeled region" option; static so it stays correct in both docked + drawer modes without coupling the render-testable sidebar to state). (2) **Scroll-lock / shell-attr leak (AC 5/6):** the open-effect set `body.overflow:hidden` + `data-drawer-open` but its cleanup only removed the keydown listener → a resize-to-desktop or unmount-while-open could leave the page scroll-locked. Fixed: the effect now early-returns when closed and its cleanup ALWAYS restores both the attr and `body.overflow` (covers close, resize, AND unmount); added a `matchMedia("(min-width: 768px)")` listener that closes the drawer when crossing to desktop. — area: a11y/correctness — reversibility: easy.

### Issues
_None at story creation._

---
_Story closed: <pending>, brief: docs/bets/CB-8/brief.md. **THIRD CB-8 STORY — mobile off-canvas drawer + hamburger (the "responsive on mobile" ask). Next: 8.3 per-page content-width pass.**_

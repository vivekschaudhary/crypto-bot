# CB-8.0 — Design (responsive shell + left-sidebar nav)

_Designer artifact. Implements the CB-8 architecture (global CSS + `@media` + viewport; `[sidebar | content]` flex). FIRST CB-8 story — the foundational responsive shell + a functional left-sidebar nav replacing the top 3-tab strip. Collapse (8.1), off-canvas drawer (8.2), and the per-page width pass (8.3) are deferred. Layout/chrome only._

## Desktop / laptop / iPad (≥ 768px) — docked sidebar

```
┌────────────────┬─────────────────────────────────────────┐
│ crypto-bot      │                                          │
│                 │   {page content — cockpit / trace / …}   │
│ 🤖 Crypto   ◀ active                                       │
│ 📈 Equity       │                                          │
│ 📊 Mutual Funds │                                          │
│ Strategy        │                                          │
│ Decision trace  │                                          │
│ Ledger          │                                          │
│                 │                                          │
│ ───────────     │                                          │
│ <device label>  │                                          │
│ [ Sign out ]    │                                          │
└────────────────┴─────────────────────────────────────────┘
```

- **Header:** app title `crypto-bot` (top of the sidebar).
- **Nav:** six items — **🤖 Crypto** (`/dashboard`) · **📈 Equity** · **📊 Mutual Funds** · **Strategy** · **Decision trace** · **Ledger**. The active route is highlighted (weight + a subtle background; never color-only — a11y) via the extended `activeNavKey(pathname)`.
- **Footer:** the operator's **device label** + the **Sign out** button (moved here from the per-page top-right).
- **Content area:** the page renders to the right, filling the remaining width.

## Mobile (< 768px) — stacked (no horizontal scroll)

```
┌─────────────────────────────┐
│ crypto-bot                   │
│ 🤖 Crypto · 📈 Equity · 📊 MF │  ← nav wraps; no horizontal scroll
│ Strategy · Trace · Ledger    │
│ <device label> · [Sign out]  │
├─────────────────────────────┤
│ {page content}               │
└─────────────────────────────┘
```

- The shell switches to a **column**: the sidebar becomes a full-width block on top (nav items wrap), content below. **No horizontal scroll** (the viewport meta + fluid content). This is the 8.0 mobile baseline; **8.2** upgrades it to an off-canvas drawer + hamburger for more content space.

## Styling layer (per architecture)
- `app/globals.css` (NEW, imported in `app/layout.tsx`): box-sizing reset; the `.dashboard-shell` flex (row ≥768 / column <768 via `@media (max-width: 767px)`); sidebar + nav + footer classes; the content container. CSS custom property for the sidebar width (so 8.1's collapse can reuse it).
- `app/layout.tsx`: `export const viewport = { width: "device-width", initialScale: 1 }`.
- Component internals stay inline styles; only the shell uses CSS.

## States
- **Active route** highlighted (one of the six).
- **Mobile** (<768) → stacked, no horizontal scroll.
- **Desktop/laptop/iPad** (≥768) → docked left sidebar.
- (Collapsed rail → 8.1; off-canvas drawer → 8.2.)

## Accessibility
- `<nav aria-label="Primary">`; active item `aria-current="page"` + weight/background (not color alone). Keyboard-operable links + the existing `SignOutClient` button.
- Viewport meta enables proper mobile zoom/scale.

## Out of scope (design)
- Desktop collapse/expand + persistence (8.1). Mobile off-canvas drawer + hamburger (8.2). Per-page content-width pass — pages keep their current `maxWidth` for now, centered within the content area (8.3). No cockpit-content change.

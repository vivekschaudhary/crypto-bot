# CB-8.1 — Design (desktop collapse / expand)

_Designer artifact. The operator's "minimize the left bar to show more space" ask. Builds on the CB-8.0 docked sidebar (≥768). Collapse is a **desktop/docked affordance** (the toggle is hidden <768; the mobile drawer is 8.2). Per the approved architecture: `localStorage` persistence applied pre-paint via a no-flash `<html>` script; CSS-driven visual via `[data-sidebar-collapsed]`._

## Expanded (default) → Collapsed (icon rail)

```
EXPANDED (≥768)                    COLLAPSED (≥768) — reclaims width
┌────────────────┬────────────┐    ┌────┬───────────────────────────┐
│ crypto-bot   ◀ │            │    │ ▶  │                           │
│ 🤖 Crypto      │  content   │    │ 🤖 │   content (wider)         │
│ 📈 Equity      │            │    │ 📈 │                           │
│ 📊 Mutual Funds│            │    │ 📊 │                           │
│ ⚙️ Strategy    │            │    │ ⚙️ │                           │
│ 🧭 Decision …  │            │    │ 🧭 │                           │
│ 📒 Ledger      │            │    │ 📒 │                           │
│ <device> ⎋     │            │    │ ⎋  │                           │
└────────────────┴────────────┘    └────┴───────────────────────────┘
```

- A **collapse/expand toggle** at the top of the sidebar (≥768 only). Clicking it narrows the sidebar to an **icon-only rail** (`--sidebar-width` → ~56px), hiding the labels + the device line; the content area reclaims the width. Clicking again expands.
- Every nav item shows its **icon** in the rail (so navigation still works collapsed) — split each item into `{ icon, label }`; add icons to the three that lacked them (⚙️ Strategy · 🧭 Decision trace · 📒 Ledger). The label text is **visually hidden** when collapsed (kept as the link's accessible name — screen readers still announce it).
- **Persisted** in `localStorage` (`sidebar-collapsed`), **per browser**. Applied **before paint** via a tiny blocking `<html>` script (set in `app/layout.tsx`) → no flash, no hydration mismatch.

## Mechanism (per architecture)
- `app/layout.tsx`: an inline `<script>` reads `localStorage['sidebar-collapsed']` and sets `data-sidebar-collapsed` on `<html>` before the body paints.
- `app/globals.css`: `html[data-sidebar-collapsed] .dashboard-sidebar { --sidebar-width: 56px; }` + hide `.nav-label` / device line; the icon rail stays. Toggle glyph (◀ / ▶) is CSS-driven by the attr.
- The toggle (in `dashboard-sidebar.tsx`, already `'use client'`): onClick flips the `<html>` attr + writes `localStorage`; `aria-expanded` syncs from the attr on mount (`useEffect`) so the default server/first-client render matches (no mismatch).

## States
- **Expanded** (default; no persisted value or `=0`).
- **Collapsed** (persisted `=1`) — icon rail; content reclaims width; no flash on reload.
- **Mobile (<768):** the toggle is hidden; collapse has no effect (the sidebar stacks; the off-canvas drawer is 8.2).

## Accessibility
- Toggle: a real `<button>` with `aria-expanded` (reflects state) + an `aria-label` (`Collapse sidebar` / `Expand sidebar`). Keyboard-operable.
- Collapsed icons keep their **label as the accessible name** (visually-hidden text, not removed) so the nav stays screen-reader-navigable.
- Glyph/icon is reinforcement; the accessible name carries meaning.

## Out of scope (design)
- Mobile off-canvas drawer + hamburger (8.2). Per-page content-width pass (8.3). No nav-item or route change beyond adding the three icons.

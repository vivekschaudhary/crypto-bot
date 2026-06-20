# CB-8.2 — Design (mobile off-canvas drawer + hamburger)

_Designer artifact. Replaces the CB-8.0 mobile placeholder (the full sidebar stacked as a block above content, pushing the cockpit far down) with a proper **off-canvas drawer** at `<768`. Per the approved architecture: mobile (<768) → off-canvas drawer + hamburger; layout via CSS `@media`; the ephemeral open/close state is client-only (always closed on load → no flash, no hydration mismatch). Docked (≥768) sidebar + the CB-8.1 collapse toggle are untouched._

## Mobile (<768): closed → open

```
CLOSED (<768)                          OPEN (<768) — drawer over content + scrim
┌──────────────────────────┐          ┌───────────────┲━━━━━━━━━━━━┓
│ ☰  crypto-bot            │          │ crypto-bot  ✕ ┃▓▓▓ scrim ▓▓┃
├──────────────────────────┤          │ 🤖 Crypto     ┃▓▓▓▓▓▓▓▓▓▓▓▓┃
│                          │          │ 📈 Equity     ┃▓▓ content ▓┃
│        content           │          │ 📊 Mutual F.  ┃▓▓ (dimmed)▓┃
│   (full width on mobile) │          │ ⚙️ Strategy   ┃▓▓▓▓▓▓▓▓▓▓▓▓┃
│                          │          │ 🧭 Decision … ┃▓▓▓▓▓▓▓▓▓▓▓▓┃
│                          │          │ 📒 Ledger     ┃▓▓▓▓▓▓▓▓▓▓▓▓┃
│                          │          │ <device> ⎋    ┃▓▓▓▓▓▓▓▓▓▓▓▓┃
└──────────────────────────┘          └───────────────┺━━━━━━━━━━━━┛
   tap ☰ → slide in            tap ✕ / scrim / Esc / a nav link → slide out
```

- A slim **mobile top bar** (visible only `<768`) holds a **hamburger ☰** (left) + the **`crypto-bot`** title. It's the only nav affordance while the drawer is closed (the sidebar is off-canvas).
- Tapping ☰ slides the **drawer** (the existing `.dashboard-sidebar` content — title, 6 nav items with icons, footer device line + Sign out) in from the left, over the content, with a **backdrop scrim** dimming the content behind.
- **Four close paths:** the **✕** button in the drawer header · tap the **scrim** · press **Esc** · tap **any nav link** (navigates → drawer closes).
- The drawer reuses the SAME content as the docked sidebar — no duplicate nav definition.

## Mechanism (per architecture)
- **Layout = CSS `@media (max-width: 767px)`** in `app/globals.css`: `.dashboard-sidebar` becomes `position: fixed; inset-block: 0; left: 0; transform: translateX(-100%)` (off-canvas). The CSS hook `.dashboard-shell[data-drawer-open]` → `.dashboard-sidebar { transform: none }` + reveals the scrim. (Same `.dashboard-shell` attribute pattern as the CB-8.1 `data-sidebar-collapsed` collapse hook.)
- **Open state = ephemeral client state** (NOT persisted; unlike collapse). It's always closed on load → the server and the first client render both render closed → **no hydration mismatch**. No cookie, no script.
- A small client controller owns `open`, renders the hamburger + the scrim, and toggles `data-drawer-open` on `.dashboard-shell`. **Close-on-navigate** is a `usePathname()` effect: when the path changes, close the drawer (decoupled — no per-link wiring).
- The hamburger/top-bar/scrim are **CSS-hidden at ≥768**; `data-drawer-open` has no effect there (the desktop docked + collapse rules win), so resizing mobile→desktop while "open" strands nothing.

## States
- **Closed** (default, every load) — top bar + ☰ visible; drawer off-canvas; content full-width.
- **Open** — drawer in; scrim over content; focus inside the drawer.
- **Desktop (≥768)** — docked sidebar + CB-8.1 collapse toggle unchanged; top bar / ☰ / scrim hidden.
- (No loading / empty / error / success / disabled — this is static navigation chrome with no async data or actions.)

## Accessibility (load-bearing)
- Hamburger: a real `<button>` — `aria-label` (`Open menu`), `aria-expanded` (reflects open), `aria-controls` pointing at the drawer.
- **Focus management:** on open, move focus into the drawer (the ✕ close button); on close, return focus to the hamburger. **Focus trap** while open (Tab cycles within the drawer). **Esc** closes.
- The drawer is a labeled dialog/region (`aria-label` or `role="dialog" aria-modal="true"`); the scrim is not a focus target (the ✕ + Esc + nav links are the operable controls).
- **Reduced motion:** `@media (prefers-reduced-motion: reduce)` → no slide transition (instant open/close).
- Body scroll-lock while open (prevents the dimmed content scrolling behind the drawer).

## Out of scope (design)
- Per-page content-width pass (CB-8.3 — relax the 960/640 `maxWidth`). No nav-item or route change. Desktop collapse (CB-8.1, shipped) is untouched. No swipe-to-open gesture (tap-only; a later polish if asked).

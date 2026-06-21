# CB-8.3 — Design (per-page content-width pass)

_Designer artifact. The FINAL CB-8 story — the per-page content-width pass the brief earmarked. No new UI, no new copy: this relaxes the per-page width/padding written for the old full-width page so pages sit correctly inside the new `.dashboard-content` flex area, with consistent, mobile-friendly spacing owned by the shell. Per the architecture: the content-area container owns padding/centering; component internals stay inline._

## Problem

Every `/dashboard/*` page repeats — inline, in its own `pageStyle` — the chrome of a full-width page:

| Page | maxWidth | margin | padding |
|---|---|---|---|
| cockpit (`/dashboard`) | 960 | `0 auto` | `0 2rem 2rem` |
| equity | 960 | `0 auto` | `2rem` |
| mutual-funds | 960 | `0 auto` | `2rem` |
| trace | 960 | `0 auto` | `2rem` |
| ledger | 960 | `0 auto` | `2rem` |
| strategy (form) | **640** | `0 auto` | `2rem` |

That `2rem` is duplicated 6× and is heavy on a phone (2rem each side ≈ 64px of a 375px screen). The width caps (960 vs 640) are legitimate per-page content-column choices, but the **padding + centering** are shell concerns being repeated.

## Approach

- **`.dashboard-content` owns the shared spacing:** responsive horizontal+vertical padding — `2rem` at `≥768`, `1rem` at `<768` (reclaims phone width) — plus `min-width: 0` (already present, prevents horizontal scroll).
- **Each page keeps its content-column width** (960, or 640 for the strategy form) + `margin: 0 auto` to center within the padded area, and **drops its own `padding`** (now from the container). One inline width per page; no repeated padding.
- The cockpit's `padding: "0 2rem 2rem"` (no top padding) normalizes to the container's uniform padding — the cockpit gains a small, consistent top gap. This is a deliberate spacing normalization, not a content change.

## States / responsiveness

- **Desktop (≥768):** content centered, `2rem` padding; width capped per page (960/640). When the sidebar is collapsed (CB-8.1) the content area widens — pages re-center, no change needed.
- **Mobile (<768):** `1rem` padding; content full-width-minus-padding (the 960/640 caps are inert below their value); **no horizontal scroll** down to 320px (WCAG 1.4.10 reflow).

## Accessibility
- No horizontal scroll at 320 / 375 (reflow). Content remains readable; no clipped controls. No focus/keyboard change (layout-only).

## Out of scope (design)
- The public landing `app/page.tsx` (`/`, maxWidth 480) — it's NOT under the dashboard shell; unchanged.
- Any card/data/logic change. No new components, no copy. No design-system / shared-primitive refactor (a possible later bet).

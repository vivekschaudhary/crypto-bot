---
id: CB-8.3
bet: CB-8
type: story
status: in-review
priority: P2
created: 2026-06-20
author: PM
design_link: docs/bets/CB-8/stories/CB-8.3/design.md
area_tags: [frontend, dashboard, layout, responsive, css]
dependencies:
  - CB-8.0 shipped (shell + globals.css + .dashboard-content)
  - CB-8.1 shipped (collapse — content width reclaim)
  - CB-8.2 shipped (mobile drawer)
e2e: true
---

# CB-8.3 — Per-page content-width pass (FINAL CB-8 STORY)

## Description

Every `/dashboard/*` page still carries the chrome of a full-width page — its own `maxWidth` + `margin: 0 auto` + `padding: 2rem` repeated inline (the `2rem` duplicated across 6 pages, and heavy on a phone). This story moves the **shared spacing into the shell** (`.dashboard-content` owns responsive padding + centering area), relaxes each page to just its content-column width, and guarantees no horizontal scroll down to 320px. Closes the brief's per-page width risk and finishes CB-8. Layout/spacing only — no content, data, copy, or logic change.

## Acceptance Criteria

- [ ] **AC 1 — Shell owns spacing.** `.dashboard-content` gets responsive padding — `2rem` at `≥768`, `1rem` at `<768` — alongside the existing `flex: 1; min-width: 0`. Padding is declared once (the shell), not per page.
- [ ] **AC 2 — Pages relax.** Each dashboard page (`/dashboard` cockpit, equity, mutual-funds, trace, ledger, strategy) **drops its own `padding`** and keeps only its content-column `maxWidth` + `margin: 0 auto` for centering within the padded area. Width caps preserved: 960 (cockpit/equity/MF/trace/ledger), **640** (strategy form).
- [ ] **AC 3 — No horizontal scroll (reflow).** At 320 / 375 / 768 / 1280 widths, every dashboard route has no horizontal scroll (`scrollWidth ≤ clientWidth`); content reflows readably (WCAG 1.4.10).
- [ ] **AC 4 — Collapse interplay intact.** With the sidebar collapsed (CB-8.1) the content area widens and pages re-center correctly; with the mobile drawer (CB-8.2) the content is full-width-minus-padding. No regression to either.
- [ ] **AC 5 — No content/logic change.** Cards, data, reasons, controls, copy, and all read/trade behavior are unchanged on every route; only outer width/padding/centering moves. The cockpit's top spacing normalizes to the uniform container padding (a deliberate spacing change, not a content change).
- [ ] **AC 6 — Landing untouched.** `app/page.tsx` (`/`, maxWidth 480) is NOT under the dashboard shell → unchanged.
- [ ] **AC 7 — No regression.** All routes reachable; `/dashboard` stays dynamic; read-only + `/api/bot/**` invariants green; CB-8.0/8.1/8.2 shell, collapse, and drawer behavior intact.
- [ ] **AC 8 — Tests.** Component/unit: existing dashboard render tests stay green (no new pure seam strictly required — this is CSS/inline-style relaxation). e2e (Codex): per-route no-horizontal-scroll at 320/375/768/1280; padding applied; content centered ≥768; collapse + drawer unaffected.
- [ ] **AC 9 — Gates.** typecheck / lint / test / build clean; `/dashboard` Dynamic; `.dashboard-content` padding confirmed in an emitted CSS asset; e2e via the test DB (external-mode recipe / #80).

## Standard Experience Checklist

Layout-only story (no new UI/copy/flows).
- [ ] **Navigation** — `n/a — no navigable surface added or changed; existing nav (sidebar/drawer) unchanged (AC 7).`
- [ ] **States** — `n/a — no new states; each page's own loading/empty/error/success states are unchanged (AC 5).`
- [ ] **Feedback** — `n/a — no new actions, errors, or destructive operations (layout/spacing only).`
- [ ] **Accessibility** — `covered by AC 3: no horizontal scroll at 320/375 (WCAG 1.4.10 reflow); content readable; no focus/keyboard change.`
- [ ] **Edge cases** — `covered by AC 3/4: narrow (320) + standard breakpoints; collapsed-sidebar width reclaim; mobile drawer; ultra-wide capped by per-page maxWidth.`
- [ ] **Cross-surface consistency** — `n/a — single web target; responsive breakpoints covered by AC 1/3.`

## Tech notes

### Reuse
- `app/globals.css` `.dashboard-content` (CB-8.0) — add the responsive padding here; the architecture earmarked the content-area container for padding/centering.
- The six `/dashboard/**/page.tsx` (+ cockpit `page.tsx`) `pageStyle` objects — drop `padding`, keep `maxWidth` + `margin: "0 auto"`.

### Engineer DRI (confirm at build)
- **Deviation from the architecture's literal "container owns max-width + auto-margins":** the per-page content widths differ (960 vs strategy's 640), so the WIDTH cap stays per-page (a legitimate content-column choice); the container owns PADDING (+ the existing `min-width: 0`). Centering stays per-page via `margin: 0 auto` within the padded container. Documented so it's not silent.
- `box-sizing: border-box` is already global (CB-8.0) → padding doesn't add to width (no overflow). Verify `scrollWidth ≤ clientWidth` at 320.
- The cockpit loses its `padding: "0 2rem 2rem"` special-case (no top padding) → gains the uniform container top padding. Acceptable spacing normalization (AC 5).

### What this story does NOT include
- The public landing (`app/page.tsx`). Any card/data/logic/copy change. A shared `<Card>`/`<Page>` primitive / design-system refactor (possible later bet). New routes.

## PRs
- #109 — per-page content-width pass. Open 2026-06-20; awaiting Codex review + Phase-3 e2e.

## Tests
_Unit/component co-located; e2e by Codex in `e2e/dashboard/` (test DB; external-mode recipe / #80)._

## DRI Log

### Decisions
- [2026-06-20] [PM] **This is CB-8.3 — the FINAL CB-8 story (adaptive renumber).** The brief forecast listed the width pass as 8.4, but the styling layer + sidebar folded into 8.0, collapse shipped as 8.1, drawer as 8.2 → the width pass is 8.3. After this ships, CB-8 is complete → `/scan CB-8` (Build → Production-Ready). — area: planning — reversibility: easy.
- [2026-06-20] [Designer/Architect] **Shell owns padding; pages keep per-page width.** `.dashboard-content` owns responsive padding (2rem ≥768 / 1rem <768) + centering area; each page keeps its `maxWidth` (960 / 640) + `margin: 0 auto`. Removes 6× duplicated padding + fixes heavy mobile padding without collapsing the legitimate 960-vs-640 distinction. — area: layout — alternatives: container imposes a single max-width (rejected — would erase the strategy form's narrower 640 column); per-page CSS classes (rejected — inline-style convention for page internals) — reversibility: easy.
- [2026-06-20] [UX Writer] **copy.md = n/a.** No new visible strings (layout/spacing only); existing page copy unchanged. Recorded here rather than a silent skip (principle #3). — area: copy — reversibility: easy.

### Risks
- [2026-06-20] [Engineer] **Spacing regression on a specific page** (each page relaxed individually) — likelihood: medium — impact: low — mitigation: per-route e2e no-horizontal-scroll at 4 widths; visual spacing is reversible; cards/data unchanged — area: ui.
- [2026-06-20] [Engineer] **Cockpit top-spacing change** (loses its no-top-padding special case) — likelihood: high (intended) — impact: low — mitigation: deliberate normalization (AC 5); revert the one page's padding if the operator dislikes it — area: ui.

### Issues
_None at story creation._

---
_Story closed: <pending>, brief: docs/bets/CB-8/brief.md. **FINAL CB-8 STORY — per-page content-width pass. On ship: CB-8 BET COMPLETE → `/scan CB-8` (Build → Production-Ready).**_

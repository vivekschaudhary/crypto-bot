---
id: CB-8.1
bet: CB-8
type: story
status: ready
priority: P2
created: 2026-06-20
author: PM
design_link: docs/bets/CB-8/stories/CB-8.1/design.md
copy_link: docs/bets/CB-8/stories/CB-8.1/copy.md
area_tags: [frontend, dashboard, layout, responsive, css, client-state]
dependencies:
  - CB-8.0 shipped (responsive shell + sidebar + globals.css --sidebar-width var)
e2e: true
---

# CB-8.1 — Desktop collapse / expand (SECOND CB-8 STORY)

## Description

The operator's "minimize the left bar to show more space": a **collapse/expand toggle** on the docked sidebar (≥768) that narrows it to an **icon-only rail** and reclaims content width, **persisted** in `localStorage` and applied **before paint** (no flash, no hydration mismatch) — per the approved architecture. Layout/chrome only.

## Acceptance Criteria

- [ ] **AC 1 — Toggle.** A collapse/expand `<button>` at the top of the sidebar (docked ≥768 only; hidden <768). Clicking collapses the sidebar to an icon rail (`--sidebar-width` → ~56px) and reclaims content width; clicking again expands. Glyph CSS-driven (`◀`/`▶`). Copy verbatim ([copy.md](copy.md)).
- [ ] **AC 2 — Icon rail (navigable collapsed).** Each nav item is split into `{ icon, label }`; all six have an icon (⚙️ Strategy · 🧭 Decision trace · 📒 Ledger added). Collapsed → labels **visually hidden** (NOT removed — kept as the link's accessible name); icons shown so the nav still works. The device line hides; the toggle stays.
- [ ] **AC 2b — Persistence + no flash.** State persists in `localStorage` (`sidebar-collapsed`; `1`=collapsed). Applied **pre-paint** via an inline `<html>` script in `app/layout.tsx` (reads localStorage → sets `data-sidebar-collapsed`) → no expand→collapse flash on reload, no hydration mismatch.
- [ ] **AC 3 — CSS-driven visual.** `app/globals.css`: `html[data-sidebar-collapsed] .dashboard-sidebar { --sidebar-width: 56px; }` + hide `.nav-label` + device line + the expand/collapse glyph. Stays scoped to the shell (EA: no CSS sprawl).
- [ ] **AC 4 — Toggle = DOM + storage, a11y-correct.** onClick flips the `<html>` `data-sidebar-collapsed` attr + writes `localStorage`. `aria-expanded` reflects state, synced from the attr on mount (`useEffect`) so the server/first-client render matches (no hydration mismatch); `aria-label` = `Collapse sidebar` / `Expand sidebar`.
- [ ] **AC 5 — Mobile unaffected.** At <768 the toggle is hidden and collapse has no visual effect (the sidebar stacks; the off-canvas drawer is 8.2). No horizontal scroll regression.
- [ ] **AC 6 — No regression.** All routes reachable (expanded + collapsed); active highlight unchanged; cockpit/trace/ledger/strategy content unchanged; `/dashboard` stays dynamic; read-only + `/api/bot/**` invariants green; CB-8.0 sidebar/nav behavior intact.
- [ ] **AC 7 — Tests.** Unit: a pure helper `parseCollapsed(raw)` (`"1"` → true; absent/`"0"`/other → false). Component: `DashboardSidebar` render still shows all six items (icon + label present) + the toggle button (aria-label). e2e (Codex): collapse → sidebar narrows + labels hidden + content wider; reload → still collapsed (no flash); expand → restored; nav works while collapsed; mobile (375) toggle hidden / no effect.
- [ ] **AC 8 — Gates.** typecheck / lint / test / build clean; `/dashboard` Dynamic; e2e via the test DB (external-mode recipe / #80).

## Standard Experience Checklist

UI story — load-bearing.
- [ ] **Navigation** — `covered by AC 2: nav stays navigable when collapsed (icon rail); active highlight unchanged.`
- [ ] **States** — `covered by AC 1/2b/5: expanded (default) · collapsed (persisted) · mobile (toggle hidden).`
- [ ] **Feedback** — `covered by AC 1/4: the toggle glyph (◀/▶) + the sidebar width change; aria-expanded.`
- [ ] **Accessibility** — `covered by AC 2/4: toggle aria-expanded + aria-label; collapsed icons keep the label as accessible name (visually-hidden, not removed); keyboard-operable.`
- [ ] **Edge cases** — `covered by AC 2b/4: no-flash pre-paint script; corrupt/absent localStorage → expanded default (parseCollapsed); mobile no-op.`
- [ ] **Cross-surface consistency** — `covered by AC 6: the collapsed state is global (the shared sidebar) → consistent across every dashboard route.`

## Tech notes

### Reuse
- `app/globals.css` `--sidebar-width` var (CB-8.0) — collapsed overrides it; same `.dashboard-sidebar` / `.dashboard-content` flex.
- `app/dashboard/dashboard-sidebar.tsx` (CB-8.0) — add the toggle + split nav items into icon/label; already `'use client'`.
- `app/layout.tsx` — add the inline no-flash `<script>` (the dark-mode pattern; alongside the CB-8.0 viewport export).
- The CB-8 architecture (`docs/bets/CB-8/architecture.md`) — the collapse-state + no-flash decision.

### Engineer DRI (confirm at build)
- The toggle is DOM/CSS/`localStorage`-driven (the `data-sidebar-collapsed` attr is the source of truth for the visual); React state only drives `aria-expanded` (synced in `useEffect` → no mismatch). The collapsed VISUAL works pre-hydration (script + CSS).
- `parseCollapsed` is the pure, testable seam; the interactive toggle + persistence + no-flash are e2e-verified (CB-3.3 #9).
- Visually-hidden label technique (`.sr-only`/clip) so collapsed icons keep an accessible name.

### What this story does NOT include
- Mobile off-canvas drawer + hamburger (CB-8.2). Per-page content-width pass (CB-8.3). Any route/content change beyond the three added nav icons.

## PRs
_Auto-populated._

## Tests
_Unit/component co-located; e2e by Codex in `e2e/dashboard/` (test DB; external-mode recipe / #80)._

## DRI Log

### Decisions
- [2026-06-20] [PM/Designer] **Collapsed = icon-only rail (navigable), not hidden** — keeps navigation while reclaiming space; requires icons on all six items (added ⚙️/🧭/📒). — area: ux — alternatives: collapse to width-0 / thin rail with no nav (rejected — loses navigation) — reversibility: easy.
- [2026-06-20] [Architect/Engineer] **localStorage + pre-paint `<html>` script + CSS `[data-sidebar-collapsed]`** (per the approved architecture) — no flash, no hydration mismatch; the toggle is DOM/storage-driven, React state only for `aria-expanded`. — area: client-state — reversibility: easy.
- [2026-06-20] [PM] **Collapse is a docked (≥768) affordance** — toggle hidden on mobile; the mobile drawer is 8.2. — area: scope — reversibility: easy.
- [2026-06-20] [Designer] **Labels visually hidden (not removed) when collapsed** — keeps the screen-reader accessible name on the icon rail. — area: a11y — reversibility: easy.
- [2026-06-20] [Engineer] **Built (confirms the above).** Extracted `sidebar-toggle.tsx` (the hooks — `useState`/`useEffect` for `aria-expanded`/`aria-label`; onClick flips `<html>` `data-sidebar-collapsed` + `localStorage`) so `DashboardSidebar` stays render-testable. Split NAV into `{icon,label}` (added ⚙️/🧭/📒); nav-icon `aria-hidden`, nav-label kept (visually-hidden when collapsed via `globals.css` clip, ≥768-scoped). `app/layout.tsx`: pre-paint `<script>` sets the attr (no `react/no-danger` rule in eslint → no disable needed). `globals.css`: `[data-sidebar-collapsed]` → 56px rail + hide title/device + clip labels (min-width:768); toggle hidden <768. Tests: `parseCollapsed` + sidebar render (6 icons+labels). Gates: typecheck/lint clean; 918 tests; build green; `data-sidebar-collapsed` confirmed in an emitted CSS asset; `/dashboard` ƒ; read-only invariant green. — area: ui/client-state — reversibility: easy.

### Risks
- [2026-06-20] [Engineer] **Hydration mismatch / flash** if collapse is React-state-driven — likelihood: medium — impact: medium — mitigation: pre-paint script + CSS attr drive the visual; `aria-expanded` synced in `useEffect` (server/first-render match) — area: correctness.
- [2026-06-20] [Engineer] **Emoji icons render inconsistently across platforms** — likelihood: low — impact: low — mitigation: emoji are reinforcement; the accessible name carries meaning; a later design-system bet could swap to an icon set — area: ux.
- [2026-06-20] [Engineer] **Collapsed-state a11y** — icon-only could lose labels for SR users — likelihood: medium — impact: medium — mitigation: visually-hidden label kept (AC 2) — area: a11y.

### Issues
_None at story creation._

---
_Story closed: <pending>, brief: docs/bets/CB-8/brief.md. **SECOND CB-8 STORY — desktop collapse/expand (the "minimize the left bar" ask). Next: 8.2 mobile drawer · 8.3 per-page width pass.**_

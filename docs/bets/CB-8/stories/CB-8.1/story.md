---
id: CB-8.1
bet: CB-8
type: story
status: shipped
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

The operator's "minimize the left bar to show more space": a **collapse/expand toggle** on the docked sidebar (≥768) that narrows it to an **icon-only rail** and reclaims content width, **persisted** in a **cookie** the server reads to render the shell state (no flash, no hydration mismatch) — per the approved architecture (cookie revision, 2026-06-20). Layout/chrome only.

## Acceptance Criteria

- [ ] **AC 1 — Toggle.** A collapse/expand `<button>` at the top of the sidebar (docked ≥768 only; hidden <768). Clicking collapses the sidebar to an icon rail (`--sidebar-width` → ~56px) and reclaims content width; clicking again expands. Glyph CSS-driven (`◀`/`▶`). Copy verbatim ([copy.md](copy.md)).
- [ ] **AC 2 — Icon rail (navigable collapsed).** Each nav item is split into `{ icon, label }`; all six have an icon (⚙️ Strategy · 🧭 Decision trace · 📒 Ledger added). Collapsed → labels **visually hidden** (NOT removed — kept as the link's accessible name); icons shown so the nav still works. The device line hides; the toggle stays.
- [ ] **AC 2b — Persistence + no flash (cookie, server-rendered).** State persists in a **cookie** (`sidebar-collapsed`; `1`=collapsed). The dashboard layout (a Server Component — already dynamic) reads the cookie and renders `data-sidebar-collapsed` on `.dashboard-shell` → the server markup matches the persisted state → **no expand→collapse flash and GENUINELY no hydration mismatch** (not merely a suppressed warning; the server output is correct). No pre-paint `<html>` script and no `suppressHydrationWarning` needed.
- [ ] **AC 3 — CSS-driven visual.** `app/globals.css`: `.dashboard-shell[data-sidebar-collapsed] { --sidebar-width: 56px; }` (cascades to `.dashboard-sidebar`) + hide `.nav-label` + device line + the expand/collapse glyph. Stays scoped to the shell (EA: no CSS sprawl).
- [ ] **AC 4 — Toggle = cookie + DOM, a11y-correct.** onClick writes the `sidebar-collapsed` cookie + flips the `data-sidebar-collapsed` attr on `.dashboard-shell` (instant feedback; survives soft navigation as the layout stays mounted). `aria-expanded` reflects state, **seeded from the server's cookie value** (`initialCollapsed` prop) so server + first-client render agree (no hydration mismatch); `aria-label` = `Collapse sidebar` / `Expand sidebar`.
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
- `app/dashboard/dashboard-sidebar.tsx` (CB-8.0) — add the toggle + split nav items into icon/label; already `'use client'`; forwards the server `collapsed` value to the toggle.
- `app/dashboard/layout.tsx` (CB-8.0) — already a dynamic Server Component (reads the session header); also reads the `sidebar-collapsed` cookie → renders `data-sidebar-collapsed` on `.dashboard-shell`.
- The CB-8 architecture (`docs/bets/CB-8/architecture.md`) — the collapse-state decision (cookie revision, 2026-06-20).

### Engineer DRI (confirm at build)
- The collapse state is a **cookie**; the server renders `data-sidebar-collapsed` on `.dashboard-shell` to match → the collapsed visual is correct on first paint (no flash, no hydration mismatch — server output is right, not suppressed). The toggle writes the cookie + flips the shell attribute client-side; React state only drives `aria-expanded`/`aria-label`, seeded from the server value (`initialCollapsed`).
- `parseCollapsed` (in `sidebar-state.ts`, a non-`"use client"` module shared by server + client) is the pure, testable seam; the interactive toggle + cookie persistence are e2e-verified (CB-3.3 #9).
- Visually-hidden label technique (`.sr-only`/clip) so collapsed icons keep an accessible name.

### What this story does NOT include
- Mobile off-canvas drawer + hamburger (CB-8.2). Per-page content-width pass (CB-8.3). Any route/content change beyond the three added nav icons.

## PRs
- #107 — desktop sidebar collapse/expand (cookie-based, server-rendered shell state). Merged 2026-06-20. Codex clean (after the localStorage→cookie BLOCKER resolution).

## Tests
_Unit/component co-located; e2e by Codex in `e2e/dashboard/` (test DB; external-mode recipe / #80)._

## DRI Log

### Decisions
- [2026-06-20] [PM/Designer] **Collapsed = icon-only rail (navigable), not hidden** — keeps navigation while reclaiming space; requires icons on all six items (added ⚙️/🧭/📒). — area: ux — alternatives: collapse to width-0 / thin rail with no nav (rejected — loses navigation) — reversibility: easy.
- [2026-06-20] [Architect/Engineer] ~~**localStorage + pre-paint `<html>` script + CSS `[data-sidebar-collapsed]`**~~ — **SUPERSEDED 2026-06-20** by the cookie decision below (Codex BLOCKER ×2).
- [2026-06-20] [Engineer] ~~**`suppressHydrationWarning` on `<html>` (BLOCKER closure).**~~ — **SUPERSEDED 2026-06-20.** suppressHydrationWarning only *hides* the warning; the underlying server/client diff still exists (localStorage is client-only). Codex re-blocked: "merely mutating `<html>` before hydration does not satisfy the no-mismatch contract." Replaced by the cookie approach below, which eliminates the diff at the source.
- [2026-06-20] [Architect/Engineer] **Collapse persisted in a COOKIE; server-rendered `data-sidebar-collapsed` on `.dashboard-shell` (BLOCKER resolution, operator-approved).** The dashboard layout (already a dynamic Server Component) reads the `sidebar-collapsed` cookie and renders the attribute → the server markup matches the persisted state → GENUINELY no flash and no hydration mismatch (not a suppressed warning — the SSR output is correct). No `<html>` mutation, no pre-paint script, no `suppressHydrationWarning`; the root layout is plain again. The toggle writes the cookie + flips the `.dashboard-shell` attribute client-side for instant feedback; `aria-expanded` is seeded from the server value (`initialCollapsed`). `parseCollapsed` + the cookie name moved to `app/dashboard/sidebar-state.ts` (a non-`"use client"` module) so the server layout can import the parser. Directly satisfies Codex's primary suggested fix ("switch persistence to a server-readable source"). — area: client-state — reversibility: easy.
- [2026-06-20] [PM] **Collapse is a docked (≥768) affordance** — toggle hidden on mobile; the mobile drawer is 8.2. — area: scope — reversibility: easy.
- [2026-06-20] [Designer] **Labels visually hidden (not removed) when collapsed** — keeps the screen-reader accessible name on the icon rail. — area: a11y — reversibility: easy.
- [2026-06-20] [Engineer] **Built (cookie revision — confirms the above).** `sidebar-toggle.tsx`: `useState(initialCollapsed)` (seeded from the server cookie value via prop) drives `aria-expanded`/`aria-label`; onClick writes the `sidebar-collapsed` cookie + flips `data-sidebar-collapsed` on `.dashboard-shell` — render-testable (no `useEffect`/DOM read on mount). `sidebar-state.ts` (NEW, non-`"use client"`): `COLLAPSE_COOKIE` + pure `parseCollapsed`. `app/dashboard/layout.tsx`: reads the cookie → `data-sidebar-collapsed` on `.dashboard-shell` + passes `collapsed` to the sidebar. `app/layout.tsx`: reverted to plain `<html lang="en">` (no script, no `suppressHydrationWarning`). Split NAV into `{icon,label}` (⚙️/🧭/📒); nav-icon `aria-hidden`, nav-label visually-hidden when collapsed (`globals.css` clip, ≥768-scoped). `globals.css`: `.dashboard-shell[data-sidebar-collapsed]` → 56px rail + hide title/device + clip labels (min-width:768); toggle hidden <768. Tests: `parseCollapsed` + sidebar render (6 icons+labels). Gates: typecheck/lint clean; **918 tests**; build green; `.dashboard-shell[data-sidebar-collapsed]` confirmed in an emitted CSS asset; `/dashboard` ƒ; read-only invariant green. — area: ui/client-state — reversibility: easy.

### Risks
- [2026-06-20] [Engineer] **Hydration mismatch / flash** — RESOLVED by construction: the cookie is server-readable, so the server renders `data-sidebar-collapsed` on `.dashboard-shell` to match + seeds `aria-expanded` from the same value → server and first-client render agree. (The earlier localStorage+`<html>`-script approach could not satisfy this — Codex BLOCKER ×2; see Decisions.) — area: correctness.
- [2026-06-20] [Engineer] **Emoji icons render inconsistently across platforms** — likelihood: low — impact: low — mitigation: emoji are reinforcement; the accessible name carries meaning; a later design-system bet could swap to an icon set — area: ux.
- [2026-06-20] [Engineer] **Collapsed-state a11y** — icon-only could lose labels for SR users — likelihood: medium — impact: medium — mitigation: visually-hidden label kept (AC 2) — area: a11y.

### Issues
_None at story creation._

---
_Story closed: 2026-06-20 (PR #107, shipped), brief: docs/bets/CB-8/brief.md. **SECOND CB-8 STORY — desktop collapse/expand (the "minimize the left bar" ask), shipped. Next: 8.2 mobile drawer · 8.3 per-page width pass.**_

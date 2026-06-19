---
id: CB-8.0
bet: CB-8
type: story
status: ready
priority: P2
created: 2026-06-19
author: PM
design_link: docs/bets/CB-8/stories/CB-8.0/design.md
copy_link: docs/bets/CB-8/stories/CB-8.0/copy.md
area_tags: [frontend, dashboard, layout, responsive, css]
dependencies:
  - CB-8 architecture approved (global CSS + @media + viewport; [sidebar | content] flex)
  - CB-6.0 dashboard shell + dashboard-tabs (superseded here) — reused/replaced
e2e: true
---

# CB-8.0 — Responsive shell + left-sidebar nav (FIRST CB-8 STORY)

## Description

Establishes the CB-8 foundation: the project's **first global stylesheet** (`app/globals.css` + `@media`), a **viewport meta**, and the dashboard shell restructured into a **`[sidebar | content]`** flex layout — with a **functional left-sidebar nav** (6 items + active highlight + footer) replacing the CB-6.0 top 3-tab strip. Mobile-safe (stacks, no horizontal scroll). Desktop collapse (8.1), off-canvas drawer (8.2), and the per-page width pass (8.3) are deferred. **Layout/chrome only — no cockpit-content or trading change.**

## Acceptance Criteria

- [ ] **AC 1 — Styling layer.** `app/globals.css` (NEW), imported in `app/layout.tsx`: box-sizing reset; `.dashboard-shell` flex (**row ≥768 / column <768** via `@media (max-width: 767px)`); sidebar / nav / footer / content classes; a CSS custom property for the sidebar width (so 8.1's collapse reuses it). Per the approved architecture (native Next CSS; no new dependency).
- [ ] **AC 2 — Viewport meta.** `export const viewport: Viewport = { width: "device-width", initialScale: 1 }` in `app/layout.tsx` (absent today → mobile renders at desktop width).
- [ ] **AC 3 — Shell.** `app/dashboard/layout.tsx` → `<div class="dashboard-shell"> <DashboardSidebar deviceLabel={…} /> <main class="dashboard-content">{children}</main> </div>`. Server Component; fetches the operator's `device_label` (reuse the cockpit's `x-session-user-id` header → DB read) and passes it to the sidebar footer.
- [ ] **AC 4 — Sidebar.** `app/dashboard/dashboard-sidebar.tsx` (NEW; replaces `dashboard-tabs.tsx`) — Client Component: header app title; nav of **six** items (🤖 Crypto · 📈 Equity · 📊 Mutual Funds · Strategy · Decision trace · Ledger) with active-route highlight; footer (device label + `SignOutClient`). Copy + labels verbatim ([copy.md](copy.md)).
- [ ] **AC 5 — Active route (pure).** `activeNavKey(pathname)` → `crypto | equity | mutual-funds | strategy | trace | ledger` (extends `activeTab`: distinguishes `/dashboard/strategy|trace|ledger`, previously folded into `crypto`; `/dashboard` → `crypto`). Exported + unit-tested. Active item: `aria-current="page"` + weight/background, **not color alone**.
- [ ] **AC 6 — Single sign-out.** `SignOutClient` lives ONCE in the sidebar footer (global, in the layout). Remove the per-page top-right `SignOutClient` instances (cockpit / trace / ledger) so there's no duplicate. Sign-out behavior unchanged.
- [ ] **AC 7 — Mobile-safe.** At <768px the shell stacks (sidebar block on top, content below); **no horizontal scroll** at ~375px. (The off-canvas drawer is 8.2.)
- [ ] **AC 8 — No regression.** Every route reachable from the sidebar (cockpit `/dashboard`, equity, mutual-funds, strategy, trace, ledger); cockpit/trace/ledger/strategy/equity/MF **content unchanged**; `/dashboard` stays dynamic (`ƒ`); the dashboard read-only invariant + `/api/bot/**` no-orders invariant stay green; `dashboard-tabs.tsx` removed/superseded (no orphan import).
- [ ] **AC 9 — Pages unchanged (interim).** Pages keep their current `maxWidth` (centered within the content area) — the per-page width pass is **8.3**. No page-content edits in this story beyond removing the relocated sign-out chrome.
- [ ] **AC 10 — Tests.** Unit `activeNavKey` (each route → correct key; `/dashboard` → crypto). Component `DashboardSidebar` render (6 items + correct hrefs; active highlight on a given pathname; footer device label + Sign out) via the JSON.stringify pure-render pattern (mock `next/navigation`, per CB-6.5/6.6). e2e (Codex): the sidebar renders, each nav link routes, active highlight follows the route, mobile (viewport 375) has no horizontal scroll, footer Sign out present.
- [ ] **AC 11 — Gates.** typecheck / lint / test / build clean; `/dashboard` Dynamic; e2e via the test DB.

## Standard Experience Checklist

UI story — load-bearing.
- [ ] **Navigation** — `covered by AC 4/5: the left sidebar IS the nav (6 items + active highlight); replaces the top tabs.`
- [ ] **States** — `covered by AC 5/7: active route; desktop docked; mobile stacked.`
- [ ] **Feedback** — `covered by AC 5: active item via aria-current + weight/background (not color-only).`
- [ ] **Accessibility** — `covered by AC 2/5: viewport meta (mobile scale); nav aria-label="Primary"; aria-current; keyboard links + the existing Sign out button.`
- [ ] **Edge cases** — `covered by AC 3/7: no device_label → "this device" (existing fallback); long nav wraps on mobile with no horizontal scroll.`
- [ ] **Cross-surface consistency** — `covered by AC 8: the sidebar wraps every dashboard route uniformly (it's in the shared layout).`

## Tech notes

### Reuse
- `app/dashboard/dashboard-tabs.tsx` — `activeTab` (→ extend to `activeNavKey`), `usePathname`, `Link`, the active-styling pattern. The file is superseded by `dashboard-sidebar.tsx`.
- `app/dashboard/sign-out-client.tsx` — relocate into the sidebar footer (unchanged component).
- `app/dashboard/page.tsx` — the `device_label` read (`headers()` → `x-session-user-id` → `auth_credentials` SELECT, with the `this device` fallback): lift the same read into `app/dashboard/layout.tsx`.
- The approved architecture (`docs/bets/CB-8/architecture.md`) — globals.css responsibilities, the 768 breakpoint, the flex shell.

### Engineer DRI (confirm at build)
- `globals.css` stays scoped to the shell + breakpoints (EA watch-item: no CSS sprawl). Component visuals remain inline.
- The sidebar is a Client Component (usePathname + future toggles); the device label comes from the server layout as a prop (no client DB read).
- Removing the per-page `SignOutClient`: cockpit (`page.tsx` chrome), trace, ledger each render it today — remove those; the layout footer is now the single instance.

### What this story does NOT include
- Desktop collapse/expand + persistence (CB-8.1). Mobile off-canvas drawer + hamburger (CB-8.2). Per-page content-width pass / relaxing the 960/640 `maxWidth` (CB-8.3). Any cockpit-content or trading change.

## PRs
_Auto-populated._

## Tests
_Unit/component co-located; e2e by Codex in `e2e/dashboard/` (test DB; the CB-6 external-mode recipe in `e2e/README.md` runs it)._

## DRI Log

### Decisions
- [2026-06-19] [PM] **Adaptive re-forecast — fold the sidebar nav into 8.0.** The architecture forecast had 8.0=shell / 8.1=nav, but a shell without nav isn't independently shippable (the app would lose navigation). 8.0 = shell + functional nav + footer (a coherent, navigable slice). Re-forecast: **8.1** desktop collapse + persistence; **8.2** mobile off-canvas drawer; **8.3** per-page width pass. — area: planning — reversibility: easy.
- [2026-06-19] [Engineer] **`activeNavKey` extends `activeTab` to six keys** (distinguish strategy/trace/ledger, previously folded into `crypto`) — needed now that they're first-class nav items. — area: ui — reversibility: easy.
- [2026-06-19] [Engineer] **Single global sign-out in the sidebar footer**; remove the per-page top-right instances (cockpit/trace/ledger). The layout footer covers every route. — area: chrome — reversibility: easy.
- [2026-06-19] [PM] **Pages keep their `maxWidth` (interim)** — centered in the content area; the per-page width pass is 8.3 (avoid bloating 8.0). — area: scope — reversibility: easy.

### Risks
- [2026-06-19] [Engineer] **The shell change touches ALL dashboard routes at once** (it's the shared layout) — likelihood: high — impact: medium — mitigation: pages stay content-agnostic; e2e exercises every route; instant git revert (UI-only, no migration) — area: regression.
- [2026-06-19] [Engineer] **A route left without sign-out** if a per-page instance is removed but the footer misses it — likelihood: low — impact: low — mitigation: the footer is in the shared layout → every dashboard route inherits it — area: chrome.
- [2026-06-19] [Engineer] **Mobile stacked nav pushes content down** (interim, pre-drawer) — likelihood: medium — impact: low — mitigation: 8.2 drawer; the 8.0 bar is "no horizontal scroll" — area: ux.
- [2026-06-19] [Enterprise Architect] **First CSS file → sprawl** — likelihood: low — impact: medium — mitigation: keep `globals.css` shell-scoped; component visuals inline — area: maintainability.

### Issues
_None at story creation._

---
_Story closed: <pending>, brief: docs/bets/CB-8/brief.md. **FIRST CB-8 STORY — responsive shell + left-sidebar nav; the styling-layer foundation.**_

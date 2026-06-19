---
id: CB-8
type: bet-architecture
status: proposed
created: 2026-06-19
author: Architect
enterprise_architect: engaged
brief: docs/bets/CB-8/brief.md
---

# CB-8 — Architecture: Responsive left-sidebar dashboard navigation

## Decision

Restructure the dashboard shell (`app/dashboard/layout.tsx`) into a **flex `[sidebar | content]`** layout, and introduce the project's **first global stylesheet** — `app/globals.css`, imported in `app/layout.tsx` — to carry **`@media` breakpoints** + the sidebar/collapse/drawer classes. Add a **viewport meta** (`export const viewport` in `app/layout.tsx`). Two layout modes by one breakpoint (`768px`): **mobile (<768) → off-canvas drawer + hamburger**; **docked (≥768) → fixed sidebar with a user collapse/expand toggle** (icon-only rail when collapsed). Collapse state persists in `localStorage`, applied **before paint** via a tiny blocking script on `<html>` (the no-flash, no-hydration-mismatch pattern). Component-internal styling stays inline `React.CSSProperties`; only the **responsive shell** uses CSS.

## Context

- The app is **100% inline `React.CSSProperties`** — no global CSS, no Tailwind, no CSS modules, **no `@media`, no viewport meta** (`app/layout.tsx` exports metadata only). Inline styles **cannot** express media queries → responsive is impossible without a CSS layer.
- Current shell: `app/dashboard/layout.tsx` renders `<DashboardTabs/>` (top strip) above `{children}`; each page sets its own fixed `maxWidth` (960/640) + `margin: 0 auto` as if full-width. Routes: `/dashboard` (cockpit), `equity`, `mutual-funds`, `strategy`, `trace`, `ledger`. Active tab via `usePathname` (`dashboard-tabs.tsx:activeTab`).
- Chrome today: no app title in-dashboard; `SignOutClient` sits per-page top-right; the cockpit fetches `device_label` from the DB via the proxy's `x-session-user-id` header. No email is stored.
- **Foundational-stack deviation gate (step 7): NO deviation.** The foundation Stack table has no styling row; the frontend is "Next.js 16 App Router." A global CSS file + `@media` is **native Next.js** (no new tool/framework/dependency) → within the foundational stack; no `/setup-foundation-architecture` amend required. (Tailwind / CSS-in-JS *would* have been a deviation — explicitly rejected below.)

## Approach (files / modules / data flow)

- **`app/layout.tsx`** — add `import "./globals.css";` + `export const viewport: Viewport = { width: "device-width", initialScale: 1 }` + the no-flash inline script (`<script>` reading `localStorage` → sets `data-sidebar-collapsed` on `<html>`).
- **`app/globals.css`** (NEW) — the styling layer: CSS custom properties (sidebar width expanded/collapsed), the `@media (max-width: 767px)` drawer rules, the `[data-sidebar-collapsed]` rail rules, and the content-area container (`max-width` + auto-margins + padding). Box-sizing + a minimal reset.
- **`app/dashboard/layout.tsx`** — becomes `<div class="dashboard-shell"> <DashboardSidebar/> <main class="dashboard-content">{children}</main> </div>`. Server Component; fetches the `device_label` (same `x-session-user-id` → DB read the cockpit uses) and passes it to the sidebar footer.
- **`app/dashboard/dashboard-sidebar.tsx`** (NEW; replaces `dashboard-tabs.tsx`) — Client Component: app title (header), nav list (Crypto · Equity · Mutual Funds · Strategy · Decision trace · Ledger) with active-route highlight (reuse the `usePathname` logic), the collapse toggle (≥768) + the mobile hamburger/drawer toggle, and the footer (device label + `SignOutClient`). Pure helpers (`activeNavKey(pathname)`, `parseCollapsed(raw)`) extracted for unit tests.
- **Per-route pages** — drop fixed `maxWidth`/`margin:auto`; the `.dashboard-content` container owns width + centering. A per-page pass (CB-8.4) relaxes the 960/640 assumptions. Cockpit content components are untouched.

## Data model changes
**None.** No schema, no migration. `device_label` already exists; no email storage (out of scope).

## API / contract changes
**None.** No new routes; proxy/auth gating unchanged. The dashboard read-only invariant + `/api/bot/**` no-orders invariant are untouched (this is shell/chrome).

## Dependencies
**None.** Global CSS + `@media` + the viewport export are native Next.js 16. No npm additions.

## Enterprise Architect section
- **Cross-system implications:** none — self-contained dashboard UI; no backend, DB, Coinbase, or auth surface touched.
- **Standards / stack compliance:** within the foundational Next.js stack (native CSS). **This establishes the project's styling convention** — global CSS for responsive/layout shell, inline styles for component internals. Future UI bets inherit this; it is NOT a new Stack-table row (styling was never one). No foundational amend.
- **Drift flags:** none that block. Watch-item: do not let this grow into an ad-hoc CSS sprawl — keep `globals.css` scoped to the shell + breakpoints; component visuals stay inline until a deliberate design-system bet. (Logged as a Risk.)

## Alternatives considered
- **CSS Modules per component** — scoped, idiomatic, but heavier file churn for a shell-level concern + still needs a global breakpoint strategy. Rejected: global CSS is simpler for a single shared shell; revisit if/when a component library emerges.
- **JS-driven responsive (`matchMedia` / `useWindowSize`)** — Rejected: no SSR of viewport-dependent layout → hydration mismatch + flash; CSS `@media` is server-rendered and free.
- **Tailwind / CSS-in-JS (emotion, styled-components)** — Rejected: a new framework = a foundational-stack deviation (would require `/setup-foundation-architecture` amend) + overkill for n=1; native CSS suffices.
- **Keep top tabs, just add a viewport meta** — Rejected: doesn't deliver the left-nav/collapsible ask or scale the nav set.

## Consequences
- **Positive:** responsive on all four breakpoints; scalable left-nav; first reusable styling layer; no new deps; reversible (medium — can revert to inline + top-tabs).
- **Negative:** introduces a styling convention to maintain; a per-page content-width pass is required; a small no-flash script in the root layout.
- **Reversibility:** medium (revert the shell + remove globals.css; pages keep working with their own widths).

## Test strategy
- **Unit:** pure helpers — `activeNavKey(pathname)`, `parseCollapsed(localStorage value)`.
- **Component:** `DashboardSidebar` render (nav items + active highlight; collapsed vs expanded variants; footer device label + Sign out) via the JSON.stringify/pure-view pattern (mock `next/navigation`, per CB-6.5/6.6 precedent).
- **e2e (Codex):** Playwright `viewport` at ~375 / 768 / 1280 / 1920 — no horizontal scroll; mobile drawer opens/closes; desktop collapse toggles + **persists across navigation** (reload); every route reachable from the sidebar; cockpit content intact.
- **Invariants:** the dashboard read-only + `/api/bot/**` tests stay green (unaffected); `/dashboard` stays `ƒ` dynamic; `pnpm typecheck && lint && test && build` clean.

## Rollout
- **No feature flag, no migration.** Staged via the CB-8.0–8.4 stories. CB-8.0 scaffolds the styling layer + shell (touches all routes at once via the layout) — mitigate by keeping pages width-agnostic + the CB-8.4 per-page pass. UI-only; ship per story; instant revert via git if a breakpoint regresses.

## DRI Log

### Decisions
- [2026-06-19] [Architect] **Global `app/globals.css` + `@media` + viewport meta** as the responsive layer (not CSS modules / not JS matchMedia / not Tailwind). Native Next, server-rendered, no hydration risk, no new dependency. — area: styling-architecture — reversibility: medium.
- [2026-06-19] [Architect] **One breakpoint (768px), two modes** — mobile drawer (<768) + docked sidebar with a user collapse toggle (≥768). Covers mobile/iPad/laptop/desktop with minimal complexity; collapse is a user affordance, not breakpoint-driven. — area: ux/layout — reversibility: easy.
- [2026-06-19] [Architect] **Collapse persisted in `localStorage`, applied pre-paint via a blocking `<html>` script** (the dark-mode no-flash pattern) → no SSR flash, no hydration mismatch. — area: client-state — reversibility: easy.
- [2026-06-19] [Architect] **New `dashboard-sidebar.tsx` replaces `dashboard-tabs.tsx`**; the dashboard `layout.tsx` (server) fetches `device_label` + passes it to the sidebar footer (reuses the cockpit's `x-session-user-id`→DB read). — area: components — reversibility: easy.
- [2026-06-19] [Enterprise Architect] **No foundational-stack amend** — native CSS is within the Next stack; this sets the styling convention (global CSS for shell/responsive, inline for component internals) without a new Stack-table row. — area: standards — reversibility: medium.

### Risks
- [2026-06-19] [Enterprise Architect] **CSS sprawl** — the first stylesheet could grow ad-hoc — likelihood: medium — impact: medium — mitigation: keep `globals.css` scoped to shell + breakpoints; component visuals stay inline pending a deliberate design-system bet — area: maintainability.
- [2026-06-19] [Architect] **Per-page `maxWidth` (960/640) assumptions** break under the content container — likelihood: high — impact: medium — mitigation: the `.dashboard-content` container owns width; CB-8.4 per-page pass — area: ui.
- [2026-06-19] [Architect] **Shell change touches all routes at once** (8.0) — likelihood: high — impact: medium — mitigation: pages are width-agnostic; e2e covers every route at every breakpoint; instant git revert — area: regression.
- [2026-06-19] [Architect] **No-flash script correctness** (inline script reading localStorage) — likelihood: low — impact: low — mitigation: standard pattern; component test on `parseCollapsed`; e2e asserts no flash via the persisted state — area: client-state.

### Issues
_None at architecture drafting._

---
_Architecture status: `proposed` → awaiting operator HITL approval. On approval: set brief `architecture_status: approved`, then `/create-story CB-8` (8.0 styling layer + shell → 8.1 sidebar nav → 8.2 collapse+persist → 8.3 mobile drawer → 8.4 per-page width pass)._

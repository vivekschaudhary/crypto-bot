---
id: CB-8
type: feature
status: shipped
priority: P2
parent: FOUNDATION-PRODUCT
portfolio_stub: false
depends_on: [CB-6]
parallel_with: []
architecture_required: true
architecture_status: approved
created: 2026-06-19
author: PM
sources:
  - Operator request 2026-06-19 (free text + layout mockup)
  - "Layout reference: 'Wealth at Your Fingertips' mockup (a SEPARATE personal-finance app — used only as the left-sidebar LAYOUT pattern; crypto-app keeps its own nav items, confirmed with the operator)"
key_metric:
  name: Operator console usable on all four breakpoints — every dashboard route reachable + the cockpit readable without horizontal scroll/zoom on mobile / iPad / laptop / desktop, with a desktop sidebar collapse that persists across navigation
  baseline: "Desktop-only — fixed top 3-tab strip, fixed maxWidth, NO viewport meta (renders at desktop width on mobile → horizontal scroll); no collapse"
  target: "100% of routes usable at ~375 / 768 / 1280 / 1920px; mobile drawer; desktop collapse/expand persisted"
  source: operator self-report + the rendered layout at each breakpoint (locally verifiable; no external dependency)
---

# CB-8 — Responsive left-sidebar dashboard navigation

**Layout/chrome only — NO change to cockpit content (Bot Status, P&L, Signals, Trade Log, overrides) or any read/trade logic.** The mockup is from a separate personal-finance app ("Wealth at Your Fingertips"); it is the LAYOUT reference only — crypto-app keeps its own nav items (confirmed with the operator).

## Problem

The dashboard nav is a fixed top 3-tab strip (`app/dashboard/layout.tsx` + `dashboard-tabs.tsx`), desktop-only: fixed `maxWidth`, and `app/layout.tsx` has **no viewport meta**, so on a phone it renders at desktop width with horizontal scroll. As the surface grows (cockpit + Equity + Mutual Funds + Strategy + Trace + Ledger), a top strip doesn't scale, and the app is unusable on mobile/tablet.

## User

The single operator, using the cockpit as a daily driver across phone, iPad, laptop, and desktop.

## Why this matters

The cockpit is the operator's primary surface (the CB-6 outcome). A responsive left-nav with a collapsible bar improves the daily-driver experience on every device and creates room for the growing nav set.

**Moat impact (one line):** Marginal — usability/polish of the operator's daily surface; no new differentiator.

## Hypothesis (the bet)

Replacing the top-tab shell with a responsive left-sidebar nav (collapsible on desktop, drawer on mobile) makes the operator console usable on all four breakpoints and scales the navigation — without touching any cockpit content or trading logic.

## Primary metric

See `key_metric` (frontmatter): every route reachable + cockpit readable at all four breakpoints; desktop collapse persists. Baseline: desktop-only / no mobile. Window: 30 days. Check-in: weekly.

## Guardrail metrics (must not degrade)

- No change to cockpit content/behavior or any read/trade path.
- Every existing route stays reachable (cockpit `/dashboard`, equity, mutual-funds, strategy, trace, ledger) + auth-gated (proxy unchanged).
- `/dashboard` stays dynamic (`ƒ`); the dashboard read-only invariant + the `/api/bot/**` no-orders invariant stay green.
- No regression to the shipped CB-6 cards.

## Scope

### In scope

- **Left-sidebar nav** replacing the top 3-tab strip — crypto-app's own items: **🤖 Crypto** (cockpit `/dashboard`) · **📈 Equity** · **📊 Mutual Funds** · **Strategy** · **Decision trace** · **Ledger** (the last three currently reachable only via in-page links).
- **Responsive behavior:** laptop/desktop → sidebar visible; **desktop → collapse/expand toggle** (persisted, e.g. `localStorage`) to reclaim width; tablet → visible or collapsible; mobile → off-canvas drawer + hamburger.
- **The project's first styling layer:** a global stylesheet with `@media` breakpoints (recommended) + a **viewport meta** (`export const viewport` in `app/layout.tsx`) — both absent today. Inline styles remain for component internals; the responsive shell uses CSS.
- **Chrome relocation** into the sidebar: an app title/header (top); **identity + Sign out** (bottom) — moving `SignOutClient` from the per-page top-right into the sidebar footer. Identity shows the existing **device label** (the app stores `device_label`, NOT email — the mockup's email is finance-app content).
- Active-route highlight (reuse the `usePathname` pattern from `dashboard-tabs.tsx`).

### Out of scope

- Any cockpit **content** change (cards, data, trading logic) — purely shell/chrome.
- The mockup's finance features (Budget & Spending, Goals, Debt payoff, Net worth, Subscriptions, Transactions, Accounts) — the other app.
- Storing/displaying user **email** (use device label; revisit only if asked).
- A component-library / design-system refactor (shared `<Card>`/`<Button>` primitives) — possible follow-up, not required.
- Equity / Mutual-Funds functionality (CB-7 / later).

## Architecture (why `architecture_required: true`)

`/create-bet-architecture CB-8` must decide the **styling approach** — the load-bearing call in a codebase that is 100% inline `React.CSSProperties` with no CSS layer:

- (a) a global `app/globals.css` with `@media` + classNames — **recommended** (lowest-disruption, server-rendered, no hydration risk);
- (b) CSS modules per component;
- (c) JS `matchMedia` / `useWindowSize` (hydration-mismatch risk).

Plus: the breakpoint set (mobile/tablet/laptop/desktop), the collapse-state mechanism + persistence (avoid SSR flash), and how the shell flexes the content area (pages currently each set their own `maxWidth` 960/640 as if full-width).

## Open questions for Researcher / Architect

- Confirm the styling approach (global CSS recommended) + the breakpoint values.
- Collapse-state persistence (localStorage) without an SSR layout flash.
- Whether trace/ledger become top-level sidebar items (changes `dashboard-tabs.tsx:activeTab()` logic).
- Per-page `maxWidth` (960/640) pass under a sidebar — which pages need width adjustment.

## Stories (actual — adaptive; the forecast renumbered as slices merged)

- **CB-8.0** ✅ SHIPPED (PR #105) — styling layer (global CSS + breakpoints) + viewport meta + shell scaffold (flex `[sidebar | content]`) **+ sidebar nav + active-route highlight** (folded the forecast's 8.1 in).
- **CB-8.1** ✅ SHIPPED (PR #107) — desktop collapse/expand + persistence (cookie, server-rendered shell state after a Codex hydration BLOCKER → architecture corrected localStorage→cookie).
- **CB-8.2** ✅ SHIPPED (PR #108) — mobile off-canvas drawer + hamburger.
- **CB-8.3** ✅ SHIPPED (PR #109) — per-page content-width pass (shell owns padding; pages keep 960/640 widths).

**CB-8 BET COMPLETE 2026-06-21 — all 4 stories shipped.** Responsive left-sidebar dashboard nav across mobile/iPad/laptop/desktop, with desktop collapse + mobile drawer. Next: `/scan CB-8` (Build → Production-Ready).

## DRI Log

### Decisions

- [2026-06-19] [Operator/PM] **Target = crypto-app, layout pattern only.** The attached mockup is a separate finance app; crypto-app adopts its left-sidebar LAYOUT with crypto-app's own nav items — not its content. — area: scope — reversibility: easy.
- [2026-06-19] [PM] **`architecture_required: true`.** Responsive needs the project's first CSS layer (@media) + viewport meta — a cross-cutting styling-convention decision, deferred to `/create-bet-architecture CB-8`. — area: architecture — reversibility: medium.
- [2026-06-19] [PM] **Identity = device label, not email.** The app does not store user email; the sidebar footer reuses the existing `device_label`. — area: scope — alternatives: add email storage (rejected for now) — reversibility: easy.
- [2026-06-19] [PM] **CB-8 (not CB-7).** CB-7 stays reserved for equity/Zerodha. — area: planning — reversibility: easy.

### Risks

- [2026-06-19] [PM] **New styling convention** in a pure-inline-styles codebase — sets precedent — likelihood: low (with arch review) — impact: high — mitigation: the architecture phase pins the approach (global CSS recommended) — area: architecture.
- [2026-06-19] [Engineer] **Per-page `maxWidth` (960/640) breaks under a sidebar** — likelihood: high — impact: medium — mitigation: a dedicated per-page width pass (CB-8.4) — area: ui.
- [2026-06-19] [Engineer] **Hydration mismatch** if responsive is JS-driven — likelihood: medium — impact: medium — mitigation: prefer CSS `@media` (server-rendered) — area: correctness.
- [2026-06-19] [Engineer] **Collapse-state SSR flash** (client-only persistence) — likelihood: medium — impact: low — mitigation: a no-flash default; resolve in CB-8.2 — area: ui.

### Issues

- [2026-06-21] [Scanner] **Production-Ready scan — 6 open findings (4 Critical / 2 High).** First `/scan CB-8` at the Build→Production-Ready boundary. Critical: runbook / SLO / monitoring / rollback absent (PROD_READY-01/02/03/04). High: e2e authored-but-unexecuted (#80, BUILD-03); on-call ack absent (PROD_READY-05). **All four Production-Ready Criticals are owner-suppression candidates** — CB-8 is pure frontend chrome (no backend / migration / data store / money path / new vendor dep), so it has no independent operational surface; operability rolls into the CB-6 cockpit runbook/SLO. The one substantive finding is the unexecuted e2e (shared with CB-6 under #80). Full report: [scan-report.md](scan-report.md). — severity: critical (findings) — owner: PM/operator (triage: suppress-with-rationale vs. resolve) — area: production-readiness.

## Research findings

_To be filled by Researcher/Architect. Initial: the redesign is self-contained to the dashboard shell + a new global CSS layer; no backend, no migration, no Coinbase. The single genuinely-new architectural element is the styling system (the app has had none)._

---

_Brief status: `proposed` → awaiting operator HITL approval. Jira mirror skipped (Atlassian MCP not connected this session). Next: operator approves → `/create-bet-architecture CB-8` → `/create-story CB-8`._

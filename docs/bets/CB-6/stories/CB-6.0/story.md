---
id: CB-6.0
bet: CB-6
type: story
status: shipped
priority: P1
created: 2026-06-16
author: PM
design_link: docs/bets/CB-6/stories/CB-6.0/design.md
copy_link: docs/bets/CB-6/stories/CB-6.0/copy.md
area_tags: [frontend, dashboard, multi-asset, override-controls]
dependencies:
  - CB-6 brief approved 2026-06-16
  - CB-5.0 live-state read model (loadLiveState / loadSessionState) — reused
  - CB-5.3 /api/bot/override route (operator-auth pause/resume/reset) — reused
e2e: true
---

# CB-6.0 — Multi-asset shell + cockpit scaffold + Bot Status section (FIRST CB-6 STORY)

## Description

The first slice of the cockpit redesign: a **3-tab top nav** (📊 Mutual Funds · 📈 Equity · 🤖 Crypto) wrapping a **single-screen crypto cockpit page**, with **section 1 (Bot Status)** fully working — status display + Start / Pause / Stop controls — and the other five cockpit sections scaffolded as "Coming soon" placeholders (filled by CB-6.1–6.4). Equity + Mutual Funds tabs are "coming soon" placeholders (Equity = CB-7 / Zerodha). No new bot logic, no new broker, no migration: the controls reuse CB-5.3's `/api/bot/override`; the status reads CB-5.0's live-state model. Layout per the operator's `ETH_USD Bot — Coinbase.pdf`.

## Acceptance Criteria

- [ ] **AC 1 — 3-tab shell.** The crypto dashboard area renders a top nav with three tabs — **📊 Mutual Funds · 📈 Equity · 🤖 Crypto** (labels verbatim from [copy.md](copy.md)). Crypto is active by default. Tabs are real navigable controls (`<a>`/`<button>`) with `aria-current` on the active tab (not color-only).
- [ ] **AC 2 — Equity + Mutual Funds placeholders.** The Equity and Mutual Funds tabs render a "coming soon" placeholder (copy verbatim) + a "← Back to Crypto" affordance. **No equity/MF functionality** ships (Equity = CB-7).
- [ ] **AC 3 — Crypto cockpit page frame.** The Crypto tab renders the single-screen cockpit: section 1 **Bot Status** (built, AC 4–6) + labelled placeholder cards for **Profit / Loss · Current Position · Signals · Manual Overrides · Trade Log** each showing "Coming soon" (copy verbatim). The existing `/dashboard/trace` + `/dashboard/ledger` routes remain reachable (not removed this story). Route/placement of the cockpit is Engineer DRI (e.g., redesigned `/dashboard` or a `/dashboard/crypto` route).
- [ ] **AC 4 — Bot Status, status-aware (read).** The Bot Status section renders from the CB-5.0 live-state read model (`loadLiveState`/`loadSessionState` — reused, not re-queried): `status='active'` → badge **ACTIVE** + running one-liner + **Pause** + **Stop**; `status='paused'` → badge **STOPPED** + the stopped one-liner + "stopped by user" detail + **Start**; no/`reset` session → the CB-5.0 "no active session" treatment. All copy verbatim.
- [ ] **AC 5 — Controls write via the existing override route.** Start / Pause / Stop POST to `/api/bot/override` (CB-5.3): **Start → `resume`**, **Pause → `pause`**, **Stop → `pause`** (alias). Operator-auth is the CB-5.3 route's existing posture (no new auth). On success → `router.refresh()` so the SSR status re-renders. Pending state disables the button + shows `Working…`; on failure an inline error line `Couldn't update the bot. Try again.` (copy verbatim). Copy verbatim throughout.
- [ ] **AC 6 — Stop = alias for `paused`; NO migration.** `bot_sessions.status` is unchanged (`active`/`paused`/`reset`). Stop and Pause both resolve to `status='paused'` via `override_events.kind='pause'` (the route's existing kinds — no `stop`/`start` kind added, no CHECK migration). The Engineer documents that the Pause/Stop distinction is presentational only.
- [ ] **AC 7 — Run Now deferred.** The Run Now control renders **disabled** with a "coming soon" affordance (no on-demand trigger in CB-6.0 — that's CB-6.3). It must NOT call any endpoint.
- [ ] **AC 8 — Read panels stay READ-ONLY.** The cockpit's read surfaces (status section + the placeholder cards) perform no DB mutations; writes happen only via `/api/bot/override`. The CB-5 dashboard read-only invariant test continues to hold over the cockpit's read code (the controls client POSTs via `fetch`, importing no write helpers).
- [ ] **AC 9 — No regression to CB-5 surfaces.** `loadLiveState`/`loadSessionState` + the CB-5 read-model/render tests stay green; CB-5.3's `/api/bot/override` behavior is unchanged (Start/Pause/Stop are a relabel of resume/pause over the same route).
- [ ] **AC 10 — Tests.** Unit/component: tab shell render + active state; placeholder pages; Bot Status status-aware render (active/paused/no-session); controls happy-path (Start/Pause/Stop → correct kind) + pending + error; Run-Now-disabled. e2e (Codex): Crypto cockpit loads → status renders → Pause → STOPPED → Start → ACTIVE; Equity/MF tabs show "coming soon".
- [ ] **AC 11 — Gates.** typecheck / lint / test / production build clean; e2e via the test DB (per the merged e2e fail-closed setup).

## Standard Experience Checklist

UI story — load-bearing.
- [ ] **Navigation** — `covered by AC 1/2/3: 3-tab nav (MF/Equity/Crypto); "← Back to Crypto" from placeholders; Crypto is the cockpit home; existing trace/ledger routes remain reachable.`
- [ ] **States** — `covered by AC 3/4/5/7: active / paused(STOPPED) / no-session status states; pending (disabled + "Working…"); error (inline line); placeholder "Coming soon" sections; Run-Now disabled.`
- [ ] **Feedback** — `covered by AC 5: status change is visible via SSR re-render; the error line discriminates a failed update. Pause/Stop are reversible (Start undoes them) → no confirm needed; the destructive Reset lands with the overrides section in a later story.`
- [ ] **Accessibility** — `covered by AC 1/4 + design.md: real <button>/<a> controls, text labels, aria-current (active tab), disabled/aria-busy in flight; status conveyed by text + dot not color-only; focus on the status-appropriate primary control on mount.`
- [ ] **Edge cases** — `covered by AC 4/5/7: no/reset session treatment; POST failure; Run-Now disabled (no endpoint).`
- [ ] **Cross-surface consistency** — `n/a — single web target (no mobile/native surface in this stack).`

## Tech notes

### Reuse (no new backend)
- **Status read:** CB-5.0 `lib/dashboard/live-state.ts` (`loadLiveState`/`loadSessionState`) — already returns `status` + session info.
- **Controls write:** CB-5.3 `app/api/bot/override/route.ts` — Start=`resume`, Pause=`pause`, Stop=`pause`. No new route, **no new `override_events` kind, no migration** (AC 6). Mirror `app/dashboard/override-controls-client.tsx` (relabel resume/pause/reset → Start/Pause/Stop; Stop reuses the `pause` kind).
- **3-tab shell + cockpit frame:** new presentational components; inline styles per the CB-5 convention. Route/placement of the cockpit is Engineer DRI.

### Engineer DRI Decisions (to confirm at build)
1. Cockpit route/placement (redesign `/dashboard` vs new `/dashboard/crypto`) — keep CB-5's `/dashboard/trace` + `/ledger` reachable during the transition.
2. How Run Now renders disabled (button + "coming soon" title) without a backend call.

### What this story does NOT include
- Per-pair selector + per-pair title (CB-6.1) — title is the generic "Crypto Trading Bot".
- Profit/Loss, Current Position, Signals content (CB-6.1–6.2); Run-now backend (CB-6.3); Manual overrides incl. real-money Buy/Sell + Reset (CB-6.4); Equity/MF functionality (CB-7+); dark-mode toggle.

## PRs
_Auto-populated._

## Tests
_Unit/component co-located; e2e by Codex in `e2e/` (now runs against the dedicated test DB per the merged fail-closed setup; note issue #80 — the Next-16 two-dev-server lock — may still gate local e2e execution until that follow-up lands)._

## DRI Log

### Decisions
- [2026-06-16] [PM] **CB-6.0 slice = shell + cockpit scaffold + Bot Status only.** Read panels, Run-now, and real-money overrides are later stories — keeps the first slice independent + low-risk (reuses CB-5 read model + CB-5.3 route; no new backend, no migration). — area: scope — alternatives: shell-only (too thin); whole cockpit at once (too big) — reversibility: easy.
- [2026-06-16] [Designer] **Stop/Pause display resolved: one not-running state shown as `STOPPED`; both Pause and Stop lead to it.** Honors the operator's "Stop = alias for paused, no migration" decision; the Pause/Stop button redundancy is accepted (kept for familiarity with the design) — area: ux/data-model — alternatives: single button (rejected — design shows both); distinct `stopped` state + migration (rejected by operator) — reversibility: easy.
- [2026-06-16] [Engineer] **3-tab nav in a new `app/dashboard/layout.tsx`** (thin: tabs + `{children}`); tabs in `dashboard-tabs.tsx` (`"use client"`, `usePathname` + pure `activeTab()`). Existing trace/ledger/strategy pages keep their own containers (no edits) — tabs render above them. — area: routing/ui — reversibility: easy.
- [2026-06-16] [Engineer] **New `bot-controls-client.tsx`** (NOT an edit of CB-5.3's `override-controls-client.tsx`, still used by the CB-5 panel). Start→`resume`, Pause→`pause`, **Stop→`pause`** via exported `ACTION_KIND` (alias; no new override kind, no migration). Run-Now rendered `disabled` (CB-6.3). — area: controls — reversibility: easy.
- [2026-06-16] [Engineer] **Kept the device-label footer + the strategy link in the cockpit**; surfaced trace/ledger via links inside the SIGNALS + TRADE LOG cards (AC 3 reachability). Dropped the "Signed in." landing line + "crypto-bot" header (→ eyebrow + "Crypto Trading Bot"). — area: ui — reversibility: easy.
- [2026-06-16] [Engineer] **`/dashboard` confirmed DYNAMIC (ƒ) in the prod build** (reads `headers()` + `loadLiveState`) — no static-prerender regression (CB-5.1 lesson); equity/MF placeholders correctly static (○). 797 unit tests + read-only invariant green. — area: build.

### Risks
- [2026-06-16] [Engineer] **Onboarding e2e (`e2e/auth/onboarding.spec.ts`) asserts "Signed in." on `/dashboard`** — the cockpit no longer renders it, so that spec fails until updated. — likelihood: certain — impact: low (test-only) — mitigation: Codex updates the post-auth assertion to the cockpit ("Crypto Trading Bot") in the Phase-3 e2e pass — area: e2e.
- [2026-06-16] [PM] **Cockpit redesign regresses the shipped CB-5 `/dashboard`** — likelihood: medium — impact: medium — mitigation: reuse the tested `loadLiveState` read model; keep CB-5 read-model/render tests green; keep trace/ledger routes reachable; page-render tests for the cockpit — area: regression/frontend.
- [2026-06-16] [Designer] **Pause/Stop redundancy reads as confusing** (two buttons, same effect) — likelihood: medium — impact: low — mitigation: single `STOPPED` display; revisit consolidating to one control post-CB-6.0 if it grates — area: ux.

### Issues
- [2026-06-16] [PM] **Cockpit title is generic ("Crypto Trading Bot") until CB-6.1 adds the per-pair selector + per-pair title** — severity: low — owner: PM — status: open (CB-6.1) — area: scope.

---
_Story closed: 2026-06-16 (SHIPPED via PR #84 + Codex e2e), brief: docs/bets/CB-6/brief.md. **FIRST CB-6 STORY — multi-asset shell + cockpit scaffold.**_

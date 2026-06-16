# CB-6.0 — Design (multi-asset shell + cockpit scaffold + Bot Status section)

_Designer artifact. Authoritative layout reference: the operator's `ETH_USD Bot — Coinbase.pdf` (finance.kindtree.us/coinbase-bot.html). This story builds the **top nav shell** + the **cockpit page frame** + **section 1 (Bot Status)** only; the other five sections (Profit/Loss, Current Position, Signals, Manual Overrides, Trade Log) are scaffolded as labelled placeholders and filled by CB-6.1–6.4. Reuses inline styles (CB-1.6/CB-3.3/CB-5 convention — no new UI dependency)._

## Top nav (3-tab shell) — from the PDF header

```
┌─────────────────────────────────────────────────────────┐
│  📊 Mutual Funds    📈 Equity    🤖 Crypto                 │   ← top of page, Crypto active (boxed)
└─────────────────────────────────────────────────────────┘
   DCA + SIGNAL EXIT · COINBASE
   Crypto Trading Bot
```

- Three tabs as in the PDF: **📊 Mutual Funds · 📈 Equity · 🤖 Crypto**. Crypto is the active/selected tab (boxed outline, as in the design).
- **Crypto** → the cockpit page (below). **Mutual Funds + Equity** → a **"coming soon" placeholder** page (no functionality this bet) — a simple centered card with the copy from copy.md + a "back to Crypto" affordance.
- Real `<a>`/`<button>` tab controls (keyboard + screen-reader operable); the active tab is conveyed by text/`aria-current`, not color alone.
- Eyebrow line "DCA + SIGNAL EXIT · COINBASE" + a page title. **Title note:** the PDF shows "ETH/USD Trading Bot" — but per-pair selection arrives in CB-6.1; CB-6.0 has no pair selector, so the title is the generic **"Crypto Trading Bot"** until CB-6.1 adds pair selection + the per-pair title. (Flagged as a story Issue.)

## Cockpit page frame

A single-screen, vertically-stacked set of cards (matching the PDF's card sections). CB-6.0 renders:
1. **Bot Status** — fully built (below).
2–6. **Profit/Loss · Current Position · Signals · Manual Overrides · Trade Log** — each a labelled card with a muted "Coming soon" line (so the cockpit frame is visible + the build order is legible). Filled in CB-6.1–6.4.

The existing `/dashboard/trace` + `/dashboard/ledger` routes remain reachable during the transition (not removed in CB-6.0).

## Section 1 — Bot Status (the build target)

```
│  BOT STATUS   Bot is active — running every 15 minutes     │
│    ● ACTIVE                                                │
│    [ ⏸ Pause ]  [ ⏹ Stop ]                                 │   ← status='active'
│    ─────────────────────────────────────────              │
│    (when paused/stopped:)                                  │
│    ⏸ PAUSED   ·   stopped by user                          │
│    [ ▶ Start ]                                             │   ← status='paused'
```

- **Status-aware** (mirrors CB-5.3's status-aware controls):
  - `active` → badge **● ACTIVE** + one-liner ("Bot is active — running every 15 minutes") + **Pause** and **Stop** buttons.
  - `paused` → badge **⏸ PAUSED** + one-liner ("Bot is stopped — click Start to resume") + a status-detail line ("stopped by user") + **Start** button.
  - `reset`/no-session → the CB-5.0 "no active session — save a strategy" treatment (carried over).
- Controls POST to `/api/bot/override` (the CB-5.3 route): **Start** = `resume`, **Pause** = `pause`, **Stop** = `pause` (alias — operator decision, no migration). On success → `router.refresh()` so the SSR status re-renders.
- Real `<button>`s, text-labelled (icons are decorative; labels carry meaning). Pending state disables the button + shows a working label (copy.md); inline error line on failure (copy.md). `aria-disabled`/`disabled` while in flight.
- **Run Now** is **deferred to CB-6.3** — render it **disabled** with a "coming soon" affordance (so the design's 4-control row is visible) OR omit; Designer ships it disabled-with-title to match the layout without the backend.

## ⚠️ Design issue to resolve in this story — Stop vs Pause

The operator chose **Stop = alias for `paused` (no migration)**, but the data model then has only `active`/`paused`/`reset` — so **Pause and Stop both produce `status='paused'` and are indistinguishable** in the DB/audit (both log `override_events.kind='pause'`; there is no `stop`/`start` kind in the CHECK). The PDF shows distinct "STOPPED / stopped by user" wording. **Resolution for CB-6.0:** the paused state displays one consistent treatment; Stop and Pause are two routes to it. Whether to (a) keep both buttons (familiar, redundant), (b) show only Pause, or (c) label the paused state "STOPPED" vs "PAUSED" — is settled here with the UX Writer (default: keep both buttons, single "PAUSED" display + "paused by user" detail). No `bot_sessions.status` migration.

## Accessibility
- Tabs: `role`/`aria-current` for the active tab; keyboard-navigable; not color-only.
- Buttons: real `<button>`s, text labels, `disabled`/`aria-busy` in flight; status conveyed by text + dot, not color alone.
- Focus: on the cockpit's primary control on mount (status-appropriate: Start when paused, Pause when active).

## Out of scope (design)
- Per-pair selector + per-pair title (CB-6.1). The read sections' content (CB-6.1–6.2). Run-now backend (CB-6.3). Real-money overrides (CB-6.4). Equity/MF functionality (CB-7+). Dark-mode toggle (PDF shows 🌙 — post-MVP polish, not this slice).

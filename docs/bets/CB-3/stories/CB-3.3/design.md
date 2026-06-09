---
id: CB-3.3-DESIGN
bet: CB-3
story: CB-3.3
type: design
status: ready
author: Designer (Compass role; Claude per tool assignment)
created: 2026-06-08
---

# CB-3.3 Design — Strategy authoring form

Single-page form. No tabs. No wizard. No modal trap (except the one supersession-confirm modal on revise-submit). The operator authors a strategy → hits Save → ends up back on /dashboard with a success toast. End-to-end in <5 min on first attempt.

This file is for **Engineer at `/build CB-3.3`** — describes the visual layout, the state matrix (states the form can be in), the supersession revise-flow, the empty-state defaults, and the accessibility-affecting structural decisions. Pairs with [copy.md](copy.md) (verbatim strings) and [story.md](story.md) (the spec contract).

## Layout (ASCII; single-operator → no Figma)

Authenticated; renders inside `/dashboard/strategy` route. Header reuses the /dashboard chrome (header bar with sign-out button per CB-1.6 pattern).

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Back to dashboard                                    Sign out  │  ← Header (existing CB-1.6 chrome)
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Create your strategy                                                │  ← H1 (focus lands HERE on success-redirect /dashboard; first input is focused on /dashboard/strategy mount)
│  ─────────────────────                                               │
│                                                                      │
│  ┌─ Name ─────────────────────────────────────────────────────────┐ │
│  │ ┌────────────────────────────────────────────────────────────┐ │ │  ← Name input — focus lands HERE on mount
│  │ │ My DCA Strategy                                            │ │ │     (per AC 10)
│  │ └────────────────────────────────────────────────────────────┘ │ │
│  │ Helper: A short name you'll see in the dashboard.              │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Assets ───────────────────────────────────────────────────────┐ │
│  │ Selected from top-5 by dollar volume (as of 2026-06-08 12:34)  │ │  ← Selector header — surfaces the top-5-as-of date
│  │                                                                │ │     (PM Risk #4 transparency)
│  │ [✕ BTC-USD] [✕ ETH-USD] [✕ ZEC-USD] [✕ XRP-USD] [✕ SOL-USD]   │ │  ← Pre-filled chips; ✕ removes
│  │                                                                │ │
│  │ + Add another (from any USD-quoted spot product)               │ │  ← Add affordance (search + select)
│  │                                                                │ │     Disabled when 5 selected.
│  │ Helper: 1-5 cryptos. The bot considers ONLY these.             │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Entry rules ──────────────────────────────────────────────────┐ │
│  │ Buy when:                                                      │ │
│  │                                                                │ │
│  │ RSI threshold:  ┌───────┐                                      │ │  ← Default 30 (per Designer empty-state)
│  │                 │  30   │  (between 0 and 100)                 │ │
│  │                 └───────┘                                      │ │
│  │                                                                │ │
│  │ MA period:      ◯ 5  ● 10  ◯ 20  ◯ 50                          │ │  ← Default 20; radio group
│  │                                                                │ │     (Wait — per types.ts default is the
│  │                                                                │ │      MaPeriodSchema strict set; default
│  │                                                                │ │      can be 20 per Designer)
│  │                                                                │ │
│  │ ☐ Also require price < MA(period)  (MA reinforcement)          │ │  ← Optional; defaults unchecked
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Exit rules ───────────────────────────────────────────────────┐ │
│  │ Sell when:                                                     │ │
│  │                                                                │ │
│  │ RSI threshold:  ┌───────┐                                      │ │  ← Default 70
│  │                 │  70   │  (between 0 and 100; must be > entry │ │
│  │                 └───────┘   RSI)                               │ │
│  │                                                                │ │
│  │ Min profit %:   ┌───────┐                                      │ │  ← Default 1.5
│  │                 │ 1.5   │                                      │ │
│  │                 └───────┘                                      │ │
│  │                                                                │ │
│  │ Sell fraction:  ┌───────┐                                      │ │  ← Default 0.5 (sell half)
│  │                 │ 0.5   │  (0 to 1; e.g., 0.5 = sell half)     │ │
│  │                 └───────┘                                      │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Per-buy + per-session limits ────────────────────────────────┐ │
│  │ Position size (USD):     ┌───────┐                            │ │  ← Default 50
│  │                          │  50   │                            │ │
│  │                          └───────┘                            │ │
│  │ Per-session buy count:   ┌───────┐  (integer ≥ 1)             │ │  ← Default 10
│  │                          │  10   │                            │ │
│  │                          └───────┘                            │ │
│  │ Per-session dollar cap:  ┌───────┐                            │ │  ← Default 500
│  │                          │  500  │                            │ │
│  │                          └───────┘                            │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  [  Cancel  ]                              [  Save strategy  ]       │  ← Cancel = /dashboard;
│                                                                      │     Save = submit form
│                                                                      │     (disabled while invalid OR pending)
└──────────────────────────────────────────────────────────────────────┘
```

## Default values for empty state (first-time authoring)

| Field | Default | Why |
|---|---|---|
| `name` | `""` (blank) | Operator-named; placeholder copy from copy.md |
| `selected_assets` | top-5 from `topN(makeCoinbaseAdapter(), 5)` (server-rendered) | Brief Hypothesis "review coinbase data to highlight the top 5" |
| `entry_rules.rsiThreshold` | `30` | Retail convention: RSI < 30 = oversold = buy zone |
| `entry_rules.maPeriod` | `20` | Middle of the {5, 10, 20, 50} set; balanced for daily timeframe |
| `entry_rules.maReinforcement` | `false` | Operator opt-in; simpler default |
| `exit_rules.rsiThreshold` | `70` | Retail convention: RSI > 70 = overbought = sell zone |
| `exit_rules.minProfitPct` | `1.5` | Operator's pre-CB-3 spreadsheet pattern (per brief User pain input) |
| `exit_rules.sellFraction` | `0.5` | Sell half on signal; keep half running |
| `position_size_usd` | `50` | Conservative MVP; operator can raise |
| `per_session_buy_count_cap` | `10` | ~1 buy per 1.5h tick over 15h trading window |
| `per_session_dollar_cap` | `500` | 10 × 50 = 500; matches buy count × position size |

## Revise state (operator returns to /dashboard/strategy after a prior save)

Same layout. Every field pre-filled with the current active strategy's values. H1 changes to "Revise your strategy" + a banner above the form:

```
┌──────────────────────────────────────────────────────────────────────┐
│  ⚠ You're revising the active strategy.                              │
│    Saving creates a new version; the current one is archived but     │
│    stays queryable in the dashboard.                                 │
└──────────────────────────────────────────────────────────────────────┘
```

Submit button text changes to "Save revision" (per copy.md). Clicking it triggers the **destructive supersession confirmation modal**:

```
┌──────────────────────────────────────────┐
│  Revise strategy?                        │
│                                          │
│  The current version will be archived    │
│  but kept queryable for the dashboard.   │
│                                          │
│        [ Cancel ]   [ Continue ]         │
└──────────────────────────────────────────┘
```

Esc dismisses. Cancel closes the modal (stays on form). Continue triggers the actual save.

## State matrix

| State | Trigger | What renders |
|---|---|---|
| **Idle / empty** | First-time operator GETs the page | Form with empty-state defaults; H1 "Create your strategy"; submit button enabled if all defaults satisfy validation (they do) |
| **Idle / revise** | Operator with an active strategy GETs the page | Form pre-filled; H1 "Revise your strategy"; revision banner above; submit text "Save revision" |
| **Loading / submit-in-flight** | Operator clicks Save (or Continue on the modal) | Submit button: text "Saving…" + spinner; button + form `disabled`; cancel button enabled (operator can abort by navigating away — `beforeunload` warns if dirty) |
| **Error / validation** | Server action returns `{success: false, errors: ValidationError[]}` | Inline errors render below the affected fields (per AC 5 mapping); top-of-form banner: "Some fields need attention. See errors above."; submit re-enables once errors are addressed |
| **Error / network** | Save action throws (offline; CB-2 wrapper failure) | Top-of-form banner: "Save failed. Check your connection."; submit re-enables; form state preserved |
| **Error / server** | Save action returns `{success: false, error_type: "server"}` | Top-of-form banner: "Save failed on the server. Try again."; submit re-enables; form state preserved |
| **Error / unknown** | Save action returns `{success: false, error_type: "unknown"}` | Top-of-form banner: "Unexpected error. Try again or reload."; submit re-enables; form state preserved |
| **Success** | Save action succeeds → server redirect to `/dashboard?strategy=saved` | Operator lands on /dashboard with the success toast: "Strategy saved. Bot will pick it up on the next tick." |
| **Cancel** | Operator clicks Cancel | If form is pristine → `/dashboard` immediately; if form is dirty → `window.confirm("Discard unsaved changes?")` then `/dashboard` |
| **Top-5 fetch timeout** | Coinbase fetch in Server Component exceeds 10s | Page renders with empty selector + top-of-form notice: "Couldn't load top-5 — please try again later." + retry link to /dashboard |

## Accessibility decisions

- **H1** has `tabIndex={-1}` so focus can be moved to it programmatically on success-redirect (CB-1.6 pattern).
- **First input** (Name) receives `autoFocus` on mount.
- **Submit error** → programmatic focus moves to the FIRST invalid field (`errors[0].path`).
- **Tab order** is the source-DOM order; layout matches tab order (no `tabIndex` overrides).
- **MA period** uses a radio group (semantic `<input type="radio">`) — strict set of 4 values, radio is the natural a11y match. NOT a select dropdown.
- **Multi-select assets**: chip-pattern with native `<button aria-label="Remove BTC-USD">✕</button>` per chip. Add affordance uses a `<button>` that opens an inline expand-collapse search (NOT a separate modal — keeps the form single-page).
- **Inline errors** use `<p id="entry-rsi-error" role="alert">…</p>` + the input gets `aria-invalid="true" aria-describedby="entry-rsi-error"`.
- **Error banner** at top-of-form is `<div role="alert">…</div>` for SR announcement.
- **Confirmation modal** uses `<dialog>` element OR an accessible modal pattern (focus trap; Esc dismisses; focus restoration on close).
- **No color-only indicators**: validation errors use both red color AND text + icon.

## Visual notes (light touch — this is single-operator MVP)

- Reuse existing /dashboard typography + spacing scale.
- Field sections in soft-bordered cards (existing CB-1.6 surface treatment).
- Errors in muted red; success toast in muted green; warning banner in muted amber.
- Primary action button (Save) is the only filled button on the page; Cancel is a text button.
- Form is centered with max-width ~640px (single-column; readable line length); fields are full-width within the column.

## What this design intentionally does NOT specify

- Exact spacing values (px / rem) — Engineer picks per existing /dashboard scale.
- Exact color values — Engineer picks per existing token palette.
- Animations / transitions — none required; if Engineer wants subtle ones, it's their DRI.
- Mobile breakpoint — n/a per AC 12 cross-surface `n/a` (web only); the single-column layout naturally narrows.

## Files this implies at /build

| File | Purpose |
|---|---|
| `app/dashboard/strategy/page.tsx` | Server Component shell; auth gate; initial-state fetch (active strategy + top-5); renders `_form.tsx` |
| `app/dashboard/strategy/_form.tsx` | Client Component; generic over `adapter: AssetAdapter` prop; renders all field sections + submit/cancel |
| `app/dashboard/strategy/_selector.tsx` | Client Component; chip + add affordance for selected_assets |
| `app/dashboard/strategy/_actions.ts` | Server actions (`"use server"`); `saveStrategy(formData)` |
| `lib/strategies/db.ts` | DB ops: `getActiveStrategy(userId)`, `insertStrategy(row)`, `markSuperseded(oldId, newId)`, `upsertSingletonBotSession(userId, activeStrategyId)` |

(Engineer DRI may name files differently — `_form.tsx` vs `form-client.tsx` etc — per existing repo convention; design.md is structural, not naming-prescriptive.)

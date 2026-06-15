---
id: CB-5
type: feature
status: approved
priority: P0
parent: FOUNDATION-PRODUCT
portfolio_stub: false
depends_on: [CB-1, CB-4]
parallel_with: [CB-4]
architecture_required: false
created: 2026-05-31
promoted: 2026-06-14
author: PM
sources:
  - docs/foundation/product.md
  - docs/foundation/architecture.md
  - docs/foundation/portfolio.md
  - docs/bets/CB-4/brief.md
key_metric:
  name: Decision-trace completeness — % of the operator's "why did the bot do X at time T?" questions answerable from the dashboard WITHOUT psql
  baseline: 0% (no UI today — the operator reads bot behavior via psql against the production DB)
  target: 100% — every `bot_ticks` decision + its per-asset `signals` reason + every `orders` ledger row is visible in the dashboard with the reason for every action, satisfying product.md's "log all transactions" + "full decision-trace observability" In-scope clauses.
  source: manual operator walkthrough at story close + the Playwright golden-path specs (each rendered view proves its data renders end-to-end)
guardrails:
  - name: Safe override controls only — pause/resume/reset are state-only writes; NO real-money override (force-buy/sell-N) ships in this bet
    threshold: 100% — zero code paths in CB-5 call `lib/coinbase/orders:placeOrder`. CI grep test (the CB-4.2 no-orders-import walk pattern) asserts the dashboard + `/api/bot/*` module graph never reaches order placement.
  - name: Read views are READ-ONLY — the dashboard never mutates `bot_ticks` / `signals` / `orders` (append-only event log invariant)
    threshold: CI grep test asserts no `UPDATE`/`INSERT` against the event-log tables from `app/dashboard/**`; only `/api/bot/*` writes, and only to `bot_sessions.status` + `override_events`.
  - name: LIVE_MODE state is ALWAYS visible — the operator can never be unsure whether real money is in play
    threshold: every dashboard page renders the LIVE_MODE banner; Playwright asserts it under both `LIVE_MODE=false` and `=true`.
  - name: e2e coverage on every rendered view (CB-1.6 lesson — mocks gave false confidence; RSC/Client seams need real browser tests)
    threshold: each story touching a rendered view ships ≥ 1 Playwright spec; Standard Experience Checklist categories are mostly NOT `n/a` (this is the UI bet).
measurement_window_days: 0
check_in_cadence: per-story
area_tags: [dashboard, ledger, decision-trace, override-controls, server-components, e2e, observability]
estimate:
  duration_weeks: 1
  confidence: medium
  refined_by: brief-promotion
  refined_at: 2026-06-14
  estimated_start: 2026-06-14
  estimated_end: 2026-06-21
---

# CB-5 — Transaction ledger + bot dashboard + safe override controls

> The bet where the operator finally *sees* the bot. CB-4 made the bot decide + act + log; today those decisions live in Postgres rows the operator reads via psql. CB-5 turns that data into the dashboard the product was always for — the "review" step of the operator's "sign in → strategy → paper → live → review" loop.

## Problem

The bot has been running in production since 2026-06-12, making a real decision every 15 minutes and writing a full append-only trace (`bot_ticks` + per-asset `signals`, soon `orders`). **But there is no UI for any of it.** The operator reads bot behavior by running SQL against the production database. The product's two headline observability clauses — **"log all transactions"** and **"full decision-trace observability"** ([product.md § In scope](../../foundation/product.md#in-scope)) — are satisfied at the *data* layer but not delivered to the *human*. And there is no in-product way to pause the bot, resume it, or reset a session: those are `bot_sessions.status` flips the cron tick already respects (CB-4.2 early-outs), but nothing writes them yet.

CB-5 is the last MVP bet. After it, the operator's full loop is closed: author a strategy (CB-3), watch the bot paper-trade against their real portfolio (CB-4), **review every decision + control the bot from a dashboard (CB-5)**, then make the deliberate `LIVE_MODE` flip.

## Why now / parallel with CB-4

CB-5's hard dependency is *real data to render* — and that's shipped + verified in production: CB-4.2 (cron tick, 84 ticks / 0 errors / 100% reliability over ~21h) and CB-4.3 (migration 0006 applied, `orders` ledger writable, ships dark). The portfolio originally scheduled CB-5 as **"Stream 4: sequential — needs `bot_ticks` rows to display"**; that rationale is now **satisfied**, so promoting + building CB-5 in parallel with the CB-4 tail (the dry_run ledger verification + the CB-4.4 drop call) is recognizing a met dependency, not skipping one. `parallel_with` updated from `[]` → `[CB-4]` accordingly.

A compounding accelerator: **the read views are largely "psql joins behind React."** Throughout CB-4, the operator's verification has been me running join queries against `bot_ticks` / `signals` / `orders` — those queries *are* CB-5's read model. The dashboard's data layer is already proven; CB-5 is mostly rendering + the safe-override write path.

## User

**Primary user: the operator** — the single human who authors strategies + decides when to go live. The dashboard is their review + control surface. No other users (single-operator MVP per product.md).

## Hypothesis (the bet)

If the dashboard surfaces, as Server-Component-rendered views on each page load: (1) **live state** — session status, real holdings + average cost, total invested, buy count, session start; (2) the **decision-trace log** — `bot_ticks` joined to per-asset `signals` with RSI/MA/decision/reason (mode context via the LIVE_MODE banner; per-execution paper/live status lives in the transaction ledger — see PM DRI Decision #7, amended 2026-06-14); (3) the **transaction ledger** — `orders` rows (dry_run + live) with manual-vs-bot source + the per-execution paper/live status; (4) a prominent **LIVE_MODE banner**; plus **safe override controls** (pause / resume / reset-session) writing `bot_sessions.status` + `override_events` — then the operator can answer "why did the bot do X?" for 100% of ticks without psql, control the bot in-product, and the **"log all transactions"** + **"full decision-trace observability"** clauses of the [product.md MVP definition](../../foundation/product.md#in-scope) are delivered. The MVP wedge is then complete.

## Scope

### In scope

**Read views** (Server Components; SSR per page load; inline styles per the CB-3.3 `/dashboard/strategy` precedent — no new UI dependency):
- **Live state** — active session status; real holdings + average cost (via CB-4.3's `aggregatePosition` over `getAccountTradeHistory` — see PM Decision #6); total invested; buy count; session start.
- **Decision-trace log** — chronological `bot_ticks` ⋈ `signals` (per-asset RSI/MA at decision time, decision, reason string). The reason strings CB-4.1 made operator-readable render verbatim here. Mode context (paper/live) comes from the page-level LIVE_MODE banner; the per-EXECUTION dry_run/live status is shown in the transaction ledger (it lives in `orders.status`, not `bot_ticks` — see PM DRI Decision #7).
- **Transaction ledger** — `orders` rows (dry_run + live), `source` (manual vs bot) separated, status. (`trade_fills` join deferred — CB-4 deferred fill-polling; the ledger shows `orders`.)
- **LIVE_MODE banner** — prominent, color-coded, on every page.

**Safe override controls** (Client Component → new `/api/bot/*` route handlers, operator-auth via the existing session — NOT CRON_SECRET): pause / resume / reset-session → write `bot_sessions.status` + an `override_events` audit row. Reset preserves the ledger (per [product.md "reset clears the session, not the exchange"](../../foundation/product.md)). The cron tick already honors `paused`/`reset` (CB-4.2 early-outs) — the consumer exists; CB-5 builds the producer.

### Out of scope / deferred

- **Real-money override buttons** (force-buy / sell-50% / sell-all) — DEFERRED to a follow-up story (PM Decision #1). They reuse CB-4.3's live order path, which has never executed against real money in production. They become useful only *after* the `LIVE_MODE` flip; shipping them before the live path is proven adds untested real-money surface to the dashboard bet.
- **Auto-pause on drawdown + reserve-floor enforcement** — deferred per [portfolio.md § Deliberately out of MVP](../../foundation/portfolio.md); operator self-monitors during dry-run.
- **`trade_fills` population / fill polling** — CB-4 deferred it; the ledger renders `orders`.
- **Client-side auto-refresh / polling** — PM Decision #2: SSR-per-load + manual refresh for MVP.
- **`account_snapshots` historical-position feed** — nothing writes it (PM Decision #6); post-MVP enhancement.

## PM DRI Decisions

- [2026-06-14] [PM] **Safe override controls only; real-money overrides (force-buy/sell-N) deferred to a post-live-flip follow-up** — operator-confirmed at brief promotion
  - **Rationale (required):** the dashboard's core MVP value is the decision-trace + ledger *review* tool the operator needs DURING the dry-run window — that's what informs the `LIVE_MODE` flip decision. pause/resume/reset are state-only writes (zero real-money risk) and the cron tick already respects them. force-buy/sell-N place real orders through CB-4.3's live path, which has never executed in production; they're only useful *after* going live. Bundling them now adds the heaviest test + security surface (a real-money write path through a UI) to the bet's critical path before the live path is proven.
  - **Area (required, tag):** scope / real-money-safety
  - **Alternatives considered (required):** all five controls in CB-5 (rejected — untested real-money surface on the critical path); force-buy/sell-N behind an extra confirmation modal (rejected — confirmation UX doesn't make the underlying untested live path safe; the gate should be "live path proven in prod," not "operator clicked twice")
  - **Reversibility:** trivial — the deferred follow-up story adds the buttons + `/api/bot/order` route once the live flip + a real fill are observed

- [2026-06-14] [PM] **Data freshness = SSR per page load + manual refresh; no client polling** — operator-confirmed
  - **Rationale (required):** matches the "operator self-monitors during dry-run" posture; lowest complexity (no client data-fetch layer, no extra read API, less e2e surface). The product.md "balances refreshed every 15 sec" clause is the *bot's* read cadence, not a dashboard auto-refresh requirement — the operator reviewing a dashboard refreshes when they look.
  - **Area (required, tag):** architecture / dashboard-rendering
  - **Alternatives considered (required):** client polling every 15s (rejected for MVP — heavier; revisit if the operator wants a live ticker post-MVP); server-streaming (rejected — over-engineered for a single-operator review surface)
  - **Reversibility:** moderate — adding polling later is additive (a client wrapper + a read API)

- [2026-06-14] [PM] **Reuse the cost-basis read model — the verification queries ARE the dashboard's data layer**
  - **Rationale (required):** the join queries run throughout CB-4's verification (`bot_ticks` ⋈ `signals`, `orders` aggregations, `aggregatePosition` for holdings) are exactly what the views render. Lift them into shared read functions (`lib/ledger/` or co-located Server Component data fns) rather than reinventing. This is why the estimate refines to ~1wk despite being the largest UI surface.
  - **Area (required, tag):** reuse / read-model
  - **Alternatives considered (required):** a new query layer (rejected — duplicates proven queries); an ORM (rejected — the repo uses postgres.js tagged templates throughout; consistency)
  - **Reversibility:** trivial

- [2026-06-14] [PM] **Inline-styles Server/Client component convention — no new UI dependency**
  - **Rationale (required):** the existing dashboard (`/dashboard/strategy`, CB-3.3) is Server Components + hyphenated Client Components with inline `style={{…}}`; no Tailwind, no shadcn, empty `components/`. CB-5 stays consistent — introducing a styling system mid-MVP would be inconsistent scope creep.
  - **Area (required, tag):** ui-consistency
  - **Alternatives considered (required):** add Tailwind/shadcn (rejected — new dependency + inconsistent with the shipped dashboard; a post-MVP refactor if the UI grows)
  - **Reversibility:** moderate (a later styling-system migration is its own bet)

- [2026-06-14] [PM] **`parallel_with: [CB-4]` — the sequential dependency is satisfied**
  - **Rationale (required):** CB-5's only hard dependency (real `bot_ticks`/`signals`/`orders` data) is shipped + verified in prod. The portfolio's "Stream 4: sequential" framing reflected the pre-CB-4 plan; overlapping with the CB-4 tail (a passive verification + a forecast drop-call) is sound. Swept into portfolio.md.
  - **Area (required, tag):** planning / parallelization
  - **Alternatives considered (required):** wait for CB-4 to formally close (rejected — the tail is a check + a decision, not a build; no CB-5 work depends on it)
  - **Reversibility:** trivial

- [2026-06-14] [PM] **Live-state holdings/avg-cost source = CB-4.3's `aggregatePosition` (fresh Coinbase read on SSR load); `account_snapshots` is unpopulated** — resolved by a grounding check at promotion
  - **Rationale (required):** verified at drafting that nothing writes `account_snapshots` (zero INSERT paths). The honest source for "what does the operator hold + at what cost" is the same one the bot uses (CB-4 Decision #7): `aggregatePosition` over `getAccountTradeHistory` against the operator's REAL Coinbase portfolio. The live-state view does a fresh Coinbase read on page load (bounded — operator-only, on-demand, not per-tick).
  - **Area (required, tag):** data-source / read-model
  - **Alternatives considered (required):** derive holdings from latest `bot_ticks`/`orders` (rejected — dry_run orders aren't real holdings; the real portfolio is the honest source); populate `account_snapshots` first (rejected — extra writer for MVP; post-MVP historical-position enhancement)
  - **Reversibility:** moderate — a future `account_snapshots` feed would give historical position charts without changing the live-state contract

- [2026-06-14] [PM] **Decision-trace shows DECISIONS; the per-execution paper/live (dry_run/live) status moves from the decision-trace to the transaction LEDGER (CB-5.2)** — amended at CB-5.1 story drafting (escalated per AGENTS.md Principle #16 from the story to this owning brief; Codex PR #70 round-1 BLOCKER)
  - **Rationale (required):** the original brief listed a "dry-run badge" on the decision-trace. But `bot_ticks`/`signals` record the DECISION (buy/sell/hold + reason + RSI/MA), NOT the execution mode — whether a buy/sell ran as paper or live is recorded per-execution in `orders.status` (`dry_run`/`submitted`), which the decision-trace tables don't carry. A faithful per-tick badge would require either joining `orders` into the decision-trace (duplicating CB-5.2's ledger join across two views) or a new `bot_ticks.live_mode` column + backfill. The honest, non-duplicative scope: the decision-trace answers "WHY did the bot decide X" (decisions + reasons), with page-level mode context from the LIVE_MODE banner; the ledger (CB-5.2) answers "WHAT executed + paper or live" via `orders.status`. The operator still distinguishes paper from live (banner + ledger) — the indicator is relocated, not dropped.
  - **Area (required, tag):** scope / read-model-separation / observability
  - **Alternatives considered (required):** keep the per-tick badge on the decision-trace by joining `orders` there (rejected — duplicates the orders join across decision-trace + ledger; two places to maintain the same status logic); add `bot_ticks.live_mode` via migration (rejected for MVP — extra schema + backfill for a nice-to-have; the banner + ledger already deliver the intent); keep the brief literal + leave the story narrowing it (rejected — that's the Principle #16 violation Codex flagged; the brief owns the scope, so it's amended here first)
  - **Reversibility:** moderate — a future `bot_ticks.live_mode` migration would enable a per-tick badge on the decision-trace without changing the ledger's role
  - **Forward reference:** CB-5.1 executes this (decision-trace, no per-tick badge); CB-5.2's ledger owns the per-execution paper/live status display.

## PM Risks

- [2026-06-14] [PM] **Override write-path races the cron tick** (operator hits pause mid-tick)
  - **Likelihood (required):** medium (a `*/15` tick runs ~2.4s; an operator pause during that window is possible)
  - **Impact (required):** low (worst case: one more tick executes before the pause takes effect — in dry-run, harmless; the `override_events` row + the next tick's `paused` early-out make it auditable + self-correcting)
  - **Mitigation (required):** `/api/bot/*` writes `bot_sessions.status` + an `override_events` audit row atomically; the cron tick reads status at the top of each tick (CB-4.2), so the pause is honored from the next tick. Document the "pause takes effect next tick" semantics in the UI.
  - **Area (required, tag):** concurrency / override

- [2026-06-14] [PM] **e2e fragility on the RSC/Client seam** (CB-1.6 lesson)
  - **Likelihood (required):** medium (Server Component → Client Component data hand-offs + override-button → API → state round-trips are exactly where mocks gave false confidence in CB-1.6)
  - **Impact (required):** medium (a seam bug that unit/mocked tests miss would surface only in the browser — and this is the operator's primary surface)
  - **Mitigation (required):** e2e is load-bearing, not optional — each rendered view + each override button ships a Playwright golden-path spec (per the stub's captured expectation); Standard Experience Checklist categories mostly NOT `n/a`.
  - **Area (required, tag):** test-discipline / e2e

- [2026-06-14] [PM] **Holdings/avg-cost display divergence from Coinbase reality**
  - **Likelihood (required):** low-medium (the dashboard shows a fresh `aggregatePosition` read, but cost-basis aggregation reads a single bounded page of fills — pagination is deferred per CB-4.3's Engineer Decision — so a very long trade history could under-count)
  - **Impact (required):** medium (operator sees a slightly-off avg cost → mild distrust; not a money bug in dry-run)
  - **Mitigation (required):** label the live-state numbers as derived-from-Coinbase-fills; surface `last_close` alongside so the operator can sanity-check; the pagination limit is a known CB-4.3 deferral (CB-4.3 PM Risk #3), inherited + labeled here.
  - **Area (required, tag):** data-accuracy / display

## Researcher Open Questions

- [2026-06-14] **Per-asset PnL in the ledger view — MVP or post-MVP?** Does the operator want computed realized/unrealized PnL per asset in the ledger/live-state views, or just transaction history + holdings for MVP? PnL needs cost-basis + current price (both available) but adds display + correctness surface. Lean: transaction history + holdings for MVP; PnL as a fast-follow if the dry-run review surfaces the need. Closes at `/create-story CB-5.2` (ledger view) with an Engineer/PM DRI Decision.

_(Researcher Q on `account_snapshots` cadence — RESOLVED at promotion; became PM Decision #6.)_

## Stories forecast (decomposed one at a time via `/create-story CB-5`)

- **CB-5.0** — Read model + **live-state view**: shared read fns (`lib/ledger/` or co-located) reusing `aggregatePosition` + session/strategy reads; the live-state Server Component (status, holdings, avg cost, total invested, buy count, session start) + LIVE_MODE banner. e2e: load → assert live-state renders from real data. Likely medium/medium.
- **CB-5.1** — **Decision-trace log view**: `bot_ticks` ⋈ `signals` chronological render with per-asset RSI/MA/decision/reason. Mode context from the LIVE_MODE banner (no per-tick badge — `bot_ticks` records the decision, not the mode; PM Decision #7). e2e: load → assert a tick's reason + signals render. Likely small-medium.
- **CB-5.2** — **Transaction-ledger view**: `orders` (dry_run + live), manual-vs-bot source, status — **including the per-execution paper/live status** (the dry_run/live indicator relocated here from the decision-trace per PM Decision #7, since `orders.status` is where mode is recorded). Closes Researcher Q1 (PnL scope). e2e: load → assert ledger rows render with source + status separation. Likely small-medium.
- **CB-5.3** — **Safe override controls**: pause/resume/reset-session Client Component + `/api/bot/*` route handlers writing `bot_sessions.status` + `override_events`; the no-orders-import invariant test. e2e: golden path per button (UI → API → state). Likely medium.
- **CB-5.4 (maybe)** — real-money override buttons (force-buy/sell-N) — ONLY after the LIVE_MODE flip + an observed real fill (PM Decision #1). Not part of the MVP-completing set.

CB-5.0–5.3 complete the MVP. On the CB-1–CB-4 velocity (every bet 5-20x ahead of stub estimates), the 1wk/medium estimate is likely conservative.

## Defensibility

The decision-trace + reason-string observability is the product's actual moat per [product.md](../../foundation/product.md): a bot the operator can *fully audit* ("why did it buy here?") is what makes the paper→live transition trustworthy. CB-5 is where that observability becomes usable, not just stored.

## Check-in log

| Date | Event | Notes |
|---|---|---|
| 2026-05-31 | Portfolio stub created | CB-5 as the 5th MVP bet; sequential after CB-4; 3wk/low stub estimate. |
| 2026-06-14 | Brief promoted via `/create-brief CB-5` | Promoted in parallel with the CB-4 tail (dependency satisfied — `bot_ticks`/`signals`/`orders` shipped + verified in prod). 6 PM DRI Decisions (safe-controls-first; SSR-per-load; reuse read model; inline styles; parallel_with CB-4; holdings from `aggregatePosition`). 3 PM Risks; 1 Researcher Open Question (PnL scope). 4 MVP stories forecast (CB-5.0–5.3) + a deferred CB-5.4. Estimate refined 3wk/low → 1wk/medium. `architecture_required: false` (foundation architecture + CB-4 data model cover it). Two grounding findings: `account_snapshots` + `override_events` both unpopulated (CB-5 is the first `override_events` writer; holdings come from Coinbase cost-basis). Promotion shipped via PR #66 (1 supplementary-review ISSUE closed — stale CB-4 status-row sweep; Codex was down, re-review retroactive). Awaiting HITL approval before `/create-story CB-5`. |
| 2026-06-14 | **Brief APPROVED** (HITL milestone gate) | Operator authorized at the MVP-transition milestone ("ready to close and move to the next"). `status: proposed → approved`. Unblocks `/create-story CB-5` for CB-5.0 (live-state view + read model). No further HITL gate before `/create-story` per `hitl_level: milestones`. |
| 2026-06-14 | **Brief amended — decision-trace dry-run badge relocated to the ledger** (PM Decision #7) | CB-5.1 story drafting surfaced that `bot_ticks` records the decision, not the execution mode (mode is in `orders.status`). Rather than narrow the brief from the story (Codex PR #70 round-1 BLOCKER, AGENTS.md Principle #16), the owning brief is amended: the per-execution paper/live status moves from the decision-trace (CB-5.1) to the transaction ledger (CB-5.2); the decision-trace keeps mode context via the LIVE_MODE banner. Hypothesis + Scope + CB-5.1/CB-5.2 forecast rows swept; CB-5.1 story now executes the amendment. CB-5.0 shipped (PR #69, Codex-clean first pass). |

## DRI Log

_See PM DRI Decisions + PM Risks + Researcher Open Questions above. Engineer/Designer/UX-Writer decisions are logged per story at `/create-story` + `/build` time._

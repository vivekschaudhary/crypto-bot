---
id: CB-3
type: feature
status: approved
priority: P0
parent: FOUNDATION-PRODUCT
portfolio_stub: false
depends_on: [CB-1, CB-2]
parallel_with: []
architecture_required: false
created: 2026-05-31
promoted: 2026-06-08
author: PM
sources:
  - docs/foundation/product.md
  - docs/foundation/architecture.md
  - docs/foundation/portfolio.md
  - docs/bets/CB-2/brief.md
key_metric:
  name: Strategy-config-write success rate (operator clicks Save → DB row persisted without form-level validation rejection, on operator's first 10 authoring attempts)
  baseline: n/a (greenfield — no strategy authoring UI in production yet)
  target: ">= 95% over the first 10 attempts. Below 95% signals the validation rules are too strict (operator-friction) or too permissive (false-confidence about strategy validity)."
  source: structured-JSON Vercel runtime log emitted by the form's submit handler — same observability pattern shipped in CB-2.5 (`lib/coinbase/trace.ts`); CB-3 reuses the structured-log shape for form submit events.
guardrails:
  - name: Strategy validation completeness (no overlapping/contradictory entry rules; no negative position sizes; per-session caps > 0)
    threshold: 100% of accepted strategies pass the documented validation rules; CI test asserts every rule branch
  - name: Strategy versioning preserves audit (revising a strategy creates a new row; old strategies stay queryable)
    threshold: append-only at the data layer per [architecture.md § Append-only event log](../../foundation/architecture.md#identity-strategy); no UPDATE paths from app code
  - name: Single active strategy per bot session (MVP simplicity)
    threshold: UNIQUE constraint on `(session_id)` for active strategy reference; enforced at DB layer
  - name: Top-5 ranking based on Coinbase's global 24h volume (NOT operator's personal trading volume)
    threshold: ranking algorithm calls `lib/coinbase/getProducts()` + `getProduct(id)` only; no `lib/coinbase/getAccountTradeHistory()` reads; CI test asserts no auth'd-account reads in the top-5 path
measurement_window_days: 7
check_in_cadence: weekly
area_tags: [strategy, ui, validation, dependency-management, data-model]
estimate:
  duration_weeks: 2
  confidence: medium
  refined_by: brief-approval
  refined_at: 2026-06-08
  estimated_start: 2026-06-09
  estimated_end: 2026-06-22
---

# CB-3 — Strategy authoring + top-5 selection

> The bet where the operator's intent becomes a typed config the bot can read. Without CB-3, CB-4's cron tick has nothing to evaluate against — the bot is RSI/MA math with no inputs.

## Problem

The operator needs to author a named DCA strategy: which cryptos to consider (top-5 from CB-2), what RSI thresholds trigger entries (e.g., `RSI < 30 → buy`), what MA conditions reinforce them (e.g., `price < MA20 + RSI < 35`), what take-profit conditions exit positions (e.g., `RSI > 65 + ≥ 1.5% profit → sell 50%`), what per-buy position sizes apply, and what per-session caps prevent runaway deployment.

Today, none of that exists. CB-2 ships the Coinbase wrapper and CB-1 ships passkey auth, but the bot has no config to read. The operator can't author a strategy. CB-4's bot tick is blocked on this bet.

Per [product.md § In scope](../../foundation/product.md#in-scope), the product promises **"signal-driven entries"** and **"take-profit exits"** that the operator configures. Per [product.md § DRI Decision: deterministic signal rules](../../foundation/product.md), ML/AI signal config is explicitly out — the strategy is a typed-rule structure the operator hand-authors. CB-3 is the bet that materializes this.

## User

**Primary user: the operator.** CB-3 is the first UI surface since [CB-1.6](../CB-1/stories/CB-1.6/story.md) (onboarding-UX) — the operator opens a form, picks 5 cryptos from a top-5 selector, authors their rule structure, hits Save. The whole flow happens in the authenticated `/dashboard` Server-Component routes.

**Secondary user: CB-4 (bot runtime, separate bet) as the typed config consumer.** CB-4's `*/15` cron tick reads the active strategy row, evaluates signals against CB-2's market data, emits a decision. CB-3's data model is the contract between operator intent and bot behavior.

CB-5 (dashboard) reads CB-3's strategy rows too — surfaces the active strategy alongside the bot's decision-trace log. CB-3 → CB-4 is the load-bearing flow; CB-3 → CB-5 is informational.

## Why this matters

CB-3 sits on the **critical path** per [plan.md § Full schedule](../../foundation/plan.md#full-schedule) — it's the binding-dep for CB-4 (the bot runtime). CB-2 finished 11 days ahead of v7's estimate (2026-06-08 vs 2026-06-13), pulling CB-3's `estimated_start` from 2026-06-15 to 2026-06-09. If CB-3 also ships ahead of estimate, the MVP target keeps compressing.

CB-3 is also **the first UI re-engagement after 5 stories of pure library code** (CB-2.1–.5). The forward-reference e2e expectation notes added to this stub during CB-2.5 development warned about this exact context loss: static mocks reliably masked real bugs in CB-1.6 (Playwright surfaced 2 production issues — `@simplewebauthn/browser@11` API drift + begin-response shape mismatch). Same risk class applies here.

Getting CB-3's data model right once means CB-4 inherits a stable typed contract for every bot tick. Getting it wrong once means coordinated migrations + cross-bet rewrites of CB-4's tick handler.

## Hypothesis (the bet)

If we ship a strategy-authoring form UI at `/dashboard/strategy` (Server Component shell + Client Component form for editor controls) backed by a `strategies` DB table (append-only revisions; one active per `bot_session`) with deterministic validation rules (RSI thresholds in [0, 100]; MA periods in {5, 10, 20, 50}; position sizes > 0; per-session caps > 0; entry / exit rules don't contradict), driven by a top-5-by-global-24h-volume algorithm that picks the candidate cryptos via CB-2's `getProducts()` + `getProduct(id)`, then **the operator can author + persist a valid strategy within 5 minutes on first attempt; CB-4 can read it as a typed Zod-validated row on every tick; and the "create a strategy" clause of the MVP loop ([product.md](../../foundation/product.md))** is delivered.

## Defensibility

**None.** Per [product.md § Defensibility](../../foundation/product.md#defensibility--moat): RSI/MA are public indicators; Coinbase data is API-public; no proprietary intelligence accrues. The bet's "moat" — to the extent there is one — is the **deterministic-not-ML** posture: when the operator inspects a bot decision via CB-5's dashboard, the strategy's rules are legible (RSI < 30 + price < MA20 → buy) instead of opaque ("the model said buy"). That's process moat for the single operator; not transferable.

**Moat impact (one line):** None. CB-3 enables the loop; it doesn't earn user lock-in beyond the operator's process trust.

## Scope

### In scope

- **Top-5 algorithm** at `lib/strategy/top5.ts`: ranks Coinbase products by 24h volume (per [PM DRI Decision #1 below](#decisions)); calls `lib/coinbase/getProducts()` + `lib/coinbase/getProduct(id)` from CB-2; emits a top-5 list of trading pairs (e.g., `["BTC-USD", "ETH-USD", "SOL-USD", "DOGE-USD", "ADA-USD"]`). NOT cached in DB at MVP (re-runs per dashboard render; CB-2's wrapper handles Coinbase-side caching). Top-5 algorithm is server-side only.
- **Top-5 selection UI** at `/dashboard/strategy` Server Component: surfaces the algorithm's top-5 + lets the operator pick 1-5 of them to include in the strategy. Stores the selection as part of the strategy row.
- **`strategies` DB schema** via a new migration (e.g., `0004-strategies.sql`):
  - Primary key: ULID (per [architecture.md § Identity strategy](../../foundation/architecture.md#identity-strategy))
  - Columns: `id`, `name`, `selected_products` (text[]), `entry_rules` (jsonb — RSI threshold, MA period, MA reinforcement condition), `exit_rules` (jsonb — RSI threshold, min-profit threshold, sell-fraction), `position_size_usd` (numeric), `per_session_buy_count_cap` (int), `per_session_dollar_cap` (numeric), `created_at`, `created_by_user_id`, `superseded_by_strategy_id` (self-FK for versioning)
  - Append-only at app layer (per [architecture.md § Append-only event log](../../foundation/architecture.md#identity-strategy)): no UPDATE paths; revisions create a new row with `superseded_by_strategy_id` set on the old row
  - `bot_sessions.active_strategy_id` (FK to the latest revision; updated when the operator activates a new revision)
- **Strategy authoring form** Client Component (`/dashboard/strategy/_form.tsx`):
  - Name field (string; required)
  - Selected products multi-select (1-5 from the top-5 list; required)
  - Entry rules section (RSI threshold, MA period, optional MA reinforcement)
  - Exit rules section (RSI threshold, min-profit %, sell-fraction)
  - Position size (USD; per-buy amount)
  - Per-session caps (max buys, max dollars deployed)
  - Live preview / validation feedback (inline error messages, not blocking modals)
- **Validation logic** at `lib/strategy/validate.ts`:
  - Zod schema on the form-submitted payload
  - Validation rules: RSI thresholds in [0, 100]; MA periods in {5, 10, 20, 50}; entry RSI < exit RSI; position size > 0; per-session caps > 0
  - Rule-rejection messages mapped to UI inline-error display
- **Server action** at `/dashboard/strategy/_actions.ts`:
  - `saveStrategy(formData)` — validates via Zod; inserts a new `strategies` row; if revising, sets `superseded_by_strategy_id` on the prior row; updates `bot_sessions.active_strategy_id`
- **Structured-log emit** per submit: `{event: "strategy.save", success: boolean, validation_errors?: string[]}` to Vercel runtime logs (reuses CB-2.5's observability pattern)
- **Test coverage:**
  - Unit tests for `lib/strategy/top5.ts` (mocked CB-2 wrapper)
  - Unit tests for `lib/strategy/validate.ts` (all rule branches)
  - Unit tests for the server action (mocked DB)
  - Integration tests against real Coinbase via the top-5 algorithm (operator-gated, like CB-2.3+)
  - **Playwright e2e** for the authoring flow (CB-1.6 lesson load-bearing — see [forward-reference note added to this stub during CB-2.5](#))

### Out of scope (deferred to other bets or follow-ups)

- **CB-4 bot tick** that reads the active strategy + evaluates signals (separate bet)
- **CB-5 dashboard surfaces** beyond the strategy authoring view itself (full bot state + decision-trace log lives in CB-5)
- **Multiple parallel strategies** (operator switches between named strategies) — deferred; MVP is single-active per session; revision via supersession is the versioning model
- **AI/ML signal config** (explicitly OUT per [product.md DRI Decision](../../foundation/product.md))
- **Auto-rebalancing** / portfolio reconciliation
- **Multi-exchange** (Coinbase only at MVP)
- **Strategy import/export** (out-of-MVP per [portfolio.md § Deliberately out](../../foundation/portfolio.md))
- **Auto-suggest strategy parameters** based on the operator's historical Coinbase trade fills — interesting; deferred to post-MVP

## Open questions for Researcher

1. **Top-5 stability cadence**: how often does Coinbase's top-5-by-24h-volume actually churn? If BTC/ETH/SOL/DOGE/ADA are the same week-over-week 95% of the time, the algorithm can be simpler (cached daily). If churn is high, the top-5 selection UI needs to surface "yesterday's top-5 vs today's" to avoid surprising the operator mid-session. (Affects [Story CB-3.1 design](#stories).)
2. **RSI period default**: the product narrative implies operator-configurable, but is there a reasonable default? Coinbase's market data + retail trader conventions suggest `period: 14`; the form should default to 14 with the operator able to override. Need to confirm RSI(14) is sensible against the operator's actual holdings — the operator likely has a target window. Closes during `/build CB-3.3` (form UI story) when defaults are pinned.

## Research findings

Researcher item 1 (top-5 churn) — addressable empirically once CB-3.1 ships and the algorithm runs against live Coinbase data for a week. CB-3.1's integration test logs the top-5 result; check-in 1 captures the variability.

Researcher item 2 (RSI period default) — closes at CB-3.3 form UI design.

## User pain input (from Support)

_n=1 single-operator product — Support pain mirrors the operator's own UX experience. The operator has noted (informally, during foundation review):_

- **The 3Commas form fatigue**: the operator tried 3Commas + bailed because the strategy-config UI is overwhelming (15+ tabs, opaque "DCA" + "GRID" + "Smart Trade" modes). CB-3's authoring form must NOT replicate this. Single form. Single strategy. Inline validation feedback. No multi-tab modal.
- **Coinbase Recurring Buy frustration**: the operator burned half a day on Recurring Buy that fired on rips. CB-3's strategy semantics MUST surface "this strategy only buys on RSI < 30 entries" prominently in the form's review step so the operator can sanity-check before saving.
- **Operator's spreadsheet history**: pre-CB-3, the operator tracked their DCA intent in a Google Sheet (RSI buckets, position sizes, dollar caps). CB-3 replaces that sheet. Form should feel like a structured version of the sheet, not a different paradigm.

## Stories (forecast — decomposed one at a time via `/create-story CB-3`)

_3-4 stories likely. Not authoritative; the workflow estimate model fires the "Stories created" trigger as each story.md file lands._

Expected decomposition (forecast for planning only; not committed scope):

- **CB-3.1 — Top-5 algorithm + first integration against CB-2** — `lib/strategy/top5.ts` ranks Coinbase products by 24h volume; calls `getProducts()` + `getProduct(id)` from CB-2; emits ordered list of 5 trading pairs. Integration test against real Coinbase confirms the top-5 set is stable + makes sense. Server-only — no UI yet.
- **CB-3.2 — `strategies` DB schema + migration + Zod typings** — new migration creates the table; `lib/strategy/types.ts` exports the Zod schemas + inferred types. Wired through `lib/db/migrate.ts` (auto-applies on Vercel production deploys with `MIGRATE_DESTINATION=production`).
- **CB-3.3 — Strategy authoring form UI + save action** — `/dashboard/strategy` Server Component + Client Component form + server action + validation logic + structured-log emit. **First Playwright e2e of CB-3** — operator authors a strategy → save → reload → strategy persists with all rules intact. CB-1.6 lesson applies in force.
- **CB-3.4 — Strategy activation + bot_session wiring** — `bot_sessions.active_strategy_id` is set when the operator activates a saved strategy; transitions from "draft" to "active" persist. Maybe folded into CB-3.3 if scope is small enough; Engineer DRI Decision at /create-story time.

Per [CB-2's actual velocity ≈ 0.6 days/story](../../foundation/plan.md), this likely ships in 2-3 calendar days. Confidence holds at `medium` until first story merges (per workflow estimate model row "First build PR merged").

## Scan summary

- **Last scanned:** n/a (no scan-report yet — first scan happens after first story shipped per `/scan` pattern)
- **Current phase:** brief promotion (HITL approval granted 2026-06-08 — operator-confirmed by firing `/create-brief CB-3`)
- **Open findings:** n/a (no `/scan` run yet)
- **Blocking advance:** no
- **Full report:** [`scan-report.md`](./scan-report.md) (will exist after first `/build` + `/scan CB-3` fires)

## Check-in log

| Date | Phase | Notes |
|------|-------|-------|
| 2026-06-08 | Promotion + HITL approval | Operator fires `/create-brief CB-3` immediately after CB-2 ship (PR #41 merged 2026-06-08). All 4 PM DRI Decisions explicit in the brief. Stories forecast 3-4. Estimate refined from stub (2 wk / `low`) to brief-approval (2 wk / `medium`) — held duration at 2 wk pending build-actuals trigger from CB-3.1 ship. |

## DRI Log

### Decisions

- [2026-06-08] [PM] **Top-5 ranking basis = global 24h volume from Coinbase** — NOT operator's personal trading volume
  - **Rationale (required):** Coinbase's product surface provides 24h volume via `getProduct(id).volume_24h`; that's the canonical signal for "currently liquid trading pairs." Personal trading volume would bias toward what the operator already holds — defeating the purpose (the operator wants the discipline to consider all liquid options, not just their existing holdings). Matches the stub's framing ("review coinbase data to highlight the top 5") explicitly.
  - **Area (required, tag):** product / algorithm
  - **Alternatives considered (required):** rank by operator's personal 24h volume (rejected — bias confirmation); rank by 7-day volume average (rejected — smooths out the signal CB-3 is meant to surface; the operator wants timely "currently liquid" not "stable liquid"); rank by market cap (rejected — proxy for size, not liquidity; less useful for tactical DCA entry decisions); use a pre-curated allowlist (rejected — too operator-opinionated; defeats the discovery purpose)
  - **Reversibility:** trivial (change one line in `lib/strategy/top5.ts`; ranking logic is centralized)

- [2026-06-08] [PM] **Single active strategy per bot session** — multi-active deferred
  - **Rationale (required):** MVP simplicity. Multi-active introduces UI complexity (switcher), data complexity (which session is reading which strategy?), and decision complexity (what if two strategies disagree?). Per [product.md MVP definition](../../foundation/product.md): the loop is "create A strategy, try it with paper money, once comfortable move to real money" — singular. Operator can revise the strategy via supersession (append-only audit; old strategies stay queryable).
  - **Area (required, tag):** product / scope
  - **Alternatives considered (required):** ship multi-active with a UI switcher (rejected — over-scoped for MVP; adds 1+ wk; doesn't pay off until the operator wants A/B-style strategy comparisons, which is a post-MVP affordance); ship single-active but make the schema multi-ready (rejected — speculative scope; adds friction now for an unclear future); ship a draft-and-activate model where the operator can have multiple saved drafts but only one active (deferred — could fold into CB-3.4 if scope allows)
  - **Reversibility:** easy at the data layer (`bot_sessions.active_strategy_id` is already nullable + FK; multi-active would need a join table) — but if a multi-strategy UX surfaces as a real need, it likely involves user-research first

- [2026-06-08] [PM] **Strategy versioning via append-only supersession** — NOT in-place edit
  - **Rationale (required):** [Architecture.md § Append-only event log](../../foundation/architecture.md#identity-strategy) names `strategies` as an append-only-at-application-layer table (decision-history immutable). Revising a strategy creates a new row with `superseded_by_strategy_id` linking back; the old row stays queryable so CB-5's dashboard can render historical bot decisions WITH the strategy active at decision-time. Avoids the "what strategy was active when this tick fired?" mystery that plagues mutable-config systems.
  - **Area (required, tag):** data-model / audit
  - **Alternatives considered (required):** in-place UPDATE with a `updated_at` timestamp (rejected — loses the strategy-at-decision-time context CB-5 needs); soft-delete with `deleted_at` (rejected — semantically wrong; old strategies aren't "deleted," they're "superseded"); fully-versioned table separate from active-state table (rejected — adds join complexity for marginal benefit at MVP scale)
  - **Reversibility:** hard once CB-4 + CB-5 consume the supersession semantics (their reads assume the model). Easy to add now; coordinated rewrite later.

- [2026-06-08] [PM] **`architecture_required: false`** — CB-3 inherits the foundation architecture; no per-bet architecture file needed
  - **Rationale (required):** [Architecture.md § Foundational Data Model](../../foundation/architecture.md#foundational-data-model) already names `strategies`, `bot_sessions`, append-only event log, ULID identity — CB-3's schema is a direct materialization of decisions made there. No new architectural ground.
  - **Area (required, tag):** architectural / scope-boundary
  - **Alternatives considered (required):** require a CB-3 bet-architecture file (rejected — duplicates foundation arch's coverage); defer the call to first story (rejected — `architecture_required: false` is a brief-frontmatter field; setting it now is the honest call)
  - **Reversibility:** trivial — set to `true` later if CB-3 surfaces an architectural decision outside foundation scope

- [2026-06-08] [PM] **`duration_weeks: 2` and `confidence: medium`** at brief-approval — held from stub's 2 wk; confidence advances `low` → `medium`
  - **Rationale (required):** Workflow estimate model: brief-approval → small/medium/large → 1/2/4 weeks. CB-3 with scope = top-5 algorithm + DB schema + form UI + validation logic + activation wiring is **medium** — 4 stories at ~0.6 days/story per CB-2's actuals would be ~2.5 days, but CB-3 is the first UI re-engagement after 5 stories of pure library code so context loss + Playwright e2e work add buffer. Confidence advances from `low` (stub) to `medium` (brief-approval) per the model's confidence-after-trigger column.
  - **Area (required, tag):** scheduling / estimation
  - **Alternatives considered (required):** jump to 1 wk (rejected — CB-2's actual was 3 days for 5 stories, but CB-3's UI work is a different complexity class; holding 2 wk is honest); set confidence: high (rejected — model says brief-approval → medium; high is reserved for build-actuals trigger)
  - **Reversibility:** trivial — next `/plan` after CB-3.1 ships will fire the "Stories created" trigger and recompute

### Risks

- [2026-06-08] [PM] **UI re-engagement context loss — 5 stories of pure library code → first UI surface in CB-3 has elevated bug risk**
  - **Likelihood (required):** medium (the forward-reference e2e expectation note in this stub flagged this risk explicitly during CB-2.5; CB-1.6's history of Playwright catching real bugs is the precedent)
  - **Impact (required):** medium (a UI bug in strategy authoring blocks CB-4 from reading a valid strategy; downstream cascade risk)
  - **Mitigation (required):** AC for CB-3.3 (form UI story) MUST include at least one Playwright e2e covering the operator's golden path (author → save → reload → verify persisted). Engineer DRI Decisions at /create-story time include "Standard Experience Checklist categories not all `n/a`" — most categories are load-bearing for a UI surface. Static mocks alone are insufficient; e2e is load-bearing.
  - **Area (required, tag):** technical / ui-resurfacing

- [2026-06-08] [PM] **Validation rule completeness — overlapping or contradictory rules pass validation, bot fires unexpected orders**
  - **Likelihood (required):** medium-to-high (validation logic complexity; entry vs exit rule interactions; per-session caps interact with position sizes)
  - **Impact (required):** medium (a strategy with overlap/contradiction would surface as unexpected bot behavior in CB-4 — not real-money loss in dry-run, but in `LIVE_MODE` could be real-money harm)
  - **Mitigation (required):** Zod schema + handwritten rule-validation tests cover EVERY documented rule branch; CB-3.3 + CB-3.4 ACs include "every validation rule has a unit test that triggers it" (every false-path is tested). CB-5's dashboard surfaces the strategy's rules verbatim so the operator can sanity-check what they authored before turning `LIVE_MODE=true`. Defense-in-depth via dry-run-first product principle.
  - **Area (required, tag):** validation / safety

- [2026-06-08] [PM] **Top-5 churn surprise — operator authored a strategy when BTC/ETH/SOL/DOGE/ADA was top-5; next day's top-5 is different and operator doesn't notice**
  - **Likelihood (required):** low-to-medium (Researcher Open Question #1 explicitly tracks this; will be addressable empirically)
  - **Impact (required):** low (the operator's selected_products are persisted in the strategy row — bot doesn't auto-rebalance to today's top-5). But surprise-factor exists: operator may think "the bot is trading top-5" when actually it's trading their selected_products which were top-5 last week.
  - **Mitigation (required):** strategy authoring form prominently shows "Selected from top-5 as of YYYY-MM-DD"; CB-5's dashboard surfaces the same; operator can revise the strategy (creates new row via supersession) if they want to update the selected_products against today's top-5.
  - **Area (required, tag):** UX / discoverability

### Issues

- [2026-06-08] [PM] **Two Researcher Open Questions logged above (top-5 churn; RSI period default)** — Researcher fills before CB-3.3 starts
  - **Severity (required, mandatory):** P3 (informational; doesn't block brief approval)
  - **Owner (required, mandatory):** Researcher
  - **Status:** open
  - **Area (required, tag):** research / dependency
  - **Resolution (filled when closed):** Item 1 (top-5 churn) — addressable empirically once CB-3.1 ships + runs against live Coinbase for a week; Item 2 (RSI period default) — closes at CB-3.3 form UI design.

## Fixes (post-merge)

_If post-merge bugs are found, stories are re-opened and fixes live under `docs/bets/CB-3/stories/CB-3.X/fixes/`._

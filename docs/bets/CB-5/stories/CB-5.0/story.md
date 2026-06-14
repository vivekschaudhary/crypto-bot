---
id: CB-5.0
bet: CB-5
type: story
status: ready
priority: P0
created: 2026-06-14
author: PM
design_link: docs/bets/CB-5/stories/CB-5.0/design.md
copy_link: docs/bets/CB-5/stories/CB-5.0/copy.md
area_tags: [dashboard, live-state, read-model, live-mode-banner, server-components, e2e, accessibility]
dependencies:
  - CB-5 brief approved 2026-06-14
  - CB-4 shipped (bot_sessions/orders data + lib/ticks/cost-basis:aggregatePosition + lib/ticks/db reads)
  - CB-3.2 (strategies + bot_sessions.active_strategy_id) + CB-2.3 (getAccountTradeHistory)
  - CB-1.6 (/dashboard auth-gated Server Component shell + proxy.ts gating)
estimate:
  effort: medium
  confidence: medium
e2e: true
---

# CB-5.0 — Dashboard read model + live-state view + LIVE_MODE banner

## Description

The foundation story of CB-5: establish the **dashboard read model** (shared server-only read functions that lift the psql joins used throughout CB-4 verification into reusable code), render the **live-state view** on `/dashboard` (replacing the CB-1.6 placeholder), and ship the **LIVE_MODE banner** that every CB-5 view will share. After this, the operator can open the dashboard and see — without psql — what the bot holds, what it's done this session, and whether real money is in play.

This is the first **UI** story of the project's largest UI surface. Designer + UX Writer engaged ([design.md](design.md), [copy.md](copy.md)). e2e is load-bearing (CB-1.6 lesson — RSC/Client seams need real browser tests), so `e2e: true`.

### Two honest data distinctions this story pins

1. **Holdings come from the operator's REAL Coinbase portfolio** (`aggregatePosition` over `getAccountTradeHistory`, per CB-5 brief PM Decision #6 — `account_snapshots` is unpopulated). Mode-independent: holdings are what the operator actually owns, paper or live.
2. **Session activity (buy count + total invested) INCLUDES `dry_run` rows** — deliberately different from `aggregateSessionTotals` (which excludes `dry_run` for real-money cap protection, CB-4.3). The dashboard must show paper activity during the dry-run window (that's the whole point of the review surface); the LIVE_MODE banner contextualizes whether that activity is paper or real.

## Acceptance Criteria

- [ ] **AC 1 — Read model `lib/dashboard/live-state.ts`** (server-only) exports `loadLiveState(): Promise<LiveState>` composing:
  - **session**: `{ status: 'active'|'paused'|'reset', startedAt: Date } | null` — extend the `bot_sessions` read to include `started_at` (the existing `loadSingletonSession` returns only id/status/activeStrategyId; add `started_at` here or in a dashboard-scoped read).
  - **holdings**: `Array<{ assetIdentifier, quantity, avgCostUsd }>` — for each `selected_assets[i]` of the active strategy, `aggregatePosition(getAccountTradeHistory({productIds:[id]}).fills)`; assets with `null` position render as "no position".
  - **activity**: `{ buyCount: number, totalInvestedUsd: number }` — count + Σ `amount` of the active session's `orders` where `source='bot'` AND `side='buy'` AND `status <> 'failed'` (**includes `dry_run`** — see Description #2; this is a SEPARATE query from `aggregateSessionTotals`, NOT a reuse).
  - **liveMode**: `boolean` from `env().LIVE_MODE`.

- [ ] **AC 2 — Live-state view on `/dashboard`** (Server Component; SSR per load per brief PM Decision #2): replace the CB-1.6 placeholder paragraph ("Bot controls and decision trace will arrive in the next bet (CB-2)") with the live-state panels — session status + start, holdings (per asset: quantity + avg cost), session activity (buy count + total invested). Preserve the existing chrome (title, Sign Out, strategy link, `?strategy=saved` banner, connected-device line) + the auth gate (proxy.ts; no per-route auth code). Inline styles per the CB-3.3/CB-1.6 convention (no new UI dependency).

- [ ] **AC 3 — LIVE_MODE banner** as a shared Server Component (`app/dashboard/live-mode-banner.tsx` or `lib/dashboard/` co-located) rendered at the top of `/dashboard`, designed for reuse by CB-5.1/5.2/5.3. Reads `env().LIVE_MODE`. **Color-coded AND text-labeled** (never color-only — accessibility): DRY RUN state (calm/neutral) vs LIVE state (high-alert). Copy verbatim from [copy.md](copy.md).

- [ ] **AC 4 — Graceful degradation on Coinbase failure**: holdings require N `getAccountTradeHistory` calls on SSR load; if one (or all) fail, the page STILL renders session status + activity + banner, with the holdings panel showing an error/unavailable state (per [copy.md](copy.md)) — a Coinbase outage must not blank the dashboard. (Mirrors the CB-1.6 best-effort `device_label` pattern.)

- [ ] **AC 5 — Empty/edge states** render correctly: no active session (operator hasn't saved a strategy yet) → "no active session" state + link to author a strategy; active session but zero holdings → "no positions yet"; zero session activity → "no bot orders this session yet". All copy verbatim from [copy.md](copy.md).

- [ ] **AC 6 — READ-ONLY guardrail (all mutations, not just INSERT/UPDATE)**: `/dashboard` performs zero writes of ANY kind against ANY table — no `INSERT`, `UPDATE`, **`DELETE`, `TRUNCATE`, or `UPSERT`/`ON CONFLICT`** SQL — honoring the [architecture append-only event-log invariant](../../../../foundation/architecture.md) (deletes are as forbidden as updates on the event log). CI grep test (extending the CB-4.2 append-only pattern) asserts `app/dashboard/**` + `lib/dashboard/**` contain none of those mutating statements **AND** import no mutating helpers (no `insertTickWithDecisions`, `upsertSingletonBotSession`, `insertStrategy`, `markSuperseded`, or any `/api/bot/*` write fn). The read model is SELECT-only. (PR #68 round-1 BLOCKER: the original AC banned only INSERT/UPDATE, leaving a DELETE path satisfying the story — closed by covering all mutation verbs + mutating-helper imports. Override write paths are CB-5.3.)

- [ ] **AC 7 — No order placement in the dashboard graph** (the CB-5 brief guardrail): `app/dashboard/**` + `lib/dashboard/**` transitive import graph never reaches `lib/coinbase/orders`. CI grep/transitive-walk test (the CB-4.2/4.3 pattern).

- [ ] **AC 8 — e2e Playwright spec** (`e2e/dashboard/live-state.spec.ts`): seed a `bot_sessions` row + bot `orders` rows (dry_run) + mock the Coinbase holdings read; load `/dashboard` → assert session status, holdings, activity (buy count + total invested), and the LIVE_MODE banner all render from the seeded data. **The banner MUST be asserted under BOTH `LIVE_MODE=false` AND `LIVE_MODE=true`** — both states are MANDATORY in this story (per the [CB-5 brief LIVE_MODE guardrail](../../brief.md): "Playwright asserts it under both `LIVE_MODE=false` and `=true`"). This is SAFE to test exhaustively here — the banner is a pure render of `env().LIVE_MODE` and `/dashboard` is read-only (no order placement; the live path is not reachable from this surface), so asserting the LIVE banner risks nothing. Mechanism is Engineer DRI (e.g. a Playwright project/config that boots the app with `LIVE_MODE=true` for the banner case, or a component-level render assertion of both states paired with the e2e default-state assertion) — but BOTH states must be covered, not deferred. (PR #68 round-1 BLOCKER: the original AC made the `true` case optional/deferred, weakening the brief guardrail — closed by making both mandatory.)

- [ ] **AC 9 — Unit tests** for the read model (`tests/lib/dashboard/live-state.test.ts`, recording-mock DB + mocked Coinbase per the `tests/lib/strategies/db.test.ts` pattern): session-activity query INCLUDES `dry_run` (the load-bearing distinction — assert the SQL does NOT exclude `dry_run`, contrast `aggregateSessionTotals`); holdings compose `aggregatePosition` per asset; null position → "no position"; Coinbase failure → holdings degrade without throwing.

- [ ] **AC 10 — Gates**: `pnpm typecheck` zero errors; `pnpm lint` zero warnings; `pnpm test` green (+ the new unit tests); `pnpm build` green; the e2e spec passes locally (`pnpm e2e` or the project's Playwright command).

## Standard Experience Checklist

This is the UI bet — most categories are LOAD-BEARING (not `n/a`), per the CB-5 brief.

- [ ] **Navigation** — `covered: /dashboard is the post-auth home; preserves the strategy-authoring link; the live-state view is the operator's landing surface. CB-5.1/5.2 views link from here (forward-noted).`
- [ ] **States** — `covered by AC 4 + AC 5: loading is SSR (no client spinner); empty (no session / no holdings / no activity); error (Coinbase holdings fetch fails → degraded holdings panel, rest of page intact).`
- [ ] **Feedback** — `covered: the LIVE_MODE banner is the operator's always-on "is real money in play?" feedback (AC 3); holdings + activity render the bot's current reality. Copy verbatim from copy.md.`
- [ ] **Accessibility** — `covered by AC 3 + design.md: banner is text-labeled not color-only; semantic headings per panel; banner carries an appropriate role; color contrast meets WCAG AA (design.md pins the palette). e2e asserts text, not just colour.`
- [ ] **Edge cases** — `covered by AC 4 + AC 5: Coinbase outage, no session, zero holdings, zero activity, a session spanning a paper→live flip (note: activity counts non-failed bot orders regardless of mode; the banner shows CURRENT mode — documented as a known display nuance).`
- [ ] **Cross-surface consistency** — `covered by AC 3: the LIVE_MODE banner + dashboard chrome are built as shared components for reuse across CB-5.1 (decision-trace), CB-5.2 (ledger), CB-5.3 (controls) — consistency is structural, not re-implemented per view.`

## Tech notes

### Engineer DRI Decisions to commit at first build commit
1. **Live-state on `/dashboard`** (replace the CB-1.6 placeholder), reusing the auth-gated shell — not a new route. The placeholder's stale "CB-2" reference is removed.
2. **Read model in `lib/dashboard/live-state.ts`** (server-only). `loadLiveState()` composes the session read (+ `started_at`), per-asset holdings, and the session-activity query.
3. **Holdings from `aggregatePosition`** over real Coinbase fills (PM Decision #6) — N `getAccountTradeHistory` calls on SSR load, bounded (operator-only, on-demand). Parallelize with a small stagger if needed (CB-4.2 fan-out precedent).
4. **Session-activity query INCLUDES `dry_run`** (non-failed bot buys this session) — a NEW query, explicitly NOT `aggregateSessionTotals` (which excludes `dry_run` for caps). This is the load-bearing distinction; AC 9 pins it with a test.
5. **LIVE_MODE banner = shared Server Component** for CB-5.1/5.2/5.3 reuse.
6. **Graceful degradation**: holdings fetch wrapped so a Coinbase failure degrades the holdings panel only (best-effort, CB-1.6 `device_label` precedent), never blanks the page.

### Patterns to mirror at `/build CB-5.0`
- Server Component + inline styles + auth-via-proxy: `app/dashboard/page.tsx` (CB-1.6) + `app/dashboard/strategy/page.tsx` (CB-3.3).
- Read fns + recording-mock tests: `lib/strategies/db.ts` + `tests/lib/strategies/db.test.ts`; `aggregatePosition`: `lib/ticks/cost-basis.ts`.
- e2e: `e2e/dashboard/strategy.spec.ts` (seeding + Playwright golden path).
- Transitive-walk invariant test: `tests/app/api/cron/tick/invariants.test.ts` (no-orders-import).

### What this story does NOT include
- Decision-trace log view (CB-5.1); transaction-ledger view (CB-5.2); override controls (CB-5.3); real-money overrides (deferred CB-5.4).
- Per-asset PnL (Researcher Q1, closes at CB-5.2); current-price / live-value of holdings (avg cost only for MVP).
- Client polling / auto-refresh (brief PM Decision #2).

## DRI Log

### Decisions
- [2026-06-14] [PM] **Session-activity display includes `dry_run`; holdings come from real Coinbase — two deliberately different data sources**
  - **Rationale (required):** the dashboard's purpose is dry-run review, so "buy count / total invested" MUST show paper activity (else it reads 0 during the entire dry-run window and the review surface is useless). That's a different aggregation from the cap-totals (`aggregateSessionTotals`, which excludes `dry_run` to protect real-money caps — CB-4.3). Holdings, separately, are the operator's REAL portfolio (paper trading doesn't change real holdings), sourced from Coinbase per brief PM Decision #6. Conflating the two (e.g., reusing `aggregateSessionTotals`, or deriving holdings from dry_run orders) would either zero-out paper activity or fabricate holdings the operator doesn't own.
  - **Area (required, tag):** read-model / data-honesty
  - **Alternatives considered (required):** reuse `aggregateSessionTotals` for activity (rejected — shows 0 in dry-run); derive holdings from `orders` rows (rejected — dry_run orders aren't real holdings; CB-4 Decision #7 already established Coinbase as the position source)
  - **Reversibility:** trivial — the activity query is a single seam

### Risks
- [2026-06-14] [PM] **Coinbase holdings fetch (N calls on SSR load) fails or is slow** — **Likelihood:** medium · **Impact:** medium (a blank or hung dashboard on a Coinbase outage) · **Mitigation:** AC 4 graceful degradation (holdings panel degrades, page renders); bounded N (operator's 1-5 selected assets, on-demand) · **Area:** reliability / external-dep
- [2026-06-14] [PM] **e2e RSC/Client + DB-seeding fragility** (CB-1.6 lesson) — **Likelihood:** medium · **Impact:** medium · **Mitigation:** AC 8 real Playwright spec with seeded DB + mocked Coinbase; not mocks-only · **Area:** test-discipline
- [2026-06-14] [PM] **avg-cost under-count from the cost-basis pagination window** (inherited from CB-4.3) — **Likelihood:** low-medium · **Impact:** low (mild display inaccuracy, dry-run) · **Mitigation:** label holdings as derived-from-Coinbase-fills (copy.md); inherited known limitation · **Area:** data-accuracy

### Issues
_None at story creation._

## Tests
_Unit: `tests/lib/dashboard/live-state.test.ts` (read model). e2e: `e2e/dashboard/live-state.spec.ts`. Invariant: extend the no-orders-import + append-only grep to cover `app/dashboard/**` + `lib/dashboard/**`._

## PRs
_Auto-populated as PRs open._

---
_Story closed: <pending>, brief: docs/bets/CB-5/brief.md_

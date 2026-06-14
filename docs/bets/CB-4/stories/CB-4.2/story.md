---
id: CB-4.2
bet: CB-4
type: story
status: done
priority: P0
created: 2026-06-11
shipped: 2026-06-13
shipped_pr: 63
verified_in_prod: "2026-06-13 — 84 ticks / 0 errors / 100% tick reliability over ~21h; first row 2026-06-12 21:45 UTC, dry-run, real top-5 portfolio. Production-only-defect class (CB-3 retro watch) did NOT recur."
author: PM
design_link: n/a — server-side cron handler; no UI surface (CB-4.0/4.1 precedent)
area_tags: [bot-runtime, cron, tick-handler, schema-migration, cost-basis, structured-log, append-only-audit, dry-run]
dependencies:
  - CB-4 brief approved 2026-06-09 (PR #56); PM Decisions #7 + #8 logged 2026-06-11 (PR #61)
  - CB-4.0 shipped 2026-06-09 (PR #58 — rsi() + ma() pure functions)
  - CB-4.1 shipped 2026-06-11 (PR #60 — evaluate() decision engine)
  - CB-2.2 getProductCandles + CB-2.3 getAccountTradeHistory (Coinbase wrapper)
  - CB-3.2 strategies persistence + upsertSingletonBotSession
estimate:
  effort: medium
  confidence: medium
e2e: false
---

# CB-4.2 — Cron tick handler (compose signals + decisions → persist decision trace; dry-run only)

> **SHIPPED + VERIFIED 2026-06-13 (PR #63).** Production verification (story PM Risk #1 — first live cron exercise) passed: **84 ticks, 0 errors, 100% tick reliability over ~21h** (first row 2026-06-12 21:45 UTC; 420 signal rows = exactly 5/tick; all `tick_started_at` on clean :00/:15/:30/:45 boundaries; `live_mode=false`; ~2.4s/tick vs the 60s ceiling; rate-limit headroom intact at 29/30). Decisions ran the real signal math against the operator's real top-5 portfolio (BTC/ETH/ZEC/XRP/SOL), including a live ETH `position open` via cost-basis aggregation and the CB-4.1 round-2 amended `exit rsi condition met … but no open position` reason on SOL. **The CB-3-retro production-only-defect class did NOT recur.**

## Description

Replace the heartbeat stub at `app/api/cron/tick/route.ts` with the **real bot tick**: the `*/15` Vercel cron invocation that reads the operator's active strategy, fetches market data + position state from Coinbase, computes RSI/MA via CB-4.0, evaluates decisions via CB-4.1, and persists the full decision trace to the append-only event log. **Dry-run only** — no order placement in this story; the `LIVE_MODE` gate at order placement is CB-4.3.

This is the story where the [bot tick reliability fitness function (≥ 99% of scheduled ticks)](../../../../foundation/architecture.md#fitness-functions) **starts being measured for real** — the first `bot_ticks` rows ever written. It's also the first live cron exercise in CB-4, so the production-only-defect class from the [CB-3 retro](../../../../retros/2026-06-09-cb-3-production-only-defects-retro.md) is on explicit watch.

### Headline design finding: the CB-1-era schema predates multi-asset strategies

During story drafting, the PM verified the `0001-init.sql` event-log tables against CB-4.1's shipped contract and found **three structural mismatches**:

1. `bot_ticks` carries ONE `decision` + ONE `reason` per tick — but CB-4.1's `evaluate()` returns one `DecisionResult` PER ASSET (`selected_assets` is 1-5 assets).
2. `signals.kind` has `CHECK (kind IN ('RSI', 'MA20'))` — hardcodes MA20; CB-3.0's `MaPeriodSchema` allows `{5, 10, 20, 50}`.
3. `signals.value` is `numeric NOT NULL` — cannot represent CB-4.0's null sentinel (insufficient bars), and `signals.asset_id REFERENCES assets(id)` FKs a dimension table nothing populates.

**All three tables are EMPTY in production** (the cron has been heartbeat-only since 2026-05-31; zero `bot_ticks` / `signals` / `orders` rows exist). A reshape migration is therefore zero-data-risk. **The new shape is owned by the upstream artifact**: [architecture.md's `Signal` entity amendment (DRI Log 2026-06-11)](../../../../foundation/architecture.md#dri-log), landed in this same PR per AGENTS.md Principle #16 — PM DRI Decision #1 below covers execution only. The brief's Hypothesis sentence is amended in this same PR too (cross-artifact sweep).

### After this story

- **CB-4.3** adds the `LIVE_MODE` gate + order placement + `orders` ledger writes for BOTH modes (per [brief PM Decision #8](../../brief.md#decisions))
- **CB-5** reads `bot_ticks` + per-asset `signals` rows to render the decision-trace dashboard
- The operator can watch real dry-run decision traces accumulate against their REAL portfolio (cost basis from Coinbase per [brief PM Decision #7](../../brief.md#decisions)) — the ≥ 60 dry-run sessions guardrail clock starts

## Acceptance Criteria

- [ ] **AC 1 — Migration `0005-multi-asset-tick-decisions.sql`** reshapes `signals` into per-asset decision rows:
  - New shape: `id text PK`, `tick_id text NOT NULL REFERENCES bot_ticks(id)`, `asset_identifier text NOT NULL` (e.g., "BTC-USD"; matches `strategy-core` `Asset.identifier` — the `assets(id)` FK is DROPPED, nothing populates that dimension table), `decision text NOT NULL CHECK (decision IN ('buy','sell','hold'))`, `reason text NOT NULL`, `rsi numeric NULL`, `ma numeric NULL`, `ma_period int NULL`, `last_close numeric NULL`, `created_at timestamptz NOT NULL DEFAULT now()`.
  - `rsi`/`ma` are NULLABLE — CB-4.0's insufficient-bars sentinel persists honestly (a `signals` row with `rsi=NULL` + the hold reason is the operator's audit record of WHY the bot held).
  - Old `kind`/`value` columns dropped (tables empty; zero data loss — migration comment documents the verification).
  - `bot_ticks` keeps its existing shape (`decision` becomes the tick-level AGGREGATE per AC 6; `UNIQUE (session_id, tick_started_at)` is preserved — it's the load-bearing cron-overlap defense per the [brief's layered-defense risk entry](../../brief.md#risks)).
  - Migration is append-safe: applied automatically at deploy via `vercel.ts` `buildCommand: "pnpm db:migrate && next build"` (idempotent `_migrations` tracking per CB-1 precedent).

- [ ] **AC 2 — `lib/ticks/db.ts`** (new lib; server-only) exports the tick persistence layer:
  - `loadSingletonSession(): Promise<BotSession | null>` — reads the singleton `bot_sessions` row (+ its `active_strategy_id`); typed `status: 'active' | 'paused' | 'reset'`.
  - `aggregateSessionTotals(sessionId): Promise<SessionTotals>` — sums live-deployment `orders` rows (`source='bot'`, `side='buy'`, `status NOT IN ('failed','dry_run')` per the CB-4.3 PR #65 refinement — see PM DRI Decision #2's superseding note; shipped here as `status != 'failed'`, correct while the table was empty) into `{dollarSpent, buyCount}`. **Note: returns zeros during the CB-4.2 window** (no `orders` writes until CB-4.3).
  - `insertTickWithDecisions(tick, decisions[]): Promise<void>` — single transaction: INSERT one `bot_ticks` row + N per-asset `signals` rows. INSERT-only (append-only invariant; the existing CI grep guardrail extends to the new write paths).

- [ ] **AC 3 — Route composition pipeline** at `app/api/cron/tick/route.ts` (replaces the heartbeat stub; PRESERVES both existing auth gates — `CRON_SECRET` Bearer check returning 401, and the `vercel-cron/` user-agent signal):
  1. Auth gates (unchanged from stub)
  2. `loadSingletonSession()` → if no session OR `status='paused'` OR `status='reset'` → 200 with `{ok: true, skipped: "<reason>"}` + structured log; NO `bot_ticks` row (a skipped tick is not a decision event — per [brief PM Decision #5](../../brief.md#decisions), paused sessions are respected at the top of the tick)
  3. `getActiveStrategy()` (CB-3.2) → if null → 200 `{ok: true, skipped: "no_active_strategy"}` + structured log
  4. Per asset in `strategy.selected_assets` (parallel fan-out with 100-200ms stagger per the [brief's rate-limit burst-shaping mitigation](../../brief.md#risks)): `getProductCandles` (65 bars, `ONE_HOUR` granularity per CB-4.0 Engineer Decisions #2/#3) + `getAccountTradeHistory` → aggregate fills into `currentPosition: {avgCostUsd, quantity} | null` (per [brief PM Decision #7](../../brief.md#decisions))
  5. `rsi(14, closes)` + `ma(strategy.entry_rules.maPeriod, closes)` (CB-4.0) → build `PerAssetSignal` map
  6. `evaluate(strategy, perAssetSignals, sessionTotals)` (CB-4.1)
  7. `insertTickWithDecisions(...)` — one transaction
  8. Structured-JSON log line + 200 response with per-asset decision summary

- [ ] **AC 4 — `tick_started_at` = the 15-minute floor** of invocation time (e.g., 14:07:33 → 14:00:00). This makes `UNIQUE (session_id, tick_started_at)` a real cron-overlap defense: a double-fired invocation in the same window computes the SAME `tick_started_at` and the second INSERT hits the constraint.

- [ ] **AC 5 — Duplicate-tick handling is LOUD, not silent**: on unique-constraint violation, the handler catches the specific Postgres error (code `23505`), returns 200 `{ok: true, duplicate: true}`, and emits a structured WARN log naming the constraint. **A CI grep test asserts the catch is narrowly scoped** (per the brief's layered-defense item #4: no silent-swallow — a bare `catch {}` around the insert fails the test).

- [ ] **AC 6 — `bot_ticks.decision` aggregate semantics**: `'buy'` if ≥1 per-asset buy, else `'sell'` if ≥1 sell, else `'hold'`. `bot_ticks.reason` = compact per-asset summary (e.g., `"BTC-USD: buy; ETH-USD: hold; SOL-USD: hold"`). The FULL per-asset reasons live in the `signals` rows — the aggregate is a scannable index, not the audit record.

- [ ] **AC 7 — Cost-basis aggregation**: weighted average from `getAccountTradeHistory` fills per asset — `avgCostUsd = Σ(fill_price × fill_qty) / Σ(fill_qty)` over BUY fills net of sells (Engineer DRI at build pins the exact net-position formula + pagination window). Assets with zero fills → `currentPosition: null` (the no-position branch from CB-4.1 AC 8 amended).

- [ ] **AC 8 — Error handling preserves the audit trail**: a per-tick failure (Coinbase fetch throw, evaluation throw) is caught; the handler writes a `bot_ticks` row with `decision='hold'`, `reason='tick_error'`, `error_detail=<message>` (no `signals` rows), returns **500** so the Vercel cron log records a failed invocation (the fitness function counts invocation-vs-success), and emits a structured ERROR log. Per-asset fetch failures fail the WHOLE tick (partial evaluation would mis-state session totals + decision context; all-or-nothing per tick is the honest posture for MVP).

- [ ] **AC 9 — `maxDuration` ceiling**: route exports `export const maxDuration = 60` — the fail-fast layer of the cron-overlap defense (brief layered-defense item #2). A hung Coinbase call cannot push the tick past the next `*/15` window.

- [ ] **AC 10 — `LIVE_MODE` read for LOGGING ONLY**: the structured log + response include `live_mode: true|false` (per the brief's no-order-in-dry-run guardrail audit hook), but NO behavioral branch consults it — order placement doesn't exist in this story. **Architectural test**: the route's module graph must NOT import `lib/coinbase/orders` (transitive walk per the CB-4.0/4.1 invariant-test pattern, scoped to the route + `lib/ticks/`).

- [ ] **AC 11 — Structured-JSON log contract** (one line per tick; CB-2.5 `trace.ts` structured-log precedent): `{event: "bot_tick", tick_id, session_id, tick_started_at, live_mode, duration_ms, decisions: [{asset, decision, reason}], skipped?, error?}`. CB-5's dashboard + the fitness-function measurement both consume Vercel log queries against `event: "bot_tick"`.

- [ ] **AC 12 — Unit tests (~20) with mocked Coinbase wrapper + db layer** covering: 401 on bad/missing secret; paused/reset/no-session/no-strategy early-outs (no tick row written); single-asset happy path (tick + 1 signals row, correct aggregate); multi-asset path (decisions in input order; aggregate semantics 'buy' > 'sell' > 'hold'); insufficient-bars asset persists `rsi=NULL` + hold reason; duplicate tick → 200 `{duplicate: true}` + WARN log; tick error → bot_ticks row with `error_detail` + 500; `tick_started_at` flooring; cost-basis weighted-average math + zero-fills → null position.

- [ ] **AC 13 — CI grep guardrails extended**: append-only test asserts no `UPDATE bot_ticks` / `UPDATE signals` paths exist (the brief guardrail — now load-bearing since writes exist); the no-silent-swallow test from AC 5.

- [ ] **AC 14 — Gates**: `pnpm typecheck` zero errors; `pnpm lint` zero warnings; `pnpm test` ~628 → ~650+; `pnpm build` green. **Cross-artifact sweep in this PR**: brief Hypothesis sentence amended for the new `signals` shape (it currently says "writes a `bot_ticks` row + N `signals` rows (one per asset evaluated)" — which the migration makes TRUE; the amendment documents that per-asset decision+reason live in `signals`, superseding the kind/value framing); status.md CB-4 row updated.

## Standard Experience Checklist

CB-4.2 is a server-side cron handler (no UI surface). **4 of 6 categories `n/a`** + **2 of 6 covered by AC items** (CB-4.0/4.1 corrected-shape precedent).

- [ ] **Navigation** — `n/a — no UI surface; the cron handler is operator-invisible per the brief's User section.`
- [ ] **States** — `n/a — no UI states; the tick's own state taxonomy (ok / skipped / duplicate / error) is pinned by AC 3/5/8 as response + log contract, not rendered UI.`
- [ ] **Feedback** — `n/a — operator-facing feedback is the structured-JSON log (AC 11) + the persisted decision trace; rendered feedback arrives with CB-5's dashboard.`
- [ ] **Accessibility** — `n/a — no rendered UI.`
- [ ] **Edge cases** — `covered by AC 4/5/7/8 — cron double-fire (UNIQUE + floor), duplicate-tick loud handling, zero-fills cost basis, insufficient-bars persistence, whole-tick error rows, maxDuration fail-fast.`
- [ ] **Cross-surface consistency** — `covered by AC 6 + AC 11 — the per-asset signals rows + structured-log contract are the SAME decision-trace surface CB-5 renders; aggregate semantics + input-order preservation keep the dashboard contract stable.`

## Tech notes

### Engineer DRI Decisions to commit at first build commit

1. **15-minute floor implementation** for `tick_started_at` (AC 4) — exact rounding code + timezone posture (UTC; `Date` truncation to the quarter-hour).
2. **Fan-out concurrency shape** — parallel per-asset fetches with 100-200ms stagger (brief burst-shaping mitigation); pin the exact stagger + whether candles and trade-history for one asset run serially or parallel.
3. **Cost-basis net-position formula** (AC 7) — how sells reduce the position (FIFO vs weighted-average reduction); pagination window for `getAccountTradeHistory` (how far back to read fills).
4. **Postgres error-code matching** for the duplicate catch (AC 5) — `23505` detection via the postgres.js error shape.
5. **Response status taxonomy** — 200 for ok/skipped/duplicate, 401 unauthorized, 500 tick-error (AC 8 rationale: Vercel cron logs count non-2xx as failed invocations; the fitness function needs that signal).

### Patterns to mirror at `/build CB-4.2`

1. **Transactional write** — `sql.begin(...)` per `upsertSingletonBotSession` (CB-3.2 precedent in `lib/strategies/db.ts`).
2. **Invariant tests** — transitive-walk no-orders-import test per CB-4.0/4.1 `no-coupling.test.ts` shape; append-only grep test per the existing CI guardrail pattern.
3. **Structured log** — CB-2.5 `lib/coinbase/trace.ts` single-line JSON precedent.
4. **Migration discipline** — `0004-strategies.sql` (CB-3.2) precedent: header comment with bet/story attribution + rationale; idempotent application via `_migrations` tracking.
5. **Mock-based route testing** — CB-3.2/3.3 server-action test precedent (`vi.mock` the wrapper + db modules).

### What this story does NOT include

- `LIVE_MODE` gate + order placement + `orders` writes (both modes) — CB-4.3 (per brief PM Decision #8)
- Take-profit polish — CB-4.4 (maybe)
- Override semantics (pause/resume is RESPECTED here via early-out, but the controls that SET those statuses are CB-5)
- Gated live-Coinbase integration test for the full tick — deferred to CB-4.3's triple-gated real-order test session (the wrapper functions already have live coverage from CB-2.2/2.3)
- Researcher Q3 (limit-order slippage) — closes at CB-4.3

## DRI Log

### Decisions

- [2026-06-11] [PM] **Migration 0005 EXECUTES the upstream `Signal` entity amendment** (the schema decision itself is owned by [architecture.md DRI Log 2026-06-11 entry](../../../../foundation/architecture.md#dri-log), amended in this same PR per AGENTS.md Principle #16 after Codex's PR #62 round-1 escalation)
  - **Rationale (required):** This story's original draft pinned the new `signals` shape story-locally; Codex correctly flagged that `docs/foundation/architecture.md` owns the entity definition (entity table + ER diagram both still said `asset_id + kind + value`). Per Principle #16 the upstream artifact is amended FIRST (Enterprise/Solution Architect amendment, same PR), and this story decision narrows to execution: ship `0005-multi-asset-tick-decisions.sql` implementing the amended shape, with `bot_ticks` untouched (its `decision` CHECK serves the aggregate; `UNIQUE (session_id, tick_started_at)` stays load-bearing for cron-overlap defense). Full shape rationale + alternatives live at the architecture DRI entry.
  - **Area (required, tag):** schema-execution / upstream-first / append-only-audit
  - **Alternatives considered (required):** keep the schema decision story-local (rejected — violates Principle #16; the architecture artifact would silently drift from the physical schema, which is exactly the `[cross-artifact-sweep-on-contract-shift]` failure mode at the foundation layer); defer the migration to a standalone ops PR before this story (rejected — the migration has no consumer until this story's writes exist; shipping them together keeps the schema + first-writer atomic)
  - **Reversibility:** low-cost now (empty tables), expensive later — this is exactly the right time to fix the shape, before the first real rows land
- [2026-06-11] [PM] **`sessionTotals` aggregates from `orders` only; returns zeros during the CB-4.2 window**
  - **⚠️ SUPERSEDED 2026-06-14 by CB-4.3 PR #65 round-1 BLOCKER:** the predicate shipped here as `status <> 'failed'` (correct while `orders` was empty), but CB-4.3 introduced `dry_run` rows — counting them would let paper trading exhaust the real-money caps. The live predicate is now `status NOT IN ('failed', 'dry_run')` (caps count REAL deployed capital only). See `lib/ticks/db.ts:aggregateSessionTotals` + `tests/lib/ticks/db.test.ts`. This note exists to prevent doc-drift; the code is the source of truth.
  - **Rationale (required):** The decision engine's cap enforcement consumes `{dollarSpent, buyCount}`. The honest source is the `orders` ledger (`source='bot'`, `side='buy'`, session-scoped, **live-deployment rows only** per the superseding note above) — which is empty until CB-4.3 starts writing rows (both modes, per brief PM Decision #8). During the CB-4.2-only window, caps therefore never suppress — acceptable because dry-run places no orders and risks no capital; the caps guardrail is load-bearing for `LIVE_MODE`, which doesn't exist until CB-4.3 ships WITH the ledger writes that make the caps live.
  - **Area (required, tag):** correctness / cap-enforcement / data-source
  - **Alternatives considered (required):** count buy DECISIONS from prior `signals` rows × `position_size_usd` (rejected — position size can change across strategy supersession; would mis-state dollarSpent; decisions ≠ transactions); defer all cap inputs to CB-4.3 by passing zeros literally (this IS effectively that, but routed through the real aggregation function so CB-4.3 changes nothing in the route — the query just starts returning rows)
  - **Reversibility:** trivial — the aggregation function is the single seam
- [2026-06-11] [PM] **Skipped ticks (paused/reset/no-session/no-strategy) write NO `bot_ticks` row**
  - **Rationale (required):** `bot_ticks` is the DECISION event log; a skipped tick made no decision. The skip is still observable: structured log line with `skipped: "<reason>"` (AC 11) + the Vercel cron invocation record. The fitness function compares cron invocations vs successful executions — a skip is a successful execution (200), not a reliability failure. Writing skip rows would also burn `UNIQUE (session_id, tick_started_at)` slots in ways that complicate the overlap defense (a paused-skip and a later manual replay in the same window would conflict).
  - **Area (required, tag):** observability / event-log-semantics
  - **Alternatives considered (required):** write skip rows with a `skipped` status (rejected — requires widening the `decision` CHECK; pollutes the decision trace CB-5 renders; the log line already covers audit)
  - **Reversibility:** trivial — additive change later if CB-5 wants queryable skips

### Risks

- [2026-06-11] [PM] **First live cron exercise — production-only-defect class** (per the [CB-3 retro watch-list](../../../../retros/2026-06-09-cb-3-production-only-defects-retro.md))
  - **Likelihood (required):** medium — CB-3 shipped 3 production-only defects invisible to local gates; this story adds Vercel-runtime-specific surface (cron headers, maxDuration behavior, env at edge of build vs runtime)
  - **Impact (required):** medium (dry-run only — no capital at risk; worst case is missing/garbled tick rows + a fitness-function false start)
  - **Mitigation (required):** post-merge deploy verification step in the PR test plan — operator (or Engineer via Vercel logs) confirms the first 2-3 real cron ticks write correct rows + logs before calling the story closed; the structured-log contract (AC 11) makes this a 2-minute log query
  - **Area (required, tag):** production-runtime / cron
- [2026-06-11] [PM] **Coinbase fan-out latency tail pushes tick toward `maxDuration`**
  - **Likelihood (required):** low-medium (5 assets × 2 calls; CB-2.5 traces show p50 ~200-400ms/call; tail risk is Coinbase degradation)
  - **Impact (required):** medium (tick killed at 60s → error row + 500 → fitness-function miss; repeated misses breach the ≥ 99% target)
  - **Mitigation (required):** parallel fan-out with stagger (Engineer Decision #2) keeps happy-path well under 10s; `maxDuration=60` converts a hang into a clean failure rather than an overlap; `duration_ms` in the structured log gives the operator tail visibility from tick #1
  - **Area (required, tag):** latency / rate-limit / cron-overlap
- [2026-06-11] [PM] **`getAccountTradeHistory` pagination/window under-counts cost basis**
  - **Likelihood (required):** medium (the wrapper's fill-history window + pagination behavior against a long-lived account is unverified at this composition layer)
  - **Impact (required):** medium (wrong `avgCostUsd` → wrong profit% → wrong sell/hold in the decision trace; in dry-run this is a trust bug, not a money bug — but it propagates to CB-4.3 if unfixed)
  - **Mitigation (required):** Engineer Decision #3 pins the window explicitly at build; unit tests pin the weighted-average + net-position math; the per-asset `signals` row persists `last_close` so the operator can spot-check profit claims against their Coinbase statement
  - **Area (required, tag):** correctness / cost-basis

### Issues

_None at story creation. Engineer adds as discovered during /build._

## Tests

_~20 unit tests (mocked wrapper + db) at `tests/app/api/cron/tick/*.test.ts` + `tests/lib/ticks/*.test.ts`, + 2 invariant/grep tests (no-orders-import walk; no-silent-swallow + append-only grep). Suite ~628 → ~650+._

## PRs

_Auto-populated as PRs open._

---

_Story closed: <pending>, brief link: docs/bets/CB-4/brief.md, retro watch: docs/retros/2026-06-09-cb-3-production-only-defects-retro.md (first live cron exercise — production-only-defect class on explicit watch)_

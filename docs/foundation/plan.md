---
id: PROJECT-PLAN
type: plan
version: 1
status: living
created: 2026-05-31
last_refreshed: 2026-05-31
parent: FOUNDATION-PRODUCT
---

# Project Plan

> Living, time-bound schedule for the MVP bet wedge. Derived from per-bet artifacts; refreshed by `/plan`. Never hand-edited — re-run `/plan` to refresh.

**Last refreshed:** 2026-05-31 (version 1 — seed run)

## Currently in flight

_None — MVP wedge approved 2026-05-31, no stubs promoted yet. First two promotions (CB-1 + CB-2) can start in parallel as soon as the operator runs `/create-brief CB-1` and `/create-brief CB-2`._

| Bet | Title | Phase | Actual start | Estimated end | Owner |
|-----|-------|-------|--------------|---------------|-------|

## Next up (unblocked, not yet started)

Bets whose dependencies are satisfied (or have none) but the bet itself hasn't been promoted from stub yet.

| Bet | Title | Estimated start | Estimated duration | Confidence |
|-----|-------|-----------------|---------------------|------------|
| [CB-1](../bets/CB-1/brief.md) | Passkey authentication | 2026-06-01 | 2 weeks | low |
| [CB-2](../bets/CB-2/brief.md) | Coinbase data + top-5 discovery | 2026-06-01 | 2 weeks | low |

## Blocked

Bets waiting on dependencies, HITL approval, or external input.

| Bet | Title | Blocked by | Since | Mitigation |
|-----|-------|------------|-------|------------|
| [CB-3](../bets/CB-3/brief.md) | Strategy authoring + persistence | CB-1, CB-2 | 2026-05-31 | Unblocks naturally when Day-1 stream lands. Stub estimate-only until promoted. |
| [CB-4](../bets/CB-4/brief.md) | DCA bot runtime | CB-2, CB-3 | 2026-05-31 | Unblocks when CB-3 completes (CB-3 is the binding dep — CB-2 finishes earlier). |
| [CB-5](../bets/CB-5/brief.md) | Transaction ledger + dashboard + override buttons | CB-1, CB-4 | 2026-05-31 | Unblocks when CB-4 completes (CB-4 is the binding dep — CB-1 finishes much earlier). |

## Done

_None yet._

| Bet | Title | Actual end | Duration (actual vs estimated) |
|-----|-------|------------|-------------------------------|

## Full schedule

Every MVP bet with all date columns. Source of truth for downstream tools.

| Bet | Title | Depends on | Est. start | Est. end | Actual start | Actual end | Duration (wk) | Confidence | Last refined by |
|-----|-------|------------|------------|----------|--------------|------------|---------------|------------|-----------------|
| [CB-1](../bets/CB-1/brief.md) | Passkey authentication | — | 2026-06-01 | 2026-06-14 | — | — | 2 | low | stub |
| [CB-2](../bets/CB-2/brief.md) | Coinbase data + top-5 discovery | — | 2026-06-01 | 2026-06-14 | — | — | 2 | low | stub |
| [CB-3](../bets/CB-3/brief.md) | Strategy authoring + persistence | [CB-1, CB-2] | 2026-06-15 | 2026-06-28 | — | — | 2 | low | stub |
| [CB-4](../bets/CB-4/brief.md) | DCA bot runtime | [CB-2, CB-3] | 2026-06-29 | 2026-07-19 | — | — | 3 | low | stub |
| [CB-5](../bets/CB-5/brief.md) | Transaction ledger + dashboard + override buttons | [CB-1, CB-4] | 2026-07-20 | 2026-08-09 | — | — | 3 | low | stub |

**MVP completion target:** 2026-08-09 (10 weeks from 2026-06-01). All confidence values are `low` — these are stub estimates from default 2/3-week durations. Confidence sharpens as each stub is promoted via `/create-brief`.

## Calendar view

```
Week of:               | Wk 1    | Wk 2    | Wk 3    | Wk 4    | Wk 5    | Wk 6    | Wk 7    | Wk 8    | Wk 9    | Wk 10   |
                       | 06-01   | 06-08   | 06-15   | 06-22   | 06-29   | 07-06   | 07-13   | 07-20   | 07-27   | 08-03   |
-----------------------|---------|---------|---------|---------|---------|---------|---------|---------|---------|---------|
CB-1 (auth)            |  ██     |  ██     |         |         |         |         |         |         |         |         |
CB-2 (data + top-5)    |  ██     |  ██     |         |         |         |         |         |         |         |         |
CB-3 (strategy)        |         |         |  ██     |  ██     |         |         |         |         |         |         |
CB-4 (bot runtime)     |         |         |         |         |  ██     |  ██     |  ██     |         |         |         |
CB-5 (ledger + dash)   |         |         |         |         |         |         |         |  ██     |  ██     |  ██     |
```

Critical path: CB-2 → CB-3 → CB-4 → CB-5 (10 weeks, single-thread after Stream 1). CB-1 finishes on the same date as CB-2 but isn't on the critical path (it's a parallel companion).

## Refinement log

Each time a date moves, write a line here naming the triggering artifact. Seed run — every row below is the initial set.

| Date | Bet | Field changed | From | To | Triggered by |
|------|-----|---------------|------|-----|--------------|
| 2026-05-31 | CB-1 | estimated_start | — | 2026-06-01 | initial seed from [portfolio.md](portfolio.md) dep graph + stub default (2 wk) |
| 2026-05-31 | CB-1 | estimated_end | — | 2026-06-14 | initial seed |
| 2026-05-31 | CB-2 | estimated_start | — | 2026-06-01 | initial seed from [portfolio.md](portfolio.md) dep graph + stub default (2 wk) |
| 2026-05-31 | CB-2 | estimated_end | — | 2026-06-14 | initial seed |
| 2026-05-31 | CB-3 | estimated_start | — | 2026-06-15 | initial seed; gated on CB-1 + CB-2 (both 06-14) per [portfolio.md](portfolio.md) deps |
| 2026-05-31 | CB-3 | estimated_end | — | 2026-06-28 | initial seed (2 wk stub) |
| 2026-05-31 | CB-4 | estimated_start | — | 2026-06-29 | initial seed; gated on CB-3 (06-28) per [portfolio.md](portfolio.md) deps (CB-2 finished earlier — not binding) |
| 2026-05-31 | CB-4 | estimated_end | — | 2026-07-19 | initial seed (3 wk stub — heavier scope: signals + decisions + cron + dry-run/live gate) |
| 2026-05-31 | CB-5 | estimated_start | — | 2026-07-20 | initial seed; gated on CB-4 (07-19) per [portfolio.md](portfolio.md) deps (CB-1 finished much earlier — not binding) |
| 2026-05-31 | CB-5 | estimated_end | — | 2026-08-09 | initial seed (3 wk stub — heavier scope: ledger + dashboard + override buttons) |

## Risks to plan

- **Stub estimates are low-confidence** — all durations are default 2/3-week stubs. Promotion via `/create-brief <bet-id>` will refine. Expect ± 1 week per bet at the medium-confidence stage; cumulative ± 2-3 weeks on the 10-week MVP target until briefs land.
- **Solo-developer cadence is the wallclock binding constraint** — these dates assume the operator works on the project at a sustained pace. The plan is calibrated to focused-work-weeks, not calendar weeks. Vacation, day-job pressure, or context-switch tax pushes everything proportionally.
- **CB-4 (bot runtime) carries the highest extension risk** — most surface area (pure-function signal calculators + decision evaluator + cron handler + Coinbase order placement gated by `LIVE_MODE`). Estimate may bump to 4 weeks at brief promotion. Documented as the bet most likely to slip the MVP target.
- **Coinbase CDP key provisioning is a Day-1 blocker for CB-2** — operator must have a working CDP key (Trade-only scoped, in CDP JSON format) before CB-2 build starts. Already covered in [docs/ops/runbook.md § 4](../ops/runbook.md). Mitigation: get the key in hand before promoting CB-2.
- **Auto-pause + reserve floor + multi-device passkey deferred to post-MVP** — once MVP completes (target 2026-08-09), three post-MVP bets need scheduling. None of them gates MVP, but they sit immediately after — call them roughly Q3 2026.

## DRI Log

### Decisions

- [2026-05-31] [Project Manager] Use 2026-06-01 (Monday) as the planning start date rather than the Sunday approval date (2026-05-31)
  - **Rationale (required):** week-aligned calendar makes the visualization legible and matches the typical solo-developer working cadence (focused-work weeks starting Monday). The +1 day delay doesn't affect any downstream stub estimate; it's just date hygiene.
  - **Area (required, tag):** scheduling

- [2026-05-31] [Project Manager] **Seed-run schedule uses stub-default durations directly (2 weeks for CB-1/CB-2/CB-3; 3 weeks for CB-4/CB-5)** without further adjustment
  - **Rationale (required):** at stub stage the bets have no refined scope yet — applying judgment to stub estimates would be guessing twice. Confidence is honestly `low` across the board. First refinement happens at brief promotion per the [estimate model in `compass/workflows/plan.md`](../../compass/workflows/plan.md).
  - **Area (required, tag):** scheduling / estimation

### Risks

- [2026-05-31] [Project Manager] **10-week MVP target is built on `low`-confidence stub estimates** — expect cumulative ± 2-3 weeks of slippage as briefs promote
  - **Likelihood (required):** high (this is the normal evolution from stub → brief → architecture → stories)
  - **Impact (required):** low (the target is calendar-coarse; the binding constraint is the operator's focused-work pace, not a fixed external deadline)
  - **Mitigation (required):** re-run `/plan` after each brief approval, architecture approval, and build PR merge — the workflow's estimate-model sharpens each time. Refinement log captures every date movement with a triggering artifact for audit.
  - **Area (required, tag):** scheduling / estimation

- [2026-05-31] [Project Manager] **CB-4 carries the highest single-bet extension risk** — most surface area (signals + decisions + cron + order placement + dry-run/live gate)
  - **Likelihood (required):** medium (bot runtimes routinely extend 1.5x in solo-dev practice)
  - **Impact (required):** medium (CB-4 is on the critical path; a 1-week slip pushes MVP target to 2026-08-16)
  - **Mitigation (required):** scope CB-4 carefully at brief promotion — make the deterministic pure-function modules (`lib/signals/`, `lib/decisions/`) the structural carve-up so each piece is independently testable; consider splitting CB-4 into CB-4a (signals + decisions) and CB-4b (cron + order placement) if scope feels heavy at brief promotion. Architecture for CB-4 should also be considered before stories.
  - **Area (required, tag):** scope / scheduling

### Issues

_None at seed-run stage. Issues will accrue as stubs promote and reality hits the plan._

---

_Living artifact — re-run `/plan` to refresh. Cron-driven refresh available per `compass/config.yaml`._

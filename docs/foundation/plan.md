---
id: PROJECT-PLAN
type: plan
version: 7
status: living
created: 2026-05-31
last_refreshed: 2026-06-06
parent: FOUNDATION-PRODUCT
---

# Project Plan

> Living, time-bound schedule for the MVP bet wedge. Derived from per-bet artifacts; refreshed by `/plan`. Never hand-edited — re-run `/plan` to refresh.

**Last refreshed:** 2026-06-06 (version 7 — second refresh of the day; **first MVP-target compression in the bet's history**. CB-2 brief approved same day as promotion (`/create-brief CB-2` PR #24); the "Brief promoted + approved" trigger row fired, refining CB-2 from stub (2 wk / `low`) to brief-approval (1 wk / `medium`) — scope was chopped to data-layer-only per the operator's HITL Decision #1, justifying the smaller estimate. CB-2.1 story.md also landed in the same PR — fires the "Stories created" trigger for CB-2 as a no-op-net move (max() rule preserves the brief-approval value). Downstream cascade pulls **MVP target from 2026-08-16 to 2026-08-09 — 7 days earlier**.)

## Currently in flight

| Bet | Title | Phase | Actual start | Estimated end | Owner |
|-----|-------|-------|--------------|---------------|-------|
| [CB-2](../bets/CB-2/brief.md) | Coinbase data + top-5 discovery | Brief `approved`; CB-2.1 story `ready`; `/build CB-2.1` is the next workflow (Engineer DRI on SDK pick is the first commit) | — (story-ready; no commits yet) | 2026-06-13 | PM → Engineer |

## Next up (unblocked, not yet started)

Bets whose dependencies are satisfied (or have none) but the bet itself hasn't been promoted from stub yet.

| Bet | Title | Estimated start | Estimated duration | Confidence |
|-----|-------|-----------------|---------------------|------------|

_None — CB-2 (the next-up entry from v6) has moved to In flight via brief approval + story decomposition. CB-3 remains blocked on CB-2 ship._

## Blocked

Bets waiting on dependencies, HITL approval, or external input.

| Bet | Title | Blocked by | Since | Mitigation |
|-----|-------|------------|-------|------------|
| [CB-3](../bets/CB-3/brief.md) | Strategy authoring + persistence | CB-2 (binding-dep from v6 onwards; CB-1 cleared) | 2026-05-31 | Unblocks when CB-2 ships. CB-2's compressed end (2026-06-13) pulls CB-3 start from v6's 2026-06-22 to **2026-06-15** (7-day pull-in). Stub estimate-only until promoted via `/create-brief CB-3`. |
| [CB-4](../bets/CB-4/brief.md) | DCA bot runtime | CB-2, CB-3 | 2026-05-31 | Unblocks when CB-3 completes (CB-3 is the binding dep — CB-2 finishes earlier). |
| [CB-5](../bets/CB-5/brief.md) | Transaction ledger + dashboard + override buttons | CB-4 (CB-1 dep cleared 2026-06-05) | 2026-05-31 | Unblocks when CB-4 completes (CB-4 is the sole binding dep now). |

## Done

| Bet | Title | Actual start | Actual end | Duration (actual vs estimated) | Notes |
|-----|-------|--------------|------------|--------------------------------|-------|
| [CB-1](../bets/CB-1/brief.md) | Passkey authentication | 2026-05-31 | 2026-06-05 | **5 calendar days actual vs 21 estimated (3 wk = brief-approval × stories-refinement max() ceiling)** → 16 days ahead | 7 stories (CB-1.1 through CB-1.6) shipped via PRs #1, #2, #5, #6, #8, #9, #10, #13, #14, #16, #17 + post-merge security follow-up PR #18 (M1+M2 from 2026-06-04 codebase audit) + post-canary follow-ups PRs #20/#21/#22 from the 2026-06-05 canary verification retro. Per-story actual velocity ≈ 0.7 days vs the 3-days/story plan-model default. CB-1 brief frontmatter `estimate.duration_weeks` preserved at 3 (the stories-refinement value at last refresh); `actual_duration_days: 5` captures the actual side-by-side. |

## Full schedule

Every MVP bet with all date columns. Source of truth for downstream tools.

| Bet | Title | Depends on | Est. start | Est. end | Actual start | Actual end | Duration (wk) | Confidence | Last refined by |
|-----|-------|------------|------------|----------|--------------|------------|---------------|------------|-----------------|
| [CB-1](../bets/CB-1/brief.md) | Passkey authentication | — | 2026-05-31 | 2026-06-21 | 2026-05-31 | 2026-06-05 | 3 (est) / 1 (actual ≈ 5 days) | high | stories |
| [CB-2](../bets/CB-2/brief.md) | Coinbase data + top-5 discovery | — | 2026-06-06 | **2026-06-13** | — | — | **1** | **medium** | **brief-approval** |
| [CB-3](../bets/CB-3/brief.md) | Strategy authoring + persistence | [CB-2] (CB-1 cleared) | **2026-06-15** | **2026-06-28** | — | — | 2 | low | stub |
| [CB-4](../bets/CB-4/brief.md) | DCA bot runtime | [CB-2, CB-3] | **2026-06-29** | **2026-07-19** | — | — | 3 | low | stub |
| [CB-5](../bets/CB-5/brief.md) | Transaction ledger + dashboard + override buttons | [CB-4] (CB-1 cleared) | **2026-07-20** | **2026-08-09** | — | — | 3 | low | stub |

**MVP completion target:** **2026-08-09** (**compressed 7 days from v6's 2026-08-16 — first MVP-target compression**). CB-2 brief-approval refined `duration_weeks` from stub 2 → 1 (scope chopped to data-layer-only per [CB-2 brief PM DRI Decision #1](../bets/CB-2/brief.md#decisions)); confidence advanced `low` → `medium`. Cascade pulls all of CB-3 / CB-4 / CB-5 forward by 7 days. **Will further compress if** CB-3 / CB-4 / CB-5 promotions also refine their stubs below current values (likely per CB-1 velocity signal, but no data yet).

## Calendar view

```
Week of:               | Wk 1    | Wk 2    | Wk 3    | Wk 4    | Wk 5    | Wk 6    | Wk 7    | Wk 8    | Wk 9    | Wk 10   |
                       | 06-01   | 06-08   | 06-15   | 06-22   | 06-29   | 07-06   | 07-13   | 07-20   | 07-27   | 08-03   |
-----------------------|---------|---------|---------|---------|---------|---------|---------|---------|---------|---------|
CB-1 (auth) ✓ shipped  |  ██     |         |         |         |         |         |         |         |         |         |
CB-2 (data layer)      |         |  ██     |         |         |         |         |         |         |         |         |
CB-3 (strategy)        |         |         |  ██     |  ██     |         |         |         |         |         |         |
CB-4 (bot runtime)     |         |         |         |         |  ██     |  ██     |  ██     |         |         |         |
CB-5 (ledger + dash)   |         |         |         |         |         |         |         |  ██     |  ██     |  ██     |
```

Note: CB-2's 1-week stub now occupies just Wk 2 (06-08 onward); v6 had it in Wk 2+3. Downstream all pull forward one week. MVP fits in **10 weeks now (was 11 in v6)**. CB-1's actual_start 2026-05-31 (Sunday) → actual_end 2026-06-05 (Friday) = 5 calendar days, entirely within Wk 1 of the visualization.

Critical path: **CB-2 → CB-3 → CB-4 → CB-5** (now 9.5 weeks from CB-2 start 2026-06-06 to CB-5 end 2026-08-09). v6 was 10.5 wk; v7's 7-day compression on CB-2 propagates to the same 7-day savings at the end.

## Refinement log

Each time a date moves, write a line here naming the **triggering artifact** (specific file path or PR URL).

| Date | Bet | Field changed | From | To | Triggered by |
|------|-----|---------------|------|-----|--------------|
| 2026-06-06 | CB-2 | brief status | `proposed` | **`approved`** | Operator HITL approval at `/create-brief CB-2` session (same-day as promotion). Landed in [PR #24](https://github.com/vivekschaudhary/crypto-bot/pull/24) (commit `5b53cb6`). **Fires the "Brief promoted + approved" trigger row** of the workflow estimate model in [`compass/workflows/plan.md`](../../compass/workflows/plan.md). |
| 2026-06-06 | CB-2 | duration_weeks | 2 (stub) | **1** | Per workflow estimate model "Brief promoted + approved" row: `Scope size from brief (small/medium/large) → duration_weeks: 1 / 2 / 4`. CB-2 brief's scope-chop to data-layer-only (per [CB-2 brief PM DRI Decision #1](../bets/CB-2/brief.md#decisions)) makes this **small**. Triggering artifact: [CB-2 brief.md frontmatter](../bets/CB-2/brief.md), `estimate.duration_weeks: 1`. |
| 2026-06-06 | CB-2 | confidence | `low` (stub) | **`medium`** | Same trigger row's "Confidence after" column: brief-approval refinement → `medium`. Triggering artifact: [CB-2 brief.md frontmatter](../bets/CB-2/brief.md), `estimate.confidence: medium`. |
| 2026-06-06 | CB-2 | refined_by | `stub` | **`brief-approval`** | Same trigger; enum advances per workflow estimate model. |
| 2026-06-06 | CB-2 | refined_at | `2026-05-31` (stub date) | **`2026-06-06`** | Date of the brief-approval trigger fire. |
| 2026-06-06 | CB-2 | estimated_end | `2026-06-19` | **`2026-06-13`** | Recomputed from `estimated_start (2026-06-06) + 1 wk = 2026-06-13`. Net: **−6 days** vs v6. |
| 2026-06-06 | CB-2 | story.md count | 0 | 1 | New story.md file: [`docs/bets/CB-2/stories/CB-2.1/story.md`](../bets/CB-2/stories/CB-2.1/story.md) created during `/create-story CB-2` (same PR as brief approval — [PR #24](https://github.com/vivekschaudhary/crypto-bot/pull/24)). **Fires the "Stories created" trigger row.** |
| 2026-06-06 | CB-2 | duration_weeks (post-stories-trigger recompute) | 1 | 1 | Recomputed via "Stories created": 1 × 3 days = 3 days = 0.43 wk. Per [adaptive-decomposition rule](#decisions), `max(0.43, 1) = 1 wk`. Net: **0 days** — max() preserves the brief-approval value. |
| 2026-06-06 | CB-3 | estimated_start | `2026-06-22` | **`2026-06-15`** | Binding-dep CB-2's `estimated_end` moved 06-19 → 06-13; next biz day is Monday 2026-06-15. Net cascade: **−7 days**. |
| 2026-06-06 | CB-3 | estimated_end | `2026-07-05` | **`2026-06-28`** | duration_weeks unchanged at 2 (stub); start shifted −7 days, end shifts −7 days. |
| 2026-06-06 | CB-4 | estimated_start | `2026-07-06` | **`2026-06-29`** | Binding-dep CB-3 shifted; cascade −7 days. |
| 2026-06-06 | CB-4 | estimated_end | `2026-07-26` | **`2026-07-19`** | duration_weeks unchanged at 3 (stub); −7 days cascade. |
| 2026-06-06 | CB-5 | estimated_start | `2026-07-27` | **`2026-07-20`** | Binding-dep CB-4 shifted; cascade −7 days. |
| 2026-06-06 | CB-5 | estimated_end | `2026-08-16` | **`2026-08-09`** | duration_weeks unchanged at 3 (stub); −7 days cascade. **= new MVP target. First MVP-target compression in the bet's history.** |

_v1–v6 entries (2026-05-31 to 2026-06-06) preserved in git history at versions 1–6._

## Risks to plan

- **Per-story velocity 3-days/story model still NOT retuned in v7 despite CB-1's data point** — unchanged from v6's DRI Decision. Watch through CB-2 + CB-3 actuals before considering an adjustment. If CB-2 also ships at <1 day/story (which is what scope-chop + foundation maturity suggests), v8 may justify retuning the model's per-story default downward. Expected outcome: another ~3-7 days compression on MVP target.
- **CB-3/CB-4/CB-5 stub estimates dominate the remaining cascade** — three bets at stub `low` confidence (2 wk + 3 wk + 3 wk = 8 wk total). Each brief-approval will potentially compress further. The highest-leverage next move (after CB-2.1 ships) becomes **`/create-brief CB-3`** to refine CB-3's stub.
- **CB-4 (bot runtime) carries the single-bet extension risk** (unchanged from v1+) — most surface area; may bump to 4 weeks at brief promotion. The most likely individual-bet expansion in the remaining cascade.
- **CDP key provisioning is now an IMMEDIATE blocker for CB-2.1** (was Day-1 blocker; now Day-of) — Engineer cannot run the gated integration test in [CB-2.1 AC 5](../bets/CB-2/stories/CB-2.1/story.md) without a working CDP key in `.env.local`. If the operator has not yet rotated/created a Trade-only CDP key, this blocks CB-2.1's PR. Mitigation: PR #24's status sweep should have surfaced this; operator confirms CDP credentials present before `/build CB-2.1` fires.
- **All v6 forward-watch risks unchanged** — operator-cadence assumption (now genuinely sequential since portfolio has no remaining parallel pairs); post-MVP rails scheduling.
- **Migration 0003 (RLS) still not yet applied to production Supabase** — unchanged from v6 Issue #1. Operator action item open; defense-in-depth gap; doesn't block CB-2 work.

## DRI Log

### Decisions

- [2026-06-06] [Project Manager] **MVP target compresses to 2026-08-09** — first compression in the bet's history. Triggered legitimately by CB-2's brief-approval refinement (`duration_weeks: 2 → 1`, scope chopped to data-layer-only).
  - **Rationale (required):** the workflow estimate model's "Brief promoted + approved" trigger row says `duration_weeks: 1 / 2 / 4` for small/medium/large. CB-2's data-layer-only scope is **small** by any honest reading (wraps an SDK + ships types + tests; CB-1's actual velocity at 0.7 days/story makes 1 week comfortable). Compression is derived, not authored — the brief frontmatter committed to `duration_weeks: 1` at approval; v7 reflects the upstream decision. **First MVP-target compression** is a milestone worth surfacing explicitly in the refresh note (mirroring v5's "first MVP-target slip" framing).
  - **Area (required, tag):** scheduling / cascade-math
  - **Alternatives considered (required):** hold `duration_weeks: 2` despite the scope chop (rejected — would author the date against the brief frontmatter's actual value); push compression to v8 after first build PR merges (rejected — the brief-approval trigger fired NOW; deferring would be silent skip); set duration_weeks: 0.5 to author further compression (rejected — model is integer weeks; CB-1 single-data-point doesn't justify a retune)
  - **Reversibility:** trivial — if CB-2.1 build surfaces unexpected complexity, the "First build PR merged" trigger row fires with `Recompute remaining duration` and v8 can move the dates back

- [2026-06-06] [Project Manager] **Stories-created trigger for CB-2.1 is a no-op-net move via max() rule** — refinement log captures it for audit even though dates don't move
  - **Rationale (required):** workflow estimate model's "Stories created" trigger row fires for each new story.md file. CB-2.1 is the first; 1 × 3 days = 3 days = 0.43 wk. Per the adaptive-decomposition max() rule from v3's DRI Decision (`duration_weeks = max(stories-based, brief-approval)`), `max(0.43, 1) = 1 wk` — brief-approval value preserved. The trigger DID fire; date movement is zero; refinement log captures both for completeness.
  - **Area (required, tag):** scheduling / model-fidelity
  - **Alternatives considered (required):** silently skip the trigger since the date didn't move (rejected — violates "no silent skips" per AGENTS.md principle #3; audit trail benefits from explicit no-op-net entries); shrink duration_weeks to 0.43 wk (rejected — that's a fractional value the integer-week reporting convention doesn't support, AND would author the date below brief-approval ceiling)
  - **Reversibility:** trivial.

### Risks

- [2026-06-06] [Project Manager] **CB-2.1 SDK pick is the single highest-leverage uncertainty in the CB-2 build path**
  - **Likelihood (required):** medium (three viable SDKs; their endpoint-coverage maps may differ in surprising ways at implementation time)
  - **Impact (required):** medium (mid-story SDK swap is a half-day of work + re-running tests; rare in practice but real)
  - **Mitigation (required):** Engineer DRI Decision on CB-2.1's first commit names ONE SDK with documented rationale + alternatives; if a later CB-2.x story surfaces an endpoint the chosen SDK doesn't support, the swap is the Decision-supersession pattern (per Compass append-only DRI convention)
  - **Area (required, tag):** scheduling / technical

- [2026-06-06] [Project Manager] **All v6 risks remain active** — per-story velocity unresolved until CB-2 actuals; stub-confidence cascade through CB-3/CB-4/CB-5; CB-4 single-bet extension risk; post-MVP rails scheduling
  - **Likelihood (required):** see v6 entries
  - **Impact (required):** see v6 entries
  - **Mitigation (required):** unchanged from v6 — re-run `/plan` after each brief approval or major story milestone; refinement log captures every movement
  - **Area (required, tag):** scheduling / estimation

### Issues

- [2026-06-06] [Project Manager] **Migration 0003 (RLS) not yet applied to production Supabase** — unchanged from v6; operator action item still open
  - **Severity (required, mandatory):** P4 (defense-in-depth; no functional impact on MVP or any in-flight work)
  - **Owner (required, mandatory):** operator
  - **Status:** open
  - **Area (required, tag):** security / infra
  - **Resolution (filled when closed):** operator pastes `db/migrations/0003-auth-tables-rls.sql` into Supabase SQL Editor (or runs `pnpm db:migrate`) + verifies via `SELECT tablename, rowsecurity FROM pg_tables WHERE tablename LIKE 'auth_%'` (all four rows should show `rowsecurity = true`). Tracked in conversation TODO.

- [2026-06-06] [Project Manager] **CDP API key Day-of blocker for CB-2.1** — Engineer needs working CDP credentials in `.env.local` to run the gated integration test (AC 5)
  - **Severity (required, mandatory):** P2 (blocks `/build CB-2.1` integration test; doesn't block the PR if integration test is locally-skipped per CB-2.1 PM Risk #2)
  - **Owner (required, mandatory):** operator
  - **Status:** open
  - **Area (required, tag):** infra / dependency
  - **Resolution (filled when closed):** operator confirms CDP key present in local env before `/build CB-2.1` starts. If not yet provisioned: follow [runbook step 4](../ops/runbook.md#4-coinbase-api-key-cdp--trade-only) (Trade-only CDP key creation at portal.cdp.coinbase.com).

---

_Living artifact — re-run `/plan` to refresh. Cron-driven refresh available per `compass/config.yaml`._

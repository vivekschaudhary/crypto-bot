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

Bets with `actual_start` populated and `actual_end` still empty.

| Bet | Title | Phase | Actual start | Estimated end | Owner |
|-----|-------|-------|--------------|---------------|-------|
| [CB-2](../bets/CB-2/brief.md) | Coinbase data + top-5 discovery | 1 of ~5 stories shipped ([CB-2.1](../bets/CB-2/stories/CB-2.1/story.md) via [PR #26](https://github.com/vivekschaudhary/crypto-bot/pull/26)); `/create-story CB-2` for CB-2.2 (`lib/coinbase/market.ts` — public endpoints) is next | 2026-06-06 | 2026-06-13 | PM → Engineer |

## Next up (unblocked, not yet started)

Bets whose dependencies are satisfied (or have none) but `actual_start` is empty. Includes both stub bets and brief-approved-and-story-ready bets that have not yet had a build PR merged.

| Bet | Title | Estimated start | Estimated end | Estimated duration | Confidence | Promotion status |
|-----|-------|-----------------|---------------|---------------------|------------|-------------------|

_None — CB-2 has moved to "Currently in flight" via CB-2.1's PR #26 merge (writes `actual_start = 2026-06-06`; "First build PR merged" trigger fires per the workflow estimate model). CB-3..CB-5 remain in "Blocked"._

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
| [CB-2](../bets/CB-2/brief.md) | Coinbase data + top-5 discovery | — | 2026-06-06 | **2026-06-13** | **2026-06-06** | — | **1** | **high** | **build-actuals** |
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

Each time a date moves, write a line here naming the **triggering artifact** (specific file path or PR URL). Append-only — every row earned during a refresh stays for the life of the artifact.

| Date | Bet | Field changed | From | To | Triggered by |
|------|-----|---------------|------|-----|--------------|
| 2026-06-02 | CB-1 | story.md count | 5 | 6 | New story.md file: [`docs/bets/CB-1/stories/CB-1.5/story.md`](../bets/CB-1/stories/CB-1.5/story.md) created during `/create-story CB-1` for sign-out (commit landed via [PR #14](https://github.com/vivekschaudhary/crypto-bot/pull/14)). Fires the "Stories created" row of the estimate model. |
| 2026-06-02 | CB-1 | duration_weeks | 3 | 3 | Recomputed: 6 × 3 days = 18 days = 2.57 wk. Per adaptive-decomposition rule, `max(2.57, 2) = 2.57 → rounds to 3 wk`. Net date movement: 0 days. Below-3-but-rounds-up case (per v5's forward-watch note). |
| 2026-06-04 | CB-1 | story.md count | 6 | 7 | New story.md file: [`docs/bets/CB-1/stories/CB-1.6/story.md`](../bets/CB-1/stories/CB-1.6/story.md) created during `/create-story CB-1` for first-deploy onboarding UX (commit landed via [PR #17](https://github.com/vivekschaudhary/crypto-bot/pull/17)). Fires the "Stories created" row of the estimate model. |
| 2026-06-04 | CB-1 | duration_weeks | 3 | 3 | Recomputed: 7 × 3 days = 21 days = 3 wk exactly. Per adaptive-decomposition rule, `max(3, 2) = 3 wk`. Net date movement: 0 days. Reaches the firm-3-week mark per v5's forward-watch note ("at story count 7+: max(7 × 3 days, 2 wk) = 3 wk firmly"). |
| 2026-06-05 | CB-1 | actual_end | — | **2026-06-05** | **"All bet stories merged" trigger fires.** Final CB-1 story (CB-1.6) merged 2026-06-04 via [PR #17](https://github.com/vivekschaudhary/crypto-bot/pull/17); post-merge bookkeeping PR [#19](https://github.com/vivekschaudhary/crypto-bot/pull/19) on 2026-06-05 records bet shipped. Per the estimate model: bet's `actual_end` written. Brief frontmatter `estimate.*` fields **NOT overwritten** — the trigger writes `actual_*` only, preserving the last-refinement estimate alongside (see [DRI Decision: estimate-vs-actual coexist](#decisions)). Downstream bets' `estimated_start` shifted by (actual_end − estimated_end) = (2026-06-05 − 2026-06-21) = **−16 days** for any successor that had CB-1 as a binding-dep. Sources: [CB-1 brief frontmatter `actual_end`](../bets/CB-1/brief.md), [PR #19](https://github.com/vivekschaudhary/crypto-bot/pull/19), [memory project_cb1_shipped.md](../../memory/project_cb1_shipped.md). |
| 2026-06-06 | CB-2 | binding-dep status for CB-3 | not-binding | **binding** | CB-1's actual_end (2026-06-05) cleared its dep contribution to CB-3 entirely. CB-3 now depends only on CB-2 (whose stub end 2026-06-19 is the new binding constraint). CB-1 no longer on critical path. |
| 2026-06-06 | CB-2 | estimated_start | 2026-06-01 | **2026-06-06** | Operator-cadence reality: CB-2 was portfolio-planned as Day-1 parallel companion to CB-1 (start 2026-06-01) but operator chose serial execution (CB-1 first). With CB-1 shipped 2026-06-05 and CB-2 not yet started, the honest earliest start for CB-2 is "today" = 2026-06-06. Net 5-day slip vs v5. **Pragmatic-derivation:** strict-literal would keep estimated_start at the historical date and just mark the bet as "late"; v6 instead advances estimated_start to reflect the new earliest-realistic-start. See DRI Decision below for the rule. |
| 2026-06-06 | CB-2 | estimated_end | 2026-06-14 | **2026-06-19** | duration_weeks unchanged at 2 (still stub); start shifted +5 days, end shifts +5 days. |
| 2026-06-06 | CB-3 | binding-dep | CB-1 (v5: est_end 2026-06-21) | **CB-2** (v6: est_end 2026-06-19) | Swap. CB-1 cleared early; CB-2 stub end (06-19) becomes the binding constraint. Critical path entry shifts from CB-1 to CB-2. |
| 2026-06-06 | CB-3 | estimated_start | 2026-06-22 | 2026-06-22 | New binding-dep CB-2 ends 2026-06-19 (Friday); next-day-of-week-start = Monday 2026-06-22. Math holds — net date movement: **0 days**. (If strict-literal day-after were used: 2026-06-20 Saturday → not a reasonable operator-cadence start; Monday convention preserved.) |
| 2026-06-06 | CB-3 | estimated_end | 2026-07-05 | 2026-07-05 | duration_weeks unchanged at 2 (stub); start unchanged; end unchanged. |
| 2026-06-06 | CB-4 | estimated_start | 2026-07-06 | 2026-07-06 | Binding-dep CB-3 end unchanged → CB-4 start unchanged. |
| 2026-06-06 | CB-4 | estimated_end | 2026-07-26 | 2026-07-26 | duration_weeks unchanged at 3 (stub); start unchanged; end unchanged. |
| 2026-06-06 | CB-5 | binding-dep | CB-4 was binding in v5 too; CB-1 dep cleared but wasn't binding in v5 | CB-4 | (Cosmetic — CB-5's binding-dep was already CB-4 in v5. Just notes CB-1 dep is now closed.) |
| 2026-06-06 | CB-5 | estimated_start | 2026-07-27 | 2026-07-27 | Unchanged (v6). |
| 2026-06-06 | CB-5 | estimated_end | 2026-08-16 | 2026-08-16 | Unchanged at v6. **MVP target was 2026-08-16 at end of v6 refresh.** |
| 2026-06-06 | CB-2 | brief status | `proposed` | **`approved`** | _v7 entries begin._ Operator HITL approval at `/create-brief CB-2` session (same-day as promotion). Landed in [PR #24](https://github.com/vivekschaudhary/crypto-bot/pull/24) (commit `5b53cb6`). **Fires the "Brief promoted + approved" trigger row** of the workflow estimate model in [`compass/workflows/plan.md`](../../compass/workflows/plan.md). |
| 2026-06-06 | CB-2 | duration_weeks | 2 (stub) | **1** | Per workflow estimate model "Brief promoted + approved" row: `Scope size from brief (small/medium/large) → duration_weeks: 1 / 2 / 4`. CB-2 brief's scope-chop to data-layer-only (per [CB-2 brief PM DRI Decision #1](../bets/CB-2/brief.md#decisions)) makes this **small**. Triggering artifact: [CB-2 brief.md frontmatter](../bets/CB-2/brief.md), `estimate.duration_weeks: 1`. |
| 2026-06-06 | CB-2 | confidence | `low` (stub) | **`medium`** | Same trigger row's "Confidence after" column: brief-approval refinement → `medium`. Triggering artifact: [CB-2 brief.md frontmatter](../bets/CB-2/brief.md), `estimate.confidence: medium`. |
| 2026-06-06 | CB-2 | refined_by | `stub` | **`brief-approval`** | Same trigger; enum advances per workflow estimate model. |
| 2026-06-06 | CB-2 | refined_at | `2026-05-31` (stub date) | **`2026-06-06`** | Date of the brief-approval trigger fire. |
| 2026-06-06 | CB-2 | estimated_end | `2026-06-19` (v6) | **`2026-06-13`** | Recomputed from `estimated_start (2026-06-06) + 1 wk = 2026-06-13`. Net: **−6 days** vs v6. |
| 2026-06-06 | CB-2 | story.md count | 0 | 1 | New story.md file: [`docs/bets/CB-2/stories/CB-2.1/story.md`](../bets/CB-2/stories/CB-2.1/story.md) created during `/create-story CB-2` (same PR as brief approval — [PR #24](https://github.com/vivekschaudhary/crypto-bot/pull/24)). **Fires the "Stories created" trigger row.** |
| 2026-06-06 | CB-2 | duration_weeks (post-stories-trigger recompute) | 1 | 1 | Recomputed via "Stories created": 1 × 3 days = 3 days = 0.43 wk. Per [adaptive-decomposition rule](#decisions), `max(0.43, 1) = 1 wk`. Net: **0 days** — max() preserves the brief-approval value. |
| 2026-06-06 | CB-3 | estimated_start | `2026-06-22` (v6) | **`2026-06-15`** | Binding-dep CB-2's `estimated_end` moved 06-19 → 06-13; next biz day is Monday 2026-06-15. Net cascade: **−7 days**. |
| 2026-06-06 | CB-3 | estimated_end | `2026-07-05` (v6) | **`2026-06-28`** | duration_weeks unchanged at 2 (stub); start shifted −7 days, end shifts −7 days. |
| 2026-06-06 | CB-4 | estimated_start | `2026-07-06` (v6) | **`2026-06-29`** | Binding-dep CB-3 shifted; cascade −7 days. |
| 2026-06-06 | CB-4 | estimated_end | `2026-07-26` (v6) | **`2026-07-19`** | duration_weeks unchanged at 3 (stub); −7 days cascade. |
| 2026-06-06 | CB-5 | estimated_start | `2026-07-27` (v6) | **`2026-07-20`** | Binding-dep CB-4 shifted; cascade −7 days. |
| 2026-06-06 | CB-5 | estimated_end | `2026-08-16` (v6) | **`2026-08-09`** | duration_weeks unchanged at 3 (stub); −7 days cascade. **= new MVP target. First MVP-target compression in the bet's history.** |
| 2026-06-06 | CB-2 | actual_start | — | **`2026-06-06`** | _v7 post-merge entries begin (post-PR-#27-round-1 review)._ **"First build PR merged" trigger fires.** CB-2.1 story shipped via [PR #26 `fc88b5f`](https://github.com/vivekschaudhary/crypto-bot/pull/26) on 2026-06-06 (same day as brief approval). Per workflow estimate model: write bet's `actual_start` + recompute remaining duration + confidence → `high`. CB-2 brief frontmatter `estimate.actual_start: 2026-06-06` set in the same review-cleanup cycle. |
| 2026-06-06 | CB-2 | confidence | `medium` (brief-approval) | **`high`** | Same "First build PR merged" trigger row — "Confidence after" column advances `medium` → `high` once actual build evidence exists. |
| 2026-06-06 | CB-2 | refined_by | `brief-approval` | **`build-actuals`** | Same trigger; enum advances per workflow estimate model. |
| 2026-06-06 | CB-2 | duration_weeks (post-build-actuals recompute) | 1 | 1 | Recomputed remaining duration: 1 story shipped in ~1 calendar day (CB-2.1: branch created + PR #26 merged same day); 4 stories remaining (.2/.3/.4/.5) at ~1 day each per CB-2.1 actual ≈ 4 more days = ~5 days total. Round to integer weeks: 1 wk. Net movement: **0 days** — held at brief-approval value. Estimated_end stays 2026-06-13; downstream cascade unchanged. (Watch — if CB-2.2/.3 also ship in <1 day each, v8 may compress estimated_end further.) |
| 2026-06-08 | CB-2 | actual_end | — | **2026-06-08** | **"All bet stories merged" trigger fires.** Final CB-2 story (CB-2.5) merged via [PR #41](https://github.com/vivekschaudhary/crypto-bot/pull/41). All 5 stories shipped 2026-06-06 → 2026-06-08 (3 calendar days vs the 1-wk brief-approval estimate). CB-2 brief frontmatter records `actual_end: 2026-06-08` + `actual_duration_days: 3` alongside the preserved estimate.* fields per the [DRI Decision: estimate-vs-actual coexist](#decisions). |
| 2026-06-08 | CB-3 | estimated_start | 2026-06-15 (v7's CB-2-binding-dep cascade) | **2026-06-09** | CB-2 finished 11 calendar days ahead of v7's estimated_end (2026-06-13) → 2026-06-08. CB-3 was binding-dep'd on CB-2 ship; new earliest realistic start = day-after-CB-2-shipped = 2026-06-09. Net 6-day pull-in vs v7's 06-15. |
| 2026-06-08 | CB-3 | estimated_end | 2026-06-28 (v7) | **2026-06-22** | duration_weeks unchanged at 2 (stub); start shifted -6 days, end shifts -6 days. |
| 2026-06-08 | CB-4 | estimated_start | 2026-06-29 (v7) | **2026-06-23** | Same 6-day pull-in cascade from CB-3. |
| 2026-06-08 | CB-4 | estimated_end | 2026-07-19 (v7) | **2026-07-13** | duration_weeks unchanged at 3 (stub); start shifted -6 days, end shifts -6 days. |
| 2026-06-08 | CB-5 | estimated_start | 2026-07-20 (v7) | **2026-07-14** | Same 6-day pull-in cascade from CB-4. |
| 2026-06-08 | CB-5 | estimated_end | 2026-08-09 (v7) | **2026-08-03** | duration_weeks unchanged at 3 (stub); start shifted -6 days, end shifts -6 days. |
| 2026-06-08 | MVP | target_end | 2026-08-09 | **2026-08-03** | Cascade from CB-5's pull-in. **MVP compressed 6 days from v7's 08-09 — second MVP-target compression in the bet's history.** Critical path remains CB-2 → CB-3 → CB-4 → CB-5 (now ~8 weeks from CB-3 start 2026-06-09 to CB-5 end 2026-08-03). |
| 2026-06-08 | CB-3 | brief status | `proposed` (stub) | **`approved`** | Operator HITL approval at `/create-brief CB-3` session 2026-06-08. Fires the "Brief promoted + approved" trigger row. Stub → full brief; awaiting Engineer DRI Decisions to refine estimate from stub-defaults further at first-story time. |
| 2026-06-08 | CB-3 | duration_weeks (post-brief-approval mid-session amendment) | 2 | **3** | Operator chose pluggable strategy authoring architecture (per [CB-3 brief PM DRI Decision #6](../bets/CB-3/brief.md#decisions)). Adds `lib/strategy-core/` foundation story (CB-3.0) — pure interfaces + Zod schemas + `AssetAdapter`; designed for npm package extraction when equity app consumes (precedent: [`@vc1023/passkey-2fa`](https://www.npmjs.com/package/@vc1023/passkey-2fa)). +1 story; +3-5 days; estimate bumped 2 wk → 3 wk. |
| 2026-06-08 | CB-3 | estimated_end (cascade from duration bump) | 2026-06-22 | **2026-06-29** | duration_weeks 2 → 3; start held at 2026-06-09; end shifts +7 days. |
| 2026-06-08 | CB-4 | estimated_start (cascade from CB-3 +7) | 2026-06-23 | **2026-06-30** | CB-3 binding-dep ends +7 days later. |
| 2026-06-08 | CB-4 | estimated_end (cascade from CB-3) | 2026-07-13 | **2026-07-20** | start shifted +7 days; end shifts +7 days. |
| 2026-06-08 | CB-5 | estimated_start (cascade from CB-4) | 2026-07-14 | **2026-07-21** | Same +7 days cascade. |
| 2026-06-08 | CB-5 | estimated_end (cascade from CB-4) | 2026-08-03 | **2026-08-10** | start shifted +7 days; end shifts +7 days. |
| 2026-06-08 | MVP | target_end | 2026-08-03 | **2026-08-10** | Pluggable strategy authoring choice slips MVP target +7 days back to 08-10 — STILL ahead of v6/v7's 2026-08-09 baseline. Operator-accepted trade per CB-3 brief Decision #6 — pluggability saves multi-day extraction effort later when the equity app consumes the shared core. Net trade favorable assuming the equity app reaches that consumption point (per the `@vc1023/passkey-2fa` precedent which the operator has direct evidence of). |

_v1–v5 entries (2026-05-31 to 2026-06-01) preserved in git history at versions 1–5._

## Risks to plan

- **Per-story velocity 3-days/story model still NOT retuned in v7 despite CB-1's data point** — unchanged from v6's DRI Decision (see [Decisions](#decisions) below: "Per-story velocity model NOT retuned in v6"). Watch through CB-2 + CB-3 actuals before considering an adjustment. If CB-2 also ships at <1 day/story (which is what scope-chop + foundation maturity suggests), v8 may justify retuning the model's per-story default downward. Expected outcome: another ~3-7 days compression on MVP target.
- **CB-3/CB-4/CB-5 stub estimates dominate the remaining cascade** — three bets at stub `low` confidence (2 wk + 3 wk + 3 wk = 8 wk total). Each brief-approval will potentially compress further. The highest-leverage next move (after CB-2.1 ships) becomes **`/create-brief CB-3`** to refine CB-3's stub.
- **CB-4 (bot runtime) carries the single-bet extension risk** (unchanged from v1+) — most surface area; may bump to 4 weeks at brief promotion. The most likely individual-bet expansion in the remaining cascade.
- ~~**CDP key provisioning is now an IMMEDIATE blocker for CB-2.1**~~ — **PARTIALLY RESOLVED 2026-06-06.** CB-2.1 shipped via [PR #26](https://github.com/vivekschaudhary/crypto-bot/pull/26) using a public endpoint for the integration test (`/api/v3/brokerage/market/products/BTC-USD` — no auth required), sidestepping the CDP credentials requirement entirely. The gated integration test now smoke-checks the wrapper end-to-end against real Coinbase without needing CDP keys provisioned. **Still required for CB-2.3 (auth'd reads) and CB-2.4 (auth'd writes / place order)** — those stories WILL need CDP credentials in `.env.local` for their integration tests. Tracked as still-open Issue below.
- **All v6 forward-watch risks unchanged** — operator-cadence assumption (now genuinely sequential since portfolio has no remaining parallel pairs); post-MVP rails scheduling. (Live entries in [Risks](#risks) below.)
- ~~**Migration 0003 (RLS) still not yet applied to production Supabase**~~ — **CLOSED 2026-06-06** during this same-day session: operator applied via `pnpm db:migrate` (after baseline-seeding the `_migrations` tracking table for 0001+0002 in Supabase SQL Editor). All four `auth_*` tables now show `rowsecurity = true`. (See [Issues](#issues) below — v6 issue marked closed.)

## DRI Log

### Decisions

- [2026-06-06] [Project Manager] **CB-2's `estimated_start` advances to "today" (2026-06-06) rather than holding at the historical portfolio-planned 2026-06-01** — pragmatic-derivation for operator-cadence slip
  - **Rationale (required):** the workflow's estimate model is silent on what to do when a bet's portfolio-planned start date passes without the bet starting. Two readings: (a) strict-literal keeps `estimated_start` at the historical date and marks the bet "late" (5 days past plan); (b) pragmatic advances `estimated_start` to the new earliest-realistic-start (today). v6 picks (b) because the estimate's purpose is to communicate "when will this finish" not "when did we originally plan it" — the latter is what the refinement log preserves. Strict-literal would force every downstream cascade to compute against a date that's already past, producing dates in the past relative to today, which is not useful for forward planning. The historical date stays preserved in the v5 row of the schedule (and in the refinement-log row that records the move).
  - **Area (required, tag):** scheduling / cascade-math
  - **Alternatives considered (required):** strict-literal (rejected — produces dates in the past, breaks cascade utility); advance estimated_start by the slip delta (e.g., to 2026-06-08 Monday rather than today Saturday) (rejected — Monday-vs-today is a calibration question that the operator should answer at the bet level, not the plan level); add a `slipped_from` field (rejected — schema bloat for a case the refinement log handles)
  - **Reversibility:** trivial — next `/plan` after CB-2 actually starts will move estimated_start to whatever `actual_start` is.

- [2026-06-06] [Project Manager] **CB-1's `estimate.*` fields preserved at last-refinement values; actuals coexist in `actual_*` fields** — supersedes prior "set duration_weeks: 1" decision after Codex review on PR #23
  - **Rationale (required):** the workflow's "All bet stories merged" trigger says **"Write bet's `actual_end`"** — it does NOT say overwrite the `estimate.*` block. The frontmatter's `estimate.duration_weeks` / `estimated_end` represent the last-refinement view (what we predicted when we last refined); `actual_start` / `actual_end` / `actual_duration_days` represent what actually happened. Both coexist so the plan's "Done" table can show estimate-vs-actual side-by-side, and downstream tools that compute slip / variance can read both. The first draft of v6 (PR #23 head before this round-2 push) overwrote `duration_weeks: 3 → 1` and `refined_by: stories → build-actuals` — Codex's round-1 review correctly flagged this left the block internally contradictory (`duration_weeks: 1` paired with the v5-estimate `estimated_end: 2026-06-21` is incoherent for any tool consuming both fields).
  - **Area (required, tag):** scheduling / frontmatter-contract
  - **Alternatives considered (required):** overwrite `estimate.*` with actuals so the block reads as actuals-derived (rejected per Codex — would also require overwriting `estimated_end: 2026-06-21 → 2026-06-05` for internal consistency, AND would lose the estimate-vs-actual comparison the plan's "Done" table needs); add a parallel `actual.*` block parallel to `estimate.*` (rejected — schema bloat for what `actual_start` / `actual_end` / `actual_duration_days` flat fields already cover); leave `refined_by: build-actuals` (rejected — the enum is `stub | brief-approval | architecture | stories | build-actuals`; `build-actuals` is the "First build PR merged" trigger value per the workflow's estimate model row, NOT the "All bet stories merged" value — the latter has `confidence after: n/a (bet done)` and writes only `actual_end`; no enum advance applies)
  - **Reversibility:** trivial — at any future `/plan` refresh, the estimate block can be re-derived if a new trigger fires.
  - **Supersedes:** prior same-day decision below; kept for audit trail per Compass append-only convention.

- [2026-06-06] [Project Manager] **(SUPERSEDED 2026-06-06 — see entry above)** CB-1's `duration_weeks` set to 1 (actual) rather than retaining 3 (v5 stories-based estimate)
  - **Rationale (required):** the workflow estimate model's "All bet stories merged" trigger row says `confidence after: n/a (bet done)` but doesn't specify what to write for `duration_weeks`. First draft argued for actuals on the basis that "leaving the estimate is dishonest." This was wrong: it left the frontmatter internally inconsistent (duration_weeks: 1 alongside estimated_end: 2026-06-21 = 3-week span) and conflated the estimate-vs-actual contract.
  - **Area (required, tag):** scheduling / frontmatter-contract
  - **Alternatives considered (required):** see superseding entry above
  - **Reversibility:** easy
  - **Superseded by:** the decision above (this entry retained per Compass append-only DRI convention).
  - **Surfaced by:** Codex code review of PR #23 round-1 — flagged the internal inconsistency.

- [2026-06-06] [Project Manager] **Per-story velocity model (3 days/story default) NOT retuned in v6 despite CB-1's ~4x discrepancy** — single-data-point doesn't justify model change
  - **Rationale (required):** CB-1 shipped at ~0.7 days/story actual vs the model's 3 days/story default — a 4.3x velocity advantage. Tempting to retune CB-2..CB-5's stub estimates downward. But: (a) it's one data point, (b) CB-1 was authentication — well-trodden patterns, n=1 single-operator scope, no external API integration challenges — which may NOT generalize to CB-2 (Coinbase API surface complexity), CB-3 (strategy authoring UI), CB-4 (bot runtime with real-money guardrails). The model's 3 days/story is a defensive default; downward retune from one favorable bet would author dates. **Watch through CB-2 + CB-3 actuals before considering an adjustment.** If both also ship at <1 day/story, then a v7+ may retune the default to 1.5 or 2 days/story — but with at least 2-3 data points and a documented adjustment.
  - **Area (required, tag):** scheduling / model-calibration
  - **Alternatives considered (required):** retune to 1 day/story immediately (rejected — single data point); retune to 2 days/story as a "split the difference" compromise (rejected — same reason); add a per-bet velocity multiplier field (rejected — schema bloat without data to populate it)
  - **Reversibility:** easy — next /plan after CB-2 + CB-3 ship can retune with two more data points.

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

- [2026-06-06] [Project Manager] **CB-2.1's "First build PR merged" trigger fired same-day as brief approval; plan v7 must reflect both refinements + cascade source-of-truth updates across brief / story / architecture** — closes Codex PR #27 round-1 (re-run on 458bf4e) ISSUE
  - **Rationale (required):** Codex's PR #27 review on commit 458bf4e flagged that plan.md/status.md had drifted from source-of-truth artifacts: status.md claimed CB-2.1 shipped + arch Issue #1 closed, but `docs/bets/CB-2/stories/CB-2.1/story.md` still had `status: ready`, footer "pending", and `docs/foundation/architecture.md` line 689 still showed Issue #1 open. Plan v7 also described pre-PR-#26 state (CB-2 in "Next up" with no commits; CDP creds named as Day-of blocker for CB-2.1). The proper fix per `/plan` workflow is **NOT** to author the closures in derived plan.md/status.md — it's to update the upstream artifacts first, then let plan.md derive. This commit does both: source artifacts get authoritative updates; plan/status reflect them. Refinement log adds the "First build PR merged" trigger rows (post-merge entries marked); Risks/Issues updated to reflect partial resolutions (CB-2.1 done; CB-2.3/2.4 still need CDP).
  - **Area (required, tag):** scheduling / artifact-cascade
  - **Alternatives considered (required):** roll back the status.md closures and re-open everything (rejected — CB-2.1 genuinely shipped; the artifacts SHOULD show it); leave the inconsistency and just file an Issue (rejected — that's the original Codex flag; not fixing it would burn the next review round too); add a "post-merge bookkeeping" PR pattern as standing convention (worth considering for the post-CB-2.1 retro, but doesn't help close this specific review)
  - **Reversibility:** trivial — the cascade math is uniquely determined by which artifacts say what; if a later refresh contradicts this state, it'll surface as a new "First build PR merged" trigger row in the next /plan refresh.

### Risks

- [2026-06-06] [Project Manager] **CB-2 stub-vs-actual delta is now the single highest-leverage uncertainty in the cascade** (v6 entry; v7 PARTIALLY RESOLVED — brief-approval refinement closed the stub-vs-brief delta; build-actuals delta still open)
  - **Likelihood (required):** certain (CB-2 has never been promoted from stub; refinement WILL happen at promotion)
  - **Impact (required):** medium-to-high (CB-2 is now the critical-path entry; ± 1 week here cascades through CB-3, CB-4, CB-5; cumulative MVP-target movement potential ± 1-2 weeks)
  - **Mitigation (required):** prioritize `/create-brief CB-2` as the next workflow invocation. After promotion, `/plan` v7 will refine CB-2 from `low` → `medium` confidence and recompute cascade.
  - **Area (required, tag):** scheduling / cascade-confidence
  - **Resolution status (v7 update):** brief-approval trigger fired on 2026-06-06 (this refresh) → confidence `low` → `medium`; 7-day MVP compression captured. Remaining uncertainty: build-actuals delta when CB-2.1 ships.

- [2026-06-06] [Project Manager] **CB-1 velocity model discrepancy may compound across CB-2..CB-5 OR may be CB-1-specific** — unresolvable until more data
  - **Likelihood (required):** unknown (50/50 — could be operator-specific velocity OR bet-specific complexity)
  - **Impact (required):** if it generalizes, MVP target compresses by ~2 weeks (from 2026-08-16 to ~2026-08-02). If CB-1-specific, no impact.
  - **Mitigation (required):** track per-story velocity on CB-2 explicitly (note actual start/end of each story PR; compute `actual_days_per_story` in CB-2's brief Fixes/Outcomes section at bet end). After CB-2's actuals are in, v7+ can decide whether to retune the default model constant.
  - **Area (required, tag):** scheduling / model-calibration

- [2026-06-06] [Project Manager] **All v5 risks remain active** — stub-estimate slippage on CB-2..CB-5, CB-4 extension risk, CDP key provisioning Day-1 blocker, post-MVP rails scheduling
  - **Likelihood (required):** see v5 entries
  - **Impact (required):** see v5 entries
  - **Mitigation (required):** unchanged from v5 — re-run `/plan` after each brief approval; refinement log captures every movement.
  - **Area (required, tag):** scheduling / estimation

- [2026-06-06] [Project Manager] **CB-2.1 SDK pick is the single highest-leverage uncertainty in the CB-2 build path** (**RESOLVED 2026-06-06**)
  - **Likelihood (required):** medium (three viable SDKs; their endpoint-coverage maps may differ in surprising ways at implementation time)
  - **Impact (required):** medium (mid-story SDK swap is a half-day of work + re-running tests; rare in practice but real)
  - **Mitigation (required):** Engineer DRI Decision on CB-2.1's first commit names ONE SDK with documented rationale + alternatives; if a later CB-2.x story surfaces an endpoint the chosen SDK doesn't support, the swap is the Decision-supersession pattern (per Compass append-only DRI convention)
  - **Area (required, tag):** scheduling / technical
  - **Resolution (filled when closed):** 2026-06-06 — Engineer DRI Decision on PR #26: **no SDK at all.** Direct REST + JWT via `node:crypto`. All three SDK alternatives explicitly rejected. Closes [foundation architecture.md DRI Issue #1](../foundation/architecture.md#issues). New Risk surfaced in its place: EdDSA path unverified for `/api/v3/brokerage/*` endpoints — tracked in CB-2.1 story DRI; resolution deferred to CB-2.5 trace.ts integration test.

### Issues

- [2026-06-06] [Project Manager] **Migration 0003 (RLS) not yet applied to production Supabase** — operator-applied per runbook; defense-in-depth gap until then
  - **Severity (required, mandatory):** P4 (defense-in-depth; no functional impact on MVP or any in-flight work)
  - **Owner (required, mandatory):** operator
  - **Status:** **CLOSED 2026-06-06** (same-day session)
  - **Area (required, tag):** security / infra
  - **Resolution (filled when closed):** 2026-06-06 — operator applied via `pnpm db:migrate` (after one-time baseline-seed of `_migrations` tracking table to mark 0001-init.sql + 0002-auth-users-singleton.sql as already-applied; this was needed because the foundation scaffold landed those migrations manually before the migrate runner existed). Verified with `SELECT tablename, rowsecurity FROM pg_tables WHERE tablename LIKE 'auth_%'` — all four `auth_*` rows return `rowsecurity = true`. Supabase dashboard's "Unrestricted" warning chip cleared.

- [2026-06-06] [Project Manager] **CDP API key Day-of blocker for CB-2.1** — Engineer needs working CDP credentials in `.env.local` to run the gated integration test (AC 5)
  - **Severity (required, mandatory):** P2 (blocks `/build CB-2.1` integration test; doesn't block the PR if integration test is locally-skipped per CB-2.1 PM Risk #2)
  - **Owner (required, mandatory):** operator
  - **Status:** **CLOSED 2026-06-06** for CB-2.1 (story shipped); **REOPENED for CB-2.3 / CB-2.4** scope
  - **Area (required, tag):** infra / dependency
  - **Resolution (filled when closed):** 2026-06-06 — CB-2.1 shipped via [PR #26](https://github.com/vivekschaudhary/crypto-bot/pull/26) without needing CDP credentials: Engineer's no-SDK pivot let the integration test target a public Coinbase endpoint (`/api/v3/brokerage/market/products/BTC-USD`) that doesn't require auth. The CB-2.1 scope (JWT minting + transport layer) was verifiable end-to-end via the public path without exercising CDP-authenticated brokerage endpoints. **Still required for CB-2.3 (account balances + history) and CB-2.4 (place / cancel order)** — those stories WILL need a Trade-only CDP key in `.env.local` to run their integration tests. Per [runbook step 4](../ops/runbook.md#4-coinbase-api-key-cdp--trade-only) (Trade-only CDP key creation at portal.cdp.coinbase.com). Operator confirms CDP credentials present before `/build CB-2.3` fires.

---

_Living artifact — re-run `/plan` to refresh. Cron-driven refresh available per `compass/config.yaml`._

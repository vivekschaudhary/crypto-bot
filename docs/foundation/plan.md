---
id: PROJECT-PLAN
type: plan
version: 2
status: living
created: 2026-05-31
last_refreshed: 2026-05-31
parent: FOUNDATION-PRODUCT
---

# Project Plan

> Living, time-bound schedule for the MVP bet wedge. Derived from per-bet artifacts; refreshed by `/plan`. Never hand-edited — re-run `/plan` to refresh.

**Last refreshed:** 2026-05-31 (version 2 — refresh after CB-1.1 + CB-1.1.1 + post-merge bookkeeping landed)

## Currently in flight

| Bet | Title | Phase | Actual start | Estimated end | Owner |
|-----|-------|-------|--------------|---------------|-------|
| [CB-1](../bets/CB-1/brief.md) | Passkey authentication | Stories shipping — 2 of ~6 done (CB-1.1 + CB-1.1.1); next is CB-1.2 (registration endpoints) | 2026-05-31 | 2026-06-21 | Engineer (Claude) → Codex review |

## Next up (unblocked, not yet started)

Bets whose dependencies are satisfied (or have none) but the bet itself hasn't been promoted from stub yet.

| Bet | Title | Estimated start | Estimated duration | Confidence |
|-----|-------|-----------------|---------------------|------------|
| [CB-2](../bets/CB-2/brief.md) | Coinbase data + top-5 discovery | 2026-06-01 | 2 weeks | low |

## Blocked

Bets waiting on dependencies, HITL approval, or external input.

| Bet | Title | Blocked by | Since | Mitigation |
|-----|-------|------------|-------|------------|
| [CB-3](../bets/CB-3/brief.md) | Strategy authoring + persistence | CB-1, CB-2 | 2026-05-31 | Unblocks naturally when CB-1 and CB-2 land. CB-1 now binding (2026-06-21) since the 1-week slip from CB-1.1 + CB-1.1.1 actuals; CB-2 still tracks 2026-06-14. Stub estimate-only until promoted. |
| [CB-4](../bets/CB-4/brief.md) | DCA bot runtime | CB-2, CB-3 | 2026-05-31 | Unblocks when CB-3 completes (CB-3 is the binding dep — CB-2 finishes earlier). |
| [CB-5](../bets/CB-5/brief.md) | Transaction ledger + dashboard + override buttons | CB-1, CB-4 | 2026-05-31 | Unblocks when CB-4 completes (CB-4 is the binding dep — CB-1 finishes much earlier). |

## Done

_No fully-shipped MVP bets yet — CB-1 has 2 of ~6 stories shipped but the bet itself is still in flight._

| Bet | Title | Actual end | Duration (actual vs estimated) |
|-----|-------|------------|-------------------------------|

## Full schedule

Every MVP bet with all date columns. Source of truth for downstream tools.

| Bet | Title | Depends on | Est. start | Est. end | Actual start | Actual end | Duration (wk) | Confidence | Last refined by |
|-----|-------|------------|------------|----------|--------------|------------|---------------|------------|-----------------|
| [CB-1](../bets/CB-1/brief.md) | Passkey authentication | — | 2026-05-31 | 2026-06-21 | 2026-05-31 | — | 3 | high | stories + build-actuals |
| [CB-2](../bets/CB-2/brief.md) | Coinbase data + top-5 discovery | — | 2026-06-01 | 2026-06-14 | — | — | 2 | low | stub |
| [CB-3](../bets/CB-3/brief.md) | Strategy authoring + persistence | [CB-1, CB-2] | 2026-06-22 | 2026-07-05 | — | — | 2 | low | stub |
| [CB-4](../bets/CB-4/brief.md) | DCA bot runtime | [CB-2, CB-3] | 2026-07-06 | 2026-07-26 | — | — | 3 | low | stub |
| [CB-5](../bets/CB-5/brief.md) | Transaction ledger + dashboard + override buttons | [CB-1, CB-4] | 2026-07-27 | 2026-08-16 | — | — | 3 | low | stub |

**MVP completion target:** 2026-08-16 (was 2026-08-09 in v1 — slipped 1 week, driven by CB-1 duration refinement from 2-week stub to 3-week stories-grounded estimate). Confidence values: CB-1 `high` (story decomposition done, 2 of 6 shipped), all others `low` (still stubs).

## Calendar view

```
Week of:               | Wk 1    | Wk 2    | Wk 3    | Wk 4    | Wk 5    | Wk 6    | Wk 7    | Wk 8    | Wk 9    | Wk 10   | Wk 11   |
                       | 05-25   | 06-01   | 06-08   | 06-15   | 06-22   | 06-29   | 07-06   | 07-13   | 07-20   | 07-27   | 08-03   |
-----------------------|---------|---------|---------|---------|---------|---------|---------|---------|---------|---------|---------|
CB-1 (auth)            |  ▓▓     |  ██     |  ██     |  ██     |         |         |         |         |         |         |         |
CB-2 (data + top-5)    |         |  ██     |  ██     |         |         |         |         |         |         |         |         |
CB-3 (strategy)        |         |         |         |         |  ██     |  ██     |         |         |         |         |         |
CB-4 (bot runtime)     |         |         |         |         |         |         |  ██     |  ██     |  ██     |         |         |
CB-5 (ledger + dash)   |         |         |         |         |         |         |         |         |         |  ██     |  ██     |
```

Legend: ▓▓ = work already done (CB-1.1 + CB-1.1.1 shipped 2026-05-31); ██ = scheduled.

Critical path: CB-1 → CB-3 → CB-4 → CB-5 (11 weeks, including the head-start week). CB-1 is now on the critical path (was companion to CB-2 in v1) because its refined end-date (2026-06-21) is later than CB-2's stub end-date (2026-06-14), making CB-1 the binding dependency for CB-3. CB-2 finishes earlier and is therefore the parallel companion now.

## Refinement log

Each time a date moves, write a line here naming the triggering artifact.

| Date | Bet | Field changed | From | To | Triggered by |
|------|-----|---------------|------|-----|--------------|
| 2026-05-31 | CB-1 | duration_weeks | 2 | 3 | Stories created (CB-1.1 + CB-1.1.1) + brief's expected decomposition (6 stories @ ~3 days each ≈ 3 weeks); see [`docs/bets/CB-1/brief.md`](../bets/CB-1/brief.md) Stories section. |
| 2026-05-31 | CB-1 | confidence | low | high | Story decomposition known + 2 of 6 stories shipped (PR #1 + PR #2 merged); per [`compass/workflows/plan.md`](../../compass/workflows/plan.md) estimate model "Stories created" + "First build PR merged" triggers. |
| 2026-05-31 | CB-1 | actual_start | — | 2026-05-31 | First story PR merged ([PR #1](https://github.com/vivekschaudhary/crypto-bot/pull/1) merged 2026-05-31 19:26 UTC); per estimate model "First build PR merged" trigger. |
| 2026-05-31 | CB-1 | estimated_start | 2026-06-01 | 2026-05-31 | Actuals override schedule — actual start preceded the planned Monday start by 1 day. |
| 2026-05-31 | CB-1 | estimated_end | 2026-06-14 | 2026-06-21 | Recomputed: actual_start (2026-05-31) + 3-week refined duration. |
| 2026-05-31 | CB-3 | estimated_start | 2026-06-15 | 2026-06-22 | CB-1 binding-dep end shifted from 2026-06-14 to 2026-06-21 (CB-2 unchanged at 2026-06-14; CB-1 is now the later of the two). |
| 2026-05-31 | CB-3 | estimated_end | 2026-06-28 | 2026-07-05 | Cascaded from CB-3 estimated_start shift (+7 days); duration_weeks unchanged at 2. |
| 2026-05-31 | CB-4 | estimated_start | 2026-06-29 | 2026-07-06 | CB-3 binding-dep end shifted +7 days; CB-2 unchanged (not binding). |
| 2026-05-31 | CB-4 | estimated_end | 2026-07-19 | 2026-07-26 | Cascaded from CB-4 estimated_start shift (+7 days); duration_weeks unchanged at 3. |
| 2026-05-31 | CB-5 | estimated_start | 2026-07-20 | 2026-07-27 | CB-4 binding-dep end shifted +7 days; CB-1 unchanged (not binding — finishes much earlier). |
| 2026-05-31 | CB-5 | estimated_end | 2026-08-09 | 2026-08-16 | Cascaded from CB-5 estimated_start shift (+7 days); duration_weeks unchanged at 3. |

_v1 seed-run entries (2026-05-31) preserved in git history at version 1._

## Risks to plan

- **MVP target slipped 1 week** (2026-08-09 → 2026-08-16) at first reality-contact. The slip is honest — CB-1's stub 2-week duration was optimistic given its 6-story decomposition. Other bets are still stub-estimated; expect similar refinements as they promote, cumulative slip could be 2-3 more weeks across CB-2/3/4/5 combined.
- **CB-1's same-day double-ship was the exception, not the norm.** CB-1.1 + CB-1.1.1 shipped on 2026-05-31 because CB-1.1.1 was a process-driven follow-up bundled with the build-cycle, not an independent story. The remaining ~5 CB-1 stories (registration endpoints, authentication endpoints, sign-out, proxy session validation, first-deploy onboarding UX) are independent and won't compress similarly.
- **Stub estimates remain low-confidence for CB-2/3/4/5** — all still 2/3-week stubs. Promotion via `/create-brief <bet-id>` will refine. Expect ± 1 week per bet at medium-confidence stage.
- **Solo-developer cadence is the wallclock binding constraint** (unchanged from v1) — vacation, day-job pressure, or context-switch tax pushes everything proportionally.
- **CB-4 (bot runtime) carries the highest extension risk** (unchanged from v1) — most surface area; may bump to 4 weeks at brief promotion. Documented as the bet most likely to slip the MVP target further.
- **Coinbase CDP key provisioning is a Day-1 blocker for CB-2** (unchanged from v1) — operator must have a working CDP key in hand before CB-2 build starts.
- **Auto-pause + reserve floor + multi-device passkey deferred to post-MVP** (unchanged from v1) — three post-MVP bets need scheduling immediately after MVP completes.

## DRI Log

### Decisions

- [2026-05-31] [Project Manager] **CB-1 estimate refined from stub (2 wk / low) to stories+build-actuals (3 wk / high)** — first contact with reality on this bet
  - **Rationale (required):** at brief approval CB-1 was estimated 2 weeks based on stub default. The brief's Stories section then forecast ~6 stories. With 2 stories shipped (CB-1.1 lib + CB-1.1.1 follow-ups) and 5 remaining at ~3 days each per the workflow's estimate model, the honest total is ~3 weeks. The first-PR-merged actuals also reset actual_start = 2026-05-31 (1 day before the planned Monday start).
  - **Area (required, tag):** scheduling / estimation
  - **Alternatives considered (required):** keep 2-week stub estimate (rejected — known-stale given story decomposition); estimate 4 weeks for safety (rejected — no evidence the remaining 5 stories will run long; CB-1.2..CB-1.6 consume a now-tested library, smaller per-story scope than CB-1.1's library build); back-fit duration to whatever lands by 06-14 (rejected — plan should reflect honest forecast, not retrofit dates).
  - **Reversibility:** easy (re-running `/plan` after next PR merge will recompute; this is the normal living-plan rhythm).

- [2026-05-31] [Project Manager] **CB-1 moved from "parallel companion to CB-2" to "binding critical-path dep for CB-3"** — first time the parallel pair diverged
  - **Rationale (required):** v1's critical path was CB-2 → CB-3 → CB-4 → CB-5 with CB-1 as parallel companion of CB-2 (same end date). With CB-1 refined to 2026-06-21 and CB-2 still at 2026-06-14, CB-1 becomes the later of the two and gates CB-3. Critical path is now CB-1 → CB-3 → CB-4 → CB-5. This will reshuffle again once CB-2 promotes and refines — refresh after each promotion.
  - **Area (required, tag):** scheduling / critical-path
  - **Alternatives considered (required):** force CB-1 to stay on 2-week parallel track (rejected — would be fitting reality to plan, not plan to reality); promote CB-2 immediately to refine its estimate too (rejected — operator hasn't asked yet; promotion is a HITL decision).
  - **Reversibility:** easy.

### Risks

- [2026-05-31] [Project Manager] **CB-1 estimate could still grow** as the next ~5 stories actually decompose
  - **Likelihood (required):** medium (registration endpoints + authentication endpoints + sign-out + proxy session validation + first-deploy UX is concrete but each could surface unknowns at story creation)
  - **Impact (required):** medium (additional 1-week slip on CB-1 pushes MVP target to 2026-08-23)
  - **Mitigation (required):** re-run `/plan` after each subsequent CB-1 story's PR merges. Refinement log captures every date movement.
  - **Area (required, tag):** scheduling / estimation

- [2026-05-31] [Project Manager] **v1's risks remain active** — stub-estimate slippage on CB-2..CB-5, CB-4 extension risk, CDP key provisioning, post-MVP rails scheduling
  - **Likelihood (required):** see v1 entries
  - **Impact (required):** see v1 entries
  - **Mitigation (required):** unchanged from v1 — re-run `/plan` after each brief approval; refinement log captures every movement.
  - **Area (required, tag):** scheduling / estimation

### Issues

_None at v2 refresh._

---

_Living artifact — re-run `/plan` to refresh. Cron-driven refresh available per `compass/config.yaml`._

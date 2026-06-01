---
id: PROJECT-PLAN
type: plan
version: 3
status: living
created: 2026-05-31
last_refreshed: 2026-06-01
parent: FOUNDATION-PRODUCT
---

# Project Plan

> Living, time-bound schedule for the MVP bet wedge. Derived from per-bet artifacts; refreshed by `/plan`. Never hand-edited — re-run `/plan` to refresh.

**Last refreshed:** 2026-06-01 (version 3 — refresh after CB-1.2 story.md created + CB-1.2 shipped via PR #5)

## Currently in flight

| Bet | Title | Phase | Actual start | Estimated end | Owner |
|-----|-------|-------|--------------|---------------|-------|
| [CB-1](../bets/CB-1/brief.md) | Passkey authentication | Stories shipping — 3 story.md files exist (CB-1.1 + CB-1.1.1 + CB-1.2, all shipped); next is CB-1.3 (authentication endpoints) | 2026-05-31 | 2026-06-14 | PM → Engineer (`/create-story CB-1` for CB-1.3) |

## Next up (unblocked, not yet started)

Bets whose dependencies are satisfied (or have none) but the bet itself hasn't been promoted from stub yet.

| Bet | Title | Estimated start | Estimated duration | Confidence |
|-----|-------|-----------------|---------------------|------------|
| [CB-2](../bets/CB-2/brief.md) | Coinbase data + top-5 discovery | 2026-06-01 | 2 weeks | low |

## Blocked

Bets waiting on dependencies, HITL approval, or external input.

| Bet | Title | Blocked by | Since | Mitigation |
|-----|-------|------------|-------|------------|
| [CB-3](../bets/CB-3/brief.md) | Strategy authoring + persistence | CB-1, CB-2 | 2026-05-31 | Unblocks naturally when both finish (currently same end-date 2026-06-14 — co-binding). Stub estimate-only until promoted. |
| [CB-4](../bets/CB-4/brief.md) | DCA bot runtime | CB-2, CB-3 | 2026-05-31 | Unblocks when CB-3 completes (CB-3 is the binding dep — CB-2 finishes earlier). |
| [CB-5](../bets/CB-5/brief.md) | Transaction ledger + dashboard + override buttons | CB-1, CB-4 | 2026-05-31 | Unblocks when CB-4 completes (CB-4 is the binding dep — CB-1 finishes much earlier). |

## Done

_No fully-shipped MVP bets yet — CB-1 has 2 story.md files shipped but the bet itself is still in flight (more stories expected per the brief's forecast)._

| Bet | Title | Actual end | Duration (actual vs estimated) |
|-----|-------|------------|-------------------------------|

## Full schedule

Every MVP bet with all date columns. Source of truth for downstream tools.

| Bet | Title | Depends on | Est. start | Est. end | Actual start | Actual end | Duration (wk) | Confidence | Last refined by |
|-----|-------|------------|------------|----------|--------------|------------|---------------|------------|-----------------|
| [CB-1](../bets/CB-1/brief.md) | Passkey authentication | — | 2026-05-31 | 2026-06-14 | 2026-05-31 | — | 2 | high | build-actuals |
| [CB-2](../bets/CB-2/brief.md) | Coinbase data + top-5 discovery | — | 2026-06-01 | 2026-06-14 | — | — | 2 | low | stub |
| [CB-3](../bets/CB-3/brief.md) | Strategy authoring + persistence | [CB-1, CB-2] | 2026-06-15 | 2026-06-28 | — | — | 2 | low | stub |
| [CB-4](../bets/CB-4/brief.md) | DCA bot runtime | [CB-2, CB-3] | 2026-06-29 | 2026-07-19 | — | — | 3 | low | stub |
| [CB-5](../bets/CB-5/brief.md) | Transaction ledger + dashboard + override buttons | [CB-1, CB-4] | 2026-07-20 | 2026-08-09 | — | — | 3 | low | stub |

**MVP completion target:** 2026-08-09 (unchanged from v1 — duration estimates are unmoved; only CB-1's `actual_start` + `confidence` + `refined_by` updated this refresh). Confidence values: CB-1 `high` (first PR merged trigger fired per workflow estimate model), all others `low` (still stubs).

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

Note: CB-1's actual_start (2026-05-31, Sunday) is 1 day before Wk 1 — visualization rounds to Wk 1 since the duration estimate is still 2 weeks ending 2026-06-14.

Critical path: CB-2 → CB-3 → CB-4 → CB-5 (10 weeks). CB-1 finishes on the same date as CB-2 (2026-06-14) — it's the parallel companion, not on the critical path. This may shift if CB-1's duration extends as future story.md files get created.

## Refinement log

Each time a date moves, write a line here naming the **triggering artifact** (specific file path or PR URL).

| Date | Bet | Field changed | From | To | Triggered by |
|------|-----|---------------|------|-----|--------------|
| 2026-05-31 | CB-1 | actual_start | — | 2026-05-31 | First story PR merged: [PR #1](https://github.com/vivekschaudhary/crypto-bot/pull/1) (commit 1abea1b, merged 2026-05-31 19:26 UTC). Triggers the "First build PR merged" row of the estimate model in [`compass/workflows/plan.md`](../../compass/workflows/plan.md). |
| 2026-05-31 | CB-1 | estimated_start | 2026-06-01 | 2026-05-31 | Actuals override planned schedule — actual_start (above) preceded the planned Monday start; per the same workflow estimate model. Source: [PR #1](https://github.com/vivekschaudhary/crypto-bot/pull/1). |
| 2026-05-31 | CB-1 | confidence | low | high | "First build PR merged" trigger row in [`compass/workflows/plan.md`](../../compass/workflows/plan.md) estimate model → `confidence: high`. Source: [PR #1](https://github.com/vivekschaudhary/crypto-bot/pull/1). |
| 2026-05-31 | CB-1 | refined_by | stub | build-actuals | Latest applicable trigger per [`compass/workflows/plan.md`](../../compass/workflows/plan.md) estimate model is "First build PR merged" → enum value `build-actuals`. Source: [PR #1](https://github.com/vivekschaudhary/crypto-bot/pull/1). |
| 2026-05-31 | CB-1 | estimated_end | — | 2026-06-14 | Recomputed from `actual_start + duration_weeks` per estimate model. `actual_start = 2026-05-31`; `duration_weeks` stays at brief-approval value 2. v2-era reasoning. Net date movement: 0 days. |
| 2026-06-01 | CB-1 | story.md count | 2 | 3 | New story.md file: [`docs/bets/CB-1/stories/CB-1.2/story.md`](../bets/CB-1/stories/CB-1.2/story.md) created during `/create-story CB-1` (commit landed via [PR #5](https://github.com/vivekschaudhary/crypto-bot/pull/5)). Fires the "Stories created" row of the estimate model. Surfaced by Codex code-review of PR #6: prior v2 refresh claimed this trigger wouldn't fire mid-bet — incorrect; trigger fires per literal reading. |
| 2026-06-01 | CB-1 | refined_by | build-actuals | stories | Latest-applicable trigger advanced from "First build PR merged" (fired once at PR #1) to "Stories created" (fires on each new story.md file; latest fire was CB-1.2's creation). Per workflow estimate model enum order. |
| 2026-06-01 | CB-1 | duration_weeks | 2 | 2 | Recomputed via "Stories created" trigger: 3 story.md files × 3 days each = 9 days = 1.286 weeks. Per [v3 DRI Decision below](#decisions) ("adaptive-decomposition resolution rule"), `duration_weeks = max(stories-based, brief-approval) = max(1.3, 2) = 2`. Net date movement: 0 days. Triggering artifact: [`docs/bets/CB-1/stories/CB-1.2/story.md`](../bets/CB-1/stories/CB-1.2/story.md). |

_v1 + v2 seed-run entries (2026-05-31) preserved in git history at version 1 and 2._

_No downstream dates moved this refresh — CB-1's `estimated_end` is unchanged, so CB-3/4/5 estimated_start values stay at v1/v2 values._

## Risks to plan

- **Future CB-1 story.md creations may extend its duration past the brief-approval ceiling.** The brief forecasts ~6 stories total; 3 story.md files exist (CB-1.1, CB-1.1.1, CB-1.2). Per the adaptive-decomposition resolution rule (DRI Decision below), `duration_weeks = max(stories-based, brief-approval)`. Today: max(3 × 3 days, 2 wk) = max(1.3 wk, 2 wk) = 2 wk. **When story count reaches 5+**: max(5 × 3 days, 2 wk) = max(2.14 wk, 2 wk) = ~2.1 wk → duration_weeks bumps to 3. **When story count reaches 7+** (unlikely but possible): max(3 wk, 2 wk) = 3 wk firmly. Track at each `/create-story CB-1` invocation; refresh `/plan` if the max() changes the integer-rounded `duration_weeks`.
- **Stub estimates remain low-confidence for CB-2/3/4/5** — all still 2/3-week stubs. Promotion via `/create-brief <bet-id>` will refine. Expect ± 1 week per bet at medium-confidence stage; cumulative ± 2-3 weeks on the 10-week MVP target until briefs land.
- **Solo-developer cadence is the wallclock binding constraint** (unchanged from v1) — these dates assume the operator works on the project at a sustained pace. Vacation, day-job pressure, or context-switch tax pushes everything proportionally.
- **CB-4 (bot runtime) carries the highest single-bet extension risk** (unchanged from v1) — most surface area; may bump to 4 weeks at brief promotion. Documented as the bet most likely to slip the MVP target.
- **Coinbase CDP key provisioning is a Day-1 blocker for CB-2** (unchanged from v1) — operator must have a working CDP key in hand before CB-2 build starts.
- **Auto-pause + reserve floor + multi-device passkey deferred to post-MVP** (unchanged from v1) — three post-MVP bets need scheduling immediately after MVP completes.

## DRI Log

### Decisions

- [2026-05-31] [Project Manager] **CB-1 refresh keeps `duration_weeks: 2` (brief-approval value); only `actual_start`, `confidence`, `refined_by`, and recomputed `estimated_end` move** — strict "derived, not authored" reading of `/plan`
  - **Rationale (required):** the workflow's "Stories created" trigger says "Story count × per-story size" — the only honest input is the **count of actual `story.md` files**, not the brief's "Expected decomposition" forecast. CB-1 has 2 story.md files (CB-1.1, CB-1.1.1) — both existed at brief-approval time; the count hasn't changed since approval. Therefore the "Stories created" trigger has not produced new evidence; `duration_weeks` stays at the brief-approval value (2). Only the "First build PR merged" trigger applies this refresh (sets `actual_start` and bumps `confidence`).
  - **Area (required, tag):** scheduling / estimation
  - **Alternatives considered (required):** project forward from the brief's 6-story forecast (rejected — that's authoring a date, not deriving; flagged by Codex review on PR #4); count CB-1.1 + CB-1.1.1 strictly = 6 days = ~1 week (rejected — that's mechanically literal but ignores that brief-approval already set 2 weeks as the duration estimate, and 2 stories don't yet contradict 2 weeks); leave the bet at low confidence (rejected — the model explicitly upgrades to high on first PR merge).
  - **Reversibility:** easy — next `/plan` after CB-1.2 story.md is created will fire the "Stories created" trigger with a real artifact count and may legitimately move `duration_weeks`.

- [2026-05-31] [Project Manager] **`refined_by` is a single token from the workflow's fixed enum** (`stub | brief-approval | architecture | stories | build-actuals`)
  - **Rationale (required):** the workflow spec defines `refined_by` as a single-value enum field. v2's first draft used `refined_by: stories + build-actuals` (concatenated) — that violates the single-token contract; flagged by Codex review on PR #4. Convention from this point: when multiple triggers apply in a single refresh, use the latest-applicable trigger per the estimate model's row order; the audit trail of prior triggers lives in the refinement log, not in the frontmatter field.
  - **Area (required, tag):** scheduling / contract-compliance
  - **Alternatives considered (required):** allow concatenation with `+` separator (rejected — drifts the schema downstream tools will read); add a parallel `prior_refined_by` array field (rejected — schema bloat for a use case the refinement log already covers); leave it ambiguous (rejected — flagged in review).
  - **Reversibility:** trivial.

- [2026-06-01] [Project Manager] **Adaptive-decomposition resolution rule: `duration_weeks = max(stories-based, brief-approval)`** — closes the framework gap where mid-bet story counts under-represent the bet
  - **Rationale (required):** the `/plan` workflow's estimate model assumes upfront story decomposition (story count is monotonically informative). This project's brief explicitly uses adaptive decomposition ("decomposed one at a time via `/create-story CB-1`") — so at any mid-bet moment, the story.md count UNDER-represents the bet's true scope because not-yet-decomposed stories don't exist as files yet. Strict-derivation reading on PR #4 partially handled this by checking "did the count change?" (and finding it hadn't). But once a new story.md is created mid-bet (CB-1.2's case here), strict-derivation says: recompute = 3 × 3 days = 1.3 wk, which is SHORTER than the brief-approval estimate of 2 wk despite KNOWING 4 more stories are forecast. That's wrong. The honest fix: take `max(stories-based, brief-approval)` as the working duration. The brief-approval estimate is the PM's upfront scope ceiling; story-files-so-far is the implementation floor; their max is a conservative bound that aligns with reality without authoring future dates.
  - **Area (required, tag):** scheduling / framework-adaptation
  - **Alternatives considered (required):** apply strict-derivation literally and let `duration_weeks` shrink to 1.3 wk = 1 wk (rejected — knowingly under-estimates a bet with explicit remaining forecast); project forward from the brief's 6-story forecast as if those stories already existed (rejected — that's PR #4's authoring trap); freeze `duration_weeks` at the brief-approval value until the bet ships (rejected — wouldn't reflect legitimate refinement when story count exceeds the forecast); add a `manual_override` field to frontmatter (rejected — bypasses the derive discipline entirely).
  - **Reversibility:** easy — the rule is documented here + applied at each `/plan` refresh; future cycles either keep it, refine it, or replace it with something better.
  - **Surfaced by:** Codex code review of PR #6 (the post-CB-1.2-merge bookkeeping PR), which correctly flagged that this v3 refresh's draft prose claimed `/plan` could be skipped — but the `/plan` workflow's literal rule does fire on each new story.md, even if the resulting duration math collapses to the brief-approval value via this max() rule.

### Risks

- [2026-05-31] [Project Manager] **CB-1 estimate likely to grow once future CB-1.x stories actually land as story.md files**
  - **Likelihood (required):** medium (brief forecasts ~6 stories; current count is 2; story-count-based recomputation may exceed 2-week duration)
  - **Impact (required):** medium (additional 1-week slip on CB-1 likely shifts MVP target by ~1 week if it bites)
  - **Mitigation (required):** re-run `/plan` after each new CB-1.x story.md file lands (or after each PR merge). The estimate model's "Stories created" trigger then fires with real artifact count. Refinement log captures every movement.
  - **Area (required, tag):** scheduling / estimation

- [2026-05-31] [Project Manager] **v1's risks remain active** — stub-estimate slippage on CB-2..CB-5, CB-4 extension risk, CDP key provisioning, post-MVP rails scheduling
  - **Likelihood (required):** see v1 entries
  - **Impact (required):** see v1 entries
  - **Mitigation (required):** unchanged from v1 — re-run `/plan` after each brief approval; refinement log captures every movement.
  - **Area (required, tag):** scheduling / estimation

### Issues

_None at v2 refresh. v2's initial draft had 3 review findings (single-token contract violation, forecasted-decomposition authoring, missing artifact citations in refinement log); all closed by this update before merge — see DRI Decisions above + tightened refinement log table._

---

_Living artifact — re-run `/plan` to refresh. Cron-driven refresh available per `compass/config.yaml`._

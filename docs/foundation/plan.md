---
id: PROJECT-PLAN
type: plan
version: 6
status: living
created: 2026-05-31
last_refreshed: 2026-06-06
parent: FOUNDATION-PRODUCT
---

# Project Plan

> Living, time-bound schedule for the MVP bet wedge. Derived from per-bet artifacts; refreshed by `/plan`. Never hand-edited — re-run `/plan` to refresh.

**Last refreshed:** 2026-06-06 (version 6 — first post-CB-1-shipped refresh. CB-1 fired the "All bet stories merged" trigger on 2026-06-05 with `actual_end = 2026-06-05`; bet finished **16 days ahead of v5's estimated_end of 2026-06-21**. Two intermediate "Stories created" trigger fires also captured: CB-1.5 (story count 5→6) and CB-1.6 (6→7), both held `duration_weeks = 3` via the adaptive-decomposition max() rule. MVP target stays **2026-08-16** because CB-2 became the new binding-dep for CB-3 + slipped by operator-cadence — see refinement log.)

## Currently in flight

| Bet | Title | Phase | Actual start | Estimated end | Owner |
|-----|-------|-------|--------------|---------------|-------|

_No bets in flight as of 2026-06-06. CB-1 shipped 2026-06-05; CB-2 next-up (still stub, not yet promoted)._

## Next up (unblocked, not yet started)

Bets whose dependencies are satisfied (or have none) but the bet itself hasn't been promoted from stub yet.

| Bet | Title | Estimated start | Estimated duration | Confidence |
|-----|-------|-----------------|---------------------|------------|
| [CB-2](../bets/CB-2/brief.md) | Coinbase data + top-5 discovery | 2026-06-06 | 2 weeks | low |

## Blocked

Bets waiting on dependencies, HITL approval, or external input.

| Bet | Title | Blocked by | Since | Mitigation |
|-----|-------|------------|-------|------------|
| [CB-3](../bets/CB-3/brief.md) | Strategy authoring + persistence | CB-2 (CB-1 dep cleared 2026-06-05) | 2026-05-31 | Unblocks when CB-2 completes (v6: CB-2 is now sole binding-dep at stub-end 2026-06-19, since CB-1 cleared early). Stub estimate-only until promoted via `/create-brief CB-3`. |
| [CB-4](../bets/CB-4/brief.md) | DCA bot runtime | CB-2, CB-3 | 2026-05-31 | Unblocks when CB-3 completes (CB-3 is the binding dep — CB-2 finishes earlier). |
| [CB-5](../bets/CB-5/brief.md) | Transaction ledger + dashboard + override buttons | CB-4 (CB-1 dep cleared 2026-06-05) | 2026-05-31 | Unblocks when CB-4 completes (CB-4 is the sole binding dep now). |

## Done

| Bet | Title | Actual start | Actual end | Duration (actual vs estimated) | Notes |
|-----|-------|--------------|------------|--------------------------------|-------|
| [CB-1](../bets/CB-1/brief.md) | Passkey authentication | 2026-05-31 | 2026-06-05 | **5 calendar days actual vs 21 estimated (3 wk = brief-approval × stories-refinement max() ceiling)** → 16 days ahead | 7 stories (CB-1.1, CB-1.1.1, CB-1.2, CB-1.3, CB-1.4, CB-1.5, CB-1.6) shipped via PRs #1, #2, #5, #6, #8, #9, #10, #13, #14, #16, #17 + post-merge security follow-up PR #18 (M1+M2 from 2026-06-04 codebase audit) + post-canary follow-ups PRs #20/#21/#22 from the 2026-06-05 canary verification retro. Per-story actual velocity ≈ 0.7 days vs the 3-days/story plan-model default — a ~4x discrepancy worth tracking but only one data point. CB-1 brief frontmatter `estimate.duration_weeks` preserved at 3 (the stories-refinement value at last refresh); `actual_duration_days: 5` captures the actual side-by-side. |

## Full schedule

Every MVP bet with all date columns. Source of truth for downstream tools.

| Bet | Title | Depends on | Est. start | Est. end | Actual start | Actual end | Duration (wk) | Confidence | Last refined by |
|-----|-------|------------|------------|----------|--------------|------------|---------------|------------|-----------------|
| [CB-1](../bets/CB-1/brief.md) | Passkey authentication | — | 2026-05-31 | 2026-06-21 | 2026-05-31 | **2026-06-05** | 3 (est) / **1** (actual ≈ 5 days) | high | stories |
| [CB-2](../bets/CB-2/brief.md) | Coinbase data + top-5 discovery | — | **2026-06-06** | **2026-06-19** | — | — | 2 | low | stub |
| [CB-3](../bets/CB-3/brief.md) | Strategy authoring + persistence | [CB-2] (CB-1 cleared) | 2026-06-22 | 2026-07-05 | — | — | 2 | low | stub |
| [CB-4](../bets/CB-4/brief.md) | DCA bot runtime | [CB-2, CB-3] | 2026-07-06 | 2026-07-26 | — | — | 3 | low | stub |
| [CB-5](../bets/CB-5/brief.md) | Transaction ledger + dashboard + override buttons | [CB-4] (CB-1 cleared) | 2026-07-27 | 2026-08-16 | — | — | 3 | low | stub |

**MVP completion target:** 2026-08-16 (**unchanged from v5**). CB-1 finished 16 days early (v5 est: 2026-06-21 → actual: 2026-06-05), but CB-2 slipped 5 days (v5 est-start 2026-06-01 → v6 est-start 2026-06-06 — operator worked CB-1 first instead of in parallel as portfolio anticipated). Critical-path binding-dep for CB-3 SWAPPED from CB-1 → CB-2 in v6, so the early-finish on CB-1 doesn't pull CB-3 forward; CB-2's stub end (06-19) lands very close to where CB-1's old estimated end was (06-21). Net cascade: zero days. The MVP target will compress if CB-2 promotes + refines below the stub's 2-week duration.

## Calendar view

```
Week of:               | Wk 1    | Wk 2    | Wk 3    | Wk 4    | Wk 5    | Wk 6    | Wk 7    | Wk 8    | Wk 9    | Wk 10   | Wk 11   |
                       | 06-01   | 06-08   | 06-15   | 06-22   | 06-29   | 07-06   | 07-13   | 07-20   | 07-27   | 08-03   | 08-10   |
-----------------------|---------|---------|---------|---------|---------|---------|---------|---------|---------|---------|---------|
CB-1 (auth) ✓ shipped  |  ██     |         |         |         |         |         |         |         |         |         |         |
CB-2 (data + top-5)    |         |  ██     |  ██     |         |         |         |         |         |         |         |         |
CB-3 (strategy)        |         |         |         |  ██     |  ██     |         |         |         |         |         |         |
CB-4 (bot runtime)     |         |         |         |         |         |  ██     |  ██     |  ██     |         |         |         |
CB-5 (ledger + dash)   |         |         |         |         |         |         |         |         |  ██     |  ██     |  ██     |
```

Note: CB-1's actual_start 2026-05-31 (Sunday) → actual_end 2026-06-05 (Friday) = 5 calendar days, entirely within Wk 1 of the visualization. CB-2's estimated_start 2026-06-06 (Saturday) is end-of-Wk-1; calendar rounds it to start-of-Wk-2 for visualization (operator-cadence Monday start 2026-06-08 is the practical earliest). Wk 2/3 capture CB-2's 2-week stub span. Calendar otherwise identical to v5 (downstream cascade unchanged).

Critical path: **CB-2 → CB-3 → CB-4 → CB-5** (now 10.5 weeks from CB-2 start to CB-5 end). v5's critical path was CB-1 → CB-3 → CB-4 → CB-5; with CB-1 done early, CB-2 became the binding entry into the chain. CB-1 is no longer on the critical path. If CB-2 promotion refines duration below 2 weeks (per the CB-1 actual-velocity signal, plausible), the MVP target compresses.

## Refinement log

Each time a date moves, write a line here naming the **triggering artifact** (specific file path or PR URL).

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
| 2026-06-06 | CB-5 | estimated_start | 2026-07-27 | 2026-07-27 | Unchanged. |
| 2026-06-06 | CB-5 | estimated_end | 2026-08-16 | 2026-08-16 | Unchanged. **MVP target stays at 2026-08-16.** |

_v1–v5 entries (2026-05-31 to 2026-06-01) preserved in git history at versions 1–5._

## Risks to plan

- **Per-story velocity 3-days/story model over-estimated CB-1 by ~4x** — CB-1 actual: 7 stories × 0.7 days ≈ 5 days. Model predicted: 7 × 3 days = 21 days. The model assumes ~3 days per story; the actual single-operator velocity on this codebase is **~0.7 days per story**. **Decision held:** v6 does NOT retune the per-story constant for CB-2..CB-5 because (a) it's one data point — could be CB-1-specific (clear-cut auth scope, well-trodden patterns), (b) future bets may have different per-story complexity (CB-4 bot runtime in particular), (c) authoring the constant from a single bet's actuals violates strict-derivation. Watch through CB-2 + CB-3 actuals before considering a model adjustment. If the pattern repeats: MVP target could compress by ~2 weeks total.
- **CB-2 stub estimate dominates the cascade entry** — CB-2 is now binding-dep for CB-3 (was CB-1 in v5). With CB-2 still at 2-week stub + `confidence: low`, the entire downstream chain inherits stub-confidence dates. **Promotion via `/create-brief CB-2` is the single highest-leverage action** for sharpening the MVP target — it advances CB-2 from `low` to `medium` confidence and refines CB-3..CB-5's binding-dep math.
- **Operator-cadence: serial vs parallel uncertainty** — portfolio planned CB-1 + CB-2 as Day-1 parallel pair; operator actually ran them serially (CB-1 first, CB-2 starts now). If subsequent "parallel" bets in the wedge also run serially, downstream cascade could slip. **There are no remaining portfolio-planned parallel pairs** after CB-2 (CB-3, CB-4, CB-5 are all sequential), so this risk doesn't apply beyond v6 — but if the operator wants to attack CB-2 alongside the deferred passkey-auth-kit project (separate repo), serial-vs-parallel returns as a calibration question.
- **Three forward-watch risks unchanged from v5:** stub estimates remain `low`-confidence for CB-2..CB-5 (± 1 week per bet at brief-approval refinement; cumulative ± 2-3 weeks); CB-4 (bot runtime) carries the single-bet extension risk; CDP key provisioning is a Day-1 blocker for CB-2 (operator must have a working CDP key in hand before CB-2 build starts).
- **Post-MVP rails scheduling unchanged from v1** — auto-pause + reserve floor + multi-device passkey ceremony all deferred; need scheduling immediately after MVP completes.
- **Migration 0003 not yet applied to production Supabase** — PR #22 merged 2026-06-06 but the migration is operator-applied (per runbook). Until applied, `auth_*` tables remain "Unrestricted" in Supabase dashboard. Defense-in-depth gap only; does not block CB-2 work. Action item tracked in operator's TODO.

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

### Risks

- [2026-06-06] [Project Manager] **CB-2 stub-vs-actual delta is now the single highest-leverage uncertainty in the cascade**
  - **Likelihood (required):** certain (CB-2 has never been promoted from stub; refinement WILL happen at promotion)
  - **Impact (required):** medium-to-high (CB-2 is now the critical-path entry; ± 1 week here cascades through CB-3, CB-4, CB-5; cumulative MVP-target movement potential ± 1-2 weeks)
  - **Mitigation (required):** prioritize `/create-brief CB-2` as the next workflow invocation. After promotion, `/plan` v7 will refine CB-2 from `low` → `medium` confidence and recompute cascade.
  - **Area (required, tag):** scheduling / cascade-confidence

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

### Issues

- [2026-06-06] [Project Manager] **Migration 0003 (RLS) not yet applied to production Supabase** — operator-applied per runbook; defense-in-depth gap until then
  - **Severity (required, mandatory):** P4 (defense-in-depth; no functional impact on MVP or any in-flight work)
  - **Owner (required, mandatory):** operator
  - **Status:** open
  - **Area (required, tag):** security / infra
  - **Resolution (filled when closed):** operator pastes `db/migrations/0003-auth-tables-rls.sql` into Supabase SQL Editor (or runs `pnpm db:migrate`) + verifies via `SELECT tablename, rowsecurity FROM pg_tables WHERE tablename LIKE 'auth_%'` (all four rows should show `rowsecurity = true`). Tracked in conversation TODO.

---

_Living artifact — re-run `/plan` to refresh. Cron-driven refresh available per `compass/config.yaml`._

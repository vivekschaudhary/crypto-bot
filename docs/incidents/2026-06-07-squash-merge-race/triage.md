---
id: INC-2026-06-07-squash-merge-race
type: fix
bet: null
story: null
hygiene: true
severity: P3
status: triaged
reporter: Claude (per /triage note request from operator after PR #35 opened)
created: 2026-06-07
author: Support
area_tags: [process, github, ci-cd, compass-discipline]
---

# Triage: GitHub squash-merge race truncates fix commits — 3 occurrences in CB-2

## Issue

GitHub's "Squash and merge" UI captures the diff between merge-base and branch HEAD **at the moment the merge button is clicked**. Subsequent commits to the same branch are NOT auto-included. For multi-round Codex-review PRs, the operator's standard rhythm — push fix → Codex re-reviews → push next fix → merge — has a click-vs-push race where if the merge is clicked before GitHub picks up the latest push, the squash silently captures the stale state.

This has bit 3 times in this bet alone:

| Original PR | Squash-merged at | Missed | Restored by |
|---|---|---|---|
| **#28** /ops migrate + Vercel build-step + fail-closed gate | original commit only | round-1 + round-2 + round-3 fixes (VERCEL_ENV → MIGRATE_DESTINATION gate redesign, ops doc sweep) | [PR #29](https://github.com/vivekschaudhary/crypto-bot/pull/29) — URGENT (fail-open hole on main) |
| **#27** /plan v7 post-merge cleanup | round-1 commit only | round-2..5 fixes (CB-2.1 story shipped flip, brief actuals, arch Issue #1 closure, plan.md cascade, status.md updates, rate-limit Risk reframe) | [PR #30](https://github.com/vivekschaudhary/crypto-bot/pull/30) — docs consistency |
| **#34** CB-2.3 lib/coinbase/accounts.ts | original commit only | round-1 + round-2 fixes (productId → productIds[] array; defensive-break → fail-loud `pagination-contract-violation`; sentinel-filter integration test; brief + story cascade) | [PR #35](https://github.com/vivekschaudhary/crypto-bot/pull/35) — silent match-all risk + partial-list risk |

## Reproduction

1. Open a PR (e.g., `gh pr create ...`)
2. Codex runs review against initial commit; operator pastes findings
3. Push a fix commit to the same branch
4. Codex re-runs; operator confirms clean (or clicks merge while Codex is still queued)
5. The squash-merge UI on GitHub shows the OLD commit as the HEAD (because the page state hasn't refreshed since the push, OR the merge button was clicked before the new commit registered)
6. Squash captures the stale state; the fix commits live on the now-closed branch but never reach main

**Expected:** squash captures all pushed commits up to current HEAD of the PR branch
**Actual:** squash captures whatever GitHub considered the HEAD at button-click time (may be stale relative to the actual branch HEAD)

## Environment

- Workflow: GitHub web UI "Squash and merge" button
- Cadence: every PR with Codex review-rounds is exposed
- Single-operator project (no CI gating preventing the race; HITL discipline is the only check)

## Severity rationale

**P3** (hygiene / process).

Per-incident impact ranges from LOW (docs drift in PR #30) to MEDIUM (silent match-all filter risk in PR #35) to HIGH (PR #29's fail-open production-migration hole — would have been a real security issue had a preview branch with a new migration file been pushed before the fix landed). The HIGH outcome only didn't bite because no new migration files were added between the broken merge and the restoration PR.

The pattern is systemic; capturing here so the next bookkeeping retro can formalize a discipline change.

## Mitigation pattern (proposed; not yet adopted)

For multi-round Codex-review PRs, before clicking the squash-merge button:

```bash
# Verify GitHub's view of the branch HEAD matches your latest local push
gh pr view <N> --json headRefOid -q .headRefOid
git rev-parse origin/<branch-name>
# Both should match. If they don't, wait for GitHub to fetch the latest
# push (usually < 30s) and re-verify before merging.
```

OR — adopt a stricter operational discipline:

- **Never click squash-merge while a Codex review is in flight.** Wait for explicit "no findings" + ensure the no-findings message references a HEAD commit you can verify (`git log <branch> -1 --format=%H` should match).
- If a fix is pushed AFTER the merge button is clicked but before the merge completes (unlikely but possible): plan a follow-up PR for the missed commits.

The current bookkeeping pattern when the race bites (PR #29 / #30 / #35) is the patch-extract approach:

```bash
git checkout -b fix/restore-pr<N>-missed-fixes
git diff <first-commit>..<branch-HEAD> -- <affected-files> > /tmp/missed.patch
git apply /tmp/missed.patch
# Verify all gates + commit + open follow-up PR
```

This works but is reactive. A proactive discipline change would prevent future occurrences.

## Severity escalation path

If a fourth occurrence happens, escalate to **P2** and add a hard-gate to the operator's PR-merge workflow:

- Pre-merge checklist that requires explicit `headRefOid` verification step
- Or a `.git/hooks/pre-receive` style server-side check (not feasible on GitHub-hosted repos without GitHub Actions)
- Or a custom GitHub Action that fails the merge if a commit was pushed within the last N seconds

## DRI Log

### Decisions

_None yet — this triage note documents the pattern; the discipline change is a separate PM Decision when the next bookkeeping retro happens._

### Risks

- [2026-06-07] [Support] **The pattern recurs and bites a production-critical PR**
  - **Likelihood (required):** medium (3 occurrences in ~3 days; no preventive measure adopted yet)
  - **Impact (required):** could be HIGH on the right kind of PR (PR #29's fail-open was the closest call — security-relevant code missing the security gate)
  - **Mitigation (required):** track-and-detect pattern documented here; raise in next retro; adopt one of the mitigations above before CB-2.4 / CB-2.5 / CB-3 begin
  - **Area (required, tag):** process / github-workflow

### Issues

- [2026-06-07] [Support] **No automated detection of the squash-merge race** — operator + Claude both have to manually verify HEAD matches before clicking merge
  - **Severity (required, mandatory):** P3
  - **Owner (required, mandatory):** Operator / PM at next retro
  - **Status:** open
  - **Area (required, tag):** process / automation
  - **Resolution (filled when closed):** [to be filled when a discipline change OR automated check lands]

## Cross-references

- [PR #28](https://github.com/vivekschaudhary/crypto-bot/pull/28) → [PR #29 restore](https://github.com/vivekschaudhary/crypto-bot/pull/29)
- [PR #27](https://github.com/vivekschaudhary/crypto-bot/pull/27) → [PR #30 restore](https://github.com/vivekschaudhary/crypto-bot/pull/30)
- [PR #34](https://github.com/vivekschaudhary/crypto-bot/pull/34) → [PR #35 restore](https://github.com/vivekschaudhary/crypto-bot/pull/35)
- The pattern is also flagged in [CB-2 brief PM DRI Decisions](../../bets/CB-2/brief.md#decisions) (the "Codex round-1 BLOCKER" rationale notes the squash race as the surfacing condition for the productIds rename).

---

_Triage closed: <pending>, related fixes: PR #29, PR #30, PR #35_

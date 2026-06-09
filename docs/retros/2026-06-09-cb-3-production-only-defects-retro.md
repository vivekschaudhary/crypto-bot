---
id: retro-cb-3-production-only-defects-2026-06-09
type: retro
status: complete
date: 2026-06-09
author: Claude (post-bet-ship project retro)
scope: process + code-discipline
subject: CB-3 shipped 1.5d (~17x faster than 3wk estimate) but surfaced 3 production-only defects within hours of CB-3.3 going live, plus the cross-artifact-drift pattern recurred on PR #50 + PR #53. Local gate matrix did not cover Next.js production-only RSC / Server-Action constraints OR human-UX edge cases.
verdict: Three named anti-patterns surface as convention candidates for codification — `[rsc-prop-serialization]`, `[server-action-file-export-purity]`, `[empty-numeric-input-zero-trap]`. The cross-artifact-drift recurrence at PR #50 + PR #53 is the FIFTH visible instance of the same pattern (CB-2.2 + CB-2.5 + CB-3.1 + CB-3.2 + this PR's two rounds); it's no longer "occasional drift" — it's a structural gap that warrants a build-workflow pre-commit checklist item.
---

# CB-3 production-only defects retro (2026-06-09)

## Context

CB-3 shipped **1.5 calendar days end-to-end** vs the 3 wk medium-confidence brief-approval estimate (~17x faster). The four stories (.0/.1/.2/.3 after CB-3.4 fold) merged via PRs #45/#47/#48/#49 across one afternoon (2026-06-08); operator hit `/dashboard/strategy` in production immediately after the PR #49 deploy and **3 production-only defects surfaced within hours**, requiring 3 post-merge polish PRs (#50/#51/#52). A 4th polish PR (#53) followed shortly after to harden extraction-readiness per the equity-app intent in brief PM Decision #6.

**Outcome shape:** the bet still shipped 20 days ahead of estimate even WITH 3 production defects + 1 portability refactor. The story-creation discipline (15 ACs + Standard Experience Checklist + design.md + copy.md drafted before /build) caught most edge cases. The remaining defects were all in a single class: **production-only Next.js runtime constraints invisible to `pnpm dev` + `pnpm build` + 541 unit tests + the Playwright e2e**.

**Squash-race streak**: 9 PRs clean through the entire bet (#45 + #46 + #47 + #48 + #49 + #50 + #51 + #52 + #53). The pre-merge `headRefOid` ritual from the 2026-06-08 incident triage note held flawlessly. This is the most enduring process-hardening artifact of CB-3.

## The three production-only defects (timeline + root cause)

### Defect 1 — `[rsc-prop-serialization]` (PR #50)

**Symptom:** Every GET `/dashboard/strategy` returned 500 in production. Vercel logs showed truncated "Error: Fu…" entries. Response body contained three React Server Component error digests:

```
10:E{"digest":"2712862616"}  // getCandidateAssets
11:E{"digest":"1622679544"}  // rankByVolume
12:E{"digest":"617426040"}   // getAssetIdentifier
```

**Root cause:** `page.tsx` (Server Component) passed `adapter: AssetAdapter` as a prop to `StrategyFormClient` (Client Component). React Server Components can only serialize **JSON-serializable values OR Server Actions** across the RSC boundary. Regular function members like `getCandidateAssets`, `rankByVolume`, `getAssetIdentifier` become broken `E{digest:...}` references at runtime.

**Why local gates missed it:** `pnpm dev` (turbopack-dev) and `pnpm build` (Next.js production build) both accept this prop pattern without warning. The serialization failure happens only when the RSC stream is actually evaluated in the deployed Vercel runtime.

**Fix:** Replace `adapter: AssetAdapter` prop with `assetClass: AssetClass` primitive. The form was only using `adapter.assetClass` inside a hidden span (a placeholder added "to satisfy the AC 3 generic-over-adapter contract") — the adapter's methods were never invoked from the client.

**Architectural intent preserved:** the form was supposed to be generic over asset-class portability, NOT literally over the adapter object. The Server Component is now responsible for materializing adapter-derived data into primitives before crossing the RSC boundary. CB-3.0's mock-equity-adapter test + CB-3.1's real adapter still prove the strategy-core abstraction.

**Convention candidate text:**

> `[rsc-prop-serialization]` — Server Component → Client Component props must be JSON-serializable OR Server Actions. **Never pass structural types with function members across the RSC boundary.** The build doesn't catch this; only the Vercel runtime does. If a Client Component needs to call an adapter-style method, expose it as a discrete Server Action; don't pass the adapter object.

### Defect 2 — `[server-action-file-export-purity]` (PR #51)

**Symptom:** After PR #50 deployed, the form RENDERED but `Save strategy` 500'd. Vercel logs showed:

```
Error: A "use server" file can only export async functions, found object.
    at d (.next/server/chunks/ssr/_01rld79._.js:64:2035)
    ...
  digest: '3088388443@E352'
```

**Root cause:** `strategy-actions.ts` had `"use server"` at the top + a dead re-export at the bottom: `export { VALIDATION_ERROR_CODES, errorCodeToFieldPath }`. The first is a const array (object); the second is a sync function. Both violate the rule: **`"use server"` files must export async functions only**.

**Why local gates missed it:** Identical class to Defect 1 — both `pnpm dev` and `pnpm build` accept the export pattern. The constraint is enforced at SSR-chunk evaluation time on Vercel.

**Fix:** Remove the dead re-export. Both symbols were imported directly from their origin modules at consumer sites already; the re-export was scaffold accumulation.

**Convention candidate text:**

> `[server-action-file-export-purity]` — A `"use server"` file's PUBLIC EXPORT SURFACE must be async functions ONLY. **Type-only exports (`export type ...`) are erased at compile time and fine.** Internal helpers (non-exported consts and sync functions) are fine. Re-exports of non-async values from other modules are NOT.

### Defect 3 — `[empty-numeric-input-zero-trap]` (PR #52)

**Symptom:** Operator cleared the "Min profit %" field expecting to type a new value; saw "0" appear and couldn't erase it without typing a non-zero digit first. **Operator-reported within minutes** of the form going live.

**Root cause:** HTML number inputs send empty string `""` on clear. `Number("")` returns `0` (not `NaN`). My `onChange` handler set state to `0`, re-rendering the field showing "0". Affected ALL 7 numeric inputs in the form (entry/exit RSI, MA reinforcement, sell fraction, position size, both caps).

**Why local gates missed it:** No `@testing-library/react` in deps (Engineer DRI Decision #9: "scope creep; defer to e2e + pure-logic tests"). The Playwright e2e tests the happy path (typing values into fields) but not the clear-and-retype interaction. Pure-logic unit tests don't exercise DOM input events.

**Fix:** NaN sentinel for "cleared." `numericDisplay(n)` returns `""` when `!Number.isFinite(n)`; `makeNumericChangeHandler(setter)` maps `""` → `NaN`. Submit disabled while any field is non-finite. Three pure helpers lifted to module scope + tested (12 new regression tests; total 552 → 554).

**Convention candidate text:**

> `[empty-numeric-input-zero-trap]` — HTML `<input type="number">` empty-state is `Number("") === 0`, NOT NaN. Controlled-input forms using number state must explicitly handle the empty case (NaN sentinel or `string | number` union) and gate submit on `Number.isFinite`. The Playwright happy-path e2e does NOT exercise the clear-and-retype interaction; only DOM tests OR operator UX testing surface it.

## The cross-artifact-drift recurrence (PR #50 + PR #53)

Codex flagged the same pattern in TWO of the four CB-3.3 polish PRs:

| PR | Code change | Artifact that needed same-PR amendment |
|---|---|---|
| #50 | Replaced `adapter: AssetAdapter` prop with `assetClass` primitive | story.md AC 3 + architecture.md Decision #6 still documented the adapter-prop contract |
| #53 | Added `labels: StrategyFormLabels` prop | story.md AC 3 + architecture.md Decision #6 still documented the boundary without it |

Both rounds: code shipped a contract change; the source-of-truth artifacts didn't get swept in the same PR; Codex caught it as a BLOCKER; I amended in a follow-up commit.

**This is the FIFTH visible instance in the project's history:**

1. CB-2.2 PR #32 round-2 — stale narrative comments naming 300-candle limit after 350 was approved
2. CB-2.5 PR #41 round-1 — brief Sentry breadcrumb language vs structured-log decision
3. CB-3.1 PR #46 round-2 — brief internally split on `getProducts() + getProduct(id)` vs single call across 4 sites
4. CB-3.2 PR #48 round-1 — schema.sql section ordering (strategies wrongly placed in auth section)
5. **PR #50 + PR #53** — same-bet recurrence within 24 hours of CB-3.3 ship

The pattern: **when production reality OR a Codex finding forces a code-side contract shift, the source-of-truth artifacts (brief, architecture, story, copy doc) need same-PR amendments — but the Engineer focus on closing the code BLOCKER pulls attention away from the cross-artifact sweep.**

**Convention candidate text:**

> `[cross-artifact-sweep-on-contract-shift]` — When a PR changes a load-bearing contract (prop signature, interface shape, validation rule, schema name, AC wording), the same PR MUST sweep all artifacts that document that contract — brief.md, architecture.md, story.md, copy.md, schema.sql, any AC line that names the changed identifier. **Pre-push checklist item.** If Codex catches the drift in round 1, ship a follow-up commit in the SAME PR (no separate PR for the docs-sweep).

## What worked well

### 1. The headRefOid pre-merge ritual

9 PRs clean in a row (#45-#53). The triage note from the 2026-06-08 incident codified the ritual:

```bash
echo "local HEAD: $(git rev-parse HEAD)"
echo "remote HEAD: $(gh pr view <N> --json headRefOid -q .headRefOid)"
# Verify match before clicking Merge.
```

After 4 race incidents in CB-2 (PR #28→#29, #27→#30, #34→#35, #37→#38), zero races in CB-3 across 9 PRs. **Process-hardening artifact that paid back through the entire bet.**

### 2. CB-3.4 fold decision

PM Decision at `/create-story CB-3.3` to fold CB-3.4 (activation wiring) into CB-3.3 collapsed CB-3 from 5 → 4 stories. The architecture's documented save action already does validate + supersession + activation in one transaction; a standalone CB-3.4 would have been an empty story or an over-engineered re-litigation. **Right call — the bet shipped 17x ahead of estimate; CB-3.4 would have added review-cycle overhead with no value.**

### 3. Strategy-core extraction-readiness invariant tests

Four invariant tests (`no-coupling.test.ts` transitive walk + `no-live-mode.test.ts` × 2 directories + `mock-equity-adapter.test.ts`) caught zero new violations during CB-3.3 build or the polish PRs. The form-client.tsx never imported from `@/lib/coinbase/*` even by accident. **PR #53's portability polish was a +30 line refactor (labels prop) precisely because the structural invariants already held; no costly extraction was needed.**

### 4. Defect velocity

Three production defects surfaced and shipped fixes within 6 hours of CB-3.3 going live. Each defect was reproducible in production (operator could trigger from `/dashboard/strategy`) but pleasingly bounded in scope — RSC issue, "use server" rule, HTML number input quirk — each a 1-file fix.

### 5. Operator UX testing as a load-bearing review surface

Defect 3 (`[empty-numeric-input-zero-trap]`) would not have been caught by any automated test the project owns. Operator hit the form within minutes of deploy + tried to clear a field + reported it. **The human-in-the-loop production smoke step in the operator's testing playbook is doing real work; it's not ceremony.**

## What didn't work

### 1. Local gates don't simulate Vercel runtime constraints

`pnpm dev` + `pnpm build` + Playwright e2e + 541 unit tests all passed for CB-3.3 PR #49. Vercel runtime caught 2 of the 3 defects. This is a structural gap in the local-test matrix.

**Mitigation candidates** (not prescription; for future improvement consideration):
- `vercel build` locally (simulates production bundle including RSC chunks)
- A pre-merge "smoke deploy" to a Vercel preview env that runs the e2e against the production-bundled artifact
- A lint rule that flags Server Component → Client Component props with function-typed properties (would catch Defect 1)
- A lint rule that flags non-async exports in `"use server"` files (would catch Defect 2)

### 2. The Playwright e2e tested the happy path, not edge interactions

The 2 e2e specs covered: (a) authenticate → fill form → save → success → revise mode renders, (b) revise twice → supersession FK chain populates correctly. Neither covered: (c) clear a numeric input → expect empty display + disabled submit. The class "clear-and-retype" interactions is invisible to the spec-author who hasn't yet experienced the bug.

### 3. Cross-artifact-sweep discipline is fragile under Codex-review-cycle pressure

Twice in this bet (PR #50, PR #53), the artifact sweep landed in a follow-up commit on the same PR rather than the initial commit. Engineer mental focus pulls toward "close the BLOCKER → push fix" rather than "close the BLOCKER + sweep all artifacts that named the changed identifier → push fix + amendment together." Codex caught both instances, but the recurrence rate (5 visible instances; 2 in one bet) signals the sweep is a soft-spec that gets rationalized away under review-cycle pressure.

## Convention candidates ready for codification

Per the `/retro` workflow + AGENTS.md principle #14, convention candidates emerge when ≥3 instances of a pattern are observed AND the shape is stable. Four candidates this batch:

| Candidate | Instances | Maturity | Recommendation |
|---|---|---|---|
| `[rsc-prop-serialization]` | 1 (this bet) — but the class is documented in Next.js 16 RFC + matches aura-app CB-1.4 pattern; behavior is well-specified by the framework | High | **Promote** — add to AGENTS.md cross-cutting principles + a `/build` workflow pre-merge checklist line |
| `[server-action-file-export-purity]` | 1 (this bet) — same class as RSC; framework-documented constraint | High | **Promote** — add to AGENTS.md cross-cutting principles + a `/build` workflow pre-merge checklist line |
| `[empty-numeric-input-zero-trap]` | 1 (this bet) — but the class is a well-known HTML number-input quirk that any controlled-input form ships into | High | **Promote** — add to a UI-form-checklist sub-section + a numeric-input snippet for future forms |
| `[cross-artifact-sweep-on-contract-shift]` | 5 (CB-2.2, CB-2.5, CB-3.1, CB-3.2, CB-3.3 ×2) — recurring across 4 stories of 2 bets | Very high | **Promote with priority** — add to `/build` workflow Phase 4 as a mandatory pre-PR checklist + cite the 5 historical instances |

## Drift signals

| Signal | Evidence | Investigation candidate |
|---|---|---|
| Local gate matrix misses Vercel runtime constraints | Defects 1 + 2 invisible to `pnpm build` + unit tests | Add `vercel build` to local gate sequence? Or accept that production smoke is the gate? |
| Engineer focus pulls toward code-fix over artifact-sweep under review pressure | PR #50 + PR #53 both needed Codex round-1 BLOCKER to surface the cross-artifact drift | Make artifact sweep a Phase-4 pre-PR-template checklist with checkbox |
| Story-creation discipline (15 ACs + checklist + design + copy) holds up well | CB-3.3's 15 ACs + Standard Experience Checklist anticipated most edge cases; the 3 defects that escaped were ALL outside the AC surface (RSC plumbing, "use server" export rule, HTML quirk) | None — the story surface is appropriately scoped |
| Engineer DRI Decision #9 ("no @testing-library/react; defer to e2e") had a cost | Defect 3 would have been caught by a DOM render test; e2e didn't | Re-evaluate at next UI story; consider DOM tests if affordable |

## Watch-for list for CB-4

Hypotheses to track explicitly during CB-4 (bot runtime + `*/15` cron tick):

- **CB-4 has NO UI surface (bot runtime is server-only)** — the production-only-defect class from CB-3.3 should NOT apply. If it does anyway (e.g., a cron-route Server Action surfaces a runtime constraint), surface as a 6th instance of the broader "local gates miss prod" pattern.
- **CB-4 will read CB-3's `strategies` table on every tick** — does the read path scale to the schema's growth (supersession chain)? If CB-5's dashboard tries to render the full history, Q1 (top-5 stability cadence) data accumulates rapidly. Watch for query-plan surprises.
- **CB-4 will exercise the `lib/coinbase/` rate-limit budget intensely** — operator's `*/15` cron tick is ~96 invocations/day. Each tick may fan out 1-5 Coinbase calls (price, candles per asset). Per CB-2.5's empirical discovery, the auth'd brokerage 30 RPS limit is comfortable. Watch for rate-limit-budget regressions if a bug fans out more than expected.
- **CB-4 will be the first bet where LIVE_MODE actually matters** — the dry-run-first product principle gates writes. Watch the LIVE_MODE-gate code path; it has no production usage history.
- **CB-3's 9-PR streak**: continue the `headRefOid` ritual into CB-4 to make it 10+ clean.

## Meta-observations

- **Bet velocity outpacing initial estimate is now a pattern.** CB-1 cleared 2.3 weeks ahead of v5's 06-21; CB-2 cleared 5 days ahead of estimate; CB-3 cleared ~20 days ahead of estimate. The `/plan` estimate model deserves a calibration: brief-approval medium-confidence estimates have been consistently 5-15x slow. Worth a `/plan` refresh after CB-4 to recompute MVP target end with empirical velocity.
- **Convention discovery lag** for `[cross-artifact-sweep-on-contract-shift]` is now ~5 PRs across 2 bets. Per principle #14, this is overdue for codification. Surfacing now reduces lag to zero.
- **Operator UX testing as part of the project test matrix** is structurally load-bearing (caught Defect 3) but currently informal. If institutionalized (a documented "operator first prod-smoke" gate before status-sweep), it'd be a 4th gate alongside typecheck/lint/test/build.
- **The architectural intent preservation discipline held** — every PR that shifted a code contract (PR #50 prop type; PR #53 labels lift) preserved the *intent* of the underlying AC even while the *literal* contract shifted. This is the right shape: contracts evolve, intents don't.

## Closure

CB-3 shipped. The 3 production-only defects + 4th portability refactor cost ~6 hours of cycle time across PR #50/#51/#52/#53; the bet still landed ~17x faster than estimated. **The pattern lessons are more valuable than the elapsed time was costly** — three new named anti-patterns + one elevated convention candidate ready for AGENTS.md codification.

Next action per operator direction: `/create-brief CB-4` (bot runtime + cron tick); `/plan` refresh after CB-4 brief approves.

---

_Filed under docs/retros/ (project retro variant per [`compass/workflows/retro.md`](../../compass/workflows/retro.md)). Status: complete; archive-immutable per the retro discipline._

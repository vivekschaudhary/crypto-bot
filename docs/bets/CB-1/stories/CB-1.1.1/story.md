---
id: CB-1.1.1
bet: CB-1
type: story
status: ready
priority: P0
created: 2026-05-31
author: Engineer
parent_story: CB-1.1
design_link: n/a (no UI surface — remediation of library + docs)
area_tags: [auth, library, backend, process]
dependencies: [CB-1.1]
---

# CB-1.1.1 — Codex review remediations for CB-1.1

## Description

Codex's code review of [PR #1](https://github.com/vivekschaudhary/crypto-bot/pull/1) (CB-1.1) returned 3 BLOCKERs + 1 ISSUE; PR was merged before the review posted (process slip — see DRI Decision below). This story closes the four findings honestly: two by amending the CB-1.1 story to document deliberate deviations + Engineer DRI Decisions, two by adding the missing tests.

Security review on the same PR returned no findings (Approve). No security-relevant remediation in this story; this is purely an AC-and-test gap closure.

## Acceptance Criteria

- [ ] **AC 1 — Amend CB-1.1 AC 1 (WebAuthn wrapper contract) + log Engineer DRI Decision**
  - Update `docs/bets/CB-1/stories/CB-1.1/story.md` AC 1 to reflect the **options-object** signatures that landed in `lib/auth/webauthn.ts`. The original AC text mandated positional signatures; the implementation switched to options-object because SimpleWebAuthn's underlying types are options-object-shaped and AC text mandated "use the SimpleWebAuthn package's own exported types directly rather than redefining."
  - Add an Engineer DRI Decision to CB-1.1's DRI Log naming the deviation, its rationale, the call-sites this binds (downstream stories CB-1.2..CB-1.6 must consume the options-object shape), and reversibility.

- [ ] **AC 2 — Expired-challenge test in `tests/lib/auth/challenges.test.ts`**
  - Add a Vitest case that feeds `consumeChallenge()` a `signedToken` whose underlying `exp` is in the past, asserts the return is `null`.
  - Implementation note: use `vi.useFakeTimers()` + `vi.setSystemTime()` to advance system time > 60 seconds after `mintChallenge()`, then call `consumeChallenge()` and assert `null`. Restore real timers after the case.
  - Test passes via `pnpm test`.

- [ ] **AC 3 — Happy-path WebAuthn verification tests in `tests/lib/auth/webauthn.verify.test.ts`** (separate file from `webauthn.test.ts`)
  - Add at least one positive verification case for `verifyRegistrationResponse()` and one for `verifyAuthenticationResponse()`, using `vi.mock("@simplewebauthn/server", ...)` to mock the underlying lib's verify functions so the test exercises **our wrapper plumbing** (RP ID derivation, expected-origin derivation, options-object passthrough). The underlying lib's cryptographic verification is its own test surface.
  - Each test asserts: (a) the wrapper returns the mocked `{ verified: true, ...info }` result unchanged, (b) the wrapper passes `expectedOrigin` and `expectedRPID` correctly derived from `APP_ORIGIN` to the underlying lib.
  - **Why a separate file** (not `webauthn.test.ts`): `vi.mock("@simplewebauthn/server", ...)` is hoisted to module scope and affects every test in the file. The existing `webauthn.test.ts` runs `generateRegistrationOptions` / `generateAuthenticationOptions` + failure-case `verifyXResponse` against the **real** lib; adding the mock there would break those existing tests. New file isolates the mock scope cleanly.
  - Tests pass via `pnpm test`.

- [ ] **AC 4 — Amend CB-1.1 AC 7 (ESLint flat-config swap) + log Engineer DRI Decision**
  - Update `docs/bets/CB-1/stories/CB-1.1/story.md` AC 7 to acknowledge the swap from the Next.js shareable preset to direct `@typescript-eslint/recommended`-shape rules + the added ignore entries (`coverage/**`, `next-env.d.ts`).
  - Add an Engineer DRI Decision to CB-1.1's DRI Log naming: the original AC ("keep existing flat config and add no new ignores"), the deviation (swap + added ignores), the rationale (ESLint 9.39 + `@eslint/eslintrc` `FlatCompat` + `next/typescript` shareable circular-JSON bug, blocks `pnpm lint`), the upgrade path (revisit when Next.js publishes an ESLint 9-native flat-config shareable; current behaviors covered by the direct rules), and reversibility.

- [ ] **AC 5 — Pre-merge gates green**
  - `pnpm typecheck` passes
  - `pnpm lint` passes
  - `pnpm test` passes (including the 2 new tests under AC 2 + AC 3)
  - `pnpm build` produces a successful production build

- [ ] **AC 6 — PR template hardened with explicit "DO NOT MERGE before review" line**
  - Add to `.github/PULL_REQUEST_TEMPLATE.md` an unambiguous top-banner line: PR may not be merged until Codex Code Review **and** Security Review (when triggered) have posted on the PR and all BLOCKERs are resolved.
  - Banner placement: top of the template (first content section), so reviewers and the operator see it before scrolling.

## Standard Experience Checklist

- [x] **Navigation** — `n/a — no UI surface; tests + docs + PR template only.`
- [x] **States** — `n/a — no rendered UI states.`
- [x] **Feedback** — `n/a — no UI feedback surface.`
- [x] **Accessibility** — `n/a — no UI focus / keyboard / screen-reader surface.`
- [x] **Edge cases** — **covered by AC 2 + AC 3** (expired-challenge + happy-path verification cases close documented test-coverage gaps).
- [x] **Cross-surface consistency** — **covered by AC 1 + AC 4** (CB-1.1 story now matches the landed `lib/auth/` implementation; downstream consumer stories under CB-1 inherit the actual library contract, not a stale one) + **AC 6** (PR template harden applies to every future story PR, not just CB-1 stories).

## Tech notes

**Why a follow-up story instead of editing CB-1.1?**
- CB-1.1 is merged. Reopening it would entail rewriting `status: shipped` post-merge state.
- Process integrity is better served by a fresh story that names the deviations explicitly + carries its own DRI trail. Future readers see "PR #1 had review findings → CB-1.1.1 closed them" rather than "CB-1.1 was rewritten silently."

**Why the two AC-amend findings are not code changes:**
- *Finding 1 (signatures):* SimpleWebAuthn's `VerifyRegistrationResponseOpts` / `VerifyAuthenticationResponseOpts` are options-object types. Re-wrapping in a positional API would diverge our wrapper from the lib it wraps. The original AC text was a PM-side spec drafted before the wrapper-API decision was made; the impl correctly used the lib's own shape.
- *Finding 4 (ESLint):* The ESLint 9.39 + `FlatCompat` + `next/typescript` shareable circularity is a real upstream bug. Restoring the Next preset re-hits that bug. The direct `@typescript-eslint/recommended` rules cover the same surface (no-explicit-any, no-unused-vars) without the Next-specific React-hooks/JSX-a11y rules — acceptable for a backend-only repo with one stub `app/(dashboard)` page.

**Why two AC-amend findings are honest, not face-saving:**
- Each amend includes the original AC text + the deviation reason + reversibility. Future readers can audit whether the deviation was justified. The amend is not a quiet rewrite.

## PRs

- [ ] PR to be created on this branch; updated here once opened.

## Tests

_Engineer adds the two missing tests under `tests/lib/auth/`. No new E2E (no HTTP surface; same scope as CB-1.1)._

Tags:
- `regression: true` (closes test-coverage gaps in the foundational primitives)
- `e2e: false`

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `docs/bets/CB-1/stories/CB-1.1.1/fixes/`._

## DRI Log

### Decisions

- [2026-05-31] [Engineer] **Open CB-1.1.1 as a follow-up story rather than re-opening CB-1.1**
  - **Rationale (required):** CB-1.1 was merged via PR #1 at 2026-05-31T19:26 before Codex reviews posted at 2026-05-31T19:56 — a Compass discipline slip (Phase 6 HITL gate fired before Phase 5 review surfaced findings). The merged code is correct under its own (Engineer-internal) reasoning; the four review findings reveal a mix of AC-text-vs-impl drift (findings 1, 4) and test-coverage gaps (findings 2, 3). Better to carry that history as a named follow-up than to silently rewrite CB-1.1 post-merge.
  - **Area (required, tag):** process / story-management
  - **Alternatives considered (required):** rewrite CB-1.1 in place (rejected — destroys the audit trail of "what was reviewed vs what was approved"); file the four findings as Issues on CB-1.1 + leave the code as-is (rejected — leaves load-bearing test gaps unclosed); split into 4 micro-stories (rejected — same scope, more ceremony).
  - **Reversibility:** easy — the four ACs are independent of each other and of downstream stories.

- [2026-05-31] [Engineer] **PR template harden: add explicit "DO NOT MERGE before review" banner** (covers AC 6)
  - **Rationale (required):** the merge-before-review process slip on PR #1 happened because the existing PR template's pre-merge checklist mentions reviewer findings + security in a checklist near the bottom, but lacks an unambiguous top-banner cue. Adding a one-line banner at the top of the template is a cheap, framework-light fix that prevents the same slip without touching the build workflow itself (framework change deferred to a future retro per the operator's direction).
  - **Area (required, tag):** process / pr-template
  - **Alternatives considered (required):** harden `compass/workflows/build.md` Phase 4 wrap-up text to say "DO NOT MERGE" (rejected for this story — framework changes deferred); add GitHub branch-protection rules requiring review-app comments (rejected — out of scope; needs admin access to repo settings + adds CI surface); do nothing, rely on operator vigilance (rejected — process design beats vigilance).
  - **Reversibility:** easy (one paragraph in a Markdown file).

### Risks

- [2026-05-31] [Engineer] **AC 3 happy-path tests mock the underlying SimpleWebAuthn verifier, so they exercise wrapper plumbing only — not the lib's cryptographic verification**
  - **Likelihood (required):** medium (any future change to SimpleWebAuthn's verify API shape would silently pass mocked tests until a downstream story's integration test catches it)
  - **Impact (required):** low (SimpleWebAuthn's verify API has been stable across recent majors; the lib has its own test suite for cryptographic verification; CB-1.2/CB-1.3 endpoint stories will add integration tests with real ceremony fixtures)
  - **Mitigation (required):** explicitly document this scope in the test file header; add a follow-up to CB-1.2 (registration endpoint story) AC: integration test with a real or recorded WebAuthn registration ceremony.
  - **Area (required, tag):** testing / scope

### Issues

_None at story creation._

---

_Story closed: <date>, brief link: [docs/bets/CB-1/brief.md](../../brief.md)_

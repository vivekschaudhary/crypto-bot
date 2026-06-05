---
id: CB-1.6
bet: CB-1
type: story
status: shipped
priority: P0
created: 2026-06-03
shipped: 2026-06-05
author: PM
design_link: docs/bets/CB-1/stories/CB-1.6/design.md
copy_link: docs/bets/CB-1/stories/CB-1.6/copy.md
area_tags: [auth, frontend, ux, backend, routing]
dependencies: [CB-1.1, CB-1.2, CB-1.3, CB-1.4, CB-1.5]
---

# CB-1.6 — First-deploy onboarding UX + auth surfaces

## Description

Ship the four operator-facing surfaces that complete the CB-1 auth loop: `/` (mode-detecting landing CTA), `/setup` (first-deploy passkey registration), `/sign-in` (passkey authentication, honors validated `?next=`), and a minimal `/dashboard` (signed-in landing with sign-out trigger + "Bot controls coming in CB-2" placeholder). Also performs the scaffold cleanup deferred by CB-1.4's Engineer Issue (delete the colliding `app/(dashboard)/page.tsx` route group) and updates CB-1.4's `proxy.ts` redirect target from `/` to `/sign-in` to match the new structural split. This is the first story under CB-1 with actual UI surface; design + copy are produced in parallel with the story per `/create-story` Phase 6.

The bet's < 5-minute guardrail (operator click → registered → on `/dashboard`) gets measured against this story end-to-end for the first time.

## Acceptance Criteria

- [x] **AC 1 — `/` mode-detecting landing** (per [design.md § Surface 1](./design.md#surface-1----landing) + [copy.md § `/` (landing)](./copy.md#-landing)):
  - `app/page.tsx` is a **Server Component**. At request time it (a) reads `__compass_session` cookie via `verifySession` from `@/lib/auth/sessions`; (b) if authenticated → `redirect('/dashboard')` (Next.js `redirect()` helper); (c) else queries `db().auth_credentials` for `count(*)` via `SELECT count(*) FROM auth_credentials` and renders State A (count = 0) or State B (count ≥ 1) per the design.
  - The page does NOT issue any DB writes (read-only SELECT — unlike `verifySession` which bumps `expires_at`; the unauth path on `/` never calls verifySession with a hit, so this stays clean).
  - If inbound has `?next=<encoded>` query parameter, State B's "Sign in" CTA forwards it to `/sign-in` as `?next=<re-encoded>`. State A's "Set up your passkey" CTA does NOT forward `?next` (registration completes by signing in immediately; no separate redirect step).
  - Copy verbatim from [copy.md § `/` (landing)](./copy.md#-landing) — header, body lines, CTA button labels.

- [x] **AC 2 — `/setup` mode gate + WebAuthn registration ceremony** (per [design.md § Surface 2](./design.md#surface-2----setup-first-deploy-passkey-registration) + [copy.md § `/setup`](./copy.md#setup)):
  - `app/setup/page.tsx` is a Server Component for the gate + a Client Component for the ceremony (split per Next.js 16 conventions — Server Component fetches `count(auth_credentials)` + session; if `count >= 1` → `redirect('/sign-in')`; if active session → `redirect('/dashboard')`; otherwise renders the client component).
  - Client component fires `POST /api/auth/register/begin` → `@simplewebauthn/browser` `startRegistration()` → `POST /api/auth/register/finish` with the attestation response.
  - **Device label is auto-derived from `navigator.userAgent`** at registration time (per PM Decision #2). The `/api/auth/register/finish` route accepts a `device_label` field per CB-1.2's body schema; the client extracts a sensible substring from `navigator.userAgent` (e.g., "Safari on macOS 15") rather than passing the raw UA. The exact derivation function lives in `app/setup/lib/device-label.ts` (a single function per AGENTS.md principle #11 — listed in this story).
  - On `/api/auth/register/finish` 200, client-side `router.push('/dashboard')`. Per CB-1.2's architecture, `/finish` already sets the session cookie; the next navigation passes the proxy gate.
  - Copy verbatim from [copy.md § `/setup`](./copy.md#setup) — header, intro, caveat paragraph, CTA labels, success transient, all 7 error messages.

- [x] **AC 3 — `/sign-in` mode gate + WebAuthn authentication ceremony + `?next=` consumer revalidation** (per [design.md § Surface 3](./design.md#surface-3----sign-in-passkey-authentication) + [copy.md § `/sign-in`](./copy.md#sign-in)):
  - `app/sign-in/page.tsx` is a Server Component for the gate + Client Component for the ceremony. Gate: if `count(auth_credentials) = 0` → `redirect('/setup')`; if active session → `redirect(validatedNext || '/dashboard')`; else render the client component with `next` (post-validation) passed as a prop.
  - **`?next=` consumer revalidation (defense-in-depth per CB-1.4 emit-side contract; closes the security-review HIGH precondition on PR #10).** The Server Component validates `searchParams.next` BEFORE passing to the client component, applying all 4 emit-side rules verbatim:
    1. Reject if `next` does not start with `/`.
    2. Reject if `next` starts with `//` (protocol-relative).
    3. Reject if `next` contains `\`.
    4. Reject if `next` contains `:` before the first `/`.
    On any rejection, the parameter is **silently dropped** (no error UI; per [copy.md § Cross-surface strings](./copy.md#cross-surface-strings-used-by-all-auth-pages) + dev-only `console.warn`). The validated value is passed to the client; invalidated value is replaced with `null`. The validator function lives in `lib/auth/safe-next.ts` (new shared helper, exported — proxy.ts may also import it once CB-1.4's emit logic is consolidated; in-scope for this story).
  - Client component fires `POST /api/auth/authenticate/begin` → `startAuthentication()` → `POST /api/auth/authenticate/finish`. On 200, `router.push(safeNext || '/dashboard')`.
  - Copy verbatim from [copy.md § `/sign-in`](./copy.md#sign-in) — header, body, CTA labels, success transient, footer (runbook reference is plain text NOT a clickable link, per copy Decision #4), all 7 error messages.

- [x] **AC 4 — `/dashboard` minimal post-auth landing + sign-out trigger** (per [design.md § Surface 4](./design.md#surface-4----dashboard-minimal-post-auth-landing) + [copy.md § `/dashboard`](./copy.md#dashboard-minimal-post-auth-landing)):
  - `app/dashboard/page.tsx` is a Server Component. The proxy already gates it; the page reads the `x-session-user-id` + `x-session-id` headers forwarded by proxy (per CB-1.4 cloned-request-headers mechanism — convenience signals, NOT auth claims). The page does NOT re-verify the session itself because rendering is not a state-mutating action; the proxy gate is sufficient for read-only render per CB-1.4 Engineer DRI Decision #5 ("re-verify for state mutation; convenience for render is acceptable").
  - Reads `auth_credentials.device_label` for the credential associated with the current session (`auth_sessions.user_id` → `auth_credentials.user_id` → `device_label`); renders "Connected device: {device_label}" (fallback "Connected device: this device" if `device_label` is NULL).
  - **Sign-out button** is a Client Component fired by an `onClick` handler that calls `fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' })`. On 200, `router.push('/')`. On 401 (session already invalidated mid-flight), also `router.push('/')` (treated as success-equivalent per [copy.md § Sign-out error](./copy.md#sign-out-error-rare)). On 403, render the typed origin-mismatch error.
  - Copy verbatim from [copy.md § `/dashboard`](./copy.md#dashboard-minimal-post-auth-landing) — header, "Sign out" button label, signed-in line, "Bot controls coming in CB-2" placeholder line, connected-device line, all sign-out error variants.

- [x] **AC 5 — `proxy.ts` redirect target updates from `/` to `/sign-in`** (closes the CB-1.4 hand-off; updates CB-1.4 AC 2's downstream contract):
  - `proxy.ts` (project root) `buildSignInRedirect` function changes the target from `/` to `/sign-in`. The `?next=<encoded-original-path>` parameter continues to be set with the same emit-side safety checks (start with `/`, no `//`, no `\`, no `:` before first `/`).
  - The corresponding test in `tests/proxy.test.ts` updates from `expect.stringContaining('/?next=')` to `expect.stringContaining('/sign-in?next=')` — one assertion change.
  - **CB-1.4 story.md is NOT amended in this PR**; the AC text there describes what CB-1.4 shipped at the time. This story owns the downstream consumer + the one-line proxy change.

- [x] **AC 6 — Scaffold cleanup: delete `app/(dashboard)/page.tsx`** (closes the CB-1.4 Engineer Issue at story.md:242-247):
  - The route group `app/(dashboard)/` was a scaffold artifact that resolved to `/` and collided with `app/page.tsx`. Delete the entire `app/(dashboard)/` directory.
  - `app/dashboard/page.tsx` (the real `/dashboard` route, no parens) is what AC 4 ships against — that path is unchanged.
  - Add a single regression test in `tests/scaffold-cleanup.test.ts` asserting `app/(dashboard)/` does NOT exist (catches re-introduction).

- [x] **AC 7 — Vitest unit + integration tests** under `tests/app/landing.test.ts`, `tests/app/setup.test.ts`, `tests/app/sign-in.test.ts`, `tests/app/dashboard.test.ts`, `tests/lib/auth/safe-next.test.ts`, and `tests/proxy.test.ts` (updated for AC 5). Coverage:
  - **`/` State A (zero creds):** SSR renders State A copy + State A CTA links to `/setup`; no `?next` forwarded.
  - **`/` State B (≥ 1 cred, no session):** SSR renders State B copy + State B CTA links to `/sign-in`; inbound `?next=%2Fdashboard` forwards to `/sign-in?next=%2Fdashboard`.
  - **`/` State C (active session):** SSR redirects to `/dashboard` (302).
  - **`/setup` gate:** `count >= 1` → 302 `/sign-in`; active session → 302 `/dashboard`; `count = 0` + no session → renders client component with correct copy.
  - **`/setup` device-label derivation:** function called with various `navigator.userAgent` strings produces expected substrings (Safari/macOS, Chrome/Linux, etc.); never returns empty.
  - **`/sign-in` gate:** `count = 0` → 302 `/setup`; active session → 302 `/dashboard` (or `?next` if valid); `count >= 1` + no session → renders client component with `safeNext` prop.
  - **`/sign-in` `?next=` validation matrix:** valid `/dashboard` → kept; `/dashboard?x=1` → kept (query string ok); `//evil.com` → dropped (protocol-relative); `https://evil.com` → dropped (no `/` start); `/../../../etc/passwd` → kept (relative same-origin even if weird path; the consumer is the framework, which won't escape origin); `/path\with\backslash` → dropped (backslash); `javascript:alert(1)` → dropped (`:` before `/`); empty string → dropped.
  - **`/dashboard` renders:** "Signed in.", "Bot controls and decision trace will arrive in the next bet (CB-2).", and "Connected device: <label>" with label coming from `auth_credentials.device_label` (mocked via DB layer).
  - **`/dashboard` device-label NULL fallback:** when `device_label IS NULL` → renders "Connected device: this device".
  - **`/dashboard` sign-out button:** click → fires `POST /api/auth/sign-out` with `credentials: 'include'`; 200 → `router.push('/')`; 401 → also `router.push('/')` (success-equivalent); 403 → renders origin-mismatch error copy.
  - **`tests/lib/auth/safe-next.test.ts`:** unit tests on the validator function — all 4 rules + edge cases.
  - **`tests/proxy.test.ts` update:** the existing CB-1.4 test for "dashboard redirect on no auth" updates to expect `/sign-in?next=%2Fdashboard` rather than `/?next=%2Fdashboard`. One file, one assertion changed.
  - All tests pass via `pnpm test`.

- [x] **AC 8 — Codex writes E2E** under `e2e/auth/onboarding.spec.ts`:
  - **Fresh-instance journey:** start with zero `auth_credentials` rows. Visit `/` → expect State A. Click "Set up your passkey" → land on `/setup`. Trigger the WebAuthn ceremony via Playwright's virtual authenticator. Expect to land on `/dashboard` with "Signed in." rendered. < 5 minutes total wall-clock (Playwright measures + asserts the guardrail — the bet's `time-to-first-authenticated-dashboard < 5 min` is mechanically verified here for the first time).
  - **Returning-operator journey:** with a registered credential pre-seeded, visit `/` → expect State B. Click "Sign in" → land on `/sign-in`. Trigger the WebAuthn auth ceremony. Expect to land on `/dashboard`.
  - **Deep-link preservation:** visit `/dashboard/somewhere-future-nonexistent` while unauthenticated → expect 302 to `/sign-in?next=%2Fdashboard%2Fsomewhere-future-nonexistent`. Complete sign-in. Expect to land on `/dashboard/somewhere-future-nonexistent` (which 404s in this story but verifies the `?next=` round-trip — the framework handles the 404 cleanly).
  - **`?next=` malicious-payload rejection:** visit `/sign-in?next=//evil.example`. Sign in. Expect to land on `/dashboard` (NOT `evil.example`) — the consumer-side allowlist dropped the param.
  - **Sign-out round trip:** signed-in operator on `/dashboard` clicks "Sign out". Expect to land on `/` State B (creds still exist, just no active session). Re-attempt access to `/dashboard` directly → 302 back to `/sign-in?next=%2Fdashboard`.
  - Codex commits with `test:` prefix per `/build` Phase 3.

- [x] **AC 9** — `pnpm typecheck` passes with `strict: true`. No `any`. All env access via `lib/env`. No `process.env` reads in any new `app/*` file.

- [x] **AC 10** — `pnpm lint` passes. No new ignore entries.

- [x] **AC 11** — `pnpm build` produces a successful production build AND build output shows all 4 new routes registered per [`[mechanical-output-verification]`](../../../../foundation/architecture.md):
  - `app/page.tsx` route entry exists in `.next/server/app-paths-manifest.json` (already existed pre-CB-1.6; content changes but path doesn't).
  - `app/setup/page.tsx` registered at path `/setup/page` in `.next/server/app-paths-manifest.json` (NEW).
  - `app/sign-in/page.tsx` registered at path `/sign-in/page` in `.next/server/app-paths-manifest.json` (NEW).
  - `app/dashboard/page.tsx` registered (already existed; content changes).
  - `app/(dashboard)/` directory REMOVED — the manifest no longer has any `(dashboard)` entries.
  - The Next 16 routing-layer manifests (`functions-config-manifest.json` for middleware/proxy; unchanged this story since proxy.ts edit is content-only) remain consistent.

- [x] **AC 12** — **Accessibility checks pass** per [design.md § Accessibility checklist](./design.md#accessibility-checklist-this-design):
  - Focus moves to primary CTA on mount of each page (`/`, `/setup`, `/sign-in`) and to sign-out button on `/dashboard` mount.
  - Tab + Enter activates each CTA; Esc dismisses error region.
  - Error region uses `role="alert"` so SR announces failures immediately.
  - WCAG 2.1 AA contrast verified at implementation time (manual check; document the Tailwind tokens used in story DRI if any custom palette).
  - `prefers-reduced-motion: reduce` honored — no animated spinners; substitute static text per design.

## Standard Experience Checklist

Each category is covered by ≥1 AC OR explicitly `n/a — <reason>`.

- [x] **Navigation** — **covered by AC 1, AC 2, AC 3, AC 4, AC 5** — every state transition is named: `/` → `/setup` or `/sign-in`; `/setup` → `/dashboard` on success; `/sign-in` → `safeNext || /dashboard`; `/dashboard` → `/` on sign-out; proxy.ts redirect to `/sign-in?next=` from protected routes; `?next=` round-trip verified end-to-end in AC 8.
- [x] **States** — **covered by AC 1 (3 states on `/`), AC 2 (idle / in-flight / success / 7 error variants on `/setup`), AC 3 (idle / in-flight / success / 7 error variants on `/sign-in`), AC 4 (default / sign-out in-flight / sign-out error)** — every state on every surface has typed copy + tested behavior.
- [x] **Feedback** — **covered by AC 2, AC 3, AC 4 + [copy.md error tables](./copy.md#error-messages)** — every error condition is typed in copy.md with discriminated messages (browser-not-supported / user-cancel / verification-failed / counter-replay / rate-limited / origin-mismatch / network); success states get explicit "Passkey registered" / "Signed in" transients; sign-out gets the success-equivalent 401 path documented.
- [x] **Accessibility** — **covered by AC 12** — focus management, keyboard nav, screen-reader labels, WCAG AA contrast, reduced-motion all named and gated. First story in the codebase with this category not marked n/a.
- [x] **Edge cases** — **covered by AC 1 (active session on `/`), AC 2 (race against concurrent registration → 409 typed copy), AC 3 (`?next=` adversarial inputs + count = 0 race), AC 4 (sign-out 401 mid-flight as success-equivalent), AC 6 (scaffold collision), AC 7 (validation matrix)** — adversarial `?next=` shapes tested explicitly; concurrent-registration race is closed by CB-1.2 migration 0002 + this story's 409 typed error; sign-out race is the documented idempotency posture from CB-1.5.
- [x] **Cross-surface consistency** — **`n/a — single-target web stack`** (same justification as CB-1.2 through CB-1.5; no mobile/native surface in MVP).

## Tech notes

**Architecture references:**
- [foundation/architecture.md § Foundational Identity & Access Posture / Authenticated surface enumeration](../../../../foundation/architecture.md#foundational-identity--access-posture): the table that names every gated surface; CB-1.6 implements the auth UX side of those gates.
- [foundation/architecture.md § Cross-cutting standards § Auth](../../../../foundation/architecture.md#foundational-identity--access-posture): "All routes outside /api/auth/* and /api/cron/* require valid session cookie verified against auth_sessions table" — every new page implements this either by going through proxy (`/setup`, `/sign-in`, `/dashboard` for the latter is proxy-gated; the formers are public ceremony entries and use server-side count-of-credentials as the gate analog instead).
- CB-1.4 Engineer DRI Decision #5 "Defense-in-depth posture": `/dashboard`'s server component reads proxy-forwarded `x-session-*` headers for rendering convenience but does NOT trust them for any state-mutating action. CB-1.6 doesn't introduce state-mutation handlers on `/dashboard`, so the convenience-only posture suffices.

**Brief references:**
- [CB-1 brief § Open questions for Researcher / implementation](../../brief.md): "First-deploy onboarding flow" is closed by this story's PM Decisions + design.md + copy.md. "Device labeling UX" is closed by PM Decision #2 (auto-detect from user-agent; no form field).
- [CB-1 brief § Guardrails / "Time-to-first-authenticated-dashboard-view at initial setup < 5 minutes"](../../brief.md): AC 8's "Fresh-instance journey" Playwright spec asserts this guardrail end-to-end for the first time.

**Boundaries (per CB-1 brief Scope):**
- `app/page.tsx` — already exists; content changes (CB-1.6 owns the new mode-detecting Server Component).
- `app/setup/page.tsx` + `app/setup/lib/device-label.ts` — NEW.
- `app/sign-in/page.tsx` — NEW.
- `app/dashboard/page.tsx` — already exists; content changes (CB-1.6 ships the signed-in landing + sign-out button).
- `app/(dashboard)/` — DELETED (scaffold cleanup per AC 6).
- `lib/auth/safe-next.ts` — NEW (shared validator; exported for future proxy.ts consolidation but not consumed by proxy.ts in this story).
- `proxy.ts` (root) — one-line redirect target change per AC 5.
- `tests/` — new files per AC 7; one assertion change in existing `tests/proxy.test.ts`.
- `e2e/auth/onboarding.spec.ts` — NEW (Codex AC 8).

**Library APIs consumed:**
- `verifySession` from `@/lib/auth/sessions` — used by `/`'s session-detection branch + `/setup`'s active-session redirect + `/sign-in`'s active-session redirect.
- `db()` from `@/lib/db/client` — for `SELECT count(*) FROM auth_credentials` on the count-detection branches.
- `redirect` + `useRouter` from `next/navigation` — server-side and client-side redirects.
- `startRegistration` + `startAuthentication` from `@simplewebauthn/browser` — client-side WebAuthn calls.
- No library extensions in this story.

**The < 5-min guardrail:**
This is the first story where the brief's "time-to-first-authenticated-dashboard < 5 minutes" guardrail can be mechanically tested. AC 8's Playwright spec asserts it. The expected baseline on a fresh-deploy: click "Set up" → passkey ceremony (~3 seconds with Touch ID) → land on dashboard. Real-world should be well under 1 minute on a warm browser; the 5-min cap is operator-relevant (cold-cache, first deploy, possibly unfamiliar device). If the spec ever takes >5 min, the guardrail miss is reported and we either revise the target or scope a UX-polish follow-up.

**Out of scope (this story; deferred to post-MVP or other bets):**
- Real `/dashboard` content (bot status, recent trades, decision trace, manual override controls) — CB-2.
- Settings / account management UI (rename device, rotate session secret, etc.) — post-MVP.
- Multi-device passkey enrollment from `/dashboard` — post-MVP per portfolio scope.
- Backup recovery code redemption UI — post-MVP per portfolio scope.
- WebAuthn conditional UI / autocomplete — post-MVP per CB-1 brief.
- Localization / theme switching — n=1 operator picks at build.
- Sentry per-page observability — same foundation-arch follow-up as CB-1.2 through CB-1.5.
- Consolidating `proxy.ts`'s `?next=` emit-side validation to import from `lib/auth/safe-next.ts` — proxy.ts already has its own inline emit-side checks from CB-1.4; the new shared helper this story ships is for the consumer side. Consolidation can land as continuous-improvement post-CB-1.

**Testing approach** — Vitest for unit + integration with React Testing Library for client components, Playwright for E2E (per the now-established CB-1 pattern across CB-1.2 / CB-1.3 / CB-1.4 / CB-1.5). The `app/page.tsx` Server Component render-path is testable via Next.js's Server Component test harness (the same one used implicitly by CB-1.4's proxy tests for SSR-shape verification).

## PRs

- [PR #17](https://github.com/vivekschaudhary/crypto-bot/pull/17) — **merged 2026-06-04** (squash merge commit `9d26b8c`) — feat(CB-1.6): first-deploy onboarding UX (4 surfaces + scaffold cleanup). **4-commit review cycle across 3 rounds** + AC 8 E2E commit by Codex. Round 1 surfaced 3 BLOCKERs (proxy.ts gating `/setup` + `/sign-in` → infinite loop, `device_label` vs `deviceLabel` key drift dropping the UA-derived label, AC 8 E2E missing) + 3 ISSUEs (focus management on `/`, direct `process.env` read in sign-in, duplicated "Go to sign in" copy in setup race error). Round 2 surfaced 1 BLOCKER (`.gitignore` `test-results/` scope drift vs AC 10 strict reading) + 1 ISSUE (dev-only diagnostic hook removed). Round 3 clean. **Codex's AC 8 E2E (`962e262`) surfaced 2 real production bugs** in `app/setup/setup-client.tsx` + `app/sign-in/sign-in-client.tsx` that my unit tests masked: `@simplewebauthn/browser@11` API drift (`startRegistration({ optionsJSON })` not `startRegistration(options)`) + begin endpoint response shape (`{ options }` not options-at-top-level). Static mocks couldn't see the runtime contract; real Playwright + virtual authenticator did. Clean replication of the `[mechanical-output-verification]` pattern (canon.md v0.3.6 + the Next 16 anchor we patched on PR #12) — one layer earlier than prior cycles. The fix shipped in the same E2E commit. Final state: 246 Vitest tests + 5 Playwright E2E (sign-out, register, authenticate, proxy-gating, onboarding) all green. **Engineer DRI Decisions:** React 19 explicit `JSX` import; `vi.hoisted()` pattern for Server Component tests (first story with this surface); JSX-tree walk over spy assertion for SignInClient.safeNext; `safe-next.ts` consumer extracted but proxy emit-side stayed inline (consolidation deferred per PM DRI #3 — then closed earlier than planned via PR #18 below).

- [PR #18](https://github.com/vivekschaudhary/crypto-bot/pull/18) — **merged 2026-06-05** (squash merge commit `4e6c7ea`) — fix: close M1 (DB DoS) + M2 (safe-next drift) from 2026-06-04 codebase security audit. **4-round review cycle.** Closes the two MEDIUM findings from the [operator-requested fresh-Agent codebase audit](../../../../retros/2026-06-04-codebase-security-audit.md). **M1:** new [`lib/auth/credential-count.ts`](../../../../../lib/auth/credential-count.ts) wraps the `count(*) FROM auth_credentials` query with Next.js `unstable_cache` + 60s TTL + tag-based invalidation; `register/finish` calls `revalidateTag(CREDENTIAL_COUNT_TAG, "default")` after successful registration. Defends the `*/15` bot tick against postgres.js-pool exhaustion via burst-flood on the 3 pre-auth pages. **M2:** [`lib/auth/safe-next.ts`](../../../../../lib/auth/safe-next.ts) is now single source of truth for the `?next=` allowlist (stricter `includes("//")` rule); [proxy.ts](../../../../../proxy.ts) imports from there; inline copy deleted. **Closes PM DRI Decision #3 deferral** ("consolidation can land as continuous-improvement post-CB-1") — earlier than scheduled because the audit elevated the drift from "tech debt" to "false documented invariant." Codex review rounds: R1 surfaced 2 BLOCKERs (`updateTag` is Server-Action-only per Next 16 docs → swap to `revalidateTag(tag, profile)`; long TTL leaves runbook recovery stuck → drop 1h→60s); R2 surfaced 1 ISSUE (60s still weakens recovery + tests mock past cache → runbook update + mechanical contract tests); R3 surfaced 1 ISSUE (false `vercel redeploy` fast-path — `unstable_cache` writes to the Data Cache which Vercel persists across deploys → honest "no fast path other than waiting" prose); R4 clean. Final: 260 Vitest tests; security review clean throughout all 4 rounds.

## Tests

_Engineer writes unit + integration tests under `tests/app/*.test.ts` + `tests/lib/auth/safe-next.test.ts` + the `tests/proxy.test.ts` assertion update._
_Codex writes E2E at `e2e/auth/onboarding.spec.ts` — fifth E2E in the codebase per AC 8._

Tags:
- `regression: true` (proxy redirect target moves; landing/dashboard semantics change; scaffold collision resolves)
- `e2e: true` (AC 8)

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `docs/bets/CB-1/stories/CB-1.6/fixes/`._

## DRI Log

### Decisions

- [2026-06-03] [PM] **Auth surface structure: Split `/` landing + `/sign-in` + `/setup`** (anchor decision per elicitation-with-options pattern)
  - **Rationale (required):** operator picked Option B during structural-anchor AskUserQuestion at story creation. Three routes give room for marketing content on `/` if the product ever opens up (it won't per current portfolio scope, but the structural commitment is reversible). Conventional SaaS shape; clean separation between landing intent (`/`), first-time setup (`/setup`), and recurring auth (`/sign-in`). CB-1.4's proxy redirect target updates from `/` to `/sign-in` to match — one-line change documented in AC 5.
  - **Area (required, tag):** auth / routing / ux
  - **Alternatives considered (required):** Single mode-detecting `/` page (rejected — would couple landing intent to auth ceremony, harder to evolve if marketing content ever needed); Pure auth on `/` with no landing copy (rejected — leaves no room for product framing should it ever be needed; even at n=1, a future tax accountant or backup operator might land here and benefit from minimal framing).
  - **Reversibility:** easy — merging back into single-page only takes a route delete + a one-line proxy.ts update.

- [2026-06-03] [PM] **Device label is auto-derived from `navigator.userAgent` at registration time — no form field on `/setup`**
  - **Rationale (required):** n=1 single-operator product. The `device_label` field on `auth_credentials` exists for multi-device futures (CB-2.x+); at MVP, asking the operator to type their own label adds friction to the < 5-min guardrail without providing value to the operator-of-one. The user-agent string carries enough information for the operator's own future reference ("Safari on macOS 15" is more useful than they'd be likely to type themselves anyway).
  - **Area (required, tag):** auth / ux / scope
  - **Alternatives considered (required):** form field on `/setup` (rejected — adds friction; no MVP value); leave `device_label` NULL and surface later (rejected — UA capture is free at registration time, capturing it now keeps the future multi-device UX honest); use a structured `{os, browser}` shape rather than free-text (deferred — story-level decision can move later if needed without affecting any contract).
  - **Reversibility:** easy — schema field is already nullable; switching to a form field later is one component change.

- [2026-06-03] [PM] **`?next=` consumer revalidation on `/sign-in` is mandatory, not advisory** (closes the CB-1.4 HIGH security-review finding's downstream contract)
  - **Rationale (required):** CB-1.4 PR #10 security review surfaced "open-redirect via `?next=`" as a HIGH; the emit-side fix landed in proxy.ts. The contract documented in CB-1.4's design + DRI required the consumer (CB-1.6) to re-apply the same allowlist independently — defense-in-depth across the boundary. Implementing the 4 rules verbatim (start with `/`, no `//`, no `\`, no `:` before `/`) + silently dropping invalid values closes the contract. The helper lives at `lib/auth/safe-next.ts` so future routes that consume `?next=` (none today) inherit the validator without re-implementing.
  - **Area (required, tag):** security / auth
  - **Alternatives considered (required):** trust the emit-side (rejected — defense-in-depth requires symmetric checks); inline the validator in `app/sign-in/page.tsx` (rejected — shared helper is the structural defense against future drift); reject invalid `?next` with a typed error to the user (rejected — legitimate operator never crafts malicious values, so the only audience for "your next was rejected" copy is an adversary; silent drop matches the architecture's "no information disclosure on rejection" posture).
  - **Reversibility:** trivial — helper export + one import per consumer.
  - **Load-bearing source-code marker:** `lib/auth/safe-next.ts` carries an inline comment naming the CB-1.4 security-review finding it closes; future readers can trace the rationale without leaving the file.

- [2026-06-03] [PM] **Sign-out trigger lives on `/dashboard` top-right chrome, not in a settings menu** (per design Decision #5)
  - **Rationale (required):** n=1 operator product has no settings menu yet; promoting sign-out to primary chrome makes the auth loop visible and immediately reachable. CB-1.5 shipped the server-side endpoint; without a UI trigger the loop is half-built. Top-right placement matches widespread SaaS convention and isn't worth deviating from at MVP.
  - **Area (required, tag):** ux / auth
  - **Alternatives considered (required):** settings menu (rejected — no settings menu exists; building one for one menu item is over-architected); user-avatar dropdown (rejected — same over-architecture concern at n=1); footer link (rejected — sign-out should be primary, not buried).
  - **Reversibility:** easy — when CB-2 ships a settings menu, the button moves; no API change.

- [2026-06-03] [PM] **`/dashboard` proxy-forwarded `x-session-*` headers used for rendering convenience without re-verifying** (consistent with CB-1.4 Engineer Decision #5)
  - **Rationale (required):** the architecture's defense-in-depth posture (CB-1.4 Engineer DRI #5) requires state-mutating handlers to call `verifySession` independently of proxy gating. `/dashboard` in this story is read-only — it renders the operator's signed-in status and provides a button that POSTs to a separately-defense-in-depth-protected endpoint (`/api/auth/sign-out` re-verifies). The page-render itself is not state-mutating; trusting proxy's forwarded headers for "what to render" is acceptable. If `/dashboard` ever adds state-mutating actions inline (Server Action mutations), those handlers MUST re-verify per the established posture.
  - **Area (required, tag):** auth / defense-in-depth / rendering
  - **Alternatives considered (required):** re-call `verifySession` server-side on every `/dashboard` render (rejected — would double DB load on the highest-traffic authenticated surface with no security gain; the proxy already verified the same session ID 1 ms ago); strip the proxy-forwarded headers entirely (rejected — they're useful for the device-label lookup convenience).
  - **Reversibility:** easy — adding `verifySession` is one server-component line if a future story decides the trade-off is wrong.
  - **Load-bearing source-code marker:** `app/dashboard/page.tsx` carries an inline comment naming this convention so future readers see the constraint at the point where it's relied on.

- [2026-06-03] [PM] **Scaffold cleanup: delete `app/(dashboard)/page.tsx`** (closes the latent Engineer Issue from CB-1.4 story.md:242)
  - **Rationale (required):** CB-1.4 Engineer Issue surfaced that `app/page.tsx` AND `app/(dashboard)/page.tsx` both nominally resolve to `/` per Next.js App Router route-group semantics. The collision was harmless because the proxy was pathname-based and Next.js was resolving it via precedence rules, but the redundant file is dead weight + a latent confuser for any future engineer touching routing. CB-1.6 is the right time to delete it because we're touching every other landing/auth surface anyway.
  - **Area (required, tag):** scaffold / routing
  - **Alternatives considered (required):** leave it (rejected — confusing scaffold artifact); use `(dashboard)` route group for layout grouping (rejected — `app/dashboard/page.tsx` is the real route and doesn't need a layout group at n=1; can introduce later if needed); rename to a meaningful route group like `(authenticated)` (deferred — premature without a real layout-grouping need).
  - **Reversibility:** trivial — `mkdir + cp` if ever needed.
  - **Load-bearing regression test:** AC 6 ships a one-test regression that asserts the directory doesn't exist; catches re-introduction.

### Risks

- [2026-06-03] [PM] **WebAuthn browser-quirk surfaces only at this story** (first time end-to-end ceremony lands in a real browser context vs. virtual authenticator)
  - **Likelihood (required):** medium (CB-1.2 and CB-1.3 shipped the API side with Playwright + virtual authenticator coverage; real-browser passkey UI hasn't been exercised yet — operator's actual Safari / Chrome may have quirks the virtual authenticator didn't surface)
  - **Impact (required):** low-medium (single-operator + runbook recovery means stuck-on-quirks doesn't lock anyone out for long; would surface as a deploy-quality issue not a security issue)
  - **Mitigation (required):** AC 8's Playwright spec uses the virtual authenticator for repeatability + the operator should manually run through the < 5-min flow on their actual production browser before declaring CB-1 done. If a specific browser is consistently broken, scope a follow-up `/fix` (not a re-open of this story — story-as-shipped covers the spec'd behavior). Risk inherited from CB-1 brief PM Risk #2 ("WebAuthn UX quirks across browsers"); CB-1.6 is where it gets tested for real.
  - **Area (required, tag):** auth / browser-compat / ux

- [2026-06-03] [PM] **Real-browser `< 5 min` measurement may differ from Playwright measurement** (the guardrail's audience is the operator, not the spec)
  - **Likelihood (required):** low (Playwright + virtual authenticator is faster than real Touch ID; the operator's actual flow should be well under)
  - **Impact (required):** medium if it bites (the < 5-min guardrail is a brief-level commitment; a miss requires re-baselining)
  - **Mitigation (required):** AC 8 measures the Playwright path which is a LOWER bound (real life is at least this fast). If the operator's actual first-deploy takes > 5 min, that's a real guardrail miss + indicates a UX problem worth a follow-up. PM check-in cadence (weekly per brief frontmatter) catches this.
  - **Area (required, tag):** measurement / ux

- [2026-06-03] [PM] **`/setup` `count >= 1` race-gate UX edge case**
  - **Likelihood (required):** low (single operator, race requires two browser tabs at the same instant on initial setup — extremely rare)
  - **Impact (required):** low (typed 409 error copy guides to `/sign-in`; CB-1.2 migration 0002 closes the back-end; UI just needs to handle the typed error)
  - **Mitigation (required):** AC 2 + AC 7 explicitly test the 409 path; copy.md error table includes the "already has a passkey registered" case with a CTA link to `/sign-in`. Operator can recover in one click.
  - **Area (required, tag):** auth / ux / race

- [2026-06-03] [PM] **Server-component `count(*)` on `/` adds a DB read to every unauthenticated page load** (was previously a static page)
  - **Likelihood (required):** certain (it's the architectural choice for State A vs State B detection)
  - **Impact (required):** low (Vercel + Supabase pooler; cold-start DB query on Fluid Compute is ~10-20 ms; the page is unauthenticated so most traffic is the operator's once-per-session navigation, not high-RPS public traffic)
  - **Mitigation (required):** Fluid Compute's instance reuse keeps the postgres.js pool warm; Supabase pooler (port 6543) handles multiplexing. If the count-read ever becomes user-visible latency (P90 landing-page render > 500 ms), Vercel's Edge Config (per the Vercel routing-middleware skill loaded for CB-1.4) could be considered for the `is-set-up` bit cached at the edge — but that's a future optimization story, not a current concern.
  - **Area (required, tag):** performance

### Issues

_None at story creation._

---

_Story closed: 2026-06-05 (via PR #17 + security follow-up PR #18), brief link: [docs/bets/CB-1/brief.md](../../brief.md)_

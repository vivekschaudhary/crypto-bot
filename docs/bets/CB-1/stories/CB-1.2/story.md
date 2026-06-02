---
id: CB-1.2
bet: CB-1
type: story
status: shipped
priority: P0
created: 2026-05-31
shipped: 2026-06-01
author: PM
design_link: n/a (no UI surface — HTTP endpoints only; onboarding UX is CB-1.6)
area_tags: [auth, backend, endpoints]
dependencies: [CB-1.1]
---

# CB-1.2 — Passkey registration ceremony endpoints (`/api/auth/register/begin` + `/api/auth/register/finish`)

## Description

Land the **first-time-only** passkey registration flow as two `POST` route handlers in the Next.js App Router. After this story, the operator can hit `/api/auth/register/begin` → run `navigator.credentials.create()` in the browser → POST the result to `/api/auth/register/finish` and end with (a) a credential row in `auth_credentials`, (b) a user row in `auth_users`, (c) an active session row in `auth_sessions`, and (d) a `Set-Cookie` header attaching that session to the browser. The endpoints consume the now-shipped `lib/auth/` library; no library changes in this story.

This story is **endpoint-only** — there is no UI in scope. The first-deploy onboarding page (calling `navigator.credentials.create()` and POSTing the result) lands in CB-1.6. Authentication (re-signing-in with an existing passkey) lands in CB-1.3. Multi-device registration is **out of scope per [foundation/portfolio.md § Deliberately out of MVP](../../../foundation/portfolio.md#deliberately-out-of-mvp)**.

## Acceptance Criteria

- [ ] **AC 1** — `POST /api/auth/register/begin` at `app/api/auth/register/begin/route.ts`. **Amended 2026-05-31 by Engineer DRI Decision — see DRI Log § Decisions below.** `pendingUserId` is bound in the challenge cookie, not returned to the client; closes Risk #3 by design.
  - Request body (Zod-validated): `{ deviceLabel?: string }`. If absent, defaults to `Initial device (registered <ISO date>)`.
  - Mints a fresh ULID `pendingUserId` server-side.
  - Mints a challenge via `mintChallenge('registration')` from `lib/auth/challenges`.
  - Calls `generateRegistrationOptions({ userId: pendingUserId, userName: 'operator', excludeCredentials: [] })` from `lib/auth/webauthn` (options-object signature per CB-1.1 AC 1 amendment).
  - Builds a `regSession` payload bound to both: `{ challenge, pendingUserId, deviceLabel }` — signed via `signValue` from `lib/auth/cookie` with 60-second TTL. Set as a single short-lived cookie `Set-Cookie: __compass_reg_session=<signedToken>; HttpOnly; Secure; SameSite=Strict; Path=/api/auth/register/finish; Max-Age=60`.
  - Returns `200` with body `{ options: PublicKeyCredentialCreationOptionsJSON }`. **No `pendingUserId` in the response body** — only `options` (which contains `user.id` per WebAuthn spec; the server-trusted source-of-truth is the cookie).
  - Returns `403 { error: 'registration-disabled' }` if any `auth_users` row already exists (first-time-only gate). Multi-device flow is deferred.

  **Original AC 1 text** (pre-amendment, retained for audit): mints challenge via mintChallenge; returns `{ options, pendingUserId }` in response body; sets only the challenge cookie (no userId binding); `pendingUserId` flows back to /finish via request body.

- [ ] **AC 2** — `POST /api/auth/register/finish` at `app/api/auth/register/finish/route.ts`. **Amended 2026-05-31 by Engineer DRI Decision (same as AC 1).** `pendingUserId` is read from the cookie, not the request body — no integrity-binding gap.
  - Request body (Zod-validated): `{ response: RegistrationResponseJSON }`. (No `pendingUserId`, no `deviceLabel` — both come from the cookie.)
  - Reads `__compass_reg_session` cookie; verifies via `verifyValue(signedToken, secret)` from `lib/auth/cookie`. Parses JSON payload `{ challenge, pendingUserId, deviceLabel }`. Returns `400 { error: 'challenge-missing-or-expired' }` if cookie absent / signature invalid / expired / payload malformed.
  - Calls `verifyRegistrationResponse({ response, expectedChallenge })` from `lib/auth/webauthn`. Returns `400 { error: 'verification-failed' }` if `verified: false` or the wrapper throws.
  - On success, inside a single DB transaction (`sql.begin`):
    - INSERT `auth_users` row with `id = pendingUserId`, `created_at = now()` — **but only if no `auth_users` row already exists** (first-time-only DB-level gate; race-safe via `INSERT … WHERE NOT EXISTS` or unique-constraint catch).
    - INSERT `auth_credentials` row with `credential_id`, `public_key`, `counter`, `device_label`, `user_id = pendingUserId`, `last_used_at = now()`.
    - Create session via `createSession(pendingUserId)` from `lib/auth/sessions`; the helper inserts the `auth_sessions` row.
  - Clears the challenge cookie (`Set-Cookie: __compass_reg_challenge=; Max-Age=0; Path=/api/auth/register/finish`).
  - Sets the session cookie (`Set-Cookie: __compass_session=<signedCookie>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000` — 30 days).
  - Returns `200 { userId, sessionId }`.

- [ ] **AC 3** — **First-time-only gate enforced at both endpoints.** `/begin` returns `403` if any user row exists; `/finish`'s DB transaction is race-safe (unique-constraint on `auth_users.id` OR conditional INSERT pattern that fails if any user exists). The path of "multiple users" cannot succeed.

- [ ] **AC 4** — **Origin check on both endpoints** (defense-in-depth against CSRF on POST flows; required by [foundation/architecture.md § Foundational Identity & Access Posture](../../../foundation/architecture.md#foundational-identity--access-posture)).
  - Reject with `403 { error: 'origin-mismatch' }` if the request's `Origin` header (or `Referer` host) does not match `APP_ORIGIN` from `lib/env`.
  - Reject `OPTIONS` preflight from cross-origin (return `403`).
  - Story-internal helper `lib/auth/origin-check.ts` exports `verifyOriginOrThrow(request, env)`; reused by future `/api/auth/*` and `/api/auth/recovery` endpoints.

- [ ] **AC 5** — **Rate limiting** on both endpoints. Concrete bound: per-origin **5 requests per minute** sliding window. First MVP implementation uses in-memory token bucket scoped to the runtime invocation (good-enough for n=1 operator; documented limitation that Vercel Fluid Compute reuses instances within a region and thus rate limits hold approximately, not perfectly). Returns `429 { error: 'rate-limited', retryAfterSeconds: <n> }`. Implementation goes in `lib/auth/rate-limit.ts` with a comment noting the limitation and a TODO pointer for the Redis-backed swap if multi-instance becomes relevant.

- [ ] **AC 6** — **Cookie attributes verified in tests.** Both `Set-Cookie` headers asserted to contain `HttpOnly`, `Secure`, `SameSite=Strict`, and the correct `Path` + `Max-Age` — per the CB-1.1 brief's PM Risk #2 ("cookie attribute construction at the HTTP-handler layer is deferred to a later story") which this story closes.

- [ ] **AC 7** — **Vitest unit + integration tests** under `tests/api/auth/register/`:
  - `begin.test.ts` — happy path returns 200 + Set-Cookie + options; rejects if user exists (403); rejects bad body (400); origin-mismatch returns 403; rate-limit hits 429 after 5 calls.
  - `finish.test.ts` — happy path inserts user + credential + session + clears challenge cookie + sets session cookie + returns 200; rejects missing challenge cookie (400); rejects tampered challenge (400); rejects failed verification (400); rejects when user already exists at DB-level (race) (409 or 403 — Engineer's call per AC 3).
  - Integration tests use a real Supabase test branch OR a tightly-scoped DB mock; Engineer's call. Prefer real DB if the test-branch cost is trivial.
  - All tests pass via `pnpm test`.

- [ ] **AC 8** — **Codex writes E2E tests** under top-level `e2e/auth/register.spec.ts` (first E2E story per CB-1.1 Tests note). Codex E2E covers the full happy path: hit `/api/auth/register/begin` → in a headless browser, run `navigator.credentials.create()` against a SimpleWebAuthn `@simplewebauthn/server`-compatible authenticator simulator (Playwright + virtual-authenticator API) → POST to `/finish` → assert `__compass_session` cookie present + DB row count = 1 user / 1 credential / 1 session. **This AC is Codex's, not Engineer's.** Codex commits the E2E with a `test:` prefix per `/build` Phase 3.

- [ ] **AC 9** — `pnpm typecheck` passes with `strict: true`. No `any` introduced. All env access goes through `lib/env`. No `process.env` reads inside `app/api/auth/register/**` source files.

- [ ] **AC 10** — `pnpm lint` passes (existing eslint flat config; no new ignores beyond what's already there).

- [ ] **AC 11** — `pnpm build` (production build) succeeds. Both new routes appear in the route manifest.

- [ ] **AC 12** — **DB migrations land in this story** (creating `auth_users`, `auth_credentials`, `auth_sessions` tables) IF they don't already exist. Check first — if CB-1.1 already shipped migrations, this AC is satisfied by their existence + a one-line confirmation in the PR description; otherwise migrations are added under `db/migrations/`. Migrations are idempotent (`CREATE TABLE IF NOT EXISTS`). Schema matches what `lib/auth/sessions.ts` and the verify wrappers expect.

## Standard Experience Checklist

Each category is covered by ≥1 AC OR explicitly `n/a — <reason>`. Per the workflow's "every category" rule.

- [x] **Navigation** — **`n/a — pure HTTP endpoint story; no UI surface in scope`**. The browser-side `navigator.credentials.create()` ceremony has no in-page navigation states; first-deploy onboarding UX (which would have nav surfaces: home / setup / dashboard transitions) is deferred to CB-1.6.
- [x] **States** — **covered by AC 1, AC 2, AC 4, AC 5** — HTTP states explicitly enumerated: 200 (success), 400 (bad request / verification fail / challenge missing), 403 (registration disabled / origin mismatch), 409 (race on first-time guarantee, optional), 429 (rate limited). Loading / empty / disabled UI states are n/a in this story (no UI).
- [x] **Feedback** — **covered by AC 1, AC 2, AC 5** — every error response body has a typed `error` discriminator (`registration-disabled` / `challenge-missing-or-expired` / `verification-failed` / `origin-mismatch` / `rate-limited`) so the future UI consumer (CB-1.6) can route the error meaningfully. Success responses return structured `{userId, sessionId}` rather than just 200 OK.
- [x] **Accessibility** — **`n/a — pure HTTP endpoint story; no UI focus management / keyboard / screen-reader surface`**. The eventual onboarding UX in CB-1.6 will own focus + keyboard + screen-reader semantics.
- [x] **Edge cases** — **covered by AC 2, AC 3, AC 4, AC 5, AC 7** — tampered challenge, expired challenge, cross-purpose challenge token, failed WebAuthn verification, duplicate user race (DB-level), origin mismatch, rate limit boundaries. AC 7's failure-case tests enforce each.
- [x] **Cross-surface consistency** — **`n/a — single-target web stack`**. Per [foundation/architecture.md Stack table](../../../foundation/architecture.md), there is one deploy target (web) and no mobile / native variant for MVP.

## Tech notes

**Architecture reference** — [foundation/architecture.md § Foundational Identity & Access Posture](../../../foundation/architecture.md#foundational-identity--access-posture) — credential strategy, session strategy, recovery posture, attack-surface analysis, secrets-at-rest. This story implements the HTTP-handler layer of that posture; CB-1.1 already landed the library layer.

**Brief reference** — [CB-1 brief](../../brief.md) — scope, hypothesis, guardrails. CB-1.2 is the second of ~6 expected stories. Closes the first half of CB-1's primary metric ("sign-in success rate ≥ 99%") — registration is half the surface; authentication (CB-1.3) is the other half.

**Library APIs consumed (all shipped via CB-1.1 + CB-1.1.1):**

```ts
// from lib/auth/challenges
mintChallenge('registration'): { challenge, signedToken }
consumeChallenge(signedToken, 'registration'): { challenge } | null

// from lib/auth/webauthn  (options-object shape per CB-1.1 AC 1 amendment)
generateRegistrationOptions({ userId, userName, excludeCredentials? }): Promise<PublicKeyCredentialCreationOptionsJSON>
verifyRegistrationResponse({ response, expectedChallenge }): Promise<VerifiedRegistrationResponse>

// from lib/auth/sessions
createSession(userId): Promise<{ sessionId, signedCookie }>

// from lib/auth/cookie
signValue(value, secret, maxAgeSeconds): string  // used only for challenge cookie minting if needed; mintChallenge already wraps this
```

**Module boundaries (new in this story):**

```
app/api/auth/register/
  begin/route.ts        # POST handler — generates options + sets challenge cookie
  finish/route.ts       # POST handler — verifies + writes user/credential/session + sets session cookie

lib/auth/
  origin-check.ts       # shared origin verifier (consumed by /api/auth/* + /api/auth/recovery later)
  rate-limit.ts         # in-memory token bucket; documented MVP limitation
```

**Out of scope (deferred to subsequent stories or post-MVP):**
- Authentication ceremony (`/api/auth/authenticate/{begin,finish}`) — CB-1.3
- Sign-out (`/api/auth/sign-out`) — CB-1.5
- `proxy.ts` (at project root) real session-validation integration — CB-1.4
- First-deploy onboarding UX page that drives this flow — CB-1.6
- Multi-device passkey registration — **deferred post-MVP** per portfolio. The first-time-only gate (AC 3) intentionally blocks multi-device; that gate gets relaxed when multi-device returns post-MVP.
- Backup recovery code issuance — deferred post-MVP per portfolio (same reason as multi-device).
- Persistent (Redis-backed) rate limiting — TODO comment in `lib/auth/rate-limit.ts` per AC 5.

**Testing approach** — Vitest for unit + integration; Codex's Playwright + virtual-authenticator for E2E. Real Supabase test branch preferred over DB mocks where feasible (per CB-1.1 tech notes "prefer real DB if a test branch is trivial to spin up"). Use a `beforeEach` hook to truncate `auth_*` tables so the first-time-only gate is honored in each test.

## PRs

- [PR #5](https://github.com/vivekschaudhary/crypto-bot/pull/5) — **merged 2026-06-01** — feat(CB-1.2): passkey registration endpoints (begin + finish). Review cycle: 4 BLOCKERs surfaced + closed (atomicity, DB-singleton race, OPTIONS handler, typecheck mock cast); 1 follow-up BLOCKER on Codex re-review (canonical createSession in transaction) closed via `lib/auth/sessions.ts` additive `txClient` parameter. Codex E2E (AC 8) verified end-to-end against real Postgres + Chromium virtual authenticator.

## Tests

_Engineer writes unit + integration tests under `tests/api/auth/register/`._
_Codex writes E2E tests under `e2e/auth/register.spec.ts` — this is the first E2E story per CB-1.1's `Codex E2E starts at Story CB-1.2 when endpoints land` note._

Tags:
- `regression: true` (auth-touching endpoints — regressions cascade)
- `e2e: true` (first E2E in the codebase; AC 8)

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `docs/bets/CB-1/stories/CB-1.2/fixes/`._

## DRI Log

### Decisions

- [2026-05-31] [PM] **First-time-only registration; multi-device deferred to post-MVP** (per portfolio § Deliberately out of MVP)
  - **Rationale (required):** [foundation/portfolio.md](../../../foundation/portfolio.md) explicitly defers multi-device passkey registration to post-MVP. The architecture supports the multi-device path in principle (line 233), but MVP's first-device + last-resort-DB-recovery posture per [product.md § Identity & Access Posture / Recovery posture](../../../foundation/product.md) is the in-scope ceremony for now. AC 3's first-time-only gate at both API + DB layers makes the deferral structurally enforced rather than convention-only.
  - **Area (required, tag):** auth / scope
  - **Alternatives considered (required):** ship multi-device now (rejected — portfolio explicitly defers; would also drag in backup-recovery-code UX which is also post-MVP); ship without a gate (rejected — would silently allow a second registration, violating the single-operator posture); ship the gate at API only without DB-level race protection (rejected — the architecture's invariant is that "one user only" must hold under concurrent writes, not just sequential calls).
  - **Reversibility:** easy — when multi-device returns post-MVP, AC 3's gate becomes a conditional (allow if no user OR authenticated session). API/DB code touched: ~10 LOC.

- [2026-05-31] [PM] **Set the session cookie at `/register/finish` success (immediate sign-in after registration)**
  - **Rationale (required):** registration is itself an authentication moment — the operator just proved possession of the freshly-registered credential. Requiring a second `/authenticate` ceremony immediately after registration would be friction for no security gain (the session that gets created would be identical). [foundation/architecture.md § Session strategy](../../../foundation/architecture.md#foundational-identity--access-posture) says sessions rotate on each authentication; registration counts as the first authentication.
  - **Area (required, tag):** auth / UX
  - **Alternatives considered (required):** require a separate sign-in after register (rejected — friction without gain); set the session but mark it "registration-only" with elevated re-auth required for sensitive ops (rejected — overengineered for n=1 single-operator MVP).
  - **Reversibility:** easy — sessions can be force-rotated or removed by clearing the cookie at finish-time + redirecting to /authenticate; CB-1.6's onboarding UX can handle either path.

- [2026-05-31] [PM] **In-memory rate limiter for MVP; Redis-backed swap as a documented TODO**
  - **Rationale (required):** per [foundation/architecture.md](../../../foundation/architecture.md), Vercel Fluid Compute reuses instances within a region so in-memory state holds approximately across requests on the same instance. For n=1 operator on a single deploy target, the limit is "good-enough" to deter mass automation without adding a Redis/Upstash dependency. The limitation is real (multi-instance gaps in enforcement) and is documented at the implementation site so future-us doesn't forget. When traffic patterns or threat model change, the swap is a localized library replacement.
  - **Area (required, tag):** auth / rate-limit
  - **Alternatives considered (required):** Upstash Redis from day one (rejected — adds a vendor + secrets surface for an n=1 MVP); skip rate limiting entirely (rejected — public unauthenticated POST endpoint deserves at least a basic gate; the architecture's auth posture calls for rate limiting on `/api/auth/*` entry points); rely on Vercel's edge rate-limit features (rejected — not yet wired and adds another surface).
  - **Reversibility:** easy — `lib/auth/rate-limit.ts` is the single swap site.

- [2026-05-31] [Engineer] **Bind `pendingUserId` + `deviceLabel` in the challenge cookie payload (server-trusted source); do not return `pendingUserId` to the client** (amends AC 1 + AC 2 — closes story PM Risk #3 by design)
  - **Rationale (required):** PM Risk #3 ("`pendingUserId` could be tampered with on the way back") explicitly said "Engineer decides at implementation time; if cheap to add, do so." It is cheap — the challenge cookie already carries an HMAC-signed payload via `signValue`. Extending the payload from `{challenge}` to `{challenge, pendingUserId, deviceLabel}` adds a few lines at /begin (sign extra fields) + /finish (read them from cookie instead of request body) and removes the request-body fields entirely. Net result: the client never sees or supplies `pendingUserId`, so there is no tampering surface to begin with — Risk #3 closes by design rather than mitigation. Aligns with the architecture invariant that "the cookie alone is not trusted" applies in the OTHER direction too: don't trust client-supplied identity claims when the server can sign them itself.
  - **Area (required, tag):** auth / integrity-binding
  - **Alternatives considered (required):** keep AC 1's literal contract (return + accept `pendingUserId` in body) and just defer Risk #3 to a follow-up (rejected — the change is a few lines at the route layer and removes a vulnerability surface entirely; deferring would carry the surface into production); modify `lib/auth/challenges` to support binding (rejected — would extend the CB-1.1-shipped library, broader blast radius); use a second cookie (rejected — one cookie with a JSON payload is cleaner than two parallel signed values).
  - **Reversibility:** easy — the cookie payload shape is internal to these two route files. Future stories that want a client-side `pendingUserId` can re-add it as a returned field without breaking the cookie contract.

- [2026-05-31] [PM] **Challenge cookie scoped to `Path=/api/auth/register/finish`** (not the whole site or even `/api/auth/*`)
  - **Rationale (required):** narrow-as-possible Path attribute on the short-lived challenge cookie reduces the surface where it's transmitted. The cookie is only read by `/register/finish`; no other route should see it. Cross-purpose discriminator inside the token (`p: 'challenge', k: 'registration'`) provides defense-in-depth.
  - **Area (required, tag):** auth / cookie-scoping
  - **Alternatives considered (required):** `Path=/` (rejected — too broad; cookie would be sent on every request including non-auth routes); `Path=/api/auth` (rejected — would also send to `/authenticate/*` and `/recovery/*`, which don't need it).
  - **Reversibility:** trivial.

### Risks

- [2026-05-31] [PM] **AC 8 (Codex E2E) introduces Playwright + virtual-authenticator dependencies for the first time** — Codex hasn't written E2E in this repo yet
  - **Likelihood (required):** medium (any first-time tooling setup has friction)
  - **Impact (required):** low-to-medium (E2E is a Codex-owned AC; if blocked, the unit + integration coverage from AC 7 still ships and Codex tackles E2E in a follow-up; doesn't block the user-facing endpoints)
  - **Mitigation (required):** Engineer drafts a stub `playwright.config.ts` + the `e2e/` directory + a `pnpm` script (`pnpm e2e`) as part of the implementation diff so Codex has a working harness to fill in. The architecture's Boundaries section already names `e2e/` per the build workflow.
  - **Area (required, tag):** testing / tooling

- [2026-05-31] [PM] **First-time-only gate race condition** — if two registration requests arrive simultaneously before any user exists, both could pass `/begin` and one could overwrite the other at `/finish`
  - **Likelihood (required):** very low (n=1 operator, single-device-at-a-time UX, no automated callers)
  - **Impact (required):** high if it happened (would silently allow a wrong credential to take over) but bounded by who has access to the unauthenticated endpoint
  - **Mitigation (required):** AC 3 mandates DB-level enforcement via unique constraint on `auth_users.id` (only one row ever) or a conditional `INSERT ... WHERE NOT EXISTS`. The race becomes a DB-rejection at `/finish`, surfaced as a 409. The window between `/begin` and `/finish` is bounded by the 60-second challenge TTL.
  - **Area (required, tag):** security / race

- [2026-05-31] [Engineer] **Route handlers ship without observability instrumentation** (Vercel functions skill hook flagged at implementation time)
  - **Likelihood (required):** certain (no Sentry / logger wired in either route)
  - **Impact (required):** low-to-medium (5xx errors in production land in Vercel Runtime Logs only; no aggregation, no alerting, no structured event capture). Bounded by n=1 operator who watches the logs directly during dry-run phase.
  - **Mitigation (required):** none for this story by design — Sentry hookup is foundation-architecture work per [foundation/architecture.md](../../../foundation/architecture.md) Stack table and is not in any CB-1 AC. **Follow-up story:** add Sentry to `lib/` + structured logging wrappers when the first production incident or first non-operator user surfaces (whichever comes first). Track as a candidate post-CB-1 cross-cutting story.
  - **Area (required, tag):** observability / cross-cutting

- [2026-05-31] [PM] **`pendingUserId` is generated at `/begin` and sent back to the client** — could be tampered with on the way back
  - **Likelihood (required):** low (the value is opaque + non-secret; the operator's browser is the only client)
  - **Impact (required):** low-to-medium (a tampered `pendingUserId` at `/finish` would either succeed-but-attach-wrong-id or fail validation against the challenge cookie's payload)
  - **Mitigation (required):** the challenge cookie's signed payload could optionally also include the `pendingUserId` so /finish can verify the two match. AC 2 doesn't yet require this — Engineer decides at implementation time; if cheap to add, do so; otherwise log as a follow-up story under the same bet.
  - **Area (required, tag):** security / integrity-binding

### Issues

_None at story creation. Issues will accrue if AC 7 / AC 8 reveal contract gaps or AC 12 reveals migration drift._

---

_Story closed: <date>, brief link: [docs/bets/CB-1/brief.md](../../brief.md)_

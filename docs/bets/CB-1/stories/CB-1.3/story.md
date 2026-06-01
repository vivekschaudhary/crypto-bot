---
id: CB-1.3
bet: CB-1
type: story
status: shipped
priority: P0
created: 2026-06-01
shipped: 2026-06-01
author: PM
design_link: n/a (no UI surface — HTTP endpoints only; onboarding UX is CB-1.6)
area_tags: [auth, backend, endpoints]
dependencies: [CB-1.1, CB-1.2]
---

# CB-1.3 — Passkey authentication ceremony endpoints (`/api/auth/authenticate/begin` + `/api/auth/authenticate/finish`)

## Description

Symmetric companion to CB-1.2: two `POST` route handlers that perform the WebAuthn authentication ceremony for a registered operator. After this story, the operator can sign in on a new browser session by hitting `/api/auth/authenticate/begin` → running `navigator.credentials.get()` → POSTing to `/api/auth/authenticate/finish` and ending with a freshly-issued session cookie. The architecture's invariant **"sessions rotate on each successful passkey authentication"** is honored — any pre-existing session id is invalidated and a new one is issued in the same transaction.

This story is **endpoint-only** — no UI in scope. CB-1.6 owns the onboarding/sign-in page that calls these endpoints. CB-1.4 wires `app/proxy.ts` to actually enforce sessions on protected routes. CB-1.5 owns sign-out.

## Acceptance Criteria

- [ ] **AC 1** — `POST /api/auth/authenticate/begin` at `app/api/auth/authenticate/begin/route.ts`:
  - Request body (Zod-validated): `{}` (no fields — authentication doesn't need request input at begin; we could accept an optional `credentialIds: string[]` hint but for single-operator MVP the server already knows the full credential set).
  - Rate-limit per origin via `consumeOrThrow` from `lib/auth/rate-limit` (keyPrefix `authenticate-begin`).
  - Origin check via `verifyOriginOrThrow` from `lib/auth/origin-check` — 403 `origin-mismatch` if fail.
  - **User-exists precondition (inverse of CB-1.2's first-time-only gate):** if `auth_users` is empty, return `400 { error: 'no-registered-user' }`. Authentication is meaningless without a registered passkey.
  - Load registered credentials: `SELECT credential_id, transports FROM auth_credentials` (single-operator MVP — no user filter needed; multi-device may add one credential row per device when deferred multi-device returns post-MVP).
  - Mint a challenge via `mintChallenge('authentication')` from `lib/auth/challenges`.
  - Call `generateAuthenticationOptions({ allowCredentials })` from `lib/auth/webauthn` (options-object signature per CB-1.1 AC 1 amendment). Map the loaded credentials into `allowCredentials` per the WebAuthn spec shape.
  - Build an `authSession` payload `{ challenge }` — signed via `signValue` from `lib/auth/cookie` with 60-second TTL. Set as `Set-Cookie: __compass_auth_session=<signedToken>; HttpOnly; Secure; SameSite=Strict; Path=/api/auth/authenticate/finish; Max-Age=60`.
  - Returns `200 { options: PublicKeyCredentialRequestOptionsJSON }`. No user id, credential id, or counter on the wire — the browser only needs `options`.

- [ ] **AC 2** — `POST /api/auth/authenticate/finish` at `app/api/auth/authenticate/finish/route.ts`:
  - Request body (Zod-validated): `{ response: AuthenticationResponseJSON }`. Use `z.record(z.string(), z.unknown())` for `response` to require presence-as-object without duplicating SimpleWebAuthn's inner-shape validation (same pattern that landed in CB-1.2 finish.test.ts BLOCKER 4 fix).
  - Rate-limit (`authenticate-finish` keyPrefix) + origin check (same as `/begin`).
  - Read `__compass_auth_session` cookie; verify via `verifyValue`; parse payload; return `400 challenge-missing-or-expired` on any failure.
  - Read the optional `__compass_session` cookie (existing session before this new auth): verify via `verifySession`; if present and valid, capture `currentSessionId` for rotation.
  - Look up the credential by `credential_id`: `SELECT id, user_id, public_key, counter, transports FROM auth_credentials WHERE credential_id = ?`. `credential_id` is `bytea`; decode `response.id` from base64url to Buffer.
  - Return `400 { error: 'verification-failed' }` if no matching credential row.
  - Call `verifyAuthenticationResponse({ response, expectedChallenge: payload.challenge, credential })` from `lib/auth/webauthn`. Return `400 verification-failed` on `verified: false` or thrown.
  - **Replay-attack guard (per WebAuthn spec)**: the verifier's `authenticationInfo.newCounter` must be `> stored counter` (some authenticators always return 0 — accept newCounter === 0 only when stored counter === 0 too). Otherwise return `400 { error: 'counter-replay-detected' }`.
  - In a **single DB transaction** (`sql.begin`):
    - `UPDATE auth_credentials SET counter = ${newCounter}, last_used_at = now() WHERE id = ${credentialRowId}`
    - If `currentSessionId` was extracted from the existing session cookie: `rotateSession(currentSessionId, userId, tx)`. Else: `createSession(userId, tx)`. **Engineer DRI Decision (below):** extend `rotateSession` to accept the same optional `txClient` parameter that `createSession` got in CB-1.2 — additive, backward-compatible; same pattern.
  - Clears the auth-challenge cookie (`Set-Cookie: __compass_auth_session=; Max-Age=0; Path=/api/auth/authenticate/finish`).
  - Sets the long-lived session cookie (`Set-Cookie: __compass_session=<signedCookie>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`).
  - Returns `200 { userId, sessionId }`.

- [ ] **AC 3** — **User-exists precondition** enforced at both endpoints (inverse of CB-1.2 AC 3). `/begin` returns `400 no-registered-user` if `auth_users` is empty; `/finish` returns `400 verification-failed` if no credential row matches (DB-level enforcement). Authentication only succeeds for a registered passkey on a registered user.

- [ ] **AC 4** — **Origin check on both endpoints + OPTIONS preflight rejection** (same shape as CB-1.2 AC 4 + the BLOCKER #3 fix). Both routes export an `OPTIONS` handler that returns 403 `origin-mismatch` on cross-origin preflight, 204 + `Allow: POST, OPTIONS` on same-origin. Reuses `lib/auth/origin-check.ts` shipped in CB-1.2.

- [ ] **AC 5** — **Rate limiting** on both endpoints (5 req/min per origin). Reuses `lib/auth/rate-limit.ts` shipped in CB-1.2 with distinct `keyPrefix` values (`authenticate-begin`, `authenticate-finish`) so the limits don't share buckets with the registration endpoints.

- [ ] **AC 6** — **Session-rotation correctness verified in tests.** When a valid pre-existing `__compass_session` is present at `/finish`, the old session id is deleted and a new one is created — verified by asserting the old session row no longer exists AND the new session cookie's signed value differs from the old. When no pre-existing session is present, a fresh session is created (no rotation, no failure).

- [ ] **AC 7** — **Vitest unit + integration tests** under `tests/api/auth/authenticate/`:
  - `begin.test.ts`: happy path returns 200 + Set-Cookie + options with `allowCredentials` populated from the DB; `400 no-registered-user` when DB is empty; `400 invalid-body` (since body is mostly empty, this is mostly a smoke test); `403 origin-mismatch`; `429 rate-limited`; OPTIONS 204/403.
  - `finish.test.ts`: happy path (no pre-existing session) — verifies, updates counter, creates session, sets cookie; happy path (with valid pre-existing session) — verifies, updates counter, ROTATES session (asserts old session id deleted), sets new cookie; `400 challenge-missing-or-expired` for missing/tampered cookie; `400 verification-failed` for verified:false or thrown; `400 verification-failed` for unknown credential; `400 counter-replay-detected` when newCounter ≤ stored counter; OPTIONS 204/403.
  - All tests pass via `pnpm test`.

- [ ] **AC 8** — **Codex writes E2E** at `e2e/auth/authenticate.spec.ts` covering the full ceremony:
  - Seed: register a credential first (call `/api/auth/register/{begin,finish}` programmatically OR via the existing register.spec.ts harness, or insert auth_users + auth_credentials directly).
  - Then: hit `/authenticate/begin` → run `navigator.credentials.get()` against the virtual authenticator (same CDP API setup as `e2e/auth/register.spec.ts`) → POST to `/authenticate/finish` → assert new `__compass_session` cookie + counter incremented in DB + 1 user / 1 credential / 2 sessions (old + new — actually 1 if rotation deleted the old; verify the spec gets this right).
  - Codex commits with `test:` prefix per `/build` Phase 3.

- [ ] **AC 9** — `pnpm typecheck` passes with `strict: true`. No `any` introduced. All env access goes through `lib/env`. No `process.env` reads in `app/api/auth/authenticate/**`.

- [ ] **AC 10** — `pnpm lint` passes (existing flat config; no new ignores).

- [ ] **AC 11** — `pnpm build` (production build) succeeds. Both new routes appear in the route manifest.

- [ ] **AC 12** — **`lib/auth/sessions.rotateSession` extended with optional `txClient` parameter** (same additive pattern as CB-1.2's `createSession` extension). Backward-compatible — all existing callers (none in production code; tests in `sessions.test.ts`) pass undefined and get the legacy behavior. The new code path supports atomic registration-then-rotation flows for CB-1.3 and future stories.

## Standard Experience Checklist

Each category is covered by ≥1 AC OR explicitly `n/a — <reason>`. Same shape as CB-1.2.

- [x] **Navigation** — **`n/a — pure HTTP endpoint story; no UI surface in scope`**.
- [x] **States** — **covered by AC 1, AC 2, AC 4, AC 5** — HTTP states: 200 (success), 400 (no-registered-user / challenge-missing / verification-failed / counter-replay / invalid-body), 403 (origin-mismatch), 429 (rate-limited). No UI states.
- [x] **Feedback** — **covered by AC 1, AC 2, AC 5** — every error response has a typed `error` discriminator (`no-registered-user`, `challenge-missing-or-expired`, `verification-failed`, `counter-replay-detected`, `origin-mismatch`, `rate-limited`, `invalid-body`). Success returns structured `{userId, sessionId}`.
- [x] **Accessibility** — **`n/a — pure HTTP endpoint story; no UI focus / keyboard / screen-reader surface`**.
- [x] **Edge cases** — **covered by AC 2, AC 3, AC 4, AC 5, AC 6, AC 7** — tampered challenge, expired challenge, unknown credential, failed WebAuthn verification, counter replay, origin mismatch, rate-limit boundaries, session rotation with-and-without prior session.
- [x] **Cross-surface consistency** — **`n/a — single-target web stack`**.

## Tech notes

**Architecture reference** — [foundation/architecture.md § Foundational Identity & Access Posture](../../../../foundation/architecture.md#foundational-identity--access-posture) — credential strategy, session strategy ("sessions rotate on each successful passkey authentication"), recovery posture, attack-surface analysis. CB-1.3 implements the authentication-ceremony HTTP-handler layer.

**Brief reference** — [CB-1 brief](../../brief.md). CB-1.3 closes the second half of the brief's primary metric ("sign-in success rate ≥ 99%"). Registration (CB-1.2) is half the surface; authentication (CB-1.3) is the other half.

**Library APIs consumed (all shipped via CB-1.1 + CB-1.1.1 + CB-1.2):**

```ts
// from lib/auth/challenges
mintChallenge('authentication'): { challenge, signedToken }
// (we don't call consumeChallenge for authenticate; the challenge cookie's payload here is bare {challenge}, since there's no pendingUserId to bind — userId is derived from the credential lookup at /finish)

// from lib/auth/webauthn
generateAuthenticationOptions({ allowCredentials? }): Promise<PublicKeyCredentialRequestOptionsJSON>
verifyAuthenticationResponse({ response, expectedChallenge, credential }): Promise<VerifiedAuthenticationResponse>

// from lib/auth/sessions
verifySession(signedCookie): Promise<{userId, sessionId} | null>     // already exists
createSession(userId, tx?): Promise<{sessionId, signedCookie}>        // extended in CB-1.2
rotateSession(currentSessionId, userId, tx?): Promise<{sessionId, signedCookie}>  // EXTENDED in this story (AC 12)

// from lib/auth/cookie
signValue / verifyValue                                                // used for the auth-challenge cookie

// from lib/auth/origin-check
verifyOriginOrThrow(request)                                           // reused

// from lib/auth/rate-limit
consumeOrThrow(key, opts)                                              // reused with distinct keyPrefix
```

**Module boundaries (new in this story):**

```
app/api/auth/authenticate/
  begin/route.ts        # POST handler — load credentials, generate options, set challenge cookie
  finish/route.ts       # POST handler — verify response, update counter, rotate-or-create session, set session cookie

lib/auth/
  sessions.ts           # AC 12 — extend rotateSession to accept optional txClient (modify existing file)
```

**Auth-challenge cookie payload differs from registration's:**
- Register `__compass_reg_session`: `{ challenge, pendingUserId, deviceLabel }` (CB-1.2 design — userId binds since no user row exists yet)
- Authenticate `__compass_auth_session`: `{ challenge }` only (this story — userId is derived from the credential lookup at /finish, no binding needed)

This asymmetry is deliberate: in registration we MUST bind the future userId in the cookie because the user doesn't exist yet; in authentication the credential row IS the source of truth for userId, so the cookie just carries the challenge.

**Counter handling (replay-attack protection):**

WebAuthn spec says the authenticator's counter MUST monotonically increase across attestations. Some authenticators (notably Apple's platform authenticator) always return counter = 0 — they don't implement the counter at all. Per the spec, accept `newCounter === 0` only when `storedCounter === 0`. Otherwise require `newCounter > storedCounter`. Reject as `counter-replay-detected` if violated.

**Out of scope (deferred to subsequent stories or post-MVP):**
- Sign-out (`/api/auth/sign-out`) — CB-1.5
- `app/proxy.ts` real session validation on protected routes — CB-1.4
- First-deploy onboarding UX page (driving these endpoints from a browser) — CB-1.6
- Multi-device authentication — deferred post-MVP per portfolio (in MVP, only one credential row exists)
- Backup recovery code redemption — `/api/auth/recovery/*` endpoints; deferred post-MVP

**Testing approach** — same as CB-1.2: Vitest for unit + integration with mocked DB (sessions.test.ts pattern); Codex's Playwright + virtual-authenticator for E2E. Real Supabase test DB preferred where feasible; mock the DB layer otherwise. Reset auth_* tables between tests so the user-exists precondition behaves predictably.

## PRs

- [PR #8](https://github.com/vivekschaudhary/crypto-bot/pull/8) — **merged 2026-06-01** — feat(CB-1.3): passkey authentication endpoints (begin + finish). Review cycle: 2 BLOCKERs flagged (Zod schema too loose on `response.id` + AC 8 E2E missing); BLOCKER 1 closed by Engineer (commit `7c82461`); BLOCKER 2 closed by Codex via the AC 8 E2E commit (`e56dbef`) which also added a `fromBase64Url` helper in `lib/auth/webauthn.ts` (preserves caller-minted base64url challenges through SimpleWebAuthn's round-trip) and `workers: 1` in `playwright.config.ts` (serial execution since both auth E2E specs TRUNCATE the same `auth_*` tables). Final Codex code + security reviews both clean.

## Tests

_Engineer writes unit + integration tests under `tests/api/auth/authenticate/`._
_Codex writes E2E at `e2e/auth/authenticate.spec.ts` per AC 8 — second E2E in the codebase; same harness pattern as `e2e/auth/register.spec.ts`._

Tags:
- `regression: true` (auth-touching endpoints — regressions cascade across CB-1)
- `e2e: true` (AC 8)

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `docs/bets/CB-1/stories/CB-1.3/fixes/`._

## DRI Log

### Decisions

- [2026-06-01] [PM] **Auth-challenge cookie payload is `{ challenge }` only — no `userId` binding** (asymmetric with CB-1.2's `__compass_reg_session` shape)
  - **Rationale (required):** in registration (CB-1.2) the cookie binds `pendingUserId` because the user doesn't exist yet — the future userId has to come from somewhere server-trusted, and the cookie payload was the cheapest binding. In authentication, the user already exists; the credential row IS the source of truth for userId. The `/finish` route looks up the credential by `credential_id` (from the assertion `response.id`) and reads userId from that row. No binding needed. Keeping the auth cookie minimal also reduces the surface — fewer fields to validate, fewer drift points.
  - **Area (required, tag):** auth / cookie-design
  - **Alternatives considered (required):** mirror CB-1.2's full payload `{challenge, userId, ...}` for "symmetry" (rejected — asymmetric is the honest design since the userId IS available from the credential lookup; symmetric for symmetry's sake is bloat); bind a `usernameHint` in the cookie (rejected — single-operator MVP doesn't need usernameless flows yet).
  - **Reversibility:** easy — the cookie payload is internal to these two route files; adding more bound fields later is one Zod schema change + one signValue arg change per route.

- [2026-06-01] [PM] **Counter monotonicity check is load-bearing for replay protection (AC 2 / AC 12)**
  - **Rationale (required):** WebAuthn spec § Authenticator Data says the signCount MUST monotonically increase across attestations. An authenticator that reuses a counter value is either replaying a prior assertion or has been cloned. The spec advises rejecting such authentications. Apple platform authenticator always returns 0 (it doesn't implement a per-credential counter) — this is documented behavior per Apple's WebAuthn implementation notes. Honoring both: accept `newCounter === 0` only when `storedCounter === 0`. Reject otherwise.
  - **Area (required, tag):** auth / security
  - **Alternatives considered (required):** skip counter check entirely (rejected — leaves a documented replay surface open); reject all `newCounter === 0` (rejected — would break Apple authenticators, which is the primary platform authenticator for the operator); reject only on strict `<= storedCounter` without the platform-authenticator exception (rejected — same break-case).
  - **Reversibility:** easy — the check is one function in `/finish/route.ts`.

- [2026-06-01] [Engineer] **Use canonical `mintChallenge('authentication')` + `consumeChallenge(token, 'authentication')` from `lib/auth/challenges` for the auth-challenge cookie** (amends AC 1/AC 2 prose; resolves internal contradiction)
  - **Rationale (required):** AC 1's drafted text said both "Mint a challenge via `mintChallenge('authentication')`" AND "Build an `authSession` payload `{challenge}` — signed via `signValue`." Those contradict — `mintChallenge` already wraps the challenge in a `{p,k,c}` payload via `signValue` internally; building a separate `{challenge}` payload via signValue would either replace that work or duplicate it. The honest resolution: use the canonical helpers as CB-1.1 designed them. The `{p:'challenge', k:'authentication', c:<challenge>}` payload provides the cross-purpose discriminator that prevents cross-use with session cookies (already tested in `challenges.test.ts`). CB-1.2 used `signValue` directly because its cookie bound additional fields (`pendingUserId`, `deviceLabel`) the canonical helpers don't carry; CB-1.3's cookie carries just the challenge — exactly what `mintChallenge` produces. Use the canonical helpers.
  - **Area (required, tag):** auth / canonical-helper-use
  - **Alternatives considered (required):** implement per the AC literal (call `mintChallenge` for the challenge bytes, then re-wrap via `signValue` with custom payload) — rejected as redundant; use `signValue` directly without `mintChallenge` — rejected because the canonical helpers' purpose discriminator is precisely what protects against cross-use; ignore the canonical helpers entirely — rejected as canonical-helper-bypass anti-pattern (Codex flagged this in CB-1.2's review cycle).
  - **Reversibility:** trivial — both routes consume from `lib/auth/challenges` exports.

- [2026-06-01] [Engineer-anticipated] **Extend `rotateSession` with optional `txClient` parameter (mirrors CB-1.2's `createSession` extension)**
  - **Rationale (required):** AC 2 requires the credential counter UPDATE + the session row INSERT/DELETE to commit atomically. `rotateSession` currently uses `db()` internally; without a `tx` parameter, calling it inside `sql.begin` would run its DELETE+INSERT outside the route's transaction, splitting atomicity. The CB-1.2 review cycle established this exact pattern for `createSession` (additive optional `txClient` parameter); applying the same fix to `rotateSession` here keeps the library API consistent and avoids inlining the rotation logic (which would duplicate the canonical TTL + signing surface, the same anti-pattern Codex flagged in CB-1.2's first review cycle).
  - **Area (required, tag):** auth / library-extension
  - **Alternatives considered (required):** inline the DELETE+INSERT in the route handler (rejected — duplicates canonical logic; same anti-pattern Codex flagged in CB-1.2); leave `rotateSession` unchanged and accept non-atomic rotation (rejected — violates AC 2's atomicity requirement); extend `lib/db/client` with a wrapping helper instead (rejected — over-engineered for this case; the optional-tx-param pattern is established convention now).
  - **Reversibility:** trivial — additive parameter with default; existing callers unaffected.

### Risks

- [2026-06-01] [PM] **Counter handling subtlety — Apple platform authenticators don't increment**
  - **Likelihood (required):** high (operator's likely platform is macOS / iOS; both use Apple's WebAuthn authenticator that returns counter = 0 always)
  - **Impact (required):** medium (if we naively require `newCounter > storedCounter`, the operator will hit `counter-replay-detected` on every legitimate sign-in after the first; auth becomes broken)
  - **Mitigation (required):** AC 2 explicitly handles the `newCounter === 0 && storedCounter === 0` case as valid. AC 7 finish tests must cover both the Apple case (0/0 stable) and the standard case (incrementing). Document the rationale in the route source.
  - **Area (required, tag):** auth / cross-platform

- [2026-06-01] [PM] **Multi-credential lookup at `/begin` is a future-proofing surface that the singleton DB constraint partially obscures**
  - **Likelihood (required):** low for MVP (singleton index from CB-1.2's migration 0002 ensures at most one user; multi-device is deferred post-MVP, so at most one credential row per user too)
  - **Impact (required):** low-medium when multi-device returns (the `SELECT credential_id FROM auth_credentials` will return multiple rows; the route must pass all of them as `allowCredentials` so the browser picks the right one)
  - **Mitigation (required):** write the begin route to handle N credentials cleanly today (loop into `allowCredentials` array) even though N = 1 in MVP. AC 1 phrasing already covers this.
  - **Area (required, tag):** scope / future-proofing

- [2026-06-01] [PM] **No-observability risk inherited from CB-1.2 still applies**
  - **Likelihood (required):** certain
  - **Impact (required):** low-medium (5xx errors land in Vercel Runtime Logs only; no aggregation)
  - **Mitigation (required):** same as CB-1.2 — none in this story; Sentry hookup remains a foundation-arch follow-up.
  - **Area (required, tag):** observability / cross-cutting

### Issues

_None at story creation._

---

_Story closed: <date>, brief link: [docs/bets/CB-1/brief.md](../../brief.md)_

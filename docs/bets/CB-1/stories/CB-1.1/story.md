---
id: CB-1.1
bet: CB-1
type: story
status: ready
priority: P0
created: 2026-05-31
author: PM
design_link: n/a (no UI surface — pure library)
area_tags: [auth, library, backend]
dependencies: []
---

# CB-1.1 — `lib/auth/` library: SimpleWebAuthn wrappers + cookie + session + challenges helpers

## Description

Establish the testable library foundation that every other CB-1 story will consume. Build pure-function (plus thin-DB-query) helpers in `lib/auth/` covering: SimpleWebAuthn server wrappers (registration + authentication option generation and verification), signed-cookie helpers (HMAC-SHA256 sign/verify), session management against the `auth_sessions` table (create / verify / invalidate / rotate), and short-lived WebAuthn challenge storage (signed-cookie approach — see DRI Decision below). No endpoints in this story; no UI. Just a tested, typed library that downstream stories (`/api/auth/register/*`, `/api/auth/authenticate/*`, `app/proxy.ts` integration) can import.

This story locks the **challenge-storage approach** that the [CB-1 brief](../../brief.md) deferred to story-level DRI: **encrypted signed cookie** (stateless, auto-expiring, Vercel-serverless-friendly). Rationale captured below.

## Acceptance Criteria

- [ ] **AC 1** — `lib/auth/webauthn.ts` exports four pure functions that wrap SimpleWebAuthn server:
  - `generateRegistrationOptions(userId: string, userName: string, excludeCredentials: PublicKeyCredentialDescriptor[]): Promise<PublicKeyCredentialCreationOptionsJSON>`
  - `verifyRegistrationResponse(response, expectedChallenge, expectedOrigin, expectedRPID): Promise<{ verified: boolean, registrationInfo?: ... }>`
  - `generateAuthenticationOptions(allowCredentials: PublicKeyCredentialDescriptor[]): Promise<PublicKeyCredentialRequestOptionsJSON>`
  - `verifyAuthenticationResponse(response, expectedChallenge, expectedOrigin, expectedRPID, authenticator): Promise<{ verified: boolean, authenticationInfo?: ... }>`
  - RP ID and expected origin sourced from `lib/env` (`APP_ORIGIN`). No `process.env` reads in this file.
- [ ] **AC 2** — `lib/auth/cookie.ts` exports HMAC-SHA256 sign/verify helpers:
  - `signValue(value: string, secret: string, maxAgeSeconds: number): string` — returns `<base64url-payload>.<base64url-signature>` where payload encodes value + exp timestamp
  - `verifyValue(token: string, secret: string): { value: string } | null` — returns null on tamper, expiry, or malformed input
  - Uses Node's built-in `crypto.createHmac` — no third-party crypto deps.
- [ ] **AC 3** — `lib/auth/sessions.ts` exports session management helpers (thin wrappers over `lib/db/client.ts`):
  - `createSession(userId: string): Promise<{ sessionId: string, signedCookie: string }>` — inserts `auth_sessions` row (ULID id, 30-day `expires_at` from now); returns id + the signed-cookie value to set
  - `verifySession(signedCookie: string): Promise<{ userId: string, sessionId: string } | null>` — verifies cookie signature via `lib/auth/cookie`, loads row by id, checks `expires_at > now()`, bumps `expires_at` on hit (sliding expiry), returns null on any failure
  - `invalidateSession(sessionId: string): Promise<void>` — deletes the row
  - `rotateSession(currentSessionId: string, userId: string): Promise<{ sessionId: string, signedCookie: string }>` — creates a fresh session for the user and invalidates the prior — atomic in a single DB transaction
  - Cookie attributes documented in source comments: `HttpOnly` + `Secure` + `SameSite=Strict` + `Path=/`. (Actual `Set-Cookie` header construction happens at the route-handler layer in a later story; this library returns just the signed value.)
- [ ] **AC 4** — `lib/auth/challenges.ts` implements **encrypted signed-cookie challenge storage** with 60-second TTL:
  - `mintChallenge(purpose: 'registration' | 'authentication'): { challenge: string, signedToken: string }` — generates a cryptographically random 32-byte challenge (base64url), wraps with purpose + exp, signs via `lib/auth/cookie`. Returns both the raw challenge (passed to the SimpleWebAuthn `generate*Options` call) and the signed token (sent to the browser as a short-lived cookie or in the response body for the browser to send back).
  - `consumeChallenge(signedToken: string, expectedPurpose: 'registration' | 'authentication'): { challenge: string } | null` — verifies the token, asserts purpose match + non-expiry, returns the original challenge. One-shot: the route handler must clear the cookie after consumption (single-use semantics enforced at the handler layer in a later story).
  - Signing secret comes from `lib/env` (`SESSION_SIGNING_SECRET`); same secret as session cookies is acceptable because the challenge tokens are tagged with a `purpose: 'challenge'` discriminator that prevents cross-use.
- [ ] **AC 5** — Every module has Vitest unit tests under `tests/lib/auth/`:
  - `webauthn.test.ts`: at least one happy-path test using SimpleWebAuthn's documented test fixtures or a mocked authenticator response; at least one failure case (tampered response → `verified: false`).
  - `cookie.test.ts`: round-trip happy path; tampered signature rejects; expired token rejects.
  - `sessions.test.ts`: create-then-verify round trip; verify after expiry returns null; rotate invalidates the prior session id; invalidate is idempotent.
  - `challenges.test.ts`: mint-then-consume round trip; cross-purpose consume rejects (registration token used for auth → null); expired token rejects; tampered token rejects.
  - All tests pass via `pnpm test`.
- [ ] **AC 6** — `pnpm typecheck` passes with `strict: true`. No `any` introduced.
- [ ] **AC 7** — `pnpm lint` passes (existing ESLint flat config; no new ignores).
- [ ] **AC 8** — No new runtime dependencies beyond what's already in `package.json` (`@simplewebauthn/server`, `@simplewebauthn/browser`, `postgres`, `zod`, `argon2`, `ulidx`). If `pnpm install` reveals that `@simplewebauthn/server@^11` doesn't resolve, log it as an Issue + adjust the version pin in a follow-up commit (see Risks below).
- [ ] **AC 9** — All env access goes through `lib/env`. No `process.env` reads inside `lib/auth/*` source files. Lint rule enforcement (custom rule) is out of scope for this story — convention enforced by code review.
- [ ] **AC 10** — DB queries reuse the shared `db()` client from `lib/db/client.ts`. No new connection-creation code; no opening of additional pools.

## Standard Experience Checklist

Each category covered by ≥ 1 AC OR explicit `n/a — <reason>`. Per the workflow's "every category" rule, library stories mark UI-specific categories `n/a` with the library-no-UI reason.

- [x] **Navigation** — **`n/a — pure library, no UI surface`**. No navigable screens in this story; UI integration arrives in later CB-1 stories (`/api/auth/*` endpoints + first-deploy onboarding UX).
- [x] **States** — **`n/a — pure library, no rendered UI states`**. Library return values are typed (object vs null); error states for library callers are documented in JSDoc per AC #1-#4.
- [x] **Feedback** — **`n/a — pure library, no UI feedback surface`**. Library functions return `null` or throw typed errors; user-facing feedback (error messages, success acknowledgments) is the responsibility of consuming endpoint stories.
- [x] **Accessibility** — **`n/a — pure library, no UI focus management / keyboard / screen-reader surface`**. Accessibility lives at the consumer (UI) layer.
- [x] **Edge cases** — **covered by AC #5** (failure-case unit tests for each module: tampered tokens, expired tokens, cross-purpose challenges, idempotent invalidate). The story explicitly enumerates these as required tests.
- [x] **Cross-surface consistency** — **covered by AC #9** (env access discipline via `lib/env` only) + **AC #10** (DB client reuse from `lib/db/client.ts`). These ensure subsequent stories build on the same single-source-of-truth primitives, not divergent helpers.

## Tech notes

**Architecture reference** — [foundation/architecture.md § Foundational Identity & Access Posture](../../../../foundation/architecture.md#foundational-identity--access-posture) covers the load-bearing design (credential strategy, session strategy, recovery posture, attack-surface analysis, secrets-at-rest). This story implements the library layer of that posture; subsequent CB-1 stories build endpoints + UI on top.

**Brief reference** — [CB-1 brief](../../brief.md) — scope, hypothesis, guardrails. This story is the first of an expected ~6 stories under CB-1.

**Module boundaries inside `lib/auth/`:**

```
lib/auth/
  webauthn.ts       # SimpleWebAuthn server wrappers — pure functions
  cookie.ts         # HMAC sign/verify — pure functions, Node crypto only
  sessions.ts       # auth_sessions DB access — uses lib/db/client + lib/auth/cookie
  challenges.ts     # Signed-cookie challenge mint/consume — uses lib/auth/cookie
  index.ts          # Barrel export (optional; only if it makes import sites cleaner)
```

Note: `lib/auth/session.ts` (the scaffold stub) is replaced by `lib/auth/sessions.ts` (plural, real impl). The stub had a single `getSession()` placeholder; that's superseded by the helpers in AC #3. Delete the stub as part of this story.

**Types** — Use the SimpleWebAuthn package's own exported types (e.g., `PublicKeyCredentialCreationOptionsJSON`) directly rather than redefining. This keeps the library a thin wrapper, not a parallel type system.

**Testing approach** — Vitest with the `tests/lib/auth/` directory. Unit tests only (this story has no integration surface). Mock the DB layer where appropriate (e.g., `sessions.test.ts` can either hit a test DB via Supabase branch or mock `db()` — Engineer's call; prefer real DB if a test branch is trivial to spin up).

**Out of scope (deferred to subsequent stories):**
- Route handlers (`app/api/auth/register/*`, `app/api/auth/authenticate/*`, `app/api/auth/sign-out`) — Story CB-1.2 / CB-1.3
- `app/proxy.ts` real session-validation integration — Story CB-1.4
- Sign-out endpoint + cookie clearing at the HTTP layer — Story CB-1.5
- First-deploy onboarding UX — Story CB-1.6
- `device_label` UX (auto-detect vs prompt) — deferred to authenticate-ceremony story per CB-1 brief Open Questions

## PRs

_Auto-populated as PRs open._

## Tests

_Engineer writes unit tests in `tests/lib/auth/*.test.ts`. No E2E in this story (no HTTP surface; Codex E2E starts at Story CB-1.2 when endpoints land)._

Tags:
- `regression: true` (foundational primitives — regressions here cascade to all CB-1 stories)
- `e2e: false`

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `docs/bets/CB-1/stories/CB-1.1/fixes/`._

## DRI Log

### Decisions

- [2026-05-31] [PM] **First story under CB-1 is the `lib/auth/` library only — no endpoints, no UI** (incremental ship over big-bang)
  - **Rationale (required):** library stories produce testable, type-checked primitives in isolation. Downstream endpoint stories build on a verified foundation rather than developing-and-debugging the library inline with HTTP handlers. Smaller PR scope = easier Codex review. The library is also independently testable, so a regression introduced in any later story can be triaged against a stable `lib/auth/` baseline.
  - **Area (required, tag):** scope / process
  - **Alternatives considered (required):** ship the registration endpoint together with the library (rejected — bigger PR, harder review, conflates library bugs with HTTP-handler bugs); ship a full auth+sessions vertical slice in one story (rejected — too large; would be ~1 week vs ~2-3 days for this scoped story)
  - **Reversibility:** easy

- [2026-05-31] [PM] **Lock the challenge-storage approach as encrypted signed cookie** (resolving the deferral from [CB-1 brief Open Question](../../brief.md))
  - **Rationale (required):** signed-cookie is stateless (no DB sweep for expired challenges), auto-expires via cookie max-age, Vercel-serverless friendly (no shared state needed between `begin` and `finish` invocations), industry-common, and avoids adding an `auth_challenges` table for a 60-second-lifetime artifact. Signing with `SESSION_SIGNING_SECRET` is safe because the challenge token carries a distinct `purpose: 'challenge'` field that prevents cross-use with session cookies (tested via AC #5 `challenges.test.ts` cross-purpose case). The CB-1 brief explicitly deferred this decision to story-level DRI; this is that DRI entry.
  - **Area (required, tag):** auth / implementation
  - **Alternatives considered (required):** `auth_challenges` DB table (rejected — requires sweep job; over-engineered for a 60s artifact); separate signing secret for challenges (rejected — adds an env var for no real isolation gain since `purpose` discriminator already prevents cross-use); in-memory (rejected — Vercel functions are stateless, won't work)
  - **Reversibility:** easy — replacing the signed-cookie impl with a DB-row impl is contained to `lib/auth/challenges.ts`; no consumer-side changes needed (the function signatures stay the same; only the internal storage swaps)

- [2026-05-31] [PM] **Reuse `SESSION_SIGNING_SECRET` for both session cookies and challenge tokens** (vs introducing `CHALLENGE_SIGNING_SECRET`)
  - **Rationale (required):** the `purpose` discriminator in the challenge token's payload provides isolation at the protocol layer — a token minted with `purpose: 'challenge'` cannot be replayed as a session cookie because the verifier in `lib/auth/sessions.ts` expects a different payload shape. Adding a second env var would be ceremony for an isolation property that's already structurally guaranteed.
  - **Area (required, tag):** auth / secrets
  - **Alternatives considered (required):** separate `CHALLENGE_SIGNING_SECRET` env var (rejected — adds an env var + a rotation procedure for no real isolation gain)
  - **Reversibility:** easy (introducing a second env var later is a one-line `lib/env` addition + a one-line `challenges.ts` swap)

### Risks

- [2026-05-31] [PM] **`@simplewebauthn/server@^11` may not resolve at `pnpm install`** — the scaffold pinned this range, but versions on npm shift and I haven't verified against the live registry
  - **Likelihood (required):** medium (similar to the `@vercel/config@^1.0.0` issue from foundation scaffold — turned out to be 0.5.1)
  - **Impact (required):** low (resolvable by adjusting the version range in `package.json`; doesn't change the API surface significantly across recent major versions)
  - **Mitigation (required):** Engineer runs `pnpm install` early in the story; if the range fails to resolve, check `npm view @simplewebauthn/server versions` for the current major and pin accordingly. Document the actual version landed via a story DRI follow-up. The library's API has been stable across recent majors so AC #1 should remain valid regardless.
  - **Area (required, tag):** dependency / version-pinning

- [2026-05-31] [PM] **Cookie attribute construction at the HTTP-handler layer is deferred to a later story** — this library returns just the signed value, not a full `Set-Cookie` header
  - **Likelihood (required):** low (well-documented split — library produces value, route handler attaches attributes; AC #3 explicitly notes this in source comments)
  - **Impact (required):** medium (if the next story's route handler forgets to set `HttpOnly` + `Secure` + `SameSite=Strict`, the architecture invariant breaks)
  - **Mitigation (required):** AC #3 documents the required attributes in source comments alongside the function definition. CB-1.2/CB-1.3 (endpoint stories) MUST verify the attributes in integration tests as part of their own AC. `/scan` post-merge will check for cookie-attribute regressions.
  - **Area (required, tag):** security / cross-story

### Issues

_None at story creation. Issues will accrue if AC #5 reveals API surface issues or AC #8 reveals dependency-version surprises._

---

_Story closed: <date>, brief link: [docs/bets/CB-1/brief.md](../../brief.md)_

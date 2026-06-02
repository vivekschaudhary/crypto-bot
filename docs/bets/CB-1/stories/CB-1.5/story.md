---
id: CB-1.5
bet: CB-1
type: story
status: shipped
priority: P0
created: 2026-06-02
shipped: 2026-06-02
author: PM
design_link: n/a (no UI surface — single HTTP endpoint; sign-out trigger UI lives in CB-1.6's onboarding/dashboard surface)
area_tags: [auth, backend]
dependencies: [CB-1.1, CB-1.3, CB-1.4]
---

# CB-1.5 — Sign-out endpoint (`POST /api/auth/sign-out`)

## Description

Add `POST /api/auth/sign-out` — the operator's explicit-revocation path for their current passkey session. The endpoint verifies the caller's session via `lib/auth/sessions.verifySession`, calls `invalidateSession(sessionId)` to DELETE the `auth_sessions` row, and emits a `Set-Cookie` header that clears the `__compass_session` cookie (same attributes used at issuance, `Max-Age=0`). After a successful sign-out, the cookie that was just used returns to "invalid session" status — every subsequent proxy-gated request with that same cookie value redirects (dashboard) or 401s (API), enforced by CB-1.4's proxy. This story is the operator-driven revocation companion to architecture's "DB row is the source of truth — revoke server-side by deleting the row" invariant; CB-1.4 enforces the read side, CB-1.5 ships the write side. No UI in this story (operator triggers via a button shipped in CB-1.6 / direct `curl` until then).

## Acceptance Criteria

- [ ] **AC 1** — `POST /api/auth/sign-out` route handler exists at `app/api/auth/sign-out/route.ts`. The handler:
  1. Reads the `__compass_session` cookie from `request.cookies.get('__compass_session')?.value`.
  2. Calls `verifySession(signedCookie)` from `@/lib/auth/sessions` to authenticate the caller AND retrieve the `sessionId`.
  3. On `null` (no cookie / invalid signature / expired DB row / row missing) → 401 `{ error: 'unauthenticated' }`. The cookie is NOT cleared in the 401 branch — there is no session to sign out from, and clearing the cookie on every 401 sign-out attempt is a free-cookie-clearing surface (low-risk but unnecessary).
  4. On valid result `{ userId, sessionId }` → call `invalidateSession(sessionId)` from `@/lib/auth/sessions` (DELETEs the `auth_sessions` row).
  5. Return `200 { ok: true }` with **`Set-Cookie: __compass_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`** on the response. Cookie attributes MUST match the issuance attributes from `app/api/auth/authenticate/finish/route.ts` `buildSessionCookie()` — any divergence and the browser will keep the original cookie alongside an unrelated cleared one.

- [ ] **AC 2** — **Origin / Referer verification.** Same `verifyOriginOrThrow(request)` call used by `/api/auth/register/*` and `/api/auth/authenticate/*` runs at the top of the handler (before any cookie read). On mismatch → 403 `{ error: 'origin-mismatch' }`. This is defense-in-depth against CSRF on a POST that mutates server state (deletes a DB row). Sign-out is authenticated, so an attacker without a valid session cookie can't successfully sign anyone out — but the origin check stops cross-site triggered requests in browsers that don't honor `SameSite=Strict` correctly (or in attack scenarios that bypass it).

- [ ] **AC 3** — **Method discipline.** Only `POST` is implemented. `GET / PUT / PATCH / DELETE / HEAD` return `405 { error: 'method-not-allowed' }`. `OPTIONS` returns the same response shape as `/api/auth/register/*` and `/api/auth/authenticate/*` (rate-limit responses are not in scope for OPTIONS — same posture as the existing OPTIONS handlers; this matches the canonical AC pattern from CB-1.2 / CB-1.3 / Codex review of PR #5).

- [ ] **AC 4** — **Idempotency posture: no "already signed out" branch.** Calling sign-out twice with the same originally-valid cookie is expected: the first call returns 200 + invalidates the row; the second call returns 401 because `verifySession` no longer finds the row. There is NO special-case "you already signed out" 200-response branch. The 401 is structurally correct — by the time the second call lands, the cookie's session does not exist, and the endpoint treats it identically to any other invalid-cookie call. This is the canonical "DB row is the source of truth" pattern from the architecture: once the row is gone, the cookie is dead, period.

- [ ] **AC 5** — **NO modifications to `proxy.ts`.** Sign-out is reachable as an AUTHENTICATED route (it falls through to the protected-route branch because `/api/auth/sign-out` does NOT match `PUBLIC_EXACT` and does NOT start with any `PUBLIC_PREFIXES` entry — the existing `/api/auth/register/`, `/api/auth/authenticate/`, `/api/auth/recovery/` prefixes all require trailing-`/` sub-paths that `/api/auth/sign-out` does not have). Adding `/api/auth/sign-out` to `PUBLIC_EXACT` would be wrong — a sign-out caller MUST be authenticated to identify whose session to invalidate. The proxy's 401 for stale-cookie sign-out attempts (AC 1 step 3) is the architecturally-correct response. **Load-bearing source-code marker:** the top of `app/api/auth/sign-out/route.ts` includes an inline comment explicitly stating "proxy.ts gates this route as protected — the handler MUST be reachable only with a valid session cookie."

- [ ] **AC 6** — **Defense-in-depth (per CB-1.4 Engineer DRI Decision #5).** The handler MUST call `verifySession()` itself even though proxy.ts already verified the session at the gate. The `x-session-user-id` / `x-session-id` headers forwarded by proxy via the cloned-request-headers mechanism are CONVENIENCE only; sign-out is a state-mutating action (DB row delete) and must re-verify per the architecture's defense-in-depth posture and the CVE-2025-29927 lineage. The handler may optionally cross-check the `x-session-id` header against the sessionId returned by its own `verifySession` call (informational; mismatch is logged but doesn't change behavior — the local re-verify is the authoritative answer).

- [ ] **AC 7** — **Vitest unit + integration tests** under `tests/api/auth/sign-out.test.ts`. Coverage:
  - **Happy path:** valid cookie → 200 `{ ok: true }` + `invalidateSession` called once with the correct sessionId + `Set-Cookie` header on response with name=`__compass_session`, value empty, Max-Age=0, HttpOnly, Secure, SameSite=Strict, Path=/
  - **No cookie:** missing `__compass_session` → 401, `invalidateSession` NOT called, no Set-Cookie on response
  - **Invalid cookie signature:** tampered signature → 401, `invalidateSession` NOT called
  - **Expired session row:** valid signature but DB row `expires_at <= now()` (verifySession returns null) → 401, `invalidateSession` NOT called
  - **Missing session row:** valid signature but DB row already deleted (verifySession returns null) → 401, `invalidateSession` NOT called (this is the second-call-after-successful-sign-out case from AC 4)
  - **Origin mismatch:** Origin header pointing elsewhere → 403, `verifySession` NOT called, `invalidateSession` NOT called (origin check runs first per AC 2)
  - **Method-not-allowed:** GET / PUT / PATCH / DELETE return 405 with `{ error: 'method-not-allowed' }`
  - **Idempotency check:** call sign-out twice in sequence with the same originally-valid cookie. Assert: first call 200 + `invalidateSession` called once; second call 401 + `invalidateSession` NOT called (verifySession returns null because row is gone).
  - **Cookie-attribute parity:** programmatically parse the `Set-Cookie` header from the happy-path response AND from a fresh `authenticate/finish` response; assert the attribute set is identical except for `value` and `Max-Age` (value=empty + Max-Age=0 on sign-out vs value=signed + Max-Age=SESSION_TTL_SECONDS on issuance). This is the only mechanical guard against attribute drift between issuance and clearing.
  - All tests pass via `pnpm test`. DB calls mocked via the same Drizzle/postgres.js pattern used in CB-1.2 / CB-1.3 tests.

- [ ] **AC 8** — **Codex writes E2E** at `e2e/auth/sign-out.spec.ts`:
  - Seed: a registered credential + a valid signed session cookie (reuse the existing authenticate-spec setup — INSERT auth_users + auth_credentials + auth_sessions rows, mint a session cookie via the canonical helper).
  - `POST /api/auth/sign-out` with the valid cookie → expect 200 `{ ok: true }` + `Set-Cookie` clearing the cookie.
  - Immediately after, `GET /(dashboard)` with the SAME cookie → expect 302 redirect to `/?next=%2Fdashboard` (proxy 302s because the session row no longer exists; CB-1.4's proxy enforcement is the integration boundary being verified end-to-end here).
  - `POST /api/auth/sign-out` again with the same cookie → expect 401 (idempotency-via-proxy-or-handler is observable from the outside).
  - Codex commits with `test:` prefix per `/build` Phase 3.

- [ ] **AC 9** — `pnpm typecheck` passes with `strict: true`. No `any` introduced. All env access via `lib/env` (no `process.env` reads in `app/api/auth/sign-out/route.ts` — same as CB-1.2 / CB-1.3 / CB-1.4 invariant).

- [ ] **AC 10** — `pnpm lint` passes. No new ignore entries.

- [ ] **AC 11** — `pnpm build` produces a successful production build AND the build output includes `app/api/auth/sign-out/route.ts` as a recognized API route. Per `[mechanical-output-verification]` (canon.md v0.3.6 + the Next 16 anchor correction): inspect `.next/server/app-paths-manifest.json` for the `/api/auth/sign-out/route` entry (NOT the legacy `pages-manifest.json` — this is App Router). Missing entry = the framework did not register the route despite the file existing.

- [ ] **AC 12** — **No library extension this round.** `verifySession` and `invalidateSession` are both already exported from `lib/auth/sessions.ts` (added in CB-1.1, exercised by CB-1.3/CB-1.4). The sign-out endpoint is pure composition. If the Engineer finds during implementation that a `buildClearCookie()` helper would meaningfully reduce duplication with `authenticate/finish/route.ts`'s `buildSessionCookie()` (e.g., an exported `lib/auth/cookie.ts` helper that produces both the set-cookie string and the clear-cookie string from a shared attribute spec), that extraction is in-scope — it strengthens AC 7's "cookie-attribute parity" check by making attribute drift mechanically impossible. Otherwise, inline the clear-cookie string in the route handler.

## Standard Experience Checklist

Each category is covered by ≥1 AC OR explicitly `n/a — <reason>`. Same backend-only shape as CB-1.2 / CB-1.3 / CB-1.4.

- [x] **Navigation** — **`n/a — single HTTP endpoint; no navigable UI surface in this story`**. Sign-out trigger UI (button in the dashboard / onboarding flow) lives in CB-1.6. The endpoint's contract here is server-state mutation only.
- [x] **States** — **covered by AC 1, AC 2, AC 3, AC 4** — HTTP states: 200 (success), 401 (unauthenticated / stale cookie), 403 (origin mismatch), 405 (method-not-allowed). No loading / empty / disabled UI states in scope (sign-out is a one-shot POST, not a stateful surface).
- [x] **Feedback** — **covered by AC 1, AC 2, AC 3** — typed `error` discriminator on 401 / 403 / 405 responses, matching the existing `/api/auth/*` error-shape contract from CB-1.2 / CB-1.3. The 200 response includes `{ ok: true }` as a positive acknowledgment per the codebase convention.
- [x] **Accessibility** — **`n/a — no UI surface in this story; accessible sign-out trigger UX is CB-1.6's contract`**. The handler itself has no focus / keyboard / screen-reader concerns.
- [x] **Edge cases** — **covered by AC 1, AC 4, AC 6, AC 7** — no cookie, tampered cookie, expired DB row, already-deleted DB row (idempotency case), origin-mismatch, method-not-allowed. Test matrix in AC 7 covers each leaf.
- [x] **Cross-surface consistency** — **`n/a — single-target web stack`**. Same justification as CB-1.4. The web target's sign-out endpoint has no mobile / native equivalent in MVP.

## Tech notes

**Architecture reference** — [foundation/architecture.md § Foundational Identity & Access Posture / Cross-cutting standards § Auth](../../../../foundation/architecture.md#foundational-identity--access-posture):

> "All routes outside `/api/auth/*` and `/api/cron/*` require valid session cookie verified against `auth_sessions` table"
> "Session cookies: HttpOnly, Secure, SameSite=Strict"
> "Origin check on auth endpoints (defense-in-depth against CSRF on POST flows)"

CB-1.5 implements the explicit-revocation companion to CB-1.4's read-side enforcement. The architecture's "cookie alone is not trusted — DB row is the source of truth" invariant gets its delete-the-row write path here.

**Brief reference** — [CB-1 brief § Scope / In scope](../../brief.md): "Sign-out flow — `POST /api/auth/sign-out` invalidates the current `auth_sessions` row + clears the cookie." Closes the brief Open Issue on sign-out scope ("sign out from this device only, or invalidate all sessions for the user?") per the PM DRI Decision below — `this session only`.

**Library APIs consumed (no extensions in this story):**

```ts
// from lib/auth/sessions
verifySession(signedCookie): Promise<{ userId: string; sessionId: string } | null>
// Same canonical session check used by proxy.ts. Returns null on any failure mode;
// returns { userId, sessionId } on success. Sliding expiry side-effect fires here too
// (single extra Postgres UPDATE on the row we're about to DELETE — acceptable cost;
// could be optimized via a sign-out-specific path that skips the bump and goes
// straight to DELETE, but that's a future micro-optimization, not a CB-1.5 concern).

invalidateSession(sessionId): Promise<void>
// DELETEs the auth_sessions row. Idempotent at the DB layer (DELETE WHERE no-match
// is a no-op). No special "row not found" handling needed in the route handler —
// any concurrent / double-call resolves to the same end state.

// from lib/auth/origin-check
verifyOriginOrThrow(request: Request): void
// Throws OriginMismatchError on mismatch. Same helper used by CB-1.2 / CB-1.3.
```

**Cookie-clearing pattern (AC 1 step 5):**

```ts
// Mirror `buildSessionCookie` from app/api/auth/authenticate/finish/route.ts:
//   const buildSessionCookie = (signed) =>
//     `${SESSION_COOKIE_NAME}=${signed}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
//
// The clear variant:
//   `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`
//
// Same attributes; value empty; Max-Age 0. AC 7's "cookie-attribute parity" test
// is the mechanical guard against drift. If the Engineer judges (per AC 12) that
// extracting a shared `cookieAttributes()` builder is warranted, the parity check
// becomes structurally trivial.
```

**Why sign-out is BEHIND the proxy gate (NOT public):**

The intuitive read is "sign-out should be available even when the user thinks they're signed out" — i.e., make `/api/auth/sign-out` public. The architecture rejects that read for three reasons:

1. **There's nothing to invalidate.** If the cookie is missing / invalid / points at a non-existent row, the server has no state to mutate. The "sign-out" semantics are already satisfied by the absence of valid state.
2. **The client owns its own cookie deletion path.** A browser can `document.cookie = '__compass_session=; Max-Age=0; ...'` directly if it wants to drop a cookie locally without server involvement. (The cookie is `HttpOnly`, so this specific path doesn't apply — but the user can clear browser cookies via their browser UI.) Making the server perform unconditional cookie-clearing on every sign-out attempt is server-side support for client-state hygiene that the architecture deliberately scopes to the operator's own browser.
3. **Authentication identifies WHICH session to invalidate.** This is the load-bearing reason. Without `verifySession` proving the caller owns the session, the endpoint has no way to know which `auth_sessions` row to DELETE. (In a multi-session world, requiring authentication is the only safe way; in n=1 single-operator it's still the structurally-correct posture because the handler shouldn't infer-and-mutate.)

**Sign-out scope — "this session only" (PM DRI Decision below):**

Closing the brief Open Issue. At n=1 with typically 1-2 active sessions ever, `this session only` is the right MVP scope. Multi-session revocation ("sign out of all my devices") is a post-MVP UX concern that requires a session-revocation surface in the UI; not in scope for CB-1.5.

**Response status — `200 { ok: true }`, NOT `204 No Content`:**

The codebase convention from CB-1.2 / CB-1.3 / CB-1.4 is `200` with a typed JSON body on the success path (even when there's no meaningful payload to return). Keeping CB-1.5 consistent with that convention. `204 No Content` would be marginally more REST-idiomatic but introduces a divergence with no offsetting benefit.

**Out of scope (deferred to subsequent stories or post-MVP):**

- **Sign-out UI** — button in dashboard or onboarding flow; lives in CB-1.6.
- **Multi-session revocation** — "sign out of all my devices" endpoint or UI; post-MVP per [portfolio.md § Deliberately out of MVP](../../../../foundation/portfolio.md).
- **Session listing / device-management UI** — same post-MVP scope.
- **Sign-out trigger from server-side events** (e.g., admin-driven force-revoke) — n=1 means there's no admin separate from the operator; not needed at MVP scale.
- **Sign-out audit log** — observability follow-up same as CB-1.2 / CB-1.3 / CB-1.4 (no per-request Sentry / request-id wiring yet).
- **`?everywhere=true` query parameter for multi-session sign-out** — explicitly out per the scope decision; if added, would need session-listing UX to be meaningful.

**Testing approach** — Vitest for unit + integration with mocked DB layer (same `lib/db/client` pattern used in CB-1.2 / CB-1.3 tests). Codex's Playwright spec at `e2e/auth/sign-out.spec.ts` exercises the full HTTP lifecycle: sign-out → subsequent dashboard access redirects → subsequent sign-out 401s. The E2E is the integration boundary that catches "did CB-1.5's DELETE actually break CB-1.4's gate" — the most critical regression class for this story.

## PRs

- [PR #15](https://github.com/vivekschaudhary/crypto-bot/pull/15) — **merged 2026-06-02** (squash merge commit `be2611f`) — feat(CB-1.5): sign-out endpoint (POST /api/auth/sign-out). 3-commit review cycle across 2 rounds: round 1 surfaced 1 BLOCKER (`docs/status.md` internal-consistency drift from CB-1.5 in-review state — same class as PR #11's v4-era Health note; closed via `ec1b188`); round 2 clean. **Codex security review: no findings.** Engineer DRI Decisions in-flight: (1) extracted `SESSION_COOKIE_NAME` / `SESSION_TTL_SECONDS` / `buildSessionCookie` / `clearSessionCookie` to `lib/auth/cookie.ts` as single source of truth shared with `authenticate/finish/route.ts`; (2) typed-405 pattern introduced via explicit GET/PUT/PATCH/DELETE/HEAD handlers (existing routes use Next.js default 405 — retrofit deferred as P3 Issue). Codex AC 8 E2E `e2e/auth/sign-out.spec.ts` (4 tests; sign-out → 200 + Set-Cookie clear → dashboard 302 with `?next=` → second sign-out 401) committed as `a07e969`. **Supplemental fresh-Agent Claude security read** (PR comment): 4 LOWs (rate-limit Origin-key, OPTIONS no-rate-limit, sliding-expiry waste, 401-not-clearing-cookie) — Codex didn't elevate any to findings. Triggered a 5-PR retrospective A/B (workflow `wzkhajv1x`) comparing fresh-Agent Claude vs Codex across CB-1.1 through CB-1.4 security reviews; verdict `mixed-but-leans-supports`, Codex stays binding. Memory saved at [project_security_reviewer_ab](../../../../../.claude/projects/-Users-vivekchaudhary-apps-crypto-app/memory/project_security_reviewer_ab.md).

## Tests

_Engineer writes unit + integration tests under `tests/api/auth/sign-out.test.ts`._
_Codex writes E2E at `e2e/auth/sign-out.spec.ts` — fourth E2E in the codebase per AC 8._

Tags:
- `regression: false` (new surface; first ship)
- `e2e: true` (AC 8)

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `docs/bets/CB-1/stories/CB-1.5/fixes/`._

## DRI Log

### Decisions

- [2026-06-02] [PM] **Sign-out scope is "this session only" — NOT "all sessions for the user"** (closes brief Open Issue)
  - **Rationale (required):** at n=1 with typically 1-2 active sessions ever (multi-device passkey is post-MVP per portfolio), "this session only" is the right MVP scope. "Sign out of all my devices" is a UX surface that requires session listing + per-device labels, both of which are post-MVP. Implementing it now would mean shipping a query parameter (`?everywhere=true`) that has no UI affordance and exists only to be future-proof — exactly the soft-spec rationalization (principle #14) the framework rejects. The architecture's "DB row is the source of truth" pattern already supports multi-session revocation via direct SQL (`DELETE FROM auth_sessions WHERE user_id = ?`) for the absolute-last-resort runbook case; the operator can hit Supabase directly if they ever need to nuke all sessions.
  - **Area (required, tag):** auth / scope
  - **Alternatives considered (required):** ship `?everywhere=true` as opt-in but functional (rejected — premature, no UI, soft-spec); ship invalidation of ALL sessions on every sign-out call (rejected — surprising behavior at multi-session future scale; would force a re-architecture later); defer sign-out entirely until multi-session UX exists (rejected — single-session sign-out is independently valuable and ships in 1-2 days).
  - **Reversibility:** easy — adding a `?everywhere=true` (or a separate `POST /api/auth/sign-out-all`) is a 1-hour follow-up story when multi-device lands.

- [2026-06-02] [PM] **Sign-out is BEHIND the proxy gate (NOT added to `PUBLIC_EXACT` / `PUBLIC_PREFIXES`)** — proxy.ts is unchanged in this story
  - **Rationale (required):** three structural reasons, fully expanded in Tech notes § "Why sign-out is BEHIND the proxy gate":
    1. **Nothing to invalidate** when there's no valid session — the absence of state IS the signed-out state.
    2. **Client owns its own cookie-deletion path** for hygiene (browser-level cookie clearing); server-side unconditional clearing is unnecessary server support for client-state cleanup.
    3. **Authentication identifies WHICH session to DELETE** — without `verifySession`, the handler has no way to know which row to mutate. (Load-bearing reason.)
  - **Area (required, tag):** auth / routing / scope
  - **Alternatives considered (required):** make `/api/auth/sign-out` public + clear-cookie unconditionally on every call + DELETE only when `verifySession` succeeds (rejected — adds branching for a UX edge case that doesn't exist at n=1 + has the surprising "your sign-out request 'succeeded' even though nothing happened" behavior); make it public + reject every non-authenticated call with a custom 401 that's NOT proxy-driven (rejected — duplicates proxy logic in the handler for no benefit); leave the proxy lists exactly as they are and let `/api/auth/sign-out` fall through to protected (chosen — matches the architecture's "DB row is the source of truth" + "cookie alone is not trusted" pair).
  - **Reversibility:** easy — adding the path to `PUBLIC_EXACT` is one line in proxy.ts if a future story decides the trade-off was wrong.
  - **Load-bearing source-code marker:** the top of `app/api/auth/sign-out/route.ts` documents this so future readers (including future-me) can't re-derive the wrong answer.

- [2026-06-02] [PM] **Idempotency: no "already signed out" branch — second-call 401 is structurally correct**
  - **Rationale (required):** once `invalidateSession(sessionId)` DELETEs the row, the cookie's `sessionId` no longer maps to a live row. A second sign-out call from the same cookie therefore goes through the exact same code path as any stale-cookie sign-out attempt: `verifySession` returns null → 401. Adding a special-case "already signed out" 200 branch would require the handler to either (a) keep a tombstone of recently-deleted sessions, or (b) speculatively treat any null `verifySession` as "probably a re-sign-out" — both are over-engineering for an indistinguishable case at n=1. The 401 is honest: "we don't know who you are, so we can't sign you out."
  - **Area (required, tag):** auth / api-design
  - **Alternatives considered (required):** keep a 30-second tombstone of recently-DELETEd session IDs in memory and return 200 on second-call (rejected — stateful complexity on a stateless surface; tombstones would also vanish across Vercel function instance recycles); always return 200 regardless of session state (rejected — the cookie holder learns nothing about whether the call did anything, which is worse than a 401); silent-success any stale-cookie sign-out attempt (rejected — same problem; obscures real signal).
  - **Reversibility:** easy — if the idempotent-200 stance is ever needed (e.g., for some future automation tool that retries blindly), add the branch then.

- [2026-06-02] [PM] **Response is `200 { ok: true }`, NOT `204 No Content`** — match codebase convention from CB-1.2 / CB-1.3 / CB-1.4
  - **Rationale (required):** every `/api/auth/*` route in the codebase returns `200` with a typed JSON body on success, even when there's no meaningful payload. Keeping CB-1.5 consistent with that convention means clients consume responses the same way across endpoints. `204 No Content` would be marginally more REST-idiomatic but introduces inconsistency with zero offsetting benefit; the client code that fires sign-out will read the JSON response anyway for the same logging / error-shape reasons as other auth calls.
  - **Area (required, tag):** auth / api-design / consistency
  - **Alternatives considered (required):** `204 No Content` (rejected — codebase-inconsistency cost outweighs idiomatic-REST benefit at n=1); `200 {}` empty object (rejected — `{ ok: true }` matches the existing JSON-shape convention and adds a positive ack); `200 { userId, sessionId }` echoing what was signed out (rejected — exposes session IDs in response bodies for no client need; the cookie just got cleared, the client knows what session it had).
  - **Reversibility:** easy — switching to 204 is a one-line change in the response builder.

- [2026-06-02] [Engineer] **Cookie helpers extracted to `lib/auth/cookie.ts`** — `SESSION_COOKIE_NAME`, `SESSION_TTL_SECONDS`, `buildSessionCookie(signedValue)`, `clearSessionCookie()` — and `app/api/auth/authenticate/finish/route.ts` updated to import from there (was inline). Closes AC 12's optional-helper-extraction path and strengthens AC 7's parity check from "tests catch drift" to "drift requires editing the shared helper" (structural impossibility).
  - **Rationale (required):** PM Risk #1 (cookie-clearing attribute drift between issuance and clearing) is medium-likelihood/high-impact, and AC 12 explicitly named extraction as in-scope if it strengthens the parity guarantee. The extraction is small (4 helpers in lib/auth/cookie.ts), additive (no existing API breaks), and converts the parity check from "test passes by accident" to "test passes by construction." `tests/api/auth/sign-out.test.ts` now asserts `parseSetCookie(actual) === parseSetCookie(clearSessionCookie())` — a verbatim-match check that would fail loudly on any inline-attribute reintroduction.
  - **Area (required, tag):** auth / cookies / single-source-of-truth
  - **Alternatives considered (required):** keep helpers inline in both routes (rejected — drift risk + AC 12 explicitly allowed extraction); extract to a new `lib/auth/session-cookie.ts` file (rejected — over-fragmentation; `lib/auth/cookie.ts` already covers cookie concerns + a clear comment-block delineates HMAC sign/verify vs HTTP-attribute helpers); also consolidate `proxy.ts`'s local `SESSION_COOKIE_NAME` (rejected this story — AC 5 forbids proxy.ts modifications; deferred to a future story).
  - **Reversibility:** trivial — re-inline the constants in either route if extraction proves problematic.
  - **Follow-up Issue surfaced:** `proxy.ts` still has a duplicated `SESSION_COOKIE_NAME` local const (line 38). Logged as Engineer Issue below.

- [2026-06-02] [Engineer] **Typed `405` via explicit method handlers (GET/PUT/PATCH/DELETE/HEAD)** — implements AC 3 + AC 7 as written. Each method returns `jsonResponse(405, { error: "method-not-allowed" }, { allow: "POST, OPTIONS" })`. Existing `/api/auth/*` routes (register/begin, register/finish, authenticate/begin, authenticate/finish) currently rely on Next.js's default 405 (plain text); CB-1.5 introduces the typed-405 pattern.
  - **Rationale (required):** AC 3 + AC 7 specify typed JSON 405 with the `error` discriminator matching the existing 401/403 error-shape contract. Implementing the AC as written maintains a uniform machine-readable error contract across `/api/auth/sign-out`'s entire surface (401, 403, 405, 429 all return `{ error: "<discriminator>" }`). The alternative — relying on Next.js default 405 — would have produced a plain-text response that breaks the typed-JSON expectation a future CB-1.6 sign-out UI would consume.
  - **Area (required, tag):** auth / api-design / error-shape
  - **Alternatives considered (required):** rely on Next.js default 405 to match existing routes (rejected — breaks AC 3 + AC 7's typed-JSON expectation; existing routes' lack of explicit 405 handlers is a latent inconsistency, not a convention); use a single catch-all method dispatcher instead of N exported handlers (rejected — Next.js App Router routes handlers per export, no catch-all pattern; the 5 one-line exports are clearer than fighting the framework).
  - **Reversibility:** easy — delete the GET/PUT/PATCH/DELETE/HEAD exports + accept Next.js's default 405 if a future story decides the typed-405 stance was wrong.
  - **Follow-up Issue surfaced:** the existing `/api/auth/{register,authenticate}/{begin,finish}` routes have an inconsistent untyped 405 surface. Logged as Engineer Issue below.

### Risks

- [2026-06-02] [PM] **Cookie-clearing attribute drift between issuance and clearing**
  - **Likelihood (required):** medium (this is exactly the kind of constant-duplication bug that bites — `authenticate/finish/route.ts` issues with one attribute set, `sign-out/route.ts` could clear with a slightly different set if either side changes without the other)
  - **Impact (required):** high if it bites — a cleared cookie with mismatched attributes is NOT actually cleared from the browser's perspective (e.g., different `Path=` value → browser keeps the old cookie AND adds the cleared cookie at the new path, defeating the sign-out)
  - **Mitigation (required):** AC 7 includes a "cookie-attribute parity" test that programmatically parses both the issuance `Set-Cookie` (from a fresh `authenticate/finish` response) AND the sign-out `Set-Cookie`, and asserts the attribute sets match except for `value` and `Max-Age`. This is the only mechanical guard against drift. AC 12 also makes it explicit that the Engineer MAY extract a shared `cookieAttributes()` helper in `lib/auth/cookie.ts` if they judge the duplication warrants it — that would strengthen the parity guarantee from "tests catch drift" to "structurally impossible to drift."
  - **Area (required, tag):** security / cookies

- [2026-06-02] [PM] **Race between `verifySession` (sliding-expiry UPDATE) and `invalidateSession` (DELETE) on the same row**
  - **Likelihood (required):** low (single-operator MVP; the only concurrent-call scenario is the operator double-clicking sign-out within a few hundred ms, OR a misbehaving client retrying. Both are bounded.)
  - **Impact (required):** low — Postgres serializes per-row writes; the worst case is one of the two operations succeeds against a stale-view of the row. If UPDATE wins the race, the subsequent DELETE still removes the (now bumped-expiry) row; if DELETE wins, the UPDATE no-ops against the deleted row (or fails depending on driver behavior — `verifySession` already handles "row missing" by returning null). The end state is "row deleted" in both orderings.
  - **Mitigation (required):** AC 7's idempotency test ("call sign-out twice; second returns 401") exercises this exact ordering. If the Engineer wants to be belt-and-braces, the handler can wrap `verifySession` + `invalidateSession` in a single transaction (`BEGIN; SELECT ... FOR UPDATE; DELETE; COMMIT`) — but the current architecture's no-transaction-around-verifySession design has held up under CB-1.2/1.3's atomic-registration concern, and the n=1 concurrency floor doesn't justify the complexity here. Defer to Engineer judgment at implementation; the AC 7 test is the safety net either way.
  - **Area (required, tag):** concurrency / sessions

- [2026-06-02] [PM] **Sign-out 401 vs 403 vs 405 status-code confusion at integration time**
  - **Likelihood (required):** low (the AC matrix is explicit per failure mode)
  - **Impact (required):** low — wrong status codes would confuse future CB-1.6 UI code that branches on response status, but unit tests catch this before merge
  - **Mitigation (required):** AC 7's test matrix names each failure mode + expected status; AC 2 explicitly names "403 on origin mismatch" (not 401); AC 3 explicitly names "405 on wrong method" (not 401). Codex review will also catch any drift.
  - **Area (required, tag):** api-design

### Issues

_None at story creation._

- [2026-06-02] [Engineer] **`proxy.ts` still has a duplicated `SESSION_COOKIE_NAME` local const (line 38)** — surfaced during the cookie-helper extraction (Engineer Decision #1 above)
  - **Severity:** P3 (cosmetic / DRY)
  - **Owner:** future story (CB-1.6 or a dedicated cleanup story)
  - **Status:** open
  - **Area:** auth / DRY / single-source-of-truth
  - **Why not fixed in CB-1.5:** AC 5 explicitly forbids `proxy.ts` modifications in this story ("NO modifications to proxy.ts"). The duplication is structurally benign — both the lib helper and the proxy local resolve to the same string value `"__compass_session"`, and a future test could assert equality if drift becomes a concern. Consolidating is a 1-line change in a future story.

- [2026-06-02] [Engineer] **Existing `/api/auth/{register,authenticate}/{begin,finish}` routes use Next.js default 405 (plain text)** — inconsistent with CB-1.5's typed-405 pattern (Engineer Decision #2 above)
  - **Severity:** P3 (cosmetic / API-contract consistency)
  - **Owner:** future story (continuous-improvement)
  - **Status:** open
  - **Area:** auth / api-design / error-shape
  - **Why not fixed in CB-1.5:** retrofitting the four existing routes is out-of-scope for the sign-out story. The inconsistency is latent (no existing client depends on the 405 response shape; clients only call POST). When CB-1.6's first-deploy onboarding UX needs to consume `/api/auth/*` responses programmatically, the typed-405 retrofit can land as a small follow-up story or `/ops` change.

---

_Story closed: <date>, brief link: [docs/bets/CB-1/brief.md](../../brief.md)_

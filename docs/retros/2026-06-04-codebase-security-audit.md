---
id: retro-codebase-security-audit-2026-06-04
type: retro
status: complete
date: 2026-06-04
author: Fresh-Agent Claude (advisory; NOT a binding gate)
scope: codebase-wide
subject: Adversarial security audit of crypto-bot at commit 962e262 (branch feat/cb-1.6-onboarding-ux, PR #17 in-progress)
verdict: No CRITICAL or HIGH findings constructible. 2 MEDIUM (DoS on public Server-Component DB queries; safe-next allowlist drift between proxy emit-side and consumer side), 5 LOW (non-constant-time CRON_SECRET comparison; missing security headers; ULID session-id timestamp leakage; latent challenge-replay window already documented; documented public-route header-passthrough). Most n=1-exploitable surfaces already covered by prior Codex review cycles + CB-1.5 mitigations.
binding: false
source: operator-requested supplemental audit; Codex remains binding security reviewer per compass/config.yaml (see docs/retros/2026-06-02-security-reviewer-ab.md for the standing decision)
---

# Codebase security audit (2026-06-04, advisory)

## Why this audit exists

The operator requested a codebase-wide supplemental security audit at commit `962e262` on branch `feat/cb-1.6-onboarding-ux` (PR #17 in-progress, not merged). This is NOT a binding merge gate — Codex remains the binding security reviewer per `compass/config.yaml` and per the standing decision in `docs/retros/2026-06-02-security-reviewer-ab.md` (Codex 100% precision vs Claude 47% spurious rate over 5 prior PR cycles on this codebase). This audit's purpose is supplemental advisory breadth, deliberately accepting Claude's higher spurious tendency in exchange for wider surface coverage.

## Methodology

- Fresh-Agent Claude in isolated context, opus model, adversarial mode ("assume broken until proven otherwise").
- Read foundation: `AGENTS.md`, `compass/roles/security-reviewer.md`, `docs/foundation/product.md`, `docs/foundation/architecture.md`, `docs/bets/CB-1/brief.md`, `docs/retros/2026-06-02-security-reviewer-ab.md`.
- Surface coverage: Tier 1 (lib/auth/*), Tier 2 (app/api/auth/*), Tier 3 (proxy.ts), Tier 4 (cron tick), Tier 5 (CB-1.6 UI: landing, setup, sign-in, dashboard), Tier 6 (env, db client, migrations, schema, .gitignore, .env.example), Tier 7 (compass/config.yaml, package.json, vercel.ts).
- Probed all 20 high-leverage surfaces enumerated in the audit brief.
- Findings calibrated by exploitability under stated threat model (n=1 operator, real money via Trade-only-scoped Coinbase keys, capital exfiltration structurally impossible per architecture.md § Attack-surface analysis).
- Per the A/B retro: deliberately deprioritized latent multi-user / replay-capture findings unless they are new vs. PR #1, #5, #8, #10, #15 prior review cycles.

## Findings

## Security Review

[CRITICAL] none constructed

[HIGH] none constructed

[MEDIUM] DoS surface — unauthenticated public Server-Component routes execute uncached DB count queries
  File: app/page.tsx:78-82, app/setup/page.tsx:68-72, app/sign-in/page.tsx:92-96
  Issue: Three of the four PUBLIC_EXACT routes in proxy.ts (`/`, `/setup`, `/sign-in`) are Server Components that issue uncached `SELECT count(*)::int AS count FROM auth_credentials` on every unauthenticated request. None are rate-limited (the in-memory limiter in lib/auth/rate-limit.ts is applied at /api/auth/* endpoints only, not at app/ pages). lib/db/client.ts caps the postgres.js pool at 10 connections. An attacker who blasts any of these three URLs can pin the DB connection pool, starving legitimate session-cookie validations (proxy.ts → verifySession → DB SELECT) and cron-tick writes. Vercel Fluid Compute reuses function instances but does not coalesce DB queries across requests.
  Risk: Pre-auth unauthenticated DoS amplifier on the Supabase free-tier DB (which has its own connection ceiling). Burst-flood the three public surfaces → DB pool exhaustion → operator cannot sign in, cron-tick fails, bot misses scheduled tick. Per architecture.md fitness function "Bot tick execution rate ≥ 99%" — this is the exact threshold the DoS targets. Exploitable today by any unauthenticated party who knows the URL.
  Fix: Add `unstable_cache` / `cacheLife` around the count query with a short TTL (e.g., 5–10 seconds — at n=1 single-operator with rare credential changes, even 60 seconds is defensible). Alternative: hoist the count check above the request handler via a cached server-only fetcher. Either way, the read should not happen on every request. Defense-in-depth: add a coarse-grained rate limiter that's not Origin-keyed (since Origin can be rotated; rate-limit by IP via Vercel headers) on the proxy passthrough for these three paths.

[MEDIUM] safe-next allowlist drift between proxy emit-side and consumer side — mid-path `//` accepted by consumer, rejected by proxy
  File: proxy.ts:112 vs lib/auth/safe-next.ts:35
  Issue: lib/auth/safe-next.ts comment block (lines 14–22) explicitly claims its 4 rules are "mirrored character-for-character from proxy.ts's internal `isSafeNextPath`." That claim is false. proxy.ts line 112 rejects ANY `//` in the candidate (`candidate.includes("//")`); safe-next.ts line 35 only rejects leading `//` (`candidate.startsWith("//")`). A candidate like `/x//evil.com` is rejected by the proxy (so never emitted) but accepted by the consumer at /sign-in. The mid-path `//` rule was added to proxy.ts (per the comment at lines 95–98) specifically to cover URL-constructor backslash normalization. Consumer side does not have that rule.
  Risk: Not a classical open-redirect today — `Location: /x//evil.com` is treated by modern browsers as a same-origin path, not an external redirect. But the documented invariant ("4-rule check, character-for-character mirrored") is violated, which means the audit-trail claim that drift is "caught by either the safe-next.test.ts or proxy.test.ts assertion sets" is also questionable. If a future router/runtime starts treating `//` as protocol-relative (some non-browser HTTP clients do), the consumer becomes an open-redirect surface while the proxy stays safe. Defense-in-depth gap with a false documented invariant.
  Fix: Make safe-next.ts use `candidate.includes("//")` (not `startsWith`) to actually mirror proxy.ts. Add a shared assertion test that runs the SAME input set through both implementations and fails on any divergence (mechanical-output-verification per AGENTS.md principle #14 — the "documented mirror" claim should be structurally enforced, not just asserted in a comment).

[LOW] Non-constant-time CRON_SECRET comparison
  File: app/api/cron/tick/route.ts:18
  Issue: `auth !== \`Bearer ${cronSecret}\`` uses JavaScript string inequality, which short-circuits on first byte mismatch. Per architecture.md § Secrets-at-rest the CRON_SECRET is in Vercel encrypted env (rotation quarterly), and the route is the only consumer. Timing-side-channel exploit requires an attacker who can issue many timed requests against the cron endpoint and statistically infer the secret prefix.
  Risk: Low in practice — high-entropy secret, network jitter swamps the timing signal at remote-attacker distances, Vercel's edge layer adds further noise. But it's a clear best-practice gap for a route handling a privileged operation. The handler is reachable unauthenticated (it's in PUBLIC_EXACT) so the attacker doesn't need other credentials to probe it.
  Fix: Use `crypto.timingSafeEqual` over equal-length buffers (with a length-equality fast-path that uses the same shape as lib/auth/cookie.ts:60–65). The pattern is already established in this codebase — just reuse it.

[LOW] No security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy)
  File: next.config.ts (whole file)
  Issue: `next.config.ts` defines `reactStrictMode` + `typedRoutes` only. No security headers. The auth UI pages (/setup, /sign-in, /dashboard) render no untrusted content today, but the absence of CSP means there is zero defense-in-depth against an XSS surface that future bets (CB-2 bot controls, CB-3 manual trading) might inadvertently introduce.
  Risk: Defense-in-depth gap. Not exploitable today on the current UI surface (all rendered strings are React-escaped; no dangerouslySetInnerHTML; no third-party inline scripts). Becomes relevant the moment any bet ships a route that renders user/Coinbase content.
  Fix: Add Next.js `headers()` config returning `Content-Security-Policy: default-src 'self'`; `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`; `X-Frame-Options: DENY`; `Referrer-Policy: strict-origin-when-cross-origin`. Ship before CB-2 (which introduces the first bot-control UI surface) so the policy is in place when the rendering surfaces expand.

[LOW] Session-ID is a ULID — leaks creation timestamp to anyone who sees the id
  File: lib/auth/sessions.ts:55 (`const sessionId = ulid();`)
  Issue: ULID's first 10 chars are a millisecond timestamp. Session id is inside an HttpOnly + Secure + SameSite=Strict cookie and stored in `auth_sessions` rows, both of which are inaccessible to network attackers under the documented threat model. But PR #10's first-attempt regression (now fixed) accidentally leaked `x-session-id` on response headers; if a similar regression recurs, the leaked id would tell an attacker exactly when the session was minted (helpful for narrowing brute-force / replay windows). Not currently exploitable.
  Risk: Defense-in-depth gap. Latent — surfaces only on a fresh regression.
  Fix: Either accept (architecture.md picked ULID deliberately for time-sortable PKs) or generate session ids from `randomBytes(16).toString('base64url')` to remove the timestamp prefix entirely. Cheap to change; per architecture comment, ULID's time-sortable property is operationally useful for queries against `auth_sessions` but the per-row cost is negligible at n=1 — a non-ULID session id would not hurt.

[LOW] Challenge-replay window on Apple-authenticator counter exception (already documented; flagged for completeness)
  File: app/api/auth/authenticate/finish/route.ts:138 + 203, lib/auth/challenges.ts:56–72
  Issue: `consumeChallenge` is a verifier, not a consumer — it does not mark the challenge as used server-side. Single-use semantics rely on the route handler's Set-Cookie clearing the cookie at the browser. The 60-second TTL window plus the WebAuthn counter check normally provides replay protection, BUT Apple platform authenticators always return `newCounter = 0`. The code explicitly admits `(newCounter === 0 && storedCounter === 0)` as legitimate. An attacker with concurrent access to the operator's `__compass_auth_session` cookie AND a valid Apple-authenticator assertion captured within 60s can replay successfully. This is already documented as a real-but-latent finding in docs/retros/2026-06-02-security-reviewer-ab.md (PR #8 Claude finding).
  Risk: Real but bounded — requires same-device cookie + assertion capture within 60s. n=1 single-operator on personal device limits attacker positioning. The product's primary platform is Apple per architecture.md.
  Fix: Add a server-side challenge-consumed table (or a hash of the consumed challenge in a short-TTL `auth_consumed_challenges` row) to enforce single-use server-side, not browser-local. Out-of-scope for CB-1 per the prior DRI; flagged here so it appears in the audit trail for re-evaluation when CB-2 reintroduces capital-touching surfaces.

[LOW] x-session-* headers not stripped from incoming public-route passthrough (already documented; flagged for completeness)
  File: proxy.ts:149-151
  Issue: For PUBLIC_EXACT / PUBLIC_PREFIXES routes, proxy.ts returns `NextResponse.next()` without cloning headers. Incoming `x-session-user-id` / `x-session-id` headers pass through unmodified to public route handlers. A future public handler that trusts these headers as authenticated identity would silently accept attacker-forged values. No current public handler does this (the cron tick route validates CRON_SECRET, not session headers; the UI pages use cookies()/headers() but read x-session-user-id only on /dashboard which is NOT public). Already documented in docs/retros/2026-06-02-security-reviewer-ab.md PR #10 Claude finding.
  Risk: Latent — fires only when a future handler under a public path is written to trust `x-session-*` headers. Caught defensively by code review under current conventions.
  Fix: In the public-route branch of proxy.ts, clone request headers and explicitly delete `x-session-user-id` + `x-session-id` before passing to NextResponse.next. Or rename the headers to a less-trustworthy prefix on the auth gate (e.g., `x-compass-verified-user-id`) to make the trust contract explicit.

## What I checked and could not refute

Mapped to the audit brief's enumerated tiers and probe points. Each row carries a one-line outcome.

### Tier 1 — Auth library (lib/auth/*)

| Surface | Outcome |
|---|---|
| lib/auth/cookie.ts — HMAC sign/verify, session-cookie helpers | No attack constructed. `verifyValue` length-check before `timingSafeEqual` does not leak secret length (expected length is deterministic 43 chars for base64url SHA-256). `buildSessionCookie` and `clearSessionCookie` share single source of truth — attribute parity verified (CB-1.5 mitigation holds). |
| lib/auth/sessions.ts — create/verify/invalidate/rotate | No attack constructed for n=1 single-user case. `rotateSession` accepts caller-supplied userId without ownership check on currentSessionId — already documented latent multi-user finding per AB retro. `sql.unsafe(SESSION_TTL_INTERVAL)` operates on static constant `'30 days'`; no injection surface. |
| lib/auth/challenges.ts — short-lived WebAuthn challenge tokens | LOW (challenge-replay window on Apple-authenticator counter exception) — flagged above for completeness. |
| lib/auth/webauthn.ts — SimpleWebAuthn server wrappers | No attack constructed. `userVerification: 'preferred'` rather than `'required'` documented as latent finding in AB retro. APP_ORIGIN → RP ID derivation correct (hostname only). v11 client and v11 server consistent. |
| lib/auth/origin-check.ts — strict-equality origin validation | No attack constructed. Strict-equality is correct posture; documented as Claude-spurious in AB retro. Preview-deploy URL via `VERCEL_URL` fallback is operational, not security. |
| lib/auth/rate-limit.ts — in-memory token bucket | No attack constructed beyond the already-documented Origin-rotation memory-growth + bucket-bypass finding (AB retro PR #5, deferred per DRI for n=1). |
| lib/auth/safe-next.ts — ?next= allowlist | MEDIUM (drift vs proxy.ts) — flagged above. |

### Tier 2 — Auth API routes (app/api/auth/*)

| Surface | Outcome |
|---|---|
| /api/auth/register/begin | Covered by Zod + origin check + rate-limit + first-time-only gate. count(*) check is racy but `register/finish` is protected by migration 0002 singleton index (verified). |
| /api/auth/register/finish | Covered by transaction + singleton index + canonical createSession with tx. Atomicity holds. |
| /api/auth/authenticate/begin | Covered. user-existence oracle on `400 no-registered-user` is documented as Claude-spurious in AB retro. |
| /api/auth/authenticate/finish | Counter-check before transaction is non-atomic vs UPDATE but second-write-wins semantics + counter-monotonicity guards prevent replay on non-Apple authenticators. Apple 0/0 carve-out is the documented LOW above. Challenge consume is verify-only — same LOW. |
| /api/auth/sign-out (CB-1.5) | Full belt-and-suspenders: rate-limit + origin check + defense-in-depth verifySession + idempotent DELETE + clear-cookie with attribute parity. Method-not-allowed handlers typed at 405. Best-shaped route in the codebase. No finding. |

### Tier 3 — Routing layer (proxy.ts)

| Probe | Outcome |
|---|---|
| Public route enumeration completeness | Reviewed; `/`, `/api/cron/tick`, `/setup`, `/sign-in` are exact-match public. `/api/auth/register/`, `/api/auth/authenticate/`, `/api/auth/recovery/` are prefix-public (recovery is referenced but not implemented yet — no attack, no surface). No other public surfaces detected. |
| Cookie length cap pre-HMAC (2 KB) | Verified — bounds attacker-controlled HMAC compute. Good defense. |
| isSafeNextPath emit-side rules | 4 rules verified. Mid-path `//` IS rejected here (drift vs consumer — MEDIUM above). |
| cloned-request-headers mechanism (CB-1.4 fix) | Verified — `NextResponse.next({ request: { headers: requestHeaders }})` is the correct shape per Next.js 16 contract; PR #10 first-attempt response-header leak is fixed. |
| x-session-* on public passthrough | LOW (already documented) — flagged above. |

### Tier 4 — Other server routes

| Surface | Outcome |
|---|---|
| /api/cron/tick — CRON_SECRET-gated heartbeat | LOW (non-constant-time comparison) — flagged above. Reads `process.env.LIVE_MODE` directly (bypasses env validation) but fails closed on any non-"true" value, which is correct posture for a load-bearing safety primitive. |

### Tier 5 — CB-1.6 UI surfaces

| Surface | Outcome |
|---|---|
| app/page.tsx — landing (Server Component, mode-detecting) | MEDIUM (DoS) — flagged above. Verifies session before count query (authenticated requests skip the count). Read-only. No XSS surface (static strings). |
| app/landing-cta.tsx — auto-focus client wrapper | No attack constructed. Renders only props passed in from Server Component. |
| app/setup/page.tsx — Server Component gate | MEDIUM (DoS) — flagged above. Active-session gate runs before count query. |
| app/setup/setup-client.tsx — registration ceremony | No attack constructed. Uses fetch with `credentials: 'include'`; SameSite=Strict on session cookie prevents CSRF; origin-check on POST endpoints prevents cross-origin abuse. Error mapping is finite enum. |
| app/setup/lib/device-label.ts — UA-derived label | No attack constructed. Pure regex matching on UA string; result rendered React-escaped. No injection surface. |
| app/sign-in/page.tsx — Server Component gate + ?next= validation | MEDIUM (DoS) — flagged above. Active-session gate runs before count query. `safeNextOrNull` correctly drops unsafe values silently per copy.md. NODE_ENV check before console.warn is appropriate. |
| app/sign-in/sign-in-client.tsx — authentication ceremony | No attack constructed. Same CSRF posture as setup-client. Typed error mapping; counter-replay surfaced distinctly. |
| app/dashboard/page.tsx — proxy-gated read-only | No attack constructed. Uses `headers()` to read `x-session-user-id` for DB lookup — convenience-only per CB-1.4 DRI; trust is the proxy gate above, not the header. `try/catch` fallback prevents render crash. device_label rendered React-escaped. |
| app/dashboard/sign-out-client.tsx — sign-out POST | No attack constructed. 200/401-equivalent UX is correct (session already gone server-side); 403 origin-mismatch surfaces typed copy. |

### Tier 6 — Infrastructure

| Surface | Outcome |
|---|---|
| lib/env/index.ts — Zod env validation | Validates all required secrets (≥32 char for SESSION_SIGNING_SECRET + RECOVERY_CODE_PEPPER; URL for DATABASE_URL). APP_ORIGIN is optional with VERCEL_URL fallback. Two direct `process.env` reads in cron tick route (CRON_SECRET, LIVE_MODE) — bypasses validation but fails closed. lib/db/migrate.ts also reads process.env.DATABASE_URL directly — acceptable for one-shot migration runner. |
| lib/db/client.ts — postgres.js pool | Pool max 10, `prepare: false` (transaction-mode-pooler-compatible per Supabase), `idle_timeout: 20`. No connection-string leakage in error paths. Pool exhaustion is the MEDIUM DoS surface. |
| db/migrations/0001-init.sql + 0002 + db/schema.sql | Singleton constraint on auth_users via `UNIQUE INDEX ((TRUE))` is correct posture. Schema is single-tenant by design (no tenant_id). Foreign keys + CASCADE delete on auth_credentials/auth_sessions/auth_recovery_codes from auth_users are appropriate. Migration runner uses `tx.unsafe(sqlText)` — necessary for DDL, file content is repo-controlled, not user-controlled. No SQL injection surface. |
| .env.example | Documents the contract. No real secrets shipped. Generation commands (`openssl rand -base64 48`) are correct. |
| .gitignore | Covers .env / .env.local / *.env.* / node_modules / .next / .vercel / coverage / IDE files / OS files. No leak surface detected. |

### Tier 7 — Configuration

| Surface | Outcome |
|---|---|
| compass/config.yaml | `security_reviewer: codex` confirmed binding. `canary_artifacts` populated with verified_at. No leak surface. |
| package.json | Direct dependencies: next ^16, react ^19, @simplewebauthn/server ^11 + browser ^11 (versions aligned), postgres ^3.4, zod ^3.23, argon2 ^0.41, ulidx ^2.4. No abandoned packages (couldn't run advisory feed — see Limitations). |
| vercel.ts | Typed config; cron at `*/15` registered against `/api/cron/tick`. No leak. |
| next.config.ts | Missing security headers — LOW above. |

### 20 high-leverage probe-points (audit-brief enumeration)

| # | Probe | Outcome |
|---|---|---|
| 1 | HMAC verify timing-safe equality (length-leak) | No attack constructed — expected length is non-secret deterministic 43 chars. |
| 2 | Session-ID predictability (ULID timestamp) | LOW (above) — leak only on regression. |
| 3 | Rate-limiter Origin-rotation bypass + cross-instance inconsistency | Already documented in AB retro; not new. |
| 4 | `?next=` allowlist completeness (Unicode, IDN, URL-encoded backslash, mixed-case scheme) | Reviewed — 4 rules are tight; mid-path `//` drift between proxy and consumer is the MEDIUM finding. Mixed-case scheme caught by colon-in-first-segment rule. URL-encoded backslash arrives un-decoded as `%5C`, which is not `\` and not `/`, so neither rule fires — but it's also not a working open-redirect because the URL constructor at the consumer side doesn't decode `%5C` to `\`. Unicode / IDN homograph: candidate is a path, not a host; rules don't need host-level normalization. |
| 5 | proxy.ts + handler verifySession double-call (CB-1.4 invariant) | Verified — /sign-out re-verifies; /authenticate/finish reads its own session cookie; /dashboard is read-only (convenience use of x-session-user-id is acceptable per CB-1.4 DRI #5). State-mutating capital surfaces (CB-2) don't exist yet. |
| 6 | Session-cookie attribute parity (CB-1.5) | Verified — both helpers live in lib/auth/cookie.ts; attribute set identical except value + Max-Age. |
| 7 | Public route enumeration holes | Reviewed — 4 PUBLIC_EXACT + 3 PUBLIC_PREFIXES. `/api/auth/recovery/` is declared public but not implemented (no surface). No accidental publics found. |
| 8 | CSRF on sign-out | Verified — POST-only + origin check + SameSite=Strict cookie. All three protections applied. Typed 405 on other methods. |
| 9 | Public Server-Component DB queries DoS | MEDIUM (above). |
| 10 | WebAuthn replay (counter monotonicity + Apple 0/0 exception) | LOW (above) — already documented in AB retro PR #8. Cross-credential replay not constructible because credential lookup is by `credential_id` (unique per credential). |
| 11 | device_label XSS surface | No attack constructed — rendered React-escaped on /dashboard. Operator-controlled at registration, no third-party input. |
| 12 | CRON_SECRET handling | LOW (above) — non-constant-time comparison. |
| 13 | Environment validation completeness | Verified — Zod covers all required secrets. Two `process.env` direct reads in cron tick (CRON_SECRET, LIVE_MODE) bypass validation but fail closed. Migration runner direct read is one-shot tool. |
| 14 | DATABASE_URL leakage in error messages / stack traces | Reviewed — no surfaces detected in current code. Sentry integration is documented but not wired in this commit; no error-body leak surface. |
| 15 | Test fixtures with real-looking secrets | Did not scan tests/* exhaustively — see Limitations. `.env.example` is empty strings + comments only. |
| 16 | @simplewebauthn v11 API drift (server vs browser) | Both at ^11.0.0; client API (`startRegistration({optionsJSON})`, `startAuthentication({optionsJSON})`) matches server return shape. No drift detected. |
| 17 | Origin allowlist coverage on Vercel preview deploys | `origin()` falls back to `https://${VERCEL_URL}` if APP_ORIGIN unset — preview deploys run against their own preview URL; WebAuthn binds credentials to origin so preview-deploy credentials are distinct from production. No lock-out, no cross-deploy compromise. |
| 18 | Session-row cleanup / sweeper | No sweeper exists — `auth_sessions` rows accumulate. At n=1 with 30-day sliding expiry + rotation on every authenticate, accumulation is trivial (~few rows/year). Not exploitable for DB-size DoS at this scale; would matter if multi-user lands. Not a finding for current scope. |
| 19 | proxy.ts cloned-request-headers anti-leak (CB-1.4 fix) | Verified — mechanism is intact; no `next.headers.set('x-session-*', ...)` calls anywhere. |
| 20 | Migration order + idempotency | Migration runner records applied filenames in `_migrations`; idempotent skip on re-run. Singleton index uses `IF NOT EXISTS` — re-application is no-op. Partial-application risk exists if a deploy crashes mid-migration, but each migration runs inside a transaction (line 44–47 of migrate.ts) so atomicity is preserved. No finding. |

## Recommendation

**Approve-with-followups** (advisory — Codex remains binding).

No CRITICAL or HIGH constructible findings. The MEDIUM DoS surface on public Server-Component queries is the most operationally relevant finding — it's exploitable today without any privileges and targets the architecture's fitness function for bot-tick reliability. The safe-next allowlist drift MEDIUM is defense-in-depth-only today but the documented invariant is false, which is the kind of soft-spec rationalization gap AGENTS.md principle #14 names as a vulnerability surface in its own right.

Followup queue (operator to decide priority; none are merge-blockers for PR #17):

1. **DoS hardening for public Server-Component DB queries** — add a short-TTL cache around the count(*) query in `/`, `/setup`, `/sign-in`. Ship before CB-2.
2. **safe-next allowlist convergence** — fix the `//` rule drift in lib/auth/safe-next.ts and add a cross-implementation assertion test that fails on any future divergence.
3. **CRON_SECRET constant-time comparison** — reuse the timingSafeEqual pattern from lib/auth/cookie.ts.
4. **Security headers** — add `next.config.ts` headers() for CSP, HSTS, X-Frame-Options, Referrer-Policy before CB-2 introduces capital-touching UI surfaces.
5. **Server-side challenge consume** — out of scope for CB-1 per prior DRI; track for CB-2 when bot-control endpoints arrive (challenge replay becomes more exploitable when the post-auth surface mutates capital state).

## Notable observations

1. **The CB-1.5 sign-out endpoint is the best-shaped route in the codebase.** Rate-limit + origin check + defense-in-depth verifySession + atomic DB DELETE + attribute-parity-guaranteed cookie clear + typed 405 on all non-POST methods. Every check that should be there is there, in the right order, with a typed error contract. Future routes (CB-2 onward) should pattern-match against this shape, not against the earlier CB-1.2/CB-1.3 routes which had to grow into their final form through review cycles.
2. **The recurring shape of "documented invariant turns out to be false" is the load-bearing systemic risk.** Both PR #10's response-header leak and this audit's safe-next drift fit the same pattern: a code comment / story DRI asserts a property that the implementation does not actually guarantee. The mechanical-output-verification principle AGENTS.md added (canon.md v0.3.6) explicitly targets this class of failure; its application here would be a structural test that runs the same input set through proxy.ts and safe-next.ts and fails on divergence. Worth surfacing to the architect-pair as a CB-level convention candidate.
3. **The audit found nothing genuinely new vs. the AB retro for the auth-library, auth-API, and proxy layers.** That's a positive signal: the four prior review cycles (PRs #1, #5, #8, #10) plus CB-1.5's mitigations have closed the n=1-exploitable surface. The new findings (DoS on public Server-Component queries, safe-next drift) live at the CB-1.6 boundary — the UI layer added in this PR — and at the previously-unaudited cron tick handler. That's where supplemental advisory breadth has value.
4. **The CB-1.4 architectural invariant — handler-side re-verification on state mutation — is correctly enforced everywhere it should be**, including the new CB-1.5 sign-out. The dashboard's convenience-only use of `x-session-user-id` is read-only and architecturally sanctioned; not a regression of the principle.

## Limitations

- **Dependency advisory feeds**: did not run npm audit, Snyk, or any other vulnerability scanner against package.json. Cannot certify the @simplewebauthn/server@11, @simplewebauthn/browser@11, postgres@3.4, argon2@0.41, ulidx@2.4 versions are free of known CVEs at this commit date.
- **Runtime behavior**: this is a static-code audit. Did not start the app, did not exercise endpoints with curl, did not verify Vercel-deployed configuration. Probe points #3 (cross-instance state inconsistency on the rate limiter), #9 (DB pool exhaustion timing), and #12 (timing-side-channel measurability) would need runtime verification to certify the analytic conclusions.
- **Test fixtures**: did not exhaustively review tests/* or e2e/* for accidental real-secret commits. Spot-checked .env.example (clean). The .gitignore covers .env / .env.local / *.env.*.
- **Vercel-deployed env vars**: cannot verify what's actually injected at production. Audit assumes the .env.example contract holds; if production deviates (e.g., a weak SESSION_SIGNING_SECRET that bypasses the ≥32-char zod check by some other path), that would not be visible here.
- **Sentry / observability**: no Sentry wiring in this commit. Cannot audit log-scrubbing posture since there are no log surfaces yet. Will need fresh audit when Sentry lands.
- **Author bias**: fresh-Agent Claude has a 47% spurious-finding rate on this codebase per docs/retros/2026-06-02-security-reviewer-ab.md. The MEDIUM and LOW findings above are subject to that prior; operator should weight them accordingly. The "What I checked and could not refute" section is more reliable than the "Findings" section — absence-of-finding-after-investigation is a more confident signal than presence-of-finding from this reviewer.

## Re-audit trigger

Re-run this audit when any of the following land:

1. **CB-2.x bot-control endpoints** — first capital-touching state-mutating handlers arrive; handler-side re-verification + CSRF posture become live-exploitable surfaces.
2. **CB-3 manual trading UI** — first non-trivial user-input → DB → render path; XSS + injection surfaces expand materially.
3. **Multi-device passkey support** — `rotateSession` ownership check (latent finding from AB retro) becomes a real IDOR surface.
4. **Recovery code flow** — `/api/auth/recovery/*` becomes a real endpoint; Argon2id implementation + rate-limiting on the recovery path become load-bearing.
5. **Sentry / logging wiring** — log-scrubbing posture becomes an audit-able surface for PII / token leakage.
6. **Vercel preview-deploy access posture change** — if preview deploys are ever exposed to non-operators (currently they aren't).
7. **Next.js major-version upgrade** — proxy.ts contract is version-bound; re-verify the cloned-request-headers mechanism on any Next.js 16 → 17 jump.

---
id: CB-1.4
bet: CB-1
type: story
status: shipped
priority: P0
created: 2026-06-01
shipped: 2026-06-01
author: PM
design_link: n/a (no UI surface — routing-layer enforcement; redirect target visible via existing landing page in CB-1.6)
area_tags: [auth, backend, routing, proxy]
dependencies: [CB-1.1, CB-1.2, CB-1.3]
---

# CB-1.4 — Real session validation in `proxy.ts` (protected route gating)

## Description

Replace the scaffold `TODO` stub in `proxy.ts` (at project root — see Engineer DRI Decision on location) with real session validation. Every request to a protected surface — `/(dashboard)/*`, `/api/coinbase/*`, `/api/bot/*`, and any other `/api/*` route outside `/api/auth/*` and `/api/cron/*` — must load the operator's session cookie, verify it via `lib/auth/sessions.verifySession`, and either pass through (valid session) or be rejected (no/expired session). Public surfaces (landing page + `/api/auth/*` ceremony begin/finish + `/api/cron/tick`) stay open per the `PUBLIC_EXACT` + `PUBLIC_PREFIXES` split (per AC 4 — the flat `PUBLIC_ROUTES` model from the scaffold is replaced with explicit exact-match vs trailing-`/`-prefix categories).

This is the story that closes [CB-1 guardrail #1](../../brief.md) — "**Unauthenticated requests reaching capital-touching surfaces — threshold: 0**" — from a runtime-enforcement standpoint. Without this story, the foundation scaffold leaves all protected routes wide open. With it, every request that touches `auth_sessions` row state is gated.

## Acceptance Criteria

- [ ] **AC 1** — `proxy.ts` **at the project root** (NOT `app/proxy.ts`; see Engineer DRI Decision below on the location bug) replaces the scaffold stub with real validation:
  - Read the `__compass_session` cookie from `request.cookies.get('__compass_session')?.value`.
  - Apply a length cap (MAX 2048 bytes) BEFORE HMAC verification — bounds attacker-controlled compute on a public unauthenticated endpoint.
  - Call `verifySession(signedCookie)` from `@/lib/auth/sessions`.
  - On valid result `{ userId, sessionId }`: forward the request to the downstream handler via the **Next.js documented cloned-request-headers mechanism** — clone `request.headers`, mutate the clone to add `x-session-user-id: <userId>` + `x-session-id: <sessionId>`, then call `NextResponse.next({ request: { headers: clonedHeaders } })`. Next.js translates this to `x-middleware-override-headers` + `x-middleware-request-<key>` sentinel headers on the response; the framework reads those and applies them to the downstream handler's request. **DO NOT** call `result.headers.set('x-session-*', ...)` after construction — that lands the values on the RESPONSE (visible to browser) and does NOT reach the handler. The header forwarding is CONVENIENCE per the corrected DRI Decision below (handlers that perform authenticated actions MUST re-verify via `verifySession` themselves).
  - On `null` (no cookie / invalid / expired / DB row missing): branch per route class — see AC 2 + AC 3.

  **Original AC 1 text** (PR #10 first-attempt, retained for audit): "On valid result: pass through (NextResponse.next()) and enrich the request with x-session-user-id headers for downstream route consumers (saves a re-validate round-trip in subsequent handlers)." Both Codex and fresh-Agent Claude reviewers caught that `next.headers.set(...)` puts headers on the RESPONSE not the cloned REQUEST, AND that the "no security gain in re-validating" rationale (in Decision 2) contradicted the defense-in-depth posture (in Decision 4). Both findings closed in this rewrite.

- [ ] **AC 2** — **Unauthenticated `/(dashboard)/*` requests** redirect to `/` (landing page) with a `?next=<encoded-original-path>` query parameter, ONLY when the original path is a safe same-origin path. HTTP 302. Per the [DRI Decision below](#decisions), the landing page acts as the interim sign-in entry point until CB-1.6 lands a real `/sign-in` page; the `?next` parameter preserves the operator's intended destination across the sign-in ceremony. **Emit-side safety check (security review HIGH on PR #10):** reject candidate `next` values that — don't start with `/`, start with `//` (protocol-relative URL), contain `\` (some routers normalize `\` to `/`), or contain `:` before the first `/` (catches `javascript:`, `data:`, etc.). If the candidate fails, redirect to `/` WITHOUT setting `?next` at all.

- [ ] **AC 3** — **Unauthenticated `/api/*` requests** (excluding `/api/auth/*` and `/api/cron/*`) return `401 { error: 'unauthenticated' }` as JSON. No redirect — APIs are programmatic surfaces, not browser-driven navigations.

- [ ] **AC 4** — **Public routes pass through unchanged in semantics, BUT the matching logic is tightened** per security review (MEDIUM on PR #10). Split into two categories:
  - `PUBLIC_EXACT`: paths that match character-for-character. `/` and `/api/cron/tick` are exact-match only — no sub-paths inherit public status. (Original PR #10 implementation used `startsWith(${p}/)` against the flat list, which would have classified `/api/cron/tick/admin` as public — a silent privilege-escalation surface for any future cron sub-path.)
  - `PUBLIC_PREFIXES`: intentional path hierarchies with a trailing `/`. `/api/auth/register/`, `/api/auth/authenticate/`, `/api/auth/recovery/`. Sub-paths under these prefixes ARE deliberately public (ceremony entry points: begin/finish).

  If CB-1.5 (sign-out) needs `/api/auth/sign-out` listed, that's CB-1.5's change. New entries should default to `PUBLIC_EXACT` unless the path is a deliberate hierarchy.

- [ ] **AC 5** — **No `runtime` declaration on `proxy.ts`** — Next.js 16 proxy.ts is Node.js-only by spec; `export const runtime = '...'` throws (per Next.js 16.2.7 docs). The PR #10 first-attempt declaration was wrong; both reviewers caught it. The Node runtime is the framework's implicit default for proxy.ts and the postgres.js dependency works correctly without a local declaration.

  **Original AC 5 text** (PR #10 first-attempt, retained for audit): "Node runtime explicitly declared via `export const runtime = 'nodejs';`. Required because verifySession transitively imports postgres..." This was based on an outdated reading of Vercel routing-middleware (which CAN declare runtime — but that's the project-root `middleware.ts` flavor, not Next.js 16 `proxy.ts`). PR #10 review surfaced the spec mismatch.

- [ ] **AC 6** — **No DB roundtrip on public routes.** Verify in tests that requests to `/`, `/api/auth/register/*`, `/api/auth/authenticate/*`, `/api/cron/tick` do NOT call `verifySession` (and therefore do not hit the DB). Public routes are public; gating them would defeat the design.

- [ ] **AC 7** — **Vitest unit + integration tests** under `tests/proxy.test.ts` (at tests root, matching the new project-root location of proxy.ts):
  - Public route passthrough × 7 — assert `verifySession` NOT called for `/`, `/api/cron/tick`, `/api/auth/register/{begin,finish}`, `/api/auth/authenticate/{begin,finish}`, `/api/auth/recovery/redeem`
  - **PUBLIC_ROUTES tightening cases (security review MEDIUM):** `/api/cron/tick/admin` returns 401 (not classified as public), `/api/cron/tickets` returns 401 (no prefix-startswith trap)
  - Protected dashboard with no cookie → 302 redirect to `/?next=%2Fdashboard`
  - Protected dashboard with invalid cookie → 302 + verifySession IS called (DB-row check happened)
  - Protected dashboard with valid cookie → 200 AND **`x-middleware-override-headers` + `x-middleware-request-x-session-user-id` + `x-middleware-request-x-session-id` sentinels are present on response** (the Next.js documented mechanism for forwarding cloned request headers to the downstream handler) AND `x-session-user-id` / `x-session-id` are NOT directly on the response (anti-leak check; critical bug from PR #10's first attempt)
  - `?<query>` preserved in `next=`
  - Protected /api/* with no cookie / invalid cookie / valid cookie — 401 / 401 / 200 + sentinel forwarding
  - **`?next` safety (HIGH):** rejects protocol-relative pathname (`//evil.example`), rejects pathname containing backslash, emits safe relative paths cleanly
  - **Cookie length cap (MEDIUM):** cookie length > 2048 bytes triggers fast-fail before verifySession is called (302 for dashboard / 401 for API)
  - All tests pass via `pnpm test`.

- [ ] **AC 8** — **Codex writes E2E** under `e2e/auth/proxy-gating.spec.ts`:
  - Seed: a registered credential + a valid signed session cookie (use existing register + authenticate spec setup, or directly INSERT auth_users/auth_credentials/auth_sessions rows).
  - Hit `/(dashboard)` with NO cookie → expect 302 redirect to `/?next=%2Fdashboard` (or HTML response with login prompt depending on Playwright's redirect-follow behavior; spec should assert the route taken).
  - Hit `/(dashboard)` WITH a valid cookie → expect 200 (passthrough).
  - Hit `/api/coinbase/_canary` (a non-existent route that proxy.ts sees first) with no cookie → expect 401 JSON. (If we don't want to introduce a real /api/coinbase/* surface in this story, use a stub route or a route that doesn't exist yet — proxy fires before the 404, so the test still exercises proxy-gating semantics.)
  - Codex commits with `test:` prefix per `/build` Phase 3.

- [ ] **AC 9** — `pnpm typecheck` passes with `strict: true`. No `any` introduced. All env access via `lib/env` (no `process.env` reads in `proxy.ts`).

- [ ] **AC 10** — `pnpm lint` passes. No new ignore entries.

- [ ] **AC 11** — `pnpm build` produces a successful production build **AND** the build output shows `ƒ Proxy (Middleware)` in the route table **AND** `.next/server/functions-config-manifest.json` has a `/_middleware` entry with `runtime: "nodejs"` and the matchers from `config.matcher`. Next.js 16 moved middleware registration from the legacy `middleware-manifest.json` (now empty in 16.x — verified) to `functions-config-manifest.json`; checking the LEGACY file alone is misleading. Both reviewers on PR #10 first-attempt cited the empty `middleware-manifest.json` as evidence of non-registration — that evidence was directionally correct (file at wrong location DID mean no registration anywhere) but the canonical artifact to inspect in Next 16 is `functions-config-manifest.json`. A green build is necessary but NOT sufficient — the functions-config-manifest entry is the load-bearing proof.

- [ ] **AC 12** — **`verifySession` is the canonical session-check entry point.** No re-implementing the cookie verify + DB-row load logic inside `proxy.ts`. The sliding-expiry side-effect of `verifySession` IS intentional per the architecture's session strategy ("every verified request bumps expires_at"). No `{ readonly: true }` flag added in this story — the LOW-severity finding about stolen-cookie self-renewal is acknowledged as the inherent design trade-off, mitigated by future sign-out (CB-1.5) and post-MVP session-revocation UX. Do not extend `lib/auth/sessions` for a `readonly` flag at proxy-call-site request — the architecture's intent is preserved.

## Standard Experience Checklist

Each category is covered by ≥1 AC OR explicitly `n/a — <reason>`. Same shape as CB-1.2 + CB-1.3.

- [x] **Navigation** — **covered by AC 2** (redirect target + `?next` preservation). The redirect IS a navigation event from the operator's perspective; the `?next` parameter is the navigational continuation contract that CB-1.6 will honor on the receiving end.
- [x] **States** — **covered by AC 1, AC 2, AC 3, AC 6** — HTTP states: 200 (passthrough), 302 (dashboard redirect on no auth), 401 (API rejection on no auth). No loading / empty / disabled UI states in scope (proxy is routing-layer; UI states live in CB-1.6's onboarding page).
- [x] **Feedback** — **covered by AC 3** (typed `error` discriminator on the 401 response). The 302 redirect is feedback-via-routing; the operator lands on the landing page with `?next` indicating "you need to sign in to continue." The landing page's actual UX for this is CB-1.6's contract — for CB-1.4, the routing-layer correctness is the deliverable.
- [x] **Accessibility** — **`n/a — routing-layer enforcement; no UI focus management or keyboard interaction in scope`**. CB-1.6 owns the accessible sign-in UX that this proxy redirects to.
- [x] **Edge cases** — **covered by AC 1, AC 2, AC 3, AC 6, AC 7** — no cookie, invalid cookie, tampered cookie, expired DB row, public-vs-protected boundary, paths with special chars (URL encoding).
- [x] **Cross-surface consistency** — **`n/a — single-target web stack`**. proxy.ts is the web target's routing layer; no mobile / native equivalent in MVP.

## Tech notes

**Architecture reference** — [foundation/architecture.md § Foundational Identity & Access Posture / Cross-cutting standards § Auth](../../../../foundation/architecture.md#foundational-identity--access-posture):

> "Every route outside `/api/auth/*` and `/api/cron/*` requires a valid session cookie verified against an `auth_sessions` row (cookie signature alone is not trusted — DB row is the source of truth)."

CB-1.4 is the routing-layer implementation of that invariant.

**Brief reference** — [CB-1 brief](../../brief.md). CB-1.4 closes the [primary guardrail #1](../../brief.md) (zero unauthenticated capital-touching requests) from a runtime-enforcement standpoint. Without this story, the foundation scaffold leaves every protected route open; with it, the bet's invariant is structurally enforced.

**Library APIs consumed (all shipped via CB-1.1 + extended through CB-1.2 / CB-1.3):**

```ts
// from lib/auth/sessions
verifySession(signedCookie): Promise<{ userId: string; sessionId: string } | null>
// Bumps expires_at on hit (sliding expiry). AC 12 resolves this: the
// side-effect IS intentional per the architecture's session strategy.
// No `{ readonly: true }` flag added; no library extension this round.
```

No library code changes in this story. AC 12 explicitly closes the question of whether to extend `lib/auth/sessions` with a `{ readonly: true }` flag for proxy-frequency reads — the architecture's sliding-expiry intent is preserved; the stolen-cookie self-renewal trade-off is mitigated by future sign-out (CB-1.5) and post-MVP session-revocation UX. `lib/auth/sessions.ts` is unchanged in this story.

**Public routes — split into exact-match + intentional-prefix categories (AC 4 amendment after security review):**

```ts
const PUBLIC_EXACT = new Set<string>([
  "/",                          // landing
  "/api/cron/tick",             // CRON_SECRET-gated, not session-gated; no sub-paths
]);

const PUBLIC_PREFIXES: readonly string[] = [
  "/api/auth/register/",        // ceremony entry points — /begin, /finish under here
  "/api/auth/authenticate/",
  "/api/auth/recovery/",        // future; deferred per portfolio
];
```

The PR #10 first-attempt used a flat list with `pathname.startsWith(${p}/)` against every entry — which would have classified `/api/cron/tick/admin` as public (silent privilege-escalation surface for any future cron sub-path). The split closes that surface: `PUBLIC_EXACT` paths require character-for-character match; `PUBLIC_PREFIXES` paths require trailing `/` and only match true sub-paths.

The matcher inside `export const config = {...}` (already in scaffold) handles asset-file exclusion at the Next.js layer — those never reach `proxy.ts` in the first place. proxy.ts only sees URL-bound requests that COULD be auth-relevant.

**Runtime declaration (AC 5) — DO NOT DECLARE:**

```ts
// proxy.ts — leave the `runtime` export OUT.
// Next.js 16 proxy.ts is Node.js-only by spec; declaring runtime throws.
```

This is the corrected stance after PR #10's first-attempt review. Per Next.js 16.2.7 official docs (surfaced by both Codex and the fresh-Agent Claude code reviewer), setting `export const runtime = 'nodejs'` (or any value) on `proxy.ts` throws. The Node-on-Fluid-Compute runtime is the framework's implicit, immovable default for proxy.ts at root — there is no Edge variant of proxy.ts to opt out of. Declaring it locally adds zero value and breaks on patch upgrades. See the superseded DRI Decision below for the first-attempt mistake + the new Engineer Decision for the corrected stance.

**Why DB-roundtrip per request is the right trade-off:**

The architecture explicitly mandates "cookie alone is not trusted — DB row is the source of truth." Practical implications:

- Sessions can be revoked server-side immediately (DELETE the row + the user loses access on the next protected request, no time-skew window).
- Cookie compromise without DB compromise is bounded — even if a cookie leaks, the DB row's `expires_at` enforces the actual lifetime.
- Latency cost: one Postgres query per protected request. For n=1 single-operator MVP with cron-driven background work as the dominant load, this is acceptable. Document as a Risk; revisit if the bet ever scales to multi-tenant.

**Out of scope (deferred to subsequent stories or post-MVP):**
- Sign-out (`/api/auth/sign-out`) — CB-1.5
- First-deploy onboarding UX page that consumes the `?next` query param — CB-1.6
- Real `/sign-in` page (separate from landing) — CB-1.6 may merge into landing or split
- Session-revocation UI (e.g., "sign out of all devices") — post-MVP
- Per-request observability (Sentry, request-id propagation, structured logging) — same observability follow-up as CB-1.2 / CB-1.3
- Optional `readonly` flag on `verifySession` — **explicitly NOT added** per AC 12. Sliding-expiry on every proxy invocation is the architecture's intended design ("every verified request bumps expires_at"). The stolen-cookie self-renewal risk is acknowledged (LOW severity from PR #10 security review) and mitigated by future sign-out (CB-1.5) + post-MVP session-revocation UX. If write amplification ever becomes a real bottleneck, that's its own follow-up story with proper benchmarking — not a speculative flag.

**Testing approach** — Vitest for unit + integration with a mocked DB layer (sessions.test.ts pattern). Codex's Playwright for E2E. proxy.ts is exercised by constructing `NextRequest` objects with various cookie + path combinations — same testing surface used by Next.js's own proxy tests.

## PRs

- [PR #10](https://github.com/vivekschaudhary/crypto-bot/pull/10) — **merged 2026-06-01** — feat(CB-1.4): real session validation in proxy.ts (defense-in-depth). **5-commit review cycle across 4 rounds** — the most-reviewed CB-1 story to date, surfacing the inherent complexity of proxy-layer auth work (CVE-2025-29927 lineage + Next.js 16 spec details + Vercel routing-middleware skill guidance). Round 1 surfaced 4 BLOCKERs (file location, runtime export, headers-on-response CRITICAL, DRI contradiction) + 1 HIGH (open-redirect) + 2 MEDIUM (PUBLIC_ROUTES prefix trap, cookie length cap) + 1 LOW (sliding-expiry); rewrite `2306273` closed all of them. Rounds 2 + 3 surfaced cascading prose drift in story tech notes, risk mitigations, library-API comments, sibling story docs + (dashboard)/page.tsx — closed across `6b5a874`, `1957eb4`, `e3c9de6`. AC 8 E2E landed via `4cc39a3` (Codex-authored Playwright spec covering all three scenarios + the anti-leak verification that the CRITICAL bug stayed closed end-to-end). Both Codex AND Claude fresh-Agent reviewers ran in A/B for rounds 1-3; complementary blind spots validated the multi-model independent-review discipline.

## Tests

_Engineer writes unit + integration tests under `tests/proxy.test.ts` (at tests root, matching proxy.ts's project-root location)._
_Codex writes E2E at `e2e/auth/proxy-gating.spec.ts` — third E2E in the codebase per AC 8._

Tags:
- `regression: true` (proxy-layer enforcement — regressions cascade across every protected route)
- `e2e: true` (AC 8)

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `docs/bets/CB-1/stories/CB-1.4/fixes/`._

## DRI Log

### Decisions

- [2026-06-01] [PM] **Unauthenticated `/(dashboard)/*` redirects to `/` (landing), not a separate `/sign-in` page** (interim, until CB-1.6 lands)
  - **Rationale (required):** there is no `/sign-in` page in the codebase yet — CB-1.6 owns first-deploy onboarding UX, which may merge sign-in into the landing page OR split it. Until CB-1.6 settles that decision, the landing page is the only safe redirect target. Adding `?next=<encoded-path>` preserves the operator's intended destination so CB-1.6's onboarding flow can honor it (a registration ceremony, sign-in ceremony, or page that detects which one to do). If CB-1.6 splits sign-in into its own page, CB-1.4's redirect target updates one line in `proxy.ts`.
  - **Area (required, tag):** auth / routing
  - **Alternatives considered (required):** redirect to a stub `/sign-in` page that's "coming in CB-1.6" (rejected — adds a temporary page that has to be cleaned up later); return 401 for dashboard routes too (rejected — terrible browser UX, shows a JSON error in the browser window); redirect to a query-string-less landing page (rejected — loses the `next` context that CB-1.6 needs to honor).
  - **Reversibility:** easy — one constant in proxy.ts.

- [2026-06-01] [PM] **(SUPERSEDED 2026-06-01)** Pass session context to downstream handlers via `x-session-user-id` + `x-session-id` request headers **rather than re-validating the cookie at each route** — claimed "no security gain" from re-validation
  - **Status:** superseded by the Engineer DRI Decision below ("Session-context headers are CONVENIENCE only — handlers that perform authenticated actions MUST re-verify"). Per Compass append-only convention, retained here with corrected framing in the superseding entry.
  - **Why superseded:** Codex code review of PR #10's first attempt caught that this Decision directly contradicts Decision 4 (defense-in-depth). The "no security gain" claim was wrong — there IS a security gain in re-verifying at the handler layer (it survives proxy bypass / forged headers / future CVE-class issues at the middleware layer). The original framing optimized for performance (avoid 2× DB read) at the cost of layered defense — that's the wrong trade for an auth surface.
  - **Reversibility:** trivial — the source-code marker + DRI now reflect the correct posture.

- [2026-06-01] [Engineer] **Session-context headers are CONVENIENCE only; handlers that perform authenticated actions MUST re-verify** (corrects the superseded Decision above; aligns with Decision 4's defense-in-depth posture)
  - **Rationale (required):** proxy forwards `x-session-user-id` + `x-session-id` via Next.js's documented cloned-request-headers mechanism (`NextResponse.next({ request: { headers: clone } })`). Downstream handlers receive these via `request.headers.get(...)`. **The headers are CONVENIENCE for routes that don't perform authenticated actions** — audit logging, content rendering with userId in scope, debug surfaces. **Routes that PERFORM authenticated actions** (state mutation, external-API calls, capital-touching ops) **MUST call `verifySession()` themselves** before trusting any session context. The CVE-2025-29927 lineage is the cautionary tale: middleware/proxy auth must never be the sole protection. The 2× DB read cost (proxy + handler) is the right trade for the bet's guardrail #1 ("zero unauthenticated capital-touching requests").
  - **Area (required, tag):** auth / defense-in-depth
  - **Alternatives considered (required):** keep the original "no security gain" Decision and skip handler-layer re-verification (rejected — Codex review of PR #10 caught the contradiction, and security review confirmed proxy bypass is a real threat class); drop the headers entirely so handlers always re-verify (rejected — headers as informational convenience are still useful for audit/logging routes that don't act on the value; explicitly not auth claims); add a typed `requireSession(request)` helper that wraps verifySession + reads headers as a fast-path (deferred — useful but out of CB-1.4 scope; future stories may add it).
  - **Reversibility:** easy — the constraint is a load-bearing source-code comment + story-level convention; future story DRIs inherit it.

- [2026-06-01] [PM] **(SUPERSEDED 2026-06-01)** Node runtime explicitly declared on `proxy.ts` (AC 5 original)
  - **Status:** superseded by the Engineer DRI Decision below ("No `runtime` declaration"). Retained here per Compass append-only convention.
  - **Why superseded:** PR #10's first-attempt review (both Codex AND fresh-Agent Claude) caught that Next.js 16 proxy.ts is Node.js-only by design — setting `export const runtime = 'nodejs'` is invalid (throws on 16.2.7 per the official Next.js docs). The original rationale ("default could change") inverted reality: Next 16's default IS Node for proxy.ts. The runtime declaration was a soft-spec rationalization that pattern-matched on "explicit is better than implicit" without verifying against the actual Next 16 spec.

- [2026-06-01] [Engineer] **No `runtime` declaration on `proxy.ts`** (corrects the superseded Decision above)
  - **Rationale (required):** Next.js 16's proxy.ts is **Node.js-only by spec** — `export const runtime = '...'` throws (per the Next.js 16.2.7 official docs, surfaced during PR #10 review by Codex reading the docs directly + by the fresh-Agent Claude reviewer reading the routing-middleware skill). Omit the declaration entirely. The Node-runtime is implicit and documented in the framework itself; declaring it locally adds zero value and may break on future Next patches.
  - **Area (required, tag):** auth / runtime
  - **Alternatives considered (required):** keep the declaration (rejected — invalid per Next 16 spec, throws); declare a different runtime like Edge (rejected — postgres.js needs Node APIs); split proxy into Edge + Node halves (rejected — over-engineered).
  - **Reversibility:** trivial — line deleted.

- [2026-06-01] [Engineer] **proxy.ts MUST live at project root, not `app/proxy.ts`** (sharpens AC location after PR #10 first-attempt regression)
  - **Rationale (required):** Next.js 16 only registers proxy.ts at the project root (or `src/proxy.ts` with `--src-dir`). A file at `app/proxy.ts` is NOT registered as middleware — `.next/server/middleware-manifest.json` is empty after build, and production traffic never reaches the code. The first-attempt PR #10 placed proxy.ts at `app/proxy.ts` (inheriting the scaffold's broken location). Both reviewers caught this; Claude fresh-Agent specifically verified by inspecting the build manifest. The scaffold's `app/proxy.ts` was a SILENT regression — the file existed and looked correct, but Next.js never invoked it. CB-1.4 fixes the location AND removes the stale `app/proxy.ts` file.
  - **Area (required, tag):** auth / file-location
  - **Alternatives considered (required):** keep `app/proxy.ts` and "hope it gets registered" (rejected — verified by build manifest that it doesn't); add a build-time check (deferred — useful but out of this story's scope; the structural fix at the file-location layer is the right level).
  - **Reversibility:** trivial — one mv command.
  - **Load-bearing source-code marker:** the top of `proxy.ts` (root) documents the location requirement so future readers can't re-introduce the bug.

- [2026-06-01] [Engineer] **Proxy.ts session check is defense-in-depth, NOT sole auth protection** (sharpens AC 1; informed by CVE-2025-29927 and Vercel's documented routing-middleware guidance)
  - **Rationale (required):** the Vercel routing-middleware skill (loaded during Phase 2 of /build per v0.3.5 framework's freshness gate) documents that middleware/proxy auth is "defense-in-depth only — not sole auth layer." Partly motivated by CVE-2025-29927 (middleware auth bypass via `x-middleware-subrequest` header) which prompted the Next.js 16 `middleware.ts → proxy.ts` rename. Implication for CB-1.4: the proxy's verifySession check is the FIRST defense layer, but downstream route handlers that touch capital-sensitive surfaces (CB-1.5 sign-out, future CB-2/3/4/5 stories) MUST re-verify the session themselves — they cannot trust the `x-session-user-id` / `x-session-id` headers proxy injects as authoritative auth claims. Those headers are CONVENIENCE for performance, not auth claims. Honest read: for CB-1.4 today, proxy IS the only layer (no protected route handlers exist yet beyond the placeholder dashboard page); acceptable interim state for n=1 MVP, with future stories adding the route-level layer. Documenting now so future story authors inherit the discipline.
  - **Area (required, tag):** auth / defense-in-depth
  - **Alternatives considered (required):** drop the header injection entirely so handlers MUST call verifySession (rejected — useful as a convenience signal; defense-in-depth doesn't require dropping the headers, just not trusting them as auth claims); make proxy.ts route handlers' SOLE auth layer (rejected — explicitly contradicts the Vercel security guidance); add per-route auth middleware inside each protected route's handler today (rejected — out of CB-1.4 scope; future stories own this for their own handlers).
  - **Reversibility:** trivial — the constraint is a load-bearing comment + story-level convention; future story DRIs inherit it.
  - **Load-bearing source-code marker:** the proxy.ts implementation includes an inline comment naming the defense-in-depth posture so a future reader can't miss it.

### Risks

- [2026-06-01] [PM] **DB-roundtrip per protected request adds latency at every page nav / API call**
  - **Likelihood (required):** certain (it's the architecture's explicit design choice)
  - **Impact (required):** low for MVP (single operator; cron-driven background work is the dominant load; one extra Postgres query per protected request is negligible vs the architectural benefit of immediate revocability)
  - **Mitigation (required):** Fluid Compute's instance reuse keeps postgres.js connection-pool warm across invocations. Supabase pooler (port 6543) handles connection multiplexing. If latency ever becomes user-visible (P90 page load > 500ms), evaluate an in-memory session cache with short TTL (sub-architecture decision; would require a foundation amend or a separate story). Not a current concern.
  - **Area (required, tag):** performance / architecture-trade-off

- [2026-06-01] [PM] **Sliding-expiry side-effect of `verifySession` fires on every protected request — possibly excessive DB write load**
  - **Likelihood (required):** medium (every page nav / image preload / API call triggers a write; for n=1 operator the write rate is bounded but it IS a write-amplification)
  - **Impact (required):** low-medium (Postgres write throughput is not the bottleneck at MVP load; could become one at SaaS scale or if the operator's session is repeatedly bumped during long working sessions with many resources loaded per page)
  - **Mitigation (required):** AC 12 closed this question — sliding-expiry on every proxy invocation IS preserved (matches the architecture's documented session strategy). No `{ readonly: true }` flag added. Writes are bounded by the n=1 operator's actual activity; Postgres handles this fine at MVP load. If write amplification ever becomes a measured bottleneck (P90 write-throughput > 80% of pool capacity, sustained), evaluate either (a) a real fix via a separate story with benchmarking, OR (b) revisit the architecture's slide-on-every-verified-request stance with the foundation amend process. Not a current concern.
  - **Area (required, tag):** performance / architecture-trade-off

- [2026-06-01] [PM] **Proxy gating runs on EVERY non-asset request — bugs here cascade across the entire app**
  - **Likelihood (required):** low (the canonical helper does the load-bearing work; proxy.ts is thin glue per AC 12)
  - **Impact (required):** high if it bites — a bug that lets unauthenticated requests through breaks the bet's primary guardrail; a bug that blocks authenticated requests makes the app unusable
  - **Mitigation (required):** AC 7's test coverage is intentionally broad (public-route passthrough with verifySession-not-called assertions, dashboard-redirect, API-401, valid-session passthrough with Next.js sentinel-header forwarding + anti-leak checks, `?next` safety, PUBLIC_ROUTES tightening, cookie length cap, URL-encoding). AC 8's E2E exercises the full request lifecycle in a real browser. AC 12's "use canonical helper" rule prevents the proxy from reinventing the validation logic.
  - **Area (required, tag):** security / coverage

### Issues

_None at story creation._

- [2026-06-01] [Engineer] **Latent scaffold quirk: `app/page.tsx` AND `app/(dashboard)/page.tsx` both exist** — both nominally resolve to `/` per Next.js App Router route-group conventions (route groups in parens don't appear in the URL)
  - **Severity:** P3 (cosmetic / latent — production build has been succeeding so Next.js is resolving the collision somehow, likely by precedence rules I haven't traced)
  - **Owner:** future scaffold-cleanup story (CB-1.6 likely candidate when first-deploy onboarding UX lands and the (dashboard) route group's actual nested-page structure gets settled)
  - **Status:** open / surfaced
  - **Area:** scaffold / Next.js routing
  - **Why not fixed in CB-1.4:** proxy.ts session-gating is pathname-based (matches on `/api/*` vs everything else), not route-group-based. The collision doesn't affect proxy correctness. CB-1.4 isn't the right story to settle the dashboard route structure — that's a CB-1.6 + first-page-content concern. Surfacing here so the next story that touches `app/(dashboard)/*` knows to resolve it.

---

_Story closed: <date>, brief link: [docs/bets/CB-1/brief.md](../../brief.md)_

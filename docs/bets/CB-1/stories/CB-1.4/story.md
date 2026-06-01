---
id: CB-1.4
bet: CB-1
type: story
status: ready
priority: P0
created: 2026-06-01
author: PM
design_link: n/a (no UI surface — routing-layer enforcement; redirect target visible via existing landing page in CB-1.6)
area_tags: [auth, backend, routing, proxy]
dependencies: [CB-1.1, CB-1.2, CB-1.3]
---

# CB-1.4 — Real session validation in `app/proxy.ts` (protected route gating)

## Description

Replace the scaffold `TODO` stub in `app/proxy.ts` with real session validation. Every request to a protected surface — `/(dashboard)/*`, `/api/coinbase/*`, `/api/bot/*`, and any other `/api/*` route outside `/api/auth/*` and `/api/cron/*` — must load the operator's session cookie, verify it via `lib/auth/sessions.verifySession`, and either pass through (valid session) or be rejected (no/expired session). Public surfaces (landing page + `/api/auth/*` ceremonies + `/api/cron/tick`) stay open per the existing `PUBLIC_ROUTES` list.

This is the story that closes [CB-1 guardrail #1](../../brief.md) — "**Unauthenticated requests reaching capital-touching surfaces — threshold: 0**" — from a runtime-enforcement standpoint. Without this story, the foundation scaffold leaves all protected routes wide open. With it, every request that touches `auth_sessions` row state is gated.

## Acceptance Criteria

- [ ] **AC 1** — `app/proxy.ts` replaces the `// TODO (story ticket): replace stub with real session validation.` block with real validation:
  - Read the `__compass_session` cookie from `request.cookies.get('__compass_session')?.value`.
  - Call `verifySession(signedCookie)` from `@/lib/auth/sessions`.
  - On valid result `{ userId, sessionId }`: pass through (`NextResponse.next()`) and enrich the request with `x-session-user-id: <userId>` + `x-session-id: <sessionId>` headers for downstream route consumers (saves a re-validate round-trip in subsequent handlers).
  - On `null` (no cookie / invalid / expired / DB row missing): branch per route class — see AC 2 + AC 3.

- [ ] **AC 2** — **Unauthenticated `/(dashboard)/*` requests** redirect to `/` (landing page) with a `?next=<encoded-original-path>` query parameter. HTTP 302. Per the [DRI Decision below](#decisions), the landing page acts as the interim sign-in entry point until CB-1.6 lands a real `/sign-in` page; the `?next` parameter preserves the operator's intended destination across the sign-in ceremony.

- [ ] **AC 3** — **Unauthenticated `/api/*` requests** (excluding `/api/auth/*` and `/api/cron/*`) return `401 { error: 'unauthenticated' }` as JSON. No redirect — APIs are programmatic surfaces, not browser-driven navigations.

- [ ] **AC 4** — **Public routes pass through unchanged** per the existing `PUBLIC_ROUTES` list. The list also stays untouched in this story — no widening, no narrowing. If CB-1.5 (sign-out) needs `/api/auth/sign-out` listed, that's CB-1.5's change, not CB-1.4's.

- [ ] **AC 5** — **Node runtime explicitly declared** via `export const runtime = 'nodejs';` at the top of `app/proxy.ts`. Required because `verifySession` transitively imports `postgres` (the postgres.js client) which uses Node-only APIs. Per the v0.3.5 Compass framework sync's Vercel knowledge update: middleware/proxy DOES support full Node.js under Fluid Compute. Without the explicit declaration, Next.js's default behavior on proxy.ts may select an Edge runtime that can't load `postgres` and fails at the module-resolution layer.

- [ ] **AC 6** — **No DB roundtrip on public routes.** Verify in tests that requests to `/`, `/api/auth/register/*`, `/api/auth/authenticate/*`, `/api/cron/tick` do NOT call `verifySession` (and therefore do not hit the DB). Public routes are public; gating them would defeat the design.

- [ ] **AC 7** — **Vitest unit + integration tests** under `tests/app/proxy.test.ts`:
  - Public route passthrough (no DB call) — `/`, `/api/auth/register/begin`, `/api/auth/authenticate/finish`, `/api/cron/tick` — 5+ cases
  - Protected `/(dashboard)/*` with no cookie → 302 redirect to `/?next=...`
  - Protected `/(dashboard)/*` with invalid (tampered) cookie → 302 redirect
  - Protected `/(dashboard)/*` with valid cookie → passthrough, response carries `x-session-user-id` + `x-session-id` headers
  - Protected `/api/*` (e.g., `/api/coinbase/balances`) with no cookie → 401 JSON
  - Protected `/api/*` with valid cookie → passthrough + headers
  - `?next` parameter is URL-encoded correctly for paths with special chars
  - All tests pass via `pnpm test`.

- [ ] **AC 8** — **Codex writes E2E** under `e2e/auth/proxy-gating.spec.ts`:
  - Seed: a registered credential + a valid signed session cookie (use existing register + authenticate spec setup, or directly INSERT auth_users/auth_credentials/auth_sessions rows).
  - Hit `/(dashboard)` with NO cookie → expect 302 redirect to `/?next=%2Fdashboard` (or HTML response with login prompt depending on Playwright's redirect-follow behavior; spec should assert the route taken).
  - Hit `/(dashboard)` WITH a valid cookie → expect 200 (passthrough).
  - Hit `/api/coinbase/_canary` (a non-existent route that proxy.ts sees first) with no cookie → expect 401 JSON. (If we don't want to introduce a real /api/coinbase/* surface in this story, use a stub route or a route that doesn't exist yet — proxy fires before the 404, so the test still exercises proxy-gating semantics.)
  - Codex commits with `test:` prefix per `/build` Phase 3.

- [ ] **AC 9** — `pnpm typecheck` passes with `strict: true`. No `any` introduced. All env access via `lib/env` (no `process.env` reads in `app/proxy.ts`).

- [ ] **AC 10** — `pnpm lint` passes. No new ignore entries.

- [ ] **AC 11** — `pnpm build` produces a successful production build. proxy.ts shows in the build output's middleware section (or equivalent Next.js 16 indication that it'll be deployed as a route-interception layer).

- [ ] **AC 12** — **`verifySession` is the canonical session-check entry point.** No re-implementing the cookie verify + DB-row load logic inside `app/proxy.ts`. If the helper needs an option (e.g., to skip the sliding-expiry bump for proxy reads to reduce write load), extend the helper additively per the CB-1.2 / CB-1.3 pattern — don't duplicate the logic. This story's Engineer DRI section should explicitly address whether the sliding-expiry side-effect of `verifySession` is acceptable to fire on every protected request (default: yes — that's the documented design) or whether a `{ readonly: true }` flag should be added.

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
// Bumps expires_at on hit (sliding expiry). See DRI question in AC 12 for
// whether this side-effect is acceptable on every proxy invocation.
```

No new library code expected in this story (per the AC 12 directive to use the canonical helper). The only `lib/auth/sessions.ts` change that might land is the optional `readonly` flag if the Engineer concludes the sliding-expiry side-effect is too expensive at proxy-frequency.

**Public routes list (already in scaffold; preserved unchanged):**

```ts
const PUBLIC_ROUTES = [
  "/",                          // landing
  "/api/auth/register",         // ceremony entry points
  "/api/auth/authenticate",
  "/api/auth/recovery",
  "/api/cron/tick",             // CRON_SECRET-gated, not session-gated
];
```

The matcher inside `export const config = {...}` (already in scaffold) handles asset-file exclusion at the Next.js layer — those never reach `proxy.ts` in the first place. proxy.ts only sees URL-bound requests that COULD be auth-relevant.

**Runtime declaration (AC 5):**

```ts
export const runtime = 'nodejs';
```

This is load-bearing. Without it, Next.js may pick an Edge runtime that lacks the Node-only APIs `postgres` (the postgres.js client) requires. Per the v0.3.5 framework sync's Vercel knowledge:

> "Middleware supports full Node.js (not edge-only). Use Fluid Compute."

So Node-on-Fluid-Compute is supported AND is the right choice for our DB-backed session check. The runtime declaration makes that explicit + future-proof against Next.js default changes.

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
- Optional `readonly` flag on `verifySession` — only added if Engineer concludes sliding-expiry on every protected request is too expensive (AC 12)

**Testing approach** — Vitest for unit + integration with a mocked DB layer (sessions.test.ts pattern). Codex's Playwright for E2E. proxy.ts is exercised by constructing `NextRequest` objects with various cookie + path combinations — same testing surface used by Next.js's own proxy tests.

## PRs

_Auto-populated as PRs open._

## Tests

_Engineer writes unit + integration tests under `tests/app/proxy.test.ts`._
_Codex writes E2E at `e2e/auth/proxy-gating.spec.ts` — third E2E in the codebase per AC 8._

Tags:
- `regression: true` (proxy-layer enforcement — regressions cascade across every protected route)
- `e2e: true` (AC 8)

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `docs/bets/CB-1/stories/CB-1.4/fixes/`._

## DRI Log

### Decisions

- [2026-06-01] [PM] **Unauthenticated `/(dashboard)/*` redirects to `/` (landing), not a separate `/sign-in` page** (interim, until CB-1.6 lands)
  - **Rationale (required):** there is no `/sign-in` page in the codebase yet — CB-1.6 owns first-deploy onboarding UX, which may merge sign-in into the landing page OR split it. Until CB-1.6 settles that decision, the landing page is the only safe redirect target. Adding `?next=<encoded-path>` preserves the operator's intended destination so CB-1.6's onboarding flow can honor it (a registration ceremony, sign-in ceremony, or page that detects which one to do). If CB-1.6 splits sign-in into its own page, CB-1.4's redirect target updates one line in `app/proxy.ts`.
  - **Area (required, tag):** auth / routing
  - **Alternatives considered (required):** redirect to a stub `/sign-in` page that's "coming in CB-1.6" (rejected — adds a temporary page that has to be cleaned up later); return 401 for dashboard routes too (rejected — terrible browser UX, shows a JSON error in the browser window); redirect to a query-string-less landing page (rejected — loses the `next` context that CB-1.6 needs to honor).
  - **Reversibility:** easy — one constant in proxy.ts.

- [2026-06-01] [PM] **Pass session context to downstream handlers via `x-session-user-id` + `x-session-id` request headers** (rather than re-validating the cookie at each route)
  - **Rationale (required):** proxy.ts has already done the cookie verify + DB row load. Re-doing it in every protected route handler would double the DB read load with no security gain (proxy already enforced the gate). Setting two headers on the passed-through request lets handlers read `request.headers.get('x-session-user-id')` directly. Same pattern Next.js examples document for middleware-injected context.
  - **Area (required, tag):** auth / performance
  - **Alternatives considered (required):** re-call `verifySession` in every protected route (rejected — 2× DB read per request); use `cookies()` from Next.js server context to read the cookie again in each route (rejected — same anti-pattern, just hides the duplication); store session context in a request-scoped AsyncLocalStorage (rejected — over-engineered for n=1 MVP; the header pattern is idiomatic Next.js).
  - **Reversibility:** easy — handlers can ignore the headers and re-validate if they prefer (defense in depth); removing the headers from proxy.ts is one line.

- [2026-06-01] [PM] **Node runtime explicitly declared on `app/proxy.ts`** (AC 5)
  - **Rationale (required):** the v0.3.5 Compass framework sync documented that Vercel middleware now supports full Node.js under Fluid Compute. Declaring `export const runtime = 'nodejs'` is load-bearing because (a) Next.js's runtime default for proxy.ts could change between versions, (b) postgres.js (transitively imported via `verifySession`) needs Node APIs unavailable in Edge runtimes, and (c) explicit declaration documents the choice for future readers. Latency cost is bounded by Fluid Compute's instance reuse + the architecture's already-mandated DB-roundtrip per protected request.
  - **Area (required, tag):** auth / runtime
  - **Alternatives considered (required):** rely on Next.js default (rejected — implicit defaults break silently between versions; the recently-synced Vercel knowledge specifically calls out "default could change"); use Edge runtime with a `fetch`-based DB call (rejected — Supabase has an HTTP proxy but it adds a network hop + the architecture explicitly chose direct Postgres connection); split proxy into Edge-runtime cookie-signature check + Node-runtime DB validation (rejected — over-engineered; the DB call is the load-bearing semantic check per architecture).
  - **Reversibility:** easy — one line at the top of proxy.ts.

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
  - **Mitigation (required):** AC 12 calls out this question explicitly — Engineer decides at implementation whether to add an optional `{ readonly: true }` flag to `verifySession` so proxy reads can skip the bump. If they do, the bump still fires on authenticated route handlers that explicitly opt into the slide. If they don't, the writes are bounded by the n=1 operator's actual activity (Postgres handles this fine).
  - **Area (required, tag):** performance / library-extension

- [2026-06-01] [PM] **Proxy gating runs on EVERY non-asset request — bugs here cascade across the entire app**
  - **Likelihood (required):** low (the canonical helper does the load-bearing work; proxy.ts is thin glue per AC 12)
  - **Impact (required):** high if it bites — a bug that lets unauthenticated requests through breaks the bet's primary guardrail; a bug that blocks authenticated requests makes the app unusable
  - **Mitigation (required):** AC 7's test coverage is intentionally broad (public-route passthrough, dashboard-redirect, API-401, valid-session-passthrough, header-enrichment, URL-encoding). AC 8's E2E exercises the full request lifecycle in a real browser. AC 12's "use canonical helper" rule prevents the proxy from reinventing the validation logic.
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

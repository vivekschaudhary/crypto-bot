---
id: CB-2
type: feature
status: approved
priority: P0
parent: FOUNDATION-PRODUCT
portfolio_stub: false
depends_on: []
parallel_with: [CB-1]
architecture_required: false
created: 2026-05-31
promoted: 2026-06-06
author: PM
sources:
  - docs/foundation/product.md
  - docs/foundation/architecture.md
  - docs/foundation/portfolio.md
  - docs/foundation/architecture-research.md
key_metric:
  name: Wrapper API success rate (Coinbase requests that return 2xx as a fraction of total requests, EXCLUDING 4xx caller errors which are bugs in the consumer, not the wrapper)
  baseline: n/a (greenfield — no Coinbase integration in production yet)
  target: ">= 99% over rolling 30-day window once the wrapper has accrued >= 100 real requests against the live Coinbase API"
  source: derivable from Sentry breadcrumbs + structured logs emitted by `lib/coinbase/` request-trace helper
guardrails:
  - name: Coinbase rate-limit utilization (% of public endpoint ceiling consumed by our requests)
    threshold: stays < 10% of Coinbase ceiling per architecture.md Performance-Efficiency fitness function; alarms if > 25%
  - name: LIVE_MODE gate location (architectural invariant — wrapper stays policy-free; consumer owns gate)
    threshold: zero `LIVE_MODE` reads inside `lib/coinbase/`; enforced via grep + ESLint rule; CI fails if violated
  - name: Bundle size of `lib/coinbase/`
    threshold: < 50 KB compiled (the wrapper is a typed shim, not a kitchen-sink SDK re-export); soft alarm at 100 KB
  - name: Secrets in repo
    threshold: 0 (gitleaks + CI secret-scan; inherited; non-negotiable)
measurement_window_days: 30
check_in_cadence: weekly
area_tags: [backend, coinbase-integration, dependency-management]
estimate:
  duration_weeks: 1
  confidence: high
  refined_by: build-actuals
  refined_at: 2026-06-07
  estimated_start: 2026-06-06
  estimated_end: 2026-06-13
  actual_start: 2026-06-06
  stories_shipped: 2
  stories_remaining_forecast: 3
---

# CB-2 — Typed `lib/coinbase/` Wrapper Around Coinbase Advanced Trade

> The data-layer foundation every downstream bet (CB-3 strategy, CB-4 bot runtime, CB-5 dashboard) reads from. Wraps Coinbase Advanced Trade REST (CDP JWT auth) in a single typed surface so consumers don't rebuild auth, types, errors, or rate-limit awareness in parallel.

## Problem

Every downstream MVP bet — strategy authoring (CB-3), bot runtime (CB-4), and dashboard (CB-5) — needs to read from Coinbase. Without a shared typed wrapper, each bet would independently re-implement CDP JWT signing, request retries, rate-limit headers, response Zod schemas, and `lib/env`-integrated auth. That's three parallel implementations of an auth path against a real-money API — multiplied attack surface, divergent retry/backoff behavior, inconsistent typing, and code-review fatigue every time Coinbase's API shifts.

The auth invariant matters most. The operator's CDP key is Trade-scoped (no Withdraw) per [product.md § Failure mode if auth is bypassed](../../foundation/product.md#failure-mode-if-auth-is-bypassed); the architecture's [Foundational Identity & Access Posture](../../foundation/architecture.md#foundational-identity--access-posture) names "Coinbase API keys (Trade-only scoped at Coinbase platform layer)" as a sensitive asset. One signing path, one error-handling path, one place to audit.

## User

**Primary user: the other bets (CB-3, CB-4, CB-5) as consumers.** CB-2 is foundational plumbing — the *operator* is the downstream beneficiary but never directly touches `lib/coinbase/`. Concretely:

- **CB-3** (strategy authoring): calls `getProducts()` + `getProduct(productId)` to surface available trading pairs and compute the top-5-by-global-24h-volume that the operator then selects from. (The 2026-06-06 PM DRI Decision renamed the per-product method from `getProductStats` to `getProduct` to match Coinbase's actual API surface — stats fields are returned by the single-product endpoint.)
- **CB-4** (bot runtime): calls `getAccountBalances()`, `getProductCandles()` for signal computation, and conditionally `placeOrder()` / `cancelOrder()` (gated on `LIVE_MODE` **inside CB-4**, not the wrapper).
- **CB-5** (dashboard): calls `getAccountBalances()` + `getAccountTradeHistory()` for the trade ledger view.

**Secondary user: the operator** — benefits from a stable, debuggable seam. When Coinbase changes their API, the operator amends one file in `lib/coinbase/` (not three consumer call-sites).

## Why this matters

CB-2 sits on the **critical path** per [plan.md v6 § Calendar view](../../foundation/plan.md#calendar-view) — it's the new binding-dep for CB-3 (replacing CB-1, which shipped 2026-06-05). Every day CB-2 slips, the MVP target slips. Conversely, sharpening CB-2's estimate from the v6 stub (2 weeks, low confidence) to a brief-approval refinement (1 week, medium confidence) compresses MVP by ~1 week.

It also sits at the **only place in the codebase that touches a real-money API**. Getting the wrapper shape right once means CB-4's bot-tick loop inherits a stable surface to gate `LIVE_MODE` against. Getting it wrong once means cross-cutting rewrites in CB-3..CB-5 plus a security re-review on every consumer.

## Hypothesis (the bet)

If we ship a typed `lib/coinbase/` wrapper around Coinbase Advanced Trade REST using **direct fetch + per-request JWT via `node:crypto` (no SDK)** — resolved 2026-06-06 via the [CB-2.1 Engineer DRI Decision](stories/CB-2.1/story.md#decisions), which closes [foundation architecture DRI Issue #1](../../foundation/architecture.md#issues) — exposing all read + write endpoints needed by CB-3/CB-4/CB-5 with consistent Zod-validated types + structured-log breadcrumbs + zero `LIVE_MODE` knowledge inside the wrapper, then **wrapper API success rate (2xx responses / total requests, excluding 4xx caller errors) reaches ≥ 99% over a rolling 30-day window** once the wrapper has accrued ≥ 100 real requests, measured from CB-4's first deployed bot tick.

## Defensibility

Not a moat. Coinbase has multiple actively-maintained TS SDKs ([arch-research.md §1.3](../../foundation/architecture-research.md#1-prior-art)); swap risk is near-zero. The "moat" here, to the extent there is one, is the **curation seam** — what endpoints we choose to expose, what Zod schemas we promote to the wrapper boundary, what defensive types prevent CB-4 from mis-firing a real-money order. That's process moat for the single operator, identical to the foundational product bet's posture ([product.md § Defensibility](../../foundation/product.md#defensibility--moat)).

**Moat impact (one line):** None. CB-2 is plumbing; the wrapper itself is replaceable in days. The downstream policy decisions (in CB-4) are what determine whether the bot earns operator trust.

## Scope

### In scope

- **`lib/coinbase/`** typed wrapper module:
  - `lib/coinbase/client.ts` — single Coinbase client instance (CDP JWT auth via env-injected `COINBASE_API_KEY_NAME` + `COINBASE_API_PRIVATE_KEY` per [runbook step 4 + 6](../../ops/runbook.md))
  - `lib/coinbase/market.ts` — public market data: `getProducts()`, `getProduct(productId)` (single product detail; response includes 24h volume + price stats — used by CB-3 for top-5 ranking), `getProductCandles(productId, granularity, window)` (signal-input for CB-4). **Amended 2026-06-06 (post-promotion) — see PM DRI Decision below:** the original wording said `getProductStats(productId)`, but Coinbase Advanced Trade v3 does NOT expose a separate stats endpoint — the 24h-volume + price stats are returned by the single-product endpoint (`GET /api/v3/brokerage/market/products/{product_id}`). The wrapper method name is renamed to `getProduct(productId)` to match the actual API surface. The downstream consumer (CB-3 top-5 algorithm) reads the same response fields it would have read from a `getProductStats` method; functionally identical.
  - `lib/coinbase/accounts.ts` — authenticated read: `getAccountBalances()`, `getAccount(accountUuid)`, `getAccountTradeHistory({productIds?, start?, end?, cursor?, limit?})`. **Amended 2026-06-07 in two stages — see PM DRI Decisions below.** (1) During `/create-story CB-2.3`, the original `{assetId?, from?, to?}` was renamed to `{productId?, start?, end?}` because Coinbase's `/orders/historical/fills` filters by trading pair, not bare asset. (2) During `/build CB-2.3` (PR #34 round-1 BLOCKER), `productId` was further corrected to `productIds: string[]` because Coinbase's actual query parameter is the PLURAL `product_ids` (array) per the [List Fills docs](https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/orders/list-fills) — the singular form was undocumented and may silently match-all. Also during stage (1), added `getAccount(accountUuid)` to match Coinbase's `GET /accounts/{account_uuid}` surface (parallels `getProduct(productId)` from CB-2.2).
  - `lib/coinbase/orders.ts` — authenticated write: `placeOrder({productId, side, amount, type})`, `cancelOrder(orderId)`. **No `LIVE_MODE` check inside.** Consumer (CB-4) owns the policy.
  - `lib/coinbase/types.ts` — Zod schemas at the wrapper boundary; typed errors via custom class (`CoinbaseClientError` with `code`, `message`, `cause`, `status`)
  - `lib/coinbase/trace.ts` — structured-log breadcrumb helper: emits one log line per request with `{method, endpoint, status, duration_ms}` for the success-rate metric
- **CDP JWT auth** integration via `lib/env` (per CB-1.1 pattern — env vars validated at startup; no direct `process.env` reads)
- ~~**Coinbase TS SDK pick** as the first Engineer DRI Decision on the first CB-2 story (lean is tiagosiebler per [arch-research.md §1.3](../../foundation/architecture-research.md#1-prior-art); rejection of alternatives logged inline)~~ **RESOLVED 2026-06-06 via [CB-2.1 Engineer DRI Decision](stories/CB-2.1/story.md#decisions): NO SDK** — direct REST + JWT via `node:crypto`. Three SDK alternatives explicitly rejected. Closes [foundation architecture DRI Issue #1](../../foundation/architecture.md#issues).
- **Test coverage:**
  - Unit tests with mocked `fetch` responses (every wrapper function — no SDK to mock)
  - Contract tests using a snapshot of real Coinbase responses (fixture-replay; no live calls in CI)
  - One integration test against the real Coinbase API gated on a `RUN_INTEGRATION_TESTS` env var (operator-runs locally before bet ships)
- **Rate-limit awareness:** wrapper inspects `X-RateLimit-Remaining` headers and emits warnings via Sentry breadcrumb when usage exceeds 25% of ceiling per request (defensive; well under the architecture's 10% threshold target)

### Out of scope (deferred to other bets)

- **Top-5 discovery algorithm** → **CB-3** owns it. Operator confirmed at promotion: "data layer only" scope for CB-2; even discovery moves into the bet that owns strategy.
- **Top-5 selection UX** → **CB-3** as part of strategy authoring.
- **`LIVE_MODE` gate at order placement** → **CB-4** owns. Wrapper stays policy-free (load-bearing architectural invariant; guardrail metric).
- **Cron tick / signal evaluation / decision-tree** → **CB-4**.
- **Dashboard rendering of Coinbase data** → **CB-5**.
- **Manual trading UI** — out of MVP per [portfolio.md § Deliberately out of MVP](../../foundation/portfolio.md#deliberately-out-of-mvp).
- **WebSocket / streaming** — cron-driven design per [product.md DRI Decision](../../foundation/product.md#decisions); no WS in MVP.
- **Caching layer** — CB-4 can wrap CB-2 calls with `unstable_cache` (per the CB-1.5 / `lib/auth/credential-count.ts` pattern from PR #18) if cron-tick batching warrants it. Wrapper stays uncached so consumers control freshness.
- **Multi-account / portfolio** — out of MVP per portfolio.
- **Coinbase Pro / legacy HMAC** — Advanced Trade CDP JWT is the supported path per [architecture.md § Stack](../../foundation/architecture.md#stack); legacy is non-goal.

## Open questions for Researcher

1. **Coinbase rate-limit headers** — does CDP JWT-auth'd Advanced Trade actually surface `X-RateLimit-Remaining`, or only return 429 on exceedance? Affects whether our defensive 25%-warning is achievable or whether we wait for 429 + back off. Cite the Coinbase docs page that confirms either way. ([Coinbase Developer Platform — Rate Limits](https://docs.cdp.coinbase.com/coinbase-app/advanced-trade-apis/websocket/websocket-rate-limits)) (Deferred to CB-2.5 when `trace.ts` ships rate-limit observability.)
2. ~~**SDK comparison**~~ — **CLOSED 2026-06-06.** Resolved via [CB-2.1 Engineer DRI Decision](stories/CB-2.1/story.md#decisions): no SDK at all. The three SDK candidates were evaluated and all three rejected (tiagosiebler — vendor in auth path + EdDSA support uncertain; coinbase-samples — 8+ months stale, no test suite; JoshJancula — CDP JWT support not explicit). Direct REST + JWT via `node:crypto` is the shipped pattern. **No remaining SDK question for Researcher.**
3. **CDP JWT key rotation cadence** — Coinbase recommends rotating CDP keys quarterly per [runbook § Rotation procedures](../../ops/runbook.md#coinbase-api-key-quarterly). Does our direct `node:crypto` JWT-minting path gracefully handle mid-request rotation (key changes between request A and request B), or do we need a process-restart shim? Affects whether key rotation requires a deploy or just an env-var update. (Reframed from "Does the SDK gracefully handle..." now that the no-SDK pivot is committed.)

## Research findings

**Researcher item 2 (SDK comparison) is now closed by the CB-2.1 Engineer DRI Decision** (no SDK; direct REST + JWT). Items 1 (rate-limit headers) and 3 (CDP JWT key rotation behavior of our direct path) remain open; both are deferred to CB-2.5 (trace.ts + rate-limit observability) where they're directly load-bearing on the build work.

## User pain input (from Support)

_n=1 single-operator product — Support pain mirrors the operator's own developer experience. The operator has noted (informally, during foundation review):_

- **Past pain with multi-exchange bot tools** — having to "trust the wrapper" when it's opaque is exactly what the operator wants to avoid. The CB-2 wrapper should be plain, debuggable, and small enough to read end-to-end.
- **CDP JWT vs legacy HMAC** — operator already burned a half-day during canary verification distinguishing legacy Coinbase Pro keys (HMAC) from CDP keys (JWT). Wrapper's documentation must lead with "CDP only" so future-operator doesn't backslide.

## Stories

_Decomposed one at a time via `/create-story CB-2`. Forecast: 3–5 stories. Not authoritative; the workflow estimate model fires the "Stories created" trigger as each story.md file lands._

- **CB-2.1 — `client.ts` + `jwt.ts` + `types.ts` foundation** — **SHIPPED 2026-06-06** via [PR #26](https://github.com/vivekschaudhary/crypto-bot/pull/26) (commit `fc88b5f`). [Engineer DRI Decision: no SDK](stories/CB-2.1/story.md#decisions) — direct REST + per-request JWT via `node:crypto` (ES256/EdDSA auto-detect). Closes [foundation architecture DRI Issue #1](../../foundation/architecture.md#issues). Ships `lib/coinbase/{client,jwt,types}.ts` + 46 unit tests + 2 gated integration tests against real Coinbase public endpoint (no CDP creds required for smoke). 2 Codex round-1 BLOCKERs closed (transport-failure `safeFetch` wrap + EdDSA brokerage caveat).
- **CB-2.2 — `market.ts` + Zod types for public endpoints** — `getProducts`, `getProduct(productId)`, `getProductCandles`; the typed surface CB-3 reads from. Rides `publicRequest()` from CB-2.1; no JWT exercise. **SHIPPED 2026-06-07** via [PR #32](https://github.com/vivekschaudhary/crypto-bot/pull/32) (commit `c86991a`). Ships `lib/coinbase/{market,market-schemas}.ts` + 15 unit tests + 3 gated integration tests against real Coinbase public endpoints. 5 Engineer DRI Decisions: auto-paginate at limit=250; Unix-seconds time format; 9 granularity enum values; Zod failures → `CoinbaseClientError({code: "validation-failed"})`; fail-loud on > 350-candle range (no auto-chunk). Codex round-1 BLOCKER: FOUR_HOUR granularity + 350-candle max + `volume_24h` required (matched current docs vs the original 300/8-granularity assumptions). Method-name `getProduct` reflects the 2026-06-06 PM DRI Decision above.
- **CB-2.3 — `accounts.ts` for authenticated reads** — `getAccountBalances()`, `getAccount(uuid)`, `getAccountTradeHistory({productIds?: string[], start?, end?, cursor?, limit?})`; the typed surface CB-5 (dashboard ledger) reads from. **First story that exercises `request()` + JWT auth against `/api/v3/brokerage/*` endpoints** — load-bearing EdDSA brokerage caveat verification per [CB-2.1 Risk](stories/CB-2.1/story.md#risks-engineer-round-1-then-pm-pre-existing-for-audit). Requires CDP credentials in `.env.local` for the integration test (operator runs locally; CI skips). Parameter names (`productIds` plural array, not `assetId` nor singular `productId`; `start`/`end` not `from`/`to`; new `getAccount(uuid)`) reflect the 2026-06-07 PM DRI Decisions above — see in particular the `productId → productIds` Decision that resolved the Codex PR #34 round-1 BLOCKER (Coinbase's actual query param is plural `product_ids`, array). **`ready` 2026-06-07** via [PR #33](https://github.com/vivekschaudhary/crypto-bot/pull/33); see [story.md](stories/CB-2.3/story.md).
- **CB-2.4 — `orders.ts` for authenticated writes** — `placeOrder`, `cancelOrder`; no policy; the typed surface CB-4 reads from
- **CB-2.5 — `trace.ts` + Sentry integration** — structured-log breadcrumbs; the success-rate metric instrumentation; resolves the EdDSA brokerage uncertainty surfaced in CB-2.1 (real auth'd integration test against brokerage with EdDSA credentials)

Per the operator's [CB-1 actual-velocity signal](../../foundation/plan.md#risks-to-plan) (~0.7 days/story), this likely ships in 3–5 calendar days. **Confidence advanced `medium` → `high` on 2026-06-06** per the workflow estimate model "First build PR merged" trigger (CB-2.1's ship). See [brief frontmatter](#) `estimate.refined_by: build-actuals`.

## Scan summary

- **Last scanned:** n/a (no scan-report yet — first scan happens after the first story shipped per `/scan` pattern; CB-2.1 shipped 2026-06-06 and CB-2.2 shipped 2026-06-07 but `/scan CB-2` not yet fired)
- **Current phase:** in-build (CB-2.1 + CB-2.2 shipped via [PR #26](https://github.com/vivekschaudhary/crypto-bot/pull/26) + [PR #32](https://github.com/vivekschaudhary/crypto-bot/pull/32); 2 of ~5 stories done; CB-2.3 story `ready` 2026-06-07; `/build CB-2.3` is the next workflow)
- **Open findings:** n/a (no `/scan` run yet)
- **Blocking advance:** no
- **Full report:** [`scan-report.md`](./scan-report.md) (will exist after the first `/scan CB-2` fires)

## Check-in log

_Populated automatically by `/measure` cron once the wrapper has accrued ≥ 100 real Coinbase requests (gated on CB-4's bot tick going live)._

## DRI Log

### Decisions

- [2026-06-06] [PM] **CB-2 scope = data layer only** — top-5 discovery algorithm AND selection UX both move to CB-3
  - **Rationale (required):** operator confirmed at promotion (`/create-brief CB-2` HITL question A). Cleanest seam: `lib/coinbase/` is purely the typed wrapper; CB-3 owns the strategy-authoring flow that consumes top-5 logic AND persists selection. Keeps CB-2 UI-free + fully testable as pure server code. The portfolio stub had ambiguity on this boundary (stub's "selectable set" phrase could read either way); now resolved.
  - **Area (required, tag):** product / scope
  - **Alternatives considered (required):** CB-2 ships discovery algorithm + minimal selection UI (rejected — adds UI surface to a data-layer bet, contradicts the "single source of truth for Coinbase reads" framing); CB-2 ships data + algorithm + UI (rejected — overscoped; conflates plumbing with product); leave open and let Engineer DRI Decision on first story (rejected — scope IS the question; deferring it makes the brief unfalsifiable)
  - **Reversibility:** easy — moving discovery into CB-3 is one function move + caller migration; no schema change

- [2026-06-06] [PM] **Top-5 basis = global Coinbase 24h volume** — NOT operator's personal trading volume
  - **Rationale (required):** operator confirmed at promotion (`/create-brief CB-2` HITL question B). Pulls from public market-stats endpoint; no auth required for the discovery itself. Simpler implementation in CB-3 (no need to scan operator's trade history). Trade-off acknowledged: introduces market-trending coins that may not match the operator's discipline-seeking persona — but the operator can override via the CB-3 selection step. Closes the open question logged in the portfolio DRI ("Top-5 traded crypto basis" — PM Issue at portfolio level).
  - **Area (required, tag):** product / data
  - **Alternatives considered (required):** personal Coinbase trading volume (rejected — operator preferred global signal; less personalized but requires zero auth for discovery); hybrid personal-with-global-fallback (rejected — branching logic without clear value at n=1); operator-manual-list (rejected — defeats the "discovery" framing)
  - **Reversibility:** medium — switching basis is a CB-3 implementation change but doesn't affect CB-2's surface

- [2026-06-06] [PM] **`LIVE_MODE` gate stays in CB-4, NOT inside `lib/coinbase/orders.ts`** — wrapper is policy-free
  - **Rationale (required):** the wrapper has one job (typed Coinbase access). Embedding `LIVE_MODE` reads inside `placeOrder()` would silently double-gate (CB-4 also checks; wrapper also checks) and create a confusing "where's the policy" question for future code reviewers. Single source of policy = consumer. Wrapper failure mode: a CB-2 bug that lets `placeOrder()` fire in dry-run is caught by CB-4's gate; a CB-4 bug that lets `placeOrder()` fire in dry-run is NOT caught by the wrapper — but that's CB-4's responsibility, named explicitly. Architectural invariant enforced via grep + ESLint rule + guardrail metric.
  - **Area (required, tag):** architecture / scope
  - **Alternatives considered (required):** double-gate (rejected — silent redundancy is the named anti-pattern); gate only in wrapper, no gate in CB-4 (rejected — CB-4 owns the bot's decision policy; gating elsewhere violates layering); env-var-injected `WRAPPER_ENFORCES_LIVE_MODE` flag (rejected — config knob for an architectural invariant is anti-pattern)
  - **Reversibility:** easy — adding the gate inside the wrapper later is a 3-line change if the operator wants belt-and-suspenders; documented escape hatch

- [2026-06-06] [PM] **`architecture_required: false`** — CB-2 inherits the foundation architecture; no per-bet architecture file needed
  - **Rationale (required):** same posture as CB-1. The foundation [architecture.md](../../foundation/architecture.md) already names Coinbase Advanced Trade as the exchange ([§ Stack — Coinbase as exchange](../../foundation/architecture.md#stack)) and the architecture-research file covers SDK comparison + rate-limit ceilings + failure modes. CB-2's only architectural choice (SDK pick) is already deferred to first-story Engineer DRI per [architecture.md DRI Issue #1](../../foundation/architecture.md#issues). No new fitness functions; no new ADRs.
  - **Area (required, tag):** process
  - **Alternatives considered (required):** require a CB-2 bet-architecture file (rejected — duplicates foundation arch's coverage; ceremony without function); defer the call to first story (rejected — `architecture_required` is a brief-frontmatter field that gates whether `/create-bet-architecture` fires; setting it false here is the honest call)
  - **Reversibility:** easy — if a story uncovers an architectural surprise, the brief can be amended

- [2026-06-06] [PM] **`duration_weeks: 1` and `confidence: medium`** at brief-approval — refined from the v6 stub (2 weeks, low)
  - **Rationale (required):** scope chopped from "data + algorithm + selection" (stub) to "data layer only" (this brief, per Decision #1 above). Workflow estimate model: brief-approval → small/medium/large → 1/2/4 weeks. CB-2 with this scope is "small" — wrapping a maintained SDK + Zod types + tests + Sentry breadcrumbs is genuinely 1 week of work, especially given [CB-1's actual velocity ≈ 0.7 days/story](../../foundation/plan.md#risks-to-plan). Confidence advances from `low` (stub) to `medium` (brief-approval) per the model's confidence-after-trigger column.
  - **Area (required, tag):** scheduling / estimation
  - **Alternatives considered (required):** keep 2 weeks (rejected — overstates scope after the data-layer-only chop); jump to 0.5 weeks (rejected — model is integer weeks; would author too aggressively from the stub); set confidence: high (rejected — model says brief-approval → medium; high is reserved for build-actuals trigger)
  - **Reversibility:** trivial — next `/plan` after CB-2 story.md files land will fire the "Stories created" trigger and recompute

- [2026-06-06] [PM] **`market.ts` wrapper method renamed `getProductStats(productId)` → `getProduct(productId)`** — surfaced during `/create-story CB-2.2` (the next slice)
  - **Rationale (required):** the original [In scope](#in-scope) bullet for `market.ts` listed three methods including `getProductStats(productId)`, modeled on what SDKs typically expose. But Coinbase Advanced Trade v3 does NOT have a separate stats endpoint — the 24h-volume + price stats are returned IN the single-product endpoint response (`GET /api/v3/brokerage/market/products/{product_id}`). With CB-2.1's no-SDK direct-fetch pattern in place, naming a wrapper method `getProductStats` when there's no corresponding endpoint would be misleading. Rename to `getProduct(productId)` — single-endpoint single-method — matches the actual API surface. The downstream consumer (CB-3 top-5 algorithm) reads the same response fields it would have read from `getProductStats`; functionally identical. The In scope bullet has been amended in place with this rename + a pointer back to this Decision, preserving the original wording for audit per Compass append-only convention.
  - **Area (required, tag):** product / api-surface
  - **Alternatives considered (required):** keep the `getProductStats` name as a thin wrapper around `getProduct` and return only the stats fields (rejected — adds an unnecessary intermediate method with no semantic value over picking response fields at the call site); ship both methods (`getProduct` AND `getProductStats`, with `getProductStats` returning a subset of `getProduct`'s response) (rejected — two methods for one endpoint, future-reader confusion); add a separate Researcher Open Question about whether Coinbase has a stats endpoint we missed (rejected — endpoint surface is documented; no separate stats endpoint exists)
  - **Reversibility:** easy at this story-creation moment (rename the method in CB-2.2 story.md AC 1 + brief In scope). Harder later if CB-3's call-site is already written against `getProduct` — would require coordinated rename across consumer + wrapper.
  - **Surfaced by:** Codex review of PR #31 round-1 — flagged the brief / story drift

- [2026-06-07] [PM] **`accounts.ts` `getAccountTradeHistory` parameter renames + new `getAccount(uuid)` method** — surfaced during `/create-story CB-2.3` (next slice; bundled with the CB-2.2 status-flip cascade)
  - **Rationale (required):** the original [In scope](#in-scope) bullet for `accounts.ts` listed `getAccountTradeHistory({assetId?, from?, to?})`. Three issues against Coinbase's actual API surface:
    1. **`assetId` → `productId`**: Coinbase Advanced Trade's `/api/v3/brokerage/orders/historical/fills` filters by `product_id` (the trading pair, e.g., `BTC-USD`), not by bare asset (`BTC`). A bare-asset filter would require post-fetch aggregation across all trading pairs an asset appears in — that's CB-5 dashboard's concern, not CB-2.3's. Renaming to `productId` matches the actual API and pushes asset-level aggregation to the consumer (CB-5) where it belongs.
    2. **`from`/`to` → `start`/`end`**: parameter-naming consistency with CB-2.2's `getProductCandles({start, end, ...})`. Same `Date` semantics. One naming convention across the wrapper.
    3. **Add `getAccount(accountUuid)`**: parallels CB-2.2's `getProduct(productId)` and Coinbase's `GET /accounts/{account_uuid}` endpoint. The original brief omitted it; consumers needing a single-account detail (e.g., CB-5 ledger drill-down) would otherwise pick the account out of `getAccountBalances()`'s list, which is inefficient.
  - **Area (required, tag):** product / api-surface
  - **Alternatives considered (required):** keep `assetId` and translate to `productId` internally by iterating all trading pairs for the asset (rejected — wrapper would silently fan out N requests; rate-limit exposure + unbounded latency); leave `from`/`to` for "operator-friendly" naming (rejected — inconsistency with CB-2.2's `getProductCandles` is worse for next-engineer than the rename one-time cost); omit `getAccount(uuid)` and let consumers filter `getAccountBalances()` client-side (rejected — wastes pagination loop bandwidth when consumer only needs one account); add a separate `getAccountTradeHistoryByAsset({asset, ...})` convenience method (rejected — two methods for one endpoint; future-reader confusion; CB-5 owns asset-level aggregation if it surfaces as a real need)
  - **Reversibility:** easy at this story-creation moment (rename in CB-2.3 story.md AC 1 + brief In scope). Harder later if CB-5's call-site is already written. CB-5 not yet drafted; safe to rename now.
  - **Lesson tag:** same pattern as the 2026-06-06 `getProductStats → getProduct` rename — original brief wording assumed an SDK-shaped surface that doesn't exist in Coinbase's actual API. For CB-2.4 (`orders.ts`), worth re-verifying `placeOrder({productId, side, amount, type})` parameter shape against the live `/orders` endpoint BEFORE drafting that story.
  - **Superseded in part 2026-06-07** by the `productId → productIds` Decision below (Coinbase's actual query param is plural `product_ids`, array). This Decision's wording is preserved per Compass append-only; the superseding entry below is authoritative for the wrapper signature.

- [2026-06-07] [PM] **`accounts.ts` `getAccountTradeHistory` parameter further corrected: `productId` (singular) → `productIds` (plural array)** — surfaced during Codex PR #34 round-1 BLOCKER review
  - **Rationale (required):** the 2026-06-07 PM DRI Decision above renamed `assetId` to `productId` (singular). Codex's PR #34 review caught that Coinbase's actual `/orders/historical/fills` query parameter is **`product_ids` (plural array)** per the [List Fills docs](https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/orders/list-fills) — the singular `product_id` form is undocumented and risks silently matching all fills (filter no-op) instead of failing loud. The CB-2.3 integration test as initially written wouldn't have caught this: if the operator has only BTC-USD fills, both correct and incorrect filter behavior look identical. Codex flagged the gap before merge.
  - **Wrapper signature change**: `getAccountTradeHistory({productIds?: string[], ...})` accepts an array. Wrapper serializes via `URLSearchParams.append("product_ids", id)` per element, producing `?product_ids=BTC-USD&product_ids=ETH-USD` (Coinbase's documented array encoding).
  - **Area (required, tag):** product / api-surface / contract-correctness
  - **Alternatives considered (required):** keep singular `productId` and trust Coinbase to "do the right thing" (rejected — undocumented; risks silent filter no-op which is the worst failure mode for financial data); accept both forms and serialize as plural internally (rejected — internal complexity to support a user-facing API shape the docs don't bless); deprecate the filter parameter entirely and let consumers post-filter the unfiltered list (rejected — wastes bandwidth + rate-limit; CB-5 would re-implement this for every consumer)
  - **Reversibility:** trivial at this moment (rename in CB-2.3 story.md AC 1 + accounts.ts + tests + brief In scope). Hardens once CB-5 consumes the API.
  - **Integration-test strengthening:** PR #34 round-1 fix also added a "sentinel-product" integration test — passes `productIds: ["ZZZ-USDT-SENTINEL-NO-TRADES"]` and asserts `fills.length === 0`. If the filter is silently ignored, this test fails (would return fills for OTHER products). Pattern to encode: when verifying a filter against a live API, use a sentinel value that should produce a deterministically empty result — anything non-empty signals the filter is being ignored.
  - **Lesson tag:** generalizes the prior "verify Coinbase docs before drafting" rule: **also verify the exact query parameter name + cardinality** (singular vs plural array). For CB-2.4's `placeOrder` and `cancelOrder`, every named parameter against `/orders` gets pinned against the live docs at first-commit time. Story-level guidance via the Engineer DRI Decision template.
  - **Supersedes:** the singular-`productId` portion of the 2026-06-07 PM DRI Decision above. That Decision's other two parts (start/end rename + new `getAccount(uuid)` method) remain in force.
  - **Surfaced by:** Codex code review of PR #34 round-1.
  - **Surfaced by:** Web research on the live Coinbase docs during `/create-story CB-2.3` drafting (proactive — applying CB-2.2 round-1 lesson up-front this time)

- [2026-06-06] [PM] **SDK pick may surface mid-implementation — picking too early makes a rewrite painful; picking too late blocks CB-3** (**RESOLVED 2026-06-06**)
  - **Likelihood (required):** medium (three viable TS SDKs; their endpoint-coverage maps may differ in surprising ways)
  - **Impact (required):** medium (mid-story SDK swap is a half-day of work + re-running tests against a new mock surface)
  - **Mitigation (required):** Engineer DRI Decision on CB-2.1 commits to ONE SDK with rationale; if a later story uncovers an endpoint the chosen SDK doesn't support, the swap is the Decision-supersession pattern (per Compass append-only DRI convention); architecture.md Issue #1 already names this as deferred-to-first-story
  - **Area (required, tag):** scheduling / technical
  - **Resolution (filled when closed):** 2026-06-06 — CB-2.1 [Engineer DRI Decision](stories/CB-2.1/story.md#decisions) selected **no SDK** (direct REST + JWT via `node:crypto`). Three SDK alternatives all rejected (tiagosiebler: vendor in auth path + EdDSA uncertain; coinbase-samples: stale; JoshJancula: CDP JWT unclear). Pre-mitigation rationale ("pick early, swap if needed") moot; replaced by the no-SDK direct pattern. **A new Risk took its place** (EdDSA brokerage compatibility), tracked at [CB-2.1 story DRI](stories/CB-2.1/story.md#risks-engineer-round-1-then-pm-pre-existing-for-audit); resolution deferred to CB-2.5 (trace.ts) when real-brokerage EdDSA integration test will resolve the ambiguity.

- [2026-06-06] [PM] **Coinbase changes a response shape mid-flight — wrapper's Zod schemas reject the new field; consumer surfaces opaque error**
  - **Likelihood (required):** low (Coinbase Advanced Trade is a versioned, documented API; breaking changes are rare and announced)
  - **Impact (required):** medium (consumer bets fail; success-rate metric drops; operator has to push a wrapper hotfix)
  - **Mitigation (required):** Zod schemas use `.passthrough()` on response objects (forward-compat with new fields); failures emit structured logs with the actual response payload so the diff is visible; integration test (gated on `RUN_INTEGRATION_TESTS`) runs weekly via cron after CB-2 ships to catch drift early
  - **Area (required, tag):** technical / vendor-risk

- [2026-06-06] [PM] **CDP JWT key compromise during the wrapper-build phase** (already an active foundation-level risk; called out here for completeness)
  - **Likelihood (required):** low (operator's CDP key is in Vercel encrypted env per [runbook step 6](../../ops/runbook.md); CB-2 never logs the raw key)
  - **Impact (required):** high (would force key rotation + invalidation of all in-flight wrapper requests)
  - **Mitigation (required):** wrapper's `trace.ts` redacts auth headers from all log lines; gitleaks + GitHub secret-scan inherited from CB-1.1's CI gates; CDP key has Trade-only scope (no Withdraw) per [product.md § Failure mode if auth is bypassed](../../foundation/product.md#failure-mode-if-auth-is-bypassed) so even worst-case compromise can't drain capital
  - **Area (required, tag):** security

- [2026-06-06] [PM] **Coinbase rate-limit headers may not be returned by the Advanced Trade `/api/v3/brokerage/*` endpoints** (Researcher open question; reframed against the no-SDK direct-fetch path shipped in CB-2.1)
  - **Likelihood (required):** low-to-medium (Coinbase's general docs surface `X-RateLimit-Remaining` semantics, but the brokerage-specific endpoints may or may not return the header per request — undocumented at the brokerage tier; the only way to confirm is to inspect real responses via the wrapper's `trace.ts` once CB-2.5 ships)
  - **Impact (required):** low (with no SDK in the path, our `lib/coinbase/client.ts` has full access to the raw `Response` headers — there's no abstraction layer hiding them. If Coinbase doesn't include `X-RateLimit-Remaining` on brokerage responses, we fall back to "react to 429s with exponential backoff" instead of proactive 25%-utilization warnings; no value loss, just less proactive instrumentation. The 10%-of-ceiling Performance-Efficiency fitness function ([architecture.md § Fitness Functions](../../foundation/architecture.md#fitness-functions)) still holds either way — well within free-tier budget.)
  - **Mitigation (required):** when CB-2.5 (trace.ts) ships, it logs raw response headers via Sentry breadcrumb on a sample of requests; if `X-RateLimit-Remaining` is absent from real brokerage responses, the 25%-utilization guardrail [brief frontmatter `guardrails[0]`](#) downgrades to "rely on Sentry alerts on 429s" via a Decision supersession at that story.
  - **Reframing note (2026-06-06):** original wording framed this risk against an SDK that might "abstract the headers away." Now that CB-2.1's no-SDK direct-fetch is the shipped pattern, the SDK-abstraction concern is moot — but the underlying brokerage-API question (does Coinbase even send the header on `/api/v3/brokerage/*`?) remains. Reframed accordingly. Researcher item 1 (rate-limit headers) under [§ Open questions](#open-questions-for-researcher) tracks the primary-source confirmation.
  - **Area (required, tag):** observability / technical

- [2026-06-06] [PM] **The `LIVE_MODE` gate in CB-4 (not the wrapper) means a CB-4 bug could fire a real-money order in dry-run**
  - **Likelihood (required):** low (CB-4 brief will require explicit `LIVE_MODE` test coverage; integration test in CB-4 will assert dry-run blocks the call)
  - **Impact (required):** high (real-money exfiltration — though bounded by Trade-only key scope and per-session caps per [product.md § Failure mode](../../foundation/product.md#failure-mode-if-auth-is-bypassed))
  - **Mitigation (required):** named architectural invariant in this brief (DRI Decision #3 above); CB-4's brief will inherit + reinforce; integration test asserting "wrapper called from dry-run code path → no Coinbase write" is a CB-4 acceptance criterion that closes the gap
  - **Area (required, tag):** security / scope-boundary

### Issues

- [2026-06-06] [PM] **Final SDK pick deferred to Engineer DRI on CB-2.1** — current lean is `tiagosiebler/coinbase-api` per [arch-research.md §1.3](../../foundation/architecture-research.md#1-prior-art) activity signal
  - **Severity (required, mandatory):** P3 (deferred-by-design; closes naturally on CB-2.1 ship)
  - **Owner (required, mandatory):** Engineer at first-story time
  - **Status:** **CLOSED 2026-06-06**
  - **Area (required, tag):** architectural / dependency
  - **Resolution (filled when closed):** 2026-06-06 — Engineer DRI Decision on CB-2.1 selected **no SDK** (direct REST + per-request JWT via `node:crypto`). All three SDK candidates explicitly rejected: `tiagosiebler/coinbase-api` (vendor in auth path + EdDSA support uncertain), `coinbase-samples/advanced-sdk-ts` (8+ months stale, no test suite), `JoshJancula/coinbase-advanced-node` (CDP JWT support not explicit). Closes [foundation architecture DRI Issue #1](../../foundation/architecture.md#issues). Full rationale + alternatives at [CB-2.1 story DRI](stories/CB-2.1/story.md#decisions). Shipped via [PR #26](https://github.com/vivekschaudhary/crypto-bot/pull/26).

- [2026-06-06] [PM] **Three Researcher Open Questions logged above (rate-limit headers; SDK comparison freshness; CDP JWT rotation behavior)** — Researcher fills before CB-2.1 starts (**PARTIALLY RESOLVED 2026-06-06**)
  - **Severity (required, mandatory):** P3 (informational; doesn't block brief approval)
  - **Owner (required, mandatory):** Researcher
  - **Status:** Item 2 (SDK comparison) **CLOSED 2026-06-06** by CB-2.1 Engineer DRI Decision (no SDK; comparison moot). Items 1 (rate-limit headers) + 3 (CDP JWT rotation behavior of the direct path) **REMAIN OPEN** — deferred to CB-2.5 (trace.ts + rate-limit observability) where they're directly load-bearing.
  - **Area (required, tag):** research / dependency
  - **Resolution (filled when closed):** Item 2 — see CB-2.1 Engineer DRI Decision above. Items 1 + 3 — to be filled when Researcher appends findings during CB-2.5 build (or creates `docs/bets/CB-2/research.md`).

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `docs/bets/CB-2/stories/CB-2.X/fixes/`._

---

_Approved by: vivek on 2026-06-06_

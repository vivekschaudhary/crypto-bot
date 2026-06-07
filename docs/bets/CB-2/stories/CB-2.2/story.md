---
id: CB-2.2
bet: CB-2
type: story
status: shipped
shipped: 2026-06-07
priority: P0
created: 2026-06-06
author: PM
design_link: n/a (no UI surface — pure library)
area_tags: [coinbase-integration, library, backend, market-data]
dependencies: [CB-2.1]
---

# CB-2.2 — `lib/coinbase/market.ts` — public market data wrappers

## Description

Ship the public market data layer of `lib/coinbase/`. Wraps Coinbase Advanced Trade's `/api/v3/brokerage/market/*` endpoints — all unauthenticated reads — with three typed methods consumed by CB-3 (top-5 algorithm) and CB-4 (signal computation):

- `getProducts()` — list all trading pairs Coinbase offers
- `getProduct(productId)` — single product details, including 24-hour volume + price stats
- `getProductCandles(productId, granularity, start, end)` — historical OHLCV candles

All three call `coinbase().publicRequest()` from [CB-2.1](../CB-2.1/story.md) — no JWT path exercised here. Response bodies validated via Zod at the wrapper boundary so consumers see typed objects, not `unknown`. Zod's `.passthrough()` keeps forward-compat with new Coinbase fields per the [CB-2 brief PM Risk #2](../../brief.md#risks) ("Coinbase changes a response shape mid-flight").

This story finishes the public-data slice of CB-2. CB-2.3 starts the auth'd-reads layer (accounts) and is the first story that exercises the JWT path against `/api/v3/brokerage/*` (where the [EdDSA brokerage caveat](../CB-2.1/story.md#risks-engineer-round-1-then-pm-pre-existing-for-audit) may bite).

## Acceptance Criteria

- [ ] **AC 1** — `lib/coinbase/market.ts` exports three typed wrapper functions, each `async` and each calling `coinbase().publicRequest<T>("GET", path)` from [CB-2.1](../../../../lib/coinbase/client.ts):

  ```ts
  export async function getProducts(): Promise<Product[]>
  export async function getProduct(productId: string): Promise<Product>
  export async function getProductCandles(args: {
    productId: string;
    granularity: Granularity;
    start: Date;
    end: Date;
  }): Promise<Candle[]>
  ```

  The `Granularity` type is a union of Coinbase's documented values (likely `"ONE_MINUTE" | "FIVE_MINUTE" | "FIFTEEN_MINUTE" | "ONE_HOUR" | "ONE_DAY"` etc. — Engineer pins the final set against Coinbase's docs at first commit). `start` and `end` are `Date` objects at the wrapper boundary; convert to Coinbase's expected format (Unix-seconds or ISO-8601) inside the wrapper.

- [ ] **AC 2** — `lib/coinbase/market-schemas.ts` exports Zod schemas at the wrapper boundary:
  - `ProductSchema` — Coinbase's product-detail shape (product_id, base/quote currencies, status, price, 24h-volume, etc.)
  - `CandleSchema` — single OHLCV row (start, low, high, open, close, volume)
  - Both schemas use `.passthrough()` at the OBJECT level so new Coinbase response fields don't trigger Zod validation failures — forward-compat per CB-2 brief PM Risk #2 ("Coinbase changes a response shape mid-flight; wrapper's Zod schemas reject the new field"). The brief explicitly mitigates this via `.passthrough()` on response objects.

- [ ] **AC 3** — pagination posture for `getProducts()`:
  - **If** Coinbase's `/products` endpoint paginates (likely — there are hundreds of trading pairs): the wrapper handles pagination internally and returns the full list. Engineer DRI Decision on first commit documents the pagination mechanism (cursor / offset / next-token) discovered against the real API and confirms whether Coinbase enforces pagination at all.
  - **If** the endpoint returns the full list in one response (unlikely but possible if Coinbase doesn't cap): pagination logic deferred; documented in DRI as "not needed at current product count."
  - Either way: the public surface stays `getProducts(): Promise<Product[]>` returning the full list. Callers don't see pagination.

- [ ] **AC 4** — Unit tests at `tests/lib/coinbase/market.test.ts`:
  - Mocked `fetch` responses via `vi.mock("@/lib/coinbase/client", ...)` OR direct `global.fetch` mock (whichever pattern reads cleanly given the layering)
  - Happy-path test per method (3 tests minimum): asserts the returned shape matches the Zod schema, asserts the correct URL was called, asserts `publicRequest` was used (not `request`)
  - Zod validation failure per method (3 tests minimum): when Coinbase returns an unexpected shape (e.g., wrong type for `price`), the wrapper throws a clear error (Zod-derived OR wrapped as `CoinbaseClientError` with `code: "validation-failed"` — Engineer DRI Decision at first commit)
  - Granularity / time-range conversion tests for `getProductCandles`: verifies `Date` → Coinbase format conversion is correct (Unix-seconds string OR ISO-8601 — depends on Coinbase's accepted format)
  - Pagination test for `getProducts()` (if paginated per AC 3): mock returns 2 pages; assert wrapper aggregates them; assert only `publicRequest` calls happen, no manual fetch
  - Total: ~10-15 new tests in this file

- [ ] **AC 5** — Integration test extension at `tests/lib/coinbase/client.integration.test.ts` (extend the existing CB-2.1 file OR add `tests/lib/coinbase/market.integration.test.ts` — Engineer DRI Decision):
  - Gated on `RUN_INTEGRATION_TESTS=1` per the established CB-2.1 pattern
  - Calls `getProduct("BTC-USD")` and asserts: 2xx response; non-empty product_id matching "BTC-USD"; 24h-volume field present and parses as a number
  - Calls `getProducts()` and asserts: returns >= 50 products (Coinbase Advanced Trade has hundreds of pairs as of 2026; 50 is a safe floor); BTC-USD appears in the list
  - Calls `getProductCandles({productId: "BTC-USD", granularity: "ONE_HOUR", start: 24h ago, end: now})` and asserts: returns >= 20 rows (24 hours at 1h granularity); each row has the OHLCV fields
  - Operator-runs locally before PR merges; CI does NOT run these (per CB-2.1 PM Risk #2 — CI lacks the operator's `.env.local` setup)

- [ ] **AC 6** — Architectural invariants from CB-2 brief hold (verified by existing tests; no new test files needed):
  - NO `LIVE_MODE` references in `lib/coinbase/*` — covered by [`tests/lib/coinbase/no-live-mode.test.ts`](../../../../tests/lib/coinbase/no-live-mode.test.ts) from CB-2.1
  - Bundle size of `lib/coinbase/` stays small — `market.ts` adds Zod schemas (~5-10 KB) but no SDK / no kitchen-sink deps; well under the 50 KB compiled budget from the brief

- [ ] **AC 7** — Standard gates: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all pass. Test suite grows by ~10-15 (currently 331; expected ~341-346 post-merge).

## Standard Experience Checklist

- [ ] **Navigation** — `n/a — no UI surface in this story; lib/coinbase/market.ts is server-only library code consumed by CB-3 (top-5 algorithm) and CB-4 (signal computation), not user-facing`
- [ ] **States** — `n/a — no rendered states; library functions either return a typed result or throw a CoinbaseClientError (per CB-2.1 AC 3) / Zod validation error (per AC 4 above)`
- [ ] **Feedback** — `n/a — no UI feedback; all wrapper errors flow up via CoinbaseClientError; structured-log breadcrumbs added in CB-2.5 (trace.ts), not this story`
- [ ] **Accessibility** — `n/a — no UI surface; no focus management; no keyboard/screen-reader concerns`
- [ ] **Edge cases** — `n/a at the library layer — network failures, slow responses, and unexpected response shapes all reflect as CoinbaseClientError; per-consumer edge-case handling lives in CB-3 (top-5) and CB-4 (signals) stories that consume the wrapper`
- [ ] **Cross-surface consistency** — `n/a — single surface (server-only library)`

All six categories explicitly marked `n/a` with reason per [CB-2.1's precedent](../CB-2.1/story.md#standard-experience-checklist) for pure-library stories. No empty cells. Standard Experience Checklist gate satisfied.

## Tech notes

### Brief + CB-2.1 references

- [CB-2 brief § In scope](../../brief.md#in-scope) — names `market.ts` with `getProducts`, `getProduct(productId)`, `getProductCandles`. The per-product method was renamed from `getProductStats` (original brief wording) to `getProduct` via a PM DRI Decision on 2026-06-06 to match Coinbase's actual API surface — Coinbase Advanced Trade v3 does NOT expose a separate stats endpoint; the 24h-volume + price stats are returned by the single-product endpoint. See [CB-2 brief PM DRI Decision: "`market.ts` wrapper method renamed `getProductStats(productId)` → `getProduct(productId)`"](../../brief.md#decisions) for the full rationale + alternatives rejected. CB-2.2's AC 1 below implements `getProduct(productId)` accordingly.
- [CB-2 brief PM Risk #2 (response shape drift)](../../brief.md#risks) — load-bearing for AC 2's `.passthrough()` Zod posture.
- [CB-2.1 story § DRI Decisions](../CB-2.1/story.md#decisions) — the no-SDK Engineer DRI Decision constrains CB-2.2 to direct `publicRequest()` calls; no SDK to wrap.
- [`lib/coinbase/client.ts`](../../../../lib/coinbase/client.ts) — `coinbase().publicRequest<T>(method, path)` is the single entry-point CB-2.2 calls. Returns parsed JSON typed as `T`; Zod validation happens in `market.ts` AFTER `publicRequest` returns.

### Endpoint reference (per Coinbase Advanced Trade v3 docs)

Engineer freshens these at build time; this is the planning-time lean:

| Method | Coinbase endpoint | Notes |
|---|---|---|
| `getProducts()` | `GET /api/v3/brokerage/market/products` | List all trading pairs; likely paginated (cursor-based) |
| `getProduct(id)` | `GET /api/v3/brokerage/market/products/{product_id}` | Single product; response includes 24h volume + price stats |
| `getProductCandles(args)` | `GET /api/v3/brokerage/market/products/{product_id}/candles` | OHLCV candles; granularity + start/end as query params |

The actual response shapes get pinned in `market-schemas.ts` at AC 2; this is a forward-looking sketch.

### Zod `.passthrough()` placement

Per CB-2 brief PM Risk #2 mitigation: `.passthrough()` on response object schemas. Apply at the TOP-LEVEL response schema, AND at nested object schemas where Coinbase might add fields. Examples:

```ts
const ProductSchema = z.object({
  product_id: z.string(),
  base_currency_id: z.string(),
  quote_currency_id: z.string(),
  price: z.string(),
  volume_24h: z.string(),
  // ... known fields
}).passthrough();  // forward-compat
```

Engineer makes the call on inner-object passthrough placement during implementation.

### What this story explicitly does NOT do

- `lib/coinbase/accounts.ts` (CB-2.3) — auth'd reads; first story to exercise JWT against `/api/v3/brokerage/*`
- `lib/coinbase/orders.ts` (CB-2.4) — auth'd writes; first story to exercise auth'd write semantics + LIVE_MODE-gate-in-consumer architectural invariant
- `lib/coinbase/trace.ts` (CB-2.5) — Sentry breadcrumbs + rate-limit-header awareness
- Rate-limit-header research (Researcher open question; closes naturally during CB-2.5 build)
- Top-5 discovery algorithm (CB-3) — `market.ts` provides the input; the ranking + selection logic is CB-3 territory
- Selection persistence (CB-3)

## PRs

- [PR #32](https://github.com/vivekschaudhary/crypto-bot/pull/32) — `feat(CB-2.2): lib/coinbase/market.ts — public market data wrappers`. Squash-merged 2026-06-07 (commit `c86991a`). 3 review rounds: round-1 BLOCKER on Coinbase contract drift (FOUR_HOUR granularity missing + max 300 should be 350 + `volume_24h` should be required); round-2 ISSUE on stale narrative comments still naming 300; round-3 clean. Ships `lib/coinbase/{market,market-schemas}.ts` + 15 unit tests + 3 gated integration tests. Live integration verified all 5 tests pass against real Coinbase public endpoints.

## Tests

- `tests/lib/coinbase/market.test.ts` — `regression: true, e2e: false`
- `tests/lib/coinbase/client.integration.test.ts` extended (or new `market.integration.test.ts`) — `regression: false, e2e: false` (operator-gated)

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `docs/bets/CB-2/stories/CB-2.2/fixes/`._

## DRI Log

### Decisions

_To be filled by Engineer at first PR commit. Required entries:_

1. **Pagination mechanism for `getProducts()`** (per AC 3) — discovered against the real Coinbase API; documented inline.
2. **Time-range format for `getProductCandles`** (per AC 1 + AC 4) — `Date` → Coinbase-expected format (Unix-seconds string OR ISO-8601). Pin against Coinbase docs.
3. **Granularity enum** (per AC 1) — exact set Coinbase supports for `getProductCandles`; pinned as TypeScript literal union.
4. **Zod validation failure error shape** (per AC 4) — Zod-derived error directly OR wrapped as `CoinbaseClientError({code: "validation-failed", ...})`. Either is defensible; pick one consistently across the wrapper.

### Risks

- [2026-06-06] [PM] **Coinbase response shape drift across the three endpoints during the build** — surface different from CB-2.1's testing (which only hit public market products endpoint smoke)
  - **Likelihood (required):** low (Coinbase Advanced Trade v3 is documented + versioned; breaking changes are announced)
  - **Impact (required):** low-to-medium (Zod schemas would need updates; integration tests catch this if the operator runs them; otherwise consumers in CB-3/CB-4 would see typed errors instead of mystery failures)
  - **Mitigation (required):** `.passthrough()` posture on Zod schemas (AC 2); integration test that hits the real endpoints (AC 5) before merge; per-PR Codex review catches structural regressions
  - **Area (required, tag):** technical / vendor-risk

- [2026-06-06] [PM] **Pagination might mask correctness bugs** — if `getProducts()` paginates but the wrapper has an off-by-one or doesn't iterate to completion, CB-3's top-5 algorithm later silently ranks on an incomplete set
  - **Likelihood (required):** low (Engineer DRI Decision on AC 3 explicitly addresses pagination; integration test asserts >= 50 products which would fail if pagination cuts off)
  - **Impact (required):** medium (would surface as CB-3 picking wrong top-5; bot trades on suboptimal asset set)
  - **Mitigation (required):** integration test in AC 5 asserts the returned product count is reasonable; pagination logic gets explicit unit-test coverage per AC 4
  - **Area (required, tag):** technical / correctness

- [2026-06-06] [PM] **CB-2.1 SDK / pagination assumptions in the original CB-2.1 ACs may carry stale phrasing forward into this story** — wrap-up housekeeping
  - **Likelihood (required):** low (CB-2.1 ACs are immutable per Compass append-only; this story carries fresh language)
  - **Impact (required):** none in code; minor reader-confusion risk
  - **Mitigation (required):** this story's Tech notes explicitly call out the no-SDK posture inherited from CB-2.1's Engineer DRI Decision
  - **Area (required, tag):** documentation

### Issues

_None at story-creation time. Engineer + Researcher open questions tracked at CB-2 brief level (rate-limit headers + CDP JWT rotation deferred to CB-2.5)._

---

_Story closed: 2026-06-07 (via PR #32 squash merge commit `c86991a`), brief link: docs/bets/CB-2/brief.md_

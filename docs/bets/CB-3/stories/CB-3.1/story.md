---
id: CB-3.1
bet: CB-3
type: story
status: ready
priority: P0
created: 2026-06-08
author: PM
design_link: n/a — pure library code; no UI surface
area_tags: [strategy, lib, crypto-coinbase, adapter, integration, pluggability]
dependencies:
  - CB-3 brief approved 2026-06-08
  - CB-3 architecture artifact approved 2026-06-08
  - CB-3.0 shipped 2026-06-08 (provides AssetAdapter interface + Asset type)
  - CB-2 shipped 2026-06-08 (provides typed Coinbase wrapper at lib/coinbase/market)
estimate:
  effort: small
  confidence: high
e2e: false
---

# CB-3.1 — `lib/strategy-coinbase/` adapter (the seam where crypto-coinbase coupling lives)

## Description

Ship the crypto-coinbase implementation of the `AssetAdapter` interface that CB-3.0 defined. Per [bet architecture Decision #3](../../architecture.md#3-libstrategy-coinbase-is-the-crypto-coinbase-adapter): `lib/strategy-coinbase/adapter.ts` is the SINGLE file in CB-3 where crypto-coinbase coupling lives. Strategy-core stays Coinbase-free (per CB-3.0's architectural invariant test); this adapter imports from `lib/coinbase/market` (CB-2's typed wrapper) and translates between Coinbase's product shape and strategy-core's abstract `Asset` shape.

This is the first REAL implementation of the `AssetAdapter` seam — CB-3.0's mock equity adapter test proved the abstraction shape works for a non-Coinbase class; CB-3.1 proves the same abstraction works for crypto-coinbase against live Coinbase data. After this story ships:

- CB-3.2 (DB schema) can use the adapter's output shape as the data model contract
- CB-3.3 (form UI) will import the adapter from this module + the AssetAdapter interface from CB-3.0 and wire them at the route layer
- Researcher Open Question #1 (top-5 stability cadence) gets its FIRST empirical observation from the integration test in this story

Server-only. No DB writes. No UI. No live order placement. `e2e: false`.

## Acceptance Criteria

- [ ] **AC 1** — `lib/strategy-coinbase/adapter.ts` exports `makeCoinbaseAdapter()` factory that returns an `AssetAdapter` (the interface from `@/lib/strategy-core/adapter`) with `assetClass: "crypto-coinbase"`. Stateless adapter — `makeCoinbaseAdapter()` returns a new instance per call with no internal mutable state.
- [ ] **AC 2** — `getCandidateAssets()` calls `getProducts()` from `@/lib/coinbase/market`; **filters** to products satisfying BOTH `quote_currency_id === "USD"` AND `product_type === "SPOT"`. Returns `Asset[]` where each asset is `{assetClass: "crypto-coinbase", identifier: product.product_id}`. Products missing either filter field (per CB-2's `.optional()` schema) are excluded.
- [ ] **AC 3** — `rankByVolume(assets)` sorts the given assets by Coinbase's **`approximate_quote_24h_volume`** (DOLLAR volume; descending). Implementation: calls `getProducts()` to build a `product_id → dollar-volume` lookup map; for each asset, looks up its identifier's volume. **The field is a string per Coinbase** — the adapter must `parseFloat` defensively; non-parseable values (`NaN`, missing entry, empty string, missing field) sort last (treated as volume 0). Returns a NEW sorted array (input not mutated). **Field choice rationale (amended during /build CB-3.1):** raw `volume_24h` is base-currency TOKEN COUNT, which biases ranking toward cheap-token meme coins (PEPE-USD has ~10^11 tokens traded but ~$80M dollar volume; BTC-USD has ~10^4 tokens but ~$685M). `approximate_quote_24h_volume` is Coinbase's pre-computed base × price, which captures operator-intended dollar-liquidity ranking. See [architecture Decision #3 amendments 2026-06-08](../../architecture.md#3-libstrategy-coinbase-is-the-crypto-coinbase-adapter).
- [ ] **AC 4** — `getAssetIdentifier(asset)` returns `asset.identifier` verbatim. The adapter does NO transformation here — the Coinbase `product_id` IS the canonical identifier shape for the crypto-coinbase asset class.
- [ ] **AC 5** — Unit tests at `tests/lib/strategy-coinbase/adapter.test.ts` (~8 tests) mock CB-2's `lib/coinbase/market` via `vi.mock("@/lib/coinbase/market")`. Coverage:
  - Filter behavior: USD-quoted + spot products included; non-USD excluded; non-SPOT excluded; missing fields excluded
  - Ranking behavior: descending volume ordering; ties stable; missing/malformed volume sorts last
  - Identifier behavior: returns `product_id` verbatim
  - Empty-result edge case: zero products matching filter → empty array (not error)
  - Stateless guarantee: two calls to `makeCoinbaseAdapter()` return independent instances
- [ ] **AC 6** — Integration test at `tests/lib/strategy-coinbase/adapter.integration.test.ts` (~3 live tests) double-gated (`RUN_INTEGRATION_TESTS=1` + CDP creds via `COINBASE_API_KEY_NAME` + `COINBASE_API_PRIVATE_KEY` — though `getProducts` is the public path, gate still applies for consistency with CB-2.5's pattern). Tests:
  - `getCandidateAssets()` returns ≥ 1 USD-quoted spot product against live Coinbase
  - `rankByVolume()` returns assets in descending order; top-5 has 5 items
  - **Top-5 anchor test**: assert BOTH `BTC-USD` AND `ETH-USD` are in the top-5 (per PM Decision strengthened at `/build`; the two-anchor contract is more reliable than a single BTC anchor given the meme-coin trap discovery — see the BTC-USD + ETH-USD PM Decision below). The other 3 slots may rotate (live observation 2026-06-08: ZEC/XRP/SOL). Avoids brittle exact-order assertions.
  - Each test **logs the observation** (via `originalLog` pattern from CB-2.5's trace integration test). This is the load-bearing closure data feed for Researcher Open Question #1.
- [ ] **AC 7** — Architectural invariant boundaries:
  - `lib/strategy-coinbase/` IS allowed to import from `@/lib/coinbase/*` (this IS the seam; the architectural decision)
  - `lib/strategy-coinbase/` is NOT allowed to import `@/lib/env/*` or `@/lib/db/*` (inherits CB-3-core's policy-free posture; the LIVE_MODE gate lives at CB-4's order-placement layer, NOT in strategy data layers)
  - CB-3.0's strategy-core no-coupling test still passes (strategy-core boundary unchanged — strategy-coinbase is a SEPARATE module)
  - **Sibling invariant test** at `tests/lib/strategy-coinbase/no-live-mode.test.ts` mirrors CB-3.0's pattern for the strategy-coinbase scope
- [ ] **AC 8** — Gates: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all pass. Test count goes ~448 → ~458 (+8-10). Bundle `lib/strategy-coinbase/` source size under 20K.

## Standard Experience Checklist

Pure server-only library; no UI. 5/6 categories `n/a`.

- [ ] **Navigation** — `n/a — no UI surface in this story; lib/strategy-coinbase/adapter.ts is server-only library code consumed by CB-3.3 form UI in a later story.`
- [ ] **States** — `n/a — adapter methods return Promises that resolve with Asset arrays or reject with errors from the underlying CB-2 wrapper. No UI loading/empty/error states ship in this story; those are CB-3.3 concerns.`
- [ ] **Feedback** — `n/a — no UI feedback surface; the adapter propagates errors from lib/coinbase/* (CoinbaseClientError) as-is for consumers to handle. CB-3.3 form UI will translate these for inline display.`
- [ ] **Accessibility** — `n/a — no rendered UI in this story; accessibility surfaces at CB-3.3 form UI (Playwright e2e + standard a11y attrs).`
- [ ] **Edge cases** — `covered by AC 5 — empty-result + malformed-volume + missing-filter-field edge cases tested. Offline / slow-network / permissions-denied bubble up from CB-2's wrapper, where they're already tested in CB-2.5's trace + 4xx integration tests.`
- [ ] **Cross-surface consistency** — `covered by AC 7 — architectural invariant proves this adapter (the FIRST real AssetAdapter implementation) holds the same shape that CB-3.0's mock equity adapter proved for "equity-mock" asset class. Cross-asset-class portability is the load-bearing dimension here, not multi-target UI.`

## Tech notes

The adapter consumes [CB-3.0's `AssetAdapter` interface](../CB-3.0/story.md) + [CB-2's `getProducts` from `lib/coinbase/market`](../../../CB-2/stories/CB-2.2/story.md). Per [bet architecture Decision #3](../../architecture.md): single file; the only place crypto-coinbase coupling lives.

Engineer DRI Decisions called out (Engineer commits at first build commit):

1. **Filter shape — `quote_currency_id === "USD"` AND `product_type === "SPOT"`.** Operator's market is US-listed USD-quoted spot per [product.md](../../../../foundation/product.md). Alternative: include USDC-quoted (rejected — separate Decision; not in CB-3 scope; can add later with no schema migration since USDC-quoted products share the same Asset shape). Engineer commits this as Decision #1.

2. **Ranking field = `approximate_quote_24h_volume` (DOLLAR volume); `parseFloat` defensively; non-parseable / missing → 0 → sort last.** Discovered empirically during `/build CB-3.1`: Coinbase's `volume_24h` is base-currency TOKEN COUNT (PEPE = 10^11 tokens but $80M; BTC = 10^4 tokens but $685M). Operator-intended "currently liquid" requires dollar volume; Coinbase pre-computes this as `approximate_quote_24h_volume` (base × price for trailing 24h; returned as string). Coinbase returns the field as a string per CB-2.2's extended schema (`market-schemas.ts:84`). Real-world cases the adapter must handle: legitimate numeric strings ("685724759.73"), missing entries (product not in the lookup map), empty strings (`""`), NaN-producing inputs ("not a number"), and ENTIRELY MISSING field (CB-2.2's schema marks it `.optional()` — defense-in-depth in case Coinbase ever drops it). All non-parseable / missing → 0 → sort last. Engineer commits this as Decision #2; unit test covers each case.

3. **Stateless adapter — both methods call `getProducts()` independently.** Caching deferred. `getProducts()` returns hundreds of products in one call; ~2× the same call across `getCandidateAssets` + `rankByVolume` is cheap. If perf becomes a real concern (e.g., CB-3.3 dashboard renders every second), add caching at the adapter layer behind an opt-in option. Engineer commits this as Decision #3.

4. **`getProducts()` single-call vs `getProduct(id)` per asset for ranking.** `getProducts()` returns the full product list with `approximate_quote_24h_volume` already attached to each product (per CB-2.2's schema as extended 2026-06-08). Calling `getProduct(id)` for each of ~hundreds of products would burn rate-limit budget for identical data. The `getProduct` from CB-2 stays available for downstream consumers that need single-product detail (CB-3.3 form UI might use it for per-asset preview). Engineer commits this as Decision #4.

5. **Integration test format — mirror CB-2.5's trace integration test pattern.** Double-gated; logs the observation via `originalLog` (passes through console.log so the operator sees the diagnostic data while the spy can still intercept assertion data). The log line IS the Researcher Open Question #1 closure data feed — operator can grep runtime logs for top-5 evolution over time once CB-3.3 ships and the dashboard exercises the adapter regularly. Engineer commits this as Decision #5.

6. **No `LIVE_MODE` read in strategy-coinbase.** Inherits CB-3-core's policy-free posture. The adapter calls CB-2's wrapper which is itself `LIVE_MODE`-free per CB-2 brief PM Decision #3. Engineer adds sibling invariant test at `tests/lib/strategy-coinbase/no-live-mode.test.ts` mirroring CB-3.0's pattern. Engineer commits this as Decision #6.

### What this story does NOT include

- `strategies` DB schema + migration → CB-3.2
- Form UI + save action + first Playwright e2e → CB-3.3
- `bot_sessions.active_strategy_id` activation wiring → CB-3.4
- Multi-quote-currency support (USDC-quoted, EUR-quoted) → revisit post-MVP per [PM DRI Decision #6 in brief](../../brief.md)
- Caching layer for `getProducts()` → defer until perf surfaces
- The equity adapter (the operator's second app builds its own `lib/strategy-alpaca/` or similar)

### Why this story ships AFTER CB-3.0 but BEFORE CB-3.2/.3/.4

CB-3.0 ships the abstraction (interface + types). CB-3.1 ships the FIRST real implementation against it. The order means:
- CB-3.2 can reference the adapter's output shape for the DB schema design (Asset shape becomes the jsonb contract)
- CB-3.3 can import the adapter directly + wire it into the form
- Reversing the order would force CB-3.2/.3 to assume what the adapter returns; getting it wrong cascades

This is the same shape as CB-2.1 → CB-2.2/.3/.4/.5: foundation primitive first, downstream concretes against it.

## DRI Log

### Decisions

- [2026-06-08] [PM] **CB-3.1 ships the FIRST real `AssetAdapter` implementation; the integration test against live Coinbase is the LOAD-BEARING proof that the abstraction works for real data (not just CB-3.0's mock)**
  - **Rationale (required):** CB-3.0's mock equity adapter test proved the abstraction shape is honest for a non-Coinbase class with fixture data. CB-3.1 proves the same abstraction works against real Coinbase responses — which is the only thing that matters for crypto-app's MVP. Without this confirmation, CB-3.2/.3/.4 would be building against an unverified contract.
  - **Area (required, tag):** architecture / extraction-readiness / real-data-validation
  - **Alternatives considered (required):** ship `lib/strategy-coinbase/` adapter WITHOUT integration test, defer real-data verification to CB-3.3 (rejected — Researcher #1 explicitly requires empirical observation; CB-3.3 form UI shouldn't be debugging adapter contract issues); ship mock-only test against fixture Coinbase responses (rejected — fixtures rot; live integration is the only honest signal)
  - **Reversibility:** trivial — remove integration test if Coinbase rate-limit becomes a concern; unit tests still validate adapter shape

- [2026-06-08] [PM] **Top-5 anchor test asserts BTC-USD + ETH-USD presence (UPDATED at /build); AVOIDS brittle exact-order assertions**
  - **Rationale (required):** Top-5 order shifts run-to-run as Coinbase volume fluctuates intraday. Asserting exact order would fail randomly even when the adapter is correct. Asserting STRUCTURE (5 items, valid Asset shape) + TWO canonical anchors ("BTC-USD AND ETH-USD present in top-5") gives reliable signal without false negatives. BTC + ETH together are the only cryptos where "in top-5 by dollar volume" is essentially always true on Coinbase. The other 3 slots may rotate (live observation 2026-06-08: ZEC/XRP/SOL).
  - **Area (required, tag):** test-discipline / integration-test-stability
  - **Alternatives considered (required):** single BTC anchor (rejected at /build — too narrow given the discovery that the original `volume_24h` ranking biased toward meme coins; two anchors strengthens the contract); assert specific top-5 set (rejected — would fail on any market event); assert top-3 instead of top-5 (rejected — narrower window; same brittleness class); assert top-5 LENGTH only (rejected — would pass even if the adapter returned random products in wrong order)
  - **Reversibility:** trivial — adjust anchor if BTC or ETH ever drops out of top-5 (vanishingly unlikely in MVP timeframe)

- [2026-06-08] [PM] **Empirical-discovery amendment during `/build CB-3.1`: ranking field switched from `volume_24h` to `approximate_quote_24h_volume` (dollar volume)**
  - **Rationale (required):** Build-time integration test against real Coinbase exposed that `volume_24h` is base-currency token count, not dollar value. Live data: PEPE-USD ranks #1 by `volume_24h` (10^11+ tokens traded) but ~$80M dollar volume; BTC-USD ranks at position 109 by `volume_24h` but ~$685M dollar volume — by an order of magnitude the most-liquid USD pair on Coinbase. Operator's intent (per [product.md](../../../../foundation/product.md): "review coinbase data to highlight the top 5") is dollar-volume liquidity. Coinbase pre-computes this as `approximate_quote_24h_volume` (base × price for trailing 24h). Switched the field in the build PR; concurrent amendments to CB-3 brief + architecture + this story + CB-2.2's product schema (`market-schemas.ts:84`) keep the cross-artifact contract consistent.
  - **Area (required, tag):** empirical-discovery / contract-correction / cross-artifact-sweep
  - **Alternatives considered (required):** compute dollar volume client-side as `volume_24h × price` (rejected — Coinbase's pre-computed value handles edge cases like mid-day price changes, avoids parseFloat-then-multiply error propagation, and is single-source-of-truth); keep `volume_24h` and document the meme-coin bias (rejected — defeats the operator's clear intent; the "top 5 by liquidity" framing across all artifacts means dollar volume, not token count); use a different field if Coinbase has one (e.g., `volume_percentage_change_24h` — rejected; that's a change metric not a magnitude)
  - **Reversibility:** moderate — switching back to `volume_24h` would require concurrent amendments to brief + architecture + story + schema (same 4-artifact sweep this Decision created). Lesson: when a field name implies a quantity, verify the unit empirically BEFORE locking it across artifacts. PR #46's round-2 BLOCKER taught this pattern; CB-3.1's `/build` confirmed it.
  - **Surfaced by:** CB-3.1 `/build` integration test 2026-06-08 (FAIL on first run — BTC-USD missing from top-5; PEPE/SHIB ranked highest). Fix-forward in the same build PR.

### Risks

- [2026-06-08] [PM] **`approximate_quote_24h_volume` precision edge cases — string may have unexpected formats or be missing entirely**
  - **Likelihood (required):** medium (Coinbase API hasn't documented all the shapes; we know it's a string but not the format guarantees)
  - **Impact (required):** low (malformed values fall back to volume 0 → sort last; the rest of the ranking still works)
  - **Mitigation (required):** Engineer DRI Decision #2 specifies `parseFloat` + 0-fallback; AC 5 explicitly requires a unit test for malformed-volume edge case. CB-2.5's integration test already showed Coinbase returns plain decimal strings ("12345.67") — but defense-in-depth.
  - **Area (required, tag):** data-precision / defensive-parsing

- [2026-06-08] [PM] **Live-API integration test may surface Coinbase contract drift the adapter doesn't yet handle**
  - **Likelihood (required):** low (CB-2.2's schema uses `.passthrough()` so new fields don't break parsing; the only failure mode is if `approximate_quote_24h_volume` / `quote_currency_id` / `product_type` shape changes incompatibly)
  - **Impact (required):** low-to-medium (test failure surfaces Coinbase API change immediately; not a silent production issue)
  - **Mitigation (required):** AC 6's integration test fails fast on contract drift. CB-2's `.passthrough()` Zod posture catches non-removed-field drift. If a removal happens, the unit test for that field's behavior also fails. Detection layer is solid.
  - **Area (required, tag):** external-api-contract

### Issues

_None at story creation. Engineer adds as discovered during /build._

## Tests

_Engineer writes unit tests + integration tests co-located with code:_
- _Unit: `tests/lib/strategy-coinbase/adapter.test.ts` (~8 tests; mock CB-2's market wrapper)_
- _Integration: `tests/lib/strategy-coinbase/adapter.integration.test.ts` (~3 live tests; double-gated; seeds Researcher #1)_
- _Invariant: `tests/lib/strategy-coinbase/no-live-mode.test.ts` (~30 lines; sibling of CB-3.0's pattern)_

_Total: ~10 new tests. Suite goes ~448 → ~458._

## PRs

_Auto-populated as PRs open._

---

_Story closed: <pending>, brief link: docs/bets/CB-3/brief.md, architecture link: docs/bets/CB-3/architecture.md_

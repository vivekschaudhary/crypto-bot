---
id: CB-2.4
bet: CB-2
type: story
status: ready
priority: P0
created: 2026-06-08
author: PM
design_link: n/a (no UI surface — pure library)
area_tags: [coinbase-integration, library, backend, authenticated-writes, real-money]
dependencies: [CB-2.1, CB-2.2, CB-2.3]
---

# CB-2.4 — `lib/coinbase/orders.ts` — authenticated WRITES (placeOrder + cancelOrders)

## Description

Ship the authenticated-writes layer of `lib/coinbase/` — the **first wrapper that mutates real money state on Coinbase**. Two typed wrappers consuming `coinbase().request()` (auth'd JWT path; CB-2.3 proved EdDSA works against `/api/v3/brokerage/*`):

- `placeOrder(args)` — submits a new order via POST `/api/v3/brokerage/orders`
- `cancelOrders(args)` — cancels one or more open orders via POST `/api/v3/brokerage/orders/batch_cancel`

This story is THE load-bearing place for **the CB-2 architectural invariant**: the wrapper is **LIVE_MODE-free**. CB-4 (bot runtime, separate bet) owns the dry-run/live gate. `lib/coinbase/orders.ts` will call the live Coinbase orders endpoint every time it's invoked — there is NO safety check inside this wrapper. That's by design: the wrapper is plumbing; the policy (when to actually fire a real-money order) lives in CB-4. Test for this invariant is in AC 6.

Codex code review + **security review** both engage on this PR (touches real-money write path).

## Acceptance Criteria

- [ ] **AC 1** — `lib/coinbase/orders.ts` exports two typed wrapper functions that translate from the wrapper's idiomatic surface to Coinbase's actual API shapes:

  ```ts
  // Discriminated union mirroring Coinbase's order_configuration variants.
  // Engineer DRI Decision at first commit on which variants to ship in CB-2.4 vs defer.
  export type OrderConfiguration =
    | { market_market_ioc: { quote_size?: string; base_size?: string; rfq_disabled?: boolean } }
    | { limit_limit_gtc: { base_size: string; limit_price: string; post_only?: boolean; rfq_disabled?: boolean } }
    // Engineer adds more if CB-4 needs them; otherwise deferred to future story.

  export async function placeOrder(args: {
    productId: string;                    // e.g., "BTC-USD"
    side: "BUY" | "SELL";
    orderConfiguration: OrderConfiguration;
    clientOrderId?: string;               // idempotency key — wrapper auto-generates UUID v4 if absent
  }): Promise<OrderResponse>

  export async function cancelOrders(args: {
    orderIds: string[];                   // 1+ order IDs to cancel
  }): Promise<CancelOrdersResponse>
  ```

  The wrapper translates `args` to Coinbase's actual POST body:
  - For `placeOrder`: `{client_order_id, product_id, side, order_configuration}` — `client_order_id` auto-generated via `crypto.randomUUID()` if `clientOrderId` is absent (idempotency; CB-4's retry-after-network-failure path can pass an explicit ID to dedup).
  - For `cancelOrders`: `{order_ids: orderIds}` — Coinbase only has `batch_cancel` (no singular cancel endpoint). The plural-array surface matches the API directly and naturally supports multi-cancel for CB-5 dashboard if it surfaces.

  **Naming note:** the [CB-2 brief In-scope wording](../../brief.md#in-scope) originally said `placeOrder({productId, side, amount, type})` and `cancelOrder(orderId)`. Three changes per PM DRI Decision below:
  1. `placeOrder` `{amount, type}` → `{orderConfiguration: OrderConfiguration}` — matches Coinbase's discriminated-union body shape; consumer is more explicit about quote-size vs base-size and order type.
  2. `placeOrder` gains `clientOrderId?: string` — idempotency key required by Coinbase; auto-generated if absent.
  3. `cancelOrder(orderId)` → `cancelOrders({orderIds: string[]})` — matches Coinbase's `batch_cancel` endpoint; singular surface would have been a wrapper-internal complication for no semantic gain.

- [ ] **AC 2** — `lib/coinbase/order-schemas.ts` exports Zod schemas at the wrapper boundary with `.passthrough()` for forward-compat per [CB-2 brief PM Risk #2](../../brief.md#risks):
  - `OrderConfigurationSchema` — Zod discriminated union matching `OrderConfiguration` from AC 1
  - `OrderRequestSchema` — request body shape (`client_order_id`, `product_id`, `side`, `order_configuration`) for unit-test verification (not consumer-facing)
  - `OrderResponseSchema` — Coinbase's create-order response shape per the [Create Order docs](https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/orders/create-order): top-level `success: boolean` discriminator, with `success_response` (nested object containing `order_id` + `product_id` + `side` + `client_order_id`) when `success=true` AND `error_response` (nested object containing `error` + `message` + `error_details` + `preview_failure_reason`) when `success=false`. Required fields per consumer load-bearing: `success` (top-level boolean) + the appropriate nested response based on success state. CB-4 reads `success_response.order_id` to track placement; CB-5 reads `success_response` fields for ledger ordering. Loose-optional `.passthrough()` for all other fields per CB-2 brief PM Risk #2. Engineer verifies the exact nested-field set against the live API on the first integration test.
  - `CancelOrdersResponseSchema` — `{results: Array<{success: boolean, failure_reason?: string, order_id: string}>}` envelope per [Cancel Orders docs](https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/orders/cancel-order)
  - **Required-field discipline**: per the lesson from [CB-2.2 round-1 BLOCKER](https://github.com/vivekschaudhary/crypto-bot/pull/32), required fields are what downstream consumers actually depend on; verify against live Coinbase responses at first integration test.

- [ ] **AC 3** — `client_order_id` idempotency strategy (Engineer DRI Decision at first commit):
  - When `clientOrderId` is provided by caller → pass through verbatim
  - When absent → wrapper auto-generates via `crypto.randomUUID()` from `node:crypto` (no new dependency; matches CB-2.1's no-SDK posture)
  - The chosen ID surfaces on the returned `OrderResponse` for caller to correlate (Coinbase echoes it back)
  - Wrapper does NOT persist client_order_id locally — that's CB-4's concern (DB write of order intent → wrapper call → DB update with returned order_id)

- [ ] **AC 4** — Unit tests at `tests/lib/coinbase/orders.test.ts`:
  - Mock `coinbase().request` via `vi.mock("@/lib/coinbase/client", ...)` (mirrors [CB-2.3's pattern](../../../../tests/lib/coinbase/accounts.test.ts))
  - **`placeOrder` happy path × 4** — one per supported `order_configuration` variant (at minimum market+limit; Engineer adds stop-limit / market-buy-by-quote-size if CB-4 needs them). Each asserts:
    - URL: `/api/v3/brokerage/orders`, method: POST
    - Body shape matches Coinbase's documented contract (client_order_id, product_id, side, order_configuration)
    - When `clientOrderId` arg is absent: body has a UUID v4 in `client_order_id` (regex match)
    - When `clientOrderId` arg is provided: body uses that value verbatim
  - **`placeOrder` invalid-argument guards × 3** — empty `productId`, neither `quote_size` nor `base_size` set in `market_market_ioc`, etc.
  - **`cancelOrders` happy path × 2** — single-order cancel + multi-order cancel
  - **`cancelOrders` invalid-argument guards × 2** — empty `orderIds` array, empty-string elements
  - **Zod validation failures per method × 2** — placeOrder + cancelOrders responses wrapping unexpected shapes → `CoinbaseClientError({code: "validation-failed"})`
  - **Sensitive-data anti-echo × 1** — when `request` throws with a body containing order details, the wrapped error message does NOT echo balance/price values
  - Total: ~14-16 new tests in this file

- [ ] **AC 5** — Integration tests at `tests/lib/coinbase/orders.integration.test.ts` (NEW file):
  - Gated on **BOTH** `RUN_INTEGRATION_TESTS=1` **AND** CDP credentials present (same gating as CB-2.3)
  - **PLUS**: gated on a new opt-in flag `RUN_REAL_ORDER_TESTS=1` — extra barrier because these tests place REAL orders against the operator's Coinbase account. Default skip; operator opts in only when they're ready to spend a few cents in commission for verification.
  - **Strategy for write verification — Engineer DRI Decision at first commit. The integration test MUST exercise the real `POST /orders` and `POST /orders/batch_cancel` paths (the wrapper methods CB-2.4 is shipping). Verifying via a different endpoint like `POST /orders/preview` is NOT acceptable — the story closes only when the actual write paths have been mechanically verified end-to-end against live Coinbase, OR when the test is explicitly skipped with a documented Engineer DRI Risk that escalates the verification gap to a CB-2.5 follow-up:**
    - **Option A — limit-far-from-market with `post_only=true` (recommended)**: places a limit order far from market price (e.g., BUY BTC at $1) that cannot fill, then cancels it via `cancelOrders`. Pros: zero commission cost; verifies place + cancel symmetrically via the actual `/orders` + `/orders/batch_cancel` endpoints. Cons: relies on Coinbase accepting the far-from-market order — if rejected (4xx), the test fails loud and Engineer escalates per the fallback below.
    - **Option B — tiny market order**: places a $1 market buy at current price, lets it fill, then optionally sells back to neutralize the position. Pros: tests the actual happy-path through `POST /orders`. Cons: commission cost (~$0.05 + sell-side); irreversible asset acquisition; requires explicit operator opt-in beyond `RUN_REAL_ORDER_TESTS=1` (e.g., a per-run confirmation).
    - **Fallback if Options A + B both fail at integration time** (e.g., Coinbase rejects far-from-market AND operator declines real-money flow): SKIP the integration test entirely with a `console.warn` + an Engineer DRI Risk added to this story documenting the verification gap. CB-2.5 (`trace.ts`) integration build must close that gap by exercising the write path via real orders the operator's CB-4 has placed. **Preview Order (`POST /orders/preview`) is NOT an acceptable substitute** — it's a different endpoint and does not exercise `POST /orders` or `POST /orders/batch_cancel`, which is what CB-2.4 is mechanically defining.
  - Tests gated under `describe.skipIf(!RUN || !HAS_CREDS || !REAL_ORDERS)` — three-way gate

- [ ] **AC 6** — Architectural invariant: **NO `LIVE_MODE` references in `lib/coinbase/orders.ts` or `lib/coinbase/order-schemas.ts`** — covered by the existing [`tests/lib/coinbase/no-live-mode.test.ts`](../../../../tests/lib/coinbase/no-live-mode.test.ts) (auto-scans new files in `lib/coinbase/` at test time per CB-2.1's design). This is THE load-bearing architectural invariant of CB-2.4: the wrapper places real orders unconditionally; CB-4 owns the gate.

- [ ] **AC 7** — Standard gates: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all pass. Test suite grows by ~14-16 (currently ~363 post-CB-2.3; expected ~377-379 post-merge).

## Standard Experience Checklist

- [ ] **Navigation** — `n/a — no UI surface in this story; lib/coinbase/orders.ts is server-only library code consumed by CB-4 (bot tick) and potentially CB-5 (dashboard override buttons), not user-facing`
- [ ] **States** — `n/a — no rendered states; library functions either return a typed result or throw a CoinbaseClientError`
- [ ] **Feedback** — `n/a — no UI feedback; all wrapper errors flow up via CoinbaseClientError; CB-4 + CB-5 own user-facing feedback for order placement/cancellation outcomes`
- [ ] **Accessibility** — `n/a — no UI surface`
- [ ] **Edge cases** — `Sensitive-data hygiene IS the load-bearing edge case (covered by AC 4's anti-echo test). Real-money outcomes (partial fills, rejected orders, Coinbase-side rate limits, network failures mid-placement) all reflect as CoinbaseClientError or typed OrderResponse; CB-4's bot tick + CB-5's dashboard own per-consumer handling. client_order_id idempotency mitigates double-placement on retry.`
- [ ] **Cross-surface consistency** — `n/a — single surface (server-only library)`

Five categories explicitly `n/a` with reason per CB-2.1's precedent; Edge cases is non-n/a (sensitive-data hygiene + real-money idempotency). Standard Experience Checklist gate satisfied.

## Tech notes

### Brief + CB-2.1 + CB-2.2 + CB-2.3 references

- [CB-2 brief § In scope](../../brief.md#in-scope) — names `orders.ts` with `placeOrder({productId, side, amount, type})` and `cancelOrder(orderId)`. Both signatures amended in this PR — see PM DRI Decision in the brief.
- [CB-2 brief PM Risk #2 (response shape drift)](../../brief.md#risks) — load-bearing for AC 2's `.passthrough()` Zod posture.
- [CB-2 brief PM Risk #4 (LIVE_MODE gate in CB-4, not wrapper)](../../brief.md#risks) — directly load-bearing for AC 6.
- [CB-2.1 story § DRI Decisions](../CB-2.1/story.md#decisions) — no-SDK Engineer DRI Decision; CB-2.4 uses `crypto.randomUUID()` from `node:crypto` (no new dependency).
- [CB-2.1 story § Risks — EdDSA brokerage caveat](../CB-2.1/story.md#risks-engineer-round-1-then-pm-pre-existing-for-audit) — **RESOLVED 2026-06-07 by [CB-2.3 PR #34](https://github.com/vivekschaudhary/crypto-bot/pull/34)**; CB-2.4 inherits the same auth path with confidence.
- [CB-2.3 story § AC 4 sensitive-data anti-echo test](../CB-2.3/story.md#acceptance-criteria) — pattern for CB-2.4's AC 4 sensitive-data hygiene test.
- [CB-2.3 story § AC 5 sentinel-empty integration test pattern](../CB-2.3/story.md#acceptance-criteria) — applies to CB-2.4 too: verify that a filter / parameter actually has effect, not just that the response shape is correct.
- [`lib/coinbase/client.ts`](../../../../lib/coinbase/client.ts) — `coinbase().request<T>(method, path, body?)` is the auth'd entry-point CB-2.4 calls. `body` is JSON-stringified internally.

### Endpoint reference (per current Coinbase Advanced Trade v3 docs, 2026-06-08)

| Method | Coinbase endpoint | Body shape |
|---|---|---|
| `placeOrder` | POST `/api/v3/brokerage/orders` | `{client_order_id, product_id, side, order_configuration}` |
| `cancelOrders` | POST `/api/v3/brokerage/orders/batch_cancel` | `{order_ids: string[]}` |

Engineer freshens against [Create Order docs](https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/orders/create-order) + [Cancel Orders docs](https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/orders/cancel-order) at first commit (per the CB-2.4 lesson: **verify exact field names + cardinality + required-vs-optional + nested-shape against live docs BEFORE writing schemas**).

### What this story explicitly does NOT do

- `lib/coinbase/trace.ts` (CB-2.5) — Sentry breadcrumbs + rate-limit-header awareness + structured logging
- `LIVE_MODE` policy decision-making (CB-4's territory, separate bet)
- Order amendment via PUT (`/orders/edit`) — deferred to CB-4 if needed
- Order preview via POST `/orders/preview` — explicitly NOT used by CB-2.4 (different endpoint from the write paths this story defines; cannot substitute for verifying `POST /orders` + `POST /orders/batch_cancel`); deferred entirely
- Persistent order tracking / order-status reconciliation — CB-4 owns this
- Multi-account / portfolio routing — single-operator scope; defaults to the operator's default Coinbase portfolio

## PRs

_Auto-populated as PRs open._

## Tests

- `tests/lib/coinbase/orders.test.ts` — `regression: true, e2e: false`
- `tests/lib/coinbase/orders.integration.test.ts` — `regression: false, e2e: false` (operator-gated + CDP-creds-gated + `RUN_REAL_ORDER_TESTS=1` opt-in)

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `docs/bets/CB-2/stories/CB-2.4/fixes/`._

## DRI Log

### Decisions

_To be filled by Engineer at first PR commit. Required entries:_

1. **`order_configuration` variants shipped in CB-2.4** — minimum: `market_market_ioc` + `limit_limit_gtc`; verify against [Create Order docs](https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/orders/create-order) for completeness. Stop-limit + advanced variants deferred to a follow-up story if CB-4 doesn't surface a need.
2. **`client_order_id` generation when absent** — `crypto.randomUUID()` from `node:crypto` (Engineer confirms this gives a UUID v4 format Coinbase accepts; falls back to a custom UUID v4 implementation if Coinbase rejects v4 over v1/etc).
3. **Integration test strategy for placeOrder** — Option A (limit-far-from-market + cancel symmetry against actual `POST /orders` + `POST /orders/batch_cancel`) is the recommended approach. If Coinbase rejects far-from-market orders, escalate via Engineer DRI Risk: either prompt operator for explicit opt-in to Option B (tiny market order), OR SKIP the integration test with a documented verification gap that CB-2.5 must close. Preview Order endpoint is NOT an acceptable substitute (different endpoint; doesn't exercise the write paths CB-2.4 is shipping).
4. **`RUN_REAL_ORDER_TESTS=1` opt-in gating** — three-way gate (`RUN_INTEGRATION_TESTS=1` + `CDP creds` + `RUN_REAL_ORDER_TESTS=1`); document in test file's top-of-file comment.
5. **Sensitive-data hygiene — `parseOrThrow` reuse** — inherit CB-2.3's pattern (`CoinbaseClientError.fromHttpResponse` extracts only error fields into `.message`; `cause` preserves the raw body). Anti-echo test mocks `request()` throwing with a cause containing order price/size and asserts `.message` does NOT echo those values.
6. **Required-field set for `OrderResponseSchema` + `CancelOrdersResponseSchema`** — pin against live Coinbase response inspection during integration test. Use CB-2.3's pattern of marking consumer-load-bearing fields required even if Coinbase docs mark them optional.

### Risks

- [2026-06-08] [PM] **Real-money write surface — first place a wrapper bug could exfiltrate or misroute capital**
  - **Likelihood (required):** low (LIVE_MODE-free invariant ensures CB-4 controls when this fires; LIVE_MODE=false in production until operator explicitly enables; CDP key is Trade-only scope; AC 6 grep test enforces no LIVE_MODE reads in wrapper)
  - **Impact (required):** very high (real-money capital loss; bounded by Trade-only scope = no Withdraw, so worst case is wrong-asset purchases at wrong prices, not capital exfiltration)
  - **Mitigation (required):** four layers of defense: (1) AC 6 architectural invariant test ensures wrapper itself has no policy logic; (2) `clientOrderId` idempotency prevents double-placement on retry; (3) CB-4's `LIVE_MODE` gate (separate bet) is the operator's master switch; (4) Codex security review on this PR (required, mandatory).
  - **Area (required, tag):** security / real-money / first-exercise

- [2026-06-08] [PM] **`order_configuration` discriminated union has many variants; CB-2.4 ships only a subset**
  - **Likelihood (required):** medium (CB-4 + CB-5's exact needs not yet pinned; CB-4 brief not drafted)
  - **Impact (required):** low (adding a variant in a follow-up story is a half-day; doesn't block CB-4 if CB-4 only needs market+limit which CB-2.4 ships by default)
  - **Mitigation (required):** Engineer DRI Decision #1 names the shipped subset explicitly; brief logs deferred variants for future follow-up; CB-4 surfaces a Risk if it needs a variant CB-2.4 didn't ship.
  - **Area (required, tag):** scope / forward-looking

- [2026-06-08] [PM] **Integration test places real orders — operator must opt in**
  - **Likelihood (required):** medium (operator may forget to set `RUN_REAL_ORDER_TESTS=1` and assume tests verified write path)
  - **Impact (required):** low if operator notices skip messages; medium if write bug ships without verification
  - **Mitigation (required):** test file's `describe.skipIf` block logs an explicit "skipping real-order tests" message when the env var is absent (so operator sees it during `pnpm test:integration` runs); README or runbook update documents the opt-in pattern.
  - **Area (required, tag):** test-coverage / opt-in-discipline

### Issues

- [2026-06-08] [PM] **Determine if CB-4 / CB-5 need any `order_configuration` variants beyond market + limit before CB-2.4 ships**
  - **Severity (required, mandatory):** P3
  - **Owner (required, mandatory):** Engineer at first commit time (with PM consultation if scope unclear)
  - **Status:** open
  - **Area (required, tag):** scope / cross-story coordination
  - **Resolution (filled when closed):** [to be filled when Engineer confirms which variants ship in CB-2.4 vs which defer]

---

_Story closed: <pending>, brief link: docs/bets/CB-2/brief.md_

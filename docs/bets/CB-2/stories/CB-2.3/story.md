---
id: CB-2.3
bet: CB-2
type: story
status: shipped
shipped: 2026-06-07
priority: P0
created: 2026-06-07
author: PM
design_link: n/a (no UI surface — pure library)
area_tags: [coinbase-integration, library, backend, authenticated-reads]
dependencies: [CB-2.1, CB-2.2]
---

# CB-2.3 — `lib/coinbase/accounts.ts` — authenticated reads (accounts + trade history)

## Description

Ship the authenticated-reads layer of `lib/coinbase/`. Three typed wrappers consuming `coinbase().request()` from CB-2.1 (auth'd JWT path; first story to exercise it against `/api/v3/brokerage/accounts*` + `/api/v3/brokerage/orders/historical/fills`):

- `getAccountBalances()` — list all the operator's Coinbase accounts (one per currency held)
- `getAccount(accountUuid)` — single account detail by uuid
- `getAccountTradeHistory({productIds?: string[], start?, end?, cursor?, limit?})` — historical fills (executed trades), filterable by trading-pair(s) + time range. Plural `productIds` array matches Coinbase's `product_ids` query param per the [List Fills docs](https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/orders/list-fills); singular `productId` was the original draft but corrected to plural during PR #34 round-1 review.

The wrapper response shape carries the operator's **real-money balances** + trade history. Two architectural invariants from the CB-2 brief get their first real exercise here:

1. **No `LIVE_MODE` reads inside the wrapper** (covered by the existing grep test from CB-2.1)
2. **Sensitive-data hygiene** — error messages must NOT echo balance values or order details into logs (defense-in-depth; reinforced when CB-2.5 ships `trace.ts`)

This is also **the first integration test that requires CDP credentials** — operator runs locally with `.env.local` providing `COINBASE_API_KEY_NAME` + `COINBASE_API_PRIVATE_KEY`. CI does NOT run this test (matches the existing CB-2.1 pattern + brief PM Risk #2).

**Load-bearing: EdDSA brokerage caveat verification.** [CB-2.1 documented uncertainty](../CB-2.1/story.md#risks-engineer-round-1-then-pm-pre-existing-for-audit) about whether Ed25519 keys (newer CDP format) actually authenticate against `/api/v3/brokerage/*` (Coinbase's brokerage docs are silent; some sources suggest 401). CB-2.3's integration test is the first chance to verify this end-to-end against the live API with the operator's actual key format. The result of this verification — pass or fail — gets logged as a story DRI Risk resolution + a CB-2.1 follow-up.

## Acceptance Criteria

- [ ] **AC 1** — `lib/coinbase/accounts.ts` exports three typed wrapper functions, each `async` and each calling `coinbase().request<unknown>("GET", path)` from [CB-2.1](../../../../lib/coinbase/client.ts):

  ```ts
  export async function getAccountBalances(): Promise<Account[]>
  export async function getAccount(accountUuid: string): Promise<Account>
  export async function getAccountTradeHistory(args: {
    productIds?: string[];    // e.g., ["BTC-USD"] or ["BTC-USD", "ETH-USD"] — filters fills to one or more trading pairs
    start?: Date;             // filters fills where trade_time >= start
    end?: Date;               // filters fills where trade_time <= end
    cursor?: string;          // pagination — pass cursor from prior response to get next page
    limit?: number;           // default 100 per Coinbase docs; max value not stated in the primary docs we've cited — Engineer verifies + pins against the live `/orders/historical/fills` endpoint at first commit
  }): Promise<{ fills: Fill[]; cursor?: string }>
  ```

  Time parameters convert to Coinbase's expected format (RFC3339 / ISO-8601 string — Engineer DRI Decision at first commit; CB-2.2's candles endpoint uses Unix-seconds string, but fills uses a different format per docs).

  **Naming note:** `getAccountTradeHistory` accepts `productIds` (array), NOT `assetId` (as the original brief said) and NOT `productId` (singular — as a prior amendment said). Reason: Coinbase Advanced Trade's `/orders/historical/fills` filters via `product_ids` (plural, array) query parameter per the [List Fills docs](https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/orders/list-fills). Sending the undocumented singular `product_id` may silently noop or match-all. See [CB-2 brief PM DRI Decisions](../../brief.md#decisions) for the rename history (assetId → productId → productIds).

- [ ] **AC 2** — `lib/coinbase/account-schemas.ts` exports Zod schemas at the wrapper boundary with `.passthrough()` for forward-compat per [CB-2 brief PM Risk #2](../../brief.md#risks):
  - `MoneyValueSchema` — Coinbase's `{value: string, currency: string}` shape used by `available_balance` + `hold` (Engineer verifies the exact field name per docs at build time)
  - `AccountSchema` — strict required: `uuid`, `currency`, `available_balance`. Loose-optional: `name`, `type`, `active`, `created_at`, `updated_at`, `deleted_at`, `hold`, `ready`, `portfolio_id`, `retail_portfolio_id`
  - `AccountsResponseSchema` — `{accounts: Account[], has_next: boolean, cursor?: string, size?: number}` envelope
  - `FillSchema` — strict required: `entry_id`, `trade_id`, `order_id`, `trade_time`, `price`, `size`, `product_id`, `side`. Loose-optional: `commission`, `trade_type`, `sequence_timestamp`, `liquidity_indicator`, `size_in_quote`, `user_id`, `retail_portfolio_id`
  - `FillsResponseSchema` — `{fills: Fill[], cursor?: string}` envelope
  - **Required-field discipline**: per the lesson from [CB-2.2 round-1 BLOCKER](https://github.com/vivekschaudhary/crypto-bot/pull/32), required fields are those downstream consumers (CB-5 ledger, CB-4 fill-driven decisions, dashboard) actually depend on. If Coinbase ever stops returning them, fail loud (API contract change). Engineer verifies the required-set against the [List Accounts docs](https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/accounts/list-accounts) + [List Fills docs](https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/orders/list-fills) before first commit.

- [ ] **AC 3** — Pagination posture for the three wrappers (Engineer DRI Decision at first commit):
  - **`getAccountBalances()`**: auto-paginate via `has_next` + `cursor`. Coinbase default limit is unknown; request the max documented limit (likely 250) per page and loop until `has_next === false`. Public surface stays `Promise<Account[]>` returning the full list (caller doesn't see pagination). Operator's account count is bounded (~10-50 currencies held); no infinite-loop risk.
  - **`getAccountTradeHistory({...})`**: **single-page fetch returning `{fills, cursor?}`**. Caller drives pagination by passing the returned `cursor` to the next call. Rationale: fills are unbounded (could be hundreds of thousands across a long history); auto-paginating internally could OOM the caller. CB-5's ledger view will likely page UI-side anyway.

- [ ] **AC 4** — Unit tests at `tests/lib/coinbase/accounts.test.ts`:
  - Mock `coinbase().request` via `vi.mock("@/lib/coinbase/client", ...)` (mirrors [CB-2.2's pattern](../../../../tests/lib/coinbase/market.test.ts))
  - Happy-path per method (3 tests): correct URL called, correct method (GET), `request` (not `publicRequest`) used, Zod-validated result returned
  - Pagination tests for `getAccountBalances`: single-page + multi-page merge (2 tests)
  - Cursor pass-through for `getAccountTradeHistory`: single-page with no cursor; returns `{fills, cursor}` shape verified (1 test)
  - Time-range conversion for `getAccountTradeHistory`: verifies `Date` → Coinbase format (1 test)
  - Zod validation failure per method → `CoinbaseClientError({code: "validation-failed"})` (3 tests; one per method)
  - Invalid-argument guards: empty `accountUuid`, empty `productIds` array, `productIds` containing an empty string, `end <= start` → `CoinbaseClientError({code: "invalid-argument"})` (multiple tests)
  - URL-encoding for `accountUuid` (1 test)
  - Sensitive-data hygiene: when `request` throws with a body containing balance values, the wrapped error message does NOT echo the balance value (1 test). This is the test that proves the architectural invariant from the Description.
  - Total: ~14-16 new tests in this file.

- [ ] **AC 5** — Integration tests at `tests/lib/coinbase/accounts.integration.test.ts` (NEW file, separate from CB-2.1's `client.integration.test.ts`):
  - Gated on **BOTH** `RUN_INTEGRATION_TESTS=1` **AND** the presence of CDP credentials (`COINBASE_API_KEY_NAME` + `COINBASE_API_PRIVATE_KEY` in env). If either is missing → skip with a clear log message. Operator-runs locally before merge; CI does NOT run (per CB-2.1 precedent).
  - Engineer DRI Decision at first commit on how to load `.env.local` for the test run — options: (a) document the inline shell pattern (e.g., `RUN_INTEGRATION_TESTS=1 source .env.local && pnpm test ...`), (b) add a small `pnpm test:integration` script that wraps env loading, (c) use vitest's env-file config. Pick whichever reads cleanest given the existing test infrastructure.
  - `getAccountBalances()` returns at least 1 account; every account has a valid `uuid` (non-empty string) and `available_balance` with a parseable numeric `value` field
  - `getAccount(uuid)` returns the same shape when given a uuid from the list call
  - `getAccountTradeHistory({productIds: ["BTC-USD"]})` returns a `{fills, cursor?}` shape; if `fills.length > 0`, each fill has the required fields populated. If `fills.length === 0`, that's also acceptable (operator may not have BTC-USD trades) — the test just asserts the shape. **Plus sentinel-empty filter check**: an additional call with `productIds: ["ZZZ-USDT-SENTINEL-NO-TRADES"]` asserts `fills.length === 0` — proves the filter actually applies vs silently match-all (pattern from PR #35).
  - **EdDSA brokerage caveat verification (load-bearing):** if `getAccountBalances()` returns 2xx → caveat resolved; the wrapper auth'd-reads path works with the operator's key format. If it returns 401 + Coinbase responds with an Ed25519-specific error message → the [CB-2.1 PM Risk on EdDSA brokerage compatibility](../CB-2.1/story.md#risks-engineer-round-1-then-pm-pre-existing-for-audit) escalates; story status pauses to revisit auth approach (e.g., regenerate CDP key with ES256 / PEM format).

- [ ] **AC 6** — Architectural invariants from CB-2 brief hold (verified by existing tests; no new test files needed):
  - **No `LIVE_MODE` reads** in `lib/coinbase/accounts.ts` or `lib/coinbase/account-schemas.ts` — covered by [`tests/lib/coinbase/no-live-mode.test.ts`](../../../../tests/lib/coinbase/no-live-mode.test.ts) (auto-scans new files in `lib/coinbase/` at test time per CB-2.1's design)
  - **Bundle size of `lib/coinbase/`** stays under 50 KB compiled budget — `accounts.ts` + `account-schemas.ts` together add ~10 KB (similar to CB-2.2's market layer)
  - **Sensitive-data hygiene**: AC 4's test proves error messages don't echo balance values

- [ ] **AC 7** — Standard gates: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all pass. Test suite grows by ~14-16 (currently 346 post-CB-2.2; expected ~360-362 post-merge).

## Standard Experience Checklist

- [ ] **Navigation** — `n/a — no UI surface in this story; lib/coinbase/accounts.ts is server-only library code consumed by CB-5 (dashboard trade ledger) and CB-4 (post-order fill verification), not user-facing`
- [ ] **States** — `n/a — no rendered states; library functions either return a typed result or throw a CoinbaseClientError (per CB-2.1 AC 3) / Zod validation error (per AC 4 above)`
- [ ] **Feedback** — `n/a — no UI feedback; all wrapper errors flow up via CoinbaseClientError; structured-log breadcrumbs (without balance values) added in CB-2.5 (trace.ts), not this story`
- [ ] **Accessibility** — `n/a — no UI surface; no focus management; no keyboard/screen-reader concerns`
- [ ] **Edge cases** — `Sensitive-data hygiene IS the load-bearing edge case for this story (covered by AC 4's anti-echo test). Network failures and unexpected response shapes reflect as CoinbaseClientError; per-consumer edge-case handling lives in CB-5 (ledger) and CB-4 (post-order verification) stories that consume the wrapper`
- [ ] **Cross-surface consistency** — `n/a — single surface (server-only library)`

Five categories explicitly `n/a` with reason per [CB-2.1's precedent](../CB-2.1/story.md#standard-experience-checklist); Edge cases is non-n/a (sensitive-data hygiene). Standard Experience Checklist gate satisfied.

## Tech notes

### Brief + CB-2.1 + CB-2.2 references

- [CB-2 brief § In scope](../../brief.md#in-scope) — names `accounts.ts` with `getAccountBalances()`, `getAccount(uuid)`, and `getAccountTradeHistory({productIds?: string[], start?, end?, cursor?, limit?})`. The parameter shape evolved through two renames documented in the brief's PM DRI Decisions: (1) `assetId` → `productId` (2026-06-07 during /create-story — Coinbase's `/orders/historical/fills` filters by trading pair, not bare asset); (2) `productId` (singular) → `productIds` (plural array) (2026-06-07 during PR #34 round-1 — Coinbase's actual query parameter is `product_ids` plural array per [List Fills docs](https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/orders/list-fills); singular form was undocumented and risked silent match-all). `from`/`to` also renamed to `start`/`end` for consistency with CB-2.2's `getProductCandles` signature. See [CB-2 brief PM DRI Decisions](../../brief.md#decisions) for the full rationale + alternatives rejected. CB-2.3's AC 1 below implements the final shipped shape (`productIds: string[]` per PR #34/#35).
- [CB-2 brief PM Risk #2 (response shape drift)](../../brief.md#risks) — load-bearing for AC 2's `.passthrough()` Zod posture and AC 5's required-field discipline.
- [CB-2.1 story § DRI Decisions](../CB-2.1/story.md#decisions) — the no-SDK Engineer DRI Decision constrains CB-2.3 to direct `request()` calls; no SDK to wrap.
- [CB-2.1 story § Risks](../CB-2.1/story.md#risks-engineer-round-1-then-pm-pre-existing-for-audit) — the EdDSA brokerage caveat. **CB-2.3 is the first chance to verify this end-to-end** against the operator's actual key format. AC 5's integration test is the verification.
- [CB-2.2 story § Tech notes](../CB-2.2/story.md#tech-notes) — pattern for Zod `.passthrough()` + required-field discipline (volume_24h round-2 lesson); apply same posture here.
- [`lib/coinbase/client.ts`](../../../../lib/coinbase/client.ts) — `coinbase().request<T>(method, path, body?)` is the auth'd entry-point CB-2.3 calls. Internally calls `mintJWT()` from `jwt.ts` (ES256/EdDSA auto-detect from key format).

### Endpoint reference (per current Coinbase Advanced Trade v3 docs, 2026-06-07)

| Method | Coinbase endpoint | Notes |
|---|---|---|
| `getAccountBalances()` | `GET /api/v3/brokerage/accounts` | Paginated via `has_next` + top-level `cursor`; auto-paginate internally |
| `getAccount(uuid)` | `GET /api/v3/brokerage/accounts/{account_uuid}` | Single account; response wrapped in `{account: {...}}` envelope (verified against live API; differs from `getProduct(id)` which is not wrapped) |
| `getAccountTradeHistory({...})` | `GET /api/v3/brokerage/orders/historical/fills` | Query params: `product_ids` (plural — passed as repeated query params per trading pair), `start_sequence_timestamp` (RFC3339), `end_sequence_timestamp` (RFC3339), `cursor`, `limit`. Returns `{fills, cursor?}` envelope. Single-page; caller drives pagination. |

Engineer freshens these against [List Accounts](https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/accounts/list-accounts) + [List Fills](https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/orders/list-fills) docs at first commit (per CB-2.2 round-1 lesson — verify contract values BEFORE committing schemas, not after Codex flags).

### What this story explicitly does NOT do

- `lib/coinbase/orders.ts` (CB-2.4) — auth'd writes (`placeOrder`, `cancelOrders`); LIVE_MODE-free per architectural invariant; CB-4 owns the gate
- `lib/coinbase/trace.ts` (CB-2.5) — Sentry breadcrumbs + rate-limit-header awareness
- Sensitive-data redaction in structured logs (CB-2.5; here we just don't log balance values at all)
- Asset-level aggregation across trading pairs (deferred to CB-5 dashboard; `getAccountTradeHistory` takes `productIds: string[]` — trading-pair(s) — not bare asset)
- Auto-pagination for `getAccountTradeHistory` (deferred; caller-driven cursor is the surface this story ships)
- LIVE_MODE-gate-in-CB-4 architectural invariant verification (CB-2.4 ships orders.ts where this matters; CB-2.3's accounts surface is read-only)

## PRs

- [PR #34](https://github.com/vivekschaudhary/crypto-bot/pull/34) — `feat(CB-2.3): lib/coinbase/accounts.ts — auth'd reads (accounts + trade history)`. Squash-merged 2026-06-07 (commit `d642b99`). 2 review rounds: round-1 BLOCKER on `productId` (singular, undocumented; silent-match-all risk) + ISSUE on defensive `break` silently returning partial account list; round-2 ISSUE on Stories forecast still naming singular. **EdDSA brokerage caveat verified end-to-end against operator's actual key (Engineer DRI Decision #8 = `pass`)** — CB-2.1 PM Risk RESOLVED. Ships `lib/coinbase/{accounts,account-schemas}.ts` + initial 14 unit tests + 3 gated integration tests.
- [PR #35](https://github.com/vivekschaudhary/crypto-bot/pull/35) — **URGENT** restoration of PR #34 round-1 + round-2 review fixes missed in squash-merge (3rd squash-merge race in this bet — triaged at [docs/incidents/2026-06-07-squash-merge-race/triage.md](../../../incidents/2026-06-07-squash-merge-race/triage.md)). Squash-merged 2026-06-08 (commit `925a187`). Restores: `productId → productIds: string[]` (Coinbase docs say plural `product_ids` array); URLSearchParams.append for repeated query params; fail-loud `pagination-contract-violation` error code; sentinel-empty-filter integration test pattern (productIds: ["ZZZ-USDT-SENTINEL-NO-TRADES"] → fills.length === 0); brief + story cascade-sync.

## Tests

- `tests/lib/coinbase/accounts.test.ts` — `regression: true, e2e: false`
- `tests/lib/coinbase/accounts.integration.test.ts` — `regression: false, e2e: false` (operator-gated + CDP-creds-gated)

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `docs/bets/CB-2/stories/CB-2.3/fixes/`._

## DRI Log

### Decisions

_To be filled by Engineer at first PR commit. Required entries:_

1. **Pagination loop limit for `getAccountBalances`** (per AC 3) — exact `limit` per request pinned against Coinbase docs (likely 250)
2. **Time-range format for `getAccountTradeHistory`** (per AC 1) — `Date` → Coinbase format string (RFC3339 / ISO-8601 — pin against docs)
3. **`limit` default + max for `getAccountTradeHistory`** (per AC 1) — pinned against Coinbase docs. Default is 100 per the cited [List Fills docs](https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/orders/list-fills); the max value is NOT stated in the primary docs we've reviewed — Engineer verifies the max by either (a) finding it in a different docs page during build, or (b) probing the live endpoint and recording the rejection threshold. Do NOT hardcode an assumed max in the wrapper without primary-source citation.
4. **Required-field set for `AccountSchema` + `FillSchema`** (per AC 2) — pinned against live Coinbase response inspection during integration test
5. **Zod validation failure error shape** (per AC 4) — inherits from CB-2.2: `CoinbaseClientError({code: "validation-failed"})` with first-3-issues summary
6. **Sensitive-data redaction strategy in `parseOrThrow`-style helper** (per AC 4 + AC 6) — if `request()` body contains balance fields, suppress them from the error message; pass through to `cause` for debugging-at-call-site
7. **Integration test env-loading mechanism** (per AC 5) — how `.env.local` reaches the test runner; one-time-setup vs inline-env vs vitest config
8. **EdDSA brokerage caveat resolution status** (per AC 5) — pass / fail / partial / unverified; documented as Risk closure or escalation

### Risks

- [2026-06-07] [PM] **First-time JWT brokerage auth surface — EdDSA / ES256 algorithm choice may fail against `/api/v3/brokerage/*`**
  - **Likelihood (required):** unknown; CB-2.1 documented uncertainty
  - **Impact (required):** high (would block the entire CB-2.3+CB-2.4 auth'd path; would force a regenerate-CDP-key remediation OR an SDK swap OR a CB-2.3 architectural reshape)
  - **Mitigation (required):** AC 5's integration test is the FIRST chance to verify end-to-end with the operator's actual key. If it surfaces, escalate immediately via story DRI Issue. The wrapper code itself doesn't change based on the outcome; the integration test result drives the remediation path.
  - **Area (required, tag):** technical / auth / first-exercise

- [2026-06-07] [PM] **Sensitive-data leakage via error messages — balance values could end up in logs**
  - **Likelihood (required):** low (architectural invariant from brief; AC 4 has a specific anti-echo test)
  - **Impact (required):** high (operator's real-money balances in production logs; PII / sensitive-data violation; observability platform retention)
  - **Mitigation (required):** AC 4 test proves the error message does NOT echo balance values; `cause` field preserves the body for debugging without surfacing it in `.message`; CB-2.5's `trace.ts` extends this discipline to structured logs (separate story)
  - **Area (required, tag):** security / data-handling

- [2026-06-07] [PM] **Unbounded fills pagination if CB-5 dashboard naively iterates** — single-page surface gives the caller control, but caller misuse could hit Coinbase rate limits
  - **Likelihood (required):** low (CB-5 not yet built; story not yet drafted; this is a downstream-caller concern)
  - **Impact (required):** medium (rate-limit consumption + perceived dashboard slowness; bounded by CB-2 brief's 10%-of-ceiling fitness function)
  - **Mitigation (required):** CB-5's story will pin the pagination iteration policy; CB-2.5's `trace.ts` will add the rate-limit observability that surfaces this concern. CB-2.3 just ships the safe-by-default single-page surface.
  - **Area (required, tag):** rate-limit / forward-looking

### Issues

_None at story-creation time. Engineer + Researcher open questions tracked at CB-2 brief level (rate-limit headers + CDP JWT rotation deferred to CB-2.5)._

---

_Story closed: 2026-06-07 (initial ship via PR #34 commit `d642b99`; missed-fixes restoration 2026-06-08 via PR #35 commit `925a187`), brief link: docs/bets/CB-2/brief.md_

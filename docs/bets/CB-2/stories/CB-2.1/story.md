---
id: CB-2.1
bet: CB-2
type: story
status: ready
priority: P0
created: 2026-06-06
author: PM
design_link: n/a (no UI surface — pure library)
area_tags: [coinbase-integration, library, backend, dependency-management]
dependencies: []
---

# CB-2.1 — Coinbase SDK pick + `lib/coinbase/client.ts` + foundational typed-error layer

## Description

Lock the Coinbase TS SDK choice (the [CB-2 brief's open issue](../../brief.md#issues) deferred from the foundation architecture) and ship the first piece of `lib/coinbase/` — a single configured client instance other modules will import. This story is **the load-bearing dependency call**; CB-2.2/2.3/2.4/2.5 (per the [CB-2 brief's expected decomposition](../../brief.md#stories)) all import from `lib/coinbase/client.ts`. Get the SDK right, and the rest of CB-2 is mechanical SDK-method wrapping; get it wrong, and every later story carries a half-day SDK swap.

Per the [CB-2 brief § Scope (in)](../../brief.md#in-scope), the wrapper consumes the existing `COINBASE_API_KEY_NAME` and `COINBASE_API_PRIVATE_KEY` env vars (already in `lib/env/index.ts` from the foundation scaffold — no env-loader extension needed). The wrapper exports a typed error class and base Zod schemas that subsequent CB-2.x stories will extend module-by-module. No public market data calls, no account reads, no order writes yet — those are CB-2.2/2.3/2.4.

This story also lays in the **architectural invariant** from [CB-2 PM DRI Decision #3](../../brief.md#decisions): **no `LIVE_MODE` reads inside `lib/coinbase/`**. Verified via an ESLint rule + a grep test in CI; the wrapper stays policy-free; the consumer (CB-4) owns the gate.

## Acceptance Criteria

- [ ] **AC 1 (amended 2026-06-06)** — Engineer DRI Decision logged at the top of this story's DRI Log selecting **no SDK — direct fetch + per-request JWT minted via `node:crypto`**. Rationale: operator's sibling app demonstrates the working pattern; alignment with [foundation/architecture.md § Decision](../../../foundation/architecture.md#decision)'s "minimize vendor surface" stance; ES256/EdDSA auto-detection from key format future-proofs Coinbase's CDP key-format migration (Ed25519 is the newer standard); zero vendor in the auth path; smaller bundle. Alternatives-rejected: (a) `tiagosiebler/coinbase-api` — adds an SDK vendor in the JWT-signing path; CDP raw-base64/EdDSA support uncertain; (b) `coinbase-samples/advanced-sdk-ts` — 8+ months stale (last release Sept 2024); no test suite; (c) `JoshJancula/coinbase-advanced-node` — CDP JWT support not explicit; (d) adding `jose` JWT library — over-delivers for simple sign(payload, key) → token; `node:crypto` handles both ES256 + Ed25519 natively. Reversibility: easy — if direct path surfaces unforeseen complexity, swap to `tiagosiebler/coinbase-api` at any later story is a half-day swap (the thin shim shape doesn't lock in). **No SDK is added to `package.json`.**

  **Original AC 1 text** (pre-amendment, retained for audit per Compass append-only convention): "Engineer DRI Decision logged at the top of this story's DRI Log selecting one of: (a) `tiagosiebler/coinbase-api`, (b) `coinbase-samples/advanced-sdk-ts`, (c) `JoshJancula/coinbase-advanced-node`. Rationale (required) compares activity signal (last 60-day commit frequency), Advanced Trade endpoint coverage (must include `getProductStats` for CB-3's top-5 computation + `placeOrder` for CB-4's writes), test-suite health, and TypeScript-types quality. Alternatives-rejected (required) names the two unpicked SDKs with a one-sentence rejection rationale each. Reversibility (required) — 'easy' with concrete cost estimate (half-day swap cost; well-defined seam at `lib/coinbase/client.ts`). The chosen SDK is added to `package.json` `dependencies` (not `devDependencies`)."

  **Amendment rationale:** the operator surfaced (during `/build CB-2.1` plan-mode review) that they have a working direct-fetch + per-request-JWT pattern in a sibling app against real Coinbase production. That implementation is structurally better than wrapping a third-party SDK: zero vendor in the auth path, supports both CDP key formats (PEM EC + raw base64), tiny bundle, all types owned via Zod at the boundary, battle-tested. Pivot to direct fetch. Story AC 1 satisfied by a "no SDK" Engineer DRI Decision; the original SDK alternatives are now documented as rejected.

- [ ] **AC 2** — `lib/coinbase/client.ts` exports a single configured Coinbase client instance and a typed accessor:
  - `coinbase()` returns the lazily-initialized client (mirrors the `env()` lazy-cache pattern in `lib/env/index.ts:48` — `let cached: Client | undefined; if (cached) return cached; ...`)
  - CDP JWT auth wired from `env().COINBASE_API_KEY_NAME` + `env().COINBASE_API_PRIVATE_KEY` (NO direct `process.env` reads — `lib/env` is the boundary per [cross-cutting standards](../../../foundation/architecture.md#cross-cutting-standards))
  - Multi-line PEM normalization is handled by `lib/env` already (existing `.transform()` chain at `lib/env/index.ts:13-17`); `client.ts` consumes the normalized string verbatim
  - Top-of-file JSDoc names **"CDP only — Coinbase Pro / HMAC legacy auth is non-goal"** explicitly so future-operator doesn't backslide
  - No exports beyond `coinbase()` and the `Client` type alias from the chosen SDK

- [ ] **AC 3** — `lib/coinbase/types.ts` exports the foundational typed-error layer:
  - `class CoinbaseClientError extends Error` with `code: string`, `status?: number` (HTTP status when known), `cause?: unknown` (original SDK error preserved for trace-up)
  - Static factory `CoinbaseClientError.fromSdkError(err: unknown): CoinbaseClientError` — wraps an arbitrary SDK error with normalized shape; if the input is already a `CoinbaseClientError`, returns it unchanged
  - Re-exports the SDK's own type aliases for `Product`, `Account`, `Order` (or whatever the chosen SDK calls them) — these become the canonical types other `lib/coinbase/*.ts` modules import. Subsequent stories tighten with Zod schemas where the response shape is consumer-visible.

- [ ] **AC 4** — Unit tests under `tests/lib/coinbase/`:
  - `client.test.ts`: lazy-cache behavior (first call constructs; second call returns cached instance — same reference); construction reads `lib/env` (mocked) and forwards key name + private key to the SDK's constructor; throws clearly if `lib/env` returns missing values (defense-in-depth — `lib/env`'s Zod validation already enforces presence at app startup, but the test asserts the contract)
  - `types.test.ts`: `CoinbaseClientError.fromSdkError` round-trip — wrapping an SDK error preserves `cause`; wrapping a `CoinbaseClientError` is idempotent; `code` defaults to `"unknown"` when the SDK error has no recognizable code field
  - Tests use `vi.mock("@/lib/env", ...)` to inject test env values (same pattern as `tests/lib/auth/*.test.ts`)

- [ ] **AC 5** — One integration test gated on `RUN_INTEGRATION_TESTS=1` env var:
  - `tests/lib/coinbase/client.integration.test.ts` (uses the `.integration.test.ts` naming convention for vitest pattern-filter)
  - Calls `coinbase()` and invokes ONE benign read endpoint the chosen SDK exposes (e.g. `getServerTime()` or equivalent; specific call documented in test comment based on SDK)
  - Asserts: response is 2xx; SDK doesn't throw; response shape is non-empty
  - Skipped unless `RUN_INTEGRATION_TESTS=1` (`describe.skipIf(!process.env.RUN_INTEGRATION_TESTS)`)
  - **Operator runs locally before this story's PR merges**; CI does NOT run this (CI lacks live CDP credentials by design — see PM Risk below)

- [ ] **AC 6** — Architectural invariant: **NO `LIVE_MODE` references in `lib/coinbase/*`** enforced two ways:
  - Grep test in `tests/lib/coinbase/no-live-mode.test.ts`: scans every `*.ts` file under `lib/coinbase/` for the string `LIVE_MODE` (case-sensitive); fails the test if found
  - ESLint custom rule (or `no-restricted-globals` shim against `process.env.LIVE_MODE`): rejects any future code that imports `LIVE_MODE` into `lib/coinbase/*`. If a `eslint-plugin-local` setup is needed, AC defers to a P3 follow-up; the grep test alone satisfies the invariant for this story.

- [ ] **AC 7** — `pnpm typecheck` passes; `pnpm lint` passes; `pnpm test` passes including the new tests; `pnpm build` produces a clean Next.js build (the client.ts is server-only — never imported by client components; Next.js server-component boundary respected).

## Standard Experience Checklist

- [ ] **Navigation** — `n/a — no UI surface in this story; lib/coinbase/client.ts is server-only library code consumed by CB-2.2/2.3/2.4/2.5 modules and downstream bets`
- [ ] **States** — `n/a — no rendered states; library functions either return a typed result or throw a CoinbaseClientError (covered by AC 3 + AC 4)`
- [ ] **Feedback** — `n/a — no UI feedback; all client errors flow up via CoinbaseClientError (AC 3); structured-log breadcrumbs added in CB-2.5 (trace.ts)`
- [ ] **Accessibility** — `n/a — no UI surface; no focus management; no keyboard/screen-reader concerns`
- [ ] **Edge cases** — `n/a at the library layer — network failures, slow responses, and permissions-denied cases are reflected as CoinbaseClientError (AC 3); per-consumer edge-case handling lives in CB-3/CB-4/CB-5 stories that consume the wrapper`
- [ ] **Cross-surface consistency** — `n/a — single surface (server-only library)`

All six categories explicitly marked `n/a` with reason per [CB-1.1's precedent](../../../CB-1/stories/CB-1.1/story.md) for pure-library stories. No empty cells. Standard Experience Checklist gate satisfied.

## Tech notes

### Brief + foundation references

- [CB-2 brief § In scope](../../brief.md#in-scope) — the `lib/coinbase/client.ts` + `types.ts` portion of the wrapper module list
- [CB-2 brief § DRI Decision #3](../../brief.md#decisions) — `LIVE_MODE` stays in CB-4 not the wrapper (load-bearing for AC 6)
- [foundation architecture.md § Stack — Coinbase row + auth library row](../../../foundation/architecture.md#stack) — Coinbase Advanced Trade CDP JWT auth confirmed at foundation level
- [foundation architecture-research.md §1.3 + §3.4](../../../foundation/architecture-research.md#1-prior-art) — three SDK options + activity signal data fronts the AC 1 decision
- [lib/env/index.ts:10-17](../../../../lib/env/index.ts) — `COINBASE_API_KEY_NAME` + `COINBASE_API_PRIVATE_KEY` already validated + normalized; client.ts just consumes

### SDK decision-input recap

Per [arch-research.md §1.3](../../../foundation/architecture-research.md#1-prior-art) as of foundation review (2026-05-29):

| SDK | Activity signal | Note |
|---|---|---|
| `tiagosiebler/coinbase-api` | last release ~3 months prior; comprehensive Advanced Trade + WebSocket coverage; end-to-end tests | **Current lean** per [arch-research.md DRI Decision](../../../foundation/architecture-research.md#decisions) |
| `coinbase-samples/advanced-sdk-ts` | community-maintained by Coinbase samples team; less independent activity than tiagosiebler | Vendor-blessed; smaller surface |
| `JoshJancula/coinbase-advanced-node` | fork of legacy `coinbase-pro-node`; maintained but older codebase | Honest mention |

Engineer freshens these data points at decision time (npm view, GitHub commit history, last 60 days of issue churn). The lean is informative, not binding — see AC 1.

### `lib/env` is already wired

The foundation scaffold landed `COINBASE_API_KEY_NAME` + `COINBASE_API_PRIVATE_KEY` in `lib/env/index.ts` (lines 11-17). The `COINBASE_API_PRIVATE_KEY` `.transform()` chain already handles literal `\n` → newline conversion (Vercel's env-var single-line storage of multi-line PEMs is normalized at the boundary). `client.ts` consumes the normalized string directly — no further processing.

### LIVE_MODE invariant enforcement

The grep test (AC 6) is the minimum bar. ESLint custom-rule enforcement is the stretch goal — if it requires net-new `eslint-plugin-local` infrastructure, defer to a P3 follow-up `/ops` PR and rely on the grep test + code review for now. The invariant is named explicitly in the [CB-2 brief § DRI Decision #3](../../brief.md#decisions) so future readers know it's deliberate.

### Test surfaces

- `tests/lib/coinbase/client.test.ts` — unit
- `tests/lib/coinbase/types.test.ts` — unit
- `tests/lib/coinbase/no-live-mode.test.ts` — architectural invariant
- `tests/lib/coinbase/client.integration.test.ts` — gated integration (operator-run)

Test count expected: ~8-12 new unit tests + 1 integration. Should bring the codebase Vitest suite from ~260 to ~268-272.

### What this story explicitly does NOT do

- `lib/coinbase/market.ts` (CB-2.2)
- `lib/coinbase/accounts.ts` (CB-2.3)
- `lib/coinbase/orders.ts` (CB-2.4)
- `lib/coinbase/trace.ts` + Sentry integration (CB-2.5)
- Rate-limit header awareness (CB-2.5)
- Top-5 discovery algorithm (CB-3)
- Selection UX (CB-3)
- `LIVE_MODE` gate (CB-4)

## PRs

_Auto-populated as PRs open._

## Tests

- `tests/lib/coinbase/client.test.ts` — `regression: true, e2e: false`
- `tests/lib/coinbase/types.test.ts` — `regression: true, e2e: false`
- `tests/lib/coinbase/no-live-mode.test.ts` — `regression: true, e2e: false`
- `tests/lib/coinbase/client.integration.test.ts` — `regression: false, e2e: false` (integration; operator-gated)

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `docs/bets/CB-2/stories/CB-2.1/fixes/`._

## DRI Log

### Decisions

- [2026-06-06] [Engineer] **No SDK — direct fetch + per-request JWT via `node:crypto`** (satisfies amended AC 1; supersedes the original SDK-pick framing)
  - **Rationale (required):** four pillars converge on direct-fetch as the right answer for this project: (1) operator has a working direct-fetch + JWT pattern in a sibling app against real Coinbase production — porting a working pattern is lower-risk than vetting a third-party SDK; (2) auto-detect ES256 (PEM EC) vs EdDSA (raw base64) from key format future-proofs against Coinbase's CDP key-format migration (Ed25519 is the newer standard, and no SDK explicitly guarantees support for both); (3) zero vendor in the auth path matches the foundation architecture's "minimize vendor surface" stance explicitly named in [architecture.md § Decision](../../../foundation/architecture.md#decision); (4) `node:crypto` already used in [`lib/auth/cookie.ts:17`](../../../../lib/auth/cookie.ts) for HMAC; dependency posture stays consistent with the codebase's "Node built-ins, no third-party crypto" rule.
  - **Area (required, tag):** architectural / dependency / security
  - **Alternatives considered (required):** (a) `tiagosiebler/coinbase-api` — would add an SDK vendor in the JWT-signing path; CDP raw-base64 / EdDSA support uncertain from README; ~150 LOC of wrapper code we'd own anyway. (b) `coinbase-samples/advanced-sdk-ts` — 8+ months stale (last release Sept 2024); no test suite (`"test": "Error: no test specified"`). (c) `JoshJancula/coinbase-advanced-node` — CDP JWT support not explicit in README; key-format support unclear. (d) Adding `jose` JWT library — over-delivers for `sign(payload, key) → token`; `node:crypto` handles ES256 + Ed25519 natively without the dep weight.
  - **Reversibility:** easy — thin shim shape (`mintJWT` + `request`/`publicRequest`) means swapping in `tiagosiebler/coinbase-api` at any later story is a half-day swap. Engineer DRI Decision-supersession pattern (per Compass append-only convention) would handle the bookkeeping.

- [2026-06-06] [Engineer] **`vitest.config.ts` URL → `fileURLToPath` correction** — small drive-by fix
  - **Rationale (required):** `vitest.config.ts:14` used `new URL(".", import.meta.url).pathname`, which leaves percent-encoded characters (e.g. `%20` for spaces) in the resolved path. Breaks the `@`-alias resolution when the working directory contains a space — which the operator's local checkout does (`/Volumes/Vivek mac/...`). Symptom: 25 of 27 test files fail with `Cannot find module '@/...'` locally, even though CI (no spaces) passes. Surfaced during this story's gate runs.
  - **Area (required, tag):** tooling / dx
  - **Alternatives considered (required):** ship the fix in a separate `/ops` PR (rejected — without it, this story can't be locally validated, including the integration test against real Coinbase; the fix is a one-line config change that pairs naturally with the work that needed it); leave as-is and document the workaround (rejected — pre-existing latent bug PR #21 already named; resolving it under this story closes the local-test gap permanently).
  - **Reversibility:** trivial.

### Risks (PM-pre-existing, retained for audit)

### Risks

- [2026-06-06] [PM] **Chosen SDK's `Client` constructor may differ across SDKs — the cached-singleton pattern from AC 2 needs to fit whichever SDK is picked**
  - **Likelihood (required):** low (all three candidate SDKs use a constructor-with-config pattern; the abstraction is shallow)
  - **Impact (required):** low (worst case is renaming the type alias; ~10 LOC)
  - **Mitigation (required):** Engineer's SDK pick documents the constructor signature in the DRI Decision rationale; cached-singleton is the standard pattern across all three options
  - **Area (required, tag):** technical

- [2026-06-06] [PM] **Integration test in AC 5 requires live Coinbase API access — CI does NOT have CDP credentials; operator runs locally before merge**
  - **Likelihood (required):** certain (CI by design lacks CDP keys per [architecture.md § Secrets-at-rest](../../../foundation/architecture.md#secrets-at-rest) — Coinbase keys live ONLY in Vercel encrypted env, never in CI secrets)
  - **Impact (required):** low (the integration test gate is a developer-tooling boundary, not a deployment gate; CB-2.1 ships even if integration test is locally-skipped; functional coverage comes from `client.test.ts` + downstream stories' integration tests)
  - **Mitigation (required):** integration test is opt-in (`RUN_INTEGRATION_TESTS=1`); operator runs once locally before merging the PR; PR template asks for confirmation that integration test passed locally (similar to CB-1.6's Playwright AC 8 protocol)
  - **Area (required, tag):** technical / testing

- [2026-06-06] [PM] **ESLint custom rule for LIVE_MODE may require eslint-plugin-local infrastructure** (AC 6 stretch goal)
  - **Likelihood (required):** medium
  - **Impact (required):** low (the grep test alone is sufficient enforcement for this story; the ESLint rule is belt-and-suspenders)
  - **Mitigation (required):** Engineer DRI Decision on first commit: either ship ESLint rule with the story, OR defer to a P3 `/ops` follow-up with explicit rationale. The architectural invariant in CB-2 brief § DRI Decision #3 plus the grep test in AC 6 establish the invariant either way.
  - **Area (required, tag):** technical / tooling

### Issues

- [2026-06-06] [PM] **Final SDK pick deferred to Engineer DRI on this story** (inherited from [CB-2 brief Issue #1](../../brief.md#issues))
  - **Severity (required, mandatory):** P3 (closes naturally on this story's PR merge)
  - **Owner (required, mandatory):** Engineer at first commit
  - **Status:** open
  - **Area (required, tag):** architectural / dependency
  - **Resolution (filled when closed):** [to be filled when Engineer commits the AC 1 Decision and the package.json dependency lands]

---

_Story closed: <pending>, brief link: docs/bets/CB-2/brief.md_

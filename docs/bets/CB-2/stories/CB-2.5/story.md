---
id: CB-2.5
bet: CB-2
type: story
status: ready
priority: P0
created: 2026-06-08
author: PM
design_link: n/a (no UI surface — pure library)
area_tags: [coinbase-integration, library, backend, observability]
dependencies: [CB-2.1, CB-2.2, CB-2.3, CB-2.4]
---

# CB-2.5 — `lib/coinbase/trace.ts` — request observability + rate-limit awareness (LAST CB-2 STORY)

## Description

Ship the observability layer of `lib/coinbase/`. Adds a thin tracing helper that emits one structured-JSON log line per Coinbase HTTP request, capturing `{method, path, status, duration_ms}` (plus rate-limit headers when Coinbase returns them). Vercel's runtime log collection picks these up automatically; no Sentry SDK install required for the metric itself (see Engineer DRI Decision #1).

This is the **last CB-2 story**. When it ships:
- CB-2 is **done** — the typed wrapper around Coinbase Advanced Trade is complete
- CB-3 (strategy authoring + top-5 selection) **unblocks** — moves to next-on-deck
- Two of the three Researcher Open Questions on the CB-2 brief close:
  - **#1 (rate-limit headers)** — resolved empirically by what the integration test observes
  - **#3 (CDP JWT rotation behavior of the direct-fetch path)** — resolved by Engineer code-review of `jwt.ts` mint-per-request semantics
- `key_metric` ("Wrapper API success rate") becomes **measurable** from the emitted logs. **Retention caveat (per CB-2 brief amendment 2026-06-08):** Vercel Pro retains runtime logs for only 1 day. The brief's "30-day rolling window" target is ASPIRATIONAL until the operator picks one of: (a) Vercel Observability Plus upgrade, (b) Sentry SDK install in a follow-up `/ops` PR, or (c) a DB persistence layer in a future story. CB-2.5 ships the trace emission layer (forward-compatible with any of the three paths); 30-day persistence is an out-of-CB-2.5 scope decision. Day-1 measurement window is 1-day from runtime logs.

The wrapper integration point requires a small modification to `lib/coinbase/client.ts` (the first CB-2 story to touch client.ts since CB-2.1) — `handleResponse` invokes `trace.emit()` with timing + headers data. The change is small + additive + LIVE_MODE-free, but it's not zero-impact like CB-2.2/2.3/2.4 were.

## Acceptance Criteria

- [ ] **AC 1** — `lib/coinbase/trace.ts` exports a single function:

  ```ts
  export function emitRequestTrace(args: {
    method: HttpMethod;            // GET | POST | PUT | DELETE
    path: string;                  // e.g., "/api/v3/brokerage/orders"
    status: number;                // HTTP status code from the response
    durationMs: number;            // wall-clock ms from fetch-start to response-received
    rateLimit?: {                  // populated when Coinbase returns the header(s)
      remaining?: string;
      limit?: string;
      reset?: string;
    };
  }): void;
  ```

  Emits one `console.log` line with JSON-stringified shape: `{"event":"coinbase.request","method":...,"path":...,"status":...,"duration_ms":...,"rate_limit":{...}}`. Vercel's runtime log collection ingests this format into the project's observability dashboard automatically. The function NEVER throws (wraps the emit in try/catch with a `console.error` fallback) — trace observability must not break the request path.

- [ ] **AC 2** — `lib/coinbase/client.ts` modified to invoke `emitRequestTrace` from within `handleResponse`:
  - Before `safeFetch()`: capture `start = Date.now()`
  - After `handleResponse()` (whether 2xx or wrapped non-2xx): compute `durationMs = Date.now() - start`
  - Extract rate-limit headers from `Response.headers` via a defensive helper that tries the documented Coinbase header names AND common alternatives (case-insensitive) — see Engineer DRI Decision #3 for the exact set to try
  - Call `emitRequestTrace({method, path, status, durationMs, rateLimit})`
  - For **error paths** (transport failures via `safeFetch` throwing `CoinbaseClientError({code: "network"})`): emit trace with `status: 0` + `durationMs` from the time of attempt + no rate-limit (network failure means no response). The trace emit happens BEFORE the error is re-thrown.

- [ ] **AC 3** — Sentry SDK integration approach — **confirmed by operator 2026-06-08: Option (a) — structured console.log only; rich observability not needed at this time.**
  - **(a) — SELECTED**: Don't install @sentry/nextjs in CB-2.5; emit structured JSON to `console.log` only; Vercel runtime log collection picks it up; richer integration deferred to a follow-up `/ops` PR if/when needed. Matches CB-2.1's no-SDK posture extended to the observability layer. Engineer commits this as Decision #1 at first commit.
  - **(b) — rejected** (per operator): install @sentry/nextjs in CB-2.5; wire breadcrumbs via `Sentry.addBreadcrumb({category: "coinbase.api", ...})` alongside the console.log; adds the SDK dep + config changes. Rejected: rich observability not needed at this time.
  - **(c) — rejected** (per operator): install @sentry/nextjs but only as a peer-dep; trace.ts probes for presence at runtime. Rejected: same reason as (b); adds dep complexity without operator-validated value.

  Key_metric (success rate) is derivable from console.log JSON shape via Vercel runtime log queries, **with the 30-day retention caveat above**. Day-1 measurement window is 1-day (Vercel Pro default). Extending to 30 days requires operator-decided sink: Observability Plus upgrade, Sentry SDK install (/ops PR), or DB persistence (`wrapper_traces` table; future story). If/when CB-4 bot-tick observability surfaces a need for richer breadcrumb-chained traces OR the 30-day metric becomes load-bearing for a check-in, a separate `/ops` PR adds the chosen sink without breaking CB-2.5's trace emit shape (forward-compatible).

- [ ] **AC 4** — Unit tests at `tests/lib/coinbase/trace.test.ts`:
  - Mock `console.log` via `vi.spyOn(console, "log")` (vitest standard); verify the emit shape
  - Happy-path × 3: GET with no rate-limit header; POST with rate-limit headers populated; transport-failure (status: 0) trace
  - Sensitive-data hygiene × 1: emitted JSON contains ONLY `{method, path, status, duration_ms, rate_limit?}` — no request body, no response body, no balance values, no client_order_id values from POST bodies (anti-echo test)
  - Defensive: emit never throws even when console.log is mocked to throw (try/catch swallows + falls back to console.error)
  - Total: ~5-7 new tests

- [ ] **AC 5** — Modified client.ts unit tests (existing `client.test.ts`):
  - Add 2-3 tests verifying that `request()` and `publicRequest()` invoke trace emit with correct args (method, path, status, durationMs > 0, and rateLimit populated when the mocked Response provides the headers)
  - Verify that trace emit happens AFTER the response is parsed but BEFORE the function returns — so the trace shows the actual status the caller will see
  - Verify that transport-failure path (network error) still emits a trace with `status: 0`

- [ ] **AC 6** — Integration test at `tests/lib/coinbase/trace.integration.test.ts` (NEW file, double-gated like CB-2.3's `accounts.integration.test.ts`):
  - Gated on `RUN_INTEGRATION_TESTS=1` AND CDP credentials present
  - Performs ONE real public request (`getProduct("BTC-USD")`) + ONE real auth'd request (`getAccountBalances()`) + ONE real intentional 4xx (e.g., `getAccount("invalid-uuid")` should 4xx)
  - For each, intercepts `console.log` via `vi.spyOn` and asserts a trace emit happened with the expected method + path + status
  - **The load-bearing assertion**: inspects the emitted trace for the public + auth'd requests to see if `rateLimit.remaining` is populated. If YES → Researcher Open Question #1 RESOLVED as "Coinbase Advanced Trade DOES return rate-limit headers"; Engineer documents the exact header name(s) observed. If NO → RESOLVED as "Coinbase does NOT return rate-limit headers on these endpoints; rate-limit observability falls back to 429-based reactivity per CB-2 brief PM Risk #2's documented mitigation."

- [ ] **AC 7** — Architectural invariants from CB-2 brief hold:
  - **No `LIVE_MODE` references** in `lib/coinbase/trace.ts` or in client.ts changes — covered by [`tests/lib/coinbase/no-live-mode.test.ts`](../../../../tests/lib/coinbase/no-live-mode.test.ts)
  - **Bundle size of `lib/coinbase/`** stays under 100 KB soft alarm (currently 68K post-CB-2.4; trace.ts adds ~3-5 KB → ~73K)
  - **Sensitive-data hygiene** (AC 4): trace emits only request envelope metadata; never body content

- [ ] **AC 8** — Standard gates: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all pass. Test suite grows by ~10-12 (currently 380 post-CB-2.4; expected ~390-392 post-merge).

## Standard Experience Checklist

- [ ] **Navigation** — `n/a — no UI surface in this story; lib/coinbase/trace.ts is server-only library code that emits structured logs picked up by Vercel runtime log collection`
- [ ] **States** — `n/a — no rendered states; trace.emit is fire-and-forget (never throws)`
- [ ] **Feedback** — `n/a — no UI feedback; observability is consumed by Vercel runtime logs + optionally Sentry in a follow-up`
- [ ] **Accessibility** — `n/a — no UI surface`
- [ ] **Edge cases** — `Sensitive-data hygiene IS the load-bearing edge case (AC 4 anti-echo test); transport-failure path emits status: 0 trace (AC 5); defensive try/catch ensures emit never breaks the request path (AC 4)`
- [ ] **Cross-surface consistency** — `n/a — single surface (server-only library)`

Five categories explicitly `n/a` with reason per CB-2.1's precedent; Edge cases non-`n/a` (sensitive-data hygiene + fail-safe emit + transport-failure trace). Standard Experience Checklist gate satisfied.

## Tech notes

### Brief + sibling-story references

- [CB-2 brief § In scope](../../brief.md#in-scope) — names `trace.ts` with the "structured-log breadcrumb helper" framing. The brief was written assuming Sentry would land alongside; this story defers Sentry SDK install per Engineer DRI Decision #3 option (a) recommendation.
- [CB-2 brief § key_metric](../../brief.md) — "Wrapper API success rate" is measurable from the structured logs once trace.ts ships, WITHIN the constraints of the chosen log sink. brief's source field was amended 2026-06-08 to reflect Vercel Pro's 1-day retention; the brief's target 30-day-rolling-window is aspirational until operator picks Observability Plus / Sentry / DB persistence. trace.ts emits the data shape; downstream sink is the retention question.
- [CB-2 brief PM Risk #2 (Coinbase rate-limit headers may not be returned)](../../brief.md#risks) — this story's AC 6 RESOLVES the open question empirically by inspecting what Coinbase actually returns.
- [CB-2 brief Researcher Open Question #1 (rate-limit headers)](../../brief.md#open-questions-for-researcher) — RESOLVES at AC 6 ship.
- [CB-2 brief Researcher Open Question #3 (CDP JWT rotation behavior of the direct path)](../../brief.md#open-questions-for-researcher) — RESOLVES via Engineer code-review at first commit: jwt.ts mints a fresh JWT per request from `env()` values, so env-var updates are picked up on the next request automatically (no process-restart needed). Documented as Engineer DRI Decision #5.
- [CB-2.4 story](../CB-2.4/story.md) — sensitive-data anti-echo pattern; trace.ts inherits the same posture (envelope-only data; no body content in logs).
- [`lib/coinbase/client.ts`](../../../../lib/coinbase/client.ts) — `handleResponse` is the integration point. Mod is small + additive + LIVE_MODE-free.

### Sentry SDK install — out of scope

@sentry/nextjs install + configuration is OUT of CB-2.5 scope per operator confirmation 2026-06-08. The structured-log approach satisfies the key_metric DATA SHAPE; the 30-day retention question is the separate downstream-sink decision (see brief key_metric.source caveat). Sentry can be wired in a follow-up `/ops` PR if/when rich error tracking + breadcrumb-chained traces become load-bearing for CB-4's bot-tick observability OR when the 30-day metric becomes load-bearing for a check-in.

If the operator wants Sentry sooner: a future `/ops` PR adds `@sentry/nextjs`, runs `npx @sentry/wizard`, and amends `trace.ts` to call `Sentry.addBreadcrumb` alongside the existing console.log. The trace.emit shape from this story is forward-compatible.

### What this story explicitly does NOT do

- Sentry SDK install + configuration (deferred to follow-up `/ops` PR if needed)
- Persistent metric calculation — Vercel runtime logs are the source-of-truth; success-rate metric is a Vercel dashboard query or a separate `/measure` workflow
- Custom dashboard for the wrapper observability (CB-5's territory — dashboard bet)
- Retry/backoff on 429 — out of CB-2 brief scope; consumer (CB-4) decides retry policy based on the 429 surface
- Sampling — every request gets a trace; current request volume (~96 ticks/day per the operator's earlier note) doesn't warrant sampling

## PRs

_Auto-populated as PRs open._

## Tests

- `tests/lib/coinbase/trace.test.ts` — `regression: true, e2e: false`
- `tests/lib/coinbase/trace.integration.test.ts` — `regression: false, e2e: false` (operator-gated)
- Modifications to `tests/lib/coinbase/client.test.ts` for the trace-integration verification

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `docs/bets/CB-2/stories/CB-2.5/fixes/`._

## DRI Log

### Decisions

_To be filled by Engineer at first PR commit. Required entries:_

1. **Trace emission destination** (per AC 1 + AC 3) — recommend structured `console.log` (Vercel runtime log collection) only; Sentry SDK install deferred to a follow-up `/ops` PR.
2. **client.ts integration point** (per AC 2) — modify `handleResponse` to wrap with timing + headers extraction; call `emitRequestTrace` from inside; never throws.
3. **Rate-limit header name attempts** (per AC 2 + AC 6) — defensive: try `X-RateLimit-Remaining`, `RateLimit-Remaining`, lowercase variants. Coinbase docs are ambiguous on whether these are present; let the response decide. Engineer documents the observed names in the commit + AC 6 test output.
4. **Bundle size impact** (per AC 7) — trace.ts adds ~3-5 KB to `lib/coinbase/`; total stays under 100K soft alarm.
5. **CDP JWT rotation behavior (Researcher #3) resolution** (per Tech notes) — code-review confirms `jwt.ts:mintJWT` reads `env().COINBASE_API_KEY_NAME` + `COINBASE_API_PRIVATE_KEY` on EVERY request (not cached at module load). Mid-request key rotation: not possible (a single request uses the key that was active when `mintJWT` ran). Inter-request rotation: WORKS — next request picks up the new env values automatically. **No process-restart needed.** Documented inline in the JWT module's JSDoc.
6. **Sensitive-data hygiene** (per AC 4) — trace emit includes ONLY envelope metadata (method, path, status, duration, rate-limit headers). No request body, no response body. Anti-echo test verifies.

### Risks

- [2026-06-08] [PM] **Modifying client.ts could introduce regressions in the request path** — CB-2.5 is the first story to modify client.ts since CB-2.1
  - **Likelihood (required):** low (the mod is small + additive: 4 new lines around handleResponse + a new import; existing test coverage on client.ts is dense — 28 tests in client.test.ts catch any regression)
  - **Impact (required):** medium (would affect both `request` and `publicRequest`, which means every consumer of `lib/coinbase/*`)
  - **Mitigation (required):** all existing client.test.ts tests must still pass; AC 5 adds 2-3 new tests verifying the trace-integration; Codex code review catches anything subtle; live integration tests for all 4 CB-2.x prior stories re-run as smoke
  - **Area (required, tag):** technical / refactor-risk

- [2026-06-08] [PM] **Rate-limit-header empirical discovery may produce a follow-up** — if Coinbase returns headers but with non-obvious names (e.g., `cb-ratelimit-...`), the defensive case-insensitive lookup might miss them
  - **Likelihood (required):** medium (Coinbase docs are ambiguous; non-obvious naming is possible)
  - **Impact (required):** low (worst case: AC 6's integration test reports "headers not found" → Researcher #1 RESOLVES as "absent or non-standard"; CB-2.5 ships anyway; CB-4 / future ops PR can add the discovered header names if found later)
  - **Mitigation (required):** AC 6's integration test logs ALL response headers (not just the ones we try) so we can see what Coinbase actually returns and add the missing names as a follow-up `/fix` PR
  - **Area (required, tag):** observability / discovery

- [2026-06-08] [PM] **console.log emission could be lost on serverless cold starts** — Vercel's log collection has caveats around buffered writes
  - **Likelihood (required):** low (Vercel docs confirm console.log is reliably collected for the duration of a function invocation)
  - **Impact (required):** low-to-medium (would skew the success-rate metric calculation by a small fraction; metric is a 30-day rolling window so single-request loss is negligible)
  - **Mitigation (required):** if the metric proves unreliable in production observation, follow-up `/ops` PR installs Sentry SDK which has more robust delivery semantics. CB-2.5 ships the structured-log baseline; richer integration is incremental.
  - **Area (required, tag):** observability / delivery-reliability

- [2026-06-08] [PM] **30-day key_metric retention gap** — Vercel Pro retains runtime logs for 1 day; brief's "30-day rolling window" target requires a longer-retention sink
  - **Likelihood (required):** certain (this is the current Vercel Pro plan retention; not contingent on anything that might change)
  - **Impact (required):** low at MVP time (the bet's check-in cadence is weekly, not daily-over-30-days; a 1-day window still surfaces immediate health). Becomes medium-impact if the operator wants to compute a true 30-day rolling window for trend analysis or external reporting.
  - **Mitigation (required):** brief amended 2026-06-08 to mark the 30-day window as ASPIRATIONAL. Operator-decided forward path: (a) Vercel Observability Plus upgrade (out-of-band paid tier), (b) Sentry SDK install in a follow-up `/ops` PR (also adds richer breadcrumb-chained traces), or (c) DB persistence layer (`wrapper_traces` table; future story; full operator control over retention + queryability). trace.ts's emit shape is forward-compatible with all three. Until a path is chosen, the metric is measurable over a 1-day window from Vercel runtime logs (sufficient for weekly check-ins).
  - **Area (required, tag):** observability / retention / out-of-band-decision
  - **Surfaced by:** Codex PR #40 round-1 BLOCKER review

### Issues

_None at story-creation time. Researcher Open Questions #1 + #3 resolve at AC 6 + Decision #5 respectively._

---

_Story closed: <pending>, brief link: docs/bets/CB-2/brief.md_

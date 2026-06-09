---
id: CB-3.0
bet: CB-3
type: story
status: shipped
shipped: 2026-06-08
priority: P0
created: 2026-06-08
author: PM
design_link: n/a — pure library code; no UI surface
area_tags: [strategy, lib, pluggability, foundation, types, validation, zod]
dependencies:
  - CB-3 brief approved 2026-06-08
  - CB-3 architecture artifact approved 2026-06-08
estimate:
  effort: small
  confidence: high
e2e: false
---

# CB-3.0 — `lib/strategy-core/` foundation (pluggability primitive)

## Description

Ship the portable, asset-class-agnostic strategy core that all of CB-3 (and future asset adapters in other operator apps) build on. This is the **first story of CB-3** and the load-bearing one for the pluggable pivot per [CB-3 brief PM DRI Decision #6](../../brief.md#decisions): if the abstraction here is right, CB-3.1 → CB-3.4 are direct materializations against it; if it's wrong, every downstream story has to re-litigate the design.

Per [bet architecture Decision #1](../../architecture.md#1-libstrategy-core-is-a-portable-module-boundary), `lib/strategy-core/` has **zero dependencies on Coinbase-specific code or any in-repo singletons** (no `lib/coinbase/*` imports; no `lib/env/*` reads; no DB reads). Exports types + interfaces + pure functions only. This is the architectural invariant that makes future extraction to `@vc1023/strategy-core` (npm package) a half-day job — same pattern as [`@vc1023/passkey-2fa`](https://www.npmjs.com/package/@vc1023/passkey-2fa), but the lesson applied at brief-approval time instead of post-ship.

No DB writes; no live Coinbase calls; no UI. Pure functions + interface definitions + Zod schemas + unit tests. Includes a **mock equity adapter in tests** to prove the abstraction holds across asset classes (this is the load-bearing test that the seam is honest, not Coinbase-shaped).

## Acceptance Criteria

- [ ] **AC 1** — `lib/strategy-core/types.ts` exports `Strategy`, `Asset` (`{assetClass: AssetClass, identifier: string}`), `AssetClass` (string union), `EntryRules`, `ExitRules` — all as Zod schemas + inferred TS types. No import from `lib/coinbase/*`, `lib/env/*`, `lib/db/*`. Zod schemas must roundtrip cleanly (parse a valid input → re-stringify → re-parse → equal).
- [ ] **AC 2** — `lib/strategy-core/adapter.ts` exports the `AssetAdapter` interface verbatim per [bet architecture Decision #2](../../architecture.md#2-assetadapter-interface--the-seam-where-asset-classes-plug-in): `assetClass`, `getCandidateAssets()`, `rankByVolume(assets)`, `getAssetIdentifier(asset)`. Interface only — no implementations in this story.
- [ ] **AC 3** — `lib/strategy-core/validate.ts` exports `validateStrategyPayload(input)` (pure function; no I/O) that enforces ALL the documented universal rules: RSI thresholds in `[0, 100]`; MA periods in `{5, 10, 20, 50}`; entry RSI < exit RSI; `position_size_usd > 0`; `per_session_buy_count_cap > 0`; `per_session_dollar_cap > 0`; selected assets count in `[1, 5]`. Returns a discriminated-union result (`{ok: true, value}` or `{ok: false, errors: [...]}`). Every false-path has its own error code.
- [ ] **AC 4** — `lib/strategy-core/supersession.ts` exports pure-function versioning helpers per [bet architecture Decision #4](../../architecture.md#4-strategies-db-schema-overrides-foundations-strategies-placeholder-mention): takes `{oldStrategyId, newPayload}` → emits `{newRow: Strategy, oldRowSupersessionUpdate: {id, superseded_by_strategy_id}}`. DB-agnostic; caller wires the actual `INSERT` / `UPDATE`. Includes a function that asserts append-only semantics (rejecting any caller request to "update strategy content").
- [ ] **AC 5** — `lib/strategy-core/top-n.ts` exports `topN(adapter: AssetAdapter, n: number): Promise<Asset[]>`. Generic ranking; calls `adapter.getCandidateAssets()` then `adapter.rankByVolume()`, slices to top-N. Asset-class-agnostic.
- [ ] **AC 6** — `lib/strategy-core/form-schema.ts` exports a Zod schema for the strategy authoring form payload (name + selected_assets + entry_rules + exit_rules + position_size_usd + caps). Consumes types from `types.ts`; no duplicate type definitions.
- [ ] **AC 7** — **Architectural invariant test**: A new vitest test imports every file in `lib/strategy-core/` and asserts the bundle has no transitive references to `@/lib/coinbase`, `@/lib/env`, or `@/lib/db`. This is the test that proves extraction-readiness; failing it means the abstraction leaked. Implementation: walk the resolved module graph via vitest's import; assert no module spec matches the forbidden prefixes.
- [ ] **AC 8** — **Mock equity adapter test**: `tests/lib/strategy-core/mock-equity-adapter.test.ts` defines a fake `AssetAdapter` for asset class `"equity-mock"` (no real broker calls; returns 8 fixture tickers), then runs `topN()` against it and asserts ranking + structure. This is the test that proves the seam is honest — the abstraction works for a class OTHER than Coinbase even when no equity broker library exists yet.
- [ ] **AC 9** — Unit tests for every exported function (target: ~25-30 unit tests):
  - types.ts: Zod roundtrip × each exported schema (≥ 5 tests)
  - validate.ts: every rule branch true-path + every rule branch false-path (≥ 14 tests for 7 rules × 2 paths)
  - supersession.ts: happy path supersession + append-only assertion rejection + null-oldStrategyId case (3 tests)
  - top-n.ts: rank + slice + adapter interaction (≥ 3 tests; uses mock adapter from AC 8)
  - form-schema.ts: roundtrip via the form payload shape (≥ 2 tests)
- [ ] **AC 10** — Gates: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all pass. Test count goes ~395 → ~425 (+25-30). `lib/strategy-core/` source size under 5K LOC (well under the 100K bundle alarm at the lib level).

## Standard Experience Checklist

CB-3.0 is pure library code (server-only; no UI surface). Most categories are `n/a` — but listing them all per the workflow gate.

- [ ] **Navigation** — `n/a — no UI surface in this story; lib/strategy-core/ exports types + pure functions consumed by CB-3.3 form UI in a later story.`
- [ ] **States** — `n/a — pure functions return discriminated-union results (validate.ts) or throw / reject (top-n.ts via async). No UI loading/empty/error states ship in this story; those are CB-3.3 concerns.`
- [ ] **Feedback** — `covered by AC 3 — validate.ts returns {ok: false, errors: [...]} with every false-path mapped to a distinct error code that the future form UI (CB-3.3) translates to inline-error display. No success/destructive UI feedback ships in this story.`
- [ ] **Accessibility** — `n/a — no rendered UI in this story; accessibility surfaces at CB-3.3 form UI (Playwright e2e + standard a11y attrs).`
- [ ] **Edge cases** — `covered by AC 7 + AC 9 — architectural invariant test (proves no coupling leak) + every rule false-path tested in validate.ts (covers the validation edge cases this story owns). Offline / slow-network / permissions-denied are CB-3.3 form UI concerns.`
- [ ] **Cross-surface consistency** — `covered by AC 8 — mock equity adapter test proves the AssetAdapter interface works ACROSS asset classes (crypto-coinbase in CB-3.1; equity-mock in this story's tests). The cross-surface dimension here is asset-class portability, not UI multi-target.`

## Tech notes

Engineer DRI Decisions for CB-3.0 are scoped per [bet architecture decisions](../../architecture.md#decisions) — Engineer commits at first build commit:

1. **Zod schema shape for `Strategy`** — match the DB column shape from bet architecture Decision #4 exactly (id: text; asset_class: text; selected_assets: jsonb shape; entry_rules: jsonb shape; etc.). Use Zod's `.brand()` for ULID type alias (`type StrategyId = z.infer<typeof StrategyIdSchema>`) to surface accidental string mixing at the type level. Recommend Engineer commit this at first commit.
2. **`AssetClass` enum shape** — Zod `z.enum(["crypto-coinbase", "equity-broker"])` vs `z.string()`. Recommend `z.string()` at this story (open-ended; future adapters add their own class strings without re-publishing strategy-core), but Engineer can flip to `z.enum()` if convinced the closed-set discipline is more important than future-asset-class extensibility. Commit as Engineer DRI Decision.
3. **MA period validation** — bet architecture says `{5, 10, 20, 50}`. Recommend Zod `z.union([z.literal(5), z.literal(10), z.literal(20), z.literal(50)])` for the strict-set semantics. Alternative: `z.number().int().refine(n => [5,10,20,50].includes(n))`. Pick at Engineer time.
4. **Architectural invariant test implementation** — AC 7 requires a test that walks the module graph. Options: (a) vitest static import + manual recursion; (b) lightweight regex grep of source files; (c) madge / dependency-cruiser. Recommend (a) for keeping zero-extra-dependency; Engineer commits the chosen path as Decision #4 if other.
5. **Mock equity adapter location** — `tests/lib/strategy-core/mock-equity-adapter.test.ts` keeps the mock co-located with the test that uses it. Alternative: extract to `tests/lib/strategy-core/_fixtures/equity-mock-adapter.ts` for reuse if CB-3.3+ wants the same fixture in form UI tests. Engineer DRI at build time.
6. **No LIVE_MODE reads** — verified by `tests/lib/coinbase/no-live-mode.test.ts` pattern (existing CB-2 invariant test; auto-scans new directories). Confirm at build time that `lib/strategy-core/` is in scope of that test (or extend the test if needed).

**Important — what this story does NOT include:**

- `lib/strategy-coinbase/` adapter implementation → CB-3.1 (next story)
- `strategies` DB schema + migration → CB-3.2
- Form UI + save action + first Playwright e2e → CB-3.3
- `bot_sessions.active_strategy_id` activation wiring → CB-3.4

**Why this story is FIRST:** CB-3.1+ all depend on the types + interface from this story. Shipping in this order means CB-3.1 can immediately consume `AssetAdapter` from strategy-core; CB-3.2 can reuse the Zod types from strategy-core (no duplicate type definitions); CB-3.3 can import the form-schema directly. Reversing the order would force every downstream story to redefine types, then refactor.

## DRI Log

### Decisions

- [2026-06-08] [PM] **CB-3.0 ships ZERO Coinbase coupling — the architectural invariant test is load-bearing**
  - **Rationale (required):** Bet architecture Decision #1 says `lib/strategy-core/` has no `lib/coinbase/*` imports. Without an automated test (AC 7), this invariant rots: a future story slips in an import "just for convenience," then extraction to `@vc1023/strategy-core` becomes a multi-day surgery instead of a half-day find/replace. AC 7 is the test that protects the extraction path.
  - **Area (required, tag):** architecture / extraction-readiness / invariant-enforcement
  - **Alternatives considered (required):** drop the test, rely on convention (rejected — `@vc1023/passkey-2fa` precedent shows conventions decay without automated enforcement); manual grep at CI level (rejected — test belongs with the code, not with the CI YAML); add only as a comment (rejected — Codex correctly catches "widening" patterns without enforcement)
  - **Reversibility:** trivial — remove the test if the invariant is ever explicitly relaxed (it won't be without a brief amendment)

- [2026-06-08] [PM] **Mock equity adapter test is mandatory at CB-3.0 (NOT deferred to CB-3.1)**
  - **Rationale (required):** The mock equity adapter test (AC 8) proves the abstraction holds for a non-Coinbase asset class. If we ship strategy-core in CB-3.0 without this test, then write the real Coinbase adapter in CB-3.1, we won't actually know the abstraction is honest until the equity app tries to consume the extracted package — which is exactly the "build twice, learn pain later" pattern the brief's Decision #6 calls out as anti-pattern. Test it NOW with a fake equity adapter; prove the seam works; only then ship the crypto adapter (CB-3.1) and downstream stories.
  - **Area (required, tag):** test-discipline / extraction-readiness
  - **Alternatives considered (required):** defer to CB-3.1 (rejected — too late; would only verify the abstraction with a real crypto adapter, leaving equity-shape unprobed); skip entirely (rejected — same anti-pattern as build-twice); use a more elaborate fixture (deferred — single mock adapter with 8 fixture tickers is sufficient to prove the seam)
  - **Reversibility:** if equity adapter never lands, the mock fixture stays as documentation of the contract

### Risks

- [2026-06-08] [PM] **Architectural invariant test (AC 7) is harder to implement than it sounds — module graph walking has edge cases**
  - **Likelihood (required):** medium (vitest doesn't expose its module graph directly; resolver behavior under path aliases like `@/` requires care)
  - **Impact (required):** low (failing this AC delays the story by hours, not days — Engineer can iterate quickly; fallback to source-text grep via Bash isn't great but works)
  - **Mitigation (required):** Engineer DRI Decision #4 in Tech notes lists 3 implementation options; recommend manual recursion at first attempt; if that's too brittle, fall back to dependency-cruiser as a dev-only dependency.
  - **Area (required, tag):** test-tooling

- [2026-06-08] [PM] **Zod schema shapes that diverge from foundation conventions may need iteration**
  - **Likelihood (required):** low (foundation architecture's append-only data model is well-defined; CB-3 architecture decision #4's DDL is the contract)
  - **Impact (required):** low-to-medium (a schema rework means a small Zod refactor; doesn't break anything else)
  - **Mitigation (required):** Engineer reviews the Zod schemas against the DDL at first commit; PR review catches any drift; CB-3.2 (DB schema story) re-verifies alignment.
  - **Area (required, tag):** schema-design

### Issues

_None at story creation. Engineer adds as discovered during /build._

## Tests

_Engineer writes unit tests co-located with code at `tests/lib/strategy-core/*.test.ts`. Expected count: ~25-30 unit tests + 1 architectural invariant test (AC 7) + 1 mock equity adapter test (AC 8) = ~27-32 total new tests. Test suite goes ~395 → ~425._

_No integration tests in this story — no live Coinbase, no DB._

## PRs

- [PR #45](https://github.com/vivekschaudhary/crypto-bot/pull/45) — `feat(CB-3.0): lib/strategy-core/ foundation — types + AssetAdapter + validation + supersession + top-N (FIRST CB-3 STORY)`. Squash-merged 2026-06-08 (commit `4a31bb7`). **3 review rounds** — round-1: 2 BLOCKERs (camelCase vs snake_case shape; supersession contract `superseed → supersede` + `newRow → newPayload` + snake_case output) + 1 ISSUE (no-coupling regex-only → strengthened to transitive walk per AC 7); round-2: 2 BLOCKERs (convention split refined — top-level snake_case + inner jsonb camelCase; `validateStrategyPayload` permissive input schema so named error codes actually fire per AC 3); round-3: 1 BLOCKER (`created_at: z.date()` → `z.coerce.date()` for clean JSON roundtrip per AC 1). Codex security review clean. 53 unit tests + bundle 40K. Squash-race streak: 1 PR clean post-restoration.

---

_Story closed: 2026-06-08 (via PR #45 squash merge commit `4a31bb7`), brief link: docs/bets/CB-3/brief.md, architecture link: docs/bets/CB-3/architecture.md_

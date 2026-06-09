---
id: CB-3.3
bet: CB-3
type: story
status: ready
priority: P0
created: 2026-06-08
author: PM
design_link: docs/bets/CB-3/stories/CB-3.3/design.md
area_tags: [strategy, ui, form, dashboard, server-action, supersession, activation, e2e, accessibility]
dependencies:
  - CB-3 brief approved 2026-06-08
  - CB-3 architecture artifact approved 2026-06-08
  - CB-3.0 shipped 2026-06-08 (provides StrategySchema, validateStrategyPayload, supersede, topN, StrategyFormPayloadSchema, AssetAdapter interface)
  - CB-3.1 shipped 2026-06-08 (provides makeCoinbaseAdapter — the wired adapter at the route layer)
  - CB-3.2 shipped 2026-06-08 (provides strategies table + bot_sessions.active_strategy_id FK)
  - CB-1.4 shipped 2026-06-01 (provides proxy.ts auth gate that protects /dashboard/*)
  - CB-1.6 shipped 2026-06-04 (provides /dashboard scaffold + sign-out client pattern + Playwright virtual-authenticator e2e pattern)
estimate:
  effort: medium
  confidence: medium
e2e: true
---

# CB-3.3 — Strategy authoring form UI + save action + activation (folds CB-3.4) + first Playwright e2e since CB-1.6

## Description

Ship the operator-facing strategy authoring surface — `/dashboard/strategy` Server Component shell + generic Client Component form (over `AssetAdapter` prop) + server action that validates, persists, supersedes the prior active strategy, and points `bot_sessions.active_strategy_id` at the new row. The first UI surface in CB-3 + the first Playwright e2e since CB-1.6 (2026-06-04). After this story ships, the operator can author a named DCA strategy in <5 min on first attempt and CB-4's bot tick has a typed Zod-validated row to read.

**Folds CB-3.4** (activation wiring) per PM Decision below. Per [bet architecture Decision #6](../../architecture.md#6-form-architecture--server-component-shell--client-component-generic-form): `saveStrategy` already does THREE things in one server action — validate via `lib/strategy-core/validate`; INSERT via supersession; **UPDATE `bot_sessions.active_strategy_id`**. The single-active-per-session model from [brief PM Decision #2](../../brief.md#decisions) means save = activate; there is no separate "draft then activate" step. CB-3 collapses 5 → 4 stories at this drafting.

**Closes the operator's core authoring loop.** Per [brief Hypothesis](../../brief.md#hypothesis-the-bet): "the operator can author + persist a valid strategy within 5 minutes on first attempt; CB-4 can read it as a typed Zod-validated row on every tick; and the 'create a strategy' clause of the MVP loop is delivered." CB-3.3 is the story where that hypothesis ships.

**Heavy Standard Experience Checklist load** — 5 of 6 categories load-bearing (not `n/a`); first UI re-engagement after 4 lib-only stories (.0/.1/.2 + CB-2's library stack). Per [brief PM Risk #1](../../brief.md#risks): AC explicitly requires a Playwright e2e covering the operator's golden path. Static mocks alone are not sufficient — CB-1.6 surfaced 2 production bugs with Playwright that static tests missed.

## Acceptance Criteria

- [ ] **AC 1 — Route + auth gate.** `app/dashboard/strategy/page.tsx` Server Component renders only for authenticated sessions. Unauthenticated GET → 302 to `/sign-in?next=%2Fdashboard%2Fstrategy` per CB-1.4's `proxy.ts` redirect pattern (the proxy already gates `/dashboard/*` paths; route inherits without per-route auth code). Authenticated GET renders the form shell.

- [ ] **AC 2 — Server Component shell.** `page.tsx` fetches the operator's current active strategy (if any) via `lib/strategies/db.ts:getActiveStrategy(userId)`; resolves the top-5 candidate assets via `topN(makeCoinbaseAdapter(), 5)`; passes BOTH as initial state props to `_form.tsx`. First-time authoring (no active strategy) → form renders with the top-5 pre-fill + blank rules + sensible numeric defaults. Revising → form renders with the current active strategy pre-filled (selected_assets, entry_rules, exit_rules, position_size_usd, caps).

- [ ] **AC 3 — Generic form over asset-class primitives (amended PR #50; was: `AssetAdapter` prop).** `_form.tsx` is a Client Component that accepts `assetClass: AssetClass` + `candidates: Asset[]` + the resolved initial payload — NOT the adapter object itself. Renders asset-class-agnostic field sections (Name → Asset Selector → Entry Rules → Exit Rules → Caps → Submit/Cancel). The form itself does NOT import from `@/lib/strategy-coinbase/*` — the concrete `makeCoinbaseAdapter()` is invoked at the route layer (`page.tsx`) and its results are passed as primitives. **Amendment 2026-06-09 during PR #50** (post-merge defect fix): the originally approved contract was `adapter: AssetAdapter`, but production runtime revealed that React Server Components cannot serialize regular function methods across the RSC boundary — only Server Actions can cross. Passing the adapter object caused three `E{digest:...}` broken-reference errors at runtime (one per `AssetAdapter` method); local `pnpm dev` + `pnpm build` were too lenient to catch it. The fix preserves the architectural intent of AC 3 (asset-class portability + no Coinbase coupling in the form) at the boundary level: the Server Component materializes adapter-derived data into primitives before crossing the RSC boundary. CB-3.0's mock equity adapter test + CB-3.1's real adapter still prove the abstraction holds at the strategy-core level; the form-level abstraction is now over asset-class primitives, not the adapter object.

- [ ] **AC 4 — Asset selector (top-5 pre-fill + cardinality [1, 5]).** `_selector.tsx` Client Component wraps the multi-select. Initial selection = top-5 from server-rendered props (AC 2). Operator can REMOVE any pre-filled asset (cardinality may drop to 1) and ADD other assets from the full candidate set (cardinality may rise back up to 5). Cardinality outside `[1, 5]` blocks submit + surfaces inline-error per [`StrategyFormPayloadSchema`](../../../../../lib/strategy-core/form-schema.ts) + maps to `SELECTED_ASSETS_COUNT_OUT_OF_RANGE` error code from CB-3.0's `validate.ts`.

- [ ] **AC 5 — Inline validation per field, mapped from `VALIDATION_ERROR_CODES`.** Every false-path code from CB-3.0's `validate.ts` surfaces as a per-field inline error (rendered below the input via `aria-describedby`):
  - `ENTRY_RSI_OUT_OF_RANGE` → below entry_rules.rsiThreshold input
  - `EXIT_RSI_OUT_OF_RANGE` → below exit_rules.rsiThreshold input
  - `MA_PERIOD_INVALID` → below entry_rules.maPeriod select
  - `ENTRY_RSI_NOT_LESS_THAN_EXIT_RSI` → below entry_rules.rsiThreshold input (cross-field error attaches to the entry field per UX convention)
  - `POSITION_SIZE_USD_NOT_POSITIVE` → below position_size_usd input
  - `PER_SESSION_BUY_COUNT_CAP_NOT_POSITIVE` → below per_session_buy_count_cap input
  - `PER_SESSION_DOLLAR_CAP_NOT_POSITIVE` → below per_session_dollar_cap input
  - `SELECTED_ASSETS_COUNT_OUT_OF_RANGE` → below the selector
  - `SHAPE_INVALID` → top-of-form error banner (catch-all for type-level malformedness; rare)
  Submit button disabled while any inline error is active.

- [ ] **AC 6 — Save action: validate + INSERT + supersession + bot_session UPSERT + structured log.** `saveStrategy(formData)` server action (`"use server"` directive; per architecture Decision #6 — NOT a separate API route):
  1. Parses formData → `StrategyFormPayload` via `StrategyFormPayloadSchema.safeParse` (form-schema.ts shape validation)
  2. Runs `validateStrategyPayload(payload)` (validate.ts rule branches) → if `{ok: false}`, returns `{success: false, errors: ValidationError[]}` for the form to render inline
  3. Resolves the authenticated `userId` via the established CB-1.4 session helper (`verifySession()` or equivalent — Engineer DRI Decision at build)
  4. Generates new strategy ULID via `ulidx`
  5. Calls `supersede({oldStrategyId: payload.supersedes_strategy_id, newPayload: {...}})` from CB-3.0
  6. INSERTs the new strategy row via `lib/strategies/db.ts:insertStrategy(newRow)` — folds CB-3.4's data layer
  7. If `oldRowSupersessionUpdate` is non-null, UPDATEs the prior row via `lib/strategies/db.ts:markSuperseded(oldId, newId)`
  8. UPSERTs the singleton bot_session row + sets `active_strategy_id` to new id via `lib/strategies/db.ts:upsertSingletonBotSession(userId, newId)` — folds CB-3.4's activation wiring
  9. Emits a structured-JSON `console.log` per CB-3 architecture Decision #7: `{event: "strategy.save", success: true, asset_class, strategy_id_new, strategy_id_superseded?}`. On validation failure: `{event: "strategy.save", success: false, asset_class, validation_errors: [error_codes]}`
  10. On success → `redirect("/dashboard?strategy=saved")` (success state surfaces via dashboard query param)

- [ ] **AC 7 — Navigation (Standard Experience · Navigation).** Cancel button → `/dashboard`. Browser back navigation when form is dirty → `window.confirm("Discard unsaved changes?")` (`beforeunload` listener fires; deny stays on form). When form is pristine → back nav transitions silently. Visible back-link in form header → `/dashboard`. NO modal trap.

- [ ] **AC 8 — States (Standard Experience · States).**
  - **Loading**: top-5 fetch is server-rendered (no client waterfall) so by the time `_form.tsx` mounts, the selector has options. The visible "loading" state is the submit button while a save is in flight (button text "Saving…" + spinner + `disabled`).
  - **Empty**: first-time operator (no active strategy) → form renders with top-5 pre-fill + numeric defaults (entry RSI 30, exit RSI 70, MA period 20, position size 50 USD, buy count cap 10, dollar cap 500) — chosen by Designer; documented in design.md.
  - **Error**: save failed → top-of-form error banner discriminates type (network / validation / server / unknown) via copy.md strings.
  - **Success**: save succeeded → server-side redirect to `/dashboard?strategy=saved` → success toast renders on /dashboard.
  - **Disabled**: submit disabled while form is invalid OR save pending.

- [ ] **AC 9 — Feedback (Standard Experience · Feedback).**
  - Error toast / banner discriminates between **network** ("Save failed. Check your connection."), **validation** ("Some fields need attention. See errors above."), **server** ("Save failed on the server. Try again."), and **unknown** ("Unexpected error. Try again or reload.") — copy strings live in copy.md.
  - Inline per-field errors render BELOW each input with red-toned styling (per design.md).
  - **Destructive supersession confirmation**: when operator revises an existing active strategy (form is in revise mode), submit triggers a confirmation modal: "Revise strategy? The current version will be archived but stays queryable for the dashboard. Continue / Cancel."
  - Success acknowledgment: post-save redirect surfaces a success toast on /dashboard ("Strategy saved. Bot will pick it up on the next tick.").

- [ ] **AC 10 — Accessibility (Standard Experience · Accessibility).**
  - **Focus management**: on form mount → focus on Name field. On submit-error → focus moves to the FIRST invalid field (programmatic focus per the `errors[].path` ordering). On success redirect → /dashboard's main heading receives focus (focus restoration pattern from CB-1.6 if available).
  - **Tab order**: top-to-bottom through Name → selector → entry rules → exit rules → position size → caps → submit → cancel.
  - **Keyboard**: Enter key inside any text input submits the form (HTML form default; document explicitly). Esc on confirmation modal dismisses.
  - **SR labels**: every input has `<label htmlFor>` linkage. Multi-select uses `aria-multiselectable` + `role="listbox"` (or native select element if simpler — Engineer DRI). Slider/number inputs use `aria-label` for screen reader context.
  - **`aria-invalid` + `aria-describedby`**: each input with an active inline error sets `aria-invalid="true"` and points `aria-describedby` at the error message element.

- [ ] **AC 11 — Edge cases (Standard Experience · Edge cases).**
  - **Slow network on top-5 fetch (Server Component render)**: page render blocks on the Coinbase call. Engineer DRI Decision: set a 10s timeout on the `getProducts()` call within `topN`; on timeout, render the form with an empty selector + a top-of-form notice ("Couldn't load top-5 — please retry."). Form is still functional (operator can manually add assets from a search field — out of MVP, defer to follow-up; for now timeout state is "form unavailable" with retry link to /dashboard).
  - **Offline at save time**: fetch fails → action throws → caught by Next.js → action returns `{success: false, error_type: "network"}` → toast renders. NO DB write.
  - **Concurrent supersession (operator saves twice rapidly)**: both saves succeed (last-write-wins on `bot_sessions.active_strategy_id`; both strategy rows are persisted; first's `superseded_by_strategy_id` may or may not be set depending on order, but the SECOND save is what the bot reads). Acceptable for single-operator MVP per [brief PM Risk: bot_session race](../../brief.md#risks).
  - **Top-5 churn between page load and save**: no special handling. Operator's selected_assets are persisted to the strategy row; bot acts on those selected_assets, NOT on "current top-5 at tick time."

- [ ] **AC 12 — Cross-surface consistency** — `n/a — single-target web only per compass/config.yaml canary_artifacts.kind: web. No mobile/native. The only multi-target dimension that applies in CB-3 is asset-class portability (covered by CB-3.0 invariant tests + CB-3.1's first real adapter + the AssetAdapter prop in AC 3), not UI surface multi-target.`

- [ ] **AC 13 — Playwright e2e (FIRST since CB-1.6 — load-bearing per brief PM Risk #1).** New file `e2e/dashboard/strategy.spec.ts` with TWO specs:
  - **Spec 1 (happy path)**: register operator via virtual-authenticator → sign in → navigate to `/dashboard/strategy` → assert the asset selector is pre-filled with 5 items → assert all default field values match design.md → fill in custom rule values → submit → assert redirect to `/dashboard?strategy=saved` + success toast → navigate BACK to `/dashboard/strategy` → assert form re-renders with the just-saved values (verifies persistence + active-strategy load round-trip).
  - **Spec 2 (supersession)**: complete Spec 1's authoring → revise the saved strategy with DIFFERENT rule values → submit (handles the destructive-confirm modal) → query the DB via the existing test helpers → assert there are TWO rows in `strategies`; the FIRST has `superseded_by_strategy_id` pointing at the SECOND; the SECOND has `superseded_by_strategy_id: null`; the bot_session's `active_strategy_id` points at the SECOND.
  - Both specs use the Playwright virtual-authenticator pattern from `e2e/auth/*.spec.ts` (CB-1.6). DB access via the existing serial-test helper (`workers: 1` per `playwright.config.ts`).
  - Codex writes the actual e2e files per the [reviewer role](../../../../../compass/roles/reviewer.md) (Engineer writes unit/component/API tests; Codex writes e2e).

- [ ] **AC 14 — Copy verbatim from copy.md.** Every user-facing string — labels, helper text, button text, error messages (one per `VALIDATION_ERROR_CODES`), success/error toast strings, confirmation modal copy, supersession-banner copy — sourced VERBATIM from [`docs/bets/CB-3/stories/CB-3.3/copy.md`](copy.md). UX Writer is the source of truth; Engineer does NOT paraphrase. Compass Engineer Forbidden item per [`compass/roles/engineer.md`](../../../../../compass/roles/engineer.md).

- [ ] **AC 15 — Gates: typecheck + lint + test + e2e + build all green.**
  - `pnpm typecheck`: zero errors
  - `pnpm lint`: zero warnings
  - `pnpm test`: ~473 → ~510 (+30-40 unit/component tests covering _form.tsx, _selector.tsx, _actions.ts, lib/strategies/db.ts with mocked postgres)
  - `pnpm e2e`: ~5 specs → ~6-7 specs (+1-2 new in `e2e/dashboard/strategy.spec.ts`)
  - `pnpm build`: green; dashboard route bundle increase < 50K (sanity check)
  - Vercel auto-deploy after merge applies any new migrations (none in this story — schema already shipped via CB-3.2's 0004)

## Standard Experience Checklist

CB-3.3 is **the first UI surface in CB-3** — 5 of 6 categories load-bearing (not `n/a`); only Cross-surface is `n/a` (single-target web). Each category below references the AC item that covers it.

- [ ] **Navigation** — `covered by AC 7 — cancel → /dashboard; browser back with dirty form → confirm("Discard unsaved changes?"); visible header back-link → /dashboard; no modal trap.`
- [ ] **States** — `covered by AC 8 — loading (submit-in-flight); empty (first-time operator with top-5 pre-fill + numeric defaults); error (4-way discriminated error banner); success (post-redirect success toast); disabled (submit while invalid OR pending).`
- [ ] **Feedback** — `covered by AC 9 — error toast discriminates network/validation/server/unknown; inline per-field errors mapped from VALIDATION_ERROR_CODES; destructive supersession confirms via modal; success acknowledgment on /dashboard.`
- [ ] **Accessibility** — `covered by AC 10 — focus on mount lands on Name field; focus on submit-error moves to first invalid field; tab order top-to-bottom; Enter key submits; SR labels on selector + rule inputs; aria-invalid + aria-describedby for inline errors.`
- [ ] **Edge cases** — `covered by AC 11 — slow-network/timeout on top-5 fetch (10s) → form unavailable + retry; offline at save → toast + no DB write; concurrent supersession → last-write-wins (acceptable for single-operator MVP); top-5 churn between page load and save → no special handling (selected_assets persisted to strategy row).`
- [ ] **Cross-surface consistency** — `n/a — single-target web only per compass/config.yaml canary_artifacts.kind: web. No mobile/native; the only multi-target dimension that applies in CB-3 is asset-class portability (covered by CB-3.0 invariant tests + CB-3.1 real adapter + AC 3's AssetAdapter-prop pattern), not UI surface multi-target.`

## Tech notes

The build materializes [bet architecture Decision #6](../../architecture.md#6-form-architecture--server-component-shell--client-component-generic-form) (form architecture) + [Decision #7](../../architecture.md#7-observability-shape) (observability) + Decisions #1-5 already shipped in .0/.1/.2.

**Reuses CB-3.0/.1/.2 contracts verbatim — NO new types:**
- `Strategy`, `Asset`, `EntryRules`, `ExitRules` from `lib/strategy-core/types.ts`
- `StrategyFormPayloadSchema` from `lib/strategy-core/form-schema.ts`
- `validateStrategyPayload` + `ValidationResult<T>` + `VALIDATION_ERROR_CODES` from `lib/strategy-core/validate.ts`
- `supersede` + `assertSupersessionOnlyUpdate` from `lib/strategy-core/supersession.ts`
- `topN` from `lib/strategy-core/top-n.ts`
- `makeCoinbaseAdapter` from `lib/strategy-coinbase/adapter.ts` (the concrete; wired at the route layer ONLY)
- `strategies` table + `bot_sessions.active_strategy_id` from migration 0004 (CB-3.2)

**Engineer DRI Decisions called out (Engineer commits at first build commit):**

1. **Form state management.** Plain React `useState` + form ref; no `react-hook-form` (single form, low complexity; library adds bundle weight without payoff). Engineer commits as Decision #1.

2. **`bot_session` singleton enforcement.** UPSERT via `INSERT ... ON CONFLICT (id) DO UPDATE SET active_strategy_id = EXCLUDED.active_strategy_id, updated_at = now()`. Singleton at app layer (single-operator → at most one row); DB-level uniqueness on `created_by_user_id` NOT enforced in this story (defer to CB-4 if multi-session ever surfaces). Document the singleton assumption in `lib/strategies/db.ts` JSDoc. Engineer commits as Decision #2. Alternative: dedicated session creation helper called from setup flow (rejected — adds an unrelated bootstrap step; UPSERT is simpler).

3. **ULID generation** via `ulidx` (already in `dependencies` per `package.json`), server-side in the save action. NOT client-side (clients can't be trusted to generate unique ids). Engineer commits as Decision #3.

4. **Form action vs API route.** Next.js Server Action (`"use server"`) per architecture Decision #6 — NOT a separate `app/api/strategies/route.ts`. Server Actions auto-handle CSRF + framework auth integration via cookies; matches CB-1.x's session model. Engineer commits as Decision #4.

5. **Top-5 fetch timing.** Server-side on initial render (no client waterfall); pre-fill is part of `page.tsx`'s initial state prop. A separate `fetchTopFive` server action is NOT in scope for this story (no "refresh top-5" affordance — operator can reload the page). Engineer commits as Decision #5.

6. **Error mapping.** Discriminated-union from server action: `{success: false, errors: ValidationError[]}` (uses CB-3.0's `ValidationError` type) → `_form.tsx` keys on `errors[].path` for inline per-field render. Top-of-form banner shows the discriminated error type from copy.md. Engineer commits as Decision #6.

7. **RSI period configuration — NOT in form, hardcoded RSI(14) in CB-4 bot tick.** Closes [Researcher Open Question #2](../../brief.md#open-questions-for-researcher). The `EntryRules` Zod type from CB-3.0 has NO `rsiPeriod` field — only `rsiThreshold`. RSI period is a CB-4 bot-tick concern; defaults to 14 per retail-trader convention. Engineer commits as Decision #7. PM Decision logged in brief.

8. **Cancel + unsaved-changes prompt.** `beforeunload` event listener fires when form is dirty (compare current state to initial-state-prop snapshot). Cancel button + back-link nav also confirms via `window.confirm`. Pattern reused from CB-1.6 if applicable (verify at build). Engineer commits as Decision #8.

### Patterns to mirror at `/build CB-3.3`

1. **Server Component + Client Component split** — pattern from CB-1.6's `/setup` + `/sign-in` (`app/setup/page.tsx` server + `app/setup/setup-client.tsx` client).
2. **Playwright virtual-authenticator** — pattern from `e2e/auth/*.spec.ts` (CB-1.6); Codex writes per role discipline.
3. **Server action with structured-log emit** — analog to CB-2.5's `lib/coinbase/trace.ts` structured-JSON `console.log` pattern.
4. **Discriminated-union validation result mapping** — CB-3.0's `ValidationResult<T>` is the contract; `_form.tsx` translates to inline UI.

### What this story does NOT include

- CB-5 dashboard surfaces (full bot state + decision-trace log) → separate bet
- Multi-asset-class form swap-adapter logic — generic shape via AC 3, but only crypto-coinbase wired at the route
- Strategy import/export → out-of-MVP per [portfolio § Deliberately out](../../../../foundation/portfolio.md)
- Strategy template library → out-of-MVP
- Multi-active strategies / switcher → deferred per brief PM Decision #2
- AI/ML signal config → explicitly OUT per [product.md](../../../../foundation/product.md)
- Auto-suggest strategy parameters from operator's trade history → deferred post-MVP
- "Refresh top-5" affordance (operator can reload the page; cheap)
- RSI period configurability in form (Engineer DRI Decision #7; hardcoded RSI(14) in CB-4)
- DB-level `bot_sessions` singleton uniqueness constraint (Engineer DRI Decision #2; deferred to CB-4 if multi-session surfaces)

### Why this story ships LAST in CB-3 (after .0/.1/.2)

CB-3.0 shipped the abstraction (interface + types). CB-3.1 shipped the first real implementation (crypto-coinbase adapter). CB-3.2 shipped the persistence substrate (strategies table + activation FK column). CB-3.3 is the UI that lights all three up — without it, the typed strategy exists but the operator can't author one. Reversing the order would require mocking the persistence layer in earlier UI work; the cumulative order ships maximum value with each PR.

## DRI Log

### Decisions

- [2026-06-08] [PM] **Fold CB-3.4 (activation wiring) into CB-3.3** — collapses CB-3 from 5 → 4 stories
  - **Rationale (required):** [Bet architecture Decision #6](../../architecture.md#6-form-architecture--server-component-shell--client-component-generic-form) already says the save action does THREE things — validate + supersession + activation. The single-active-per-session model from [brief PM Decision #2](../../brief.md#decisions) means save = activate; there is no separate "draft then activate" UI step at MVP. A standalone CB-3.4 would either be empty (architecture already covers it inside CB-3.3's save action) or an over-engineered re-litigation. The brief explicitly invited this fold call: "Maybe folded into CB-3.3 if scope is small enough; Engineer DRI Decision at /create-story time." Folding is the honest read of the architecture's contract.
  - **Area (required, tag):** scope / story-decomposition
  - **Alternatives considered (required):** ship CB-3.3 (form UI + INSERT + supersession only) + CB-3.4 (bot_session UPSERT + activation) as separate PRs (rejected — splits a single coherent server action across two stories; second PR would be ~15 lines; review-cycle overhead exceeds the value of the split); ship a 4-state state-machine model for strategy lifecycle (draft/active/superseded/archived; rejected — speculative scope for MVP single-active model)
  - **Reversibility:** trivial — if a separate "activate later" UX surfaces post-MVP (e.g., the operator wants to save drafts), `bot_sessions.active_strategy_id` can be updated by a future activation action without restructuring CB-3.3

- [2026-06-08] [PM] **Standard Experience Checklist 5/6 categories load-bearing (not `n/a`) — CB-3.3 is the first UI surface in CB-3**
  - **Rationale (required):** Per [brief PM Risk #1](../../brief.md#risks): "UI re-engagement context loss — 5 stories of pure library code → first UI surface in CB-3 has elevated bug risk." Marking categories `n/a` for a UI surface defeats the checklist's purpose. The single justifiable `n/a` is Cross-surface consistency (single-target web per canary_artifacts); every other category must have an AC line. CB-1.6 set this precedent (first UI surface in CB-1; Accessibility was first non-`n/a` category in the project's history).
  - **Area (required, tag):** ux / checklist-discipline
  - **Alternatives considered (required):** mark Accessibility `n/a` "to keep scope tight" (rejected — operator self-as-user posture doesn't excuse skipping a11y; defense-in-depth + future-second-user readiness); skip Feedback (rejected — error discrimination IS the operator's pain point per brief User pain input)
  - **Reversibility:** trivial — re-mark categories `n/a` if a downstream story explicitly absorbs the dimension

- [2026-06-08] [PM] **Playwright e2e is MANDATORY at this story (not deferred; not a follow-up)**
  - **Rationale (required):** [Brief PM Risk #1](../../brief.md#risks) explicitly names this: "AC for CB-3.3 form UI story MUST include at least one Playwright e2e covering the operator's golden path." CB-1.6's Playwright virtual-authenticator e2e (PR #17 AC 8) surfaced 2 production bugs that static mocks masked (`@simplewebauthn/browser@11` API drift + begin-response shape mismatch); same risk class applies to CB-3.3's form + save action against a real DB.
  - **Area (required, tag):** test-discipline / e2e
  - **Alternatives considered (required):** static-mock unit tests only (rejected — historical precedent shows mocks miss real integration drift); defer e2e to a follow-up story (rejected — the brief's risk mitigation requires it AT THIS STORY); just one happy-path spec (acceptable but suboptimal; AC 13 specifies TWO specs for supersession-FK coverage; if scope pressure mounts, Engineer DRI to drop to one spec at build time with PM consultation)
  - **Reversibility:** trivial — e2e can be amended post-merge if it surfaces brittleness

- [2026-06-08] [PM] **Top-5 pre-fill + operator override (vs hard-lock top-5)**
  - **Rationale (required):** Operator's intent per [brief Hypothesis](../../brief.md#hypothesis-the-bet) is "review coinbase data to highlight the top 5" — the algorithm SUGGESTS, the operator DECIDES. Hard-locking top-5 would defeat the operator's agency + Researcher Open Question #1 (top-5 churn) shows the set rotates. Pre-fill + override gives the operator a sensible starting point while preserving agency. Matches the operator's pre-CB-3 spreadsheet pattern.
  - **Area (required, tag):** ux / algorithm-vs-operator
  - **Alternatives considered (required):** hard-lock to top-5 (rejected — operator agency violation); blank selector with manual add-only (rejected — defeats the "review coinbase data to highlight" framing in product.md); ML-suggested top-5 (rejected — out of MVP per product.md DRI Decision)
  - **Reversibility:** trivial — UI rule change in `_selector.tsx`

- [2026-06-08] [PM] **Estimate effort=medium, confidence=medium**
  - **Rationale (required):** Larger surface than CB-3.0/.1/.2 (Server Component + 2 Client Components + server action + DB layer + 30-40 unit tests + 1-2 Playwright specs + design.md + copy.md). CB-2 velocity (~0.6 days/story) suggests ~1 day for this story; but UI re-engagement risk (PM Risk #1) makes confidence medium not high. Honest estimate range: 0.5-1.5 days.
  - **Area (required, tag):** scheduling / estimation
  - **Alternatives considered (required):** effort=small (rejected — surface area + e2e + first UI re-engagement exceeds small); confidence=high (rejected — UI complexity surfaces at build, not story creation; CB-1.6 review cycle was 3 rounds with 6 BLOCKERs)
  - **Reversibility:** trivial — refined at build close-out

### Risks

- [2026-06-08] [PM] **UI re-engagement context loss — 5 lib-only stories then first UI surface has elevated bug risk**
  - **Likelihood (required):** medium (precedent: CB-1.6 review cycle had 3 rounds + 6 BLOCKERs after the same 5-lib-stories gap)
  - **Impact (required):** medium (production UI bug blocks operator from completing the MVP loop)
  - **Mitigation (required):** AC 13 mandates Playwright e2e (load-bearing); design.md + copy.md ship alongside story.md (Engineer enters build with full surface spec); Standard Experience Checklist 5/6 load-bearing (not `n/a`); Codex review per usual discipline.
  - **Area (required, tag):** ui / regression-risk

- [2026-06-08] [PM] **3Commas form-fatigue replication — operator's specific pain point per brief**
  - **Likelihood (required):** low (single-page form + simple defaults + inline validation; design.md constrains)
  - **Impact (required):** medium (if operator can't author in <5 min, the [brief's primary metric](../../brief.md) hypothesis fails)
  - **Mitigation (required):** design.md explicitly single-page (no tabs, no wizard, no modal-trap); copy.md uses operator-friendly language (no jargon); top-5 pre-fill reduces blank-form intimidation. Mechanically verified by AC 13 e2e — Spec 1 measures total time from page load → success (target: <60s for an experienced operator; the 5-min metric is the user's first-attempt target).
  - **Area (required, tag):** ux / cognitive-load

- [2026-06-08] [PM] **bot_session race / multi-tab save — concurrent UPSERT semantics**
  - **Likelihood (required):** low (single-operator; multi-tab use rare)
  - **Impact (required):** low (UPSERT semantics: last-write-wins on `active_strategy_id`; both strategy rows are persisted; bot reads the active pointer; no data loss)
  - **Mitigation (required):** AC 11 explicitly covers; UPSERT pattern handles atomically (no two-statement race). Engineer DRI Decision #2 documents the singleton assumption.
  - **Area (required, tag):** concurrency / data-integrity

- [2026-06-08] [PM] **Top-5 churn between page load and save — operator's selection may differ from "current top-5 at submit"**
  - **Likelihood (required):** medium-high (Researcher Q1 explicitly tracks; live data 2026-06-08 = `[BTC-USD, ETH-USD, ZEC-USD, XRP-USD, SOL-USD]`; expected to rotate ZEC/XRP/SOL/DOGE/SUI/etc.)
  - **Impact (required):** low (no functional issue — selected_assets are persisted to strategy row; bot acts on persisted set, NOT on "current top-5 at tick time")
  - **Mitigation (required):** explicit AC 11 edge case; copy.md surfaces "Selected from top-5 as of YYYY-MM-DD" in the selector header (UX writer's affordance for transparency); CB-5's dashboard will surface the same per [brief PM Risk: Top-5 churn surprise](../../brief.md#risks)
  - **Area (required, tag):** ux / discoverability

### Issues

_None at story creation. Engineer adds as discovered during /build._

## Tests

_Engineer writes unit + component tests co-located with code:_
- _`tests/app/dashboard/strategy/page.test.tsx` — Server Component initial-state composition; auth-gate redirect; top-5 fetch wiring_
- _`tests/app/dashboard/strategy/_form.test.tsx` — field rendering; validation-error mapping per VALIDATION_ERROR_CODES; focus management; tab order; dirty-state detection for unsaved-changes prompt_
- _`tests/app/dashboard/strategy/_selector.test.tsx` — top-5 pre-fill; cardinality [1, 5] enforcement; add/remove behavior_
- _`tests/app/dashboard/strategy/_actions.test.ts` — saveStrategy: validate → INSERT → supersession → bot_session UPSERT → structured log emit (mocked DB)_
- _`tests/lib/strategies/db.test.ts` — insertStrategy / markSuperseded / upsertSingletonBotSession with mocked postgres_

_Total: ~30-40 new unit/component tests. Suite goes ~473 → ~510._

_Codex writes Playwright e2e at `e2e/dashboard/strategy.spec.ts` (2 specs; AC 13)._

## PRs

_Auto-populated as PRs open._

---

_Story closed: <pending>, brief link: docs/bets/CB-3/brief.md, architecture link: docs/bets/CB-3/architecture.md, design link: docs/bets/CB-3/stories/CB-3.3/design.md, copy link: docs/bets/CB-3/stories/CB-3.3/copy.md_

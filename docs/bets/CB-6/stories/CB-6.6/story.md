---
id: CB-6.6
bet: CB-6
type: story
status: ready
priority: P1
created: 2026-06-17
author: PM
design_link: docs/bets/CB-6/stories/CB-6.6/design.md
copy_link: docs/bets/CB-6/stories/CB-6.6/copy.md
area_tags: [frontend, backend, dashboard, cockpit, manual-overrides, real-money, security]
dependencies:
  - CB-5.3 /api/bot/override route + lib/bot/overrides session-lock pattern + the no-orders invariant (INVERTED here)
  - CB-4.3 placeOrder + buildLimitOrder + the LIVE_MODE gate; CB-6.1 resolveViewedPair — reused
security_review: mandatory
---

# CB-6.6 — Cockpit Manual Overrides (real-money) (SEVENTH / FINAL CB-6 STORY)

## Description

Fills cockpit **section 5 (Manual Overrides)**: operator-triggered **Buy $<position_size_usd> / Sell 50% / Sell All / Reset Session** for the viewed pair, **paper while `LIVE_MODE=false`** (dry_run; real `submitted` orders post-flip — NO bypass). **Un-defers CB-5.4** (the override route's deferred real-money kinds) and **INVERTS the CB-5.3 `/api/bot/** no-orders invariant`** — the override route MAY now reach `lib/coinbase/orders` under the LIVE_MODE gate, a deliberate documented contract shift (cf. CB-4.2→4.3). **No migration** (the `override_events.kind` CHECK + `orders.source='manual'` already exist). **Mandatory Security Reviewer.**

## Acceptance Criteria

- [ ] **AC 1 — Manual Overrides card (section 5).** For the viewed pair: `Buy $<position_size_usd>` · `Sell 50%` · `Sell All` · `Reset Session`. **Confirm-before-submit** on Buy/Sell (reuse CB-5.3 reset confirm); **mode-aware** confirm wording (dark → "Simulate …"; live → "Place a REAL …"); a `Paper mode — orders are simulated (dry-run).` line while `LIVE_MODE=false`. On success → `router.refresh()`. Copy + labels verbatim ([copy.md](copy.md)).
- [ ] **AC 2 — Un-defer the real-money kinds.** `app/api/bot/override` moves `force_buy` / `sell_50` / `sell_all` out of `DEFERRED_KINDS` (no longer 400) and dispatches them. Body carries `asset` for these kinds; the route validates `asset` ∈ the active strategy's `selected_assets` (reject unknown). `pause`/`resume`/`reset` unchanged.
- [ ] **AC 3 — Order placement, LIVE_MODE-gated (NO bypass).** New `lib/bot/overrides.ts` helpers (`forceBuy(asset)` / `sellFraction(asset, fraction)`) follow the CB-5.3 session-resolution pattern (resolve the current session + its active strategy) and: build the order via `buildLimitOrder` (buy = `position_size_usd` dollars; sell = `fraction` × held qty); `LIVE_MODE=false` → record a `dry_run` row (placeOrder NOT called); `LIVE_MODE=true` → `placeOrder` then record `submitted`/`failed`. Mirrors the CB-4.3 tick placement (placement before persistence; sanitized error detail).
- [ ] **AC 4 — Manual order rows.** A new `insertManualOrder` writes the `orders` row (`source='manual'`, the current `session_id`, side/amount/status/coinbase_order_id/error_detail). Idempotency: a deterministic `clientOrderId` derived from (sessionId, a per-override id, asset) (no tick to key on). Manual orders appear in the CB-6.4 Trade Log (already `source`-agnostic).
- [ ] **AC 5 — Buy size + sell sizing (resolved).** Buy = the strategy's **`position_size_usd`** (dynamic button label; resolved decision — not a fixed $25). Sell 50% = `0.5` × held; Sell All = `1.0` × held. Held qty from `aggregatePosition(getAccountTradeHistory fills)` for the viewed pair. **No held position → reject** (`No position to sell.`); never place a zero order.
- [ ] **AC 6 — Caps: count + enforce (resolved).** Manual buys count toward AND are blocked by the per-session caps — `aggregateSessionTotals` includes `source='manual'` (still excludes `dry_run`/`failed`), so the cap is a hard real-money ceiling (bot + manual combined). `forceBuy` cap-checks (dollar + buy-count) before placing → over-cap buy rejected (`Session cap reached — can't buy.`). While dark all overrides are `dry_run` → don't count → never blocked (enforcement activates post-flip). The bot's `evaluate` cap path sees the combined total too.
- [ ] **AC 7 — Invariant INVERTED + behavioral guards (load-bearing, security).** `tests/app/api/bot/invariants.test.ts` flips: the `/api/bot/**` graph now MAY reach `lib/coinbase/orders` (`graph.has(ORDERS_FILE) === true`) — the documented inversion. **Replace the lost structural guarantee with BEHAVIORAL tests:** (a) `pause`/`resume`/`reset` → `placeOrder` NEVER called; (b) `force_buy`/`sell_*` with `LIVE_MODE=false` → `dry_run` row, `placeOrder` NEVER called; (c) `force_buy`/`sell_*` with `LIVE_MODE=true` → `placeOrder` called. The dashboard read-only invariant stays green (the card POSTs to `/api/bot/override`).
- [ ] **AC 8 — Auth (reused, unchanged).** The override route's rate-limit → origin/CSRF → `verifySession` re-verify stack covers the real-money kinds with NO weakening (proxy headers never trusted). Rate-limit applies (anti-hammer). 405/OPTIONS unchanged.
- [ ] **AC 9 — Audit.** Every override (incl. dry_run) writes an `override_events` row (`force_buy`/`sell_50`/`sell_all` — CHECK already permits) tied to the current session, in the same transaction as the order row.
- [ ] **AC 10 — No regression.** pause/resume/reset + the cron tick + CB-6.0–6.5 surfaces unchanged; `/dashboard` stays dynamic. The `MANUAL OVERRIDES` placeholder is replaced.
- [ ] **AC 11 — Tests.** Unit: `forceBuy`/`sellFraction` (dry_run vs live; cap reject; no-position reject; manual order + override_events written); `aggregateSessionTotals` includes manual (cap predicate test updated); the route (un-deferred dispatch, `asset` validation, auth failures). Component: Manual Overrides card render (4 buttons, dynamic Buy label, confirm step, mode-aware wording, paper line, feedback states) — pure-component render per CB-6.5's `RunNowControl` precedent. e2e (Codex): a dry_run Buy → confirm → order in the Trade Log; Sell with no position → "No position to sell.". **Behavioral security tests** per AC 7.
- [ ] **AC 12 — Gates.** typecheck / lint / test / build clean; e2e via the test DB. **Mandatory Security Reviewer pass** (Codex) — the real-money path + invariant inversion.

## Standard Experience Checklist

UI + real-money action story — load-bearing.
- [ ] **Navigation** — `n/a — in-place actions in the cockpit; the pair selector (CB-6.1) sets the target pair.`
- [ ] **States** — `covered by AC 1/5/6: confirm; working; success; rejected (cap / no-position); error; paper-mode indicator.`
- [ ] **Feedback** — `covered by AC 1: mode-aware confirm (REAL vs Simulate) + the paper-mode line; success refreshes the Trade Log; verbatim reject/error lines.`
- [ ] **Accessibility** — `covered by AC 1: two-step confirm (no single-click real order); the prompt names pair + amount + (post-flip) REAL; text feedback, keyboard-operable buttons.`
- [ ] **Edge cases** — `covered by AC 5/6/8: no position; cap reached; no session; rate-limit/auth/network error; unknown asset rejected.`
- [ ] **Cross-surface consistency** — `covered by AC 4: manual orders use the same orders ledger + Trade Log (source='manual') as bot orders; the same LIVE_MODE gate + placement path as the tick (CB-4.3).`

## Tech notes

### Reuse (NO migration)
- `app/api/bot/override/route.ts` — un-defer + dispatch; the auth stack is unchanged.
- `lib/bot/overrides.ts` — the in-tx session-resolution + `override_events` audit pattern (new `forceBuy`/`sellFraction` follow it).
- `lib/ticks/orders.ts:buildLimitOrder` (+ a manual `deterministicClientOrderId` variant) + `lib/coinbase/orders.ts:placeOrder` + the CB-4.3 placement shape (placement before persistence; `sanitizeErrorDetail`).
- `lib/ticks/db.ts:aggregateSessionTotals` (extend to include `source='manual'`) + a new `insertManualOrder`.
- `lib/ticks/cost-basis.ts:aggregatePosition` + `getAccountTradeHistory` (held qty for sells).
- `app/dashboard/override-controls-client.tsx` (confirm-before-submit) + `bot-controls-client.tsx` (pure-control + render-test precedent — `RunNowControl`).

### Engineer / Architect DRI (confirm at build)
- **Invariant inversion is the security crux:** the structural "never reaches orders" guarantee is replaced by BEHAVIORAL tests (AC 7). Safe kinds MUST stay order-free.
- `placeOrder` is a network call — keep it OUT of the DB transaction (place, then persist the row + event in one tx), mirroring the tick (CB-4.3 AC 9).
- Cap check for `forceBuy` uses `submitted`-only totals → naturally a no-op while dark (all dry_run).
- `sell_50`/`sell_all` resolve held qty from Coinbase fills (degrade/refuse cleanly on a Coinbase read failure — do NOT place a guessed size).

### What this story does NOT include
- The `LIVE_MODE=true` flip (operator ceremony, ≥60-dry-run guardrail). Editing buy size inline (use the strategy form). Arbitrary sell percentages. Equity overrides (CB-7).

## PRs
_Auto-populated._

## Tests
_Unit/component co-located; e2e by Codex; **MANDATORY Security Reviewer pass** (real-money + invariant inversion). (test DB; issue #80 may gate local e2e execution.)_

## DRI Log

### Decisions
- [2026-06-17] [Operator/PM] **Manual buys count toward + are blocked by the per-session caps** (hard real-money ceiling, bot + manual combined). `aggregateSessionTotals` includes `source='manual'`; `forceBuy` cap-checks before placing. — area: safety — alternatives: bypass caps (rejected — a session could over-deploy via manual clicks) — reversibility: medium (touches the bot's cap basis).
- [2026-06-17] [Operator/PM] **Buy size = the strategy's `position_size_usd`** (dynamic label), not a fixed $25 — consistent with the bot's per-buy size. — area: ux/scope — reversibility: easy.
- [2026-06-17] [Architect] **Invert the CB-5.3 `/api/bot/** no-orders invariant`** — the override route MAY now reach `lib/coinbase/orders` under the LIVE_MODE gate (un-defers CB-5.4). The structural guard is replaced by behavioral tests (safe kinds never place; real-money kinds gate on LIVE_MODE). A deliberate, documented contract shift. — area: architecture/security — reversibility: hard.
- [2026-06-17] [PM] **Paper-while-dark, NO bypass** — dry_run while `LIVE_MODE=false`; real `submitted` only post-flip. Mode-aware confirm + a paper indicator so the operator always knows. — area: safety — reversibility: easy.
- [2026-06-17] [Engineer] **Manual order row via a new `insertManualOrder`** (`source='manual'`, current `session_id`) + an `override_events` audit row in one tx; placement (network) BEFORE persistence (CB-4.3 shape). Idempotency via a manual `clientOrderId` (sessionId + per-override id + asset). — area: data-model — reversibility: easy.

### Risks
- [2026-06-17] [Security/PM] **A real-money order endpoint reachable from the cockpit** — likelihood: low (dark now) — impact: critical (real funds post-flip) — mitigation: LIVE_MODE gate + the unchanged auth stack (rate-limit + CSRF + session re-verify) + two-step confirm + per-session caps + Mandatory Security Reviewer + the AC-7 behavioral tests — area: security.
- [2026-06-17] [Engineer] **Invariant inversion could silently let SAFE kinds place orders** if a refactor wires pause/resume/reset through the order path — likelihood: low — impact: high — mitigation: AC-7 behavioral test (safe kinds → placeOrder never called) — area: security.
- [2026-06-17] [Engineer] **Cap-basis change touches the bot's `evaluate` path** (manual now counts) — likelihood: medium — impact: medium — mitigation: update the `aggregateSessionTotals` predicate test; the bot's cap tests pin the combined-total behaviour — area: correctness.
- [2026-06-17] [Engineer] **Double-submit / rapid clicks → duplicate real orders** — likelihood: medium — impact: high (post-flip) — mitigation: deterministic `clientOrderId` idempotency + the override rate-limit + the confirm + working-state disable — area: abuse.
- [2026-06-17] [Engineer] **Sell size from a stale/failed Coinbase held-qty read** — likelihood: low — impact: high — mitigation: refuse (no order) on a Coinbase read failure or zero position; never place a guessed size — area: correctness.

### Issues
_None at story creation._

---
_Story closed: <pending>, brief: docs/bets/CB-6/brief.md. **FINAL CB-6 STORY — real-money manual overrides; inverts the CB-5.3 no-orders invariant; mandatory Security Reviewer.**_

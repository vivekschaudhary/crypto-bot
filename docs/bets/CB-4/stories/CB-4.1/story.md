---
id: CB-4.1
bet: CB-4
type: story
status: ready
priority: P0
created: 2026-06-10
author: PM
design_link: n/a — pure library code; no UI surface (CB-3.0 + CB-4.0 precedent)
area_tags: [bot-runtime, decisions, signals-composition, cap-enforcement, take-profit, reason-string, asset-class-agnostic, foundation]
dependencies:
  - CB-4 brief approved 2026-06-09 (PR #56)
  - CB-4.0 shipped 2026-06-09 (PR #58 — provides rsi() + ma() pure functions)
  - CB-3.0 shipped 2026-06-08 (PR #45 — provides Strategy + Asset + EntryRules + ExitRules types)
estimate:
  effort: medium
  confidence: medium
e2e: false
---

# CB-4.1 — `lib/decisions/` decision engine (composes signals into buy/sell/hold + reason strings)

## Description

Ship the **pure-function decision engine** that turns CB-4.0's RSI/MA values + the operator's CB-3-authored strategy + the current bot session's spend totals into a deterministic decision per selected asset: `buy | sell | hold` + an operator-readable `reason` string.

This is the **load-bearing layer where strategy semantics become observable behavior**. Every decision the bot ever makes flows through `evaluate()`. The reason strings written into `bot_ticks.reason` (later, by CB-4.2's cron handler) are the operator's audit surface — CB-5's future dashboard renders them verbatim so the operator can read "RSI=27.3 < entry_threshold=30 → buy 50 USD BTC-USD" instead of staring at an opaque "bot bought" trace.

`evaluate()` is purely compositional:
- **Inputs**: `strategy: Strategy` (from CB-3.0) + `perAssetSignals: Map<identifier, {rsi, ma, lastClose, currentPosition}>` (cron handler pre-computes) + `sessionTotals: {dollarSpent, buyCount}` (cron handler aggregates from prior `bot_ticks` + `orders`)
- **Output**: `DecisionResult[]` — one entry per `strategy.selected_assets[i]`, in input order
- **Pure**: no I/O, no env reads, no DB; takes everything as arguments; returns everything as a value

After this story:
- **CB-4.2** (cron tick handler) composes `topN(adapter) → getProductCandles → rsi/ma → evaluate → bot_ticks/signals row writes` in a single transaction
- **CB-4.3** (`LIVE_MODE` gate) consumes each `DecisionResult` and conditionally calls `placeOrder` with the typed sizing
- **CB-5** (dashboard) renders `bot_ticks.reason` strings as the decision-trace observability surface

No I/O; no DB; no env; no Coinbase imports; no signals-module imports. `e2e: false`.

## Acceptance Criteria

- [ ] **AC 1 — `lib/decisions/types.ts` exports the type contract**:
  - `PerAssetSignal = { rsi: number | null; ma: number | null; lastClose: number; currentPosition: { avgCostUsd: number; quantity: number } | null }` — null `currentPosition` means the operator has no open position in this asset
  - `SessionTotals = { dollarSpent: number; buyCount: number }` — pre-aggregated by CB-4.2 from prior `bot_ticks` + `orders` in the active session
  - `Decision = "buy" | "sell" | "hold"` — discriminator
  - `DecisionResult = { asset: Asset; decision: Decision; reason: string; sizing?: BuySizing | SellSizing }`
  - `BuySizing = { kind: "buy_dollars"; dollars: number }` (= `strategy.position_size_usd`)
  - `SellSizing = { kind: "sell_fraction"; fraction: number }` (= `strategy.exit_rules.sellFraction`)
  - All types imported by CB-4.2 + CB-4.3 + CB-5's future dashboard via `import { ... } from "@/lib/decisions"`

- [ ] **AC 2 — `lib/decisions/evaluate.ts` exports `evaluate(strategy, perAssetSignals, sessionTotals): DecisionResult[]`** — pure function; deterministic; returns one result per asset in `strategy.selected_assets` in input order (NOT sorted by anything else; CB-5's dashboard needs stable ordering).

- [ ] **AC 3 — Entry rule evaluation**: for each asset with `currentPosition === null` (no open position), the rule check is:
  - `rsi < strategy.entry_rules.rsiThreshold` (oversold)
  - AND IF `strategy.entry_rules.maReinforcement === true` → also require `lastClose < ma` (price below MA confirms oversold dip)
  - If both pass → `{decision: "buy", sizing: {kind: "buy_dollars", dollars: strategy.position_size_usd}}`
  - The reason string surfaces the literal rule check (e.g., `"buy: rsi=27.3 < entry_threshold=30; ma reinforcement off"`)

- [ ] **AC 4 — Exit rule evaluation**: for each asset with `currentPosition !== null` (open position exists), the rule check is:
  - `rsi > strategy.exit_rules.rsiThreshold` (overbought)
  - AND `profit_pct >= strategy.exit_rules.minProfitPct` where `profit_pct = ((lastClose - avgCostUsd) / avgCostUsd) * 100`
  - If both pass → `{decision: "sell", sizing: {kind: "sell_fraction", fraction: strategy.exit_rules.sellFraction}}`
  - The reason string surfaces the literal rule check + computed profit (e.g., `"sell: rsi=72.1 > exit_threshold=70; profit=2.3% >= min_profit=1.5%; sell 50% of position"`)

- [ ] **AC 5 — Per-session cap enforcement (loud, NOT silent)**: when the entry-rule evaluation would emit `buy` BUT `sessionTotals.dollarSpent >= strategy.per_session_dollar_cap` OR `sessionTotals.buyCount >= strategy.per_session_buy_count_cap`, override the decision to `hold` with a reason string that EXPLICITLY surfaces both (a) what the signal would have been ("buy signal suppressed") AND (b) which cap was hit ("dollar_cap_reached" / "buy_count_cap_reached" / "both"). Operator audit value: the dashboard surfaces "your strategy WOULD have bought BTC-USD but the per-session $500 cap was already hit" — not the silent "hold".

- [ ] **AC 6 — Sells DO NOT count against caps**: per the [CB-4 brief Scope § per-session cap enforcement](../../brief.md#scope), only buys consume the dollar/count budget. A sell signal at an asset with an open position fires regardless of session totals. Engineer DRI Decision documents the rationale.

- [ ] **AC 7 — Insufficient signal data → hold**: if `rsi === null` OR `ma === null` (per CB-4.0's null sentinel pattern; insufficient bars from CB-2.2's candle fetch) → decision is `hold` with reason `"hold: insufficient signal data: rsi=null|ma=null"`. The cron handler (CB-4.2) shouldn't suppress the asset — it should still emit the bot_ticks row + the signals rows for that asset showing why.

- [ ] **AC 8 — No position + exit-RSI condition met → hold (amended PR #60 round-2)**: if `rsi > strategy.exit_rules.rsiThreshold` (the RSI half of the exit-rule check) BUT there's no open position (`currentPosition === null` OR `quantity === 0`) → decision is `hold` with a reason that surfaces (a) which exit condition WAS verified, (b) that no position exists to sell from, and (c) implicitly that the profit half couldn't be evaluated. **Note on the spec**: the original AC 8 wording said "if the exit-rule check would fire" — but the full exit-rule check is `rsi > exit_threshold AND profit_pct >= minProfitPct`, and `profit_pct = ((lastClose - avgCostUsd) / avgCostUsd) * 100` requires a non-null `currentPosition.avgCostUsd`. With no position, the profit half is structurally unevaluable. The amendment makes the spec honest: the no-position branch checks the RSI half ONLY + surfaces it as operator-audit. The reason string must make clear that only the RSI half was checked (e.g., `"hold: exit rsi condition met (rsi=72.10 > exit_threshold=70) but no open position at BTC-USD"` — not the original `"hold: sell signal but no open position"` which falsely implied the full exit rule was evaluated). Defense remains: the operator could enter the strategy with a pre-existing manual-bought position; the bot only sells what it knows about via `currentPosition`. Pre-existing positions are a CB-5 manual-override concern.

- [ ] **AC 9 — Reason-string contract**: every `reason` string is operator-readable plain text + surfaces the LITERAL rule check it represents. NO opaque "bot decided to hold" strings — every reason must name (a) the decision class (entry-rule fire / exit-rule fire / cap-enforcement override / insufficient-data hold / no-position hold) + (b) the numeric values that drove it. CB-5's dashboard renders verbatim. Engineer DRI Decision pins the exact format at first commit; tests assert KEY structural elements (decision class prefix + numeric values), not pixel-perfect string equality.

- [ ] **AC 10 — Architectural invariant**: `tests/lib/decisions/no-coupling.test.ts` transitive walk that allows `@/lib/strategy-core/*` imports (the `Strategy` + `Asset` + `EntryRules` + `ExitRules` types ARE the contract) but FORBIDS `@/lib/coinbase/*`, `@/lib/db/*`, `@/lib/env/*`, `@/lib/strategy-coinbase/*`, `@/lib/signals/*`, `@/lib/strategies/*`. The decisions engine is STRUCTURALLY paired with strategy-core (consumes its types) but NOT with signals (signals is a sibling pure-function lib; the cron handler composes both, decisions receives the already-computed RSI/MA values as numeric inputs).

- [ ] **AC 11 — Sibling LIVE_MODE-free invariant**: `tests/lib/decisions/no-live-mode.test.ts` mirrors the CB-3.0 + CB-3.1 + CB-4.0 pattern. The LIVE_MODE gate lives at CB-4.3's order-placement layer, NOT here.

- [ ] **AC 12 — Unit tests (~30 tests across the scenario matrix)**:
  - **Entry-rule fire**: rsi < threshold + no maReinforcement → buy
  - **Entry-rule fire with maReinforcement**: rsi < threshold + lastClose < ma → buy
  - **Entry-rule miss on maReinforcement**: rsi < threshold + lastClose >= ma → hold
  - **Entry-rule miss on rsi**: rsi >= threshold → hold
  - **Exit-rule fire**: position exists + rsi > threshold + profit >= minProfit → sell
  - **Exit-rule miss on rsi**: position exists + rsi <= threshold → hold
  - **Exit-rule miss on profit**: position exists + rsi > threshold + profit < minProfit → hold
  - **Cap enforcement (dollar cap exact boundary)**: dollarSpent === per_session_dollar_cap + buy signal → hold with cap-named reason
  - **Cap enforcement (dollar cap just under)**: dollarSpent === per_session_dollar_cap - 0.01 + buy signal → buy (NOT suppressed at the boundary)
  - **Cap enforcement (buy count cap)**: buyCount === per_session_buy_count_cap + buy signal → hold
  - **Cap enforcement (both caps hit)**: reason names both
  - **Cap enforcement does NOT affect sells**: position exists + exit-rule fires + dollarSpent at cap → sell (not suppressed)
  - **Insufficient data (rsi null)** → hold
  - **Insufficient data (ma null)** → hold
  - **Insufficient data (both null)** → hold
  - **Sell signal with no position** → hold with no-position reason
  - **Multi-asset strategy**: 3 selected assets with different signal states → 3 DecisionResult entries in input order
  - **Cost-basis edge cases**: zero quantity, negative computed profit, exact-zero profit at min_profit threshold
  - **Reason-string structural assertions** (per AC 9): each decision class's reason contains the named prefix + numeric values

- [ ] **AC 13 — Gates**: `pnpm typecheck` zero errors; `pnpm lint` zero warnings; `pnpm test` ~593 → ~625+ (+~30 new); `pnpm build` green; `lib/decisions/` source size under 5K LOC.

## Standard Experience Checklist

CB-4.1 is pure library code (server-only; no UI surface). **4 of 6 categories `n/a`** (Navigation / States / Feedback / Accessibility — no UI) + **2 of 6 covered by AC items** (Edge cases via AC 7/8/12; Cross-surface consistency via AC 10's architectural-invariant test). Matches CB-4.0's corrected checklist shape (NOT the stale "6/6 n/a" pattern that PR #57 round-1 caught).

- [ ] **Navigation** — `n/a — no UI surface in this story; lib/decisions/ exports pure functions consumed by CB-4.2's cron handler.`
- [ ] **States** — `n/a — pure function returns DecisionResult[] in one step; no UI loading/empty/error states ship here.`
- [ ] **Feedback** — `n/a — the reason strings ARE the operator-facing feedback contract (rendered by CB-5's future dashboard) but they're returned data, not rendered UI in this story.`
- [ ] **Accessibility** — `n/a — no rendered UI; accessibility surfaces at CB-5's future dashboard.`
- [ ] **Edge cases** — `covered by AC 7 + AC 8 + AC 12 — insufficient signal data + sell-with-no-position + cap-at-exact-boundary + cap-just-under + both-caps-hit + zero-quantity + negative-profit + exact-zero-profit edges all explicitly tested.`
- [ ] **Cross-surface consistency** — `covered by AC 10 — architectural invariant proves lib/decisions/ stays asset-class-agnostic (allows @/lib/strategy-core/* types because Strategy IS the contract; forbids @/lib/coinbase/* and signals). The equity-app variant per CB-3 PM Decision #6 consumes the same decision engine with its own adapter.`

## Tech notes

The build materializes the decision-engine contract per [CB-4 brief Scope § lib/decisions/](../../brief.md#scope). Engineer DRI Decisions called out here (commit at first build commit):

1. **Reason-string format = plain text, with stable named prefixes for the decision class** — e.g., `"buy: rsi=27.3 < entry_threshold=30; ma reinforcement off"`, `"sell: rsi=72.1 > exit_threshold=70; profit=2.3% >= min_profit=1.5%; sell 50% of position"`, `"hold: dollar_cap_reached ($500 spent of $500 cap); buy signal suppressed at BTC-USD"`. Engineer picks exact phrasing at first commit; tests assert structural elements (prefix + numeric values), not pixel-perfect equality. Rationale: operator-readable; CB-5 dashboard renders verbatim; brittle full-string golden tests would block reasonable wording polish.

2. **Cap-enforcement order = evaluate signal first, THEN override**. NOT early-out before signal evaluation. Rationale: the reason string surfaces "buy signal suppressed by cap" — the operator audit value depends on knowing WHAT the signal would have been. Early-out hides that information. Engineer commits this as Decision #2.

3. **Position cost basis is passed by the caller**, NOT queried by the decision engine. `PerAssetSignal.currentPosition: { avgCostUsd, quantity } | null`. CB-4.2's cron handler queries via CB-2.3's `getAccountTradeHistory` (or computes from prior `orders` rows for the active session — Engineer DRI at CB-4.2 build). This keeps `evaluate()` pure; testable; portable.

4. **Sells DO NOT count against per-session caps**. Rationale: caps exist to limit how much operator capital the bot can deploy in a session (downside protection). Sells release capital; capping them would lock the operator out of taking profit when the strategy fires. Per [CB-4 brief Scope](../../brief.md#scope). Engineer commits this as Decision #4.

5. **Insufficient signal data (rsi/ma null from CB-4.0's sentinel) → hold + reason**. Per CB-4.0's null-sentinel contract: the decision engine maps null to a holds-with-reason, NEVER to a silent skip. The signals row (CB-4.2 writes) records the null so the operator can audit which asset had insufficient bars. Engineer commits this as Decision #5.

6. **Decision return ordering matches `strategy.selected_assets` input order** (NOT sorted alphabetically; NOT sorted by symbol; NOT sorted by signal strength). The CB-5 dashboard relies on stable per-tick ordering to render the decision-trace history; reordering would break that contract. Engineer commits this as Decision #6.

### Patterns to mirror at `/build CB-4.1`

1. **Architectural invariant tests** — CB-4.0's `no-coupling.test.ts` transitive walk + `no-live-mode.test.ts` sibling pattern. Same shape adapted; ALLOW-list `@/lib/strategy-core/*` per AC 10.
2. **Pure-function library shape** — CB-4.0's `lib/signals/` + CB-3.0's `lib/strategy-core/` precedents (zero I/O; zero crypto-app singletons in scope; null sentinel for "cannot compute" rather than throw).
3. **JSDoc-as-DRI-Decision-log** — CB-4.0's 6 Engineer DRI Decisions live inline in `rsi.ts` + `ma.ts` JSDoc blocks. CB-4.1's 6 Engineer DRI Decisions land the same way in `evaluate.ts`.
4. **Golden-value scenario tests** — CB-4.0's RSI/MA tests pin specific inputs → specific outputs. CB-4.1's scenario tests pin specific `(strategy, signals, sessionTotals)` → specific `(decision, reason structural elements)`.

### What this story does NOT include

- Cron tick handler at `app/api/cron/tick/route.ts` — CB-4.2 (next story; composes lib/signals + lib/decisions + db.ts + structured-log emit)
- `LIVE_MODE` gate at order placement — CB-4.3
- Take-profit polish — CB-4.4 (maybe; PM Decision at `/create-story CB-4.4` time)
- Position cost-basis lookup (CB-4.2's responsibility via CB-2.3's `getAccountTradeHistory` or active-session `orders` aggregation)
- Per-session totals aggregation query (CB-4.2's responsibility)
- Override semantics (pause/resume/force-buy/sell-N/reset) → CB-5 per [CB-4 brief PM DRI Decision #1](../../brief.md#decisions)
- Multi-tier exit ladder → overruled by [CB-4 brief PM DRI Decision #3](../../brief.md#decisions); single-tier exit per CB-3.0 ExitRulesSchema

### Why this story ships SECOND in CB-4 (after CB-4.0, before CB-4.2)

CB-4.0 shipped the math primitives (RSI + MA pure functions). CB-4.2 (cron handler) is the I/O layer that composes them. CB-4.1 is the LOGIC layer between them — the place where strategy semantics meet computed signals. Shipping in this order means:

- CB-4.2 can compose `evaluate()` directly without inventing its own decision shape
- CB-5's future dashboard can read `bot_ticks.reason` strings knowing the contract was fixed at CB-4.1 (not at the cron handler layer)
- The signal math (CB-4.0) is independent of the decision policy (CB-4.1); a future strategy variant could swap the policy without rewriting the math

This mirrors CB-3's foundation → adapter → DB schema → form ordering: primitives first, composition last.

## DRI Log

### Decisions

- [2026-06-10] [PM] **Decision engine is the load-bearing observability surface — reason strings are the operator-audit contract, NOT debug logs**
  - **Rationale (required):** Every decision the bot makes flows through `evaluate()`. The reason strings get written to `bot_ticks.reason` (CB-4.2) and rendered verbatim by CB-5's dashboard. They're what the operator reads when auditing "why did the bot buy here." If the reason string is opaque ("bot decided to hold"), the dry-run-first product principle is half-broken — operator can see the bot held but can't verify the rule check that justified it. AC 9 makes this load-bearing.
  - **Area (required, tag):** observability / dry-run-first / operator-trust
  - **Alternatives considered (required):** structured JSON reasons (rejected — harder for operator to skim; CB-5 dashboard would have to render → defeats verbatim rendering); short codes only ("E_RSI", "X_PROFIT") (rejected — opaque; requires the operator to memorize a code table); pure plain text with no structural prefix (rejected — would make automated test assertions brittle and CB-5 filtering harder)
  - **Reversibility:** moderate — changing the reason-string format post-ship requires data-migration awareness (existing `bot_ticks.reason` strings stay as written; new format applies forward only)

- [2026-06-10] [PM] **Cap enforcement lives at the decision engine layer, NOT the cron handler** — even though `sessionTotals` is computed by the caller (CB-4.2)
  - **Rationale (required):** The decision engine is the single source of truth for "what should the bot do given this strategy + these inputs." If cap enforcement lived in the cron handler, the decision engine could emit "buy" and the cron handler could silently suppress it — defeating the AC 5 "loud, NOT silent" contract. Putting the override INSIDE evaluate() means the reason string always reflects the actual decision-class, including cap-induced holds. CB-4.2's cron handler just executes what evaluate() decided.
  - **Area (required, tag):** architecture / single-source-of-truth
  - **Alternatives considered (required):** cap enforcement in cron handler with a separate "suppression layer" (rejected — splits the decision logic across layers; bot_ticks.reason would lose the original signal info); cap enforcement BEFORE evaluate() in the cron handler (rejected — same problem; the reason string couldn't surface what the signal would have been)
  - **Reversibility:** moderate — moving cap enforcement out of evaluate() would require coordinated CB-4.2 changes

### Risks

- [2026-06-10] [PM] **Reason-string drift between code + operator expectations** — operator reads strings post-ship and disagrees with how the bot interpreted their strategy
  - **Likelihood (required):** medium (operator's mental model of their strategy may not perfectly match the Zod-validated rule semantics; first time they see real bot_ticks.reason strings, surprises are possible)
  - **Impact (required):** medium (operator confusion → reduced trust in the deterministic-decision posture; could trigger strategy revisions via supersession in CB-3.3's form OR a CB-4.4 take-profit-polish story OR an AGENTS.md amendment)
  - **Mitigation (required):** AC 12 unit tests cover every decision class with explicit input → expected reason-structure assertions; the test suite IS the contract documentation. CB-5's dashboard will surface the strings in production; operator gets early feedback. If a reason string proves systematically confusing, CB-4.4 polish story can iterate.
  - **Area (required, tag):** ux / operator-trust

- [2026-06-10] [PM] **Off-by-one in cap-at-exact-boundary** — `>=` vs `>` for cap enforcement
  - **Likelihood (required):** medium (classic off-by-one; "spent === cap" should suppress per the operator's intent)
  - **Impact (required):** medium (one extra buy at boundary → real-money over-spend in LIVE_MODE; observability hole if the reason string says "under cap" when at cap)
  - **Mitigation (required):** AC 12 includes the explicit `dollarSpent === per_session_dollar_cap` boundary test (should suppress) + the `dollarSpent === per_session_dollar_cap - 0.01` just-under boundary test (should fire). Pins the >= semantic.
  - **Area (required, tag):** correctness / off-by-one

- [2026-06-10] [PM] **Take-profit profit-pct edge cases** — zero quantity, negative computed profit (current price below cost basis), NaN inputs, exact-zero profit at `min_profit_pct` threshold
  - **Likelihood (required):** medium (multiple edge cases; division-by-zero risk if quantity === 0; NaN propagation from currentPosition.avgCostUsd being malformed)
  - **Impact (required):** medium (wrong sell at edge → real-money harm OR missed sell at exact threshold → operator misses profit target)
  - **Mitigation (required):** AC 12 covers each edge explicitly. Engineer DRI Decision at build: divide-by-zero on `avgCostUsd === 0` returns hold with reason "hold: cost basis is zero — position likely closed concurrently". NaN in profit computation returns hold with reason "hold: profit computation produced NaN".
  - **Area (required, tag):** correctness / edge-cases / take-profit

### Issues

_None at story creation. Engineer adds as discovered during /build._

## Tests

_Engineer writes unit tests co-located with code at `tests/lib/decisions/*.test.ts`. Expected count: ~30 unit tests + 2 architectural invariant tests (AC 10 no-coupling + AC 11 no-LIVE_MODE) = ~32 total new tests. Test suite goes ~593 → ~625+._

_No integration tests in this story — no live Coinbase, no DB, no env._

## PRs

_Auto-populated as PRs open._

---

_Story closed: <pending>, brief link: docs/bets/CB-4/brief.md, retro precedent: docs/retros/2026-06-09-cb-3-production-only-defects-retro.md_

---
id: CB-6
type: feature
status: shipped
priority: P1
parent: FOUNDATION-PRODUCT
portfolio_stub: false
depends_on: [CB-5]
parallel_with: []
architecture_required: auto
created: 2026-06-16
author: PM
sources:
  - Operator request 2026-06-16 (free text)
  - "Design: ETH_USD Bot — Coinbase.pdf (operator-provided mockup, finance.kindtree.us/coinbase-bot.html, 2026-06-15) — the authoritative layout for the crypto cockpit"
key_metric:
  name: Operator daily-driver completeness — % of routine operator questions (bot status, current-run PnL, current value/position, latest signals + next action, recent trades incl. skips) answerable from the single crypto cockpit screen WITHOUT navigating away or using psql
  baseline: "Partial — CB-5 split these across /dashboard + /dashboard/trace + /dashboard/ledger; no single-screen cockpit, no current-run PnL, no on-demand run, no live price/position panel"
  target: "100% of the routine questions answerable on one screen; the cockpit is the operator's sole daily surface"
  source: operator self-report + the rendered cockpit (locally verifiable; no external dependency)
guardrails:
  - name: No real-money orders while LIVE_MODE=false — Run-now AND the manual overrides (Buy/Sell 50%/Sell All) are dry-run/paper while dark
    threshold: zero live Coinbase orders placed when LIVE_MODE=false (the CB-4/CB-5 safety posture is preserved even though real-money override BUTTONS now exist in the UI)
  - name: Read panels stay READ-ONLY — status/PnL/position/signals/trade-log never mutate bot_ticks / signals / orders (append-only invariant, carried from CB-5)
    threshold: zero INSERT/UPDATE/DELETE in the read panels; writes happen ONLY via the explicit control/override routes
  - name: No regression to shipped CB-5 surfaces — live-state, decision-trace, ledger, per-asset PnL correctness preserved through the recomposition
    threshold: all CB-5 read-model + render tests stay green
  - name: LIVE_MODE state always visible — the operator can never be unsure whether real money is in play (especially now that real-money override buttons exist)
    threshold: the live/paper state is present on the cockpit
measurement_window_days: 30
check_in_cadence: weekly
area_tags: [frontend, dashboard, multi-asset, bot-runtime, override-controls, real-money]
estimate:
  duration_weeks: 2
  confidence: medium
  refined_by: brief-approval
  refined_at: 2026-06-16
---

# CB-6 — Multi-asset shell + crypto cockpit redesign (single-screen, per the operator design)

## Problem

CB-5 shipped the operator's read + control surfaces, but **split across three routes** (`/dashboard`, `/dashboard/trace`, `/dashboard/ledger`), with all-time per-asset PnL, no live price/position panel, and no on-demand run. The operator wants the **single-screen cockpit** in their design (`ETH_USD Bot — Coinbase.pdf`): open one page and see status, current-run P&L, current value + position, live price + signals, the next action, the manual levers (incl. real-money), and the trade log — and trigger a run on demand. Separately, the operator's product is now **multi-asset** (Crypto **and** India Equity **and** Mutual Funds), so the app needs a top-level place to switch between them. Today there is neither the consolidated cockpit nor the multi-asset entry point.

## User

The single operator (foundational persona — discipline-seeking retail trader). Job-to-be-done: "In one glance, tell me what my bot is doing, what it's made this run, what I hold and what it's worth now, what the signals say it'll do next — and let me intervene (including buy/sell) or run it now — without hopping pages or psql."

## Why this matters

The MVP (CB-1…CB-5) proved the loop. The next leg is a **daily-driver cockpit the operator lives in** + the **multi-asset shell** the equity/MF bets plug into. This bet ships the **crypto cockpit + the 3-tab shell** as the fast first slice; the equity asset class (the heavy new-external-service work) is sequenced behind it as **CB-7**.

## Hypothesis (the bet)

If we ship the operator's designed **single-screen crypto cockpit** (status + Start/Pause/Stop/Run-now · current-run P&L · current value + position · live price + signals + next action · manual overrides incl. Buy/Sell · trade log with skips) behind a **3-tab shell** (Mutual Funds / Equity / Crypto), then the operator runs the crypto bot entirely from one screen with no psql and no page-hopping, measured by **daily-driver completeness = 100%** over 30 days — and the app gains the multi-asset entry point CB-7 (equity) plugs into.

## Defensibility (optional for feature bets)

**Moat impact (one line):** Marginal — deepens the "automation _with_ visibility + one-click override" positioning (the core differentiator vs. black-box bots) and raises switching cost as the operator's daily cockpit.

## Scope

### In scope

- **3-tab shell** at the top of the page: **📊 Mutual Funds · 📈 Equity · 🤖 Crypto**. Crypto → the cockpit below. **Equity + Mutual Funds → "coming soon" placeholders** (no functionality in CB-6; Equity = CB-7 / Zerodha, Mutual Funds = a later India/Zerodha bet).
- **Crypto cockpit** — a single screen matching `ETH_USD Bot — Coinbase.pdf`, sections top-to-bottom:
  1. **Bot status** — one-liner ("Bot is stopped — click Start to resume") + a STATE badge (`STOPPED`/etc.) + controls **Start · Pause · Stop · Run Now** + a status-detail line ("stopped by user").
  2. **Profit / Loss** — `TOTAL INVESTED` ($150, "4 buys this session") + `CURRENT VALUE` ($123.68, "P&L: −$34.27 (−22.85%) · Realized: −$7.95"). Session/current-run scoped.
  3. **Current position** — `ETH HELD` (qty + avg cost) + `LIVE PRICE` (+ RSI).
  4. **Signals** — RSI Zone, Price vs MA20, Price vs MA50, and **Next Action**.
  5. **Manual overrides** — **Buy $25 · Sell 50% · Sell All · Reset Session** (NB: Buy/Sell are the real-money overrides deferred as CB-5.4 — see guardrail + decision below; dry-run while `LIVE_MODE=false`).
  6. **Trade log** — table (Time · Side · Price · Qty · USD · Reason · Status) including **SKIPPED** rows with reasons, + a status filter ("All statuses"). Merges decision-trace reasons + the orders ledger into one view.
- **"Run now"** — operator-authenticated on-demand trigger of one bot evaluation (dry-run while dark), reusing the CB-4 tick handler (no `LIVE_MODE` bypass).
- **Controls** — Start (resume) · Pause · Stop · Run Now. **Stop = alias for `paused`** (NO migration; resolved decision); Reset Session = the existing reset, under overrides. The cockpit is a **per-pair view** with **pair selection** (resolved decision); read panels scope to the viewed pair.
- **Recomposition** of CB-5's shipped read models (live-state, decision-trace, ledger, per-asset PnL) into the cockpit + new current-run/session-scoped P&L (per viewed pair) + a live-price panel.

### Out of scope

- **Equity / Zerodha → CB-7**; **Mutual Funds → a later bet.** CB-6 ships only their _placeholder tabs_.
- The **`LIVE_MODE=true` flip** (unchanged operator ceremony) and any change to trading/signal logic. CB-6 displays signals/reasons the bot already produces; it does not add strategy.
- **Multi-currency (INR)** — arrives with Zerodha (CB-7).

### Load-bearing decisions — RESOLVED 2026-06-16 (operator)

- **[per-pair vs portfolio] → per-pair VIEW of the existing multi-asset bot.** The bot keeps trading the operator's top-5 selected assets (no CB-4/CB-3 model change); the cockpit is a **per-pair detail view** with **pair selection** (ETH/USD, etc.). Profit/Loss, position, signals, live price, and trade log are **scoped to the viewed pair**; "this session" = the current `bot_session` filtered to that pair. (No bot-model reframe — lowest risk.)
- **[real-money overrides] → BUILD now, paper-while-dark.** Buy $X / Sell 50% / Sell All ship as operator-authenticated routes that are **dry-run while `LIVE_MODE=false`** and place real Coinbase orders only post-flip (reusing CB-4.3's `LIVE_MODE`-gated `placeOrder`). This **un-defers CB-5.4** and **inverts CB-5.3's `/api/bot/**`no-orders invariant** — a deliberate, documented contract shift (cf. CB-4.2→4.3): the override route now MAY reach`lib/coinbase/orders`under the`LIVE_MODE` gate. **Mandatory Security Reviewer pass.**
- **[STOPPED] → alias for `paused` (NO migration).** Stop maps to the existing `paused` state (`bot_sessions.status` unchanged). Start = resume; Pause and Stop both resolve to `paused` at the data layer; the Start/Pause/Stop distinction + "stopped by user" wording is presentational (and may log distinct `override_events` for audit). Reset Session = the existing reset, under overrides. (Designer/UX-Writer settle whether to keep Pause AND Stop as separate buttons given they share a state.)

## Open questions for Researcher

- Confirm the 3-tab set (Mutual Funds / Equity / Crypto) and that MF is also India/Zerodha (Zerodha Coin) → a later bet.
- "TOTAL INVESTED / 4 buys this session" + "Realized" scoping — confirm "session" = current `bot_session` (since last Start/Reset), which CB-5.3 multi-row sessions support.
- Trade-log "SKIPPED … USD reserve (need $10, available $11.77)" — confirm these reason strings already come from the bot's decision engine (CB-4 produces `reason`); CB-6 _displays_ them, does not compute reserve logic.
- Run-now dedupe against the `*/15` cron tick-uniqueness window; what it shows on completion.

## Research findings

_To be filled by Researcher. Initial: the cockpit rides on shipped CB-5 data (live-state, trace, ledger, per-asset PnL) + the CB-5.3 multi-row session ("current run"). Genuinely new: (1) Run-now (operator-auth trigger of the existing tick handler); (2) real-money override route (CB-5.4 — security-sensitive); (3) a `stopped` session state (small migration); (4) the per-pair view question. Forward (CB-7): Zerodha **Kite Connect** — paid API, OAuth daily-token refresh (not a static key), IST hours (09:15–15:30, NSE holidays), INR — its own architecture-required bet; Mutual Funds likely Zerodha Coin (later)._

## User pain input (from Support)

_n/a — single operator; the design IS the request._

## Stories

_Decomposed one at a time via `/create-story CB-6`. Likely shape (pending the per-pair decision): CB-6.0 3-tab shell + cockpit skeleton (status + Start/Pause/Stop + STOPPED state); CB-6.1 Profit/Loss + Current Position + live-price panel (current-run scoping); CB-6.2 Signals + Next Action + Trade Log (trace⋈ledger incl. skips + filter); CB-6.3 Run-now; CB-6.4 real-money overrides (Buy/Sell — gated, paper-while-dark) IF approved in scope. Forecast only._

## Scan summary

_Not yet scanned. Run `/scan CB-6` after stories begin._

## Check-in log

_Populated automatically by `/measure` cron._

## DRI Log

### Decisions

- [2026-06-16] [PM] **Slice: CB-6 = 3-tab shell + crypto cockpit redesign; equity (Zerodha) = CB-7; Mutual Funds = a later bet.** — rationale: ship the operator's cockpit + multi-asset entry point fast; isolate the heavy new-external-service risk (Zerodha) — area: scope/sequencing — alternatives: one mega-bet (rejected); equity-first (rejected) — reversibility: easy.
- [2026-06-16] [PM] **Design source of truth = `ETH_USD Bot — Coinbase.pdf`.** — rationale: operator-provided mockup; the six cockpit sections + 3 tabs + controls are taken from it (the earlier text-only draft was superseded once the image was available) — area: design — reversibility: easy.
- [2026-06-16] [PM] **Equity broker = Zerodha (India / NSE-BSE), Kite Connect — forward decision for CB-7; equity gets its OWN strategy.** — rationale: operator's market is India — area: architecture/vendor — alternatives: Alpaca/IBKR (rejected — US) — reversibility: hard (one-way market/broker).
- [2026-06-16] [PM] **`architecture_required: auto` (raised from the earlier `false`).** — rationale: once the image landed, CB-6 is more than UI recomposition — it adds a **real-money override write path** (CB-5.4), a possible **per-pair bot-model** reframe, and a **new `stopped` session state** (migration). The Architect assesses at `/create-bet-architecture` once the per-pair + real-money-override shape is pinned — area: architecture — reversibility: easy.
- [2026-06-16] [PM] **Cockpit = per-pair VIEW of the existing multi-asset bot (operator-resolved).** — rationale: the design is single-pair, but the bot trades top-5; a per-pair view (with pair selection) delivers the design with zero bot-model change — area: scope/architecture — alternatives: one-bot-per-pair reframe (rejected — large CB-4/CB-3 change); single-pair-only (rejected — discards multi-asset) — reversibility: medium.
- [2026-06-16] [PM] **Real-money overrides (Buy/Sell 50%/Sell All) built in CB-6, paper-while-dark (operator-resolved); un-defers CB-5.4.** — rationale: in the design; safe pre-flip via the `LIVE_MODE` gate (dry-run while dark, real only post-flip) — area: real-money/security — **consequence: inverts CB-5.3's `/api/bot/**` no-orders invariant** (documented contract shift, cf. CB-4.2→4.3) + **mandatory Security Reviewer\*\* — alternatives: stub till flip / drop (rejected — operator wants them) — reversibility: medium.
- [2026-06-16] [PM] **Stop = alias for `paused` (operator-resolved); NO migration.** — rationale: avoids a `bot_sessions.status` schema change; the Start/Pause/Stop UI distinction is presentational/audit — area: data-model/ux — alternatives: distinct `stopped` state + migration (rejected by operator) — reversibility: easy.
- [2026-06-16] [PM] **product.md amendment required (deferred to CB-7 promotion).** — rationale: the foundational bet is "Coinbase crypto DCA bot"; Crypto + Equity + Mutual Funds expands it to multi-asset/multi-market. CB-6 introduces only the shell (placeholders); the full vision amendment lands with CB-7 — area: product/foundation — reversibility: medium.

#### Production-readiness — flip ceremony (2026-06-21)

Closing the remaining `/scan CB-6` Production-Ready findings before the `LIVE_MODE` flip.

- [2026-06-21] [Engineer/Ops] **Rollback TESTED — additive-safe (closes PROD_READY-04).** The only CB-6 schema change is migration 0008 (`orders.base_quantity`). Verified on the test DB: `base_quantity` is `nullable=YES`; a **pre-0008-shape `INSERT`** (full NOT-NULL column set — id/source/side/amount/status/asset_identifier — **without** `base_quantity`) **succeeded** (defaulted NULL); the pre-0008 `lib/ticks/db.ts` has **0** `base_quantity` references. ⇒ Rollback = redeploy the prior build; **no down-migration, no data orphaning** (a NULL `base_quantity` is invisible to the old build; manual orders persist as audit rows). Test method: SQL compat check against the 0008 schema (the precise rollback risk), 2026-06-21. — area: ops/rollback — reversibility: n/a (this IS the rollback verification).
- [2026-06-21] [Operator] **On-call ack (closes PROD_READY-05).** Single-operator = on-call. Operator has read `docs/bets/CB-6/runbook.md` (cockpit map, controls, diagnostics, emergency halt, flip ceremony, rollback) and acks readiness to operate the real-money surface post-flip. _(Drafted for operator confirmation.)_ — area: ops/on-call — reversibility: easy.
- [2026-06-21] [Engineer] **Monitoring (PROD_READY-03) — in progress via CB-6.8** (Telegram failed-order + tick-error alerts, PR #110). Tick-gap detection remains an external dead-man's-switch (operator infra; documented in `slo.md`). — area: observability — reversibility: easy.

### Risks

- [2026-06-16] [PM] **Real-money override buttons now exist in the UI** (Buy/Sell 50%/Sell All) — likelihood: low — impact: HIGH (unintended real-money trade) — mitigation: dry-run while `LIVE_MODE=false`; operator-auth route (CB-1.5 pattern); reuse CB-4's LIVE_MODE gate (no bypass); Security Reviewer engagement; the always-visible live/paper state guardrail — area: security/real-money.
- [2026-06-16] [PM] **Per-pair vs portfolio ambiguity** could expand scope from a UI view into a bot-model change — likelihood: medium — impact: high — mitigation: resolve the decision at approval / `/create-bet-architecture` before building; recommended path (per-pair _view_ of the existing multi-asset bot) keeps the bot unchanged — area: scope/architecture.
- [2026-06-16] [PM] **Redesign regresses shipped CB-5 surfaces** — likelihood: medium — impact: medium — mitigation: recompose the _tested_ read models; keep their tests; page-render tests for the cockpit — area: regression/frontend.
- [2026-06-16] [PM] **Scope creep into equity/MF** — likelihood: medium — impact: medium — mitigation: hard out-of-scope; CB-7 owns equity; MF later; CB-6 ships only placeholders — area: scope.

### Issues

- [2026-06-16] [PM] **Per-pair vs portfolio model + real-money-overrides-in-scope + STOPPED semantics** — severity: medium — owner: operator — status: **RESOLVED 2026-06-16** (per-pair view; real-money built paper-while-dark; Stop=alias for paused — see Decisions) — area: scope/architecture.
- [2026-06-21] [Scanner] **Production-Ready re-scan v2 — 7 open findings (4 Critical / 2 High / 1 Medium); blocking.** 4 Criticals (runbook/SLO/monitoring/rollback absent) are **real money-surface gates** for the `LIVE_MODE` flip ceremony (NOT suppression candidates, unlike CB-8). **NEW this scan:** the **cockpit e2e is RED on `main`** — a fresh 2026-06-21 run failed because CB-8's sidebar nav made the icons `aria-hidden`, so the links' accessible names are now `Crypto`/`Equity`/`Mutual Funds`, breaking the cockpit spec's stale `🤖 Crypto`/`📈 Equity`/`📊 Mutual Funds` assertions ([cockpit.spec.ts:232-234](../../../e2e/dashboard/cockpit.spec.ts)). Cross-bet drift, undetected because the spec isn't in CI (#80). Cockpit itself renders fine; 3-string fix (Codex-owned). Runs are also fragile (credential-count `unstable_cache`). Full report: [scan-report.md](scan-report.md). — severity: critical (findings) — owner: PM/operator (resolve as flip ceremony) + Codex (fix the e2e nav names) — area: production-readiness.

---

_Approved by: operator (vivek) on 2026-06-16_

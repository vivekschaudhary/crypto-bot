---
id: RUNBOOK-CB-6
type: runbook
status: active
bet_id: CB-6
owner: operator
created: 2026-06-21
last_reviewed: 2026-06-21
related: [docs/bets/CB-6/slo.md, docs/bets/CB-6/brief.md, docs/bets/CB-6/scan-report.md]
---

# Runbook — CB-6 Crypto Cockpit (operator surface)

> Operating procedures for the `/dashboard` crypto cockpit: the controls, how to read each panel, how to respond to failures, the `LIVE_MODE` flip ceremony, and how to halt fast. **Single-operator tool — the operator IS on-call.** Resolves scan finding PROD_READY-01.

## 1. What CB-6 is (one paragraph)

The cockpit is the operator's single-screen control surface for the DCA bot, per **viewed pair** (`?pair=`). It recomposes the shipped CB-5 read models (live-state, decision-trace, ledger, per-asset P&L) and adds **controls**: Start / Pause / Stop, **Run Now**, and **real-money Manual Overrides** (Buy / Sell 50% / Sell All / Reset). It is **paper-while-dark**: with `LIVE_MODE=false` every order — bot or manual — writes a `dry_run` ledger row and **never calls Coinbase `placeOrder`**. Once `LIVE_MODE=true`, the same controls place **real Coinbase orders**.

## 2. Cockpit map (what each panel means)

| Panel | Source | Reads as |
|---|---|---|
| **Bot Status** | `bot_sessions.status` (CB-5.3) | `● ACTIVE` (running every 15 min) / paused / stopped. Stop = alias for `paused` (no separate state). |
| **Profit / Loss** | `loadCockpitPnl` (CB-6.2/6.7) | Session-scoped invested/buys + position P&L. **Paper badge** shown while dark (figures derive from the `dry_run` ledger via `base_quantity`). |
| **Current Position** | `loadCockpitPosition` (CB-6.1/6.7) | Held qty + avg cost + live price. Paper (from dry_run ledger) while dark; real (Coinbase fills) post-flip. |
| **Signals / Next Action** | `loadCockpitSignals` (CB-6.3) | Latest RSI (strategy-relative zone) + single MA + the decision + reason verbatim. Not session-gated. |
| **Trade Log** | `loadCockpitTradeLog` (CB-6.4) | Orders ⋈ SKIPPED hold-rows (with reasons). `?txStatus=` filter. Look here first for a `failed` order. |
| **Manual Overrides** | `lib/bot/manual-orders.ts` (CB-6.6) | Buy ($ = strategy `position_size_usd`) / Sell 50% / Sell All / Reset. Real money post-flip. |

## 3. Controls reference

| Control | Endpoint | Effect |
|---|---|---|
| Start / Pause / Stop | `POST /api/bot/override` (`pause`/`resume`) | Writes `bot_sessions.status` + an `override_events` row. Stop → `paused`. |
| Reset Session | `POST /api/bot/override` (`reset`) | Ends the current session, starts a new one (multi-row; history preserved). Use after a migration that adds order fields (e.g. 0008). |
| Run Now | `POST /api/run-now` | One immediate bot evaluation via the shared `runBotTick({source:"manual"})`. Operator-auth (rate-limited → 429; unauth → 401). Dry-run while dark. **Outside** `/api/bot/**` by design (keeps the CB-5.3 no-orders invariant intact). |
| Manual Buy / Sell | `POST /api/bot/override` (`buy`/`sell`/`sell_all`) | Real-money order post-flip; `dry_run` row while dark. Requires a client `idempotencyKey` (missing → 400). |

**Caps (hard ceiling, bot + manual combined):** a manual Buy is **rejected before execution** (`cap-reached`) if it would push the session **past** either `per_session_dollar_cap` or `per_session_buy_count_cap` (projected, not at-limit). Caps are set on the strategy.

## 4. The cron tick

- `POST /api/cron/tick` runs **every 15 minutes** (`*/15 * * * *`, `vercel.ts`), `CRON_SECRET`-gated.
- Per tick: read active strategy → fetch ONE_HOUR candles (65-bar lookback) → compute RSI(14)/MA → decide per asset → write `bot_ticks` + `signals` → (post-flip) conditionally `placeOrder`.
- **Per-asset isolation:** a placement failure on one asset does not block the others.

## 5. Diagnostic flows

### Symptom: an order shows `failed` in the Trade Log
1. Open the Trade Log; filter `?txStatus=failed`.
2. Check the reason/trace. Failures are isolated per asset (others continue).
3. If `LIVE_MODE=true`: check Coinbase API status + the rate-limit headroom (global limit **30/s**; logs show `rate_limit.remaining`). A 429 or insufficient-balance surfaces here.
4. Re-attempt via **Run Now** (bot path) or a **Manual Override** (operator path) once the cause is cleared. Idempotency keys prevent duplicate manual orders on retry.

### Symptom: bot "stuck" — no new ticks
1. Confirm Bot Status is `ACTIVE` (not paused/stopped) — a Pause/Stop halts the cron's order path.
2. Check Vercel cron ran (`/api/cron/tick` invocations) + `CRON_SECRET` is set.
3. Check `bot_ticks` for the latest `tick_started_at` (should be on clean :00/:15/:30/:45 boundaries).
4. Force one evaluation with **Run Now** to confirm the pipeline is healthy.

### Symptom: P&L / Position looks wrong (e.g. "$X invested / $0 value")
1. Confirm the **Paper badge** state matches `LIVE_MODE` (paper while dark; real post-flip).
2. Paper figures need orders carrying `base_quantity` (migration 0008). Pre-0008 rows are `NULL` and excluded → **Reset Session** so the new run's dry_run orders populate it (done 2026-06-19; re-do after any future ledger-shape migration).
3. Cross-check against the Ledger (`/dashboard/ledger`) + Decision trace (`/dashboard/trace`).

## 6. 🚨 Emergency halt (fastest first)

1. **Pause** in the cockpit (`POST /api/bot/override` `pause`) — the cron tick stops placing orders immediately.
2. If the UI is unreachable: set **`LIVE_MODE=false`** in Vercel env + redeploy — instantly reverts the entire surface to paper (no real orders, bot or manual).
3. Nuclear: rotate/disable the Coinbase API key (the bot can place nothing without it).

Manual overrides cannot exceed the per-session caps, so a runaway is bounded by `per_session_dollar_cap` even before you intervene.

## 7. The `LIVE_MODE` flip ceremony (operator-only)

**Pre-flip checklist — all must hold:**
- [ ] **Guardrail (product.md KR 1):** ≥ **60 consecutive dry-run sessions** with ≤ 1% deviation between intended vs. actual trade decisions (clock from 2026-06-12 21:45 UTC). Verify via `bot_ticks`/decision-trace consistency.
- [ ] Scan CB-6 Production-Ready findings resolved or accepted (this runbook + `slo.md` + monitoring alerts + a logged rollback test).
- [ ] Cockpit e2e green (the real-money override + Run Now flows) — `e2e/dashboard/cockpit.spec.ts` (green 2026-06-21).
- [ ] Coinbase key funded + correct scopes; rate-limit headroom confirmed.
- [ ] You are at a keyboard and able to monitor for the first live ticks.

**Flip steps:**
1. Set `LIVE_MODE=true` in Vercel project env (production).
2. Redeploy (env change requires a new deployment to take effect).
3. Watch the first cron tick + the Trade Log: confirm the first **real** order is `submitted` (not `failed`), the Paper badge is gone, and Position/P&L reflect real fills.
4. If anything looks wrong → **Emergency halt** (§6, step 2: `LIVE_MODE=false` + redeploy).

**Note:** the bot will not buy on the first post-flip tick unless a signal crosses; sell-suppression/exit rules apply (`lib/ticks/db.ts`).

## 8. Rollback

CB-6 (incl. CB-6.7) is **additive** — migration 0008 added a **nullable column** (`orders.base_quantity`), no destructive schema change. To roll back: **redeploy the prior build**; leave 0008 in place (the column is unused by the old build, harmless). Manual orders persist as audit rows (fine). _Record a rollback test (redeploy prior build in a non-prod or low-risk window) + outcome in an ops DRI entry to close scan finding PROD_READY-04._

## 9. Escalation / on-call

Single operator = on-call. There is no pager rotation. Operator ack of this runbook closes PROD_READY-05 (log the ack date in the brief DRI). For an unrecoverable real-money issue: halt (§6) first, then reconcile against Coinbase's own order history (the source of truth for real fills).

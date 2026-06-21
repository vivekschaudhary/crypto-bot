---
id: SLO-CB-6
type: slo
status: active
bet_id: CB-6
owner: operator
created: 2026-06-21
window_days: 30
related: [docs/bets/CB-6/runbook.md, docs/bets/CB-6/scan-report.md]
---

# SLO — CB-6 Crypto Cockpit

> Service-level objectives for the cockpit surface + the operator mutation endpoints + the bot tick. Single-operator internal tool, so targets are pragmatic (the operator is both user and on-call), but the **money-path** SLIs (order placement, override success) are strict. Resolves scan finding PROD_READY-02. Alert thresholds here define the **monitoring** to wire (PROD_READY-03).

## Measurement

- **Window:** rolling 30 days. **Reporting:** weekly (single-operator cadence), and on-demand via `/measure CB-6`.
- **Sources:** Vercel function logs/analytics (cockpit SSR + endpoint status codes/latency), the app's structured traces (`emitTickTrace`, `emitOrderPlacementTrace`), the `bot_ticks` / `orders` tables (success/fail rows), and Coinbase order history (source of truth for real fills post-flip).
- **Note:** several SLIs only become meaningful **post-`LIVE_MODE`-flip** (real orders). While dark, the equivalent dry-run SLIs apply (a `dry_run` row written = success).

## SLIs, targets, error budgets

| # | SLI | Target | Error budget (30d) | Alert threshold |
|---|-----|--------|--------------------|-----------------|
| 1 | **Cockpit availability** — `/dashboard*` SSR responds 2xx | ≥ 99.0% | ~7.2h/30d | Page on > 3 consecutive 5xx, or availability < 99% in any 1h |
| 2 | **Bot tick reliability** — `/api/cron/tick` runs on schedule, no error (extends CB-4's ≥99% metric) | ≥ 99.0% of scheduled `*/15` ticks | ~7 missed/failed ticks per 30d (~2,880 scheduled) | Alert on 2 consecutive missed/failed ticks, or a tick `tick_started_at` gap > 30 min |
| 3 | **Run Now success** — `POST /api/run-now` returns 2xx (excl. legitimate 401/429) | ≥ 99% | ~1% of invocations | Alert on any 5xx, or 429 rate > 5% |
| 4 | **Safe-override success** — `POST /api/bot/override` (pause/resume/reset) 2xx | ≥ 99.5% | ~0.5% | Alert on any 5xx (controls must be reliable — they're the halt path) |
| 5 | **Real-money order placement success** _(post-flip)_ — manual + bot `placeOrder` → `submitted` (not `failed`), excl. legitimate `cap-reached` / insufficient-balance | ≥ 99% | ~1% of order attempts | **Page** on ANY `status='failed'` real-money order row; alert on failure rate > 1% |
| 6 | **Order-intent fidelity** _(flip gate, product KR 1)_ — deviation between intended vs. actual trade decisions | ≤ 1% over ≥ 60 consecutive dry-run sessions | n/a (flip precondition, not steady-state) | Block the flip if not met |
| 7 | **Coinbase rate-limit headroom** — requests stay under the global limit | 0 rate-limit (429) faults from Coinbase | 0 (CB-4 KR 3 posture) | Alert on any Coinbase 429, or sustained `rate_limit.remaining` < 5/30 |

## Alerting to wire (PROD_READY-03)

Minimum viable monitoring for a single-operator tool — surface to the operator's status channel:
1. **Any `orders.status='failed'`** row (post-flip: page; pre-flip: notify) — the highest-signal money-path alarm.
2. **5xx** from `/api/run-now` or `/api/bot/override` (the control + halt paths).
3. **Tick gap** — no new `bot_ticks` row for > 30 min (missed cron / pipeline stall).
4. **Coinbase 429** or low rate-limit headroom.
5. **Cockpit 5xx** spike.

Until a dashboards/alerts provider is wired, the operator's manual check is: scan the **Trade Log `?txStatus=failed`** + the latest `bot_ticks` timestamp daily. _Wiring at least alerts #1–#3 is recommended before the `LIVE_MODE` flip._

## Out of scope

- Latency SLOs beyond "responds" (single-operator; not latency-sensitive).
- Adoption/business SLIs — those live in the bet's `key_metric` + the OKRs (90-day Sharpe ≥ 1.2× naive DCA; override rate ≤ 20%), measured via `/measure`, not here.

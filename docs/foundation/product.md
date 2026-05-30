---
id: FOUNDATION-PRODUCT
type: foundational-product
version: 1
status: approved
created: 2026-05-29
author: PM
sources:
  - https://docs.google.com/document/d/1-xg7DgAepJmEjodPjNtmGbfR6HgYrIrbTIkM_pmea7Y
  - docs/foundation/research.md
parent: null
key_metric:
  name: Bot-managed risk-adjusted return vs naive-DCA baseline (Sharpe ratio, 90-day rolling)
  baseline: 1.0x (naive Coinbase recurring-buy DCA on same capital, same window)
  target: >= 1.2x naive-DCA Sharpe over rolling 90-day window
  source: bot session ledger + Coinbase trade history (locally derived; no external dependency)
measurement_window_months: 12
check_in_cadence: quarterly
---

# Foundational Product Bet — Signal-Driven DCA Bot for Coinbase

> A signal-driven and arbitration bot for retail Coinbase traders who want automation **with** visibility — not in spite of it. Dry-run by default. Manual overrides always one click away.

## Vision

A retail crypto holder who already trades top-5 cryptos on Coinbase has two bad options today: (1) Coinbase's native Recurring Buy, which is too dumb to capture dips and charges ~2.49% per transaction; or (2) full-featured bot platforms like 3Commas, Pionex, or Cryptohopper, which are black-box enough that a discipline-seeking trader can't fully trust them with capital. This product lives in the gap: signal-driven entries on dips, automated take-profit on rips, with dry-run as the default mode, full decision-trace observability, and manual overrides at every level. If we succeed, the operator trades with the calm of a disciplined system and the confidence of someone who can see every signal and every decision the bot considered.

## Target users / personas

**Primary persona — "Discipline-seeking retail Coinbase trader."**

Characteristics:

- Holds and trades top-5 cryptocurrencies (BTC, ETH, plus a small set chosen by the operator) on Coinbase Advanced Trade
- Has been burned by emotional buying (FOMO on rips) and emotional selling (panic on dips)
- Tried Coinbase's native Recurring Buy, found it too dumb (market-only, no signals, high fees)
- Tried — or actively distrusts — black-box bot platforms (3Commas, Pionex, Cryptohopper) because "set and forget" is exactly what they want to avoid
- Wants: signal-driven dip-buying, automated take-profit, hard caps, dry-run safety, full decision trace, manual override at every step
- **Initial audience is n=1 (the operator). Bet is scoped to single-operator personal use.** No multi-tenant. No social/copy features.

Anti-persona (NOT the user):

- Day traders / scalpers (the cadence is wrong for them)
- Leverage / derivatives traders (out of scope)
- Pure passive HODLers (they don't need this)
- "Set and forget" automators (philosophically opposed to the product)

## Market positioning

Between two well-defined poles:

|                                | Coinbase Recurring Buy | **This product**      | 3Commas / Pionex / Cryptohopper |
| ------------------------------ | ---------------------- | --------------------- | ------------------------------- |
| Signal-driven entries          | no                     | **yes (RSI + MA)**    | yes                             |
| Coinbase-native UX             | yes                    | **yes**               | no (broad, multi-exchange)      |
| Dry-run as default             | n/a                    | **yes**               | opt-in                          |
| Full decision-trace visibility | no                     | **yes**               | partial                         |
| Manual override at every level | n/a                    | **yes**               | partial                         |
| Multi-tenant / SaaS            | n/a                    | **no (out of scope)** | yes                             |
| Cost                           | ~2.49% per txn         | self-hosted           | $0-$110+/mo                     |

See [`docs/foundation/research.md`](research.md) §2 for the full competitive landscape with citations.

## North-star metric

**Bot-managed risk-adjusted return vs naive-DCA baseline — Sharpe ratio over rolling 90-day windows.**

Target: bot Sharpe **≥ 1.2x** the Sharpe of a naive Coinbase Recurring Buy on the same capital and same window.

Why this metric:

- **Falsifiable** — either the bot's risk-adjusted return beats the dumb-DCA baseline or it doesn't. No vanity room.
- **Comparison group is what the operator would otherwise do** — naive DCA is the counterfactual, so beating it is the real win condition
- **Risk-adjusted, not absolute** — a bot that produced 2x returns with 4x volatility would fail this metric, which is correct (not what the operator wants)
- **Locally derivable** — no external dashboard dependency; session ledger + Coinbase trade history is enough

Sharpe > 1.0 is the practitioner-acceptable threshold for crypto strategies, > 2.0 is "excellent" ([research.md §3](research.md#3-technical-feasibility--prior-art)). Targeting 1.2x naive-DCA is honest, not heroic — it claims the bot is meaningfully but not dramatically better.

## Strategic OKRs

### Annual (12 months from approval)

**Objective: Ship a bot the operator trusts with real capital that outperforms naive DCA on risk-adjusted return.**

- **KR 1:** Bot reaches "live mode" — ≥ 60 consecutive dry-run sessions with ≤ 1% deviation between intended vs. actual trade decisions
- **KR 2:** Bot 90-day rolling Sharpe ≥ 1.2x naive-DCA-baseline Sharpe (measured on same capital, same window)
- **KR 3:** Operator manual-override rate ≤ 20% of bot decisions over any 30-day window (proxy: did the bot earn trust, or did the operator second-guess it?)
- **KR 4:** Zero unintended live-mode trades (safety guardrail — see Guardrails section)

### Current quarter (Q2 2026 — through end of July)

**Objective: Get the foundation in place — manual trading pages live, dry-run bot ticking, observable.**

- **KR 1:** Manual trading pages functional with 5-second price polling, two-step order placement, open-orders + trade-history views
- **KR 2:** DCA bot ticks every 15 minutes in dry-run mode with complete decision log (RSI, MA, signal source, intended action, reason)
- **KR 3:** ≥ 30 consecutive uninterrupted dry-run sessions completed (no crash, no missed cron, no API rate-limit fault)
- **KR 4:** Dashboard surfaces all bot state in real time: status, balance, average cost, total invested, buy count, last signal, full trade log

## Hypothesis (the bet)

If we build a signal-driven DCA bot with **dry-run-first safety rails** and **full decision-trace visibility** on Coinbase Advanced Trade, then **a discipline-seeking retail Coinbase trader** will achieve **risk-adjusted return (90-day rolling Sharpe) ≥ 1.2x the same operator's naive-DCA baseline**, with **operator manual-override rate ≤ 20%**, measured **within 12 months** of moving from dry-run to live mode.

## Identity & Access Posture

The product touches the operator's real Coinbase credentials and real-money trading capability. Auth posture is a foundational product decision, not an implementation detail to be punted to the architecture phase.

### Audience access

**Single operator (n=1).** No multi-tenant by design. See [§ Out of scope (NEVER)](#out-of-scope-never) — "Multi-tenant / SaaS." Any expansion of audience triggers a foundation amend.

### Data classification

**Operator-only, with high real-money sensitivity.** The sensitive assets are:

- Coinbase API keys (Trade-only scoped at the Coinbase platform layer)
- Trade ledger (immutable historical record of every order + fill)
- Dry-run vs live-mode env flag (the load-bearing safety primitive)
- Bot session state and signal history (operator-private but lower sensitivity)

No third-party PII. No regulated user-data category — the operator is the only user; their own data is theirs.

### Sensitive operations enumerated

Operations that must not be reachable by an unauthenticated party:

- Read Coinbase account balances and positions
- Place real-money buy/sell orders (when live-mode env flag is set)
- Read/write trade ledger and bot session history
- Toggle dry-run vs live mode (handled at env-var layer in the platform; exposure of the flag's state is sensitive)
- Override the bot (force buy, sell 50%, sell all, reset session)
- View signal decision-trace history (lower sensitivity but operator-private)

### Auth requirement

**Required everywhere** except the cron tick endpoint, which is gated by a `CRON_SECRET` header (platform-injected and verified at the route handler).

### Credential ownership posture

**Operator-owned credentials. No third-party identity provider in the auth path.** This is a deliberate choice: a third-party IdP (Google/GitHub OAuth) would put an external party in the auth chain for a single-operator real-money tool, expanding the attack surface beyond what the operator controls. Passkey credentials live on the operator's devices ([research.md §5.3](research.md#5-trends--direction) — passkey is the 2026 default for capital-touching tools).

### Failure mode if auth is bypassed

An attacker with a valid session reaches the encrypted Coinbase API key (server-side only; never sent to client) and the bot-control endpoints. **Even in the worst case, capital exfiltration is not possible**: Coinbase API keys are created with Trade-only permission (no Withdraw, no Transfer). Worst case is unwanted trades on the operator's own positions, bounded by per-session deployment caps and the reserve floor (architecture-enforced). Bot-control endpoints (pause/resume/override/reset) affect only the bot's behavior, not the underlying Coinbase account state directly.

### Failure mode if legitimate user is locked out

Dashboard and control surface become inaccessible. **The bot continues to run on its last config** until either (a) the operator manually pauses it from the Coinbase web UI by disabling the API keys, or (b) the operator rotates the `LIVE_MODE` env var at the platform layer. Worst case: the operator can't pause the bot during a regime change for as long as it takes to recover access. Mitigation: multi-device credential registration + offline backup recovery code ensures lockout is recoverable in minutes, not days.

### Primary access posture (named explicitly)

**Single-operator product with operator-owned passkey credentials (no third-party identity provider in the auth path), multi-device passkey registration plus single-use offline backup recovery code, and a `CRON_SECRET`-gated cron endpoint. All sensitive operations require an authenticated session; no public/anonymous surface touches credentials or capital.**

The architecture's Foundational Identity & Access Posture section (produced by `/setup-foundation-architecture`) will implement this product-level declaration.

## Defensibility / Moat

Full 9-type evaluation with citations and rationale lives in [`docs/foundation/research.md`](research.md#6-moat--defensibility--full-9-type-evaluation). Summary verdict table:

| Moat type                       | Applies?    | Evidence / rationale                                                                                                                              |
| ------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Network effects                 | **no**      | Single-operator product. No multi-user network, no marketplace, no copy-trading by design.                                                        |
| Switching costs                 | **partial** | Local config + session ledger. Re-encoding the operator's risk model on 3Commas/Pionex is real friction but low-double-digit hours — not durable. |
| Data / proprietary intelligence | **no**      | RSI/MA are public indicators; Coinbase data is API-public. No proprietary data accrues.                                                           |
| Scale economics                 | **no**      | Solo project; no scaling cost curve. Not multi-user.                                                                                              |
| Brand / trust                   | **partial** | Operator trusts code they wrote and observed in dry-run — real for n=1, not transferable.                                                         |
| Regulatory / certification      | **no**      | Personal trading; no regulated-entity status sought. Explicit non-goal.                                                                           |
| Distribution / channel          | **no**      | No distribution; direct-to-self.                                                                                                                  |
| Talent / domain expertise       | **partial** | Operator's encoded risk model and Coinbase-quirk knowledge — real for personal product, not a business moat.                                      |
| Speed / iteration velocity      | **partial** | Solo-dev iteration speed, used sparingly per [researcher framework warnings](../../compass/roles/researcher.md) (historically over-claimed).      |

**Primary moat(s) we're betting on:** **None — and that is deliberate.** As scoped (single operator, personal product), no durable competitive moat exists. The bet is a _process moat_ for one user: tools shaped to one operator's risk model with dry-run discipline that institutional/black-box products structurally cannot match. This is honest, not a hedge.

**If the bet later pivots to SaaS** (out of scope for this version — see Scope), the legitimate moat candidates to build would be: (a) signal-marketplace network effects, (b) Coinbase deep-integration switching cost, (c) regulated-entity compliance. None of those exist today. Any pivot triggers a foundation amend per `/setup-product`.

**Defensibility proxy metrics (where applicable):**

- **Retention** (proxy for switching costs): n/a — single-user product
- **DAU/MAU ratio** (proxy for habituation): operator's dashboard-view-frequency (informal proxy)
- **Time-to-replicate** (estimated months for a competitor): low (weeks). Acknowledged. Not relying on it.

## Guardrail metrics

What must NOT degrade for this bet to count as won:

- **Max drawdown** stays within **1.5x** the naive-DCA baseline drawdown over any 90-day window
- **Unintended live-mode trades:** **0**. The dry-run-first invariant is non-negotiable. One unintended live trade is a P0 incident regardless of P&L outcome.
- **Coinbase API errors** (4xx/5xx not handled gracefully): < 0.5% of bot ticks. A 15-min cron should never get rate-limited under normal conditions.
- **Reserve floor breaches:** **0**. The bot must never drop spot balance below operator-configured minimum.
- **Per-session cap breaches:** **0**. Hard caps on total INR/USD deployed and max buys per session must hold.
- **Auth bypasses on capital-touching surfaces:** **0**. Any session that reaches a Coinbase-key or bot-control endpoint without an `auth_sessions`-validated session is a P0 security incident.

## Scope

### In scope

- **Single exchange: Coinbase Advanced Trade** (REST + WebSocket where appropriate; cron-driven 15-minute tick)
- **Top-5 cryptocurrencies** (specific set chosen by operator — initial defaults TBD; expected to include BTC, ETH and 3 others)
- **Manual trading pages** — live price (5s polling), balances (15s refresh), two-step order placement, open-orders, trade history (manual vs bot logged separately)
- **DCA bot** with signal-driven entries (RSI < 35 primary, RSI < 25 double-size, price < 20MA + RSI < 45 trend dip) and signal-driven exits (RSI > 65 + ≥ 1.5% profit → sell 50%, RSI > 75 + ≥ 2.5% profit → sell 80%)
- **Dry-run mode as default**, env-var flip to enter live mode
- **Auto-pause on drawdown threshold** from average cost
- **Hard caps** on total session deployment and max buys
- **Reserve floor** — bot never drops spot balance below configured minimum
- **Bot dashboards** — real-time state, full trade log with reasons + RSI/MA at decision time, dry-run badge
- **Manual override buttons** — pause, resume, force buy, sell 50%, sell all, reset session (session reset = ledger only, no exchange interaction)
- **Passkey-based authentication** (operator-owned credentials; multi-device + offline backup recovery code — see [§ Identity & Access Posture](#identity--access-posture))
- **Web-only UI** (single operator, single device class)

### Out of scope (NEVER)

- Multi-exchange aggregation (Coinbase only — explicit non-goal)
- Derivatives, futures, options, perpetuals
- Leverage / margin trading
- Custodial trading on behalf of others
- Multi-tenant / SaaS — strict single-operator product
- Social / copy / marketplace / leaderboard features
- "New gem" / altcoin discovery (top-5 only — operator picks)
- AI / ML signal generation (deterministic rules only; explainability is a feature)
- Mobile app (web-only)
- Email / SMS / push alerts (dashboard is the only surface — by design)
- Multi-account / multi-portfolio support
- Backtesting framework UI (operator-side analysis is separate from the running bot)
- Always-on processes (cron-driven, not long-lived; simpler operationally — see [research.md §3.2](research.md#3-technical-feasibility--prior-art))
- Third-party identity providers in the auth path (no Google/GitHub OAuth, no managed passkey SaaS — operator-owned credentials only per [§ Identity & Access Posture](#identity--access-posture))

## Check-in log

_Populated automatically by `/measure` cron once `compass/config.yaml` measurement is wired._

## DRI Log

### Decisions

- [2026-05-29] [PM] Single-exchange scope (Coinbase only); no multi-exchange aggregation in v1
  - **Rationale (required):** the operator's holdings live on Coinbase; complexity budget for v1 is bounded by single exchange. Multi-exchange aggregation has fundamentally different abstractions (rate limits, auth, order semantics differ per exchange) and would balloon the surface area before the dry-run discipline is even validated.
  - **Area (required, tag):** product
  - **Alternatives considered (required):** multi-exchange aggregator from day one (rejected — too complex, ships nothing); Coinbase + one other (rejected — same problem at smaller scale)
  - **Reversibility:** medium (architectural choices in v1 — single-exchange auth, single rate-limit model — will need refactoring if expanded; ~weeks of work, not days)

- [2026-05-29] [PM] Deterministic signal rules (RSI + MA only); no ML / AI signal generation in v1
  - **Rationale (required):** the persona explicitly distrusts black-box automation. Explainability of every signal is a _feature_ of this product, not a constraint to work around. ML signals are opaque by nature, which breaks the dry-run trust loop.
  - **Area (required, tag):** product
  - **Alternatives considered (required):** ML-trained signal classifier (rejected — opacity defeats the purpose); rules + ML hybrid (rejected for v1 — adds complexity before the deterministic baseline is even validated)
  - **Reversibility:** easy (rules can later be augmented; nothing in v1 architecture precludes it)

- [2026-05-29] [PM] Web-only UI; no mobile, no Telegram, no email/SMS
  - **Rationale (required):** solo developer, single operator. Each additional surface doubles maintenance and creates a divergent decision surface (alerts on phone but not dashboard means the operator might miss signals or react impulsively). Single source of truth is the dashboard.
  - **Area (required, tag):** product
  - **Alternatives considered (required):** Telegram bot for alerts (rejected — encourages reactive decisions); email digests (rejected — adds notification surface without operator benefit); mobile app (rejected — solo-dev complexity budget)
  - **Reversibility:** easy

- [2026-05-29] [PM] Dry-run as default mode; live mode requires explicit env-var flip
  - **Rationale (required):** the failure mode the product is designed to prevent is "operator gets burned by an undertested bot." Default-safe means even a fresh deploy cannot transact on the exchange. The env-var flip is intentionally inconvenient — it's a deliberate ceremony, not a UI toggle. Practitioner consensus is that paper-trading before real capital is required, not optional ([research.md §5.2](research.md#5-trends--direction)).
  - **Area (required, tag):** security / product
  - **Alternatives considered (required):** UI toggle for dry-run/live (rejected — too easy to flip accidentally); separate paper-trading account at Coinbase (rejected — Coinbase doesn't offer this; would require sandbox API which is its own surface)
  - **Reversibility:** hard (changing the default mode after the product ships re-trains operator habits; the dry-run-first stance is a load-bearing product principle, not a configuration)

- [2026-05-29] [PM] Cron-driven 15-minute tick; no always-on websocket bot process
  - **Rationale (required):** simpler operationally (no long-lived process to monitor); lower API load (well within Coinbase free-tier rate limits per [research.md §3.2](research.md#3-technical-feasibility--prior-art)); blast radius is bounded per tick. Trades at 15-min cadence are appropriate for DCA — sub-minute reaction time isn't valuable for this strategy.
  - **Area (required, tag):** architectural
  - **Alternatives considered (required):** always-on websocket-driven bot (rejected — more complex, no signal-cadence benefit); 1-min cron (rejected — RSI/MA on 1-min noise is over-trading); hourly cron (rejected — misses dips that resolve faster)
  - **Reversibility:** medium (cron cadence is data; full architectural shift to always-on is ~weeks)

- [2026-05-29] [PM] Passkey-based authentication with operator-owned credentials; no third-party identity provider in the auth path
  - **Rationale (required):** the product touches the operator's real Coinbase API keys and real-money trading capability. A third-party IdP (Google/GitHub OAuth) puts an external party in the auth chain of a real-money tool, expanding attack surface beyond what the operator controls. Passkeys are phishing-resistant, hardware-backed, and operator-owned — structurally aligned with 2026 NIST/industry best practice for capital-touching tools ([research.md §5.3](research.md#5-trends--direction)). This is the **primary access posture** named in [§ Identity & Access Posture](#identity--access-posture).
  - **Area (required, tag):** security / product
  - **Alternatives considered (required):** OAuth via Google/GitHub + email allowlist (rejected — third-party IdP in auth path); managed passkey service e.g. Hanko/Stytch (rejected — third-party vendor in auth path contradicts the operator-owned posture); password + TOTP (rejected — phishable; weaker than passkey for the same effort)
  - **Reversibility:** medium (switching auth implementation requires re-registering credentials and migrating session data; the _posture_ of operator-owned-no-IdP is harder to change since it's load-bearing on product trust)

- [2026-05-29] [PM] North-star metric is risk-adjusted return (Sharpe ratio) vs naive-DCA, not absolute return
  - **Rationale (required):** absolute return is a vanity metric in crypto — easy to fake with high-volatility positions. Risk-adjusted return against the counterfactual (what the operator would otherwise do) is the actual win condition. Sharpe is the practitioner-standard metric ([research.md §3.3](research.md#3-technical-feasibility--prior-art)).
  - **Area (required, tag):** product / measurement
  - **Alternatives considered (required):** absolute return (rejected — vanity); Sortino (rejected — slightly better but practitioner-less-standard, harder to communicate); win rate of bot trades (rejected — easy to game with small profitable trades + tail risk)
  - **Reversibility:** medium (changing the north-star metric mid-bet is allowed but expensive; would force re-baselining)

- [2026-05-29] [PM] Skip mirroring to Confluence/Jira; document the skip per "no silent skips" principle
  - **Rationale (required):** `compass/config.yaml` names `confluence` and `jira` as connectors, but no MCP credentials are wired and no team consumes the mirrored artifacts (solo operator). Mirroring a single-user bet to a multi-user collaboration tool would be ceremony without function. Per AGENTS.md principle #3, this skip is logged explicitly rather than silently bypassed.
  - **Area (required, tag):** process
  - **Alternatives considered (required):** mirror anyway with no consumers (rejected — overhead without function); wire up Confluence/Jira mirroring (rejected for v1 — out of scope); use GitHub Issues as a lightweight mirror (rejected — git history + DRI log already serves)
  - **Reversibility:** easy (can be wired later by amending `compass/config.yaml`)

### Risks

- [2026-05-29] [PM] Strategy edge erodes under regime change (e.g., prolonged sideways market or persistent uptrend where RSI rarely dips below 35)
  - **Likelihood (required):** high
  - **Impact (required):** medium (the bet underperforms; the operator notices via Sharpe and pauses)
  - **Mitigation (required):** quarterly Sharpe check-in against naive-DCA baseline is mandatory; auto-pause on drawdown threshold; willingness to mark the bet `learning` or `inconclusive` rather than `won` if regime doesn't cooperate
  - **Area (required, tag):** product

- [2026-05-29] [PM] Operator drift back to emotional trading via manual override — the discipline this product enforces is voluntary
  - **Likelihood (required):** medium
  - **Impact (required):** high (the operator's emotional override is precisely the failure mode the product exists to prevent; if it returns, the bet is moot)
  - **Mitigation (required):** Annual KR3 explicitly tracks manual-override rate ≤ 20%; dashboard surfaces override history; quarterly check-in includes self-honesty review on override patterns
  - **Area (required, tag):** product

- [2026-05-29] [PM] Live-mode env var flipped accidentally, causing unintended real-money trade
  - **Likelihood (required):** low
  - **Impact (required):** high (loss of capital + breaks the dry-run discipline that's load-bearing for the product principle)
  - **Mitigation (required):** explicit env var (not a UI toggle); dashboard banner clearly indicates live vs dry-run mode; live-mode entry is a deliberate ceremony; guardrail metric tracks "unintended live trades" → 0 is mandatory
  - **Area (required, tag):** security

- [2026-05-29] [PM] Coinbase API rate-limit changes or auth/permission changes break 15-min cadence
  - **Likelihood (required):** low (cron-driven design keeps API load well within free-tier limits per [research.md §3.2](research.md#3-technical-feasibility--prior-art))
  - **Impact (required):** medium (missed ticks degrade signal responsiveness but don't lose capital)
  - **Mitigation (required):** retries + exponential backoff (standard Coinbase practice); error-rate guardrail metric; cron-driven design = no long-lived connection state to lose
  - **Area (required, tag):** technical

- [2026-05-29] [PM] No durable competitive moat — bet is a process moat for one operator, not a defensible business
  - **Likelihood (required):** certain (acknowledged in Defensibility section)
  - **Impact (required):** low under current scope (single operator, personal product). Would be high if scope shifts to SaaS without rebuilding the moat story.
  - **Mitigation (required):** explicit "multi-tenant / SaaS" listed as out-of-scope (NEVER); any future pivot triggers a foundation amend per `/setup-product`; researcher findings on legitimate-moat-candidates documented for that future amend
  - **Area (required, tag):** strategic

- [2026-05-29] [PM] Aggregate DCA-outperformance citations (Vanguard 14%, BTC lump-sum 68%) describe historical aggregates — operator's specific 90-day window may underperform
  - **Likelihood (required):** medium
  - **Impact (required):** medium
  - **Mitigation (required):** dry-run phase before live capital; quarterly Sharpe re-evaluation; bet outcome can resolve as `learning` not just `won` / `inconclusive`
  - **Area (required, tag):** product

- [2026-05-29] [PM] Total loss of all registered passkeys AND the offline backup recovery code — operator locked out with no recovery path except manual DB intervention
  - **Likelihood (required):** low (multi-device passkey registration + offline backup code is the 2026 NIST-AAL2 recovery story per [research.md §5.3](research.md#5-trends--direction))
  - **Impact (required):** medium (capital is not at risk because Coinbase keys are Trade-only scoped at the Coinbase layer; bot continues running on its last config; recovery is operationally annoying but bounded)
  - **Mitigation (required):** multi-device registration enforced at setup (≥2 devices); offline backup code generated and confirmed-stored at setup; absolute-last-resort manual DB intervention path documented in the architecture's scaffold runbook (created in Phase B of `/setup-foundation-architecture`)
  - **Area (required, tag):** security

### Issues

- [2026-05-29] [PM] North-star Sharpe target (1.2x naive DCA) is a defensible-but-unvalidated estimate until 90 days of dry-run data exists
  - **Severity (required, mandatory):** P2
  - **Owner (required, mandatory):** PM
  - **Status:** open
  - **Area (required, tag):** product / measurement
  - **Resolution (filled when closed):** [to be filled after Q3 2026 quarterly check-in with first 90 days of dry-run data]

- [2026-05-29] [PM] Specific top-5 crypto list is not pinned in this artifact — operator-choice, expected to include BTC + ETH plus 3 others
  - **Severity (required, mandatory):** P3
  - **Owner (required, mandatory):** PM (operator-resolved)
  - **Status:** open
  - **Area (required, tag):** product
  - **Resolution (filled when closed):** [to be filled when operator pins the list during /setup-foundation-architecture or first /create-brief]

---

_Approved by: <Vivek> on <5/29>_

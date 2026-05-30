---
id: FOUNDATION-ARCHITECTURE-RESEARCH
type: research-findings
version: 1
status: proposed
created: 2026-05-29
author: Enterprise Architect
parent: FOUNDATION-ARCHITECTURE
sources:
  - docs/foundation/product.md
  - docs/foundation/research.md
---

# Foundational Architecture Research

Supporting evidence for `docs/foundation/architecture.md`. Organized by the EA 6-category architecture-research framework (`compass/roles/enterprise-architect.md` → "Where to research") + signal consultation. Every claim cited or marked `n/a — <reason>`.

## Workload derivation (from product bet)

Derived from `docs/foundation/product.md` (no MAU/concurrency stated directly — derived per [EA role § "When the product bet is vision-only on workloads"](../../compass/roles/enterprise-architect.md)):

- Concurrent users: **1** (n=1 by design — operator only)
- Read mix: **dashboard polling-heavy** (5s price; 15s balances) + **cron-driven bot reads** (RSI/MA history every 15min)
- Write mix: **low** — manual orders (rare), bot orders (≤ ~10/day at cap), tick log (96/day)
- Data volume: **small** — projected < 100MB / year (orders + ticks + signals + sessions)
- Geographic distribution: **1 region** (single operator)
- Latency budget: human-perceptible only (dashboard p95 < 500ms is generous)
- Cron precision: **must hit 15-min cadence reliably** (missed tick = missed signal)
- Auth surface: **passkey-only**, operator-owned credentials, multi-device + offline backup (per [product.md § Identity & Access Posture](product.md#identity--access-posture))

## 1. Prior art

**1.1 Vercel + Next.js + a managed Postgres (Supabase chosen for this project) is the documented modern solo-developer stack.** Multiple 2026 walkthroughs treat Vercel + Next.js as the default solo-dev frontend/backend combination; for the DB layer the field is a near-wash between Supabase Postgres, Neon Postgres, and Turso libSQL on workload fit at n=1. **The deciding factor here is operator-vendor-consolidation** — operator already has a Supabase account, so adopting Supabase removes a vendor from the stack vs. adopting Turso or Neon as new vendors. Supabase Postgres is consumed DB-only; Supabase Auth (GoTrue) is explicitly NOT used (would violate the product bet's "no third-party identity provider in the auth path" posture per [product.md § Identity & Access Posture](product.md#identity--access-posture)). ([Supabase Postgres docs](https://supabase.com/docs/guides/database/overview); [Supabase pricing](https://supabase.com/pricing); [Bringing SQLite to Vercel Functions with Turso](https://turso.tech/blog/serverless) — Turso evaluated and rejected on vendor-consolidation grounds)

**1.2 The "cron-driven serverless trading agent" pattern is well-trodden.** Tutorials walk through `app/api/cron/<name>/route.ts` + a `crons` array in Vercel project config as the canonical Next.js App Router cron pattern. Vercel injects a `vercel-cron/1.0` user agent and an `x-vercel-cron-schedule` header for verification. ([Vercel Cron Jobs docs](https://vercel.com/docs/cron-jobs); [Next.js App Router cron tutorial](https://medium.com/@devadeelahmad/how-to-create-a-cron-job-in-next-js-using-the-app-router-9ded12f1e838); [LogRocket — Automate repetitive tasks with Next.js cron jobs](https://blog.logrocket.com/automate-repetitive-tasks-next-js-cron-jobs/))

**1.3 Coinbase has multiple actively-maintained TypeScript SDK options.** As of early 2026: (a) `coinbase-samples/advanced-sdk-ts` — community-based, maintained by Coinbase samples team; (b) `coinbase-api` (tiagosiebler) — actively maintained (last release ~3 months ago as of Feb 2026), comprehensive Advanced Trade + WebSocket coverage, end-to-end tests; (c) `coinbase-advanced-node` (JoshJancula) — fork of `coinbase-pro-node`, maintained. The Coinbase developer team announced their official Advanced Trade TypeScript SDK to "reduce the complexity of building on top of the Advanced Trade API." ([Introducing the Coinbase Advanced TypeScript SDK](https://www.coinbase.com/blog/introducing-the-coinbase-advanced-typescript-sdk); [coinbase-samples/advanced-sdk-ts](https://github.com/coinbase-samples/advanced-sdk-ts); [tiagosiebler/coinbase-api](https://github.com/tiagosiebler/coinbase-api); [JoshJancula/coinbase-advanced-node](https://github.com/JoshJancula/coinbase-advanced-node))

**1.4 Passkey / WebAuthn stack — SimpleWebAuthn is the production-stable choice; Auth.js Passkey is still experimental as of early 2026.** Auth.js v5's WebAuthn/Passkey provider is documented but explicitly flagged "experimental, not yet recommended for production use" in the official Auth.js docs ([Auth.js WebAuthn](https://authjs.dev/getting-started/authentication/webauthn); [Auth.js Passkey provider page](https://authjs.dev/getting-started/providers/passkey)). Underneath it sits SimpleWebAuthn — the production-grade library used by Auth.js and by most non-Auth.js implementations of WebAuthn in the Node ecosystem ([SimpleWebAuthn](https://simplewebauthn.dev)). For a real-money tool, opting into a beta API surface is the wrong trade; the architecture uses SimpleWebAuthn directly + a custom signed-cookie session layer (~50-80 LOC for n=1). NIST SP 800-63-4 (finalized July 2025) classifies synced passkeys (iCloud Keychain / Google Password Manager / Windows Hello) at AAL2, making multi-device passkey registration a legitimate primary-recovery path ([Passkeys at Scale 2026 Playbook](https://securityboulevard.com/2026/03/passkeys-at-scale-the-complete-enterprise-deployment-playbook-2026/)).

## 2. Benchmarks

**2.1 Supabase Postgres free tier is well within performance envelope for this workload.** Free tier: 500MB database, unlimited API requests, 1GB egress, 7-day backup retention; projects pause after 7 days of inactivity (a non-issue because our 15-min cron keeps the project active). Our projected workload: 96 ticks/day × ~5 reads/tick = ~480 reads/day = ~14k reads/month + ~5MB data growth/year — **multiple orders of magnitude under all ceilings**. Migration to Supabase Pro ($25/mo) only becomes relevant if scope shifts dramatically. ([Supabase pricing](https://supabase.com/pricing); [Supabase free-tier docs](https://supabase.com/docs/guides/platform/billing-on-supabase))

**2.2 Coinbase Advanced Trade API rate limits are well above our request rate.** Public market-data tier ~10 req/sec; authenticated endpoints higher. Our cron is 4 invocations/hour × ~5 API calls per tick = ~20 req/hour = ~0.006 req/sec — **3 orders of magnitude under the rate-limit ceiling**. ([Coinbase Developer Platform — Rate Limits](https://docs.cdp.coinbase.com/coinbase-app/advanced-trade-apis/websocket/websocket-rate-limits); already cited in [research.md §3](research.md#3-technical-feasibility--prior-art))

**2.3 Vercel cron timing precision differs by plan.** Hobby plan crons fire "anytime within the specified hour" (not minute-precise); Pro plan crons fire "within the minute specified" — i.e., a `*/15 * * * *` schedule on Pro fires at HH:00, HH:15, HH:30, HH:45 reliably. **Hobby plan rejects `*/15 * * * *` at deploy time** — only daily crons are accepted. ([Vercel Cron Jobs Usage & Pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing); [CronTool Vercel cron limits](https://tool.crontap.com/vercel-cron-jobs); [Vercel Hobby Plan limits](https://vercel.com/docs/plans/hobby))

**2.4 Passkey authentication is sub-second end-to-end.** Server-side WebAuthn verification (SimpleWebAuthn) is sub-millisecond; the round-trip cost is dominated by browser ↔ authenticator hardware (~100-300ms typical for Touch ID / Face ID / Windows Hello). For dashboard UX this is imperceptible. ([SimpleWebAuthn benchmarks](https://simplewebauthn.dev))

## 3. Vendor health

**3.1 Vercel** — public, growing, well-funded; Next.js + Vercel is the dominant React-fullstack stack; release cadence is weekly+. Next.js 16 LTS is current default. ([Vercel pricing/plans](https://vercel.com/pricing); knowledge-update injection at session start)

**3.2 Supabase** — well-funded, multi-product platform; Postgres-as-a-service is their core. Postgres is the most portable DB engine on earth (escape hatch always exists — any Postgres host accepts the same SQL); Supabase tooling (CLI, Studio, SQL Editor) is mature. Free tier is genuinely free for our scale, and the operator already has an account — vendor-consolidation gain. **Supabase Auth (GoTrue) and Supabase RLS are NOT used** by this architecture per [architecture.md § DRI Decisions](architecture.md#decisions) — Supabase is consumed strictly as a managed Postgres host. ([Supabase pricing](https://supabase.com/pricing); [Supabase Postgres docs](https://supabase.com/docs/guides/database/overview))

**3.3 Sentry** — incumbent error-tracking platform; free Developer plan with 5,000 errors/month; Next.js SDK is first-class with framework-aware instrumentation. Standard practice across the ecosystem. ([Sentry Free Plan 2026](https://sentrypricing.com/free-plan); [Sentry Next.js platform docs](https://docs.sentry.io/platforms/javascript/guides/nextjs/))

**3.4 Coinbase TypeScript SDK ecosystem** — multiple maintained options; the existence of three actively-developed SDKs is a *positive* health signal (community redundancy), not fragmentation risk for a personal project. Switching between SDKs is low cost since they all wrap the same documented REST/WebSocket endpoints. (sources cited in §1.3 above)

**3.5 Coinbase Advanced Trade API itself** — official, primary supported API since Coinbase Pro deprecation; documented, versioned, with rate-limit transparency. Counterparty risk is concentrated here, not in any SDK choice.

**3.6 SimpleWebAuthn library health** — industry-standard underlying library for WebAuthn in Node; used internally by Auth.js's Passkey provider (which wraps it); MIT-licensed; actively maintained; community of practitioners across enterprise + indie deployments. WebAuthn is a W3C standard, so any SimpleWebAuthn-issued credentials are protocol-compatible with any other compliant library — swap risk is near-zero. ([SimpleWebAuthn](https://simplewebauthn.dev); referenced from Auth.js implementation per [Auth.js WebAuthn docs](https://authjs.dev/getting-started/authentication/webauthn))

## 4. Failure modes

**4.1 Vercel cron concurrent-invocation overlap.** Cited risk: if a tick runs longer than the cron interval, Vercel can fire a second invocation while the first is in flight. Industry-standard guard is a distributed lock (Redis) — but for n=1 cadence (15 min vs typical ~2-5 sec tick duration), overlap is structurally unlikely. Lighter-weight mitigation: a `bot_ticks` table row insert with a unique constraint on `(session_id, tick_started_at)` rejects accidental double-fires at the DB layer without an additional service. ([LogRocket Next.js cron jobs guide](https://blog.logrocket.com/automate-repetitive-tasks-next-js-cron-jobs/); [Vercel Cron Jobs docs — quickstart](https://vercel.com/docs/cron-jobs/quickstart))

**4.2 GitHub Actions cron unreliability — disqualifies as primary cron host.** GitHub Actions schedules can fire **10–30 minutes late during peak load**, and auto-disable after 60 days of repo inactivity. For a 15-min signal-driven bot, that delay range is larger than the cron interval — missing the dip the bot exists to catch. **Disqualifying for primary cron**. Acceptable as a backup heartbeat that pings the Vercel endpoint, but Vercel Cron Pro is the primary. ([GitHub Actions Scheduled Workflows guide](https://cronjobpro.com/blog/github-actions-scheduled-workflows); [Cron Schedule for Serverless](https://viadreams.cc/en/blog/cron-schedule-serverless-github-actions-vercel-cloudflare/))

**4.3 Vercel Hobby plan deploy-time rejection of `*/15` cron expressions.** Documented behavior: deploying a `vercel.json`/`vercel.ts` with a sub-daily cron expression on Hobby fails at build time, not silently at runtime. Good — fails loud rather than fails quiet. But it forces the Pro tier decision now, not later. ([Vercel Cron Jobs Usage & Pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing); [Bypassing the Vercel Hobby Plan "Daily" Cron Limit](https://runhooks.app/blog/bypassing-vercel-hobby-plan-cron-limit/))

**4.4 Sentry 5k/month free-tier ceiling.** A well-behaved bot should never approach this — but a runaway loop emitting one error per tick (≈ 2,880/month) eats half the quota. Mitigation: bot tick errors written to DB (operator-readable) rather than Sentry-only; Sentry reserved for genuine application-level exceptions. ([Sentry Free Plan 2026 limits](https://sentrypricing.com/free-plan))

**4.5 Coinbase API auth-key compromise.** Any non-trivial trading bot's load-bearing security failure mode. Mitigations: API keys scoped to "Trade" permission only (no withdraw), keys stored in Vercel encrypted env (never in code), live-mode flag is a separate env var, dashboard banner shows live-vs-dry-run mode. Coinbase's documented key permissioning supports this. ([Coinbase Developer Platform — Advanced Trade docs](https://docs.cdp.coinbase.com/coinbase-app/advanced-trade-apis/))

**4.6 Passkey loss — bounded by 2026 best-practice recovery.** Single-device passkey loss without backup = lockout. Industry consensus (NIST SP 800-63-4 finalized July 2025; 2026 enterprise playbooks): multi-device passkey registration is the gold standard; offline-stored recovery code is the documented fallback. Architecture implements both — operator registers ≥ 2 passkeys at setup + one offline backup code. Worst case (simultaneous loss of all passkeys *and* the backup code) is mitigated by absolute-last-resort manual DB intervention documented in the Phase B runbook. ([Passkeys at Scale 2026 Playbook](https://securityboulevard.com/2026/03/passkeys-at-scale-the-complete-enterprise-deployment-playbook-2026/))

**4.7 Session-cookie misconfiguration.** Custom session layer means we own cookie-attribute correctness (`HttpOnly`, `Secure`, `SameSite=Strict`), CSRF protection (origin check on POST flows), session-rotation semantics (rotate on each authentication). Mitigation: cookie alone is not trusted — every authenticated request validates the session id against an `auth_sessions` row in Supabase Postgres, which structurally prevents session-fixation even if the cookie-signing secret is compromised. Phase B scaffold runbook includes a session-cookie-hardening checklist. ([SimpleWebAuthn](https://simplewebauthn.dev) for protocol correctness; well-known patterns for the session layer)

## 5. Pillar fit

Per-pillar evaluation of the candidate stack vs. the declared fitness functions (see `architecture.md` Fitness Functions table). Citations for each row in §1-§3 above.

**Reliability** — Vercel Cron Pro hits minute precision (§2.3); Supabase Postgres durability is Postgres-grade (WAL + managed backups). 99% tick-execution target is comfortably within these primitives. Vercel deployments are immutable; rollback via Git revert / Vercel dashboard is sub-5-min.

**Security** — Vercel encrypted env vars are the secrets boundary; no Vault layer needed at this scale. Live-mode env var is a single boolean read at tick start. Auth on dashboard via passkey (SimpleWebAuthn + custom DB-backed signed-cookie session) — phishing-resistant, operator-owned credentials, no third-party IdP in the auth path (§1.4, §3.6, §4.6, §4.7). Coinbase scoped keys (trade-only, no withdraw) bound the blast radius of credential compromise even if the session is. ([Coinbase Developer Platform docs](https://docs.cdp.coinbase.com/coinbase-app/advanced-trade-apis/); [SimpleWebAuthn](https://simplewebauthn.dev); knowledge-update injection at session start re: Vercel env vars)

**Performance efficiency** — Workload (§2.1, §2.2, §2.4) is orders of magnitude under platform ceilings. p95 < 500ms dashboard target is easy with App Router + Server Components. Passkey auth round-trip is human-imperceptible.

**Cost optimization** — Year-1 budget breakdown:
- Vercel Pro: $20/mo (required for `*/15` cron precision per §2.3, §4.3)
- Supabase Postgres: free tier (workload is far under free-tier ceilings per §2.1); reuses operator's existing Supabase account (vendor-consolidation gain)
- Sentry: free Developer tier (5k errors/month is comfortable per §3.3, §4.4)
- GitHub: free for personal repos
- Coinbase API: no usage fees on trading endpoints (only trading fees on real-money mode)
- Domain (optional): ~$10-15/year ≈ $1/mo
- SimpleWebAuthn + Argon2 libraries: free (MIT)

**Total Year-1: ~$21/mo (~$252/year)**. Comfortably under the $50/mo / $600/year fitness function ceiling — buys ~140% headroom for unforeseen costs.

**Operational excellence** — Vercel auto-deploy on `git push` to `main` (deploy frequency matches commit cadence); GitHub Actions handles lint/typecheck/test pre-merge; Sentry surfaces app errors; bot's own dashboard surfaces trade-decision audit. No external monitoring service needed at n=1.

**Sustainability** — n/a — load-bearing at this scale (single operator, 4 ticks/hour, < 100MB DB). To revisit if scope ever shifts to multi-tenant SaaS — would trigger a foundation amend.

## 6. Reversibility honesty

**Database — Supabase Postgres → other Postgres host:** SQL dialect is standard Postgres, so migration off Supabase to (a) Neon, (b) RDS, (c) self-hosted Postgres, or (d) any other Postgres-as-a-service is **medium reversibility** — schema and queries port directly; only the connection string changes. Postgres is the most portable DB engine in production today, so the escape hatch is exceptionally well-trodden. ([Supabase Postgres docs](https://supabase.com/docs/guides/database/overview); standard Postgres ecosystem)

**Deployment target — Vercel → other PaaS:** Next.js is portable. Vercel-specific features in use are limited to (a) Vercel Cron (replaceable with Vercel-self-hosted + external cron service like cron-job.org, or Cloudflare Workers + Triggers), (b) Vercel Env Vars (any host has equivalents). **Medium reversibility** — a weekend's work to move to Fly.io / Railway / Render + an external cron source. ([Cron Schedule for Serverless comparison](https://viadreams.cc/en/blog/cron-schedule-serverless-github-actions-vercel-cloudflare/); knowledge-update injection re: Vercel Fluid Compute being standard Node.js)

**Frontend / backend framework — Next.js → other React-fullstack:** Server Components + App Router patterns are increasingly portable (Remix/React Router 7, Tanstack Start). **Medium reversibility** — domain logic in `lib/` ports cleanly; framework integration points (route handlers, server actions) need rewriting.

**Auth — SimpleWebAuthn + custom signed-cookie session → other passkey lib or Auth.js:** SimpleWebAuthn is a thin wrapper around the W3C WebAuthn protocol — any compliant Node WebAuthn library will accept credentials it produced (the credential format is protocol-defined, not library-defined). The custom session layer is ~50-80 LOC concentrated in `lib/auth/` with ~5 route consumers; replaceable by Auth.js v5 (once its Passkey provider exits experimental) or any session library at that layer with hours of work, not weeks. **Easy reversibility.**

**Observability — Sentry → other:** Sentry SDK is one of many; OpenTelemetry-compatible alternatives exist (Datadog, Honeycomb, Better Stack). SDK is a thin wrapper around HTTP error reporting. **Easy reversibility.**

**Coinbase SDK choice:** Three actively-maintained SDKs (§1.3, §3.4) all wrap the same documented REST endpoints. Switching SDKs is a Find/Replace operation, not a migration. **Easy reversibility.**

**Coinbase exchange itself — one-way door for this product.** Product bet explicitly scopes to Coinbase only ([product.md § Scope](product.md#scope)). Re-targeting to another exchange is a foundation amend, not a refactor. **Acknowledged one-way door at the product-bet level**, not architecture.

---

## Signal consultation (5 categories — `compass/workflows/setup-foundation-architecture.md` Step 6)

| # | Category | Result | Citation / reason |
|---|---|---|---|
| 1 | Production observability (Sentry / Datadog / etc. baselines) | **n/a — greenfield** | No production deployment exists yet; no MCP-configured observability has data to consult. |
| 2 | Recent PR feedback (Codex BLOCKERs / ISSUEs in foundational scope) | **n/a — greenfield** | No PRs yet in this scope; this is the first foundation bet. |
| 3 | Prior architectural decisions across bets | **n/a — greenfield** | `docs/bets/` is empty (verified 2026-05-29). No prior bet architectures to consult. |
| 4 | Bet-architecture deviation pressure (open bets awaiting this amend) | **n/a — greenfield** | No bets in flight; foundation precedes portfolio. |
| 5 | Team playbooks (`docs/playbooks/*` with matching `stack_combo` tags) | **n/a — empty `docs/playbooks/` directory; first-project bootstrap** | Verified 2026-05-29: `docs/playbooks/` does not yet exist. Will be created in Phase B scaffold. No prior stack-specific learnings to inherit. |

All five categories are legitimately `n/a — greenfield` for this initial v1 draft, as expected per Step 6 workflow note: "on the initial v1 draft, most categories will be trivially 'n/a — greenfield' and that's expected." Future amend flows (v2+) will populate these meaningfully.

---

## DRI Log

### Decisions

- [2026-05-29] [Enterprise Architect] Use Vercel Cron Pro ($20/mo) as primary cron host; reject GitHub Actions as primary
  - **Rationale (required):** GitHub Actions scheduled workflows fire 10-30 min late during peak load (§4.2), which is larger than our 15-min cron interval — i.e., a "late" tick can land in the *next* cron window, missing the dip the bot exists to catch. Vercel Pro guarantees within-the-minute precision (§2.3). The $20/mo cost is well within the $50/mo Cost-optimization fitness function ceiling (§5).
  - **Area (required, tag):** architectural / cost
  - **Alternatives considered (required):** GitHub Actions free cron (rejected — delay risk); external cron service like cron-job.org or Cronhooks (rejected — adds a dependency for marginal savings); always-on Node process on Fly.io/Railway (rejected — adds long-lived-process ops surface contradicting "cron-driven, not always-on" product principle); self-host VPS cron (rejected — same)
  - **Reversibility:** medium (cron-host swap is a Vercel project config change + cron expression file move; ~hours of work)

- [2026-05-29] [Enterprise Architect] Use **Supabase Postgres (DB only — no Supabase Auth, no RLS)** on the free tier as the database
  - **Rationale (required):** workload is n=1 single-writer with < 100MB data growth/year — far under Supabase's free-tier ceilings (§2.1); Postgres is the most portable DB dialect (§6) so escape paths are well-trodden; **operator already has a Supabase account** so adopting Supabase removes a vendor from the stack vs. adopting Turso or Neon. Supabase Auth (GoTrue) is NOT used to preserve the product bet's "no third-party identity provider in the auth path" posture ([product.md § Credential ownership posture](product.md#credential-ownership-posture)); Supabase RLS is unused at n=1 single-tenant (auth gating happens at app layer via `auth_sessions` row validation).
  - **Area (required, tag):** architectural / data
  - **Alternatives considered (required):** Turso libSQL (rejected — would add a vendor; SQLite vs Postgres trade is a wash at n=1 but Postgres tooling is more universal); Neon Postgres (rejected — same vendor-add concern as Turso; documented as natural Postgres alternative if Supabase is ever dropped); local SQLite + Litestream (rejected — Vercel functions are stateless); Vercel Postgres (rejected — sunset)
  - **Reversibility:** medium — Postgres SQL ports to any Postgres host with a connection-string change

- [2026-05-29] [Enterprise Architect] **Supabase as DB-only host; explicit non-use of Supabase Auth and Supabase RLS** (refuse-and-escalate guard against silent posture drift)
  - **Rationale (required):** Supabase Auth (GoTrue) is a managed auth service; using it would violate the product bet's "no third-party identity provider in the auth path" posture per [product.md § Identity & Access Posture](product.md#identity--access-posture). Supabase RLS is unused at n=1 single-tenant — defense-in-depth without a real adversary at n=1 is ceremony. This Decision exists explicitly to prevent future incremental drift into "let's use Supabase Auth for one feature" — that would silently widen the foundational auth posture and is foundation-amend territory (AGENTS.md principle #16 — refuse + escalate to upstream artifact).
  - **Area (required, tag):** architectural / security
  - **Alternatives considered (required):** adopt Supabase Auth for passkey (rejected — violates product bet posture); enable RLS as defense-in-depth (rejected at n=1 — single-tenant, app-layer gate is the source of truth)
  - **Reversibility:** easy at the architecture-document level; medium operationally (any future use of Supabase Auth would require a product-bet foundation amend first)

- [2026-05-29] [Enterprise Architect] Use **SimpleWebAuthn + custom signed-cookie session** for passkey-only authentication; reject Auth.js v5 Passkey provider (experimental) and Hanko (vendor dependency)
  - **Rationale (required):** Auth.js v5 Passkey provider is officially flagged "experimental, not yet recommended for production" as of early 2026 (§1.4 + [Auth.js WebAuthn docs](https://authjs.dev/getting-started/authentication/webauthn)). Product bet's [Identity & Access Posture](product.md#identity--access-posture) names "operator-owned credentials, no third-party identity provider" as the primary posture. SimpleWebAuthn is the production-stable underlying library + custom session layer (~50-80 LOC for n=1) is the right trade.
  - **Area (required, tag):** architectural / security
  - **Alternatives considered (required):** Auth.js v5 Passkey provider (rejected — experimental; real-money tool can't opt into beta auth APIs); Hanko managed passkey service (rejected — third-party vendor in the auth path contradicts product's "no third-party IdP" posture); NextAuth + OAuth + email allowlist (rejected — third-party IdP in auth path)
  - **Reversibility:** easy — SimpleWebAuthn-issued credentials are W3C-protocol-compatible with any compliant WebAuthn library; custom session is a drop-in replacement target for Auth.js (once its Passkey provider exits experimental) at the cookie + proxy layer

### Risks

- [2026-05-29] [Enterprise Architect] Vercel cron concurrent-invocation overlap if a tick runs longer than the 15-min interval
  - **Likelihood (required):** low (typical tick duration ~2-5 sec, well under 15 min interval)
  - **Impact (required):** medium (double-emitting an order is a real money / dry-run discipline failure)
  - **Mitigation (required):** unique constraint on `bot_ticks(session_id, tick_started_at)` rejects double-inserts at DB layer; tick handler exits early on duplicate-key error; Sentry alert on tick-overlap exceptions
  - **Area (required, tag):** architectural / data

- [2026-05-29] [Enterprise Architect] Coinbase API key compromise (the cited primary security failure mode)
  - **Likelihood (required):** low (encrypted in Vercel env; never in code; not logged)
  - **Impact (required):** high (real-money trading capability if leaked, even with no-withdraw scoping)
  - **Mitigation (required):** Coinbase API keys created with "Trade" permission only (no withdraw, no transfer); stored in Vercel encrypted env vars; key rotation procedure documented in scaffold runbook; live-mode env var is a *separate* secret from the API keys
  - **Area (required, tag):** security

- [2026-05-29] [Enterprise Architect] Vercel-platform lock-in concentrated at the cron primitive
  - **Likelihood (required):** low (Vercel is healthy; cron primitive is stable)
  - **Impact (required):** medium (if Vercel sunset Cron or changed pricing dramatically, would need to swap to external cron + Vercel function endpoint; documented in §6 as medium-reversibility)
  - **Mitigation (required):** cron endpoint is a plain Next.js route handler; external cron services (cron-job.org, Cloudflare Triggers) can target it without modification; reversibility plan documented in §6 of this file
  - **Area (required, tag):** architectural / vendor-risk

- [2026-05-29] [Enterprise Architect] Session-cookie misconfiguration risk — custom session layer means we own cookie-attribute correctness + CSRF + rotation
  - **Likelihood (required):** low (well-trodden patterns: HttpOnly + Secure + SameSite=Strict + DB-row validation)
  - **Impact (required):** medium (auth bypass — but bounded by Coinbase keys being Trade-only scoped at the platform layer, so capital exfiltration remains impossible regardless of session compromise)
  - **Mitigation (required):** explicit cookie attributes; cookie carries only a session id (signature alone is not trusted); every authenticated request validates against the `auth_sessions` row (structurally prevents session-fixation); rotation on each authentication; HMAC against `SESSION_SIGNING_SECRET` rotated quarterly; origin check on all `/api/auth/*` POST flows; Phase B scaffold includes a session-cookie-hardening checklist in the runbook
  - **Area (required, tag):** security

### Issues

- [2026-05-29] [Enterprise Architect] Choice between three Coinbase TS SDK options not pinned at architecture level — defer to scaffold step
  - **Severity (required, mandatory):** P3
  - **Owner (required, mandatory):** Enterprise Architect
  - **Status:** open
  - **Area (required, tag):** architectural
  - **Resolution (filled when closed):** [to be filled during Phase B scaffold — current lean is tiagosiebler/`coinbase-api` based on §1.3 activity signal, but final pick made after trying the SDKs against actual endpoint surface]

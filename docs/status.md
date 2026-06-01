# Project Status

_Last updated: 2026-05-31_

## In flight

| Bet | Phase | Owner role | Awaiting | Started | ETA |
|---|---|---|---|---|---|
| [CB-1](bets/CB-1/brief.md) | CB-1.1 + CB-1.1.1 shipped; CB-1.2 in build (registration endpoints) | Engineer → Codex (Reviewer + E2E) | PR for CB-1.2 — Codex code review + security review + E2E (AC 8) | 2026-05-31 | 2026-06-14 (per plan.md, high confidence on CB-1) |
| [CB-2](bets/CB-2/brief.md) | Portfolio stub — proposed | PM | `/create-brief CB-2` promotion | 2026-05-31 | tbd at promotion |
| [CB-3](bets/CB-3/brief.md) | Portfolio stub — proposed | PM | `/create-brief CB-3` promotion (after CB-1 + CB-2) | 2026-05-31 | tbd at promotion |
| [CB-4](bets/CB-4/brief.md) | Portfolio stub — proposed | PM | `/create-brief CB-4` promotion (after CB-2 + CB-3) | 2026-05-31 | tbd at promotion |
| [CB-5](bets/CB-5/brief.md) | Portfolio stub — proposed | PM | `/create-brief CB-5` promotion (after CB-1 + CB-4) | 2026-05-31 | tbd at promotion |

## Awaiting human approval

_None — CB-1 brief approved 2026-05-31. Each remaining stub brief (CB-2..CB-5) requires its own HITL approval after `/create-brief <bet-id>` promotion._

## Recently shipped

- **2026-05-31** — [CB-1.2 story](bets/CB-1/stories/CB-1.2/story.md) drafted (`status: ready`) — passkey registration ceremony endpoints (`POST /api/auth/register/{begin,finish}`). 12 ACs covering both routes, first-time-only gate, origin check + rate limit, cookie-attribute verification (closes CB-1.1 Risk #2), Vitest unit + integration tests, **first E2E in the codebase** (Codex AC 8 — Playwright + virtual-authenticator). 4 PM DRI Decisions, 3 Risks. Multi-device registration deferred per portfolio. Next: `/build CB-1.2`.
- **2026-05-31** — [CB-1.1.1](bets/CB-1/stories/CB-1.1.1/story.md) shipped via [PR #2](https://github.com/vivekschaudhary/crypto-bot/pull/2). Review-driven follow-up to CB-1.1: 2 AC amendments (options-object wrapper signatures + ESLint flat-config swap) + 2 missing tests (expired-challenge + happy-path WebAuthn verify) + PR template harden (DO NOT MERGE banner + honest "manually invoked" security-review language) + `.codex/config.toml` fix for Codex 0.133+. 34/34 tests passing; Codex code + security reviews clean.
- **2026-05-31** — [CB-1.1](bets/CB-1/stories/CB-1.1/story.md) shipped via [PR #1](https://github.com/vivekschaudhary/crypto-bot/pull/1). `lib/auth/` library landed: SimpleWebAuthn wrappers, HMAC signed-cookie helpers, DB-backed session helpers, signed-cookie WebAuthn challenge storage. 10 ACs (AC 1 + AC 7 later amended via CB-1.1.1 per Codex findings; original text retained for audit). 31 unit tests at merge.
- **2026-05-31** — [CB-1 brief](bets/CB-1/brief.md) promoted from stub → approved. Passkey authentication; primary metric: sign-in success rate ≥ 99%; 4 guardrails including zero unauthenticated capital-touching requests; `architecture_required: false` (foundation arch covers it).
- **2026-05-31** — [Project Plan](foundation/plan.md) seeded (v1, `status: living`). MVP target: 2026-08-09 (10 weeks); 4-bet critical path; Day-1 parallel pair (CB-1 + CB-2). `docs/dashboard.html` auto-refreshed (218 KB, 12 artifacts).
- **2026-05-31** — [MVP Bet Portfolio](foundation/portfolio.md) approved (`status: approved`). 5 MVP bet stubs created (CB-1..CB-5); Manual trading UI deferred to post-MVP per operator follow-up.
- **2026-05-29** — [Foundational architecture bet](foundation/architecture.md) approved (`status: approved`). Stack: Vercel Pro + Next.js 16 + Supabase Postgres (DB only) + Vercel Cron + SimpleWebAuthn passkey + Sentry free. Scaffold landed; canary green at <https://crypt-bot.kindtree.us>.
- **2026-05-29** — [Foundational product bet](foundation/product.md) approved (`status: approved`). Signal-driven DCA bot for retail Coinbase traders; dry-run-first; single-operator scope; passkey-only auth posture (operator-owned credentials, no third-party IdP).

## Blockers

_None._

## Risks

### Active

- **Strategy edge erosion under regime change** (PM Risk #1 in [foundation/product.md](foundation/product.md)) — mitigated by quarterly Sharpe check-ins against naive-DCA baseline.
- **Operator drift back to emotional trading via manual override** (PM Risk #2) — tracked via Annual KR3 (override rate ≤ 20%).
- **No durable competitive moat** under current personal-product scope (PM Risk #5) — acknowledged + intentional. Any pivot to SaaS triggers a foundation amend.
- **Total loss of all registered passkeys + offline backup code** (PM Risk #7) — mitigated by single-device passkey for MVP + documented absolute-last-resort DB intervention path; multi-device + backup code UX is post-MVP per portfolio.
- **Auto-pause on drawdown + reserve floor deferred to post-MVP** creates a real-money risk window (PM Risk #3 in [foundation/portfolio.md](foundation/portfolio.md)) — bounded by the ≥ 60 dry-run-sessions guardrail before `LIVE_MODE=true`.
- **Session-cookie misconfiguration** in the custom session layer (EA Risk in [foundation/architecture.md](foundation/architecture.md)) — mitigated by DB-row validation on every request + Phase B scaffold hardening checklist.

### Resolved this cycle

- ~~**CB-6 (manual trading) quietly bloating MVP scope**~~ — resolved 2026-05-31 by operator follow-up during portfolio HITL; CB-6 stub deleted; entry moved to portfolio `§ Deliberately out of MVP`.
- ~~**Merge-before-review process slip on PR #1**~~ — Compass Phase 6 (HITL merge) gate fired ~30 min before Phase 5 (Codex review) findings arrived on PR #1 (CB-1.1). Findings (3 BLOCKERs + 1 ISSUE on code; 0 on security) were honestly closed via CB-1.1.1 (2 AC amendments + 2 missing tests). PR template hardened with explicit DO NOT MERGE banner + honest "manually invoked" security-review language. Resolved 2026-05-31 via PR #2. Framework change to `compass/workflows/build.md` Phase 4 wrap-up text deferred to a future retro per operator direction.

## Health

- **Stories shipped:** 2 (CB-1.1, CB-1.1.1) of ~6 expected under CB-1. ~5 stories remain on the CB-1 critical path (CB-1.2 registration endpoints, CB-1.3 authentication endpoints, CB-1.4 proxy session validation, CB-1.5 sign-out, CB-1.6 first-deploy onboarding UX).
- **Process learning captured:** review-before-merge discipline now codified at the PR-template layer (DO NOT MERGE banner). One slip → one named follow-up → one harden, traceable end-to-end via DRI logs.
- **Stale post-merge surfaces:** `docs/foundation/plan.md` and `docs/dashboard.html` predate the CB-1.1 + CB-1.1.1 merges. Re-run `/plan` + `/dashboard` to refresh before next decomposition. `docs/changelog.md` Unreleased section still pending a convention decision (strict per-bet vs relaxed per-PR accumulation).

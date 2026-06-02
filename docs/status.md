# Project Status

_Last updated: 2026-06-01_

## In flight

| Bet | Phase | Owner role | Awaiting | Started | ETA |
|---|---|---|---|---|---|
| [CB-1](bets/CB-1/brief.md) | 5 stories shipped (CB-1.1 + CB-1.1.1 + CB-1.2 + CB-1.3 + CB-1.4); CB-1.5 (sign-out) next | PM → Engineer | `/create-story CB-1` for CB-1.5 | 2026-05-31 | 2026-06-21 (per plan v5; duration_weeks bumped 2 → 3 per adaptive-decomposition rule) |
| [CB-2](bets/CB-2/brief.md) | Portfolio stub — proposed | PM | `/create-brief CB-2` promotion | 2026-05-31 | tbd at promotion |
| [CB-3](bets/CB-3/brief.md) | Portfolio stub — proposed | PM | `/create-brief CB-3` promotion (after CB-1 + CB-2) | 2026-05-31 | tbd at promotion |
| [CB-4](bets/CB-4/brief.md) | Portfolio stub — proposed | PM | `/create-brief CB-4` promotion (after CB-2 + CB-3) | 2026-05-31 | tbd at promotion |
| [CB-5](bets/CB-5/brief.md) | Portfolio stub — proposed | PM | `/create-brief CB-5` promotion (after CB-1 + CB-4) | 2026-05-31 | tbd at promotion |

## Awaiting human approval

_None — CB-1 brief approved 2026-05-31. Each remaining stub brief (CB-2..CB-5) requires its own HITL approval after `/create-brief <bet-id>` promotion._

## Recently shipped

- **2026-06-01** — [CB-1.4](bets/CB-1/stories/CB-1.4/story.md) shipped via [PR #10](https://github.com/vivekschaudhary/crypto-bot/pull/10). Real session validation in `proxy.ts` (at project root) replacing the scaffold-stub TODO. Closes CB-1 guardrail #1 (zero unauthenticated capital-touching requests) from routing-layer enforcement standpoint. Defense-in-depth posture: downstream handlers MUST re-verify via `verifySession`; forwarded `x-session-*` headers (via Next.js cloned-request-headers + sentinel mechanism) are convenience signals, not auth claims. **5 commits across 4 review rounds** — round 1 surfaced 4 BLOCKERs (file location at `app/proxy.ts` instead of root; invalid `runtime` export; headers-on-response CRITICAL leaking ULIDs to browser; DRI contradiction between "no security gain" and defense-in-depth) + HIGH (open-redirect via `?next`) + 2 MEDIUM (PUBLIC_ROUTES prefix-trap; cookie length cap); rounds 2–3 surfaced cascading prose drift in tech notes, risk mitigations, library API comments, sibling story forward-references, dashboard page placeholder. Both Codex AND Claude fresh-Agent reviewers ran A/B; complementary blind spots validated the multi-model review discipline. 115/115 Vitest tests + AC 8 E2E green locally (third E2E in codebase). Library code unchanged this story (no `lib/auth/sessions` extension); sliding-expiry side-effect explicitly preserved per architecture intent.
- **2026-06-01** — [CB-1.3](bets/CB-1/stories/CB-1.3/story.md) shipped via [PR #8](https://github.com/vivekschaudhary/crypto-bot/pull/8). Passkey authentication ceremony endpoints (`POST /api/auth/authenticate/{begin,finish}`) with user-exists precondition + canonical challenge cookie (via `lib/auth/challenges.mintChallenge`/`consumeChallenge`) + atomic transaction (counter update + rotate-or-create session) + counter-replay guard (Apple 0/0 special case) + OPTIONS preflight handlers. Library extended additively: `rotateSession` + `generateAuthenticationOptions` accept optional pass-through args; new `fromBase64Url` helper preserves caller-minted challenges through SimpleWebAuthn's round-trip. **Second E2E in the codebase** (Codex AC 8, `e2e/auth/authenticate.spec.ts` — Playwright + virtual authenticator + serial DB access via `workers: 1`). 93/93 Vitest tests; both E2E specs green locally. Review cycle surfaced 2 BLOCKERs (Zod schema too loose + AC 8 missing); both closed. Final Codex code + security reviews clean.
- **2026-06-01** — [CB-1.2](bets/CB-1/stories/CB-1.2/story.md) shipped via [PR #5](https://github.com/vivekschaudhary/crypto-bot/pull/5). Passkey registration ceremony endpoints (`POST /api/auth/register/{begin,finish}`) with atomic transactional DB writes + first-time-only gate enforced at API + DB layers (singleton unique index, migration 0002) + origin-check + rate limit + OPTIONS preflight rejection + Engineer DRI Decision for cookie-bound `pendingUserId` (closes Risk #3 by design). 66/66 Vitest tests + **first E2E in the codebase** (Codex AC 8 — Playwright + Chromium virtual authenticator + real Postgres). Review cycle surfaced 5 BLOCKERs across 2 rounds (all closed); 1 follow-up Engineer Risk logged for observability (Sentry hookup is foundation-arch scope, not CB-1.2). `lib/auth/sessions.createSession` extended with optional `tx` parameter for atomic-registration support — additive, backward-compatible.
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

- **Stories shipped:** 5 (CB-1.1, CB-1.1.1, CB-1.2, CB-1.3, CB-1.4) of ~6 expected under CB-1. 2 stories remain on the CB-1 critical path (CB-1.5 sign-out, CB-1.6 first-deploy onboarding UX). All three passkey ceremonies + the proxy gate (register, authenticate, proxy-gating) now have end-to-end E2E coverage against real Postgres + Chromium virtual authenticator. CB-1 guardrail #1 ("zero unauthenticated capital-touching requests") is now structurally enforced at the routing layer.
- **Process learning captured:** review-before-merge discipline now codified at the PR-template layer (DO NOT MERGE banner). One slip → one named follow-up → one harden, traceable end-to-end via DRI logs.
- **`/plan` v4 refreshed 2026-06-01.** CB-1.3's story.md creation fires the "Stories created" trigger per the estimate model. Per the [adaptive-decomposition resolution rule](foundation/plan.md#decisions), `duration_weeks = max(4 × 3 days, 2 wk) = max(1.71 wk, 2 wk) = 2 wk` — net date movement zero, but the trigger fire is logged in the refinement log with the triggering artifact path. **Watch:** at story count 5, max() flips to 2.14 wk → `duration_weeks` would bump to 3 (1-week MVP-target slip). Lesson carried from PR #6's review: every `/plan` refresh now does an internal-consistency sweep across all sections (## Done, Full schedule, MVP-target paragraph, Risks watch entries, refinement log) — not just bump version + last_refreshed.
- **`docs/dashboard.html`** regenerates on the next `/dashboard` invocation. **`docs/changelog.md`** Unreleased section still pending a convention decision (strict per-bet vs relaxed per-PR accumulation).
- **New infrastructure in place:** Supabase DB has full schema applied (migrations 0001 + 0002), Playwright + Chromium installed locally, E2E harness operational. CI does not yet run `pnpm e2e` — wiring E2E into CI (with a Supabase test branch + Playwright cache) remains a candidate `/ops` change.

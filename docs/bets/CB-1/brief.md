---
id: CB-1
type: feature
status: approved
priority: P0
parent: FOUNDATION-PRODUCT
portfolio_stub: false
depends_on: []
parallel_with: [CB-2]
architecture_required: false
created: 2026-05-31
promoted: 2026-05-31
author: PM
sources:
  - docs/foundation/product.md
  - docs/foundation/architecture.md
  - docs/foundation/portfolio.md
  - docs/foundation/architecture-research.md
key_metric:
  name: Sign-in success rate (passkey ceremonies that complete without error)
  baseline: n/a (greenfield — no auth in production yet)
  target: ">= 99% over rolling 30-day window once ≥ 20 sign-in attempts have accrued"
  source: derivable from app logs (Vercel) + auth_sessions row creations vs /api/auth/authenticate POSTs
guardrails:
  - name: Unauthenticated requests reaching capital-touching surfaces (/api/coinbase/*, /api/bot/*, /(dashboard)/*)
    threshold: 0 (any non-zero is a P0 security incident — inherited from product.md § Guardrail metrics)
  - name: Time-to-first-authenticated-dashboard-view at initial setup
    threshold: < 5 minutes end-to-end (operator clicks "first-time setup" → completes registration → lands on /dashboard)
  - name: Session-cookie misconfiguration findings on /scan
    threshold: 0 (per architecture.md DRI Risk on custom session layer; HttpOnly + Secure + SameSite=Strict + DB-row validation must hold)
  - name: Sessions accepted by signature alone (without auth_sessions DB validation)
    threshold: 0 (cookie alone is not trusted — architecture invariant; integration test enforces)
measurement_window_days: 30
check_in_cadence: weekly
area_tags: [auth, security, backend, frontend]
estimate:
  duration_weeks: 2
  confidence: high
  refined_by: stories
  refined_at: 2026-06-01
  estimated_start: 2026-05-31
  estimated_end: 2026-06-14
  actual_start: 2026-05-31
---

# CB-1 — Passkey authentication

## Problem

The crypto-app foundation has been scaffolded and is deployed at <https://crypt-bot.kindtree.us> — a publicly addressable URL with a stub `proxy.ts` that lets all traffic through. The architecture's Foundational Identity & Access Posture section names the auth posture but no working auth flow exists yet. **As long as no real auth gate is in place, every downstream bet (CB-2, CB-3, CB-4, CB-5) exposes its sensitive surfaces — Coinbase API proxy, bot control endpoints, dashboard views — to the open internet.** This is the load-bearing precondition for being able to safely ship any other bet.

The operator's specific pain: they want to deploy iterative work without exposing their real Coinbase Trade-scoped credentials and bot-control endpoints to whoever stumbles onto the public URL.

## User

**Single operator (n=1).** The product is strictly single-tenant per [product.md § Identity & Access Posture / Audience access](../../foundation/product.md#audience-access). No multi-user surfaces. No invitations. No team management.

## Why this matters

Three reasons:

1. **It's the gate that makes every other bet safe to ship.** CB-2 through CB-5 cannot move from `proposed` to `in-build` until CB-1 lands — otherwise their first deploy would expose real-money endpoints to the public internet.
2. **It implements the product bet's _primary_ access posture.** [product.md § Identity & Access Posture / Primary posture](../../foundation/product.md#primary-access-posture-named-explicitly) names "operator-owned passkey credentials" as the load-bearing security claim of the product. CB-1 is the implementation of that claim.
3. **It locks in the "no third-party identity provider in the auth path" stance early.** Deferring auth to "we'll add Google OAuth later" would let a third party into the credential chain before the operator has a chance to reconsider — exactly the soft-spec rationalization pattern the foundation deliberately avoided. Shipping CB-1 first puts the structural commitment in code.

## Hypothesis (the bet)

If the operator registers a single passkey via WebAuthn (using [SimpleWebAuthn](https://simplewebauthn.dev) server + browser packages) and signs in via a signed-cookie session whose ID is validated against an `auth_sessions` row on every authenticated request, then **(a)** every sensitive surface enumerated in [architecture.md § Authenticated surface enumeration](../../foundation/architecture.md#authenticated-surface-enumeration) is gated by operator-owned credentials with no third-party identity provider in the auth path, **(b)** the four guardrails above hold over a 30-day window, and **(c)** the operator's time-to-first-authenticated-dashboard at setup is < 5 minutes.

## Defensibility

**Moat impact (one line):** **None — auth is hygiene, not moat.** Per [product.md § Defensibility / Moat](../../foundation/product.md#defensibility--moat), the product has no durable competitive moat by design; CB-1 implements a security primitive, not a competitive advantage. Explicitly named per AGENTS.md principle #14 (no implied "obvious" decisions): auth doesn't strengthen any moat type — not network effects, not switching costs, not data, not anything.

## Scope

### In scope

- **WebAuthn registration ceremony** — `POST /api/auth/register/begin` (generates challenge + options; returns to browser) + `POST /api/auth/register/finish` (verifies attestation; persists `auth_credentials` row + initial `auth_users` row if zero credentials exist).
- **WebAuthn authentication ceremony** — `POST /api/auth/authenticate/begin` (generates challenge + allowCredentials) + `POST /api/auth/authenticate/finish` (verifies assertion; creates `auth_sessions` row; issues signed cookie).
- **Initial-setup gate** — `/api/auth/register/*` is only callable when `count(auth_credentials) = 0` (initial setup ceremony), OR when an authenticated session exists (for future multi-device addition — but that's out of scope, this is just a structural allowance).
- **Signed-cookie session machinery** — HMAC-SHA256 against `SESSION_SIGNING_SECRET`; cookie attributes `HttpOnly` + `Secure` + `SameSite=Strict` + `Path=/`; carries only the session ID.
- **DB-backed session validation** — on every authenticated request, load `auth_sessions` row by ID, check `expires_at > now()`, refresh sliding expiry, return user context. **The cookie signature alone is not trusted.**
- **Session rotation on authentication** — each successful authenticate ceremony issues a new session ID; the prior session ID is invalidated immediately (no overlap window).
- **30-day sliding expiry** — every authenticated request bumps `auth_sessions.expires_at`.
- **`lib/auth/` library** — SimpleWebAuthn wrapper functions, cookie sign/verify helpers, session validation middleware helpers. Pure functions + thin DB queries; testable in isolation.
- **`app/proxy.ts` integration** — replace scaffold stub with real session validation; redirect unauthenticated requests on `/(dashboard)/*` and reject unauthenticated calls to `/api/coinbase/*` + `/api/bot/*` with 401.
- **Sign-out flow** — `POST /api/auth/sign-out` invalidates the current `auth_sessions` row + clears the cookie.

### Out of scope (deferred per portfolio + product bet)

- **Multi-device passkey registration** — per [portfolio.md § Deliberately out of MVP](../../foundation/portfolio.md). Post-MVP bet.
- **Offline backup recovery code** — same portfolio deferral. Post-MVP.
- **Forced-rotation-after-recovery flow** — depends on backup code existing. Post-MVP.
- **`/api/auth/recovery/*` endpoint** — depends on backup codes. Post-MVP.
- **Password fallback / magic-link / OAuth** — rejected per [product.md § Out of scope (NEVER) — Third-party identity providers in the auth path](../../foundation/product.md#out-of-scope-never).
- **WebAuthn conditional UI (autocomplete)** — UX polish; deferred until operator has lived with the basic ceremony.
- **Account / user management UI** — single operator (n=1); no settings page in MVP. `device_label` is set during registration ceremony only.
- **Multi-factor (passkey + something else)** — passkey alone is AAL2-compliant per [arch-research.md §1.4](../../foundation/architecture-research.md#1-prior-art). Adding a second factor is post-MVP at best, likely never given n=1.

## Open questions for Researcher / implementation

These are deliberately deferred to story-level decisions rather than locked in this brief:

- **Challenge storage approach** — WebAuthn requires a server-issued challenge tracked between the `begin` and `finish` calls (typically 60-second TTL). Three options on the table: (a) encrypted signed cookie (stateless, cookie-based; auto-expires; industry-common), (b) `auth_challenges` DB table row (stateful; server-side; auditable; requires sweep), (c) in-memory (won't work with Vercel stateless functions — automatic disqualification). **Decision deferred per PM call: story-level DRI when implementation starts. All three approaches are reversible.**
- **Device labeling UX** — should the registration ceremony auto-detect the device name (e.g., "MacBook Air") or prompt the operator? Story-level UX call.
- **Sign-out scope** — sign out from this device only, or invalidate all sessions for the user? At n=1 with typically 1-2 active sessions ever, "this session only" is fine — story-level confirmation.
- **First-deploy onboarding flow** — when the operator first hits the landing page on a fresh deploy, what's the UX? "Welcome — set up your passkey to begin" with one button? Story-level UX design.

## Research findings

The foundational research already covers the load-bearing claims:

- **SimpleWebAuthn is the production-stable choice; Auth.js Passkey is still experimental** — per [arch-research.md §1.4](../../foundation/architecture-research.md#1-prior-art). Decision codified in [architecture.md DRI Decision](../../foundation/architecture.md#decisions).
- **NIST SP 800-63-4 (July 2025) classifies synced passkeys at AAL2** — per [arch-research.md §1.4](../../foundation/architecture-research.md#1-prior-art). MVP ships with single passkey + manual DB recovery; multi-device + backup code is the post-MVP hardening per [portfolio.md § Deliberately out of MVP](../../foundation/portfolio.md).
- **Session-cookie misconfiguration is a real risk; mitigated by DB-row validation** — per [arch-research.md §4.7](../../foundation/architecture-research.md#4-failure-modes) and [architecture.md DRI Risk](../../foundation/architecture.md#risks). The "cookie alone is not trusted" invariant is the architectural mitigation.

No new research is required for the bet itself; the foundational research is sufficient. Story-level implementation may surface specific WebAuthn / browser-quirk findings worth recording in `docs/bets/CB-1/research.md` if substantive.

## User pain input (from Support)

n/a — single-operator product, no support pipeline. If the operator hits a snag during ceremony, they self-debug. The runbook's absolute-last-resort path ([docs/ops/runbook.md § Lost all passkeys AND lost the backup code](../../ops/runbook.md#lost-all-passkeys-and-lost-the-backup-code)) covers the worst case (manual DB credential reset).

## Stories

_Decomposed one at a time via `/create-story CB-1`. Each lives under `docs/bets/CB-1/stories/<story-id>/`._

### Shipped

- **[CB-1.1](stories/CB-1.1/story.md) — `lib/auth/` library.** Shipped 2026-05-31 via [PR #1](https://github.com/vivekschaudhary/crypto-bot/pull/1). 10 ACs (AC 1 + AC 7 amended via CB-1.1.1 per Codex findings).
- **[CB-1.1.1](stories/CB-1.1.1/story.md) — Codex review remediations for CB-1.1.** Shipped 2026-05-31 via [PR #2](https://github.com/vivekschaudhary/crypto-bot/pull/2). 6 ACs covering: 2 AC amendments (AC 1 + AC 4) + 2 missing tests (AC 2 + AC 3) + pre-merge gates green (AC 5) + PR template harden (AC 6). The `.codex/config.toml` fix for Codex 0.133+ also landed in PR #2 (commit b83fa98) but was extra-scope, not one of the 6 ACs — it surfaced as a blocker to running the Codex review itself partway through the PR.
- **[CB-1.2](stories/CB-1.2/story.md) — Passkey registration ceremony endpoints.** Shipped 2026-06-01 via [PR #5](https://github.com/vivekschaudhary/crypto-bot/pull/5). 12 ACs (AC 1 + AC 2 amended via Engineer DRI Decision for cookie-bound `pendingUserId` — closes story Risk #3 by design). First E2E in the codebase (Codex AC 8 — Playwright + Chromium virtual authenticator + real Postgres). Review cycle: 5 BLOCKERs across 2 rounds (atomicity, DB-singleton race, OPTIONS handler, typecheck mock cast, canonical-helper duplication) — all closed. `lib/auth/sessions.createSession` extended with optional `tx` parameter for atomic-registration (additive, backward-compatible).
- **[CB-1.3](stories/CB-1.3/story.md) — Passkey authentication ceremony endpoints.** Shipped 2026-06-01 via [PR #8](https://github.com/vivekschaudhary/crypto-bot/pull/8). 12 ACs (AC 1 + AC 2 amended via Engineer DRI Decision for canonical-helper challenge cookie — uses `lib/auth/challenges.mintChallenge`/`consumeChallenge` rather than inline `signValue`). User-exists precondition + counter-replay guard with Apple platform-authenticator 0/0 exception + atomic transaction (counter UPDATE + rotate-or-create session). Library extensions: `rotateSession` + `generateAuthenticationOptions` accept optional pass-through args; new `fromBase64Url` helper. Second E2E (Codex AC 8 — `e2e/auth/authenticate.spec.ts`; `playwright.config.ts` switched to `workers: 1` for serial DB access across both auth specs). Review cycle: 2 BLOCKERs (Zod schema too loose + AC 8 missing) — both closed. Final Codex code + security reviews clean.

### Expected decomposition (PM forecast — remaining)

1. ~~**`lib/auth/` library**~~ — **shipped** via CB-1.1 (+ CB-1.1.1 follow-ups).
2. ~~**Registration ceremony endpoints**~~ — **shipped** via CB-1.2.
3. ~~**Authentication ceremony endpoints**~~ — **shipped** via CB-1.3.
4. **Sign-out endpoint + cookie clearing** — `POST /api/auth/sign-out`.
5. **`app/proxy.ts` real session validation** — replace scaffold stub; handle both `/(dashboard)/*` redirects + `/api/coinbase|bot/*` 401s.
6. **First-deploy onboarding UX** — landing page flow that detects zero-credentials state and walks the operator through registration in < 5 minutes.

Original estimate ~6 stories at ~2-3 days each = ~2-3 weeks. Actuals after 2 calendar days: 4 story.md files exist (CB-1.1, CB-1.1.1, CB-1.2, CB-1.3), all shipped. 3 forecast items remain.

**Plan v4 refreshed 2026-06-01.** CB-1.3's story.md creation fired the "Stories created" trigger per the `/plan` estimate model. Per the [adaptive-decomposition resolution rule](../../foundation/plan.md#decisions), `duration_weeks = max(stories-based, brief-approval) = max(4 × 3 days, 2 wk) = max(1.71 wk, 2 wk) = 2 wk` — still unchanged. The max() rule continues to backstop the brief's upfront scope ceiling while three forecast stories remain undecomposed. **Watch:** at story count 5, the math flips: max(5 × 3 days, 2 wk) = max(2.14 wk, 2 wk) = ~2.1 wk → `duration_weeks` would legitimately bump to 3.

## Scan summary

Latest scanner posture for this bet. Full report at [`scan-report.md`](./scan-report.md). Re-run `/scan CB-1` to refresh. Auto-invoked at phase boundaries by `/build`.

- **Last scanned:** _not yet scanned — bet just promoted to full brief_
- **Current phase:** Product (Discovery)
- **Open findings:** _to be populated by first `/scan CB-1`_
- **Suppressed:** 0
- **Blocking advance:** _to be determined by first scan_
- **Full report:** [`scan-report.md`](./scan-report.md) _(not yet generated)_

## Check-in log

_Populated automatically by `/measure CB-1` cron once the bet ships._

## DRI Log

### Decisions

- [2026-05-31] [PM] **Promote CB-1 stub to full brief; scope locked to single-device passkey for MVP**
  - **Rationale (required):** [portfolio.md § Deliberately out of MVP](../../foundation/portfolio.md) explicitly defers multi-device + offline backup code; honoring that scope here. Single passkey + absolute-last-resort manual DB recovery (per [runbook.md](../../ops/runbook.md)) is the MVP fallback. The bet ships a load-bearing safety primitive (no auth → no real-money endpoints can ship safely), so it goes first.
  - **Area (required, tag):** auth / security / product
  - **Alternatives considered (required):** ship multi-device + backup code in CB-1 (rejected — portfolio scope; would extend the bet to ~4 weeks and delay the critical path); OAuth fallback (rejected per product bet posture); ship just registration (no sign-in) (rejected — useless without the authenticate ceremony)
  - **Reversibility:** easy (multi-device + recovery come as separate post-MVP bets; the credential schema in `auth_credentials` is already multi-row from the architecture)

- [2026-05-31] [PM] **`architecture_required: false`** — foundation architecture covers the design; no separate bet-level architecture phase
  - **Rationale (required):** [architecture.md § Foundational Identity & Access Posture](../../foundation/architecture.md#foundational-identity--access-posture) is a heavyweight section that already specifies credential strategy, session strategy, recovery posture, attack-surface analysis, and secrets-at-rest. The remaining decisions (challenge storage; device-labeling UX) are story-level, not bet-level. Treating them as architectural would be ceremony.
  - **Area (required, tag):** process / scope
  - **Alternatives considered (required):** `architecture_required: true` (rejected — would force a separate `/create-bet-architecture` phase for what is already covered upstream); `architecture_required: auto` (rejected — keep the call explicit per AGENTS.md principle #14 — no soft-spec auto-routing for load-bearing bets)
  - **Reversibility:** easy (can be revisited at any time if implementation surfaces architectural complexity we missed)

- [2026-05-31] [PM] **Primary metric is sign-in success rate (≥ 99% over 30-day window after ≥ 20 attempts)**
  - **Rationale (required):** UX correctness signal that the bet is actually working end-to-end. Security correctness (zero unauthenticated capital-touching requests) is captured as a guardrail because failure is binary + already named in [product.md § Guardrail metrics](../../foundation/product.md#guardrail-metrics) — it doesn't need to be the primary measurement. The "≥ 20 attempts" floor prevents noise from sparse early data; for n=1 operator the threshold may take 1-2 weeks of live use to clear.
  - **Area (required, tag):** measurement
  - **Alternatives considered (required):** absolute count of successful sign-ins (rejected — meaningless without a denominator); time-to-first-auth (rejected as primary — it's a one-shot setup measurement, better as a guardrail); guardrail-only with no primary (rejected — bet needs a positive success signal)
  - **Reversibility:** medium (changing the north-star metric mid-bet is allowed but expensive; re-baseline required)

- [2026-05-31] [PM] **Challenge-storage approach deferred to story-level DRI** rather than locked in this brief
  - **Rationale (required):** all three viable approaches (signed cookie / DB row / KV) are reversible at the implementation layer with hours of work, not weeks. Asking a structural-architecture-level question in the brief when the decision is reversible-at-the-LOC-level is over-ceremony. The brief surfaces the question so it isn't lost; the story will decide. Operator chose this explicitly during brief promotion via AskUserQuestion.
  - **Area (required, tag):** scope / process
  - **Alternatives considered (required):** lock as signed cookie in brief (rejected — premature); lock as DB row (rejected — premature); make this a `/create-bet-architecture` decision (rejected — too small for a bet-level architecture phase)
  - **Reversibility:** easy

- [2026-05-31] [PM] **Skip Jira / Confluence mirroring; log skip per "no silent skips"**
  - **Rationale (required):** consistent with [product.md PM Decision](../../foundation/product.md), [architecture.md DRI Decision](../../foundation/architecture.md#decisions), and [portfolio.md PM Decision](../../foundation/portfolio.md): solo operator, no team consumers of mirrored artifacts, MCP credentials not wired. Per AGENTS.md principle #3.
  - **Area (required, tag):** process
  - **Alternatives considered (required):** mirror anyway (rejected — overhead without function)
  - **Reversibility:** easy

### Risks

- [2026-05-31] [PM] **Session-cookie misconfiguration** — custom session layer means CB-1's implementation owns cookie-attribute correctness, CSRF protection, and session-rotation semantics (inherited from [architecture.md DRI Risk](../../foundation/architecture.md#risks))
  - **Likelihood (required):** low (well-trodden patterns; foundation explicitly documents the required attributes)
  - **Impact (required):** medium (auth bypass — but capital exfiltration remains impossible per Coinbase Trade-only scoping; worst case is unwanted trades on operator's own positions)
  - **Mitigation (required):** explicit cookie attributes documented in architecture; cookie carries only session ID (signature alone not trusted — DB row is source of truth); rotation on each authentication; integration tests verify each invariant; Phase B scaffold runbook has session-cookie hardening checklist; `/scan` guardrail (`session-cookie misconfig findings: 0`) catches drift
  - **Area (required, tag):** security

- [2026-05-31] [PM] **WebAuthn UX quirks across browsers** — first deploy may surface platform-specific issues (Safari macOS vs Chrome vs iOS Safari, RP ID validation, origin binding, allowed transports)
  - **Likelihood (required):** medium (WebAuthn is standardized but browser implementations have known quirks, especially around RP ID and credential transport hints)
  - **Impact (required):** low (single operator + recovery path via runbook means stuck-on-quirks doesn't lock anyone out for long)
  - **Mitigation (required):** explicit test of registration + authentication on operator's actual browser stack before declaring the bet done; runbook's absolute-last-resort manual DB recovery path covers the lockout case; if a specific browser is consistently broken, scope a follow-up bet
  - **Area (required, tag):** auth / browser-compat

- [2026-05-31] [PM] **Single registered passkey = single point of credential failure** (the deferred-to-post-MVP risk acknowledged in the portfolio)
  - **Likelihood (required):** low (passkey hardware loss + cloud-sync recovery is structurally rare at n=1; iCloud Keychain / Google Password Manager / Windows Hello sync makes most "lost devices" recoverable via the operator's cloud account)
  - **Impact (required):** medium operationally (operator goes through the runbook's manual DB recovery — bounded by minutes of manual work)
  - **Mitigation (required):** absolute-last-resort manual DB recovery procedure already documented in [runbook.md](../../ops/runbook.md); post-MVP bet for multi-device + backup code is on the roadmap (tracked in [portfolio.md § Deliberately out of MVP](../../foundation/portfolio.md))
  - **Area (required, tag):** security / recovery

- [2026-05-31] [PM] **Time-to-first-auth UX may be longer than 5 minutes if WebAuthn requires extra browser permissions or hardware setup**
  - **Likelihood (required):** low (most modern browsers and operating systems have WebAuthn ready out-of-the-box; only edge cases require additional setup)
  - **Impact (required):** low (one-time setup; longer-than-expected just shifts the guardrail target)
  - **Mitigation (required):** runbook's setup-section walks through the ceremony; if real time-to-first-auth exceeds 5 minutes, treat as a guardrail miss and either revise the target or scope a UX-polish follow-up bet
  - **Area (required, tag):** ux

### Issues

- [2026-05-31] [PM] **Challenge-storage approach not pinned** — defer to story-level DRI
  - **Severity (required, mandatory):** P3
  - **Owner (required, mandatory):** Engineer (at story time)
  - **Status:** open
  - **Area (required, tag):** implementation
  - **Resolution (filled when closed):** [to be filled by the first `/create-story CB-1` that covers the registration ceremony — the chosen approach + rationale gets logged in that story's DRI]

- [2026-05-31] [PM] **First-deploy onboarding UX undefined** — story-level UX design
  - **Severity (required, mandatory):** P3
  - **Owner (required, mandatory):** Designer/Engineer (at story time)
  - **Status:** open
  - **Area (required, tag):** ux
  - **Resolution (filled when closed):** [to be filled during the relevant `/create-story CB-1` for the onboarding flow story]

---

_Approved by: <vivek> on <5/31>_

# Project Status

_Last updated: 2026-05-31_

## In flight

| Bet | Phase | Owner role | Awaiting | Started | ETA |
|---|---|---|---|---|---|
| [CB-1](bets/CB-1/brief.md) | Story decomposition started — CB-1.1 ready | PM → Engineer | `/build CB-1.1` (lib/auth library) | 2026-05-31 | 2026-06-14 (per plan.md, low confidence) |
| [CB-2](bets/CB-2/brief.md) | Portfolio stub — proposed | PM | `/create-brief CB-2` promotion | 2026-05-31 | tbd at promotion |
| [CB-3](bets/CB-3/brief.md) | Portfolio stub — proposed | PM | `/create-brief CB-3` promotion (after CB-1 + CB-2) | 2026-05-31 | tbd at promotion |
| [CB-4](bets/CB-4/brief.md) | Portfolio stub — proposed | PM | `/create-brief CB-4` promotion (after CB-2 + CB-3) | 2026-05-31 | tbd at promotion |
| [CB-5](bets/CB-5/brief.md) | Portfolio stub — proposed | PM | `/create-brief CB-5` promotion (after CB-1 + CB-4) | 2026-05-31 | tbd at promotion |

## Awaiting human approval

_None — CB-1 brief approved 2026-05-31. Each remaining stub brief (CB-2..CB-5) requires its own HITL approval after `/create-brief <bet-id>` promotion._

## Recently shipped

- **2026-05-31** — [CB-1.1](bets/CB-1/stories/CB-1.1/story.md) story created (`status: ready` — first slice of CB-1). Scope: `lib/auth/` library only (SimpleWebAuthn wrappers + cookie + sessions + challenges) with full unit-test coverage. **Challenge-storage approach locked: encrypted signed cookie** per story DRI Decision (resolves the deferral from CB-1 brief). 10 ACs, all 6 SEC categories handled (`n/a` for UI-specific categories with reasons + AC-coverage for non-UI categories). Next: `/build CB-1.1`.
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

## Health

_Run `/plan` (next step) to seed `docs/foundation/plan.md` with the time-bound schedule. Throughput / bottleneck metrics populate once stubs start promoting via `/create-brief`._

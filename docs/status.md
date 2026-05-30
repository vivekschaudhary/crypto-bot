# Project Status

_Last updated: 2026-05-29_

## In flight

| Bet | Phase | Owner role | Awaiting | Started | ETA |
|---|---|---|---|---|---|
| [FOUNDATION-PRODUCT](foundation/product.md) | Foundation — product bet approved | PM | `/setup-foundation-architecture` | 2026-05-29 | next step |

## Awaiting human approval

_None — foundation product bet approved 2026-05-29._

## Recently shipped

- **2026-05-29** — [Foundational product bet](foundation/product.md) approved (`status: approved`). Signal-driven DCA bot for retail Coinbase traders; dry-run-first; single-operator scope; passkey-only auth posture (operator-owned credentials, no third-party IdP) declared in [§ Identity & Access Posture](foundation/product.md#identity--access-posture). Researcher findings in [foundation/research.md](foundation/research.md). Next: `/setup-foundation-architecture`.

## Blockers

_None._

## Risks

- **Strategy edge erosion under regime change** (PM Risk #1 in [foundation/product.md](foundation/product.md)) — mitigated by quarterly Sharpe check-ins against naive-DCA baseline.
- **Operator drift back to emotional trading via manual override** (PM Risk #2) — tracked via Annual KR3 (override rate ≤ 20%).
- **No durable competitive moat** under current personal-product scope (PM Risk #5) — acknowledged + intentional. Any pivot to SaaS triggers a foundation amend.
- **Total loss of all registered passkeys + offline backup code** (PM Risk #7) — mitigated by multi-device registration enforced at setup and documented absolute-last-resort DB intervention path.

## Health

_Run `/status` once architecture foundation + first bet are in flight to populate throughput / bottleneck metrics._


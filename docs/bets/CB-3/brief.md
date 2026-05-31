---
id: CB-3
type: feature
status: proposed
portfolio_stub: true
parent: FOUNDATION-PRODUCT
depends_on: [CB-1, CB-2]
parallel_with: []
created: 2026-05-31
author: PM
estimate:
  duration_weeks: 2
  confidence: low
  refined_by: stub
  refined_at: 2026-05-31
  estimated_start: 2026-06-15
  estimated_end: 2026-06-28
---

# CB-3 — Strategy authoring + persistence

**One-line hypothesis (traced to product.md):** If the operator can author, edit, and persist a named DCA strategy (RSI thresholds + MA periods + position sizes + per-session caps, scoped to the top-5 cryptos selected via CB-2), then the **"create a strategy"** clause of the MVP definition is satisfied and the bot runtime (CB-4) has a typed config to read on every tick — implementing the **"signal-driven entries"** and **"take-profit exits"** in-scope items per [product.md § In scope](../../foundation/product.md#in-scope).

## Status: portfolio stub

Full brief content filled when promoted via `/create-brief CB-3`.

## Quick scope sketch

- Dashboard form to author / edit a strategy: name, entry rules (RSI < N → buy; price < MA20 + RSI < M → trend dip), exit rules (RSI > N + min-profit → sell %), per-session caps (max total deployed, max buys), tied to operator's selected cryptos from CB-2
- Persist as a row (or rows) in DB; one active strategy per bot session
- Validation: deterministic params (no ML/AI signal config per [product.md DRI Decision](../../foundation/product.md) — "Deterministic signal rules"); reject overlapping/contradictory rules
- Operator can revise the strategy and start a new bot session against the revised config (old sessions stay queryable per append-only audit)

## Open question (resolve at promotion)

Single active strategy vs. multiple named strategies the operator can switch between? Default lean: **single active per bot session** for MVP simplicity. Strategy *versioning* (revisions persist; old ticks still trace to old config) handled via append-only audit posture in [architecture.md § Foundational Data Model](../../foundation/architecture.md#foundational-data-model).

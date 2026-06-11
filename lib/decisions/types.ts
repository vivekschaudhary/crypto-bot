// `lib/decisions/types.ts` — type contracts for the bot decision engine.
//
// CB-4.1 (SECOND CB-4 STORY) per the [bet brief Scope § lib/decisions/](../../docs/bets/CB-4/brief.md)
// + the [story.md AC 1](../../docs/bets/CB-4/stories/CB-4.1/story.md).
//
// ARCHITECTURAL INVARIANT (verified by tests/lib/decisions/no-coupling.test.ts):
// `lib/decisions/` may ONLY import from `@/lib/strategy-core/*` (Strategy types
// ARE the contract); imports from `@/lib/coinbase/*`, `@/lib/db/*`,
// `@/lib/env/*`, `@/lib/signals/*`, `@/lib/strategy-coinbase/*`, `@/lib/strategies/*`
// are FORBIDDEN. Equity-app extraction per CB-3 PM DRI Decision #6 stays
// half-day find/replace because decisions stays pluggable.
//
// The decision engine composes RSI/MA values (already-computed by CB-4.0's
// pure functions, invoked by CB-4.2's cron handler) + the operator's CB-3-
// authored Strategy + the current session's spend totals into a deterministic
// `DecisionResult` per `strategy.selected_assets[i]`. Reason strings ARE the
// operator-audit contract — CB-5's dashboard renders them verbatim.

import type { Asset } from "@/lib/strategy-core/types";

/**
 * Per-asset signal bundle the decision engine consumes for ONE asset.
 *
 * Populated by CB-4.2's cron handler:
 *   * `rsi` / `ma` — computed by CB-4.0's pure functions; null when there
 *     are insufficient candle bars (per CB-4.0's null-sentinel contract;
 *     the decision engine maps null to `hold` with reason).
 *   * `lastClose` — the most recent close price; used for MA reinforcement
 *     check AND for take-profit profit-percentage computation.
 *   * `currentPosition` — null when the operator has no open position in
 *     this asset; non-null when they do. Cost basis (`avgCostUsd`) is the
 *     dollar-weighted average cost per unit; `quantity` is the open
 *     quantity. CB-4.2 populates via `lib/coinbase/accounts:getAccountTradeHistory`
 *     (CB-2.3) OR aggregating prior session `orders` rows (Engineer DRI at
 *     CB-4.2 build time).
 */
export interface PerAssetSignal {
  rsi: number | null;
  ma: number | null;
  lastClose: number;
  currentPosition: { avgCostUsd: number; quantity: number } | null;
}

/**
 * Aggregated per-session totals the decision engine consumes for cap
 * enforcement. Populated by CB-4.2's cron handler from prior `bot_ticks`
 * + `orders` rows for the active `bot_sessions` row.
 *
 *   * `dollarSpent` — total USD across BUY orders in the active session.
 *   * `buyCount` — number of BUY orders in the active session.
 *
 * Sells do NOT contribute to either (see Engineer DRI Decision #4 in
 * evaluate.ts).
 */
export interface SessionTotals {
  dollarSpent: number;
  buyCount: number;
}

/** Discriminator for the trinary decision space. */
export type Decision = "buy" | "sell" | "hold";

/**
 * Sizing instructions for a BUY decision. CB-4.3's `LIVE_MODE` order-
 * placement layer reads `dollars` and passes to Coinbase via
 * `lib/coinbase/orders:placeOrder` with `quote_size` = dollars.
 */
export interface BuySizing {
  kind: "buy_dollars";
  dollars: number;
}

/**
 * Sizing instructions for a SELL decision. The fraction is what
 * proportion of the current `quantity` to sell (e.g., 0.5 for half).
 * CB-4.3 multiplies by `currentPosition.quantity` and passes to
 * Coinbase as `base_size`.
 */
export interface SellSizing {
  kind: "sell_fraction";
  fraction: number;
}

/**
 * The decision engine's per-asset output. CB-4.2's cron handler writes
 * `decision` + `reason` to a `bot_ticks` row + per-asset `signals` rows;
 * CB-4.3 reads `decision` + `sizing` to decide whether/how to call
 * `placeOrder` in LIVE_MODE.
 *
 *   * `asset` — echoes back the input asset (same `assetClass` +
 *     `identifier`) so CB-4.2 can correlate decisions to the original
 *     `selected_assets[i]` order without re-indexing.
 *   * `decision` — buy / sell / hold.
 *   * `reason` — operator-readable plain text with stable named prefixes
 *     per decision class (see Engineer DRI Decision #1 in evaluate.ts).
 *     CB-5's future dashboard renders verbatim.
 *   * `sizing` — present for buy + sell; absent for hold.
 */
export interface DecisionResult {
  asset: Asset;
  decision: Decision;
  reason: string;
  sizing?: BuySizing | SellSizing;
}

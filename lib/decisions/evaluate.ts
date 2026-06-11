// `lib/decisions/evaluate.ts` — pure-function decision engine.
//
// CB-4.1 (SECOND CB-4 STORY) per the [bet brief Scope § lib/decisions/](../../docs/bets/CB-4/brief.md)
// + the [story Tech notes](../../docs/bets/CB-4/stories/CB-4.1/story.md).
//
// THIS IS THE LOAD-BEARING OBSERVABILITY LAYER. Every decision the bot
// ever makes flows through `evaluate()`. Reason strings written to
// `bot_ticks.reason` (CB-4.2) and rendered verbatim by CB-5's dashboard
// ARE the operator's decision-audit contract.
//
// ENGINEER DRI DECISIONS (committed at this commit per story Tech notes):
//
//   1. REASON-STRING FORMAT — plain text with STABLE NAMED PREFIXES per
//      decision class. Operator-readable; CB-5 dashboard renders verbatim;
//      tests assert structural elements (prefix + numeric values), not
//      pixel-perfect strings. Specific phrasings:
//        buy:    "buy: rsi=X.XX < entry_threshold=Y[; AND price=Z < maP=W]; buy $D <asset>"
//        sell:   "sell: rsi=X.XX > exit_threshold=Y AND profit=P.PP% >= min_profit=Q.QQ%; sell F% of position at <asset>"
//        cap:    "hold: <cap-name>_reached (...); buy signal suppressed at <asset>"
//        insuf:  "hold: insufficient signal data (rsi=..., ma=...); insufficient bars at <asset>"
//        nopos:  "hold: exit rsi condition met (rsi=X > exit_threshold=Y) but no open position at <asset>" (amended PR #60 round-2; only the RSI half is checkable without a position)
//        cb0:    "hold: cost basis is zero — position likely closed concurrently at <asset>"
//        nan:    "hold: profit computation produced NaN at <asset>"
//        miss:   "hold: rsi=X.XX >= entry_threshold=Y (no buy signal) at <asset>"
//                "hold: rsi=X.XX < entry_threshold=Y BUT price=Z >= maP=W (ma reinforcement requires price below ma); no buy at <asset>"
//                "hold: position open + rsi=X.XX <= exit_threshold=Y (no exit signal) at <asset>"
//                "hold: position open + rsi=X.XX > exit_threshold=Y BUT profit=P.PP% < min_profit=Q.QQ%; no exit at <asset>"
//      Numbers: toFixed(2) for floats. Cap semantics: `>=`. Exit threshold
//      semantics: `>`. Entry threshold semantics: `<`. Min-profit semantics: `>=`.
//
//   2. CAP-ENFORCEMENT ORDER — evaluate signal FIRST, THEN override to
//      hold with cap-named reason. LOUD not silent: the reason surfaces
//      both (a) that a buy signal would have fired AND (b) which cap was
//      hit. Per story AC 5. Early-out before signal evaluation would
//      hide the operator-audit value of "what would the signal have been?"
//
//   3. POSITION COST BASIS PASSED BY CALLER — `PerAssetSignal.currentPosition`
//      is populated by CB-4.2's cron handler before `evaluate()` runs.
//      Keeps this function pure; portable; testable.
//
//   4. SELLS DO NOT COUNT AGAINST PER-SESSION CAPS — caps protect deployment
//      budget (downside protection); sells release capital. Capping sells
//      would lock the operator out of take-profit when the exit rule fires.
//
//   5. INSUFFICIENT SIGNAL DATA → hold + reason (NEVER silent skip) —
//      CB-4.0's null sentinel propagates cleanly. The signals row CB-4.2
//      writes records the null so the operator can audit which asset had
//      insufficient bars.
//
//   6. RETURN ORDERING matches `strategy.selected_assets` input order
//      (NOT sorted by anything else). CB-5 dashboard relies on stable
//      per-tick ordering to render the decision-trace history; sorting
//      here would break that contract.
//
// BONUS DECISIONS (standard Engineer DRI; documented inline):
//   * `entry_rules.maReinforcement` undefined → treated as `false`
//   * `currentPosition.quantity === 0` → treated as "no position" (defense
//     against malformed caller-provided state; equivalent to currentPosition=null)
//   * `avgCostUsd === 0` → divide-by-zero → hold with named "cost basis is zero" reason
//   * `!Number.isFinite(profit_pct)` → hold with named "NaN" reason

import type { Asset, Strategy } from "@/lib/strategy-core/types";

import type {
  BuySizing,
  DecisionResult,
  PerAssetSignal,
  SellSizing,
  SessionTotals,
} from "./types";

/**
 * Build the operator's decision per asset in `strategy.selected_assets`,
 * given pre-computed per-asset signals + session totals.
 *
 * Returns one `DecisionResult` per asset in input order (per Engineer DRI
 * Decision #6).
 *
 * @param strategy          The operator's active strategy (from CB-3.0's
 *                          types via `lib/strategy-core/`).
 * @param perAssetSignals   Map keyed by `asset.identifier` (e.g., "BTC-USD").
 *                          CB-4.2's cron handler populates by fetching
 *                          candles per asset + computing RSI/MA via
 *                          CB-4.0's pure functions + reading position
 *                          state via CB-2.3's wrapper.
 * @param sessionTotals     Aggregated buy spend + count for the active
 *                          `bot_sessions` row. Sells DON'T contribute
 *                          (per Engineer DRI Decision #4).
 */
export function evaluate(
  strategy: Strategy,
  perAssetSignals: Map<string, PerAssetSignal>,
  sessionTotals: SessionTotals,
): DecisionResult[] {
  // Engineer DRI Decision #6: preserve `selected_assets` input order.
  return strategy.selected_assets.map((asset) =>
    evaluateAsset(asset, strategy, perAssetSignals, sessionTotals),
  );
}

/**
 * Evaluate the decision for ONE asset. Decomposed for clarity + tractable
 * branch coverage. Returns a `DecisionResult` regardless of which branch
 * fires (every code path returns; never throws).
 */
function evaluateAsset(
  asset: Asset,
  strategy: Strategy,
  perAssetSignals: Map<string, PerAssetSignal>,
  sessionTotals: SessionTotals,
): DecisionResult {
  const signal = perAssetSignals.get(asset.identifier);

  // Defensive: caller (CB-4.2) is expected to populate signals for every
  // selected asset. If something slipped through, return hold + named reason
  // rather than throw — preserves the bot_ticks audit invariant.
  if (!signal) {
    return holdResult(
      asset,
      `hold: no signal data provided for ${asset.identifier}`,
    );
  }

  // Engineer DRI Decision #5: insufficient signal data → hold + reason.
  // CB-4.0's null sentinel propagates here; never silent skip.
  if (signal.rsi === null || signal.ma === null) {
    const rsiText = signal.rsi === null ? "null" : signal.rsi.toFixed(2);
    const maText = signal.ma === null ? "null" : signal.ma.toFixed(2);
    return holdResult(
      asset,
      `hold: insufficient signal data (rsi=${rsiText}, ma=${maText}); insufficient bars at ${asset.identifier}`,
    );
  }

  // Bonus Engineer DRI Decision: `currentPosition.quantity === 0` is
  // semantically equivalent to "no position" — defends against malformed
  // caller state. Coalesce here.
  const hasPosition =
    signal.currentPosition !== null && signal.currentPosition.quantity > 0;

  if (hasPosition) {
    // Position exists → evaluate exit rules.
    return evaluateExit(asset, strategy, signal);
  }

  // No position. AC 8 (amended PR #60 round-2 to be spec-honest): if the
  // RSI HALF of the exit rule fires (rsi > exit_threshold), emit a hold
  // reason that surfaces what was checked + that no position exists to
  // sell from. The FULL exit rule (rsi > threshold AND profit >= min_profit)
  // can't be evaluated here because profit_pct requires currentPosition.
  // avgCostUsd, which by definition isn't available. The reason must
  // honestly state "exit rsi condition met" — NOT "sell signal would
  // fire", which would falsely imply the full rule was evaluated.
  //
  // Operator-audit value: surfaces that the strategy's RSI half of exit
  // would have agreed sell-was-appropriate IF a position had existed,
  // instead of silently routing to the entry-rule-miss "no buy signal"
  // reason.
  //
  // PR #60 round-1 BLOCKER closure added this branch (was missing).
  // PR #60 round-2 BLOCKER closure made the reason spec-honest (was
  // claiming "sell signal would fire" without acknowledging only the
  // RSI half was checked).
  const rsi = signal.rsi as number; // non-null per insufficient-data guard above
  if (rsi > strategy.exit_rules.rsiThreshold) {
    return holdResult(
      asset,
      `hold: exit rsi condition met (rsi=${rsi.toFixed(2)} > exit_threshold=${strategy.exit_rules.rsiThreshold}) but no open position at ${asset.identifier}`,
    );
  }

  // Otherwise → evaluate entry rules + cap enforcement.
  return evaluateEntry(asset, strategy, signal, sessionTotals);
}

/**
 * Evaluate the exit rule for an asset with an OPEN position.
 *
 * Sell semantics (per story AC 4): `rsi > exit_threshold` AND
 * `profit_pct >= min_profit_pct` → sell `sellFraction` of position.
 *
 * Edge cases (bonus Engineer DRI Decisions):
 *   * `avgCostUsd === 0` → divide-by-zero → hold with named reason
 *   * `!Number.isFinite(profit_pct)` → NaN propagation → hold with named reason
 *
 * Engineer DRI Decision #4: caps DO NOT apply to sells. The exit rule
 * fires (or doesn't) purely on signal + profit; session totals are not
 * consulted in this branch.
 */
function evaluateExit(
  asset: Asset,
  strategy: Strategy,
  signal: PerAssetSignal,
): DecisionResult {
  // hasPosition guard in caller ensures currentPosition is non-null with
  // quantity > 0; satisfy the type narrowing here.
  const position = signal.currentPosition;
  if (position === null) {
    return holdResult(
      asset,
      `hold: unexpected null currentPosition in evaluateExit at ${asset.identifier}`,
    );
  }

  // Bonus Engineer DRI Decision: avgCostUsd === 0 → divide-by-zero. The
  // position likely closed concurrently between the cron handler's read
  // and this evaluate() call.
  if (position.avgCostUsd === 0) {
    return holdResult(
      asset,
      `hold: cost basis is zero — position likely closed concurrently at ${asset.identifier}`,
    );
  }

  const profitPct =
    ((signal.lastClose - position.avgCostUsd) / position.avgCostUsd) * 100;

  // Bonus Engineer DRI Decision: NaN profit → hold with named reason.
  if (!Number.isFinite(profitPct)) {
    return holdResult(
      asset,
      `hold: profit computation produced NaN at ${asset.identifier}`,
    );
  }

  // signal.rsi is non-null here per the caller's null-check guard, but
  // satisfy the type narrowing.
  const rsi = signal.rsi as number;
  const exitThreshold = strategy.exit_rules.rsiThreshold;
  const minProfit = strategy.exit_rules.minProfitPct;

  const rsiAboveThreshold = rsi > exitThreshold;
  const profitMeetsMin = profitPct >= minProfit;

  if (rsiAboveThreshold && profitMeetsMin) {
    const sellPct = (strategy.exit_rules.sellFraction * 100).toFixed(0);
    return sellResult(
      asset,
      `sell: rsi=${rsi.toFixed(2)} > exit_threshold=${exitThreshold} AND profit=${profitPct.toFixed(2)}% >= min_profit=${minProfit.toFixed(2)}%; sell ${sellPct}% of position at ${asset.identifier}`,
      strategy.exit_rules.sellFraction,
    );
  }

  // Exit-rule miss → hold with specific named reason for the failed clause.
  if (!rsiAboveThreshold) {
    return holdResult(
      asset,
      `hold: position open + rsi=${rsi.toFixed(2)} <= exit_threshold=${exitThreshold} (no exit signal) at ${asset.identifier}`,
    );
  }

  // rsi crossed threshold but profit didn't — surface both numbers.
  return holdResult(
    asset,
    `hold: position open + rsi=${rsi.toFixed(2)} > exit_threshold=${exitThreshold} BUT profit=${profitPct.toFixed(2)}% < min_profit=${minProfit.toFixed(2)}%; no exit at ${asset.identifier}`,
  );
}

/**
 * Evaluate the entry rule for an asset with NO open position.
 *
 * Buy semantics (per story AC 3): `rsi < entry_threshold` AND (if
 * `maReinforcement` is on) `lastClose < ma` → buy `position_size_usd`.
 *
 * Then apply Engineer DRI Decision #2 cap-enforcement order: if buy
 * would fire AND caps are hit → override to hold with cap-named reason
 * that surfaces both the suppressed buy signal AND the cap that fired.
 */
function evaluateEntry(
  asset: Asset,
  strategy: Strategy,
  signal: PerAssetSignal,
  sessionTotals: SessionTotals,
): DecisionResult {
  // Type narrowing — signal.rsi + signal.ma are non-null per caller's
  // null-check guard.
  const rsi = signal.rsi as number;
  const ma = signal.ma as number;

  const entryThreshold = strategy.entry_rules.rsiThreshold;
  // Bonus Engineer DRI Decision: undefined maReinforcement → false.
  const maReinforcementOn = strategy.entry_rules.maReinforcement === true;

  const rsiBelowThreshold = rsi < entryThreshold;

  if (!rsiBelowThreshold) {
    return holdResult(
      asset,
      `hold: rsi=${rsi.toFixed(2)} >= entry_threshold=${entryThreshold} (no buy signal) at ${asset.identifier}`,
    );
  }

  // RSI check passes; if MA reinforcement is on, also check price < ma.
  if (maReinforcementOn && signal.lastClose >= ma) {
    return holdResult(
      asset,
      `hold: rsi=${rsi.toFixed(2)} < entry_threshold=${entryThreshold} BUT price=${signal.lastClose.toFixed(2)} >= ma${strategy.entry_rules.maPeriod}=${ma.toFixed(2)} (ma reinforcement requires price below ma); no buy at ${asset.identifier}`,
    );
  }

  // Buy signal fires — now check caps (Engineer DRI Decision #2: signal
  // first, then override).
  const dollarCapHit =
    sessionTotals.dollarSpent >= strategy.per_session_dollar_cap;
  const buyCountCapHit =
    sessionTotals.buyCount >= strategy.per_session_buy_count_cap;

  if (dollarCapHit || buyCountCapHit) {
    // LOUD override: the reason names the cap(s) AND surfaces that a buy
    // signal would have fired.
    const capParts: string[] = [];
    if (dollarCapHit) {
      capParts.push(
        `dollar_cap_reached ($${sessionTotals.dollarSpent.toFixed(2)} of $${strategy.per_session_dollar_cap} cap)`,
      );
    }
    if (buyCountCapHit) {
      capParts.push(
        `buy_count_cap_reached (${sessionTotals.buyCount} of ${strategy.per_session_buy_count_cap} cap)`,
      );
    }
    return holdResult(
      asset,
      `hold: ${capParts.join(" + ")}; buy signal suppressed at ${asset.identifier}`,
    );
  }

  // No caps hit — emit the buy.
  const reasonHead = maReinforcementOn
    ? `buy: rsi=${rsi.toFixed(2)} < entry_threshold=${entryThreshold} AND price=${signal.lastClose.toFixed(2)} < ma${strategy.entry_rules.maPeriod}=${ma.toFixed(2)}`
    : `buy: rsi=${rsi.toFixed(2)} < entry_threshold=${entryThreshold}`;
  return buyResult(
    asset,
    `${reasonHead}; buy $${strategy.position_size_usd} ${asset.identifier}`,
    strategy.position_size_usd,
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Result constructors — keep DecisionResult shape consistent across branches
// ──────────────────────────────────────────────────────────────────────────

function holdResult(asset: Asset, reason: string): DecisionResult {
  return { asset, decision: "hold", reason };
}

function buyResult(
  asset: Asset,
  reason: string,
  dollars: number,
): DecisionResult {
  const sizing: BuySizing = { kind: "buy_dollars", dollars };
  return { asset, decision: "buy", reason, sizing };
}

function sellResult(
  asset: Asset,
  reason: string,
  fraction: number,
): DecisionResult {
  const sizing: SellSizing = { kind: "sell_fraction", fraction };
  return { asset, decision: "sell", reason, sizing };
}

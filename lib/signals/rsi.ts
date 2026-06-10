// `lib/signals/rsi.ts` — pure-function RSI calculator.
//
// CB-4.0 (FIRST CB-4 STORY) per the [bet brief Scope § lib/signals/](../../docs/bets/CB-4/brief.md)
// + the [story Tech notes](../../docs/bets/CB-4/stories/CB-4.0/story.md).
//
// ENGINEER DRI DECISIONS (committed at this commit per story Tech notes):
//
//   1. RSI VARIANT = WILDER'S SMOOTHING — matches TradingView's "Standard"
//      RSI implementation; retail-trader convention. Reference: Welles
//      Wilder, "New Concepts in Technical Trading Systems" (1978). The
//      alternative (simple-RSI = gain/loss SMA without Wilder's smoothing
//      exponential adjustment) gives slightly different values; Wilder's
//      is what every modern charting tool ships.
//
//      Formula:
//        avg_gain[period] = mean(gains[0..period-1])  (seed; SMA over warmup)
//        avg_loss[period] = mean(losses[0..period-1])
//        avg_gain[i]      = ((period - 1) * avg_gain[i-1] + gain[i]) / period
//        avg_loss[i]      = ((period - 1) * avg_loss[i-1] + loss[i]) / period
//        RS               = avg_gain / avg_loss
//        RSI              = 100 - (100 / (1 + RS))
//
//      Special cases (Wilder's convention):
//        * If avg_loss === 0 AND avg_gain > 0  → RSI = 100  (no losses; pure uptrend)
//        * If avg_gain === 0 AND avg_loss > 0  → RSI = 0    (no gains; pure downtrend)
//        * If avg_gain === 0 AND avg_loss === 0 → RSI = 50  (flat; no change)
//
//   2. CANDLE GRANULARITY for production cron = `ONE_HOUR` (closes
//      Researcher Q1 from brief). lib/signals/ functions themselves are
//      granularity-agnostic; this decision documents the consumer-layer
//      choice (CB-4.2 cron handler).
//
//   3. LOOK-BACK WINDOW = 65 bars per asset per tick (closes Researcher
//      Q2). MA(50) needs 50 bars + RSI(14) Wilder warmup ~30 bars + safety
//      margin. Coinbase max 350/request well within. Decision applies at
//      the CB-4.2 cron handler; this file's tests use 60+-bar series for
//      the golden-value fixtures.
//
//   4. INSUFFICIENT-BARS SENTINEL = `null` (NOT NaN, NOT undefined, NOT
//      throw). Null is type-safe; CB-4.1 decision engine maps to
//      `{decision: "hold", reason: "insufficient_bars"}`.
//
//   5. INPUT TYPE = `closes: number[]` (NOT `Candle[]`). Decouples
//      lib/signals/ from any specific exchange's Candle shape; preserves
//      equity-app extraction-readiness per CB-3 PM DRI Decision #6. The
//      cron handler does `candles.map(c => parseFloat(c.close))`.
//
//   6. NaN IN INPUT → null (defense-in-depth). If `closes` contains any
//      NaN (e.g., Coinbase returned a candle whose `close` string failed
//      parseFloat), return null rather than propagating contamination.

/**
 * Compute the Wilder's-smoothing RSI of the given close-price series.
 *
 * @param period  Look-back period (e.g., 14 for the retail-standard
 *                RSI(14)). Must be a positive integer; values < 1 are
 *                treated as insufficient-bars (returns null).
 * @param closes  Close-price series, OLDEST FIRST. The function uses the
 *                FULL series (no slicing) so smoothing converges across
 *                all available bars. Series length must be ≥ period + 1
 *                (need `period` bars to seed avg gain/loss + ≥ 1 more bar
 *                to compute the first delta); shorter series returns null.
 * @returns       RSI value in [0, 100], OR null if input is insufficient,
 *                contains NaN, or `period` is invalid.
 */
export function rsi(period: number, closes: number[]): number | null {
  // Engineer DRI Decision #4: insufficient-bars / invalid input → null.
  if (!Number.isInteger(period) || period < 1) return null;
  if (closes.length < period + 1) return null;

  // Engineer DRI Decision #6: NaN-in-input → null (defense-in-depth).
  for (const c of closes) {
    if (!Number.isFinite(c)) return null;
  }

  // Compute deltas (gain / loss per bar). `deltas.length === closes.length - 1`.
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const delta = (closes[i] as number) - (closes[i - 1] as number);
    if (delta > 0) {
      gains.push(delta);
      losses.push(0);
    } else if (delta < 0) {
      gains.push(0);
      losses.push(-delta);
    } else {
      gains.push(0);
      losses.push(0);
    }
  }

  // Seed: SMA of first `period` gains/losses.
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    avgGain += gains[i] as number;
    avgLoss += losses[i] as number;
  }
  avgGain /= period;
  avgLoss /= period;

  // Wilder's smoothing across the remaining deltas.
  for (let i = period; i < gains.length; i++) {
    avgGain = ((period - 1) * avgGain + (gains[i] as number)) / period;
    avgLoss = ((period - 1) * avgLoss + (losses[i] as number)) / period;
  }

  // Wilder's convention special cases.
  if (avgLoss === 0 && avgGain === 0) return 50; // flat
  if (avgLoss === 0) return 100; // pure uptrend
  if (avgGain === 0) return 0; // pure downtrend

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

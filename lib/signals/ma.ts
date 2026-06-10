// `lib/signals/ma.ts` — pure-function Simple Moving Average calculator.
//
// CB-4.0 (FIRST CB-4 STORY) per the [bet brief Scope § lib/signals/](../../docs/bets/CB-4/brief.md)
// + the [story Tech notes](../../docs/bets/CB-4/stories/CB-4.0/story.md).
//
// ENGINEER DRI DECISIONS (committed at this commit per story Tech notes;
// shared with rsi.ts where applicable):
//
//   4. INSUFFICIENT-BARS SENTINEL = `null` — type-safe; CB-4.1 decision
//      engine maps to {decision: "hold", reason: "insufficient_bars"}.
//
//   5. INPUT TYPE = `closes: number[]` — decouples from any exchange's
//      Candle shape; preserves equity-app extraction-readiness per
//      CB-3 PM DRI Decision #6.
//
//   6. NaN IN INPUT → null (defense-in-depth).

/**
 * Compute the Simple Moving Average over the LAST `period` close prices
 * in the given series.
 *
 * Per CB-3.0 `MaPeriodSchema`, the operator's strategy uses period ∈
 * {5, 10, 20, 50}, but this function accepts any positive integer
 * (the strict-set check lives in CB-3.0's validation layer; ma.ts is a
 * generic math primitive that doesn't enforce strategy semantics).
 *
 * @param period  Window size (e.g., 20 for MA(20)). Must be a positive
 *                integer; values < 1 return null.
 * @param closes  Close-price series, OLDEST FIRST. Only the last `period`
 *                values are used (so a longer series than needed is fine
 *                — the function takes the trailing window). Series length
 *                must be ≥ period; shorter series returns null.
 * @returns       Arithmetic mean of the last `period` closes, OR null
 *                if input is insufficient, contains NaN, or `period` is
 *                invalid.
 */
export function ma(period: number, closes: number[]): number | null {
  // Engineer DRI Decision #4: insufficient-bars / invalid input → null.
  if (!Number.isInteger(period) || period < 1) return null;
  if (closes.length < period) return null;

  // Engineer DRI Decision #6: NaN-in-input → null (defense-in-depth).
  // Check only the trailing-window slice — earlier bars don't affect the
  // result, but defense-in-depth on the full input is the simpler
  // contract. Cron handler shouldn't be passing NaN-bearing arrays
  // either way.
  const window = closes.slice(-period);
  for (const c of window) {
    if (!Number.isFinite(c)) return null;
  }

  let sum = 0;
  for (const c of window) {
    sum += c;
  }
  return sum / period;
}

// `lib/signals/` public API.
//
// CB-4.0 — pure-function signal calculators (Wilder's RSI + simple MA).
// Asset-class-agnostic; no I/O; no `@/lib/coinbase/*` or `@/lib/db/*`
// or `@/lib/env/*` or `@/lib/strategy-*/*` imports (architectural
// invariant per tests/lib/signals/no-coupling.test.ts).
//
// Consumer pattern (CB-4.2 cron handler will do):
//   ```ts
//   import { rsi, ma } from "@/lib/signals";
//
//   const closes = candles.map((c) => parseFloat(c.close));
//   const rsiValue = rsi(14, closes);                // number | null
//   const maValue = ma(strategy.entry_rules.maPeriod, closes); // number | null
//   ```

export { rsi } from "./rsi";
export { ma } from "./ma";

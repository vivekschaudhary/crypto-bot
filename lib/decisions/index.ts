// `lib/decisions/` public API.
//
// CB-4.1 — pure-function decision engine. Asset-class-agnostic; no I/O;
// allows ONLY `@/lib/strategy-core/*` imports per architectural invariant
// (verified by tests/lib/decisions/no-coupling.test.ts).
//
// Consumer pattern (CB-4.2 cron handler will do):
//   ```ts
//   import { evaluate, type PerAssetSignal, type SessionTotals } from "@/lib/decisions";
//
//   const perAssetSignals = new Map<string, PerAssetSignal>(...);
//   const sessionTotals: SessionTotals = { dollarSpent, buyCount };
//   const decisions = evaluate(strategy, perAssetSignals, sessionTotals);
//
//   for (const d of decisions) {
//     // Write to bot_ticks.reason + signals row + (CB-4.3) conditional placeOrder.
//   }
//   ```

export { evaluate } from "./evaluate";
export type {
  BuySizing,
  Decision,
  DecisionResult,
  PerAssetSignal,
  SellSizing,
  SessionTotals,
} from "./types";

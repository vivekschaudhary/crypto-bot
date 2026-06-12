// `lib/ticks/tick-helpers.ts` — pure helpers for the cron tick pipeline.
//
// CB-4.2 AC 4 (tick_started_at flooring) + AC 6 (aggregate semantics).
// Pure functions; co-located tests pin the exact behaviors.

import type { DecisionResult } from "@/lib/decisions";

/**
 * Floor a timestamp to its 15-minute boundary (UTC). 14:07:33.250Z →
 * 14:00:00.000Z; 14:59:59Z → 14:45:00Z.
 *
 * Engineer DRI Decision #1 (story Tech notes): this is what makes
 * `UNIQUE (session_id, tick_started_at)` a real cron-overlap defense — a
 * double-fired invocation inside the same window computes the SAME floored
 * timestamp and the second INSERT hits the constraint (caught loud per
 * AC 5).
 */
export function floorToQuarterHour(d: Date): Date {
  const ms = d.getTime();
  const quarter = 15 * 60 * 1000;
  return new Date(Math.floor(ms / quarter) * quarter);
}

/**
 * Tick-level aggregate decision per AC 6: 'buy' if ≥1 per-asset buy, else
 * 'sell' if ≥1 sell, else 'hold'. The aggregate is a scannable index for
 * `bot_ticks.decision`; the per-asset audit record lives in the `signals`
 * rows.
 */
export function aggregateTickDecision(
  results: DecisionResult[],
): "buy" | "sell" | "hold" {
  if (results.some((r) => r.decision === "buy")) return "buy";
  if (results.some((r) => r.decision === "sell")) return "sell";
  return "hold";
}

/**
 * Compact per-asset summary for `bot_ticks.reason` per AC 6 — e.g.
 * `"BTC-USD: buy; ETH-USD: hold; SOL-USD: hold"`. Preserves
 * `selected_assets` input order (evaluate() guarantees result ordering;
 * CB-5 renders both layers consistently).
 */
export function summarizeTickReason(results: DecisionResult[]): string {
  return results.map((r) => `${r.asset.identifier}: ${r.decision}`).join("; ");
}

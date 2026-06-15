// `lib/dashboard/decision-trace.ts` — server-only read model for the CB-5
// decision-trace view.
//
// CB-5.1. SELECT-only (the dashboard is read-only; AC 8 invariant). Loads
// the latest N bot_ticks (newest-first) with their per-asset signals
// grouped underneath. Executes brief PM DRI Decision #7: the decision-trace
// shows DECISIONS (decision + reason + RSI/MA) — NOT the per-execution
// paper/live status, which lives in the ledger (CB-5.2, orders.status).

import { db } from "@/lib/db/client";

export type Decision = "buy" | "sell" | "hold";

export interface SignalRow {
  assetIdentifier: string;
  decision: Decision;
  rsi: number | null;
  ma: number | null;
  maPeriod: number | null;
  lastClose: number | null;
  reason: string;
}

export interface Tick {
  id: string;
  tickStartedAt: Date;
  decision: Decision;
  reason: string;
  errorDetail: string | null;
  signals: SignalRow[];
}

export interface DecisionTrace {
  ticks: Tick[];
  /** true when more ticks exist than the returned page (AC 7 "more exist" note). */
  hasMore: boolean;
}

const DEFAULT_LIMIT = 50;

/**
 * Latest `limit` ticks (newest-first) + their per-asset signals. Fetches
 * limit+1 ticks to detect `hasMore` without a separate COUNT.
 */
export async function loadDecisionTrace(limit: number = DEFAULT_LIMIT): Promise<DecisionTrace> {
  const sql = db();

  const tickRows = await sql<
    {
      id: string;
      tick_started_at: Date;
      decision: string;
      reason: string;
      error_detail: string | null;
    }[]
  >`
    SELECT id, tick_started_at, decision, reason, error_detail
      FROM bot_ticks
     ORDER BY tick_started_at DESC
     LIMIT ${limit + 1}
  `;

  const hasMore = tickRows.length > limit;
  const pageRows = hasMore ? tickRows.slice(0, limit) : tickRows;

  if (pageRows.length === 0) return { ticks: [], hasMore: false };

  const tickIds = pageRows.map((t) => t.id);
  const signalRows = await sql<
    {
      tick_id: string;
      asset_identifier: string;
      decision: string;
      rsi: number | null;
      ma: number | null;
      ma_period: number | null;
      last_close: number | null;
      reason: string;
    }[]
  >`
    SELECT tick_id,
           asset_identifier,
           decision,
           rsi::float8 AS rsi,
           ma::float8 AS ma,
           ma_period,
           last_close::float8 AS last_close,
           reason
      FROM signals
     WHERE tick_id = ANY(${tickIds})
     ORDER BY tick_id, asset_identifier
  `;

  const byTick = new Map<string, SignalRow[]>();
  for (const s of signalRows) {
    const list = byTick.get(s.tick_id) ?? [];
    list.push({
      assetIdentifier: s.asset_identifier,
      decision: s.decision as Decision,
      rsi: s.rsi,
      ma: s.ma,
      maPeriod: s.ma_period,
      lastClose: s.last_close,
      reason: s.reason,
    });
    byTick.set(s.tick_id, list);
  }

  const ticks: Tick[] = pageRows.map((t) => ({
    id: t.id,
    tickStartedAt: t.tick_started_at,
    decision: t.decision as Decision,
    reason: t.reason,
    errorDetail: t.error_detail,
    signals: byTick.get(t.id) ?? [],
  }));

  return { ticks, hasMore };
}

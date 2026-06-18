// `lib/dashboard/cockpit-trade-log.ts` — CB-6.4 read model for the cockpit's
// Trade Log table (section 6), per the viewed pair.
//
// SELECT-only, DB-only (read-only invariant — no write helpers, never reaches
// lib/coinbase/orders; no Coinbase at all → no scoped try/catch). Merges two
// NON-OVERLAPPING streams for the pair, newest-first:
//   * TRADE rows = `orders` (buy/sell, any status) — the actual trades.
//   * SKIP rows  = `signals⋈bot_ticks` where decision='hold' — ticks that
//     placed no order, with the operator-facing reason.
// Non-overlapping by the atomic write contract (insertTickWithDecisions): each
// buy/sell signal emits one order; each hold emits none.
//
// NOT session-scoped (story Decision 2026-06-17) — all-time recent per pair.
// Price/Qty are DEFERRED to the post-LIVE_MODE-flip follow-up (dark-mode
// dry_run orders have no real fill; price/qty live in trade_fills, live-only).

import { db } from "@/lib/db/client";

export type TradeLogStatus = "all" | "dry_run" | "submitted" | "failed" | "skipped";

const VALID_STATUSES: readonly TradeLogStatus[] = ["all", "dry_run", "submitted", "failed", "skipped"];

/** Pure: parse the `?txStatus=` param to a valid filter (default "all"). */
export function parseTradeLogStatus(raw: string | undefined): TradeLogStatus {
  return raw !== undefined && (VALID_STATUSES as readonly string[]).includes(raw)
    ? (raw as TradeLogStatus)
    : "all";
}

export interface TradeLogRow {
  id: string;
  kind: "trade" | "skip";
  time: Date;
  /** buy/sell for trades; null for skips. */
  side: "buy" | "sell" | null;
  /** order USD amount for trades; null for skips. */
  usd: number | null;
  /** raw order status (dry_run/submitted/failed) for trades; "SKIPPED" for skips. */
  status: string;
  /** the hold reason (verbatim) for skips; null for trades. */
  reason: string | null;
}

export interface CockpitTradeLog {
  rows: TradeLogRow[];
  hasMore: boolean;
}

const DEFAULT_LIMIT = 50;
const SKIPPED = "SKIPPED";

export async function loadCockpitTradeLog(
  pair: string,
  status: TradeLogStatus = "all",
  limit: number = DEFAULT_LIMIT,
): Promise<CockpitTradeLog> {
  const sql = db();

  const wantTrades = status !== "skipped";
  const wantSkips = status === "all" || status === "skipped";

  let tradeRows: TradeLogRow[] = [];
  let skipRows: TradeLogRow[] = [];

  if (wantTrades) {
    // The status filter is applied IN SQL (before the limit): "all" keeps every
    // status; a specific order status filters to it.
    const orders = await sql<
      { id: string; side: string; usd: number; status: string; created_at: Date }[]
    >`
      SELECT id, side, amount::float8 AS usd, status, created_at
        FROM orders
       WHERE asset_identifier = ${pair}
         AND (${status} = 'all' OR status = ${status})
       ORDER BY created_at DESC
       LIMIT ${limit + 1}
    `;
    tradeRows = orders.map((o) => ({
      id: o.id,
      kind: "trade" as const,
      time: o.created_at,
      side: o.side as "buy" | "sell",
      usd: o.usd,
      status: o.status,
      reason: null,
    }));
  }

  if (wantSkips) {
    const skips = await sql<{ id: string; tick_started_at: Date; reason: string }[]>`
      SELECT s.id, t.tick_started_at, s.reason
        FROM signals s
        JOIN bot_ticks t ON t.id = s.tick_id
       WHERE s.asset_identifier = ${pair}
         AND s.decision = 'hold'
       ORDER BY t.tick_started_at DESC
       LIMIT ${limit + 1}
    `;
    skipRows = skips.map((s) => ({
      id: s.id,
      kind: "skip" as const,
      time: s.tick_started_at,
      side: null,
      usd: null,
      status: SKIPPED,
      reason: s.reason,
    }));
  }

  // Merge, sort newest-first, slice to the limit. In "all" mode hasMore is
  // approximate (two limited streams merged then sliced) — acceptable for a
  // single-operator recent view; the ledger/trace links remain for full history.
  const merged = [...tradeRows, ...skipRows].sort((a, b) => b.time.getTime() - a.time.getTime());
  const hasMore = merged.length > limit;
  const rows = hasMore ? merged.slice(0, limit) : merged;
  return { rows, hasMore };
}

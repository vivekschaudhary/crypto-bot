// `lib/dashboard/cockpit-pnl.ts` — CB-6.2 read model for the cockpit's
// Profit/Loss card (section 2), per the viewed pair. SELECT + Coinbase-read
// only (read-only invariant — no write helpers, never reaches
// lib/coinbase/orders).
//
// SCOPING (resolved CB-6.1 issue):
//   * invested + buys  = SESSION-scoped (current bot_session, this pair, bot
//     buys, status <> 'failed' incl. dry_run — mirrors loadSessionActivity).
//   * currentValue + unrealized + realized = the REAL (all-time) position via
//     computeAssetPnl over Coinbase fills (fills aren't session_id-tagged).
//
// FAIL-LOUD (the PR #73 BLOCKER lesson, mirroring lib/dashboard/ledger:loadPnl):
// the Coinbase READS sit in the try → a network failure degrades the P&L
// fields to null (invested/buys, a pure DB read, still render). computeAssetPnl
// runs OUTSIDE the catch — a malformed-fill throw (Coinbase contract drift)
// MUST propagate (fail loud), not be swallowed as "unavailable".

import { getAccountTradeHistory } from "@/lib/coinbase/accounts";
import { getProduct } from "@/lib/coinbase/market";
import { computeAssetPnl } from "@/lib/dashboard/pnl";
import { db } from "@/lib/db/client";

export interface CockpitPnl {
  pair: string;
  /** session-scoped (current run, this pair). */
  invested: number;
  buys: number;
  /** position-derived — null when the Coinbase reads failed (degrade). */
  currentValue: number | null;
  unrealizedPnlUsd: number | null;
  realizedPnlUsd: number | null;
  unrealizedPct: number | null;
}

const FILLS_PAGE_LIMIT = 250;

export async function loadCockpitPnl(pair: string): Promise<CockpitPnl> {
  const sql = db();

  // Current session (the not-yet-ended run — same definition as the cron/dashboard).
  const sessionRows = await sql<{ id: string }[]>`
    SELECT id FROM bot_sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1
  `;
  const sessionId = sessionRows[0]?.id ?? null;

  // Session-scoped invested + buy count for the pair (DB-only; mirrors
  // live-state:loadSessionActivity, scoped to asset_identifier).
  let invested = 0;
  let buys = 0;
  if (sessionId) {
    const rows = await sql<{ buy_count: number; invested: number }[]>`
      SELECT COUNT(*)::int AS buy_count,
             COALESCE(SUM(amount), 0)::float8 AS invested
        FROM orders
       WHERE session_id = ${sessionId}
         AND asset_identifier = ${pair}
         AND source = 'bot'
         AND side = 'buy'
         AND status <> 'failed'
    `;
    buys = rows[0]?.buy_count ?? 0;
    invested = rows[0]?.invested ?? 0;
  }

  // Position P&L — Coinbase READS only inside the try (degrade on failure).
  let raw:
    | { fills: Awaited<ReturnType<typeof getAccountTradeHistory>>["fills"]; currentPrice: number | null }
    | null;
  try {
    const [{ fills }, product] = await Promise.all([
      getAccountTradeHistory({ productIds: [pair], limit: FILLS_PAGE_LIMIT }),
      getProduct(pair),
    ]);
    const priceNum = product.price !== undefined ? Number(product.price) : Number.NaN;
    raw = { fills, currentPrice: Number.isFinite(priceNum) ? priceNum : null };
  } catch {
    raw = null; // Coinbase read failure → degrade the P&L fields (AC 4/5)
  }

  if (raw === null) {
    return { pair, invested, buys, currentValue: null, unrealizedPnlUsd: null, realizedPnlUsd: null, unrealizedPct: null };
  }

  // OUTSIDE the catch — a malformed fill throws here and propagates (PR #73).
  const pnl = computeAssetPnl(raw.fills, raw.currentPrice);
  const currentValue = raw.currentPrice !== null ? pnl.quantity * raw.currentPrice : null;
  const costBasis = pnl.avgCostUsd * pnl.quantity;
  const unrealizedPct =
    pnl.unrealizedPnlUsd !== null && costBasis > 0 ? pnl.unrealizedPnlUsd / costBasis : null;

  return {
    pair,
    invested,
    buys,
    currentValue,
    unrealizedPnlUsd: pnl.unrealizedPnlUsd,
    realizedPnlUsd: pnl.realizedPnlUsd,
    unrealizedPct,
  };
}

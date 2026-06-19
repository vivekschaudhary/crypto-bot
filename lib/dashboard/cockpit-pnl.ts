// `lib/dashboard/cockpit-pnl.ts` — CB-6.2 read model for the cockpit's
// Profit/Loss card (section 2), per the viewed pair. SELECT + Coinbase-read
// only (read-only invariant — no write helpers, never reaches
// lib/coinbase/orders).
//
// CB-6.7 — PAPER-AWARE (mode-switched position source), so invested ↔ value ↔
// P&L are consistent in BOTH modes:
//   * LIVE_MODE=false (dark): position = the PAPER position synthesized from the
//     session's dry_run orders ledger (synthesizePaperFills); invested = the
//     session's dry_run buys. Both paper → consistent.
//   * LIVE_MODE=true (post-flip): position = the REAL all-time position via
//     Coinbase fills (CB-6.2 behaviour, unchanged); invested = real submitted buys.
// The fix for the operator's "$400 invested / $0 value": the value no longer
// reflects a REAL position while invested counted PAPER buys.
//
// FAIL-LOUD (the PR #73 BLOCKER lesson): the Coinbase READS (getProduct, + live
// fills) sit in the try → a network failure degrades the P&L fields to null
// (invested/buys, a pure DB read, still render). computeAssetPnl runs OUTSIDE
// the catch — a malformed-fill throw MUST propagate. Paper fills are a DB read
// (well-formed), fetched OUTSIDE the Coinbase try so a DB error propagates too.

import { getAccountTradeHistory } from "@/lib/coinbase/accounts";
import type { Fill } from "@/lib/coinbase/account-schemas";
import { getProduct } from "@/lib/coinbase/market";
import { computeAssetPnl } from "@/lib/dashboard/pnl";
import { synthesizePaperFills } from "@/lib/dashboard/paper-fills";
import { db } from "@/lib/db/client";
import { env } from "@/lib/env";

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
  /** CB-6.7: true while LIVE_MODE=false → the figures are PAPER (dry_run). */
  paper: boolean;
}

const FILLS_PAGE_LIMIT = 250;

export async function loadCockpitPnl(pair: string): Promise<CockpitPnl | null> {
  const sql = db();

  // Current session (the not-yet-ended run — same definition as the cron/dashboard).
  const sessionRows = await sql<{ id: string }[]>`
    SELECT id FROM bot_sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1
  `;
  const sessionId = sessionRows[0]?.id ?? null;

  // No active session → NO Profit/Loss card (AC 5). Return null; the cockpit's
  // no-session treatment (Bot Status) covers it. (Don't fetch Coinbase either.)
  if (sessionId === null) return null;

  const liveMode = env().LIVE_MODE;

  // Session-scoped invested + buy count for the pair — MODE-AWARE so it matches
  // the position basis: dark → dry_run (paper) buys; live → real submitted buys.
  const rows = await sql<{ buy_count: number; invested: number }[]>`
    SELECT COUNT(*)::int AS buy_count,
           COALESCE(SUM(amount), 0)::float8 AS invested
      FROM orders
     WHERE session_id = ${sessionId}
       AND asset_identifier = ${pair}
       AND source IN ('bot', 'manual')
       AND side = 'buy'
       AND ( (${liveMode} AND status NOT IN ('failed', 'dry_run'))
          OR (${!liveMode} AND status = 'dry_run') )
  `;
  const buys = rows[0]?.buy_count ?? 0;
  const invested = rows[0]?.invested ?? 0;

  // Paper fills are a DB read — OUTSIDE the Coinbase try (a DB error propagates).
  const paperFills: Fill[] | null = liveMode ? null : await synthesizePaperFills(pair);

  // Position P&L — Coinbase READS only inside the try (degrade on failure).
  // Dark: only the current price (getProduct). Live: live fills + price.
  let raw: { fills: Fill[]; currentPrice: number | null } | null;
  try {
    const product = await getProduct(pair);
    const priceNum = product.price !== undefined ? Number(product.price) : Number.NaN;
    const currentPrice = Number.isFinite(priceNum) ? priceNum : null;
    const fills = liveMode
      ? (await getAccountTradeHistory({ productIds: [pair], limit: FILLS_PAGE_LIMIT })).fills
      : (paperFills as Fill[]);
    raw = { fills, currentPrice };
  } catch {
    raw = null; // Coinbase read failure → degrade the P&L fields (AC 4/5)
  }

  if (raw === null) {
    return { pair, invested, buys, currentValue: null, unrealizedPnlUsd: null, realizedPnlUsd: null, unrealizedPct: null, paper: !liveMode };
  }

  // OUTSIDE the catch — a malformed (live) fill throws here and propagates (PR #73).
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
    paper: !liveMode,
  };
}

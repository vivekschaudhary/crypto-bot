// `lib/dashboard/paper-fills.ts` — CB-6.7. Synthesize Fill-shaped rows from the
// current session's dry_run orders for a pair, so the cockpit can compute a
// PAPER position / P&L (reusing computeAssetPnl + aggregatePosition) while dark
// (LIVE_MODE=false). Post-flip the cockpit uses REAL Coinbase fills instead.
//
// SELECT-only — reads the `orders` TABLE (allowed; the dashboard read-only
// invariant bans lib/coinbase/orders PLACEMENT + mutations, not table reads).
// Each dry_run order becomes a paper fill: price = amount / base_quantity (the
// effective fill price — for both buys [USD notional / qty] and sells
// [qty × limitPrice / qty]). Rows with NULL base_quantity (pre-CB-6.7) are
// excluded — forward-only, as documented in the story.

import type { Fill } from "@/lib/coinbase/account-schemas";
import { db } from "@/lib/db/client";

export async function synthesizePaperFills(pair: string): Promise<Fill[]> {
  const sql = db();

  const sessionRows = await sql<{ id: string }[]>`
    SELECT id FROM bot_sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1
  `;
  const sessionId = sessionRows[0]?.id ?? null;
  if (sessionId === null) return [];

  const rows = await sql<
    { id: string; side: string; amount: number; base_quantity: number | null; created_at: Date }[]
  >`
    SELECT id, side, amount::float8 AS amount, base_quantity::float8 AS base_quantity, created_at
      FROM orders
     WHERE session_id = ${sessionId}
       AND asset_identifier = ${pair}
       AND source IN ('bot', 'manual')
       AND status = 'dry_run'
       AND base_quantity IS NOT NULL
     ORDER BY created_at ASC
  `;

  return rows
    .filter((r) => r.base_quantity !== null && r.base_quantity > 0)
    .map((r) => {
      const qty = r.base_quantity as number;
      return {
        entry_id: r.id,
        trade_id: r.id,
        order_id: r.id,
        trade_time: r.created_at.toISOString(),
        price: String(r.amount / qty),
        size: String(qty),
        product_id: pair,
        side: r.side === "buy" ? "BUY" : "SELL",
      } as Fill;
    });
}

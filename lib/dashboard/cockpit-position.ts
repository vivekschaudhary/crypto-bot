// `lib/dashboard/cockpit-position.ts` — CB-6.1 read model for the cockpit's
// per-pair Current Position card. SELECT/Coinbase-read only (the dashboard is
// read-only — AC 6 invariant; imports NO write helpers, never reaches
// lib/coinbase/orders). Composes the SHIPPED reads:
//   * held qty + avg cost = aggregatePosition over the pair's Coinbase fills
//     (same path as CB-5.0 loadHoldings).
//   * live price = getProduct(pair).price (same read as CB-5.2 ledger PnL).
//   * latest RSI = the most recent bot_ticks⋈signals row for the pair (CB-5.1).
// Best-effort degrade (CB-5.0 precedent): a Coinbase failure yields a null
// cell, never throws — the cockpit's other panels stay intact.

import { getAccountTradeHistory } from "@/lib/coinbase/accounts";
import { getProduct } from "@/lib/coinbase/market";
import { synthesizePaperFills } from "@/lib/dashboard/paper-fills";
import { db } from "@/lib/db/client";
import { env } from "@/lib/env";
import { aggregatePosition } from "@/lib/ticks/cost-basis";

export interface CockpitPosition {
  pair: string;
  /** null = no open position in this pair. */
  position: { quantity: number; avgCostUsd: number } | null;
  /** null = Coinbase price read failed or absent. */
  livePrice: number | null;
  /** null = no signal recorded for this pair yet. */
  rsi: number | null;
  /** CB-6.7: true while LIVE_MODE=false → the position is PAPER (from the dry_run ledger). */
  paper: boolean;
}

const FILLS_PAGE_LIMIT = 250;

/**
 * Pure: resolve the viewed pair from the `?pair` query param + the strategy's
 * selected assets. Returns the requested pair if it's one of the selected
 * assets, else the first selected asset, else null (no assets). Unit-tested.
 */
export function resolveViewedPair(
  requested: string | undefined,
  selectedAssets: string[],
): string | null {
  if (selectedAssets.length === 0) return null;
  if (requested && selectedAssets.includes(requested)) return requested;
  return selectedAssets[0] ?? null;
}

export async function loadCockpitPosition(pair: string): Promise<CockpitPosition> {
  const liveMode = env().LIVE_MODE;

  // Held qty + avg cost. CB-6.7: dark → PAPER position from the dry_run ledger
  // (DB read; consistent with the Profit/Loss card); live → REAL Coinbase fills
  // (best-effort degrade on a Coinbase failure, CB-6.1 behaviour).
  let position: { quantity: number; avgCostUsd: number } | null = null;
  if (!liveMode) {
    position = aggregatePosition(await synthesizePaperFills(pair));
  } else {
    try {
      const { fills } = await getAccountTradeHistory({ productIds: [pair], limit: FILLS_PAGE_LIMIT });
      position = aggregatePosition(fills);
    } catch {
      position = null;
    }
  }

  // Live price — best-effort.
  let livePrice: number | null = null;
  try {
    const product = await getProduct(pair);
    const p = product.price !== undefined ? Number(product.price) : Number.NaN;
    livePrice = Number.isFinite(p) ? p : null;
  } catch {
    livePrice = null;
  }

  // Latest RSI for the pair (most recent tick's signal). SELECT-only.
  const sql = db();
  const rows = await sql<{ rsi: number | null }[]>`
    SELECT s.rsi
      FROM signals s
      JOIN bot_ticks t ON t.id = s.tick_id
     WHERE s.asset_identifier = ${pair}
     ORDER BY t.tick_started_at DESC
     LIMIT 1
  `;
  const rsi = rows[0]?.rsi ?? null;

  return { pair, position, livePrice, rsi, paper: !liveMode };
}

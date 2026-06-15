// `lib/dashboard/pnl.ts` — pure per-asset PnL (CB-5.2).
//
// Realized + unrealized PnL from Coinbase fills + current price, using the
// SHARED weighted-average replay (lib/ticks/cost-basis:replayFills) — the
// same cost basis the live-state holdings show, so the ledger's avg cost
// and the live-state's avg cost AGREE (story PM Decision; Researcher Q1
// closed PnL-in-MVP). Pure; no I/O. Researcher Q1.

import type { Fill } from "@/lib/coinbase/account-schemas";
import { replayFills } from "@/lib/ticks/cost-basis";

const EPSILON = 1e-9;

export interface AssetPnl {
  quantity: number;
  avgCostUsd: number;
  /** null when no current price is available (Coinbase fetch failed). */
  currentPrice: number | null;
  realizedPnlUsd: number;
  /** null when currentPrice is null OR quantity is flat. */
  unrealizedPnlUsd: number | null;
}

/**
 * Per-asset PnL from the fill history + current price.
 *
 *   realized   = Σ over sells of (sellPrice − avgCostAtSale) × sellQty  (replayFills)
 *   unrealized = (currentPrice − avgCostUsd) × quantity                 (open position)
 *
 * unrealized is null when currentPrice is null (price fetch failed) or the
 * position is flat. Weighted-average basis (consistent with
 * aggregatePosition / live-state holdings — NOT FIFO).
 */
export function computeAssetPnl(fills: Fill[], currentPrice: number | null): AssetPnl {
  const { quantity, totalCostUsd, realizedPnlUsd } = replayFills(fills);
  const flat = quantity <= EPSILON;
  const avgCostUsd = flat ? 0 : totalCostUsd / quantity;
  const unrealizedPnlUsd =
    currentPrice !== null && !flat ? (currentPrice - avgCostUsd) * quantity : null;
  return {
    quantity: flat ? 0 : quantity,
    avgCostUsd,
    currentPrice,
    realizedPnlUsd,
    unrealizedPnlUsd,
  };
}

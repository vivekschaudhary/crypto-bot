// `lib/dashboard/ledger.ts` — server-only read model for the CB-5.2
// transaction-ledger view. SELECT-only.
//
// Reading the `orders` TABLE is the point here; the dashboard invariant
// bans `lib/coinbase/orders` (order PLACEMENT) + writes, NOT reads of the
// orders table. Composes: the orders rows (bounded) + per-asset PnL
// (computeAssetPnl over real Coinbase fills + getProduct current price).
// PnL degrades to null on any Coinbase failure — the orders table (pure DB
// read) renders regardless (story AC 6).

import { getAccountTradeHistory } from "@/lib/coinbase/accounts";
import { getProduct } from "@/lib/coinbase/market";
import { db } from "@/lib/db/client";
import { getActiveStrategy } from "@/lib/strategies/db";
import { type AssetPnl, computeAssetPnl } from "@/lib/dashboard/pnl";

export interface LedgerRow {
  id: string;
  assetIdentifier: string;
  source: "manual" | "bot";
  side: "buy" | "sell";
  amount: number;
  status: string;
  createdAt: Date;
}

export type AssetPnlRow = { assetIdentifier: string } & AssetPnl;

export interface Ledger {
  orders: LedgerRow[];
  /** null = the Coinbase reads for PnL failed (panel degrades; AC 6). */
  pnl: AssetPnlRow[] | null;
  hasMore: boolean;
}

const DEFAULT_LIMIT = 50;
const FILLS_PAGE_LIMIT = 250;

async function loadOrders(limit: number): Promise<{ orders: LedgerRow[]; hasMore: boolean }> {
  const sql = db();
  const rows = await sql<
    {
      id: string;
      asset_identifier: string;
      source: string;
      side: string;
      amount: number;
      status: string;
      created_at: Date;
    }[]
  >`
    SELECT id, asset_identifier, source, side, amount::float8 AS amount, status, created_at
      FROM orders
     ORDER BY created_at DESC
     LIMIT ${limit + 1}
  `;
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    hasMore,
    orders: page.map((r) => ({
      id: r.id,
      assetIdentifier: r.asset_identifier,
      source: r.source as "manual" | "bot",
      side: r.side as "buy" | "sell",
      amount: r.amount,
      status: r.status,
      createdAt: r.created_at,
    })),
  };
}

/**
 * Per-asset PnL for the active strategy's selected assets. Returns null if
 * any Coinbase read fails — the whole panel degrades (AC 6), the orders
 * table is unaffected.
 */
async function loadPnl(): Promise<AssetPnlRow[] | null> {
  const strategy = await getActiveStrategy();
  if (!strategy) return [];

  // STEP 1 — Coinbase READS. ONLY these may degrade the panel (AC 6): a
  // network/API failure → return null (the orders table still renders).
  let raw: { id: string; fills: Awaited<ReturnType<typeof getAccountTradeHistory>>["fills"]; currentPrice: number | null }[];
  try {
    raw = await Promise.all(
      strategy.selected_assets.map(async (asset) => {
        const id = asset.identifier;
        const [{ fills }, product] = await Promise.all([
          getAccountTradeHistory({ productIds: [id], limit: FILLS_PAGE_LIMIT }),
          getProduct(id),
        ]);
        const priceNum = product.price !== undefined ? Number(product.price) : Number.NaN;
        return { id, fills, currentPrice: Number.isFinite(priceNum) ? priceNum : null };
      }),
    );
  } catch {
    return null; // Coinbase read failure → degrade the PnL panel (AC 6)
  }

  // STEP 2 — PnL COMPUTE, OUTSIDE the catch. computeAssetPnl/replayFills
  // throws on malformed fills (Coinbase contract drift) — that MUST fail
  // LOUD, not be swallowed as "Coinbase unavailable" (PR #73 BLOCKER; AC 1
  // / replayFills contract). A malformed-fill throw propagates out of
  // loadLedger → the page errors, surfacing the real data bug.
  return raw.map(({ id, fills, currentPrice }) => ({
    assetIdentifier: id,
    ...computeAssetPnl(fills, currentPrice),
  }));
}

/** Compose the ledger (orders + per-asset PnL). SSR per load. */
export async function loadLedger(limit: number = DEFAULT_LIMIT): Promise<Ledger> {
  const [{ orders, hasMore }, pnl] = await Promise.all([loadOrders(limit), loadPnl()]);
  return { orders, pnl, hasMore };
}

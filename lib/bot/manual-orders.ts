// `lib/bot/manual-orders.ts` — server-only REAL-MONEY override helpers (CB-6.6).
//
// The producer side of the cockpit Manual Overrides (force_buy / sell_50 /
// sell_all). Un-defers CB-5.4. UNLIKE lib/bot/overrides.ts (the SAFE, state-only
// helpers, which MUST stay order-free), this module reaches lib/coinbase/orders
// under the LIVE_MODE gate — the deliberate inversion of the CB-5.3
// /api/bot/** no-orders invariant (tests/app/api/bot/invariants.test.ts keeps a
// STRUCTURAL guard that overrides.ts never reaches orders, + BEHAVIORAL tests
// that the LIVE_MODE gate holds here).
//
// PAPER-WHILE-DARK (NO bypass): LIVE_MODE=false → a dry_run row, placeOrder is
// NEVER called; LIVE_MODE=true → placeOrder, then a submitted/failed row.
// Placement (network) happens OUTSIDE any DB transaction, mirroring the CB-4.3
// tick (place, then persist the order + audit event atomically). Idempotency:
// a deterministic clientOrderId over (sessionId, orderId, asset).

import { createHash } from "node:crypto";

import { ulid } from "ulidx";

import { getAccountTradeHistory } from "@/lib/coinbase/accounts";
import { getProduct } from "@/lib/coinbase/market";
import { placeOrder } from "@/lib/coinbase/orders";
import { db } from "@/lib/db/client";
import { env } from "@/lib/env";
import { getStrategyById } from "@/lib/strategies/db";
import { aggregatePosition } from "@/lib/ticks/cost-basis";
import { aggregateSessionTotals, insertManualOrder } from "@/lib/ticks/db";
import { buildLimitOrder } from "@/lib/ticks/orders";
import { sanitizeErrorDetail } from "@/lib/ticks/trace";

const FILLS_PAGE_LIMIT = 250;

export type ManualOrderKind = "force_buy" | "sell_50" | "sell_all";

export type ManualOrderOutcome =
  | { ok: true; status: "dry_run" | "submitted"; side: "buy" | "sell"; amountUsd: number }
  | {
      ok: false;
      reason:
        | "no-session"
        | "no-strategy"
        | "invalid-asset"
        | "cap-reached"
        | "no-position"
        | "price-unavailable"
        | "placement-failed";
    };

/** Deterministic Coinbase client_order_id for a manual override (idempotency). */
function manualClientOrderId(sessionId: string, orderId: string, asset: string): string {
  const seed = `manual|${sessionId}|${orderId}|${asset}`;
  return createHash("sha256").update(seed).digest("hex").slice(0, 32);
}

interface CurrentSession {
  id: string;
  activeStrategyId: string | null;
}

async function currentSession(): Promise<CurrentSession | null> {
  const sql = db();
  const rows = await sql<{ id: string; active_strategy_id: string | null }[]>`
    SELECT id, active_strategy_id
      FROM bot_sessions
     WHERE ended_at IS NULL
     ORDER BY started_at DESC
     LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, activeStrategyId: row.active_strategy_id };
}

/**
 * Place + record a manual order, LIVE_MODE-gated. Placement is OUTSIDE the DB
 * tx; the order row + audit event are written together (insertManualOrder).
 */
async function placeAndRecord(args: {
  sessionId: string;
  asset: string;
  side: "buy" | "sell";
  kind: ManualOrderKind;
  config: import("@/lib/coinbase/order-schemas").OrderConfiguration;
  amountUsd: number;
}): Promise<ManualOrderOutcome> {
  const orderId = ulid();
  const liveMode = env().LIVE_MODE;

  // PAPER while dark — record a dry_run row; placeOrder is NEVER called.
  if (!liveMode) {
    await insertManualOrder({
      id: orderId,
      sessionId: args.sessionId,
      assetIdentifier: args.asset,
      side: args.side,
      amount: args.amountUsd,
      status: "dry_run",
      coinbaseOrderId: null,
      errorDetail: null,
      kind: args.kind,
    });
    return { ok: true, status: "dry_run", side: args.side, amountUsd: args.amountUsd };
  }

  // LIVE — place the real order (network, outside any tx), then persist.
  const clientOrderId = manualClientOrderId(args.sessionId, orderId, args.asset);
  let status: "submitted" | "failed" = "failed";
  let coinbaseOrderId: string | null = null;
  let errorDetail: string | null = null;
  try {
    const resp = await placeOrder({
      productId: args.asset,
      side: args.side === "buy" ? "BUY" : "SELL",
      orderConfiguration: args.config,
      clientOrderId,
    });
    if (resp.success && resp.success_response) {
      status = "submitted";
      coinbaseOrderId = resp.success_response.order_id;
    } else {
      errorDetail = sanitizeErrorDetail(
        resp.error_response?.message ?? resp.error_response?.error ?? "order rejected (no error_response)",
      );
    }
  } catch (err) {
    errorDetail = sanitizeErrorDetail(err instanceof Error ? err.message : String(err));
  }

  await insertManualOrder({
    id: orderId,
    sessionId: args.sessionId,
    assetIdentifier: args.asset,
    side: args.side,
    amount: args.amountUsd,
    status,
    coinbaseOrderId,
    errorDetail,
    kind: args.kind,
  });

  if (status === "submitted") {
    return { ok: true, status, side: args.side, amountUsd: args.amountUsd };
  }
  return { ok: false, reason: "placement-failed" };
}

/** force_buy — a manual buy of `position_size_usd` of the viewed pair. */
export async function forceBuy(asset: string): Promise<ManualOrderOutcome> {
  const session = await currentSession();
  if (!session) return { ok: false, reason: "no-session" };
  if (!session.activeStrategyId) return { ok: false, reason: "no-strategy" };
  const strategy = await getStrategyById(session.activeStrategyId);
  if (!strategy) return { ok: false, reason: "no-strategy" };
  if (!strategy.selected_assets.some((a) => a.identifier === asset)) {
    return { ok: false, reason: "invalid-asset" };
  }

  // Caps (combined bot+manual; submitted-only → a no-op while dark). Same
  // already-at-or-over semantics as the bot's evaluate (lib/decisions).
  const totals = await aggregateSessionTotals(session.id);
  if (
    totals.dollarSpent >= strategy.per_session_dollar_cap ||
    totals.buyCount >= strategy.per_session_buy_count_cap
  ) {
    return { ok: false, reason: "cap-reached" };
  }

  let product: Awaited<ReturnType<typeof getProduct>>;
  try {
    product = await getProduct(asset);
  } catch {
    return { ok: false, reason: "price-unavailable" };
  }
  const lastClose = product.price !== undefined ? Number(product.price) : Number.NaN;
  if (!Number.isFinite(lastClose)) return { ok: false, reason: "price-unavailable" };

  const built = buildLimitOrder({
    side: "BUY",
    lastClose,
    dollars: strategy.position_size_usd,
    quoteIncrement: product.quote_increment,
    baseIncrement: product.base_increment,
  });
  return placeAndRecord({
    sessionId: session.id,
    asset,
    side: "buy",
    kind: "force_buy",
    config: built.config,
    amountUsd: built.amountUsd,
  });
}

/** sell_50 / sell_all — sell a fraction of the held position of the viewed pair. */
export async function sellFraction(
  asset: string,
  fraction: number,
  kind: "sell_50" | "sell_all",
): Promise<ManualOrderOutcome> {
  const session = await currentSession();
  if (!session) return { ok: false, reason: "no-session" };
  if (!session.activeStrategyId) return { ok: false, reason: "no-strategy" };
  const strategy = await getStrategyById(session.activeStrategyId);
  if (!strategy) return { ok: false, reason: "no-strategy" };
  if (!strategy.selected_assets.some((a) => a.identifier === asset)) {
    return { ok: false, reason: "invalid-asset" };
  }

  // Held quantity + current price from Coinbase. Refuse (no order) on a read
  // failure or an empty position — never place a guessed size.
  let product: Awaited<ReturnType<typeof getProduct>>;
  let heldQuantity: number;
  try {
    const [{ fills }, p] = await Promise.all([
      getAccountTradeHistory({ productIds: [asset], limit: FILLS_PAGE_LIMIT }),
      getProduct(asset),
    ]);
    product = p;
    heldQuantity = aggregatePosition(fills)?.quantity ?? 0;
  } catch {
    return { ok: false, reason: "price-unavailable" };
  }
  if (heldQuantity <= 0) return { ok: false, reason: "no-position" };
  const lastClose = product.price !== undefined ? Number(product.price) : Number.NaN;
  if (!Number.isFinite(lastClose)) return { ok: false, reason: "price-unavailable" };

  const built = buildLimitOrder({
    side: "SELL",
    lastClose,
    fraction,
    heldQuantity,
    quoteIncrement: product.quote_increment,
    baseIncrement: product.base_increment,
  });
  return placeAndRecord({
    sessionId: session.id,
    asset,
    side: "sell",
    kind,
    config: built.config,
    amountUsd: built.amountUsd,
  });
}

// `lib/ticks/orders.ts` — pure helpers for CB-4.3 order placement.
//
// CB-4.3 (FOURTH / LAST LOAD-BEARING CB-4 STORY). All functions here are
// pure (no I/O); the route composes them with the LIVE_MODE-gated
// placeOrder call. Co-located tests pin the exact behaviors.
//
// ENGINEER DRI DECISIONS (committed at this commit per story Tech notes):
//
//   2. deterministicClientOrderId — sha256 over (sessionId, tickStartedAt,
//      assetIdentifier), hex, sliced to 32 chars. DETERMINISTIC so a cron
//      double-fire or a retry re-sends the SAME client_order_id → Coinbase
//      rejects the duplicate rather than executing twice (story AC 5; the
//      load-bearing real-money idempotency guard). The orders ledger does
//      NOT store this id (recomputable from the seed; keeps the row at the
//      amended Order-entity shape), but Coinbase echoes it on the order so
//      reconciliation can recompute + match.
//
//   3. SLIPPAGE = 0.5%. Buy-limit = lastClose × 1.005 (willing to pay up
//      to 0.5% above market to fill); sell-limit = lastClose × 0.995
//      (willing to accept 0.5% below). Prices floored to quote_increment,
//      sizes floored to base_increment (floor on both keeps buys within
//      the USD budget + sells within holdings — never over). Closes
//      Researcher Q3, validated by the gated real-order test.

import { createHash } from "node:crypto";

import type { OrderConfiguration } from "@/lib/coinbase/order-schemas";

export const SLIPPAGE = 0.005;

// Fallback precision when Coinbase omits the product increments (AC /
// Decision #4): conservative — most USD pairs price to cents, base to 8dp.
const FALLBACK_QUOTE_INCREMENT = "0.01";
const FALLBACK_BASE_INCREMENT = "0.00000001";

/**
 * Deterministic Coinbase `client_order_id` for one (session, tick, asset).
 * Same inputs → same id (idempotency); different asset → different id.
 */
export function deterministicClientOrderId(
  sessionId: string,
  tickStartedAt: Date,
  assetIdentifier: string,
): string {
  const seed = `${sessionId}|${tickStartedAt.toISOString()}|${assetIdentifier}`;
  return createHash("sha256").update(seed).digest("hex").slice(0, 32);
}

/** Number of decimal places implied by an increment string ("0.01" → 2). */
function decimalsOf(increment: string): number {
  const dot = increment.indexOf(".");
  if (dot === -1) return 0;
  return increment.length - dot - 1;
}

/**
 * Floor `value` to a multiple of `increment`, returned as a fixed-precision
 * string at the increment's decimal places. Floor (not round) so a buy's
 * base_size never exceeds the USD budget and a sell's never exceeds
 * holdings.
 */
export function floorToIncrement(value: number, increment: string): string {
  const inc = Number(increment);
  const dec = decimalsOf(increment);
  if (!Number.isFinite(inc) || inc <= 0) {
    // Defensive: a malformed increment shouldn't crash placement — fall
    // back to the value at 8dp.
    return value.toFixed(8);
  }
  // EPSILON guard: floating-point makes products like 1000 × 1.005 =
  // 1004.9999999999999, which would floor to 1004.99 instead of 1005.00 —
  // dropping a whole increment for a value mathematically AT a boundary.
  // A tiny additive epsilon (well below any real increment's significance)
  // pulls boundary-noise values back up without affecting values genuinely
  // below a multiple (0.019/0.01 = 1.9 stays floored to 1 → safety held).
  const multiples = Math.floor(value / inc + 1e-9);
  return (multiples * inc).toFixed(dec);
}

/**
 * Build the `limit_limit_gtc` order configuration for a buy/sell.
 *
 * @param side          "BUY" | "SELL"
 * @param lastClose     latest close price (limit anchor)
 * @param baseQuantity  for BUY: dollars / limitPrice (computed by caller
 *                      AFTER the price is known — see buildLimitOrder);
 *                      for SELL: fraction × currentPosition.quantity
 *      NOTE: this fn takes the already-decided base quantity to stay pure +
 *      single-responsibility; buildLimitOrder wires the buy math.
 * @param quoteIncrement / baseIncrement  from getProduct (fallbacks applied)
 */
export function buildLimitOrderConfig(args: {
  side: "BUY" | "SELL";
  limitPrice: number;
  baseQuantity: number;
  quoteIncrement?: string;
  baseIncrement?: string;
}): OrderConfiguration {
  const quoteInc = args.quoteIncrement ?? FALLBACK_QUOTE_INCREMENT;
  const baseInc = args.baseIncrement ?? FALLBACK_BASE_INCREMENT;
  return {
    limit_limit_gtc: {
      base_size: floorToIncrement(args.baseQuantity, baseInc),
      limit_price: floorToIncrement(args.limitPrice, quoteInc),
    },
  };
}

/**
 * Compute the full limit order (price + base size + config + USD amount)
 * for a decision. Pure — the route supplies lastClose, the dollar/fraction
 * sizing, the current holding quantity (for sells), and the product
 * increments.
 *
 *   BUY:  limitPrice = lastClose × (1 + SLIPPAGE); baseQuantity = dollars / limitPrice
 *   SELL: limitPrice = lastClose × (1 − SLIPPAGE); baseQuantity = fraction × heldQuantity
 *
 * `amountUsd` (the ledger `orders.amount`, AC 10): BUY = dollars (USD
 * notional); SELL = baseQuantity × limitPrice (USD value of the sold leg).
 */
export function buildLimitOrder(args: {
  side: "BUY" | "SELL";
  lastClose: number;
  dollars?: number; // BUY
  fraction?: number; // SELL
  heldQuantity?: number; // SELL
  quoteIncrement?: string;
  baseIncrement?: string;
}): { config: OrderConfiguration; limitPrice: number; baseQuantity: number; amountUsd: number } {
  if (args.side === "BUY") {
    const dollars = args.dollars ?? 0;
    const limitPrice = args.lastClose * (1 + SLIPPAGE);
    const baseQuantity = dollars / limitPrice;
    const config = buildLimitOrderConfig({
      side: "BUY",
      limitPrice,
      baseQuantity,
      quoteIncrement: args.quoteIncrement,
      baseIncrement: args.baseIncrement,
    });
    return { config, limitPrice, baseQuantity, amountUsd: dollars };
  }
  // SELL
  const fraction = args.fraction ?? 0;
  const heldQuantity = args.heldQuantity ?? 0;
  const limitPrice = args.lastClose * (1 - SLIPPAGE);
  const baseQuantity = fraction * heldQuantity;
  const config = buildLimitOrderConfig({
    side: "SELL",
    limitPrice,
    baseQuantity,
    quoteIncrement: args.quoteIncrement,
    baseIncrement: args.baseIncrement,
  });
  return { config, limitPrice, baseQuantity, amountUsd: baseQuantity * limitPrice };
}

// `lib/ticks/cost-basis.ts` — pure cost-basis aggregation from Coinbase fills.
//
// CB-4.2 AC 7 — turns a page of `Fill` rows (CB-2.3's
// `getAccountTradeHistory`) into the decision engine's
// `currentPosition: {avgCostUsd, quantity} | null` per asset.
//
// ENGINEER DRI DECISIONS (committed at this commit per story Tech notes):
//
//   3a. NET-POSITION METHOD = WEIGHTED-AVERAGE REDUCTION. Buys add quantity
//       at fill price (cost basis grows by qty × price). Sells reduce
//       quantity AND reduce total cost PROPORTIONALLY at the current
//       average (NOT FIFO lot tracking). Rationale: matches how the
//       operator's spreadsheet (product.md origin story) computes average
//       cost; FIFO lot tracking adds state for tax-accounting precision the
//       MVP doesn't need — the bot only consumes avgCostUsd for the
//       take-profit comparison.
//
//   3b. FILLS ARE PROCESSED IN trade_time ASCENDING order regardless of
//       input order (Coinbase returns newest-first; the math requires
//       chronological replay for the weighted average to be correct).
//
//   3c. `size_in_quote` HANDLING — Coinbase fills may be sized in quote
//       currency (USD) rather than base. When `size_in_quote === true`,
//       base quantity = size / price; otherwise size IS the base quantity.
//
//   3d. OVERSELL CLAMPS TO FLAT. If sells exceed tracked buys (operator
//       sold coins acquired before the fill window, or external transfer),
//       quantity clamps to 0 rather than going negative — the bot treats
//       the asset as no-position. Logged-not-thrown: the per-asset signals
//       row records the resulting null position via the decision reason.
//
//   3e. EPSILON = 1e-9. Quantities at-or-under epsilon count as flat
//       (floating-point dust from proportional reductions).

import type { Fill } from "@/lib/coinbase/account-schemas";

const EPSILON = 1e-9;

/**
 * Replay fills chronologically into a net position with weighted-average
 * cost basis. Returns null when the net position is flat (zero fills, or
 * sells consumed all tracked buys).
 *
 * Malformed numeric strings (NaN price/size) fail loud — a Fill that
 * doesn't parse indicates Coinbase API contract drift (CB-2.5 posture),
 * and silently skipping it would mis-state the operator's cost basis.
 */
export function aggregatePosition(
  fills: Fill[],
): { avgCostUsd: number; quantity: number } | null {
  const chronological = [...fills].sort(
    (a, b) => new Date(a.trade_time).getTime() - new Date(b.trade_time).getTime(),
  );

  let quantity = 0;
  let totalCostUsd = 0;

  for (const fill of chronological) {
    const price = Number(fill.price);
    const size = Number(fill.size);
    if (!Number.isFinite(price) || !Number.isFinite(size) || price <= 0 || size <= 0) {
      throw new Error(
        `aggregatePosition: malformed fill (entry_id=${fill.entry_id}; price=${fill.price}; size=${fill.size}) — Coinbase contract drift?`,
      );
    }

    // Engineer DRI Decision #3c: size may be denominated in quote (USD).
    const baseQty = fill.size_in_quote === true ? size / price : size;

    const side = fill.side.toUpperCase();
    if (side === "BUY") {
      quantity += baseQty;
      totalCostUsd += baseQty * price;
    } else if (side === "SELL") {
      // Engineer DRI Decision #3a: weighted-average reduction — selling
      // removes cost at the CURRENT average, preserving avg for the rest.
      const sellQty = Math.min(baseQty, quantity); // #3d oversell clamp
      if (quantity > EPSILON) {
        const avg = totalCostUsd / quantity;
        totalCostUsd -= sellQty * avg;
      }
      quantity -= sellQty;
    }
    // Unknown sides (Coinbase additions) are ignored — .passthrough()
    // spirit; they don't change the position math we know how to do.
  }

  if (quantity <= EPSILON) return null;
  return { avgCostUsd: totalCostUsd / quantity, quantity };
}

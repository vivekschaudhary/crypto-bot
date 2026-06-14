// `lib/ticks/db.ts` — narrow DB ops for the bot tick pipeline.
//
// CB-4.2 AC 2 — session load + session-totals aggregation + the
// transactional tick write. Mirrors `lib/strategies/db.ts` conventions:
// async functions, shared postgres.js client via `lib/db/client.ts:db()`,
// tagged-template parameterization (NOT sql.unsafe).
//
// APPEND-ONLY INVARIANT: `bot_ticks` + `signals` are INSERT-only at the
// app layer (architecture append-only event log; brief guardrail). No
// UPDATE path exists in this module BY DESIGN — the CI grep test
// (tests/app/api/cron/tick/invariants.test.ts) asserts it stays that way.

import { db } from "@/lib/db/client";

/** The singleton bot session row (0001-init + 0004's active_strategy_id). */
export interface BotSession {
  id: string;
  status: "active" | "paused" | "reset";
  activeStrategyId: string | null;
}

/** Cap-enforcement inputs for `evaluate()` — see CB-4.1 `SessionTotals`. */
export interface SessionTotalsRow {
  dollarSpent: number;
  buyCount: number;
}

/** One per-asset decision row destined for the reshaped `signals` table. */
export interface SignalRowInsert {
  id: string;
  assetIdentifier: string;
  decision: "buy" | "sell" | "hold";
  reason: string;
  rsi: number | null;
  ma: number | null;
  maPeriod: number | null;
  lastClose: number | null;
}

/**
 * One unified-ledger row destined for the reshaped `orders` table (CB-4.3,
 * migration 0006). Written in the SAME transaction as the tick. Dry-run:
 * `status='dry_run'`, `coinbaseOrderId=null`. Live success:
 * `status='submitted'` + the Coinbase order id. Live failure:
 * `status='failed'` + a redacted `errorDetail`. Only buy/sell decisions
 * produce a row (a hold is not a transaction).
 */
export interface OrderRowInsert {
  id: string;
  assetIdentifier: string;
  side: "buy" | "sell";
  amount: number;
  status: "dry_run" | "submitted" | "failed";
  coinbaseOrderId: string | null;
  errorDetail: string | null;
}

export interface TickInsert {
  id: string;
  sessionId: string;
  tickStartedAt: Date;
  decision: "buy" | "sell" | "hold";
  reason: string;
  errorDetail?: string;
  signals: SignalRowInsert[];
  orders?: OrderRowInsert[];
}

/**
 * Read the singleton `bot_sessions` row. Returns null when no session has
 * ever been bootstrapped (operator hasn't saved a strategy yet — CB-3.3's
 * `upsertSingletonBotSession` creates the row on first save).
 */
export async function loadSingletonSession(): Promise<BotSession | null> {
  const sql = db();
  const rows = await sql<
    { id: string; status: string; active_strategy_id: string | null }[]
  >`
    SELECT id, status, active_strategy_id
      FROM bot_sessions
     LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    status: row.status as BotSession["status"],
    activeStrategyId: row.active_strategy_id,
  };
}

/**
 * Aggregate the active session's bot-buy totals for cap enforcement.
 *
 * PM DRI Decision #2 (story): source of truth is the `orders` ledger —
 * `source='bot'`, `side='buy'`, non-failed, session-scoped. Returns ZEROS
 * during the CB-4.2 window (no `orders` writes exist until CB-4.3 ships
 * the ledger writes per brief PM Decision #8); the query is the permanent
 * seam — CB-4.3 changes nothing here, rows simply start existing.
 *
 * `amount` semantics: for bot BUY orders the column stores the USD
 * notional (CB-4.1 `BuySizing.dollars`); exact status taxonomy lands with
 * CB-4.3's Engineer DRI.
 */
export async function aggregateSessionTotals(
  sessionId: string,
): Promise<SessionTotalsRow> {
  const sql = db();
  const rows = await sql<{ dollar_spent: number; buy_count: number }[]>`
    SELECT COALESCE(SUM(amount), 0)::float8 AS dollar_spent,
           COUNT(*)::int AS buy_count
      FROM orders
     WHERE session_id = ${sessionId}
       AND source = 'bot'
       AND side = 'buy'
       AND status <> 'failed'
  `;
  return {
    dollarSpent: rows[0]?.dollar_spent ?? 0,
    buyCount: rows[0]?.buy_count ?? 0,
  };
}

/**
 * Write the tick + its per-asset decision rows in ONE transaction
 * (AC 3 step 7). INSERT-only. A unique-constraint violation on
 * `(session_id, tick_started_at)` propagates to the caller — the route
 * handles it LOUDLY per AC 5 (narrow 23505 catch; never swallowed here).
 */
export async function insertTickWithDecisions(tick: TickInsert): Promise<void> {
  const sql = db();
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO bot_ticks (id, session_id, tick_started_at, decision, reason, error_detail)
      VALUES (
        ${tick.id},
        ${tick.sessionId},
        ${tick.tickStartedAt},
        ${tick.decision},
        ${tick.reason},
        ${tick.errorDetail ?? null}
      )
    `;
    for (const s of tick.signals) {
      await tx`
        INSERT INTO signals (id, tick_id, asset_identifier, decision, reason, rsi, ma, ma_period, last_close)
        VALUES (
          ${s.id},
          ${tick.id},
          ${s.assetIdentifier},
          ${s.decision},
          ${s.reason},
          ${s.rsi},
          ${s.ma},
          ${s.maPeriod},
          ${s.lastClose}
        )
      `;
    }
    // CB-4.3: unified ledger rows (buy/sell only) in the SAME transaction
    // as the tick — bot_ticks + signals + orders are atomic per tick.
    for (const o of tick.orders ?? []) {
      await tx`
        INSERT INTO orders (id, asset_identifier, session_id, source, side, amount, status, coinbase_order_id, error_detail)
        VALUES (
          ${o.id},
          ${o.assetIdentifier},
          ${tick.sessionId},
          'bot',
          ${o.side},
          ${o.amount},
          ${o.status},
          ${o.coinbaseOrderId},
          ${o.errorDetail}
        )
      `;
    }
  });
}

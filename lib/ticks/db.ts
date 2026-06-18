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

import { ulid } from "ulidx";

import { db } from "@/lib/db/client";

/** The current bot session row (0001-init + 0004's active_strategy_id). */
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
 * Read the CURRENT `bot_sessions` row — the latest session by `started_at`.
 * Returns null when no session has ever been bootstrapped (operator hasn't
 * saved a strategy yet — CB-3.3's `upsertSingletonBotSession` creates the
 * row on first save).
 *
 * CB-5.3 (MULTI-ROW): `bot_sessions` is no longer a singleton. A reset ENDS
 * the current row (`status='reset'`, `ended_at` set) and INSERTs a new active
 * row (per the foundation architecture `BotSession` model + story PM Decision
 * #1). The CURRENT session is the not-yet-ended run: `WHERE ended_at IS NULL`
 * (the `bot_sessions_single_current` partial unique index guarantees at most
 * one). `ORDER BY started_at DESC LIMIT 1` is belt-and-suspenders ordering.
 * This selects the row the cron must tick against — an ended (`reset`) row is
 * never returned as current, even transiently. (The fn name is retained for
 * caller stability; "singleton" is now a historical label.) Regression-guarded
 * in tests/lib/ticks/db.test.ts.
 */
export async function loadSingletonSession(): Promise<BotSession | null> {
  const sql = db();
  const rows = await sql<
    { id: string; status: string; active_strategy_id: string | null }[]
  >`
    SELECT id, status, active_strategy_id
      FROM bot_sessions
     WHERE ended_at IS NULL
     ORDER BY started_at DESC
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
 * `source='bot'`, `side='buy'`, session-scoped, counting ONLY rows that
 * deployed REAL capital.
 *
 * CAP SEMANTICS — count live deployments only (PR #65 round-1 BLOCKER):
 * caps (`per_session_dollar_cap` / `per_session_buy_count_cap`) bound how
 * much REAL operator capital the bot commits per session, so this excludes
 * BOTH `failed` (no money) AND `dry_run` (paper, no money). The CB-4.2
 * predicate was `status <> 'failed'` — correct THEN (the table was empty,
 * so it returned zeros), but CB-4.3 introduced `dry_run` rows and counting
 * them would let a long paper-trading session exhaust the caps, so that
 * flipping `LIVE_MODE=true` alone would still suppress buys. Excluding
 * `dry_run` at the query is the robust fix (no dependence on a session
 * reset between paper and live): paper trades NEVER count against
 * real-money caps, within or across sessions. Counts `submitted` now + any
 * future live status (filled/pending/…) by exclusion.
 *
 * `amount` semantics: for bot BUY orders the column stores the USD
 * notional (CB-4.1 `BuySizing.dollars` = `position_size_usd`).
 *
 * CB-6.6: manual overrides (`source='manual'`) ALSO count — the per-session
 * caps are a hard real-money ceiling for the session, BOT + MANUAL combined
 * (operator decision). `dry_run`/`failed` stay excluded (paper/no-money never
 * counts), so while dark every override is dry_run → contributes nothing →
 * enforcement activates only post-LIVE_MODE-flip.
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
       AND source IN ('bot', 'manual')
       AND side = 'buy'
       AND status NOT IN ('failed', 'dry_run')
  `;
  return {
    dollarSpent: rows[0]?.dollar_spent ?? 0,
    buyCount: rows[0]?.buy_count ?? 0,
  };
}

/**
 * CB-6.6 — write a MANUAL override order row (`source='manual'`) + its
 * `override_events` audit row in ONE transaction. Unlike the tick's orders
 * (coupled to a `bot_ticks` row), a manual override has no tick; it writes a
 * standalone order against the current session + the audit event together.
 * INSERT-only (append-only ledger).
 */
export async function insertManualOrder(o: {
  id: string;
  sessionId: string;
  assetIdentifier: string;
  side: "buy" | "sell";
  amount: number;
  status: "dry_run" | "submitted" | "failed";
  coinbaseOrderId: string | null;
  errorDetail: string | null;
  kind: "force_buy" | "sell_50" | "sell_all";
}): Promise<void> {
  const sql = db();
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO orders (id, asset_identifier, session_id, source, side, amount, status, coinbase_order_id, error_detail)
      VALUES (
        ${o.id},
        ${o.assetIdentifier},
        ${o.sessionId},
        'manual',
        ${o.side},
        ${o.amount},
        ${o.status},
        ${o.coinbaseOrderId},
        ${o.errorDetail}
      )
    `;
    await tx`
      INSERT INTO override_events (id, session_id, kind)
      VALUES (${ulid()}, ${o.sessionId}, ${o.kind})
    `;
  });
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

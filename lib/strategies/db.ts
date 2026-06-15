// `lib/strategies/db.ts` — narrow DB ops for the strategy authoring surface.
//
// CB-3.3 (FOURTH + LAST CB-3 STORY) — server-only persistence layer for the
// strategies + bot_sessions tables introduced in CB-3.2 (migration 0004).
// Consumed by `app/dashboard/strategy/strategy-actions.ts` (the saveStrategy
// server action) and by `app/dashboard/strategy/page.tsx` (active-strategy
// pre-fill on initial render).
//
// CONTRACT: every function here is async; reads/writes are routed through the
// shared `lib/db/client.ts:db()` postgres.js client; tagged-template `${...}`
// interpolation is the parameterization mechanism (NOT sql.unsafe). Mirrors
// the pattern in `lib/auth/sessions.ts`.
//
// ENGINEER DRI DECISIONS (CB-3.3 build):
//
//   #2  bot_sessions singleton via SELECT-then-INSERT-OR-UPDATE
//       ───────────────────────────────────────────────────────
//       The bet architecture documents `upsertSingletonBotSession(userId,
//       activeStrategyId)`. The actual `bot_sessions` schema (0001-init.sql:
//       23-30) has NO `user_id` column — single-operator MVP means the table
//       is genuinely a global singleton (exactly one row in the database).
//       Architecture's two-arg signature reflects future-multi-operator
//       readiness but isn't materialized in the schema.
//
//       Deviation: drop the unused `userId` param. Read the existing row's id
//       (LIMIT 1); if none → INSERT a fresh row; if exists → UPDATE the
//       `active_strategy_id` column. Wrapped in a transaction so a race
//       between two saves can't insert two rows.
//
//       When (and if) CB-4 surfaces a multi-operator need, the schema gets a
//       `user_id` column + unique constraint + ON CONFLICT, and this helper's
//       signature gains the param back. Architecture invariant preserved at
//       the contract level (one row per logical operator); changes at the
//       SQL level only.
//
//   No app-code UPDATE strategy content paths — supersession-only updates.
//   `markSuperseded` only touches `superseded_by_strategy_id`. The
//   application-side invariant lives in
//   `lib/strategy-core/supersession.ts:assertSupersessionOnlyUpdate`.

import { ulid } from "ulidx";

import { db } from "@/lib/db/client";
import { StrategySchema, type Strategy, type StrategyId } from "@/lib/strategy-core/types";

/**
 * Fetch the operator's current active strategy — the latest non-superseded
 * row. Returns `null` if no strategy has ever been saved (first-time
 * authoring case).
 *
 * Definition of "active": `superseded_by_strategy_id IS NULL` AND it's the
 * latest such row by `created_at DESC`. Per CB-3.2 architecture Decision #4:
 * the supersession FK chain models revisions; the leaf (non-superseded) row
 * is the active one. Multiple non-superseded rows shouldn't exist at app
 * layer (supersession is enforced by `supersede` + `markSuperseded`), but
 * the ORDER BY makes the active-strategy selection robust if the invariant
 * were ever violated by an out-of-band write.
 *
 * `bot_sessions.active_strategy_id` is the *fast* path for CB-4's bot tick
 * (single row lookup); this function is the *complete* read consumed by the
 * authoring UI (returns the typed Zod row for pre-fill).
 */
export async function getActiveStrategy(): Promise<Strategy | null> {
  const sql = db();
  const rows = await sql<Record<string, unknown>[]>`
    SELECT id,
           name,
           asset_class,
           selected_assets,
           entry_rules,
           exit_rules,
           position_size_usd::float8 AS position_size_usd,
           per_session_buy_count_cap,
           per_session_dollar_cap::float8 AS per_session_dollar_cap,
           created_at,
           created_by_user_id,
           superseded_by_strategy_id
      FROM strategies
     WHERE superseded_by_strategy_id IS NULL
     ORDER BY created_at DESC
     LIMIT 1
  `;
  if (rows.length === 0) return null;
  // StrategySchema validates the row shape per CB-3.2 AC 5 (DB row →
  // CB-3.0 Zod type roundtrip). If validation fails here, schema drift has
  // happened; throw rather than silently returning a malformed object.
  return StrategySchema.parse(rows[0]);
}

/**
 * Fetch ONE strategy row by id — the bot tick's read path. CB-4.2 (PR #63
 * round-1 BLOCKER closure): the cron tick must follow
 * `bot_sessions.active_strategy_id → strategies` per the CB-4 brief
 * Hypothesis + CB-3 brief PM Decision #2 (single-active-per-session
 * contract). `getActiveStrategy()` above is the UI-oriented
 * latest-non-superseded read for form pre-fill; the two SHOULD agree
 * (CB-3.3's save flow updates both), but the session pointer is the
 * bot's contract — if they ever diverge, the bot must trade what the
 * session says, not what the UI would display.
 */
export async function getStrategyById(id: string): Promise<Strategy | null> {
  const sql = db();
  const rows = await sql<Record<string, unknown>[]>`
    SELECT id,
           name,
           asset_class,
           selected_assets,
           entry_rules,
           exit_rules,
           position_size_usd::float8 AS position_size_usd,
           per_session_buy_count_cap,
           per_session_dollar_cap::float8 AS per_session_dollar_cap,
           created_at,
           created_by_user_id,
           superseded_by_strategy_id
      FROM strategies
     WHERE id = ${id}
     LIMIT 1
  `;
  if (rows.length === 0) return null;
  return StrategySchema.parse(rows[0]);
}

/**
 * INSERT a new strategy row. Caller is responsible for generating the ULID
 * (done in the server action so the id is server-side-trusted). The row
 * must already pass `StrategySchema.parse` before reaching here — this
 * function is the persistence sink, not the validator.
 */
export async function insertStrategy(row: Strategy): Promise<void> {
  const sql = db();
  await sql`
    INSERT INTO strategies (
      id,
      name,
      asset_class,
      selected_assets,
      entry_rules,
      exit_rules,
      position_size_usd,
      per_session_buy_count_cap,
      per_session_dollar_cap,
      created_at,
      created_by_user_id,
      superseded_by_strategy_id
    ) VALUES (
      ${row.id},
      ${row.name},
      ${row.asset_class},
      ${sql.json(row.selected_assets)},
      ${sql.json(row.entry_rules)},
      ${sql.json(row.exit_rules)},
      ${row.position_size_usd},
      ${row.per_session_buy_count_cap},
      ${row.per_session_dollar_cap},
      ${row.created_at},
      ${row.created_by_user_id},
      ${row.superseded_by_strategy_id}
    )
  `;
}

/**
 * Mark an existing strategy as superseded by a newer one. The ONLY allowed
 * UPDATE against the `strategies` table per architecture Decision #4 +
 * `lib/strategy-core/supersession.ts:assertSupersessionOnlyUpdate`. Strategy
 * content is immutable post-creation; revisions are append-only.
 */
export async function markSuperseded(
  oldId: StrategyId,
  newId: StrategyId,
): Promise<void> {
  const sql = db();
  await sql`
    UPDATE strategies
       SET superseded_by_strategy_id = ${newId}
     WHERE id = ${oldId}
  `;
}

/**
 * Singleton bot_session UPSERT (Engineer DRI Decision #2). Sets the
 * `active_strategy_id` pointer on the one bot_sessions row. Creates the row
 * if it doesn't exist yet (first-ever-save bootstrap; status='active').
 *
 * Wrapped in a transaction so a concurrent SELECT + INSERT race can't insert
 * two rows. Single-operator MVP means even without strict concurrency
 * defense the worst case is rare; the transaction is cheap insurance.
 */
export async function upsertSingletonBotSession(
  activeStrategyId: StrategyId,
): Promise<void> {
  const sql = db();
  await sql.begin(async (tx) => {
    // CB-5.3 (MULTI-ROW): bot_sessions is no longer a singleton — a reset
    // ends the current row and inserts a new active one. Select the CURRENT
    // session — the not-yet-ended run (`ended_at IS NULL`) — so a save UPDATEs
    // the active row, not a stale ended (`reset`) one. Matches
    // loadSingletonSession's current-session selection.
    const existing = await tx<{ id: string }[]>`
      SELECT id FROM bot_sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1 FOR UPDATE
    `;
    if (existing.length === 0) {
      // Bootstrap: no bot_session row yet. Insert one with status='active'.
      // started_at + created_at + updated_at default to now().
      await tx`
        INSERT INTO bot_sessions (id, status, active_strategy_id)
        VALUES (${ulid()}, 'active', ${activeStrategyId})
      `;
      return;
    }
    const sessionId = existing[0]?.id;
    if (!sessionId) {
      // Shouldn't happen — LIMIT 1 with non-empty length means row exists.
      // Defensive: re-bootstrap.
      await tx`
        INSERT INTO bot_sessions (id, status, active_strategy_id)
        VALUES (${ulid()}, 'active', ${activeStrategyId})
      `;
      return;
    }
    await tx`
      UPDATE bot_sessions
         SET active_strategy_id = ${activeStrategyId},
             updated_at = now()
       WHERE id = ${sessionId}
    `;
  });
}

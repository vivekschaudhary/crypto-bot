// `lib/bot/overrides.ts` — server-only override-control DB ops (CB-5.3).
//
// The producer side of the safe override controls: pause / resume / reset
// write `bot_sessions.status` + an append-only `override_events` audit row.
// The cron tick is the consumer (CB-4.2 reads status at the top of each
// tick). SAFE controls only — these are state-only writes; NO order
// placement, NO real money (the `/api/bot/**` invariant test asserts this
// module's caller never reaches lib/coinbase/orders). The real-money kinds
// (force_buy / sell_*) are deferred to CB-5.4 and rejected at the route.
//
// CONTRACT (mirrors lib/strategies/db.ts + lib/ticks/db.ts): every fn is
// async; routed through the shared `lib/db/client.ts:db()` postgres.js
// client; tagged-template `${...}` parameterization (NOT sql.unsafe); each
// action is ONE transaction so the status write + the audit row commit
// together (or not at all).
//
// ENGINEER DRI DECISIONS (CB-5.3 build):
//
//   #1  reset = MULTI-ROW (story PM Decision #1 / foundation architecture
//       `BotSession` model). resetSession ENDS the current row
//       (status='reset', ended_at=now()) AND INSERTs a NEW active row,
//       carrying active_strategy_id forward, in ONE transaction. Historical
//       orders/bot_ticks/signals keep pointing at the now-ended session
//       (their session_id is unchanged) — the audit ledger survives ("reset
//       clears the session, not the exchange or the history"). NO migration
//       (bot_sessions.ended_at exists since 0001-init).
//
//   #2  the reset `override_events` row is attached to the ENDED (old)
//       session_id — the override acted ON that session (it terminated it).
//       The new session begins clean. pause/resume attach to the current
//       session_id (the session they mutate). This keeps override_events a
//       faithful per-session audit of operator actions against each session.

import { ulid } from "ulidx";

import { db } from "@/lib/db/client";

/** The safe (state-only) override kinds. force_buy/sell_* are CB-5.4. */
export type OverrideKind = "pause" | "resume" | "reset";

export interface OverrideResult {
  /** The status of the CURRENT session after the action. */
  status: "active" | "paused";
  /** The current session id after the action (a NEW id after a reset). */
  sessionId: string;
}

/**
 * Pause: set the current session `status='paused'` + log a `pause`
 * override_event, in ONE transaction. Pausing an already-paused session is
 * a no-op status-wise but still logs the event (AC 2 — audit of the operator
 * action). The cron honors the pause from the NEXT tick (AC 7).
 */
export async function pauseSession(sessionId: string): Promise<OverrideResult> {
  const sql = db();
  await sql.begin(async (tx) => {
    await tx`
      UPDATE bot_sessions
         SET status = 'paused', updated_at = now()
       WHERE id = ${sessionId}
    `;
    await tx`
      INSERT INTO override_events (id, session_id, kind)
      VALUES (${ulid()}, ${sessionId}, 'pause')
    `;
  });
  return { status: "paused", sessionId };
}

/**
 * Resume: set the current session `status='active'` + log a `resume`
 * override_event, in ONE transaction (AC 3).
 */
export async function resumeSession(sessionId: string): Promise<OverrideResult> {
  const sql = db();
  await sql.begin(async (tx) => {
    await tx`
      UPDATE bot_sessions
         SET status = 'active', updated_at = now()
       WHERE id = ${sessionId}
    `;
    await tx`
      INSERT INTO override_events (id, session_id, kind)
      VALUES (${ulid()}, ${sessionId}, 'resume')
    `;
  });
  return { status: "active", sessionId };
}

/**
 * Reset (AC 4 — MULTI-ROW per the architecture `BotSession` model). In ONE
 * transaction: END the current session (status='reset', ended_at=now()),
 * INSERT a NEW active session carrying `activeStrategyId` forward, and log a
 * `reset` override_event against the ENDED session (Decision #2). The new
 * row becomes the current session (loadSingletonSession selects latest by
 * started_at). Historical orders/ticks/signals are PRESERVED (they reference
 * the ended session_id) — the ledger view still shows them.
 */
export async function resetSession(args: {
  sessionId: string;
  activeStrategyId: string | null;
}): Promise<OverrideResult> {
  const sql = db();
  const newSessionId = ulid();
  await sql.begin(async (tx) => {
    await tx`
      UPDATE bot_sessions
         SET status = 'reset', ended_at = now(), updated_at = now()
       WHERE id = ${args.sessionId}
    `;
    await tx`
      INSERT INTO bot_sessions (id, status, active_strategy_id)
      VALUES (${newSessionId}, 'active', ${args.activeStrategyId})
    `;
    await tx`
      INSERT INTO override_events (id, session_id, kind)
      VALUES (${ulid()}, ${args.sessionId}, 'reset')
    `;
  });
  return { status: "active", sessionId: newSessionId };
}

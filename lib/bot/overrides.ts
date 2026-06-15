// `lib/bot/overrides.ts` — server-only override-control DB ops (CB-5.3).
//
// The producer side of the safe override controls: pause / resume / reset
// write `bot_sessions.status` + an append-only `override_events` audit row.
// The cron tick is the consumer (CB-4.2 reads status at the top of each
// tick). SAFE controls only — state-only writes; NO order placement, NO real
// money (the `/api/bot/**` invariant test asserts this module's caller never
// reaches lib/coinbase/orders). The real-money kinds (force_buy / sell_*) are
// deferred to CB-5.4 and rejected at the route.
//
// SESSION-INTEGRITY CONTRACT (round-1 review BLOCKER fix).
// Each helper resolves AND LOCKS the current session INSIDE its own
// transaction — it does NOT act on a session id loaded earlier by the route.
// "Current" = the not-yet-ended run (`ended_at IS NULL`), newest by
// started_at, taken `FOR UPDATE`. This guarantees the mutated row is still
// current at COMMIT time, so a stale or concurrent request can neither:
//   * reopen an already-ended session (the ended row no longer matches
//     `ended_at IS NULL`, so it's never selected), nor
//   * fork the session (concurrent resets serialize on the row lock; the
//     loser finds no current row in its snapshot and no-ops — and the
//     `bot_sessions_single_current` partial unique index (migration 0007) is
//     the structural backstop: a second concurrent active insert fails 23505,
//     which the route maps to 409).
//
// CONTRACT (mirrors lib/strategies/db.ts + lib/ticks/db.ts): every fn is
// async; routed through the shared `lib/db/client.ts:db()` postgres.js
// client; tagged-template `${...}` parameterization (NOT sql.unsafe).
//
// ENGINEER DRI DECISIONS (CB-5.3 build):
//
//   #1  reset = MULTI-ROW (story PM Decision #1 / foundation architecture
//       `BotSession` model). resetSession ENDS the current row
//       (status='reset', ended_at=now()) AND INSERTs a NEW active row,
//       carrying active_strategy_id forward (read from the LOCKED row, not a
//       stale route read), in ONE transaction. Historical
//       orders/bot_ticks/signals keep pointing at the now-ended session —
//       the audit ledger survives.
//
//   #2  the reset `override_events` row is attached to the ENDED (old)
//       session_id — the override acted ON that session (it terminated it).
//       pause/resume attach to the current session_id (the session they
//       mutate). override_events stays a faithful per-session audit.
//
//   #3  the helpers take NO sessionId argument (round-1 BLOCKER fix): the
//       current session is resolved + locked in-transaction, so the route
//       cannot hand them a stale id. They return a discriminated outcome so
//       the route can map `no-session` → 409 without a separate pre-read.

import { ulid } from "ulidx";

import { db } from "@/lib/db/client";

/** The safe (state-only) override kinds. force_buy/sell_* are CB-5.4. */
export type OverrideKind = "pause" | "resume" | "reset";

export type OverrideOutcome =
  | {
      ok: true;
      /** Status of the CURRENT session after the action. */
      status: "active" | "paused";
      /** Current session id after the action (a NEW id after a reset). */
      sessionId: string;
    }
  | { ok: false; reason: "no-session" };

/**
 * Pause: lock the current session, set `status='paused'` + log a `pause`
 * override_event — ONE transaction. Pausing an already-paused session is a
 * no-op status-wise but still logs the event (AC 2 — audit of the operator
 * action). The cron honors it from the NEXT tick (AC 7).
 */
export async function pauseSession(): Promise<OverrideOutcome> {
  return statusOverride("paused", "pause");
}

/**
 * Resume: lock the current session, set `status='active'` + log a `resume`
 * override_event — ONE transaction (AC 3).
 */
export async function resumeSession(): Promise<OverrideOutcome> {
  return statusOverride("active", "resume");
}

/** Shared pause/resume body — both are a status flip + an audit row. */
async function statusOverride(
  status: "active" | "paused",
  kind: "pause" | "resume",
): Promise<OverrideOutcome> {
  const sql = db();
  return sql.begin(async (tx) => {
    const current = await tx<{ id: string }[]>`
      SELECT id
        FROM bot_sessions
       WHERE ended_at IS NULL
       ORDER BY started_at DESC
       LIMIT 1
         FOR UPDATE
    `;
    const id = current[0]?.id;
    if (!id) return { ok: false, reason: "no-session" };

    await tx`
      UPDATE bot_sessions
         SET status = ${status}, updated_at = now()
       WHERE id = ${id}
    `;
    await tx`
      INSERT INTO override_events (id, session_id, kind)
      VALUES (${ulid()}, ${id}, ${kind})
    `;
    return { ok: true, status, sessionId: id };
  });
}

/**
 * Reset (AC 4 — MULTI-ROW per the architecture `BotSession` model). In ONE
 * transaction: lock the current session, END it (status='reset',
 * ended_at=now()), INSERT a NEW active session carrying its
 * `active_strategy_id` forward, and log a `reset` override_event against the
 * ENDED session (Decision #2). The new row becomes current. Historical
 * orders/ticks/signals are PRESERVED (they reference the ended session_id).
 */
export async function resetSession(): Promise<OverrideOutcome> {
  const sql = db();
  const newSessionId = ulid();
  return sql.begin(async (tx) => {
    const current = await tx<{ id: string; active_strategy_id: string | null }[]>`
      SELECT id, active_strategy_id
        FROM bot_sessions
       WHERE ended_at IS NULL
       ORDER BY started_at DESC
       LIMIT 1
         FOR UPDATE
    `;
    const row = current[0];
    if (!row?.id) return { ok: false, reason: "no-session" };

    await tx`
      UPDATE bot_sessions
         SET status = 'reset', ended_at = now(), updated_at = now()
       WHERE id = ${row.id}
    `;
    await tx`
      INSERT INTO bot_sessions (id, status, active_strategy_id)
      VALUES (${newSessionId}, 'active', ${row.active_strategy_id ?? null})
    `;
    await tx`
      INSERT INTO override_events (id, session_id, kind)
      VALUES (${ulid()}, ${row.id}, 'reset')
    `;
    return { ok: true, status: "active", sessionId: newSessionId };
  });
}

// `lib/dashboard/cockpit-signals.ts` — CB-6.3 read model for the cockpit's
// Signals + Next Action card (section 4), per the viewed pair.
//
// SELECT-only (read-only invariant — no write helpers, never reaches
// lib/coinbase/orders; in fact reaches NO Coinbase at all → no scoped
// try/catch needed, unlike CB-6.1/6.2). Returns the pair's LATEST signal
// (most recent bot_ticks⋈signals row — same latest-signal pattern as
// CB-6.1's loadCockpitPosition), or null when the pair has no signal yet.
//
// NOT session-scoped (deliberate — story Decision 2026-06-16): the last
// evaluation is "what the bot last saw / would do next" and stays meaningful
// when the bot is paused/stopped, so it's pair-scoped, not run-scoped.

import type { Decision } from "@/lib/dashboard/decision-trace";
import { db } from "@/lib/db/client";

export interface CockpitSignal {
  pair: string;
  /** null = RSI not computable (insufficient bars). */
  rsi: number | null;
  /** null = MA not computable (insufficient bars). */
  ma: number | null;
  /** the MA period the bot used for this signal (matches `ma`). */
  maPeriod: number | null;
  /** the close the signal was evaluated against. */
  lastClose: number | null;
  /** the bot's decision for the pair this tick (= its next action). */
  decision: Decision;
  /** operator-facing reason string — rendered verbatim. */
  reason: string;
}

export async function loadCockpitSignals(pair: string): Promise<CockpitSignal | null> {
  const sql = db();
  const rows = await sql<
    {
      rsi: number | null;
      ma: number | null;
      ma_period: number | null;
      last_close: number | null;
      decision: Decision;
      reason: string;
    }[]
  >`
    SELECT s.rsi::float8        AS rsi,
           s.ma::float8         AS ma,
           s.ma_period::int     AS ma_period,
           s.last_close::float8 AS last_close,
           s.decision           AS decision,
           s.reason             AS reason
      FROM signals s
      JOIN bot_ticks t ON t.id = s.tick_id
     WHERE s.asset_identifier = ${pair}
     ORDER BY t.tick_started_at DESC
     LIMIT 1
  `;
  const row = rows[0];
  if (row === undefined) return null;
  return {
    pair,
    rsi: row.rsi,
    ma: row.ma,
    maPeriod: row.ma_period,
    lastClose: row.last_close,
    decision: row.decision,
    reason: row.reason,
  };
}

// `lib/dashboard/live-state.ts` — server-only read model for the CB-5
// dashboard live-state view.
//
// CB-5.0 (FIRST CB-5 STORY). Lifts the psql joins used throughout CB-4
// verification into a reusable read function. SELECT-only — the dashboard
// is read-only (story AC 6); this module imports NO write helpers and
// NEVER reaches `lib/coinbase/orders` (AC 7).
//
// TWO HONEST DATA SOURCES (story PM DRI Decision + brief PM Decision #6):
//   * Holdings = the operator's REAL Coinbase portfolio (aggregatePosition
//     over getAccountTradeHistory) — mode-independent; `account_snapshots`
//     is unpopulated so Coinbase is the honest position source.
//   * Session activity = the active session's non-failed bot BUY orders,
//     INCLUDING `dry_run` rows (the dashboard must show paper activity
//     during the dry-run window). This is DELIBERATELY different from
//     `lib/ticks/db:aggregateSessionTotals`, which EXCLUDES `dry_run` for
//     real-money cap protection (CB-4.3). Do NOT reuse that fn here.

import { getAccountTradeHistory } from "@/lib/coinbase/accounts";
import { db } from "@/lib/db/client";
import { env } from "@/lib/env";
import { getActiveStrategy } from "@/lib/strategies/db";
import { aggregatePosition } from "@/lib/ticks/cost-basis";

export interface SessionState {
  status: "active" | "paused" | "reset";
  startedAt: Date;
}

export interface Holding {
  assetIdentifier: string;
  /** null = no open position in this asset. */
  position: { quantity: number; avgCostUsd: number } | null;
}

export interface SessionActivity {
  buyCount: number;
  totalInvestedUsd: number;
}

export interface LiveState {
  session: SessionState | null;
  /** null = the Coinbase holdings read failed (panel degrades, AC 4). */
  holdings: Holding[] | null;
  activity: SessionActivity;
  liveMode: boolean;
}

/**
 * Read the CURRENT bot session (status + started_at). Dashboard-scoped —
 * intentionally separate from `lib/ticks/db:loadSingletonSession` (which
 * the cron route depends on with a narrower shape); keeping this query
 * here avoids widening that contract.
 *
 * CB-5.3 (MULTI-ROW): `bot_sessions` is multi-row now (reset ends one + starts
 * a new one). The CURRENT session is the not-yet-ended run (`ended_at IS NULL`)
 * so the dashboard reflects the post-reset active row — and "this session"
 * activity (counted by the new session_id below) naturally reads 0 after a
 * reset. Mirrors loadSingletonSession's current-session selection.
 */
async function loadSessionState(): Promise<{
  id: string;
  state: SessionState;
} | null> {
  const sql = db();
  const rows = await sql<{ id: string; status: string; started_at: Date }[]>`
    SELECT id, status, started_at
      FROM bot_sessions
     WHERE ended_at IS NULL
     ORDER BY started_at DESC
     LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    state: { status: row.status as SessionState["status"], startedAt: row.started_at },
  };
}

/**
 * Count + sum the active session's bot BUY orders, INCLUDING dry_run.
 * (Contrast aggregateSessionTotals: that excludes dry_run for caps.)
 */
async function loadSessionActivity(sessionId: string): Promise<SessionActivity> {
  const sql = db();
  const rows = await sql<{ buy_count: number; total_invested: number }[]>`
    SELECT COUNT(*)::int AS buy_count,
           COALESCE(SUM(amount), 0)::float8 AS total_invested
      FROM orders
     WHERE session_id = ${sessionId}
       AND source = 'bot'
       AND side = 'buy'
       AND status <> 'failed'
  `;
  return {
    buyCount: rows[0]?.buy_count ?? 0,
    totalInvestedUsd: rows[0]?.total_invested ?? 0,
  };
}

/**
 * Holdings from the operator's REAL Coinbase fills, per selected asset.
 * Returns null (the whole panel degrades) if the Coinbase read fails —
 * a Coinbase outage must not blank the dashboard (AC 4).
 */
async function loadHoldings(assetIdentifiers: string[]): Promise<Holding[] | null> {
  try {
    return await Promise.all(
      assetIdentifiers.map(async (assetIdentifier) => {
        const { fills } = await getAccountTradeHistory({
          productIds: [assetIdentifier],
          limit: 250,
        });
        return { assetIdentifier, position: aggregatePosition(fills) };
      }),
    );
  } catch {
    // Best-effort (CB-1.6 device_label precedent): degrade the holdings
    // panel, leave the rest of the page intact.
    return null;
  }
}

/**
 * Compose the full live-state for the dashboard. SSR per page load
 * (brief PM Decision #2 — no client polling).
 */
export async function loadLiveState(): Promise<LiveState> {
  const liveMode = env().LIVE_MODE;
  const session = await loadSessionState();

  if (!session) {
    return { session: null, holdings: [], activity: { buyCount: 0, totalInvestedUsd: 0 }, liveMode };
  }

  const strategy = await getActiveStrategy();
  const assetIds = strategy?.selected_assets.map((a) => a.identifier) ?? [];

  const [holdings, activity] = await Promise.all([
    assetIds.length > 0 ? loadHoldings(assetIds) : Promise.resolve([]),
    loadSessionActivity(session.id),
  ]);

  return { session: session.state, holdings, activity, liveMode };
}

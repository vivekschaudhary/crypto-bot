// `lib/ticks/run-tick.ts` — the shared bot-evaluation orchestration (CB-6.5).
//
// Extracted from app/api/cron/tick/route.ts so BOTH the */15 cron (GET) and
// the operator-triggered Run Now (POST /api/run-now) run the IDENTICAL pipeline:
//   session early-outs → active strategy via the session pointer → per-asset
//   fan-out (candles + cost basis) → rsi/ma → evaluate → LIVE_MODE-gated order
//   rows → transactional bot_ticks + signals + orders → structured trace.
//
// The cron behaviour is UNCHANGED — the GET is now a thin auth + result→Response
// mapper over runBotTick({ source: "cron" }). The ONLY source-dependent branch is
// `tick_started_at`:
//   * source="cron"   → floorToQuarterHour(now)  (the 15-min grid; UNIQUE dedupe)
//   * source="manual" → precise now()            (CB-6.5 — a manual run must NOT
//     no-op as a "duplicate" of a recent cron tick on the grid; it always runs
//     a fresh evaluation. Off-grid by design.)
//
// LIVE_MODE is honoured exactly as the cron does (NO bypass): dark → dry_run
// rows; post-flip → real orders (bounded by the per-session caps). This module
// reaches lib/coinbase/orders via buildOrderRows (the bot's normal path) — it
// lives in lib/, NOT under app/api/bot/**, so the CB-5.3 no-orders invariant is
// unaffected; the cron route's invariant (which EXPECTS orders reachable since
// CB-4.3) stays green because the route imports this module.

import { ulid } from "ulidx";

import { getAccountTradeHistory } from "@/lib/coinbase/accounts";
import { getProduct, getProductCandles } from "@/lib/coinbase/market";
import { placeOrder } from "@/lib/coinbase/orders";
import { evaluate, type DecisionResult, type PerAssetSignal } from "@/lib/decisions";
import { env } from "@/lib/env";
import { ma, rsi } from "@/lib/signals";
import { getStrategyById } from "@/lib/strategies/db";
import type { Strategy } from "@/lib/strategy-core/types";
import { aggregatePosition } from "@/lib/ticks/cost-basis";
import {
  aggregateSessionTotals,
  insertTickWithDecisions,
  loadSingletonSession,
  type OrderRowInsert,
  type SignalRowInsert,
} from "@/lib/ticks/db";
import { buildLimitOrder, deterministicClientOrderId } from "@/lib/ticks/orders";
import {
  aggregateTickDecision,
  floorToQuarterHour,
  summarizeTickReason,
} from "@/lib/ticks/tick-helpers";
import {
  emitOrderPlacementTrace,
  emitTickTrace,
  sanitizeErrorDetail,
} from "@/lib/ticks/trace";
import { formatOrderFailureAlert, formatTickErrorAlert, sendAlert } from "@/lib/ops/alert";

// CB-4.0 Decisions #2/#3: ONE_HOUR granularity; 65-bar look-back.
const LOOKBACK_BARS = 65;
const BAR_MS = 60 * 60 * 1000; // ONE_HOUR
const RSI_PERIOD = 14; // CB-3 Researcher Q2 — not operator-configurable in MVP.
const STAGGER_MS = 150; // per-asset burst shaping.
const FILLS_PAGE_LIMIT = 250; // single-page fill window.

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type RunTickSource = "cron" | "manual";

export type TickDecisionTrace = {
  asset: string;
  decision: "buy" | "sell" | "hold";
  reason: string;
};

/** Discriminated outcome — the route maps this to its HTTP response. */
export type RunTickResult =
  | { kind: "ran"; tickId: string; tickStartedAt: Date; liveMode: boolean; decisions: TickDecisionTrace[] }
  | { kind: "skipped"; reason: string; liveMode: boolean }
  | { kind: "duplicate"; tickStartedAt: Date; liveMode: boolean }
  | { kind: "error"; message: string; liveMode: boolean };

async function buildPerAssetSignal(strategy: Strategy, identifier: string): Promise<PerAssetSignal> {
  const end = new Date();
  const start = new Date(end.getTime() - LOOKBACK_BARS * BAR_MS);

  const [candles, history] = await Promise.all([
    getProductCandles({ productId: identifier, granularity: "ONE_HOUR", start, end }),
    getAccountTradeHistory({ productIds: [identifier], limit: FILLS_PAGE_LIMIT }),
  ]);

  // Sort OLDEST-FIRST before the signal math (Coinbase returns newest-first).
  const closes = [...candles]
    .sort((a, b) => Number(a.start) - Number(b.start))
    .map((c) => Number.parseFloat(c.close));
  const lastClose = closes.length > 0 ? (closes[closes.length - 1] as number) : Number.NaN;

  return {
    rsi: rsi(RSI_PERIOD, closes),
    ma: ma(strategy.entry_rules.maPeriod, closes),
    lastClose,
    currentPosition: aggregatePosition(history.fills),
  };
}

/**
 * Turn buy/sell decisions into unified-ledger rows, placing real Coinbase limit
 * orders first when LIVE_MODE is on. Per-asset isolation: a placement failure
 * records a status='failed' row and does NOT abort the tick. hold → no row.
 */
async function buildOrderRows(args: {
  decisions: DecisionResult[];
  perAssetSignals: Map<string, PerAssetSignal>;
  strategy: Strategy;
  sessionId: string;
  tickStartedAt: Date;
  liveMode: boolean;
}): Promise<OrderRowInsert[]> {
  const rows: OrderRowInsert[] = [];

  for (const d of args.decisions) {
    if (d.decision === "hold" || !d.sizing) continue;

    const signal = args.perAssetSignals.get(d.asset.identifier);
    const lastClose = signal?.lastClose ?? Number.NaN;
    const side = d.decision === "buy" ? "BUY" : "SELL";

    const built = buildLimitOrder({
      side,
      lastClose,
      dollars: d.sizing.kind === "buy_dollars" ? d.sizing.dollars : undefined,
      fraction: d.sizing.kind === "sell_fraction" ? d.sizing.fraction : undefined,
      heldQuantity: signal?.currentPosition?.quantity ?? 0,
    });

    const base: Omit<OrderRowInsert, "status" | "coinbaseOrderId" | "errorDetail"> = {
      id: ulid(),
      assetIdentifier: d.asset.identifier,
      side: d.decision === "buy" ? "buy" : "sell",
      amount: built.amountUsd,
      baseQuantity: built.baseQuantity,
    };

    if (!args.liveMode) {
      rows.push({ ...base, status: "dry_run", coinbaseOrderId: null, errorDetail: null });
      continue;
    }

    const clientOrderId = deterministicClientOrderId(
      args.sessionId,
      args.tickStartedAt,
      d.asset.identifier,
    );
    try {
      const product = await getProduct(d.asset.identifier);
      const live = buildLimitOrder({
        side,
        lastClose,
        dollars: d.sizing.kind === "buy_dollars" ? d.sizing.dollars : undefined,
        fraction: d.sizing.kind === "sell_fraction" ? d.sizing.fraction : undefined,
        heldQuantity: signal?.currentPosition?.quantity ?? 0,
        quoteIncrement: product.quote_increment,
        baseIncrement: product.base_increment,
      });
      const resp = await placeOrder({
        productId: d.asset.identifier,
        side,
        orderConfiguration: live.config,
        clientOrderId,
      });
      if (resp.success && resp.success_response) {
        emitOrderPlacementTrace({
          sessionId: args.sessionId,
          tickStartedAt: args.tickStartedAt.toISOString(),
          assetIdentifier: d.asset.identifier,
          side: base.side,
          clientOrderId,
          status: "submitted",
          coinbaseOrderId: resp.success_response.order_id,
        });
        rows.push({
          ...base,
          amount: live.amountUsd,
          baseQuantity: live.baseQuantity,
          status: "submitted",
          coinbaseOrderId: resp.success_response.order_id,
          errorDetail: null,
        });
      } else {
        const reason = sanitizeErrorDetail(
          resp.error_response?.message ??
            resp.error_response?.error ??
            "order rejected (no error_response)",
        );
        emitOrderPlacementTrace({
          sessionId: args.sessionId,
          tickStartedAt: args.tickStartedAt.toISOString(),
          assetIdentifier: d.asset.identifier,
          side: base.side,
          clientOrderId,
          status: "failed",
          errorDetail: reason,
        });
        rows.push({ ...base, amount: live.amountUsd, baseQuantity: live.baseQuantity, status: "failed", coinbaseOrderId: null, errorDetail: reason });
      }
    } catch (err) {
      const reason = sanitizeErrorDetail(err instanceof Error ? err.message : String(err));
      emitOrderPlacementTrace({
        sessionId: args.sessionId,
        tickStartedAt: args.tickStartedAt.toISOString(),
        assetIdentifier: d.asset.identifier,
        side: base.side,
        clientOrderId,
        status: "failed",
        errorDetail: reason,
      });
      rows.push({ ...base, status: "failed", coinbaseOrderId: null, errorDetail: reason });
    }
  }

  return rows;
}

/**
 * Run ONE bot evaluation. Shared by the 15-min cron (source="cron") and the
 * operator Run Now (source="manual"). Returns a discriminated result; never
 * throws (the catch writes the audit error row + returns {kind:"error"}).
 */
export async function runBotTick({ source }: { source: RunTickSource }): Promise<RunTickResult> {
  const startedMs = Date.now();
  // The ONLY source-dependent branch: cron floors to the 15-min grid (UNIQUE
  // dedupe); manual uses a precise timestamp so it never collides with a recent
  // cron tick (CB-6.5 AC 4) — it always runs a fresh evaluation.
  const tickStartedAt = source === "cron" ? floorToQuarterHour(new Date(startedMs)) : new Date(startedMs);
  const liveMode = env().LIVE_MODE;

  const skip = (reason: string): RunTickResult => {
    emitTickTrace({ liveMode, durationMs: Date.now() - startedMs, skipped: reason });
    return { kind: "skipped", reason, liveMode };
  };

  try {
    const session = await loadSingletonSession();
    if (!session) return skip("no_session");
    if (session.status === "paused") return skip("session_paused");
    if (session.status === "reset") return skip("session_reset");
    if (!session.activeStrategyId) return skip("no_active_strategy");

    const strategy = await getStrategyById(session.activeStrategyId);
    if (!strategy) {
      throw new Error(
        `active_strategy_id ${session.activeStrategyId} resolves to no strategies row — FK integrity anomaly`,
      );
    }

    const sessionTotals = await aggregateSessionTotals(session.id);

    const perAssetSignals = new Map<string, PerAssetSignal>();
    await Promise.all(
      strategy.selected_assets.map(async (asset, i) => {
        if (i > 0) await sleep(i * STAGGER_MS);
        perAssetSignals.set(asset.identifier, await buildPerAssetSignal(strategy, asset.identifier));
      }),
    );

    const decisions = evaluate(strategy, perAssetSignals, sessionTotals);

    const orderRows = await buildOrderRows({
      decisions,
      perAssetSignals,
      strategy,
      sessionId: session.id,
      tickStartedAt,
      liveMode,
    });

    // CB-6.8 — alert the operator on any FAILED live order (dry-run rows are
    // status "dry_run", never "failed", so this never fires while dark). Placement
    // already happened inside buildOrderRows; sendAlert is env-gated + never throws.
    for (const r of orderRows) {
      if (r.status === "failed") {
        await sendAlert(
          formatOrderFailureAlert({
            source: source === "manual" ? "run-now" : "bot",
            asset: r.assetIdentifier,
            side: r.side,
            amountUsd: r.amount,
            reason: r.errorDetail,
          }),
        );
      }
    }

    const tickId = ulid();
    const signalRows: SignalRowInsert[] = decisions.map((d) => {
      const s = perAssetSignals.get(d.asset.identifier);
      return {
        id: ulid(),
        assetIdentifier: d.asset.identifier,
        decision: d.decision,
        reason: d.reason,
        rsi: s?.rsi ?? null,
        ma: s?.ma ?? null,
        maPeriod: s ? strategy.entry_rules.maPeriod : null,
        lastClose: s && Number.isFinite(s.lastClose) ? s.lastClose : null,
      };
    });

    try {
      await insertTickWithDecisions({
        id: tickId,
        sessionId: session.id,
        tickStartedAt,
        decision: aggregateTickDecision(decisions),
        reason: summarizeTickReason(decisions),
        signals: signalRows,
        orders: orderRows,
      });
    } catch (err) {
      // NARROW duplicate catch — 23505 only (no silent swallow of anything else).
      if (err instanceof Error && (err as Error & { code?: string }).code === "23505") {
        emitTickTrace({
          sessionId: session.id,
          tickStartedAt: tickStartedAt.toISOString(),
          liveMode,
          durationMs: Date.now() - startedMs,
          duplicate: true,
        });
        return { kind: "duplicate", tickStartedAt, liveMode };
      }
      throw err;
    }

    const decisionsTrace: TickDecisionTrace[] = decisions.map((d) => ({
      asset: d.asset.identifier,
      decision: d.decision,
      reason: d.reason,
    }));
    emitTickTrace({
      tickId,
      sessionId: session.id,
      tickStartedAt: tickStartedAt.toISOString(),
      liveMode,
      durationMs: Date.now() - startedMs,
      decisions: decisionsTrace,
    });
    return { kind: "ran", tickId, tickStartedAt, liveMode, decisions: decisionsTrace };
  } catch (err) {
    // Audit-preserving error path: best-effort error row, then {kind:"error"}
    // (the cron route maps this to 500 so the fitness function counts it).
    const message = sanitizeErrorDetail(err instanceof Error ? err.message : String(err));
    try {
      const session = await loadSingletonSession();
      if (session) {
        await insertTickWithDecisions({
          id: ulid(),
          sessionId: session.id,
          tickStartedAt,
          decision: "hold",
          reason: "tick_error",
          errorDetail: message,
          signals: [],
        });
      }
    } catch (rowErr) {
      emitTickTrace({
        liveMode,
        durationMs: Date.now() - startedMs,
        error: `error-row write failed: ${rowErr instanceof Error ? rowErr.message : String(rowErr)}`,
      });
    }
    emitTickTrace({ liveMode, durationMs: Date.now() - startedMs, error: message });
    // CB-6.8 — alert on a top-level tick failure (per-asset placement failures
    // are already alerted above). Env-gated + never throws.
    await sendAlert(formatTickErrorAlert(message));
    return { kind: "error", message, liveMode };
  }
}

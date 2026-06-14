// Bot tick endpoint — fires every 15 minutes via Vercel Cron (Pro tier).
//
// CB-4.2 (THIRD CB-4 STORY) — replaces the CB-1 heartbeat stub with the
// real tick pipeline per docs/bets/CB-4/stories/CB-4.2/story.md AC 3:
//
//   auth gates → session/strategy early-outs → per-asset fan-out
//   (candles + cost basis) → rsi/ma (CB-4.0) → evaluate (CB-4.1) →
//   transactional bot_ticks + per-asset signals write → structured log
//
// DRY-RUN ONLY. No order placement exists in this module graph — the
// LIVE_MODE gate at order placement is CB-4.3. The invariant test
// (tests/app/api/cron/tick/invariants.test.ts) walks this file's
// transitive imports and fails if lib/coinbase/orders ever appears.
// env().LIVE_MODE is read for LOG EMISSION ONLY (AC 10 — the brief's
// no-order-in-dry-run guardrail wants live_mode in every tick log line
// for audit; no behavioral branch consults it).
//
// ENGINEER DRI DECISIONS (committed at this commit per story Tech notes):
//
//   1. FLOORING — `floorToQuarterHour` (UTC ms arithmetic) in
//      lib/ticks/tick-helpers.ts; see its JSDoc.
//
//   2. FAN-OUT SHAPE — per-asset work runs in parallel via Promise.all,
//      staggered 150ms × asset-index (brief burst-shaping mitigation:
//      5 assets → spread over ~600ms instead of a synchronized burst).
//      WITHIN one asset, candles + trade-history fetch in parallel
//      (different endpoints; the 150ms stagger already shapes the burst).
//
//   3. COST-BASIS WINDOW — most recent 250 fills per asset (single page;
//      Coinbase max page size). Pagination DEFERRED: >250 fills per asset
//      within one product is beyond the operator's manual-trading history
//      today (story PM Risk #3 logs the under-count hazard; CB-4.3's
//      post-order verify will revisit when bot fills start accumulating).
//
//   4. DUPLICATE DETECTION — postgres.js surfaces Postgres error codes on
//      `err.code`; `23505` = unique_violation. The catch is NARROW: only
//      23505 maps to the 200-duplicate path; everything else falls through
//      to the error path (AC 5's no-silent-swallow contract).
//
//   5. RESPONSE STATUS TAXONOMY — 200 ok/skipped/duplicate; 401
//      unauthorized; 500 tick-error. Vercel cron logs count non-2xx as
//      failed invocations; the fitness function (≥99% tick reliability)
//      consumes exactly that signal, so an evaluation/persistence failure
//      MUST be a 500 even though we wrote an error row for the audit trail.
//
//   6. CANDLE ORDERING — Coinbase returns candles NEWEST-FIRST; CB-4.0's
//      rsi()/ma() require OLDEST-FIRST. Sort ascending by `start`
//      defensively (cheap; immune to Coinbase changing order).

import { NextResponse, type NextRequest } from "next/server";
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
import {
  buildLimitOrder,
  deterministicClientOrderId,
} from "@/lib/ticks/orders";
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

export const dynamic = "force-dynamic";
// AC 9 — fail-fast ceiling; layer 2 of the cron-overlap defense. A hung
// Coinbase call cannot push this tick past the next */15 window.
export const maxDuration = 60;

// CB-4.0 Engineer Decisions #2 + #3: ONE_HOUR granularity; 65-bar
// look-back (MA(50) needs 50 + RSI(14) Wilder warmup ~30 → max 64 + margin).
const LOOKBACK_BARS = 65;
const BAR_MS = 60 * 60 * 1000; // ONE_HOUR
// RSI period fixed at 14 per CB-3 Researcher Q2 closure (not
// operator-configurable in MVP; the strategy form doesn't expose it).
const RSI_PERIOD = 14;
// Engineer DRI Decision #2: per-asset stagger for burst shaping.
const STAGGER_MS = 150;
// Engineer DRI Decision #3: single-page fill window.
const FILLS_PAGE_LIMIT = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function buildPerAssetSignal(
  strategy: Strategy,
  identifier: string,
): Promise<PerAssetSignal> {
  const end = new Date();
  const start = new Date(end.getTime() - LOOKBACK_BARS * BAR_MS);

  const [candles, history] = await Promise.all([
    getProductCandles({
      productId: identifier,
      granularity: "ONE_HOUR",
      start,
      end,
    }),
    getAccountTradeHistory({
      productIds: [identifier],
      limit: FILLS_PAGE_LIMIT,
    }),
  ]);

  // Engineer DRI Decision #6: sort OLDEST-FIRST before the signal math.
  const closes = [...candles]
    .sort((a, b) => Number(a.start) - Number(b.start))
    .map((c) => Number.parseFloat(c.close));
  const lastClose =
    closes.length > 0 ? (closes[closes.length - 1] as number) : Number.NaN;

  return {
    rsi: rsi(RSI_PERIOD, closes),
    ma: ma(strategy.entry_rules.maPeriod, closes),
    lastClose,
    currentPosition: aggregatePosition(history.fills),
  };
}

/**
 * CB-4.3 — turn buy/sell decisions into unified-ledger rows, placing real
 * Coinbase limit orders first when LIVE_MODE is on.
 *
 * Per-asset isolation (story AC 7 / PM Decision #2): a placement failure
 * for one asset records a `status='failed'` row and does NOT abort the
 * tick or skip siblings — contrast a signal/eval failure, which is
 * tick-fatal (CB-4.2 AC 8). `hold` decisions produce no row.
 *
 * Placement BEFORE persistence (AC 9): the orders rows record the actual
 * outcome; the deterministic clientOrderId (idempotency) + Coinbase-sourced
 * cost basis cover the place-succeeded-but-write-failed window.
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
    if (d.decision === "hold" || !d.sizing) continue; // holds aren't transactions

    const signal = args.perAssetSignals.get(d.asset.identifier);
    const lastClose = signal?.lastClose ?? Number.NaN;
    const side = d.decision === "buy" ? "BUY" : "SELL";

    // Compute the limit order (price + size + USD amount). Increments are
    // resolved LIVE-MODE-only (Decision #4) — dry-run needs no rounding.
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
    };

    if (!args.liveMode) {
      rows.push({ ...base, status: "dry_run", coinbaseOrderId: null, errorDetail: null });
      continue;
    }

    // LIVE_MODE — place the real order, per-asset isolated.
    const clientOrderId = deterministicClientOrderId(
      args.sessionId,
      args.tickStartedAt,
      d.asset.identifier,
    );
    try {
      // Fetch product increments for correct price/size rounding (live-only).
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
        // AC 9 leg (c): log the placement outcome BEFORE the DB transaction,
        // so a real coinbase_order_id survives a later DB-write failure
        // (the orders row would roll back). PR #65 round-1 review finding.
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
        rows.push({
          ...base,
          amount: live.amountUsd,
          status: "failed",
          coinbaseOrderId: null,
          errorDetail: reason,
        });
      }
    } catch (err) {
      // Per-asset isolation: record the failure, keep the tick going.
      const reason = sanitizeErrorDetail(
        err instanceof Error ? err.message : String(err),
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
      rows.push({
        ...base,
        status: "failed",
        coinbaseOrderId: null,
        errorDetail: reason,
      });
    }
  }

  return rows;
}

export async function GET(request: NextRequest) {
  const startedMs = Date.now();
  // PR #63 round-1 BLOCKER 2 closure: the tick's window is anchored to the
  // INVOCATION start, computed ONCE — the error path reuses this value. The
  // earlier draft recomputed floorToQuarterHour(new Date()) inside the
  // catch, so a failure that crossed a quarter-hour boundary (started
  // 14:14:59, threw 14:15:01) would record the error row in the WRONG
  // window — misstating the audit AND squatting on the NEXT legitimate
  // tick's UNIQUE (session_id, tick_started_at) slot, blocking it.
  const tickStartedAt = floorToQuarterHour(new Date(startedMs));
  const liveMode = env().LIVE_MODE; // AC 10: LOGGING ONLY — no behavioral branch.

  // Gate 1: CRON_SECRET header (Vercel injects on cron invocations). Read
  // via env() per the cross-cutting standard — the stub's direct
  // process.env read bypassed validation.
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${env().CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Gate 2 (defense-in-depth, preserved from the stub): user-agent signal —
  // not a hard gate because local dev / manual smoke tests reach this
  // endpoint too.
  const userAgent = request.headers.get("user-agent") ?? "";
  const fromVercelCron = userAgent.startsWith("vercel-cron/");

  const skip = (reason: string) => {
    emitTickTrace({
      liveMode,
      durationMs: Date.now() - startedMs,
      skipped: reason,
    });
    return NextResponse.json({ ok: true, skipped: reason, fromVercelCron });
  };

  try {
    // Step 2 — session early-outs (AC 3; skipped ticks write NO row per
    // story PM Decision #3).
    const session = await loadSingletonSession();
    if (!session) return skip("no_session");
    if (session.status === "paused") return skip("session_paused");
    if (session.status === "reset") return skip("session_reset");

    // Step 3 — active strategy via the SESSION POINTER (PR #63 round-1
    // BLOCKER 1 closure): the bot's contract is
    // `bot_sessions.active_strategy_id → strategies` per the brief
    // Hypothesis + CB-3 PM Decision #2. The earlier draft used
    // getActiveStrategy() (the UI's latest-non-superseded read) — the two
    // SHOULD agree, but if they ever diverge the bot must trade what the
    // session says, not what the form would display.
    if (!session.activeStrategyId) return skip("no_active_strategy");
    const strategy = await getStrategyById(session.activeStrategyId);
    if (!strategy) {
      // The FK guarantees the row exists; a null here is a real integrity
      // anomaly → error path (500 + error row), NOT a quiet skip.
      throw new Error(
        `active_strategy_id ${session.activeStrategyId} resolves to no strategies row — FK integrity anomaly`,
      );
    }

    const sessionTotals = await aggregateSessionTotals(session.id);

    // Step 4/5 — staggered per-asset fan-out → PerAssetSignal map.
    const perAssetSignals = new Map<string, PerAssetSignal>();
    await Promise.all(
      strategy.selected_assets.map(async (asset, i) => {
        if (i > 0) await sleep(i * STAGGER_MS);
        const signal = await buildPerAssetSignal(strategy, asset.identifier);
        perAssetSignals.set(asset.identifier, signal);
      }),
    );

    // Step 6 — the decision engine (CB-4.1).
    const decisions = evaluate(strategy, perAssetSignals, sessionTotals);

    // Step 6b (CB-4.3) — LIVE_MODE gate + unified-ledger rows. buy/sell
    // decisions each yield an orders row regardless of mode; in LIVE_MODE
    // a real limit order is placed first (per-asset isolated). hold → no row.
    const orderRows = await buildOrderRows({
      decisions,
      perAssetSignals,
      strategy,
      sessionId: session.id,
      tickStartedAt,
      liveMode,
    });

    // Step 7 — transactional persistence.
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
      // Engineer DRI Decision #4: NARROW duplicate catch — 23505 only.
      if (
        err instanceof Error &&
        (err as Error & { code?: string }).code === "23505"
      ) {
        emitTickTrace({
          sessionId: session.id,
          tickStartedAt: tickStartedAt.toISOString(),
          liveMode,
          durationMs: Date.now() - startedMs,
          duplicate: true,
        });
        return NextResponse.json({ ok: true, duplicate: true, fromVercelCron });
      }
      throw err; // everything else → the error path (no silent swallow)
    }

    // Step 8 — structured log + response.
    const decisionsTrace = decisions.map((d) => ({
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
    return NextResponse.json({
      ok: true,
      tickId,
      tickStartedAt: tickStartedAt.toISOString(),
      liveMode,
      fromVercelCron,
      decisions: decisionsTrace,
    });
  } catch (err) {
    // AC 8 — the audit-preserving error path: best-effort error row, then
    // 500 so the Vercel cron log records a failed invocation (the fitness
    // function consumes that signal — Engineer DRI Decision #5).
    // Error detail is REDACTED + TRUNCATED before either sink (PR #63
    // round-1 security closure) — Coinbase client errors could carry
    // token-shaped material, and rows/logs are retained indefinitely.
    const message = sanitizeErrorDetail(
      err instanceof Error ? err.message : String(err),
    );
    try {
      const session = await loadSingletonSession();
      if (session) {
        await insertTickWithDecisions({
          id: ulid(),
          sessionId: session.id,
          // BLOCKER 2 closure: the INVOCATION-anchored window, NOT a
          // recompute — see the const at the top of GET.
          tickStartedAt,
          decision: "hold",
          reason: "tick_error",
          errorDetail: message,
          signals: [],
        });
      }
    } catch (rowErr) {
      // The error-row write itself failed (DB down, or a duplicate window —
      // a prior successful tick already owns this slot). The 500 + ERROR
      // log below still record the failure; nothing more to do here.
      emitTickTrace({
        liveMode,
        durationMs: Date.now() - startedMs,
        error: `error-row write failed: ${
          rowErr instanceof Error ? rowErr.message : String(rowErr)
        }`,
      });
    }
    emitTickTrace({
      liveMode,
      durationMs: Date.now() - startedMs,
      error: message,
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

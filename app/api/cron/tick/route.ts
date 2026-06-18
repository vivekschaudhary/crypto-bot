// Bot tick endpoint — fires every 15 minutes via Vercel Cron (Pro tier).
//
// CB-6.5: the evaluation pipeline now lives in lib/ticks/run-tick.ts
// (runBotTick), shared with the operator Run Now route (POST /api/run-now).
// This route is the CRON entry point: CRON_SECRET auth → runBotTick(source:
// "cron") → map the result to the HTTP contract. The behaviour is UNCHANGED
// from CB-4.3 — same quarter-hour flooring, same 23505 duplicate handling,
// same response shapes + status taxonomy (200 ok/skipped/duplicate; 401
// unauthorized; 500 tick-error — the fitness function counts non-2xx as failed
// invocations), same dry_run/live gating. See run-tick.ts for the Engineer DRI
// decisions (flooring, fan-out, duplicate catch, error path).
//
// The route's transitive imports still reach lib/coinbase/orders (via
// runBotTick → buildOrderRows → placeOrder) — tests/app/api/cron/tick/
// invariants.test.ts asserts exactly that (since CB-4.3's LIVE_MODE gate).

import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env";
import { runBotTick } from "@/lib/ticks/run-tick";

export const dynamic = "force-dynamic";
// AC 9 — fail-fast ceiling; a hung Coinbase call cannot push this tick past the
// next */15 window.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // Gate 1: CRON_SECRET header (Vercel injects on cron invocations).
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${env().CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Gate 2 (defense-in-depth): user-agent signal — not a hard gate (local dev /
  // manual smoke tests reach this endpoint too).
  const userAgent = request.headers.get("user-agent") ?? "";
  const fromVercelCron = userAgent.startsWith("vercel-cron/");

  const result = await runBotTick({ source: "cron" });
  switch (result.kind) {
    case "skipped":
      return NextResponse.json({ ok: true, skipped: result.reason, fromVercelCron });
    case "duplicate":
      return NextResponse.json({ ok: true, duplicate: true, fromVercelCron });
    case "error":
      return NextResponse.json({ ok: false, error: result.message }, { status: 500 });
    case "ran":
      return NextResponse.json({
        ok: true,
        tickId: result.tickId,
        tickStartedAt: result.tickStartedAt.toISOString(),
        liveMode: result.liveMode,
        fromVercelCron,
        decisions: result.decisions,
      });
  }
}

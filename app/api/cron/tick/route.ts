// Bot tick endpoint — fires every 15 minutes via Vercel Cron (Pro tier).
// See architecture.md Foundational Identity & Access Posture § Authenticated
// surface enumeration: this route is gated by CRON_SECRET + Vercel's
// vercel-cron/1.0 user-agent as defense-in-depth.
//
// SCAFFOLD STUB: this returns a heartbeat so the deploy canary can verify
// cron precision. Real signal evaluation + decision + (dry-run) order
// placement arrives via /build story tickets.

import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Gate 1: CRON_SECRET header (Vercel injects on cron invocations).
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Gate 2 (defense-in-depth): verify the user-agent looks like Vercel cron.
  // Not strictly enforced — useful as a signal but not a hard gate because
  // local dev / manual smoke tests need to reach this endpoint.
  const userAgent = request.headers.get("user-agent") ?? "";
  const isVercelCron = userAgent.startsWith("vercel-cron/");

  // TODO (story ticket): evaluate signals, decide, log to bot_ticks.
  return NextResponse.json({
    ok: true,
    tickedAt: new Date().toISOString(),
    fromVercelCron: isVercelCron,
    liveMode: process.env.LIVE_MODE === "true",
  });
}

// POST /api/run-now — operator-triggered, on-demand bot evaluation (CB-6.5).
// Per docs/bets/CB-6/stories/CB-6.5/story.md.
//
// Runs ONE evaluation via the SHARED tick handler (lib/ticks/run-tick.ts,
// source="manual" → a precise, non-floored tick_started_at so it always runs a
// fresh tick rather than no-op'ing as a "duplicate" of a recent cron tick).
// Respects LIVE_MODE (NO bypass) — dry_run while dark, real orders post-flip.
//
// LOCATION (Architect decision): NOT under app/api/bot/** — runBotTick reaches
// lib/coinbase/orders (the bot's normal path), and the CB-5.3 /api/bot/**
// no-orders invariant must stay green. run-now legitimately places orders, so it
// lives outside that invariant's scope. (This is NOT the CB-6.6 inversion.)
//
// AUTH — mirrors the CB-5.3 override route EXACTLY (state-mutating POST):
//   1. Rate-limit by Origin value (own keyPrefix).
//   2. Origin/Referer == APP_ORIGIN (CSRF defense-in-depth).
//   3. __compass_session cookie + verifySession() RE-VERIFY at the handler —
//      proxy x-session-* headers are CONVENIENCE only, NEVER trusted as auth
//      claims (CVE-2025-29927 lineage).

import { SESSION_COOKIE_NAME } from "@/lib/auth/cookie";
import { OriginMismatchError, verifyOriginOrThrow } from "@/lib/auth/origin-check";
import { RateLimitedError, consumeOrThrow } from "@/lib/auth/rate-limit";
import { verifySession } from "@/lib/auth/sessions";
import { runBotTick } from "@/lib/ticks/run-tick";

export const dynamic = "force-dynamic";
// Same fail-fast ceiling as the cron tick — this runs the identical pipeline.
export const maxDuration = 60;

function jsonResponse(status: number, body: unknown, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...(extraHeaders as Record<string, string>) },
  });
}

function rateLimitKey(request: Request): string {
  return request.headers.get("origin") ?? "<unknown>";
}

function parseCookieHeader(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq) === name) return part.slice(eq + 1);
  }
  return null;
}

export async function POST(request: Request): Promise<Response> {
  // 1. Rate limit.
  try {
    consumeOrThrow(rateLimitKey(request), { capacity: 5, refillPerSecond: 5 / 60, keyPrefix: "run-now" });
  } catch (err) {
    if (err instanceof RateLimitedError) {
      return jsonResponse(
        429,
        { error: "rate-limited", retryAfterSeconds: err.retryAfterSeconds },
        { "retry-after": String(err.retryAfterSeconds) },
      );
    }
    throw err;
  }

  // 2. Origin check — CSRF defense-in-depth on a state-mutating POST.
  try {
    verifyOriginOrThrow(request);
  } catch (err) {
    if (err instanceof OriginMismatchError) {
      return jsonResponse(403, { error: "origin-mismatch" });
    }
    throw err;
  }

  // 3. Re-verify the session at the handler (NEVER trust proxy headers).
  const signedCookie = parseCookieHeader(request.headers.get("cookie"), SESSION_COOKIE_NAME);
  if (!signedCookie) {
    return jsonResponse(401, { error: "unauthenticated" });
  }
  if (!(await verifySession(signedCookie))) {
    return jsonResponse(401, { error: "unauthenticated" });
  }

  // 4. Run ONE evaluation (manual → precise timestamp; respects LIVE_MODE).
  const result = await runBotTick({ source: "manual" });
  switch (result.kind) {
    case "ran":
      return jsonResponse(200, { ok: true, ran: true, tickId: result.tickId, decisions: result.decisions });
    case "duplicate":
      return jsonResponse(200, { ok: true, duplicate: true });
    case "skipped":
      // Bot paused/stopped (or no session/strategy) → the evaluation skipped;
      // the client surfaces "Bot is paused — resume to run." (copy.md).
      return jsonResponse(200, { ok: true, skipped: result.reason });
    case "error":
      return jsonResponse(500, { ok: false, error: result.message });
  }
}

/** OPTIONS — origin check, then 204 + Allow (override route pattern). */
export function OPTIONS(request: Request): Response {
  try {
    verifyOriginOrThrow(request);
  } catch (err) {
    if (err instanceof OriginMismatchError) {
      return jsonResponse(403, { error: "origin-mismatch" });
    }
    throw err;
  }
  return new Response(null, { status: 204, headers: { allow: "POST, OPTIONS" } });
}

function methodNotAllowed(): Response {
  return jsonResponse(405, { error: "method-not-allowed" }, { allow: "POST, OPTIONS" });
}

export function GET(): Response {
  return methodNotAllowed();
}
export function PUT(): Response {
  return methodNotAllowed();
}
export function PATCH(): Response {
  return methodNotAllowed();
}
export function DELETE(): Response {
  return methodNotAllowed();
}
export function HEAD(): Response {
  return methodNotAllowed();
}

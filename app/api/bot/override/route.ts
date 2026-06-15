// POST /api/bot/override — safe bot override controls (CB-5.3).
// Per docs/bets/CB-5/stories/CB-5.3/story.md AC 1.
//
// CB-5's ONLY write surface. A single route with a `kind` body
// (Engineer DRI Decision #1 — extensible for CB-5.4's force_buy/sell_* on
// the same route; the safe-kind allow-list gates it now). SAFE controls
// only: pause / resume / reset are state-only writes (bot_sessions.status +
// an override_events audit row). NO order placement, NO real money — the
// `/api/bot/**` invariant test (tests/app/api/bot/invariants.test.ts) walks
// this route's transitive imports and fails if lib/coinbase/orders ever
// appears (AC 8). The real-money kinds (force_buy/sell_50/sell_all) are
// DEFERRED to CB-5.4 and rejected here with 400 (AC 1), even though the
// override_events.kind CHECK permits them at the schema level.
//
// AUTH — mirrors the CB-1.5 sign-out route EXACTLY (state-mutating POST):
//   1. Rate-limit by Origin value.
//   2. Origin/Referer == APP_ORIGIN (CSRF defense-in-depth).
//   3. Read the __compass_session cookie + verifySession() RE-VERIFY. The
//      proxy gate already authenticated this route, but a state mutation
//      MUST re-verify at the handler — the proxy's x-session-* headers are
//      CONVENIENCE only, NEVER trusted as auth claims (CVE-2025-29927
//      lineage; CB-1.4 Engineer DRI Decision #5). null → 401.
//
// Typed 405 for non-POST (CB-1.5 pattern). Body `kind` validated: deferred
// kinds → 400 (with a CB-5.4 reason); unknown kinds → 400.

import { SESSION_COOKIE_NAME } from "@/lib/auth/cookie";
import { OriginMismatchError, verifyOriginOrThrow } from "@/lib/auth/origin-check";
import { RateLimitedError, consumeOrThrow } from "@/lib/auth/rate-limit";
import { verifySession } from "@/lib/auth/sessions";
import { pauseSession, resetSession, resumeSession, type OverrideKind, type OverrideOutcome } from "@/lib/bot/overrides";

const SAFE_KINDS = new Set<OverrideKind>(["pause", "resume", "reset"]);
// Real-money kinds the schema's CHECK permits but CB-5.3 does NOT ship.
const DEFERRED_KINDS = new Set(["force_buy", "sell_50", "sell_all"]);

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
    consumeOrThrow(rateLimitKey(request), { capacity: 5, refillPerSecond: 5 / 60, keyPrefix: "bot-override" });
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

  // 3. Re-verify the session at the handler (NEVER trust proxy headers for a
  //    state mutation).
  const signedCookie = parseCookieHeader(request.headers.get("cookie"), SESSION_COOKIE_NAME);
  if (!signedCookie) {
    return jsonResponse(401, { error: "unauthenticated" });
  }
  const result = await verifySession(signedCookie);
  if (!result) {
    return jsonResponse(401, { error: "unauthenticated" });
  }

  // 4. Parse + validate the kind.
  const body = (await request.json().catch(() => null)) as { kind?: unknown } | null;
  const kind = body?.kind;
  if (typeof kind === "string" && DEFERRED_KINDS.has(kind)) {
    // Real-money override — schema-valid, but not shipped until CB-5.4
    // (post-LIVE_MODE-flip). Reject explicitly so the client gets a clear
    // signal rather than a generic invalid-kind.
    return jsonResponse(400, {
      error: "kind-deferred",
      reason: "force_buy / sell_* overrides are deferred to CB-5.4 (post-live-flip).",
    });
  }
  if (typeof kind !== "string" || !SAFE_KINDS.has(kind as OverrideKind)) {
    return jsonResponse(400, { error: "invalid-kind" });
  }

  // 5. Dispatch the safe override. The helper resolves + LOCKS the current
  //    session in-transaction (it is NOT handed a session id from this
  //    handler), so the mutation acts on a row proven-current at commit time
  //    — closing the stale/concurrent fork-or-reopen window (round-1 BLOCKER).
  let outcome: OverrideOutcome;
  try {
    outcome =
      kind === "pause"
        ? await pauseSession()
        : kind === "resume"
          ? await resumeSession()
          : await resetSession();
  } catch (err) {
    // The `bot_sessions_single_current` partial unique index rejects a forked
    // (second concurrent current) session with 23505 — surface as a conflict,
    // not a 500. postgres.js exposes the SQLSTATE on `err.code`.
    if (err instanceof Error && (err as Error & { code?: string }).code === "23505") {
      return jsonResponse(409, { error: "conflict" });
    }
    throw err;
  }

  if (!outcome.ok) {
    // No current session (no strategy saved yet, or it was ended out from
    // under this request). Well-formed but not permitted → 409, not 500.
    return jsonResponse(409, { error: "no-session" });
  }

  return jsonResponse(200, { ok: true, status: outcome.status });
}

/** OPTIONS — origin check, then 204 + Allow (CB-1.5 pattern). */
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

// Typed 405 for unimplemented methods (CB-1.5 AC 3 pattern).
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

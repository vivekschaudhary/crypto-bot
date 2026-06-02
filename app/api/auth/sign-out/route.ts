// POST /api/auth/sign-out — explicit session revocation.
// Per docs/bets/CB-1/stories/CB-1.5/story.md.
//
// Flow:
//   1. Rate-limit by Origin header value (same posture as register/finish, authenticate/finish).
//   2. Verify Origin/Referer match APP_ORIGIN — defense-in-depth against CSRF.
//   3. Read the __compass_session cookie. If absent → 401 (nothing to sign out).
//   4. Call verifySession(signedCookie) — defense-in-depth re-verify even though
//      proxy.ts already gated this route (per CB-1.4 Engineer DRI Decision #5
//      and CVE-2025-29927 lineage). Proxy's x-session-* headers are CONVENIENCE
//      only; they are NEVER trusted as auth claims by state-mutating handlers.
//   5. On null result → 401 (cookie invalid / signature bad / DB row missing /
//      expired — every failure mode collapses to the same response). Cookie is
//      NOT cleared in the 401 branch: there is no session to sign out, and
//      clearing a cookie that may already be a tampered or unrelated value
//      gives a free-cookie-clearing surface for no benefit.
//   6. On valid result → invalidateSession(sessionId) DELETEs the auth_sessions
//      row. Idempotent at DB layer (DELETE-of-missing is a no-op).
//   7. Return 200 { ok: true } + Set-Cookie clearing the session cookie. The
//      clear-cookie attribute set MUST match the issuance attribute set from
//      authenticate/finish — both routes share lib/auth/cookie helpers as the
//      single source of truth, so drift is structurally impossible (AC 12).
//
// Routing posture:
//   proxy.ts gates /api/auth/sign-out as a protected route — the path does NOT
//   match PUBLIC_EXACT or any PUBLIC_PREFIXES entry (the register/authenticate/
//   recovery prefixes all require trailing-/ sub-paths that /api/auth/sign-out
//   does not have). Sign-out MUST be reachable only with a valid session cookie;
//   adding it to the public lists would let unauthenticated callers reach the
//   handler, which cannot identify whose session to invalidate without a valid
//   verifySession result. See CB-1.5 story AC 5 + PM DRI Decision.
//
// Idempotency:
//   Calling sign-out twice with the same originally-valid cookie is expected:
//   the first call returns 200 + DELETEs the row; the second call returns 401
//   because verifySession no longer finds the row. There is NO special-case
//   "already signed out" branch — see CB-1.5 PM DRI Decision #3.
//
// Method discipline:
//   POST + OPTIONS implemented; GET / PUT / PATCH / DELETE / HEAD return typed
//   405 { error: "method-not-allowed" }. CB-1.5 introduces the typed-405 pattern
//   per AC 3 + AC 7; existing /api/auth/* routes rely on Next.js default 405.
//   See CB-1.5 Engineer DRI Decision for the alignment delta.

import { clearSessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth/cookie";
import { invalidateSession, verifySession } from "@/lib/auth/sessions";
import { OriginMismatchError, verifyOriginOrThrow } from "@/lib/auth/origin-check";
import { RateLimitedError, consumeOrThrow } from "@/lib/auth/rate-limit";

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
  const parts = header.split(/;\s*/);
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq);
    if (k === name) return part.slice(eq + 1);
  }
  return null;
}

export async function POST(request: Request): Promise<Response> {
  // 1. Rate limit
  try {
    consumeOrThrow(rateLimitKey(request), { capacity: 5, refillPerSecond: 5 / 60, keyPrefix: "sign-out" });
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

  // 2. Origin check — defense-in-depth against CSRF on a state-mutating POST
  try {
    verifyOriginOrThrow(request);
  } catch (err) {
    if (err instanceof OriginMismatchError) {
      return jsonResponse(403, { error: "origin-mismatch" });
    }
    throw err;
  }

  // 3. Read session cookie
  const cookieHeader = request.headers.get("cookie");
  const signedCookie = parseCookieHeader(cookieHeader, SESSION_COOKIE_NAME);
  if (!signedCookie) {
    return jsonResponse(401, { error: "unauthenticated" });
  }

  // 4 + 5. Defense-in-depth re-verify (proxy already gated, but handler MUST
  // re-verify state-mutating actions per CB-1.4 DRI Decision #5).
  const result = await verifySession(signedCookie);
  if (!result) {
    return jsonResponse(401, { error: "unauthenticated" });
  }

  // 6. Invalidate the session row.
  await invalidateSession(result.sessionId);

  // 7. Return success + clear cookie. Set-Cookie attributes are sourced from
  // the same helper as the issuance side (authenticate/finish/route.ts), so
  // the attribute set is guaranteed identical except for value + Max-Age.
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: [
      ["content-type", "application/json"],
      ["set-cookie", clearSessionCookie()],
    ],
  });
}

/**
 * OPTIONS handler — same shape as /api/auth/register/* and /api/auth/authenticate/*.
 * Origin check first; on success return 204 with Allow header listing the
 * implemented methods.
 */
export function OPTIONS(request: Request): Response {
  try {
    verifyOriginOrThrow(request);
  } catch (err) {
    if (err instanceof OriginMismatchError) {
      return jsonResponse(403, { error: "origin-mismatch" });
    }
    throw err;
  }
  return new Response(null, {
    status: 204,
    headers: { allow: "POST, OPTIONS" },
  });
}

// Method-not-allowed handlers — typed 405 per CB-1.5 AC 3 + AC 7. The Allow
// header lists the implemented methods so clients can recover programmatically.
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

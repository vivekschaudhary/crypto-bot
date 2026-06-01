// POST /api/auth/authenticate/finish — passkey authentication ceremony (step 2).
// Per docs/bets/CB-1/stories/CB-1.3/story.md AC 2.
//
// Flow:
//   1. Rate-limit by Origin header value.
//   2. Verify Origin/Referer match APP_ORIGIN.
//   3. Parse + validate request body via Zod (`{ response }`).
//   4. Read + consume the __compass_auth_session cookie via the canonical
//      consumeChallenge('authentication') from lib/auth/challenges.
//   5. Optional: read the __compass_session cookie (pre-existing session).
//      If valid, capture currentSessionId for rotation.
//   6. Look up credential by id (response.id decoded from base64url to bytea).
//   7. Verify the WebAuthn response via lib/auth/webauthn.
//   8. Replay-attack guard: newCounter must exceed storedCounter, EXCEPT
//      the Apple-platform-authenticator case where both are 0.
//   9. Single DB transaction: UPDATE auth_credentials counter + last_used_at;
//      then rotateSession (if pre-existing) OR createSession (if not).
//   10. Clear auth-challenge cookie + set long-lived session cookie.
//   11. Return 200 { userId, sessionId }.
//
// Engineer DRI Decisions (in story DRI Log):
// - Use canonical lib/auth/challenges helpers (mintChallenge / consumeChallenge)
// - Counter-replay check allows 0/0 for Apple platform authenticators
// - rotateSession extended with optional txClient parameter (in lib/auth/sessions.ts)

import { z } from "zod";
import { db } from "@/lib/db/client";
import { env } from "@/lib/env";
import { verifyValue } from "@/lib/auth/cookie";
import { consumeChallenge } from "@/lib/auth/challenges";
import { createSession, rotateSession } from "@/lib/auth/sessions";
import { verifyAuthenticationResponse } from "@/lib/auth/webauthn";
import type { AuthenticationResponseJSON, WebAuthnCredential } from "@/lib/auth/webauthn";
import { OriginMismatchError, verifyOriginOrThrow } from "@/lib/auth/origin-check";
import { RateLimitedError, consumeOrThrow } from "@/lib/auth/rate-limit";

const AUTH_SESSION_COOKIE_NAME = "__compass_auth_session";
const AUTH_SESSION_PATH = "/api/auth/authenticate/finish";
const SESSION_COOKIE_NAME = "__compass_session";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

const FinishRequestSchema = z.object({
  response: z.record(z.string(), z.unknown()),
});

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

function clearAuthSessionCookie(): string {
  return `${AUTH_SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=${AUTH_SESSION_PATH}; Max-Age=0`;
}

function buildSessionCookie(signedCookie: string): string {
  return `${SESSION_COOKIE_NAME}=${signedCookie}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

type CredRow = {
  id: string;
  user_id: string;
  public_key: Buffer;
  counter: number | string; // postgres bigint comes back as string in some configs
  transports: string[];
};

export async function POST(request: Request): Promise<Response> {
  // 1. Rate limit
  try {
    consumeOrThrow(rateLimitKey(request), { capacity: 5, refillPerSecond: 5 / 60, keyPrefix: "authenticate-finish" });
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

  // 2. Origin check
  try {
    verifyOriginOrThrow(request);
  } catch (err) {
    if (err instanceof OriginMismatchError) {
      return jsonResponse(403, { error: "origin-mismatch" });
    }
    throw err;
  }

  // 3. Body parse
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "invalid-json" });
  }
  const parsedBody = FinishRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return jsonResponse(400, { error: "invalid-body" });
  }

  // 4. Consume the auth-challenge cookie via canonical helper
  const cookieHeader = request.headers.get("cookie");
  const authCookie = parseCookieHeader(cookieHeader, AUTH_SESSION_COOKIE_NAME);
  if (!authCookie) {
    return jsonResponse(400, { error: "challenge-missing-or-expired" });
  }
  const consumed = consumeChallenge(authCookie, "authentication");
  if (!consumed) {
    return jsonResponse(400, { error: "challenge-missing-or-expired" });
  }
  const { challenge } = consumed;

  // 5. Optionally extract pre-existing session id (for rotation, not auth)
  let currentSessionId: string | null = null;
  const sessionCookieRaw = parseCookieHeader(cookieHeader, SESSION_COOKIE_NAME);
  if (sessionCookieRaw) {
    const verified = verifyValue(sessionCookieRaw, env().SESSION_SIGNING_SECRET);
    if (verified) {
      // Don't validate against the DB here — we just need the id for rotation.
      // If the row doesn't exist, rotateSession's DELETE is a no-op + the new
      // INSERT still creates a fresh session. Either way the user ends up
      // with exactly one valid session post-flow.
      currentSessionId = verified.value;
    }
  }

  // 6. Look up credential
  const responseObj = parsedBody.data.response as unknown as AuthenticationResponseJSON;
  const credIdBase64 = responseObj.id;
  const credIdBytes = Buffer.from(credIdBase64, "base64url");
  const sql = db();
  const credRows = await sql<CredRow[]>`
    SELECT id, user_id, public_key, counter, transports
      FROM auth_credentials
     WHERE credential_id = ${credIdBytes}
  `;
  if (credRows.length === 0) {
    return jsonResponse(400, { error: "verification-failed" });
  }
  const credRow = credRows[0]!;

  // 7. Verify the WebAuthn response
  const storedCounter = Number(credRow.counter);
  const credential: WebAuthnCredential = {
    id: credIdBase64,
    publicKey: new Uint8Array(credRow.public_key),
    counter: storedCounter,
    transports: credRow.transports as WebAuthnCredential["transports"],
  };

  let verifyResult;
  try {
    verifyResult = await verifyAuthenticationResponse({
      response: responseObj,
      expectedChallenge: challenge,
      credential,
    });
  } catch {
    return jsonResponse(400, { error: "verification-failed" });
  }
  if (!verifyResult.verified || !verifyResult.authenticationInfo) {
    return jsonResponse(400, { error: "verification-failed" });
  }
  const { newCounter } = verifyResult.authenticationInfo;

  // 8. Counter-replay guard.
  // Apple platform authenticators (macOS / iOS / iPadOS) always return 0 —
  // they do not implement a per-credential counter. Per WebAuthn spec we
  // accept newCounter === 0 only when storedCounter === 0 (initial state +
  // every subsequent Apple-authenticator login stays at 0). Otherwise
  // newCounter must strictly exceed storedCounter.
  if (!(newCounter === 0 && storedCounter === 0) && newCounter <= storedCounter) {
    return jsonResponse(400, { error: "counter-replay-detected" });
  }

  // 9. Atomic transaction: UPDATE counter + rotate-or-create session
  let sessionResult: { sessionId: string; signedCookie: string };
  try {
    sessionResult = await sql.begin(async (tx) => {
      await tx`
        UPDATE auth_credentials
           SET counter = ${newCounter},
               last_used_at = now()
         WHERE id = ${credRow.id}
      `;
      if (currentSessionId) {
        return rotateSession(currentSessionId, credRow.user_id, tx);
      }
      return createSession(credRow.user_id, tx);
    });
  } catch (err) {
    throw err;
  }

  const { sessionId, signedCookie } = sessionResult;

  // 10 + 11. Clear auth-challenge cookie + set session cookie + return
  return new Response(JSON.stringify({ userId: credRow.user_id, sessionId }), {
    status: 200,
    headers: [
      ["content-type", "application/json"],
      ["set-cookie", clearAuthSessionCookie()],
      ["set-cookie", buildSessionCookie(signedCookie)],
    ],
  });
}

/**
 * OPTIONS handler — per CB-1.3 AC 4. Cross-origin preflight rejected.
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

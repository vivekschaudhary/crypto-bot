// POST /api/auth/authenticate/begin — passkey authentication ceremony (step 1).
// Per docs/bets/CB-1/stories/CB-1.3/story.md AC 1.
//
// Flow:
//   1. Rate-limit by Origin header value.
//   2. Verify Origin/Referer match APP_ORIGIN (CSRF defense-in-depth).
//   3. Parse + validate request body via Zod (empty object expected).
//   4. User-exists precondition: 400 no-registered-user if auth_users is empty.
//   5. Load registered credentials (single-operator MVP — at most 1 row;
//      loop written to handle N for post-MVP multi-device).
//   6. Mint challenge via lib/auth/challenges.mintChallenge('authentication')
//      and pass into generateAuthenticationOptions so the cookie's wrapped
//      challenge matches the browser-signed challenge.
//   7. Set the signed-token cookie (60-sec TTL, narrow Path scope).
//   8. Return { options } — no userId or credentialId on the wire.
//
// Engineer DRI Decision (in story DRI Log): cookie uses the canonical
// lib/auth/challenges helpers (mintChallenge here, consumeChallenge in
// /finish) — resolves AC 1's internal contradiction in favor of the lib's
// own discriminator-protected wrapping.

import { z } from "zod";
import { db } from "@/lib/db/client";
import { mintChallenge } from "@/lib/auth/challenges";
import { generateAuthenticationOptions } from "@/lib/auth/webauthn";
import type { CredentialDescriptor } from "@/lib/auth/webauthn";
import { OriginMismatchError, verifyOriginOrThrow } from "@/lib/auth/origin-check";
import { RateLimitedError, consumeOrThrow } from "@/lib/auth/rate-limit";

const AUTH_SESSION_COOKIE_NAME = "__compass_auth_session";
const AUTH_SESSION_PATH = "/api/auth/authenticate/finish";
const AUTH_SESSION_TTL_SECONDS = 60;

const BeginRequestSchema = z.object({}).strict();

function jsonResponse(status: number, body: unknown, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
}

function rateLimitKey(request: Request): string {
  return request.headers.get("origin") ?? "<unknown>";
}

function buildAuthSessionCookie(signedToken: string): string {
  return `${AUTH_SESSION_COOKIE_NAME}=${signedToken}; HttpOnly; Secure; SameSite=Strict; Path=${AUTH_SESSION_PATH}; Max-Age=${AUTH_SESSION_TTL_SECONDS}`;
}

type CredRow = { credential_id: Buffer; transports: string[] };

export async function POST(request: Request): Promise<Response> {
  // 1. Rate limit
  try {
    consumeOrThrow(rateLimitKey(request), { capacity: 5, refillPerSecond: 5 / 60, keyPrefix: "authenticate-begin" });
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
  const parsed = BeginRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(400, { error: "invalid-body" });
  }

  // 4. User-exists precondition
  const sql = db();
  const userCountRows = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM auth_users`;
  const userCount = userCountRows[0]?.count ?? 0;
  if (userCount === 0) {
    return jsonResponse(400, { error: "no-registered-user" });
  }

  // 5. Load credentials
  const credRows = await sql<CredRow[]>`
    SELECT credential_id, transports FROM auth_credentials
  `;
  const allowCredentials: CredentialDescriptor[] = credRows.map((row) => ({
    id: Buffer.from(row.credential_id).toString("base64url"),
    transports: row.transports as CredentialDescriptor["transports"],
  }));

  // 6. Mint challenge via canonical helper (cookie wraps via signValue
  //    internally; the raw challenge bytes go into generateAuthenticationOptions
  //    so the browser signs over the same value).
  const { challenge: challengeBase64, signedToken } = mintChallenge("authentication");

  // SimpleWebAuthn's generateAuthenticationOptions accepts challenge as
  // string (base64url) OR Uint8Array. Pass our minted challenge so the
  // cookie's wrapped value matches what the browser signs.
  const options = await generateAuthenticationOptions({
    allowCredentials,
    challenge: challengeBase64,
  });

  // 7. Set cookie + return
  return jsonResponse(200, { options }, { "set-cookie": buildAuthSessionCookie(signedToken) });
}

/**
 * OPTIONS handler — per CB-1.3 AC 4 (parallel to CB-1.2's pattern).
 * Cross-origin preflight rejected with 403 origin-mismatch.
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

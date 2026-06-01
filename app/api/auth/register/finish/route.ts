// POST /api/auth/register/finish — passkey registration ceremony (step 2).
// Per docs/bets/CB-1/stories/CB-1.2/story.md AC 2.
//
// Flow:
//   1. Rate-limit by Origin header value.
//   2. Verify Origin/Referer match APP_ORIGIN.
//   3. Parse + validate request body via Zod (`{ response }`).
//   4. Read + verify the `__compass_reg_session` cookie; extract
//      { challenge, pendingUserId, deviceLabel } — server-trusted source.
//   5. Verify the WebAuthn registration response via lib/auth/webauthn.
//   6. In a single DB transaction:
//      a. Guard first-time-only at DB level (count auth_users; abort if > 0).
//      b. INSERT auth_users row with id = pendingUserId, display_name = 'operator'.
//      c. INSERT auth_credentials row with credential_id/public_key/counter/transports/device_label.
//      d. Mint session via lib/auth/sessions.createSession.
//   7. Set the long-lived session cookie + clear the registration cookie.
//   8. Return 200 { userId, sessionId }.
//
// Cookie attributes are constructed at this layer per architecture.md's
// session strategy: HttpOnly + Secure + SameSite=Strict + Path=/.

import { ulid } from "ulidx";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { env } from "@/lib/env";
import { signValue, verifyValue } from "@/lib/auth/cookie";
import { verifyRegistrationResponse } from "@/lib/auth/webauthn";
import type { RegistrationResponseJSON } from "@/lib/auth/webauthn";
import { OriginMismatchError, verifyOriginOrThrow } from "@/lib/auth/origin-check";
import { RateLimitedError, consumeOrThrow } from "@/lib/auth/rate-limit";

const REG_SESSION_COOKIE_NAME = "__compass_reg_session";
const REG_SESSION_PATH = "/api/auth/register/finish";
const SESSION_COOKIE_NAME = "__compass_session";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const SESSION_TTL_INTERVAL = "30 days";

const FinishRequestSchema = z.object({
  // Require an object — SimpleWebAuthn's RegistrationResponseJSON is wide and
  // we don't want to duplicate the lib's inner-shape validation here. But
  // requiring an object (not undefined) catches missing-field cases at the
  // route boundary.
  response: z.record(z.string(), z.unknown()),
});

const RegSessionPayloadSchema = z.object({
  challenge: z.string().min(1),
  pendingUserId: z.string().min(1),
  deviceLabel: z.string().min(1).max(120),
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

function clearRegSessionCookie(): string {
  return `${REG_SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=${REG_SESSION_PATH}; Max-Age=0`;
}

function buildSessionCookie(signedCookie: string): string {
  return `${SESSION_COOKIE_NAME}=${signedCookie}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

export async function POST(request: Request): Promise<Response> {
  // 1. Rate limit
  try {
    consumeOrThrow(rateLimitKey(request), { capacity: 5, refillPerSecond: 5 / 60, keyPrefix: "register-finish" });
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

  // 4. Read + verify the reg-session cookie
  const cookieHeader = request.headers.get("cookie");
  const regCookie = parseCookieHeader(cookieHeader, REG_SESSION_COOKIE_NAME);
  if (!regCookie) {
    return jsonResponse(400, { error: "challenge-missing-or-expired" });
  }
  const verified = verifyValue(regCookie, env().SESSION_SIGNING_SECRET);
  if (!verified) {
    return jsonResponse(400, { error: "challenge-missing-or-expired" });
  }
  let payloadJson: unknown;
  try {
    payloadJson = JSON.parse(verified.value);
  } catch {
    return jsonResponse(400, { error: "challenge-missing-or-expired" });
  }
  const payloadParsed = RegSessionPayloadSchema.safeParse(payloadJson);
  if (!payloadParsed.success) {
    return jsonResponse(400, { error: "challenge-missing-or-expired" });
  }
  const { challenge, pendingUserId, deviceLabel } = payloadParsed.data;

  // 5. Verify the WebAuthn response
  let verifyResult;
  try {
    verifyResult = await verifyRegistrationResponse({
      response: parsedBody.data.response as unknown as RegistrationResponseJSON,
      expectedChallenge: challenge,
    });
  } catch {
    return jsonResponse(400, { error: "verification-failed" });
  }
  if (!verifyResult.verified || !verifyResult.registrationInfo) {
    return jsonResponse(400, { error: "verification-failed" });
  }
  const info = verifyResult.registrationInfo;

  // SimpleWebAuthn 11 returns credential.id as base64url string, publicKey as Uint8Array.
  const credentialIdBase64 = info.credential.id;
  const credentialIdBytes = Buffer.from(credentialIdBase64, "base64url");
  const publicKeyBytes = Buffer.from(info.credential.publicKey);
  const counter = info.credential.counter;
  const transports = info.credential.transports ?? [];

  // 6. DB transaction — atomic: first-time gate + user + credential + session.
  // Per CB-1.2 AC 2 (and Codex BLOCKER on PR #5): everything must commit or
  // rollback together. The session signing happens AFTER commit because it's
  // pure crypto over the freshly-inserted session id; if signing somehow
  // throws, the row exists but is orphaned (recoverable by re-attempting
  // sign with the same id) — strictly better than the previous shape where
  // a session-insert failure left a half-registered user.
  const sql = db();
  const credentialUlid = ulid();
  const sessionId = ulid();

  try {
    await sql.begin(async (tx) => {
      const rows = await tx<{ count: number }[]>`SELECT count(*)::int AS count FROM auth_users`;
      const userCount = rows[0]?.count ?? 0;
      if (userCount > 0) {
        throw new RegistrationDisabledError();
      }
      await tx`
        INSERT INTO auth_users (id, display_name)
        VALUES (${pendingUserId}, ${"operator"})
      `;
      await tx`
        INSERT INTO auth_credentials
          (id, user_id, credential_id, public_key, counter, device_label, transports)
        VALUES
          (${credentialUlid}, ${pendingUserId}, ${credentialIdBytes}, ${publicKeyBytes}, ${counter}, ${deviceLabel}, ${transports as string[]})
      `;
      await tx`
        INSERT INTO auth_sessions (id, user_id, expires_at)
        VALUES (${sessionId}, ${pendingUserId}, now() + interval '${tx.unsafe(SESSION_TTL_INTERVAL)}')
      `;
    });
  } catch (err) {
    if (err instanceof RegistrationDisabledError) {
      return jsonResponse(409, { error: "registration-disabled" });
    }
    // The DB-layer singleton index on auth_users (migration 0002) surfaces a
    // race-collision as a unique-violation. Translate to the same 409 the API
    // gate uses, so callers see one consistent error code.
    if (isUniqueViolation(err)) {
      return jsonResponse(409, { error: "registration-disabled" });
    }
    throw err;
  }

  const signedCookie = signValue(sessionId, env().SESSION_SIGNING_SECRET, SESSION_TTL_SECONDS);

  // 7+8. Clear reg cookie, set session cookie, return
  return new Response(JSON.stringify({ userId: pendingUserId, sessionId }), {
    status: 200,
    headers: [
      ["content-type", "application/json"],
      ["set-cookie", clearRegSessionCookie()],
      ["set-cookie", buildSessionCookie(signedCookie)],
    ],
  });
}

class RegistrationDisabledError extends Error {
  constructor() {
    super("registration-disabled");
    this.name = "RegistrationDisabledError";
  }
}

// Postgres unique_violation = SQLSTATE 23505. postgres.js exposes this on the
// thrown error's `code` field. Used to translate the singleton-index race
// collision (migration 0002 on auth_users) to the same 409 the API gate emits.
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

/**
 * OPTIONS handler — per CB-1.2 AC 4. Cross-origin browsers send preflight
 * before a POST with JSON content-type; we reject any OPTIONS whose Origin
 * doesn't match APP_ORIGIN. Same-origin browsers don't send preflight, so
 * legitimate flows aren't affected.
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
  // Same-origin OPTIONS — uncommon but legal; respond with allowed methods.
  return new Response(null, {
    status: 204,
    headers: { allow: "POST, OPTIONS" },
  });
}

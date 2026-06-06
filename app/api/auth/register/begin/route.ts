// POST /api/auth/register/begin — passkey registration ceremony (step 1).
// Per docs/bets/CB-1/stories/CB-1.2/story.md AC 1.
//
// Flow:
//   1. Rate-limit by Origin header value (or "<unknown>" sentinel).
//   2. Verify Origin/Referer match APP_ORIGIN (CSRF defense-in-depth).
//   3. Parse + validate request body via Zod (`{ deviceLabel? }`).
//   4. First-time-only gate: 403 if any auth_users row exists.
//   5. Mint pendingUserId (ULID) + WebAuthn challenge.
//   6. Generate registration options via lib/auth/webauthn.
//   7. Bind { challenge, pendingUserId, deviceLabel } in a signed cookie
//      (HMAC over SESSION_SIGNING_SECRET, 60-sec TTL).
//   8. Return { options } — pendingUserId stays server-side only.
//
// Engineer DRI Decision (in story DRI Log): pendingUserId is NOT returned to
// the client. It lives in the signed cookie payload only — closes story
// Risk #3 by removing the integrity-binding surface entirely.

import { ulid } from "ulidx";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { env } from "@/lib/env";
import { signValue } from "@/lib/auth/cookie";
import { generateRegistrationOptions } from "@/lib/auth/webauthn";
import { OriginMismatchError, verifyOriginOrThrow } from "@/lib/auth/origin-check";
import { RateLimitedError, consumeOrThrow } from "@/lib/auth/rate-limit";

const REG_SESSION_TTL_SECONDS = 60;
const REG_SESSION_COOKIE_NAME = "__compass_reg_session";
const REG_SESSION_PATH = "/api/auth/register/finish";
const REG_USER_NAME = "operator";

const BeginRequestSchema = z.object({
  deviceLabel: z.string().min(1).max(120).optional(),
});

export type RegSessionPayload = {
  challenge: string;
  pendingUserId: string;
  deviceLabel: string;
};

function jsonResponse(status: number, body: unknown, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
}

function rateLimitKey(request: Request): string {
  return request.headers.get("origin") ?? "<unknown>";
}

function defaultDeviceLabel(): string {
  return `Initial device (registered ${new Date().toISOString().slice(0, 10)})`;
}

function buildRegSessionCookie(payload: RegSessionPayload): string {
  const signed = signValue(JSON.stringify(payload), env().SESSION_SIGNING_SECRET, REG_SESSION_TTL_SECONDS);
  return `${REG_SESSION_COOKIE_NAME}=${signed}; HttpOnly; Secure; SameSite=Strict; Path=${REG_SESSION_PATH}; Max-Age=${REG_SESSION_TTL_SECONDS}`;
}

export async function POST(request: Request): Promise<Response> {
  // 1. Rate limit
  try {
    consumeOrThrow(rateLimitKey(request), { capacity: 5, refillPerSecond: 5 / 60, keyPrefix: "register-begin" });
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

  // 4. First-time-only gate
  const sql = db();
  const rows = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM auth_users`;
  const userCount = rows[0]?.count ?? 0;
  if (userCount > 0) {
    return jsonResponse(409, { error: "registration-disabled" });
  }

  // 5. Mint identifiers
  const pendingUserId = ulid();
  const deviceLabel = parsed.data.deviceLabel ?? defaultDeviceLabel();

  // 6. Generate WebAuthn options
  const options = await generateRegistrationOptions({
    userId: pendingUserId,
    userName: REG_USER_NAME,
    excludeCredentials: [],
  });

  // 7. Bind challenge + pendingUserId + deviceLabel in signed cookie
  const payload: RegSessionPayload = {
    challenge: options.challenge,
    pendingUserId,
    deviceLabel,
  };
  const cookie = buildRegSessionCookie(payload);

  // 8. Return options only — no userId on the wire
  return jsonResponse(200, { options }, { "set-cookie": cookie });
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
  return new Response(null, {
    status: 204,
    headers: { allow: "POST, OPTIONS" },
  });
}

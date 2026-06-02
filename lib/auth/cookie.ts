// HMAC-SHA256 sign/verify helpers for session cookies and challenge tokens.
// Pure Node `crypto`; no third-party crypto deps.
//
// Token format: `<base64url(payload)>.<base64url(signature)>`
// Payload shape: `{ v: <string-value>, exp: <unix-seconds> }`
//
// Used by `lib/auth/sessions.ts` (session-id cookies) and
// `lib/auth/challenges.ts` (short-lived WebAuthn challenge tokens).
//
// Per architecture.md § Foundational Identity & Access Posture / Session strategy:
//   - The cookie alone is not trusted — for session cookies, `sessions.verifySession`
//     also requires a matching `auth_sessions` row.
//   - For challenge tokens, the value contains its own structured payload
//     (`{p: 'challenge', k, c}`) so cross-use with session cookies rejects
//     at the consumer layer.

import { createHmac, timingSafeEqual } from "node:crypto";

type SignedPayload = { v: string; exp: number };

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function hmac(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

/**
 * Sign a string value with a max-age. Returns `<payload>.<signature>`.
 * Throws if `maxAgeSeconds` is not positive.
 */
export function signValue(value: string, secret: string, maxAgeSeconds: number): string {
  if (!Number.isFinite(maxAgeSeconds) || maxAgeSeconds <= 0) {
    throw new Error("signValue: maxAgeSeconds must be a positive finite number");
  }
  if (!secret || secret.length < 32) {
    throw new Error("signValue: secret must be at least 32 chars");
  }
  const payload: SignedPayload = { v: value, exp: nowSeconds() + Math.floor(maxAgeSeconds) };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
  const sig = hmac(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}

/**
 * Verify a signed token. Returns `{ value }` on success; `null` on any failure
 * (tamper, malformed, expired).
 */
export function verifyValue(token: string, secret: string): { value: string } | null {
  if (typeof token !== "string" || !token) return null;
  if (!secret) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return null;

  const expectedSig = hmac(payloadB64, secret);
  // timingSafeEqual requires equal-length buffers; reject any length mismatch first
  if (sig.length !== expectedSig.length) return null;
  const sigBuf = Buffer.from(sig, "utf-8");
  const expectedBuf = Buffer.from(expectedSig, "utf-8");
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as { v?: unknown }).v !== "string" ||
    typeof (payload as { exp?: unknown }).exp !== "number"
  ) {
    return null;
  }
  const { v, exp } = payload as SignedPayload;
  if (exp <= nowSeconds()) return null;
  return { value: v };
}

// Session-cookie attribute helpers.
// Per architecture.md § Foundational Identity & Access Posture / Session strategy:
//   - Cookie attributes: HttpOnly + Secure + SameSite=Strict + Path=/
//   - 30-day sliding expiry (TTL applied at issuance; verifySession bumps the
//     DB row's expires_at on every authenticated request)
//
// These helpers are the single source of truth for the session cookie's name +
// attribute set. `buildSessionCookie` (issuance, at authenticate/finish) and
// `clearSessionCookie` (revocation, at sign-out) MUST share an identical
// attribute set except for value + Max-Age — any divergence and the browser
// keeps the original cookie alongside an unrelated cleared one, defeating
// the revocation. Extracting both helpers here makes that drift structurally
// impossible (per CB-1.5 AC 7 / AC 12).
//
// NOTE: `proxy.ts` (project root) currently duplicates SESSION_COOKIE_NAME as
// a local const due to CB-1.5's AC 5 constraint ("NO modifications to
// proxy.ts" this story). A future story should consolidate.

export const SESSION_COOKIE_NAME = "__compass_session";
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export function buildSessionCookie(signedValue: string): string {
  return `${SESSION_COOKIE_NAME}=${signedValue}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

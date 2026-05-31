// WebAuthn challenge storage via encrypted signed cookies.
// Per story CB-1.1 DRI Decision: signed-cookie approach (stateless, 60-second TTL).
// Per architecture.md § Foundational Identity & Access Posture.
//
// The inner payload `{p: 'challenge', k, c}` carries a `purpose` tag that
// prevents cross-use with session cookies (which carry just the session id
// via `lib/auth/sessions`). The same `SESSION_SIGNING_SECRET` is reused for
// both because the payload-shape discriminator provides isolation; see the
// CB-1.1 story DRI for the rationale.

import { randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { signValue, verifyValue } from "@/lib/auth/cookie";

const CHALLENGE_TTL_SECONDS = 60;
const CHALLENGE_BYTES = 32;

type ChallengePurpose = "registration" | "authentication";

type ChallengePayload = {
  p: "challenge"; // discriminator vs. session cookies
  k: ChallengePurpose;
  c: string; // base64url challenge
};

function isChallengePayload(value: unknown): value is ChallengePayload {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { p?: unknown }).p === "challenge" &&
    typeof (value as { k?: unknown }).k === "string" &&
    ((value as { k: string }).k === "registration" || (value as { k: string }).k === "authentication") &&
    typeof (value as { c?: unknown }).c === "string"
  );
}

/**
 * Mint a fresh WebAuthn challenge.
 * Returns the raw `challenge` (to pass to SimpleWebAuthn's `generate*Options`)
 * and the `signedToken` (to send back to the browser as a short-lived cookie
 * or response-body value; the browser returns it in the `finish` request).
 */
export function mintChallenge(purpose: ChallengePurpose): { challenge: string; signedToken: string } {
  const challenge = randomBytes(CHALLENGE_BYTES).toString("base64url");
  const payload: ChallengePayload = { p: "challenge", k: purpose, c: challenge };
  const signedToken = signValue(JSON.stringify(payload), env().SESSION_SIGNING_SECRET, CHALLENGE_TTL_SECONDS);
  return { challenge, signedToken };
}

/**
 * Consume a signed challenge token.
 * Returns the original challenge on success; null on any failure (tamper,
 * expired, wrong purpose). Single-use semantics are enforced at the
 * route-handler layer (handler clears the cookie after a successful consume).
 */
export function consumeChallenge(
  signedToken: string,
  expectedPurpose: ChallengePurpose,
): { challenge: string } | null {
  const result = verifyValue(signedToken, env().SESSION_SIGNING_SECRET);
  if (!result) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.value);
  } catch {
    return null;
  }
  if (!isChallengePayload(parsed)) return null;
  if (parsed.k !== expectedPurpose) return null;
  return { challenge: parsed.c };
}

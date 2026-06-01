// Session helpers — thin wrappers over the shared `lib/db/client.ts` Postgres
// connection. Per architecture.md § Foundational Identity & Access Posture /
// Session strategy:
//   - Cookie attributes set at the route-handler layer: HttpOnly + Secure +
//     SameSite=Strict + Path=/ (this module returns the signed cookie value,
//     NOT a Set-Cookie header).
//   - HMAC-SHA256 against SESSION_SIGNING_SECRET (rotation = forced reauth).
//   - Cookie carries only the session id; every authenticated request loads
//     the auth_sessions row and validates `expires_at > now()`. The cookie
//     signature alone is not trusted.
//   - 30-day sliding inactivity expiry (every verified request bumps
//     expires_at).
//   - New session id on each successful authentication; prior id invalidated
//     immediately (see rotateSession).

import postgres from "postgres";
import { ulid } from "ulidx";
import { env } from "@/lib/env";
import { db } from "@/lib/db/client";
import { signValue, verifyValue } from "@/lib/auth/cookie";

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const SESSION_TTL_INTERVAL = "30 days";

type SessionRow = {
  user_id: string;
  expires_at: Date;
};

/**
 * Tagged-template SQL client — covers both the top-level `Sql<>` client
 * returned by `db()` and the `TransactionSql<>` passed into `sql.begin`'s
 * callback. Both share the tagged-template call + `.unsafe`; postgres.js
 * keeps them as distinct TS types because TransactionSql lacks lifecycle
 * methods (CLOSE, END, etc.), so a union is required to accept either.
 */
type SqlClient = postgres.Sql<Record<string, never>> | postgres.TransactionSql<Record<string, never>>;

/**
 * Create a new session for `userId`. Inserts an auth_sessions row and returns
 * `{ sessionId, signedCookie }`. Caller is responsible for setting the cookie
 * with HttpOnly + Secure + SameSite=Strict + Path=/.
 *
 * When `txClient` is provided, the INSERT participates in the caller's
 * transaction (used by /api/auth/register/finish for atomic registration —
 * user + credential + session must commit together; closes CB-1.2 Codex
 * BLOCKER #1's underlying spec gap by keeping the canonical helper as the
 * single source of session TTL/signing logic). When omitted, uses the shared
 * top-level client (legacy behavior; preserved for all existing callers).
 */
export async function createSession(
  userId: string,
  txClient?: SqlClient,
): Promise<{ sessionId: string; signedCookie: string }> {
  const sessionId = ulid();
  const sql = txClient ?? db();
  await sql`
    INSERT INTO auth_sessions (id, user_id, expires_at)
    VALUES (${sessionId}, ${userId}, now() + interval '${sql.unsafe(SESSION_TTL_INTERVAL)}')
  `;
  const signedCookie = signValue(sessionId, env().SESSION_SIGNING_SECRET, SESSION_TTL_SECONDS);
  return { sessionId, signedCookie };
}

/**
 * Verify a signed-cookie value:
 *   1. Verify signature + non-expiry of the cookie itself (lib/auth/cookie).
 *   2. Load the auth_sessions row by id.
 *   3. Reject if row missing or expires_at <= now.
 *   4. Bump expires_at (sliding inactivity expiry).
 *   5. Return `{ userId, sessionId }`.
 *
 * Any failure → null. The cookie's signature alone is not trusted; the DB row
 * is the source of truth (architecture invariant).
 */
export async function verifySession(signedCookie: string): Promise<{ userId: string; sessionId: string } | null> {
  const verified = verifyValue(signedCookie, env().SESSION_SIGNING_SECRET);
  if (!verified) return null;

  const sessionId = verified.value;
  const sql = db();

  const rows = await sql<SessionRow[]>`
    SELECT user_id, expires_at FROM auth_sessions WHERE id = ${sessionId}
  `;
  if (rows.length === 0) return null;
  const row = rows[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;

  // Sliding expiry
  await sql`
    UPDATE auth_sessions
       SET expires_at = now() + interval '${sql.unsafe(SESSION_TTL_INTERVAL)}'
     WHERE id = ${sessionId}
  `;

  return { userId: row.user_id, sessionId };
}

/**
 * Delete a session row. Idempotent — deleting a non-existent id is a no-op.
 */
export async function invalidateSession(sessionId: string): Promise<void> {
  const sql = db();
  await sql`DELETE FROM auth_sessions WHERE id = ${sessionId}`;
}

/**
 * Atomic rotation: invalidate the current session id and create a fresh one
 * for the same user, in a single transaction. Used on every successful
 * authentication so that the prior session id has no overlap window with the
 * new one.
 */
export async function rotateSession(
  currentSessionId: string,
  userId: string,
): Promise<{ sessionId: string; signedCookie: string }> {
  const sql = db();
  const newSessionId = ulid();
  await sql.begin(async (tx) => {
    await tx`DELETE FROM auth_sessions WHERE id = ${currentSessionId}`;
    await tx`
      INSERT INTO auth_sessions (id, user_id, expires_at, rotated_at)
      VALUES (${newSessionId}, ${userId}, now() + interval '${tx.unsafe(SESSION_TTL_INTERVAL)}', now())
    `;
  });
  const signedCookie = signValue(newSessionId, env().SESSION_SIGNING_SECRET, SESSION_TTL_SECONDS);
  return { sessionId: newSessionId, signedCookie };
}

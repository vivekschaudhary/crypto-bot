// Session-cookie helpers — scaffold stub.
//
// Real implementation per architecture.md Foundational Identity & Access
// Posture § Session strategy:
//   - HMAC-SHA256 signed cookie (HttpOnly + Secure + SameSite=Strict)
//   - Cookie carries only a session id
//   - Every authenticated request validates against auth_sessions row
//   - 30-day sliding inactivity expiry
//   - Rotates on each authentication (prior id invalidated immediately)
//
// Real impl arrives via /build story ticket. Listed here so the boundary
// folder exists and future imports have an expected path.

export type Session = {
  id: string;
  userId: string;
  expiresAt: Date;
};

export async function getSession(): Promise<Session | null> {
  // TODO (story): read signed cookie, validate signature, load auth_sessions
  // row by id, return null if missing or expired.
  return null;
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session;
}

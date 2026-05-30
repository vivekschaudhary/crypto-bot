// Next.js 16 proxy.ts (NOT middleware.ts) — session-gate routing per
// architecture.md Foundational Identity & Access Posture § Authenticated
// surface enumeration.
//
// This is a scaffold stub. The real session validation lives in
// `lib/auth/session.ts` and reads the signed session cookie + validates
// against the `auth_sessions` row in Postgres. Build it out via /build.
//
// Rule (per architecture.md Cross-cutting standards § Auth): every route
// outside /api/auth/* and /api/cron/* requires a valid session cookie
// verified against an auth_sessions row (cookie signature alone is not
// trusted — DB row is the source of truth).

import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_ROUTES = [
  "/", // landing
  "/api/auth/register",
  "/api/auth/authenticate",
  "/api/auth/recovery",
  "/api/cron/tick", // CRON_SECRET-gated, not session-gated
];

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Pass-through public surfaces.
  if (PUBLIC_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  // TODO (story ticket): replace stub with real session validation.
  // For scaffold canary: allow through. The canary verifies hosting + cron
  // + DB connection, NOT the auth flow (that's a separate story).
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico
     * - public files (.svg, .png, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

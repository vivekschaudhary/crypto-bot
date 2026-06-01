// Next.js 16 proxy.ts (renamed from middleware.ts in Next 16 partly motivated
// by CVE-2025-29927) — session-gate routing per architecture.md Foundational
// Identity & Access Posture § Authenticated surface enumeration.
//
// Per CB-1.4 story (Engineer DRI Decision): this gate is **defense-in-depth,
// NOT sole auth protection**. The Vercel routing-middleware guidance is
// explicit that middleware/proxy auth must not be the only check —
// downstream route handlers that perform sensitive actions MUST also call
// `verifySession()` themselves. The `x-session-user-id` / `x-session-id`
// headers this proxy injects are CONVENIENCE signals for performance, not
// authoritative auth claims. Forged headers, proxy bypass, or any future
// CVE-class issue must NOT translate into bypassed auth at the handler
// layer. Treat the proxy as the FIRST defense layer; the handler is the
// SECOND.
//
// Today (CB-1.4 era): no protected route handlers exist yet beyond the
// dashboard page placeholder, so the proxy IS the only layer in practice.
// Acceptable for n=1 MVP. Future stories (CB-1.5 sign-out, CB-2/3/4/5)
// add the route-level layer.
//
// Per architecture.md Cross-cutting standards § Auth: every route outside
// /api/auth/* and /api/cron/* requires a valid session cookie verified
// against an auth_sessions row (cookie signature alone is not trusted —
// DB row is the source of truth).

import { NextResponse, type NextRequest } from "next/server";
import { verifySession } from "@/lib/auth/sessions";

// Node runtime — REQUIRED. verifySession transitively imports postgres
// (postgres.js client) which uses Node-only APIs. Per v0.3.5 Compass
// framework sync's Vercel knowledge: middleware/proxy supports Node.js
// under Fluid Compute. Explicit declaration documents the choice +
// future-proofs against Next.js default changes.
export const runtime = "nodejs";

const SESSION_COOKIE_NAME = "__compass_session";

const PUBLIC_ROUTES = [
  "/", // landing
  "/api/auth/register",
  "/api/auth/authenticate",
  "/api/auth/recovery",
  "/api/cron/tick", // CRON_SECRET-gated, not session-gated
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isApiRoute(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

function buildSignInRedirect(request: NextRequest): NextResponse {
  // Preserve the operator's intended destination via ?next=<encoded>.
  // CB-1.6 (first-deploy onboarding) consumes this query parameter on
  // the receiving end. Until /sign-in is a real page, "/" is the safe
  // landing target.
  const target = new URL("/", request.nextUrl);
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  target.searchParams.set("next", next);
  return NextResponse.redirect(target, { status: 302 });
}

function buildUnauthenticatedApiResponse(): NextResponse {
  return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
}

export default async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // 1. Public surfaces — passthrough, no DB call (verified by AC 6 test).
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // 2. Fast-fail when no cookie present — skip the DB call entirely.
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!cookie) {
    return isApiRoute(pathname) ? buildUnauthenticatedApiResponse() : buildSignInRedirect(request);
  }

  // 3. Canonical session verification — HMAC + DB-row + sliding expiry.
  //    Per CB-1.4 AC 12: do NOT re-implement; the helper IS the contract.
  const session = await verifySession(cookie);
  if (!session) {
    return isApiRoute(pathname) ? buildUnauthenticatedApiResponse() : buildSignInRedirect(request);
  }

  // 4. Valid session — passthrough + enrich with informational headers.
  //    READ ME: these headers are CONVENIENCE, NOT auth claims. Per the
  //    DRI Decision on defense-in-depth, downstream handlers must call
  //    verifySession themselves before trusting any session context.
  const next = NextResponse.next({
    request: {
      headers: new Headers(request.headers),
    },
  });
  next.headers.set("x-session-user-id", session.userId);
  next.headers.set("x-session-id", session.sessionId);
  return next;
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

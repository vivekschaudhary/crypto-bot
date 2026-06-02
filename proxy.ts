// Next.js 16 proxy.ts — session-gate routing per architecture.md
// Foundational Identity & Access Posture § Authenticated surface enumeration.
//
// LOCATION: project root (NOT app/proxy.ts). Next.js 16 only registers
// proxy.ts at the project root (or src/proxy.ts with --src-dir). A file at
// app/proxy.ts is NOT registered and never sees traffic — that was the
// PR #10 first-attempt regression both reviewers caught.
//
// RUNTIME: NOT declared. Next.js 16 proxy.ts is Node.js-only by design;
// `export const runtime = '...'` throws. The first-attempt declaration was
// wrong (also caught by both reviewers).
//
// SESSION CONTEXT FORWARDING: per Next.js 16 documented contract, downstream
// handlers receive headers set on the CLONED request via
// `NextResponse.next({ request: { headers: clonedHeaders } })`. Headers set
// via `next.headers.set(...)` AFTER construction land on the RESPONSE
// (visible to browser) and do not reach the downstream handler — that was
// the first-attempt CRITICAL bug. The Next.js runtime translates the cloned
// request headers into `x-middleware-override-headers` + `x-middleware-
// request-<key>` sentinel headers on the response; the framework reads
// those and applies them to the next handler's request. Verified by both
// reviewers from the Next.js source.
//
// DEFENSE-IN-DEPTH POSTURE: this gate is NOT sole auth protection.
// Downstream route handlers that perform authenticated actions MUST call
// `verifySession()` themselves — the `x-session-*` headers this proxy
// forwards are CONVENIENCE for routes that don't perform authenticated
// actions (audit logging, content rendering with userId in scope). Routes
// that touch capital-sensitive surfaces re-verify. The CVE-2025-29927
// lineage that motivated the Next.js 16 `middleware.ts → proxy.ts` rename
// is the cautionary tale here: never trust middleware/proxy as the sole
// auth check. (Story DRI Decision; aligns Decision 2 + 4 after PR #10's
// first-attempt review surfaced the contradiction.)

import { NextResponse, type NextRequest } from "next/server";
import { verifySession } from "@/lib/auth/sessions";

const SESSION_COOKIE_NAME = "__compass_session";

// Hard cap on cookie length before HMAC verification. A legitimate signed
// session cookie is ~70 bytes (ULID + signature). Cap at 2 KB to bound the
// HMAC compute on attacker-controlled input. Beyond the cap, treat as
// invalid without doing the HMAC check.
const MAX_COOKIE_BYTES = 2048;

// Public routes that NEVER trigger session validation. Two categories:
//
//  - PUBLIC_EXACT: must match the pathname character-for-character.
//    No sub-path is auto-public. Adding a route to this list does NOT
//    permit sub-paths.
//
//  - PUBLIC_PREFIXES: intentional path hierarchies. The trailing slash is
//    REQUIRED so `/api/cron/tick` doesn't accidentally permit
//    `/api/cron/tick-admin`. Adding a route here documents the deliberate
//    decision that sub-paths under this prefix are also public.
//
// First-attempt review caught that `startsWith(${p}/)` against the flat
// PUBLIC_ROUTES list would silently classify `/api/cron/tick/anything` as
// public — that's the MEDIUM finding the security reviewer surfaced.
const PUBLIC_EXACT = new Set<string>(["/", "/api/cron/tick"]);

const PUBLIC_PREFIXES: readonly string[] = [
  // Ceremony entry points — explicit sub-paths (begin/finish) live below.
  "/api/auth/register/",
  "/api/auth/authenticate/",
  "/api/auth/recovery/",
];

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

function isApiRoute(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

/**
 * Safe-path check for the `?next=<path>` redirect parameter. Reject:
 *   - Non-string values (defensive)
 *   - Empty string
 *   - Anything not starting with `/`
 *   - Anything containing `//` ANYWHERE — covers protocol-relative URLs
 *     (`//evil.example/path`) AND mid-path double-slash (`/dashboard//evil`).
 *     The URL constructor normalizes backslash (`\`) to `/`, so a path like
 *     `/dashboard/\evil` arrives here as `/dashboard//evil` — same surface.
 *     Rejecting `//` everywhere covers both attack vectors with one rule.
 *   - Path-like values that contain `\` (defense-in-depth in case URL
 *     normalization differs across runtimes)
 *   - Anything containing `:` in the first path segment — catches
 *     `javascript:`, `data:`, `file:`, `mailto:`, etc.
 *
 * Caller responsibility: only set `?next` when the candidate value passes
 * this check. CB-1.6 (the consumer) is responsible for its own validation
 * when reading the value — emit-side validation is defense-in-depth, not
 * the sole protection.
 */
function isSafeNextPath(candidate: string): boolean {
  if (typeof candidate !== "string" || candidate.length === 0) return false;
  if (!candidate.startsWith("/")) return false;
  if (candidate.includes("//")) return false;
  if (candidate.includes("\\")) return false;
  // Reject anything with `:` in the first path segment — catches protocol-
  // like prefixes (`javascript:`, `data:`, etc.). The first segment ends at
  // the first `/` after position 0.
  const firstColon = candidate.indexOf(":");
  if (firstColon !== -1) {
    const firstSlash = candidate.indexOf("/", 1);
    if (firstSlash === -1 || firstColon < firstSlash) return false;
  }
  return true;
}

function buildSignInRedirect(request: NextRequest): NextResponse {
  const target = new URL("/", request.nextUrl);
  const candidate = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (isSafeNextPath(candidate)) {
    target.searchParams.set("next", candidate);
  }
  // 302 (Found) over 307 (Temporary Redirect): legacy semantic preserves
  // GET-method on the redirect target for browser-driven flows.
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

  // 2. Cookie absent — fast-fail before DB hit.
  const rawCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!rawCookie) {
    return isApiRoute(pathname) ? buildUnauthenticatedApiResponse() : buildSignInRedirect(request);
  }

  // 3. Length cap. Bounds attacker-controlled HMAC compute.
  if (rawCookie.length > MAX_COOKIE_BYTES) {
    return isApiRoute(pathname) ? buildUnauthenticatedApiResponse() : buildSignInRedirect(request);
  }

  // 4. Canonical session verification — HMAC + DB-row + sliding expiry.
  //    Per architecture.md: "every verified request bumps expires_at"; the
  //    sliding-expiry side-effect is the documented design intent, not a
  //    bug. Stolen-cookie self-renewal is the inherent trade-off, mitigated
  //    by future sign-out (CB-1.5) and post-MVP session-revocation UX.
  const session = await verifySession(rawCookie);
  if (!session) {
    return isApiRoute(pathname) ? buildUnauthenticatedApiResponse() : buildSignInRedirect(request);
  }

  // 5. Valid session — forward to downstream handler with session context
  //    in REQUEST headers (not response headers).
  //
  //    Mechanism: clone request headers, mutate the clone, pass the clone
  //    via `NextResponse.next({ request: { headers: cloned } })`. Next.js
  //    translates this to `x-middleware-override-headers` + per-key
  //    `x-middleware-request-<key>` sentinel headers on the response; the
  //    framework reads those and applies them to the next handler's
  //    request.
  //
  //    DO NOT call `result.headers.set('x-session-*', ...)` after this —
  //    that lands the values on the RESPONSE (visible to browser), which
  //    leaks the session id + does not reach the downstream handler. That
  //    was PR #10's first-attempt CRITICAL bug.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-session-user-id", session.userId);
  requestHeaders.set("x-session-id", session.sessionId);
  return NextResponse.next({ request: { headers: requestHeaders } });
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

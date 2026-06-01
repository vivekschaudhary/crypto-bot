// Origin / Referer verification for POST flows on /api/auth/*.
// Per architecture.md § Foundational Identity & Access Posture / Cross-cutting
// standards: "Origin check on auth endpoints (defense-in-depth against CSRF
// on POST flows)."
//
// The check is strict-equality against `origin()` from lib/env. Browsers that
// strip Origin on same-origin requests are not a concern for our flows
// (modern browsers send Origin on cross-site POST; same-site POST always
// has Origin or Referer). If both headers are missing, we reject.

import { origin } from "@/lib/env";

export class OriginMismatchError extends Error {
  readonly code = "origin-mismatch" as const;
  constructor(message: string) {
    super(message);
    this.name = "OriginMismatchError";
  }
}

function hostFromUrl(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Throw `OriginMismatchError` if the request's Origin (or Referer host) does
 * not match the configured APP_ORIGIN. Used at the top of every
 * `/api/auth/*` POST handler.
 */
export function verifyOriginOrThrow(request: Request): void {
  const expected = origin();
  const originHeader = request.headers.get("origin");
  if (originHeader && originHeader === expected) return;

  const referer = request.headers.get("referer");
  if (referer) {
    const refererOrigin = hostFromUrl(referer);
    if (refererOrigin === expected) return;
  }

  throw new OriginMismatchError(
    `Origin header (${originHeader ?? "<missing>"}) and Referer (${referer ?? "<missing>"}) do not match APP_ORIGIN (${expected})`,
  );
}

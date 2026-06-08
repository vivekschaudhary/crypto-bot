// Observability layer for `lib/coinbase/*` requests.
//
// LAST CB-2 STORY (CB-2.5). When the bet ships, this file plus the
// thin integration in `client.ts` complete the typed Coinbase wrapper.
// Downstream tools (Vercel runtime logs at MVP; Sentry / DB persistence
// later if operator picks a 30-day retention path) consume the emitted
// JSON to derive the key_metric (wrapper API success rate).
//
// Architectural invariants from CB-2 brief (enforced by tests):
//   * No LIVE_MODE reads (no-live-mode.test.ts auto-scans this file)
//   * Sensitive-data hygiene: emit envelope metadata ONLY (method, path,
//     status, duration_ms, rate_limit?). NEVER request body, response
//     body, balance values, order details, or client_order_id from
//     POST bodies. The trace JSON is small + bounded + safe to ship to
//     any log destination.
//   * Defensive emit: never throws. If console.log itself errors (very
//     unusual but defensive), fall back to console.error with a marker;
//     do not re-throw. Trace observability MUST NOT break the request
//     path. Verified by AC 4 unit test.
//
// Sentry SDK install deferred per operator confirmation 2026-06-08;
// the structured-console.log shape is forward-compatible with adding
// Sentry.addBreadcrumb in a follow-up /ops PR. See CB-2.5 story DRI
// Decision #1.
//
// 30-day metric retention is aspirational; current Vercel Pro window
// is 1-day. See CB-2 brief key_metric.source caveat (amended 2026-06-08).

import type { HttpMethod } from "./client";

/**
 * Rate-limit observation extracted from a Coinbase Response's headers.
 * Populated by `extractRateLimit()` defensively (tries multiple plausible
 * header names case-insensitively); undefined when none of the tried
 * names appear in the response.
 *
 * Coinbase docs are ambiguous on whether Advanced Trade returns these
 * headers (per CB-2 brief Researcher Open Question #1). The integration
 * test at `trace.integration.test.ts` logs ALL observed headers so the
 * Engineer can extend the lookup list if a non-obvious Coinbase-specific
 * name surfaces.
 */
export interface RateLimit {
  remaining?: string;
  limit?: string;
  reset?: string;
}

/**
 * Emit one structured-JSON log line per Coinbase HTTP request.
 *
 * Shape: `{"event":"coinbase.request","method":...,"path":...,"status":...,
 *          "duration_ms":...,"rate_limit":{...}?}`
 *
 * Vercel runtime log collection ingests this format into the project's
 * observability dashboard automatically. Downstream tools (Vercel
 * dashboard queries, future Sentry, future DB persistence) compute the
 * success-rate metric from this shape.
 *
 * NEVER throws. If the underlying `console.log` errors (vanishingly
 * unlikely; defensive), falls back to `console.error` with a marker
 * line and continues. The Coinbase request path is the load-bearing
 * concern; observability is best-effort.
 *
 * `status: 0` is the convention for transport-layer failures (network
 * error before any HTTP response was received). Non-zero status values
 * come from `Response.status` for both 2xx success and 4xx/5xx error
 * paths (client.ts captures both via try/catch/finally).
 */
export function emitRequestTrace(args: {
  method: HttpMethod;
  path: string;
  status: number;
  durationMs: number;
  rateLimit?: RateLimit;
}): void {
  try {
    const payload: Record<string, unknown> = {
      event: "coinbase.request",
      method: args.method,
      path: args.path,
      status: args.status,
      duration_ms: args.durationMs,
    };
    if (args.rateLimit) {
      payload.rate_limit = args.rateLimit;
    }
    console.log(JSON.stringify(payload));
  } catch (err) {
    // Defensive: emit must NEVER break the request path. Fallback to
    // console.error with a marker so the failure is visible in logs but
    // doesn't propagate.
    try {
      console.error(
        `[coinbase.trace] emit failed for ${args.method} ${args.path}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    } catch {
      // If even console.error fails, swallow silently — there's nothing
      // we can do, and we MUST NOT throw out of trace.
    }
  }
}

/**
 * Parse a Coinbase Response's headers for rate-limit observability data.
 *
 * Defensive: tries multiple plausible header names (case-insensitive via
 * `Headers.get`) because Coinbase Advanced Trade documentation is
 * ambiguous on which names are returned. Returns `undefined` when none
 * of the tried names appear — the integration test logs ALL response
 * headers so the Engineer can extend this list if a non-obvious name
 * surfaces empirically.
 *
 * Returns `undefined` (not an empty object) when nothing matches — so
 * the trace payload omits `rate_limit` entirely rather than emitting
 * `{rate_limit: {}}`. Cleaner queryability for downstream tools.
 */
export function extractRateLimit(headers: Headers): RateLimit | undefined {
  const tryNames = (...candidates: string[]): string | undefined => {
    for (const name of candidates) {
      const value = headers.get(name);
      if (value !== null && value.length > 0) return value;
    }
    return undefined;
  };

  const remaining = tryNames(
    "x-ratelimit-remaining",
    "ratelimit-remaining",
    "cb-ratelimit-remaining",
  );
  const limit = tryNames(
    "x-ratelimit-limit",
    "ratelimit-limit",
    "cb-ratelimit-limit",
  );
  const reset = tryNames(
    "x-ratelimit-reset",
    "ratelimit-reset",
    "cb-ratelimit-reset",
  );

  if (remaining === undefined && limit === undefined && reset === undefined) {
    return undefined;
  }
  const out: RateLimit = {};
  if (remaining !== undefined) out.remaining = remaining;
  if (limit !== undefined) out.limit = limit;
  if (reset !== undefined) out.reset = reset;
  return out;
}

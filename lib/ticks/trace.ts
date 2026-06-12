// `lib/ticks/trace.ts` — structured-JSON log emission for bot ticks.
//
// CB-4.2 AC 11 — one line per tick; `event: "bot_tick"` is the query key
// for the fitness-function measurement + CB-5's dashboard log queries.
// Mirrors the CB-2.5 `lib/coinbase/trace.ts` single-line-JSON precedent
// (architecture Decision #7 pattern: structured logs over Sentry
// breadcrumbs for runtime telemetry).

// PR #63 round-1 SECURITY (medium) closure: error messages originating in
// the Coinbase client can embed request context — and the JWT auth path
// means token-like material is at least conceivable in a thrown message.
// Anything persisted to `bot_ticks.error_detail` or emitted to the log
// drain is retained indefinitely, so redact-then-truncate BEFORE either
// sink. Patterns: PEM blocks (the COINBASE_API_PRIVATE_KEY shape), 3-part
// JWTs, Bearer tokens. 500-char cap bounds row/log growth from verbose
// upstream errors.
const REDACTIONS: ReadonlyArray<[RegExp, string]> = [
  [/-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g, "[REDACTED_PEM]"],
  [/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, "[REDACTED_JWT]"],
  [/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [REDACTED]"],
];
const ERROR_DETAIL_MAX_CHARS = 500;

/** Redact secret-shaped substrings + truncate. Idempotent; never throws. */
export function sanitizeErrorDetail(message: string): string {
  let out = message;
  for (const [pattern, replacement] of REDACTIONS) {
    out = out.replace(pattern, replacement);
  }
  if (out.length > ERROR_DETAIL_MAX_CHARS) {
    out = `${out.slice(0, ERROR_DETAIL_MAX_CHARS)}…[truncated]`;
  }
  return out;
}

export interface TickTraceArgs {
  tickId?: string;
  sessionId?: string;
  tickStartedAt?: string;
  liveMode: boolean;
  durationMs: number;
  decisions?: { asset: string; decision: string; reason: string }[];
  skipped?: string;
  duplicate?: boolean;
  error?: string;
}

/**
 * Emit the per-tick structured log line. console.log → Vercel log drain;
 * never throws (a logging failure must not fail the tick).
 */
export function emitTickTrace(args: TickTraceArgs): void {
  try {
    const payload: Record<string, unknown> = {
      event: "bot_tick",
      live_mode: args.liveMode,
      duration_ms: args.durationMs,
    };
    if (args.tickId) payload.tick_id = args.tickId;
    if (args.sessionId) payload.session_id = args.sessionId;
    if (args.tickStartedAt) payload.tick_started_at = args.tickStartedAt;
    if (args.decisions) payload.decisions = args.decisions;
    if (args.skipped) payload.skipped = args.skipped;
    if (args.duplicate) payload.duplicate = true;
    // Defense-in-depth: sanitize HERE too, so a caller that forgets
    // still never emits secret-shaped material to the log drain.
    if (args.error) payload.error = sanitizeErrorDetail(args.error);
    console.log(JSON.stringify(payload));
  } catch {
    // Logging must never take down a tick. Swallow is intentional and
    // narrow: only JSON.stringify/console failures land here.
  }
}

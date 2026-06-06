// Coinbase wrapper boundary types.
//
// CB-2.1 ships the foundational typed-error layer. Zod response schemas come
// per-endpoint in CB-2.2/.3/.4 alongside the wrappers that consume them
// (market.ts, accounts.ts, orders.ts).
//
// Per architecture.md § Foundational Identity & Access Posture / Secrets-at-rest
// + the [CB-2 brief](../../docs/bets/CB-2/brief.md) PM DRI Decision #3:
// the wrapper is policy-free. No `LIVE_MODE` reads in this file or anywhere
// else under `lib/coinbase/` — that's an architectural invariant verified
// via the no-live-mode grep test.

/**
 * Typed error wrapping any non-2xx response from Coinbase Advanced Trade,
 * or any client-side wrapping failure (JSON parse error, network error, etc.).
 *
 * `code` is a stable string discriminator for consumer-side switch statements.
 * `status` is the HTTP status code when the error originated from a real
 * Coinbase response. `cause` preserves the underlying error / response body
 * for trace-up (debugging at the call-site).
 */
export class CoinbaseClientError extends Error {
  readonly code: string;
  readonly status?: number;
  override readonly cause?: unknown;

  constructor(args: { code: string; message: string; status?: number; cause?: unknown }) {
    super(args.message);
    this.name = "CoinbaseClientError";
    this.code = args.code;
    this.status = args.status;
    this.cause = args.cause;
  }

  /**
   * Wrap a non-2xx HTTP response into a CoinbaseClientError. Idempotent —
   * if `cause` is already a CoinbaseClientError, returns it unchanged.
   *
   * `body` may be the parsed JSON response, a raw string, or undefined.
   * If `body` is an object with a recognizable `error` / `error_code` /
   * `message` field, we extract `code` from it; otherwise `code` defaults
   * to `"unknown"`.
   */
  static fromHttpResponse(args: {
    method: string;
    path: string;
    status: number;
    body?: unknown;
  }): CoinbaseClientError {
    if (args.body instanceof CoinbaseClientError) return args.body;

    let code = "unknown";
    let message = `Coinbase ${args.method} ${args.path} responded ${args.status}`;

    if (args.body && typeof args.body === "object") {
      const obj = args.body as Record<string, unknown>;
      // Coinbase error shapes vary: { error: "..." } or { error_code: "..." } or { message: "..." }.
      // Pick the first string field we recognize for `code`; append the message
      // text to our own message for context.
      const codeCandidate =
        (typeof obj.error_code === "string" && obj.error_code) ||
        (typeof obj.error === "string" && obj.error) ||
        null;
      const messageCandidate =
        (typeof obj.message === "string" && obj.message) ||
        (typeof obj.error_description === "string" && obj.error_description) ||
        null;
      if (codeCandidate) code = codeCandidate;
      if (messageCandidate) message = `${message}: ${messageCandidate}`;
    }

    return new CoinbaseClientError({
      code,
      message,
      status: args.status,
      cause: args.body,
    });
  }
}

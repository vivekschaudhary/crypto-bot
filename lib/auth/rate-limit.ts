// In-memory token-bucket rate limiter for /api/auth/* unauthenticated entry
// points. Per CB-1.2 story AC 5: 5 requests / minute / origin, sliding window.
//
// LIMITATION (documented per the story's DRI Decision on this choice):
//   Vercel Fluid Compute reuses function instances within a region, so this
//   in-memory bucket holds APPROXIMATELY across requests on the same instance
//   — not perfectly across all instances. For n=1 operator on a single
//   region this is good-enough to deter mass automation. If the threat model
//   or traffic shape changes, swap this module for a Redis/Upstash-backed
//   implementation; the route call sites stay unchanged.
//
// TODO(post-MVP): swap for Upstash Redis when multi-instance enforcement
// becomes load-bearing.

type Bucket = {
  // Refill state — number of tokens available right now
  tokens: number;
  // Last time tokens were refilled (ms epoch)
  lastRefillMs: number;
};

type LimiterOptions = {
  capacity: number;
  refillPerSecond: number;
  keyPrefix?: string;
};

export class RateLimitedError extends Error {
  readonly code = "rate-limited" as const;
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super(`rate-limited; retry after ${retryAfterSeconds}s`);
    this.name = "RateLimitedError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const buckets = new Map<string, Bucket>();

/**
 * Consume one token for `key`. Throws RateLimitedError if the bucket is
 * empty.
 *
 * Default config: 5 requests / minute => capacity 5, refillPerSecond 1/12.
 */
export function consumeOrThrow(
  key: string,
  options: LimiterOptions = { capacity: 5, refillPerSecond: 5 / 60 },
  nowMs: number = Date.now(),
): void {
  const fullKey = `${options.keyPrefix ?? "default"}:${key}`;
  const existing = buckets.get(fullKey);
  const bucket: Bucket = existing ?? { tokens: options.capacity, lastRefillMs: nowMs };

  // Refill based on elapsed time since last refill
  const elapsedSec = (nowMs - bucket.lastRefillMs) / 1000;
  bucket.tokens = Math.min(options.capacity, bucket.tokens + elapsedSec * options.refillPerSecond);
  bucket.lastRefillMs = nowMs;

  if (bucket.tokens < 1) {
    buckets.set(fullKey, bucket);
    // Time to wait until at least 1 token: (1 - tokens) / refillPerSecond
    const secondsUntilOneToken = Math.ceil((1 - bucket.tokens) / options.refillPerSecond);
    throw new RateLimitedError(secondsUntilOneToken);
  }

  bucket.tokens -= 1;
  buckets.set(fullKey, bucket);
}

/** Test-only: clear all buckets. Not exported in production paths. */
export function __resetRateLimits(): void {
  buckets.clear();
}

import { beforeEach, describe, expect, it } from "vitest";
import { RateLimitedError, __resetRateLimits, consumeOrThrow } from "@/lib/auth/rate-limit";

describe("lib/auth/rate-limit", () => {
  beforeEach(() => {
    __resetRateLimits();
  });

  it("allows up to capacity requests in a single instant", () => {
    const opts = { capacity: 5, refillPerSecond: 5 / 60, keyPrefix: "test" };
    for (let i = 0; i < 5; i++) {
      expect(() => consumeOrThrow("origin-a", opts, 0)).not.toThrow();
    }
  });

  it("throws RateLimitedError on the (capacity+1)-th request in the same instant", () => {
    const opts = { capacity: 5, refillPerSecond: 5 / 60, keyPrefix: "test" };
    for (let i = 0; i < 5; i++) consumeOrThrow("origin-b", opts, 0);
    let thrown: unknown;
    try {
      consumeOrThrow("origin-b", opts, 0);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(RateLimitedError);
    expect((thrown as RateLimitedError).code).toBe("rate-limited");
    expect((thrown as RateLimitedError).retryAfterSeconds).toBeGreaterThan(0);
  });

  it("refills after time elapses (refill rate = 5/min)", () => {
    const opts = { capacity: 5, refillPerSecond: 5 / 60, keyPrefix: "test" };
    for (let i = 0; i < 5; i++) consumeOrThrow("origin-c", opts, 0);
    expect(() => consumeOrThrow("origin-c", opts, 0)).toThrow(RateLimitedError);
    // 12 seconds later → +1 token refilled
    expect(() => consumeOrThrow("origin-c", opts, 12_000)).not.toThrow();
  });

  it("isolates buckets by key", () => {
    const opts = { capacity: 5, refillPerSecond: 5 / 60, keyPrefix: "test" };
    for (let i = 0; i < 5; i++) consumeOrThrow("origin-d", opts, 0);
    // origin-d is empty, but origin-e still has full bucket
    expect(() => consumeOrThrow("origin-d", opts, 0)).toThrow(RateLimitedError);
    expect(() => consumeOrThrow("origin-e", opts, 0)).not.toThrow();
  });

  it("isolates buckets by keyPrefix even for the same key", () => {
    const beginOpts = { capacity: 5, refillPerSecond: 5 / 60, keyPrefix: "register-begin" };
    const finishOpts = { capacity: 5, refillPerSecond: 5 / 60, keyPrefix: "register-finish" };
    for (let i = 0; i < 5; i++) consumeOrThrow("origin-f", beginOpts, 0);
    expect(() => consumeOrThrow("origin-f", beginOpts, 0)).toThrow(RateLimitedError);
    // Finish bucket for the same origin still has 5 tokens
    expect(() => consumeOrThrow("origin-f", finishOpts, 0)).not.toThrow();
  });

  it("__resetRateLimits clears all buckets", () => {
    const opts = { capacity: 5, refillPerSecond: 5 / 60, keyPrefix: "test" };
    for (let i = 0; i < 5; i++) consumeOrThrow("origin-g", opts, 0);
    __resetRateLimits();
    expect(() => consumeOrThrow("origin-g", opts, 0)).not.toThrow();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

// Mock lib/env to provide a stable signing secret without needing real env vars.
const FAKE_SECRET = "z".repeat(48);
vi.mock("@/lib/env", () => ({
  env: () => ({ SESSION_SIGNING_SECRET: FAKE_SECRET }),
  origin: () => "http://localhost:3000",
}));

import { consumeChallenge, mintChallenge } from "@/lib/auth/challenges";
import { signValue } from "@/lib/auth/cookie";

describe("lib/auth/challenges", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-trips a registration challenge", () => {
    const { challenge, signedToken } = mintChallenge("registration");
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/); // base64url
    const result = consumeChallenge(signedToken, "registration");
    expect(result).toEqual({ challenge });
  });

  it("round-trips an authentication challenge", () => {
    const { challenge, signedToken } = mintChallenge("authentication");
    const result = consumeChallenge(signedToken, "authentication");
    expect(result).toEqual({ challenge });
  });

  it("rejects when the purpose doesn't match (registration token consumed as authentication)", () => {
    const { signedToken } = mintChallenge("registration");
    expect(consumeChallenge(signedToken, "authentication")).toBeNull();
  });

  it("rejects when the purpose doesn't match (authentication token consumed as registration)", () => {
    const { signedToken } = mintChallenge("authentication");
    expect(consumeChallenge(signedToken, "registration")).toBeNull();
  });

  it("rejects a tampered token", () => {
    const { signedToken } = mintChallenge("registration");
    const parts = signedToken.split(".");
    const payload = parts[0]!;
    const sig = parts[1]!;
    const tampered = `${payload}.${sig.slice(0, -1)}${sig.slice(-1) === "A" ? "B" : "A"}`;
    expect(consumeChallenge(tampered, "registration")).toBeNull();
  });

  it("rejects empty input", () => {
    expect(consumeChallenge("", "registration")).toBeNull();
  });

  it("each mint produces a different challenge (cryptographically random)", () => {
    const first = mintChallenge("registration");
    const second = mintChallenge("registration");
    expect(first.challenge).not.toBe(second.challenge);
    expect(first.signedToken).not.toBe(second.signedToken);
  });

  it("rejects an expired token (TTL = 60s; advance system time past it)", () => {
    // Mint, then jump system time 61 seconds forward. consumeChallenge must
    // reject because the underlying signed payload's `exp` is now in the past.
    // Closes CB-1.1 AC 5 gap (Codex BLOCKER #2 on PR #1).
    const realNow = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(realNow);
    const { signedToken } = mintChallenge("registration");
    vi.setSystemTime(realNow + 61_000); // > 60s TTL
    expect(consumeChallenge(signedToken, "registration")).toBeNull();
  });

  it("rejects a session-shape cookie (cross-use with sessions.ts)", () => {
    // A session cookie's inner value is the bare session id (not the
    // {p:'challenge',k,c} payload). consumeChallenge should reject.
    // Simulate a session-cookie value by sign-value-ing a plain string with
    // the same secret + a long enough TTL.
    const sessionLike = signValue("01ARZ3NDEKTSV4RRFFQ69G5FAV", FAKE_SECRET, 60);
    expect(consumeChallenge(sessionLike, "registration")).toBeNull();
    expect(consumeChallenge(sessionLike, "authentication")).toBeNull();
  });
});

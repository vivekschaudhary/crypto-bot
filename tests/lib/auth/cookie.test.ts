import { describe, expect, it } from "vitest";
import { signValue, verifyValue } from "@/lib/auth/cookie";

const SECRET = "a".repeat(48); // 48 chars ≥ the 32-char floor

describe("lib/auth/cookie", () => {
  it("round-trips a value through sign + verify", () => {
    const token = signValue("hello-world", SECRET, 60);
    const result = verifyValue(token, SECRET);
    expect(result).toEqual({ value: "hello-world" });
  });

  it("rejects a tampered signature", () => {
    const token = signValue("hello-world", SECRET, 60);
    const parts = token.split(".");
    const payload = parts[0]!;
    const sig = parts[1]!;
    // Flip the last character of the signature
    const tampered = `${payload}.${sig.slice(0, -1)}${sig.slice(-1) === "A" ? "B" : "A"}`;
    expect(verifyValue(tampered, SECRET)).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const token = signValue("hello-world", SECRET, 60);
    const parts = token.split(".");
    const payload = parts[0]!;
    const sig = parts[1]!;
    // Mutate the payload — signature won't match
    const tamperedPayload = payload.slice(0, -1) + (payload.slice(-1) === "A" ? "B" : "A");
    expect(verifyValue(`${tamperedPayload}.${sig}`, SECRET)).toBeNull();
  });

  it("rejects an expired token", () => {
    // maxAgeSeconds must be positive at sign time; we simulate expiry by
    // signing with a 1-second TTL and waiting via Date manipulation in JS
    // is unreliable here. Instead, hand-craft a token with exp in the past.
    const expiredPayload = Buffer.from(
      JSON.stringify({ v: "hello", exp: Math.floor(Date.now() / 1000) - 10 }),
      "utf-8",
    ).toString("base64url");
    // Sign the expired payload so the signature is valid (only exp check fails)
    const { createHmac } = require("node:crypto") as typeof import("node:crypto");
    const sig = createHmac("sha256", SECRET).update(expiredPayload).digest("base64url");
    expect(verifyValue(`${expiredPayload}.${sig}`, SECRET)).toBeNull();
  });

  it("rejects a malformed token (no dot separator)", () => {
    expect(verifyValue("not-a-token", SECRET)).toBeNull();
  });

  it("rejects a malformed token (too many dots)", () => {
    expect(verifyValue("a.b.c", SECRET)).toBeNull();
  });

  it("rejects empty string", () => {
    expect(verifyValue("", SECRET)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = signValue("hello", SECRET, 60);
    expect(verifyValue(token, "b".repeat(48))).toBeNull();
  });

  it("throws when maxAgeSeconds is zero or negative", () => {
    expect(() => signValue("hello", SECRET, 0)).toThrow();
    expect(() => signValue("hello", SECRET, -1)).toThrow();
  });

  it("throws when secret is too short", () => {
    expect(() => signValue("hello", "short", 60)).toThrow();
  });
});

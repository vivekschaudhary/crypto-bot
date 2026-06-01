import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: () => ({ SESSION_SIGNING_SECRET: "z".repeat(48) }),
  origin: () => "https://crypt-bot.kindtree.us",
}));

import { OriginMismatchError, verifyOriginOrThrow } from "@/lib/auth/origin-check";

function makeRequest(headers: Record<string, string>): Request {
  return new Request("https://crypt-bot.kindtree.us/api/auth/register/begin", {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
}

describe("lib/auth/origin-check", () => {
  it("accepts a matching Origin header", () => {
    expect(() => verifyOriginOrThrow(makeRequest({ origin: "https://crypt-bot.kindtree.us" }))).not.toThrow();
  });

  it("accepts a Referer that matches the expected origin host", () => {
    expect(() =>
      verifyOriginOrThrow(makeRequest({ referer: "https://crypt-bot.kindtree.us/setup" })),
    ).not.toThrow();
  });

  it("rejects a mismatched Origin", () => {
    expect(() => verifyOriginOrThrow(makeRequest({ origin: "https://evil.example" }))).toThrow(OriginMismatchError);
  });

  it("rejects when both Origin and Referer are absent", () => {
    expect(() => verifyOriginOrThrow(makeRequest({}))).toThrow(OriginMismatchError);
  });

  it("rejects when Referer points to a different host", () => {
    expect(() => verifyOriginOrThrow(makeRequest({ referer: "https://evil.example/setup" }))).toThrow(
      OriginMismatchError,
    );
  });

  it("rejects a malformed Referer (no scheme)", () => {
    expect(() => verifyOriginOrThrow(makeRequest({ referer: "not-a-url" }))).toThrow(OriginMismatchError);
  });
});

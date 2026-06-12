// Unit tests for `lib/ticks/trace.ts` — sanitizeErrorDetail.
//
// CB-4.2 PR #63 round-1 SECURITY (medium) closure: error messages can
// carry token-shaped material from the Coinbase client; rows + logs are
// retained indefinitely, so redact-then-truncate before either sink.

import { describe, expect, it } from "vitest";

import { sanitizeErrorDetail } from "@/lib/ticks/trace";

describe("sanitizeErrorDetail", () => {
  it("redacts PEM blocks (the COINBASE_API_PRIVATE_KEY shape)", () => {
    const message =
      "key load failed: -----BEGIN EC PRIVATE KEY-----\nMHcCAQEEIB\nlines\n-----END EC PRIVATE KEY----- (check env)";
    const out = sanitizeErrorDetail(message);
    expect(out).toContain("[REDACTED_PEM]");
    expect(out).not.toContain("MHcCAQEEIB");
    expect(out).toContain("(check env)"); // surrounding context survives
  });

  it("redacts 3-part JWTs", () => {
    // Fixture assembled at runtime so no literal JWT-shaped string exists
    // in source — secret scanners (gitleaks) correctly flag 3-part eyJ…
    // literals even when they're fakes (PR #63 round-2 CI fix).
    const jwt = ["eyJhbGciOiJFUzI1NiJ9", "eyJzdWIiOiJvcGVyYXRvciJ9", "ZmFrZXNpZ25hdHVyZQ"].join(
      ".",
    );
    const out = sanitizeErrorDetail(`401 from upstream; token=${jwt}`);
    expect(out).toContain("[REDACTED_JWT]");
    expect(out).not.toContain("eyJhbGciOiJFUzI1NiJ9");
  });

  it("redacts Bearer tokens", () => {
    const out = sanitizeErrorDetail("Authorization: Bearer abc123.def-456");
    expect(out).toBe("Authorization: Bearer [REDACTED]");
  });

  it("truncates beyond 500 chars with a marker", () => {
    const out = sanitizeErrorDetail("x".repeat(600));
    expect(out.length).toBeLessThan(520);
    expect(out.endsWith("…[truncated]")).toBe(true);
  });

  it("leaves ordinary error messages untouched", () => {
    const message = "getProductCandles: end (123) must be after start (456)";
    expect(sanitizeErrorDetail(message)).toBe(message);
  });
});

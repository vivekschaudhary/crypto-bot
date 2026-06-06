// Per Codex PR #20 round-1 BLOCKER. The errorKeyForResponse disambiguation
// matrix is the load-bearing piece of the masquerade fix from the
// 2026-06-05 canary verification retro. Without these tests a regression
// could silently re-introduce the bug: status 403 collides with multiple
// typed errors, and only the body field disambiguates correctly.

import { describe, expect, it } from "vitest";

import { errorKeyForResponse } from "@/app/setup/setup-client";

describe("setup-client errorKeyForResponse — disambiguation matrix", () => {
  describe("body-typed error takes precedence over status (the masquerade fix)", () => {
    it("403 + body.error = 'registration-disabled' → 'registration-disabled' (NOT 'origin-mismatch')", () => {
      // The exact failure mode from the 2026-06-05 retro: pre-fix,
      // /register/begin returned 403 + body { error: "registration-disabled" }
      // and the client mis-classified it as origin-mismatch. The body field
      // disambiguates correctly now.
      expect(errorKeyForResponse(403, "registration-disabled")).toBe("registration-disabled");
    });

    it("any 4xx + body.error = 'registration-disabled' → 'registration-disabled' (forward-compat)", () => {
      // Forward-compat: if some future status code returns this body field,
      // we still classify by body. Locks the contract.
      expect(errorKeyForResponse(409, "registration-disabled")).toBe("registration-disabled");
      expect(errorKeyForResponse(400, "registration-disabled")).toBe("registration-disabled");
      expect(errorKeyForResponse(500, "registration-disabled")).toBe("registration-disabled");
    });

    it("403 + body.error = 'origin-mismatch' → 'origin-mismatch' (no override needed; status-only would also work)", () => {
      expect(errorKeyForResponse(403, "origin-mismatch")).toBe("origin-mismatch");
    });
  });

  describe("status-only fallback when no typed error in body", () => {
    it("409 + null → 'registration-disabled'", () => {
      expect(errorKeyForResponse(409, null)).toBe("registration-disabled");
    });

    it("409 with no second arg → 'registration-disabled' (default param)", () => {
      expect(errorKeyForResponse(409)).toBe("registration-disabled");
    });

    it("429 + null → 'rate-limited'", () => {
      expect(errorKeyForResponse(429, null)).toBe("rate-limited");
    });

    it("403 + null → 'origin-mismatch' (default 403 path when body has no error field)", () => {
      // This is the status-only fallback — body either wasn't JSON, didn't
      // include an `error` field, or wasn't a known typed code.
      expect(errorKeyForResponse(403, null)).toBe("origin-mismatch");
    });

    it("400 + null → 'verification-failed'", () => {
      expect(errorKeyForResponse(400, null)).toBe("verification-failed");
    });
  });

  describe("unknown status falls through to 'network'", () => {
    it("500 + null → 'network'", () => {
      expect(errorKeyForResponse(500, null)).toBe("network");
    });

    it("502 + null → 'network'", () => {
      expect(errorKeyForResponse(502, null)).toBe("network");
    });

    it("418 + null → 'network'", () => {
      expect(errorKeyForResponse(418, null)).toBe("network");
    });
  });

  describe("unrecognized body typedError + status → status-based classification", () => {
    it("403 + body.error = 'some-future-code' → falls back to status-based 'origin-mismatch'", () => {
      // Unknown body codes don't short-circuit the status mapping. This is
      // important so the introduction of NEW typed errors in routes doesn't
      // accidentally upgrade them to known display keys — they'd just
      // surface via the status fallback until added to the matrix
      // explicitly.
      expect(errorKeyForResponse(403, "some-future-code")).toBe("origin-mismatch");
    });

    it("429 + body.error = 'some-future-code' → falls back to status-based 'rate-limited'", () => {
      expect(errorKeyForResponse(429, "some-future-code")).toBe("rate-limited");
    });

    it("empty string typedError treated as no typedError", () => {
      // Edge case: if the body had `error: ""`, status fallback should still
      // apply. The current implementation treats empty-string as not-matching
      // the registration-disabled comparison, which is the correct behavior.
      expect(errorKeyForResponse(403, "")).toBe("origin-mismatch");
    });
  });
});

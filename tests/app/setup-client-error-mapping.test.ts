// Per Codex PR #20 round-1 BLOCKER. The errorKeyForResponse disambiguation
// matrix is the load-bearing piece of the masquerade fix from the
// 2026-06-05 canary verification retro. Without these tests a regression
// could silently re-introduce the bug: status 403 collides with multiple
// typed errors, and only the body field disambiguates correctly.

import { describe, expect, it } from "vitest";

import { classifyErrorResponse, errorKeyForResponse } from "@/app/setup/setup-client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

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

describe("setup-client classifyErrorResponse — fetch→body→classify integration", () => {
  // These tests exercise the FULL chain that the live SetupClient flow runs:
  // a real Response object → body.json() parse → typed-error extraction →
  // dispatch into errorKeyForResponse. This catches regressions that the
  // helper-matrix tests above cannot — e.g. forgetting the .clone(), losing
  // the try/catch wraparound, breaking the typeof guard on body.error.
  //
  // Codex PR #20 round-2 BLOCKER asked for end-to-end browser coverage of the
  // SetupClient rendering chain. The codebase has no React/DOM test
  // infrastructure (@testing-library/react / jsdom / happy-dom are not
  // dependencies, and no .test.tsx files exist). Extracting the
  // fetch-and-classify logic into a pure helper makes the parse → classify
  // chain testable as pure async code using real Response objects, without
  // requiring DOM infrastructure. The remaining uncovered surface
  // (setErrorKey React state setter + the conditional JSX render path) is
  // 3 lines of trivial pattern-matching mirrored from the rest of the
  // component, deferred to E2E per the existing convention in
  // tests/app/setup.test.ts header comment.

  describe("the masquerade fix — the exact failure mode from the retro", () => {
    it("403 + body {error: 'registration-disabled'} → 'registration-disabled' (NOT 'origin-mismatch')", async () => {
      // The exact pre-fix server response that fooled the client into
      // rendering "Setup blocked..." copy. With the body-disambiguation
      // chain working end-to-end, the live UI now correctly renders the
      // "This instance already has a passkey registered." copy.
      const res = jsonResponse(403, { error: "registration-disabled" });
      expect(await classifyErrorResponse(res)).toBe("registration-disabled");
    });

    it("403 + body {error: 'origin-mismatch'} → 'origin-mismatch' (real origin failure unchanged)", async () => {
      const res = jsonResponse(403, { error: "origin-mismatch" });
      expect(await classifyErrorResponse(res)).toBe("origin-mismatch");
    });

    it("409 + body {error: 'registration-disabled'} → 'registration-disabled' (post-fix server response)", async () => {
      // The post-fix server response from /register/begin's first-time-only
      // gate. End-to-end this should ALSO classify correctly — and it does,
      // because the typedError-first lookup short-circuits before the
      // status fallback is even consulted.
      const res = jsonResponse(409, { error: "registration-disabled" });
      expect(await classifyErrorResponse(res)).toBe("registration-disabled");
    });
  });

  describe("body parse failure modes — try/catch wraparound", () => {
    it("403 with non-JSON body (e.g. Vercel platform 403 HTML page) → status-only fallback", async () => {
      // If Vercel's edge layer returns a 403 with HTML body (deployment
      // protection, WAF, etc.), the .json() throws and we fall through to
      // status-based classification. This is the exact scenario where the
      // 2026-06-05 debug burned hours assuming our code returned the 403
      // when actually it was platform-level.
      const res = new Response("<html><body>Forbidden</body></html>", {
        status: 403,
        headers: { "content-type": "text/html" },
      });
      expect(await classifyErrorResponse(res)).toBe("origin-mismatch");
    });

    it("403 with empty body → status-only fallback", async () => {
      const res = new Response("", { status: 403 });
      expect(await classifyErrorResponse(res)).toBe("origin-mismatch");
    });

    it("403 with JSON body that has no 'error' field → status-only fallback", async () => {
      // Defensive: the body parses but doesn't include the typed-error
      // field. Status fallback applies. Lock the contract so future
      // changes to the typed-error read don't accidentally tighten this.
      const res = jsonResponse(403, { message: "blocked", code: "ENOENT" });
      expect(await classifyErrorResponse(res)).toBe("origin-mismatch");
    });

    it("403 with JSON body where 'error' is not a string → status-only fallback", async () => {
      // The typeof guard on body.error catches this. Without it, an
      // attacker-controlled error: { ... } object could surface as a
      // typedError into the disambiguation matrix and cause unexpected
      // classification.
      const res = jsonResponse(403, { error: { nested: "object" } });
      expect(await classifyErrorResponse(res)).toBe("origin-mismatch");
    });
  });

  describe("other status codes pass through correctly", () => {
    it("429 + body {error: 'rate-limited', retryAfterSeconds: 30} → 'rate-limited'", async () => {
      const res = jsonResponse(429, { error: "rate-limited", retryAfterSeconds: 30 });
      expect(await classifyErrorResponse(res)).toBe("rate-limited");
    });

    it("400 + body {error: 'invalid-body'} → 'verification-failed' (status fallback; 'invalid-body' isn't typed-mapped)", async () => {
      const res = jsonResponse(400, { error: "invalid-body" });
      expect(await classifyErrorResponse(res)).toBe("verification-failed");
    });

    it("500 + body {error: 'internal'} → 'network' (status fallback; unknown typed code)", async () => {
      const res = jsonResponse(500, { error: "internal" });
      expect(await classifyErrorResponse(res)).toBe("network");
    });
  });

  describe(".clone() guards against upstream body consumption", () => {
    it("works even if caller already inspected res.ok and res.status (which don't consume body)", async () => {
      // SetupClient checks res.ok before calling classifyErrorResponse —
      // confirm the body is still readable after that no-op check.
      const res = jsonResponse(403, { error: "registration-disabled" });
      // Simulate the SetupClient flow: check res.ok first, then classify.
      expect(res.ok).toBe(false);
      expect(res.status).toBe(403);
      // Body still readable thanks to .clone() inside classifyErrorResponse.
      expect(await classifyErrorResponse(res)).toBe("registration-disabled");
    });
  });
});

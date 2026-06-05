// Per CB-1.6 AC 3 + AC 7. Mirrors the proxy.ts emit-side rules.
// Drift between this file's expectations and proxy.test.ts's expectations
// is caught here, in proxy.test.ts, or in /sign-in?next= E2E (AC 8).

import { describe, expect, it } from "vitest";
import { isSafeNextPath, safeNextOrNull } from "@/lib/auth/safe-next";

describe("isSafeNextPath", () => {
  describe("accepts safe same-origin paths", () => {
    it.each([
      ["/dashboard"],
      ["/dashboard/settings"],
      ["/dashboard?key=value"],
      ["/dashboard?key=value&other=1"],
      ["/setup"],
      ["/sign-in"],
      ["/a/b/c/d"],
      ["/"], // root path itself
      ["/x"], // single-char path
      ["/path-with-dashes"],
      ["/path_with_underscores"],
      ["/path.with.dots"],
      ["/path%20with%20encoding"],
    ])("accepts %j", (candidate) => {
      expect(isSafeNextPath(candidate)).toBe(true);
    });
  });

  describe("rejects non-string input", () => {
    it.each([
      [undefined],
      [null],
      [42],
      [true],
      [{}],
      [[]],
    ])("rejects %j", (candidate) => {
      expect(isSafeNextPath(candidate)).toBe(false);
    });
  });

  describe("rejects empty string", () => {
    it("rejects ''", () => {
      expect(isSafeNextPath("")).toBe(false);
    });
  });

  describe("rejects values not starting with /", () => {
    it.each([
      ["dashboard"],
      ["//dashboard"], // protocol-relative (also covered by mid-path `//` rule below)
      ["https://evil.example"],
      ["http://evil.example"],
      ["evil.example/path"],
      ["./dashboard"],
      ["../dashboard"],
      ["?next=hijack"],
      ["#fragment"],
    ])("rejects %j", (candidate) => {
      expect(isSafeNextPath(candidate)).toBe(false);
    });
  });

  describe("rejects `//` ANYWHERE in the path (M2 audit closure — covers URL-constructor `/\\` normalization)", () => {
    // proxy.ts emits with the same rule. The URL constructor normalizes
    // backslash to forward-slash, so `/dashboard/\evil` arrives here as
    // `/dashboard//evil`. Rejecting `//` everywhere covers both attack
    // vectors with one rule.
    it.each([
      ["//dashboard"],
      ["//evil.example/path"],
      ["/dashboard//evil"], // mid-path
      ["/dashboard/sub//deeper"],
      ["/a//b"],
      ["/path//"], // trailing
      ["//"], // bare double-slash
    ])("rejects %j", (candidate) => {
      expect(isSafeNextPath(candidate)).toBe(false);
    });
  });

  describe("rejects backslash anywhere", () => {
    it.each([
      ["/path\\with\\backslash"],
      ["/\\evil.example"],
      ["/dashboard\\..\\admin"],
      ["\\"],
    ])("rejects %j", (candidate) => {
      expect(isSafeNextPath(candidate)).toBe(false);
    });
  });

  describe("rejects protocol-like prefixes (`:` in first segment)", () => {
    it.each([
      ["javascript:alert(1)"],
      ["data:text/html,<script>alert(1)</script>"],
      ["vbscript:msgbox(1)"],
      ["mailto:operator@example.com"],
      ["/javascript:alert(1)"], // starts with `/` but `:` before next `/`
      ["/data:text/html"], // same shape
      ["/x:y"], // generic `:` in first segment
    ])("rejects %j", (candidate) => {
      expect(isSafeNextPath(candidate)).toBe(false);
    });
  });

  describe("accepts `:` outside the first path segment", () => {
    it.each([
      ["/dashboard/x:y"], // `:` after first `/`
      ["/path/file:1"], // line-number-style suffix
      ["/api/auth/callback?provider=google:oauth"], // `:` in query string
    ])("accepts %j", (candidate) => {
      expect(isSafeNextPath(candidate)).toBe(true);
    });
  });
});

describe("safeNextOrNull", () => {
  it("returns the candidate when safe", () => {
    expect(safeNextOrNull("/dashboard")).toBe("/dashboard");
    expect(safeNextOrNull("/dashboard?a=1")).toBe("/dashboard?a=1");
  });

  it("returns null when unsafe", () => {
    expect(safeNextOrNull("//evil.example")).toBeNull();
    expect(safeNextOrNull("javascript:alert(1)")).toBeNull();
    expect(safeNextOrNull(undefined)).toBeNull();
    expect(safeNextOrNull(null)).toBeNull();
    expect(safeNextOrNull("")).toBeNull();
  });
});

// CB-8.1 — unit test for the pure collapse-flag parser. The interactive toggle
// (DOM attr + localStorage + aria) is verified by the Codex e2e (CB-3.3 #9).

import { describe, expect, it } from "vitest";

import { parseCollapsed } from "@/app/dashboard/sidebar-toggle";

describe("parseCollapsed", () => {
  it('"1" → collapsed', () => {
    expect(parseCollapsed("1")).toBe(true);
  });
  it("absent / 0 / anything else → expanded (default)", () => {
    expect(parseCollapsed("0")).toBe(false);
    expect(parseCollapsed(null)).toBe(false);
    expect(parseCollapsed("yes")).toBe(false);
    expect(parseCollapsed("")).toBe(false);
  });
});

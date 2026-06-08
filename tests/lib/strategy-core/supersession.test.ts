// Unit tests for `lib/strategy-core/supersession.ts`.

import { describe, expect, it } from "vitest";

import {
  assertSupersessionOnlyUpdate,
  superseed,
} from "@/lib/strategy-core/supersession";
import { StrategyIdSchema } from "@/lib/strategy-core/types";

// Two 26-char ULID-shaped strings; parsed through the schema so the branded
// type alignment satisfies TypeScript.
// 26-char ULIDs (Crockford base32 = 26 chars exact)
const OLD_ID = StrategyIdSchema.parse("01H8XGJWBWBAQ4N7CHR3M9OLDX");
const NEW_ID = StrategyIdSchema.parse("01H8XGJWBWBAQ4N7CHR3M9NEWA");

describe("superseed — pure function; emits the plan for caller to apply", () => {
  it("happy path: returns newRow + oldRowSupersessionUpdate referencing the new id", () => {
    const plan = superseed({
      oldStrategyId: OLD_ID,
      newRow: { id: NEW_ID, name: "v2" },
    });
    expect(plan.newRow).toEqual({ id: NEW_ID, name: "v2" });
    expect(plan.oldRowSupersessionUpdate).toEqual({
      id: OLD_ID,
      supersededByStrategyId: NEW_ID,
    });
  });

  it("first-time authoring: oldStrategyId null → oldRowSupersessionUpdate null", () => {
    const plan = superseed({
      oldStrategyId: null,
      newRow: { id: NEW_ID, name: "first strategy ever" },
    });
    expect(plan.newRow).toEqual({ id: NEW_ID, name: "first strategy ever" });
    expect(plan.oldRowSupersessionUpdate).toBeNull();
  });
});

describe("assertSupersessionOnlyUpdate — guards the append-only invariant", () => {
  it("accepts an update touching ONLY supersededByStrategyId", () => {
    expect(() =>
      assertSupersessionOnlyUpdate(["supersededByStrategyId"]),
    ).not.toThrow();
  });

  it("accepts an empty update (no-op)", () => {
    expect(() => assertSupersessionOnlyUpdate([])).not.toThrow();
  });

  it("REJECTS updates that touch strategy content fields", () => {
    expect(() => assertSupersessionOnlyUpdate(["name"])).toThrow(
      /append-only invariant violated/i,
    );
    expect(() =>
      assertSupersessionOnlyUpdate(["supersededByStrategyId", "positionSizeUsd"]),
    ).toThrow(/append-only invariant violated/i);
    expect(() => assertSupersessionOnlyUpdate(["entryRules"])).toThrow(
      /append-only invariant violated/i,
    );
  });
});

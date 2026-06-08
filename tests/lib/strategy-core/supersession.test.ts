// Unit tests for `lib/strategy-core/supersession.ts`.
// Round-1 BLOCKER 2 fix: contract is now `supersede({oldStrategyId, newPayload})`
// → `{newRow, oldRowSupersessionUpdate: {id, superseded_by_strategy_id}}`.

import { describe, expect, it } from "vitest";

import {
  assertSupersessionOnlyUpdate,
  supersede,
} from "@/lib/strategy-core/supersession";
import { StrategyIdSchema } from "@/lib/strategy-core/types";

// 26-char ULIDs (Crockford base32 = 26 chars exact)
const OLD_ID = StrategyIdSchema.parse("01H8XGJWBWBAQ4N7CHR3M9OLDX");
const NEW_ID = StrategyIdSchema.parse("01H8XGJWBWBAQ4N7CHR3M9NEWA");

describe("supersede — pure function; emits the plan for caller to apply", () => {
  it("happy path: returns newRow + oldRowSupersessionUpdate referencing the new id (snake_case)", () => {
    const plan = supersede({
      oldStrategyId: OLD_ID,
      newPayload: { id: NEW_ID, name: "v2" },
    });
    expect(plan.newRow).toEqual({ id: NEW_ID, name: "v2" });
    expect(plan.oldRowSupersessionUpdate).toEqual({
      id: OLD_ID,
      superseded_by_strategy_id: NEW_ID,
    });
  });

  it("first-time authoring: oldStrategyId null → oldRowSupersessionUpdate null", () => {
    const plan = supersede({
      oldStrategyId: null,
      newPayload: { id: NEW_ID, name: "first strategy ever" },
    });
    expect(plan.newRow).toEqual({ id: NEW_ID, name: "first strategy ever" });
    expect(plan.oldRowSupersessionUpdate).toBeNull();
  });
});

describe("assertSupersessionOnlyUpdate — guards the append-only invariant (snake_case field name)", () => {
  it("accepts an update touching ONLY superseded_by_strategy_id", () => {
    expect(() =>
      assertSupersessionOnlyUpdate(["superseded_by_strategy_id"]),
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
      assertSupersessionOnlyUpdate(["superseded_by_strategy_id", "position_size_usd"]),
    ).toThrow(/append-only invariant violated/i);
    expect(() => assertSupersessionOnlyUpdate(["entry_rules"])).toThrow(
      /append-only invariant violated/i,
    );
  });
});

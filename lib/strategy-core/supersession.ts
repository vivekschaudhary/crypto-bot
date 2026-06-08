// `lib/strategy-core/supersession.ts` — append-only versioning helpers.
//
// CB-3.0 (FIRST CB-3 STORY) per bet architecture Decision #4. Pure functions;
// DB-agnostic; the caller wires the actual `INSERT` / `UPDATE` against
// whichever Postgres client they use.
//
// Versioning model (per CB-3 brief PM DRI Decision #3 + architecture
// Decision #4): revising a strategy creates a NEW row + the old row's
// `supersededByStrategyId` gets set to the new row's id. The strategy
// CONTENT is never updated in place — only the supersession FK is allowed
// to be touched after creation. This preserves the strategy-at-decision-time
// context for CB-5's dashboard.

import type { StrategyId } from "./types";

/**
 * Result shape of `superseed()`. Callers apply these to the DB in two
 * statements (INSERT new row; UPDATE old row's superseded_by FK), ideally
 * in one transaction so a partial failure doesn't leave dangling state.
 */
export interface SupersessionPlan<TNewPayload> {
  newRow: TNewPayload;
  oldRowSupersessionUpdate: {
    id: StrategyId;
    supersededByStrategyId: StrategyId;
  } | null;
}

/**
 * Build a supersession plan. Pure; no I/O.
 *
 * @param oldStrategyId The id of the strategy being revised. Pass `null` if
 *                      this is the operator's FIRST strategy (no prior to
 *                      supersede); the result's `oldRowSupersessionUpdate`
 *                      will be `null` and the caller skips the UPDATE.
 * @param newRow        The fully-formed new strategy row (including the
 *                      caller-assigned new id). strategy-core stays
 *                      DB-agnostic — the caller assigns the id before
 *                      calling.
 * @returns A `SupersessionPlan` with `newRow` (echoed for caller convenience
 *          via chaining) + the optional `oldRowSupersessionUpdate`.
 */
export function superseed<TNewPayload extends { id: StrategyId }>(args: {
  oldStrategyId: StrategyId | null;
  newRow: TNewPayload;
}): SupersessionPlan<TNewPayload> {
  return {
    newRow: args.newRow,
    oldRowSupersessionUpdate:
      args.oldStrategyId === null
        ? null
        : {
            id: args.oldStrategyId,
            supersededByStrategyId: args.newRow.id,
          },
  };
}

/**
 * Assert that a proposed update to a strategy row is supersession-only —
 * i.e., touches only the `supersededByStrategyId` column. Throws if the
 * caller attempts to mutate any strategy content field.
 *
 * The bet architecture's append-only rule (Decision #4) says:
 *   "Revising a strategy: INSERT a new row + UPDATE the old row's
 *    supersededByStrategyId (this is the ONE allowed UPDATE — supersession-
 *    only; never strategy content)."
 *
 * This helper enforces it at the application layer. The DB-level
 * enforcement (CHECK constraint or trigger) is out of scope for CB-3.0
 * (lives in CB-3.2 migration story).
 */
export function assertSupersessionOnlyUpdate(
  proposedFieldsToUpdate: readonly string[],
): void {
  const ALLOWED = new Set(["supersededByStrategyId"]);
  const disallowed = proposedFieldsToUpdate.filter((f) => !ALLOWED.has(f));
  if (disallowed.length > 0) {
    throw new Error(
      `[strategy-core/supersession] Append-only invariant violated: ` +
        `update touched non-supersession fields ${JSON.stringify(disallowed)}. ` +
        `Strategy content is immutable post-creation; revise by INSERT + supersession FK update.`,
    );
  }
}

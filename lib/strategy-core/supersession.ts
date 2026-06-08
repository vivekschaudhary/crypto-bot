// `lib/strategy-core/supersession.ts` — append-only versioning helpers.
//
// CB-3.0 (FIRST CB-3 STORY) per bet architecture Decision #4 + story AC 4.
// Pure functions; DB-agnostic; the caller wires the actual `INSERT` /
// `UPDATE` against whichever Postgres client they use.
//
// Versioning model (per CB-3 brief PM DRI Decision #3 + architecture
// Decision #4): revising a strategy creates a NEW row + the old row's
// `superseded_by_strategy_id` gets set to the new row's id. The strategy
// CONTENT is never updated in place — only the supersession FK is allowed
// to be touched after creation. This preserves the strategy-at-decision-time
// context for CB-5's dashboard.
//
// CONTRACT (per AC 4 — round-1 BLOCKER fix to match approved shape):
//   * Input:  { oldStrategyId, newPayload }
//   * Output: { newRow: Strategy, oldRowSupersessionUpdate: {id, superseded_by_strategy_id} | null }
//
// `newPayload` is the input contract name; `newRow` is the output contract
// name (the supersession plan emits the row to insert + the FK update on
// the old row).

import type { StrategyId } from "./types";

/**
 * Result shape of `supersede()`. Callers apply these to the DB in two
 * statements (INSERT new row; UPDATE old row's `superseded_by_strategy_id`),
 * ideally in one transaction so a partial failure doesn't leave dangling
 * state.
 *
 * `oldRowSupersessionUpdate.superseded_by_strategy_id` uses snake_case to
 * match the DB column name + the snake_case contract across strategy-core
 * (AC 6 + Tech notes Decision #1).
 */
export interface SupersessionPlan<TNewPayload> {
  newRow: TNewPayload;
  oldRowSupersessionUpdate: {
    id: StrategyId;
    superseded_by_strategy_id: StrategyId;
  } | null;
}

/**
 * Build a supersession plan. Pure; no I/O.
 *
 * @param oldStrategyId The id of the strategy being revised. Pass `null` if
 *                      this is the operator's FIRST strategy (no prior to
 *                      supersede); the result's `oldRowSupersessionUpdate`
 *                      will be `null` and the caller skips the UPDATE.
 * @param newPayload    The fully-formed new strategy row (including the
 *                      caller-assigned new id). strategy-core stays
 *                      DB-agnostic — the caller assigns the id before
 *                      calling.
 * @returns A `SupersessionPlan` with `newRow` (echoed from `newPayload` for
 *          caller convenience via chaining) + the optional
 *          `oldRowSupersessionUpdate`.
 */
export function supersede<TNewPayload extends { id: StrategyId }>(args: {
  oldStrategyId: StrategyId | null;
  newPayload: TNewPayload;
}): SupersessionPlan<TNewPayload> {
  return {
    newRow: args.newPayload,
    oldRowSupersessionUpdate:
      args.oldStrategyId === null
        ? null
        : {
            id: args.oldStrategyId,
            superseded_by_strategy_id: args.newPayload.id,
          },
  };
}

/**
 * Assert that a proposed update to a strategy row is supersession-only —
 * i.e., touches only the `superseded_by_strategy_id` column. Throws if the
 * caller attempts to mutate any strategy content field.
 *
 * The bet architecture's append-only rule (Decision #4) says:
 *   "Revising a strategy: INSERT a new row + UPDATE the old row's
 *    superseded_by_strategy_id (this is the ONE allowed UPDATE —
 *    supersession-only; never strategy content)."
 *
 * This helper enforces it at the application layer. The DB-level
 * enforcement (CHECK constraint or trigger) is out of scope for CB-3.0
 * (lives in CB-3.2 migration story).
 */
export function assertSupersessionOnlyUpdate(
  proposedFieldsToUpdate: readonly string[],
): void {
  const ALLOWED = new Set(["superseded_by_strategy_id"]);
  const disallowed = proposedFieldsToUpdate.filter((f) => !ALLOWED.has(f));
  if (disallowed.length > 0) {
    throw new Error(
      `[strategy-core/supersession] Append-only invariant violated: ` +
        `update touched non-supersession fields ${JSON.stringify(disallowed)}. ` +
        `Strategy content is immutable post-creation; revise by INSERT + supersession FK update.`,
    );
  }
}

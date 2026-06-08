// `lib/strategy-core/form-schema.ts` — Zod schema for the strategy authoring
// form payload.
//
// CB-3.0 (FIRST CB-3 STORY). Consumed by CB-3.3's form action (saveStrategy)
// to validate the form submission BEFORE invoking `validateStrategyPayload`
// from `validate.ts`. The two layers are complementary:
//   * form-schema.ts — Zod shape validation; catches type mismatches +
//                      structural issues; the form UI ties errors to fields.
//   * validate.ts    — universal business rule validation; cross-field
//                      checks (entry RSI < exit RSI) + range enforcement
//                      that's not expressible at shape level.
//
// FIELD NAMING CONVENTION (round-2 BLOCKER fix):
//   * TOP-LEVEL form fields use snake_case (matches DB column names).
//   * INNER jsonb shapes (selected_assets array items, entry_rules,
//     exit_rules contents) use camelCase per the docs (architecture
//     Decision #4 + AssetSchema/EntryRulesSchema/ExitRulesSchema in
//     types.ts).
// See types.ts top-of-file comment for the full split rationale.

import { z } from "zod";

import {
  AssetSchema,
  EntryRulesSchema,
  ExitRulesSchema,
} from "./types";

/**
 * Zod schema for the form-submitted payload before id/created_at/created_
 * by_user_id are assigned (those come from the server action; form doesn't
 * submit them).
 *
 * Cardinality of `selected_assets` (1-5) is enforced here so the form UI's
 * "select 1-5 cryptos from top-5" rule surfaces immediately; the same rule
 * is also re-checked in `validateStrategyPayload` for defense-in-depth.
 */
export const StrategyFormPayloadSchema = z.object({
  name: z.string().min(1).max(120),
  asset_class: z.string().min(1),
  selected_assets: z.array(AssetSchema).min(1).max(5),
  entry_rules: EntryRulesSchema,
  exit_rules: ExitRulesSchema,
  position_size_usd: z.number().positive(),
  per_session_buy_count_cap: z.number().int().positive(),
  per_session_dollar_cap: z.number().positive(),
  // If revising an existing strategy, the form submits the old id so the
  // server action can wire supersession. First-time authoring submits null.
  supersedes_strategy_id: z.string().min(26).max(26).nullable(),
});

export type StrategyFormPayload = z.infer<typeof StrategyFormPayloadSchema>;

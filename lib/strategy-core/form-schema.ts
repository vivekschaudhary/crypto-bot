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
// Form actions wire both: Zod parse FIRST (typed payload), then validate
// SECOND (business rules), surfacing all errors to the form.

import { z } from "zod";

import {
  AssetSchema,
  EntryRulesSchema,
  ExitRulesSchema,
} from "./types";

/**
 * Zod schema for the form-submitted payload before id/createdAt/createdByUserId
 * are assigned (those come from the server action; form doesn't submit them).
 *
 * Cardinality of `selectedAssets` (1-5) is enforced here so the form UI's
 * "select 1-5 cryptos from top-5" rule surfaces immediately; the same rule
 * is also re-checked in `validateStrategyPayload` for defense-in-depth.
 */
export const StrategyFormPayloadSchema = z.object({
  name: z.string().min(1).max(120),
  assetClass: z.string().min(1),
  selectedAssets: z.array(AssetSchema).min(1).max(5),
  entryRules: EntryRulesSchema,
  exitRules: ExitRulesSchema,
  positionSizeUsd: z.number().positive(),
  perSessionBuyCountCap: z.number().int().positive(),
  perSessionDollarCap: z.number().positive(),
  // If revising an existing strategy, the form submits the old id so the
  // server action can wire supersession. First-time authoring submits null.
  supersedesStrategyId: z.string().min(26).max(26).nullable(),
});

export type StrategyFormPayload = z.infer<typeof StrategyFormPayloadSchema>;

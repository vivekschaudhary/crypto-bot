// `lib/strategy-core/types.ts` — portable type contracts for strategy authoring.
//
// CB-3.0 (FIRST CB-3 STORY) — pluggability primitive per CB-3 brief DRI
// Decision #6 + bet architecture Decision #1.
//
// ARCHITECTURAL INVARIANT: this file (and all of `lib/strategy-core/`) has
// ZERO dependencies on `lib/coinbase/*`, `lib/env/*`, `lib/db/*`, or any
// in-repo singleton. Verified mechanically by:
//   * tests/lib/strategy-core/no-coupling.test.ts (transitive walk; forbids
//     ANY @/lib/... import outside strategy-core)
//   * tests/lib/strategy-core/no-live-mode.test.ts (LIVE_MODE-free invariant)
//
// FIELD NAMING CONVENTION — round-2 BLOCKER fix:
//
//   * TOP-LEVEL row fields (Strategy + StrategyFormPayload) use snake_case
//     to match the `strategies` DB column names from bet architecture
//     Decision #4 (selected_assets, entry_rules, exit_rules,
//     position_size_usd, per_session_buy_count_cap, per_session_dollar_cap,
//     created_at, created_by_user_id, superseded_by_strategy_id, asset_class).
//
//   * INNER jsonb shapes (Asset, EntryRules, ExitRules contents) use
//     camelCase to match the approved docs. Specifically, the architecture's
//     DDL comment says: `selected_assets jsonb NOT NULL, -- array of
//     {assetClass, identifier}; validated app-layer`. The inner shape is
//     a TS/JSON convention; the DB column name is a Postgres convention.
//     Mixed-but-principled split: row-level structure = snake_case,
//     within-jsonb-object structure = camelCase.
//
// Designed for extraction to the `@vc1023/strategy-core` npm package when
// the operator's equity app is ready to consume (per the @vc1023/passkey-2fa
// precedent — extract when the second consumer materializes; build clean now).

import { z } from "zod";

// ──────────────────────────────────────────────────────────────────────────
// Branded ULID type aliases (Engineer DRI Decision #1)
// ──────────────────────────────────────────────────────────────────────────
// ULIDs are Crockford base32, 26 chars. Stored as Postgres `text` per
// foundation architecture § Identity strategy. Branding prevents accidental
// mixing of `StrategyId` and `UserId` at the type level.

export const StrategyIdSchema = z.string().min(26).max(26).brand<"StrategyId">();
export type StrategyId = z.infer<typeof StrategyIdSchema>;

export const UserIdSchema = z.string().min(26).max(26).brand<"UserId">();
export type UserId = z.infer<typeof UserIdSchema>;

// ──────────────────────────────────────────────────────────────────────────
// AssetClass (Engineer DRI Decision #2)
// ──────────────────────────────────────────────────────────────────────────
// Open-ended string, NOT z.enum(). Future adapters add their own class
// strings without re-publishing strategy-core.

export const AssetClassSchema = z.string().min(1);
export type AssetClass = z.infer<typeof AssetClassSchema>;

// ──────────────────────────────────────────────────────────────────────────
// Asset — the abstract pair (assetClass, identifier)
// ──────────────────────────────────────────────────────────────────────────
// camelCase inner shape per bet architecture Decision #4 comment:
//   "selected_assets jsonb NOT NULL, -- array of {assetClass, identifier}"
// The top-level COLUMN is snake_case (`selected_assets`); the inner OBJECT
// is camelCase. Both true at once; not a contradiction.

export const AssetSchema = z.object({
  assetClass: AssetClassSchema,
  identifier: z.string().min(1),
});
export type Asset = z.infer<typeof AssetSchema>;

// ──────────────────────────────────────────────────────────────────────────
// EntryRules + ExitRules (signal config — camelCase inner shape)
// ──────────────────────────────────────────────────────────────────────────
// MA period is a strict set per Engineer DRI Decision #3 — z.union of
// literals preserves Zod's discriminated-union inference + TypeScript
// narrowing on consumers. Stored within jsonb columns; inner field names
// use camelCase per the same principle as Asset.

export const MaPeriodSchema = z.union([
  z.literal(5),
  z.literal(10),
  z.literal(20),
  z.literal(50),
]);
export type MaPeriod = z.infer<typeof MaPeriodSchema>;

export const EntryRulesSchema = z.object({
  rsiThreshold: z.number().min(0).max(100),
  maPeriod: MaPeriodSchema,
  // Optional MA reinforcement: only buy when price < MA(period)
  maReinforcement: z.boolean().optional(),
});
export type EntryRules = z.infer<typeof EntryRulesSchema>;

export const ExitRulesSchema = z.object({
  rsiThreshold: z.number().min(0).max(100),
  minProfitPct: z.number().min(0),
  // Fraction of position to sell when exit fires; 0..1 (e.g., 0.5 = sell half)
  sellFraction: z.number().min(0).max(1),
});
export type ExitRules = z.infer<typeof ExitRulesSchema>;

// ──────────────────────────────────────────────────────────────────────────
// Strategy — the full row shape (top-level fields snake_case = DB columns)
// ──────────────────────────────────────────────────────────────────────────
// Field names match the DB columns from bet architecture Decision #4.
// Inner jsonb shapes (selected_assets, entry_rules, exit_rules) are
// camelCase per the convention split documented at the top.

export const StrategySchema = z.object({
  id: StrategyIdSchema,
  name: z.string().min(1).max(120),
  asset_class: AssetClassSchema,
  selected_assets: z.array(AssetSchema).min(1).max(5),
  entry_rules: EntryRulesSchema,
  exit_rules: ExitRulesSchema,
  position_size_usd: z.number().positive(),
  per_session_buy_count_cap: z.number().int().positive(),
  per_session_dollar_cap: z.number().positive(),
  created_at: z.date(),
  created_by_user_id: UserIdSchema,
  superseded_by_strategy_id: StrategyIdSchema.nullable(),
});
export type Strategy = z.infer<typeof StrategySchema>;

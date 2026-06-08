// `lib/strategy-core/types.ts` — portable type contracts for strategy authoring.
//
// CB-3.0 (FIRST CB-3 STORY) — pluggability primitive per CB-3 brief DRI
// Decision #6 + bet architecture Decision #1.
//
// ARCHITECTURAL INVARIANT: this file (and all of `lib/strategy-core/`) has
// ZERO dependencies on `lib/coinbase/*`, `lib/env/*`, `lib/db/*`, or any
// in-repo singleton. Verified mechanically by:
//   * tests/lib/strategy-core/no-coupling.test.ts (forbids ANY @/lib/... import)
//   * tests/lib/strategy-core/no-live-mode.test.ts (LIVE_MODE-free invariant)
//
// FIELD NAMING — snake_case across the wire/store contract.
// Per CB-3.0 story AC 6 + Tech notes Decision #1 ("match the DB column
// shape from bet architecture Decision #4 exactly"). The Strategy +
// EntryRules + ExitRules + Asset shapes serialize/persist as snake_case
// to match the `strategies` DB table's column names + the form's
// submission payload. No camelCase ↔ snake_case translation layer needed
// at any boundary (form → server action → Zod → DB) — the contract is
// uniform.
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
// mixing of `StrategyId` and `UserId` at the type level — passing a user
// uuid where a strategy id is expected fails to compile.

export const StrategyIdSchema = z.string().min(26).max(26).brand<"StrategyId">();
export type StrategyId = z.infer<typeof StrategyIdSchema>;

export const UserIdSchema = z.string().min(26).max(26).brand<"UserId">();
export type UserId = z.infer<typeof UserIdSchema>;

// ──────────────────────────────────────────────────────────────────────────
// AssetClass (Engineer DRI Decision #2)
// ──────────────────────────────────────────────────────────────────────────
// Open-ended string, NOT z.enum(). Future adapters add their own class
// strings without re-publishing strategy-core. Each adapter declares its
// `asset_class` constant at the adapter level; code that needs to dispatch
// uses a discriminated union over the SET of installed adapters at runtime.
//
// Known values at MVP scope: "crypto-coinbase", "equity-mock" (test only).
// Future: "equity-alpaca", "equity-tradier", "futures-deribit", etc.

export const AssetClassSchema = z.string().min(1);
export type AssetClass = z.infer<typeof AssetClassSchema>;

// ──────────────────────────────────────────────────────────────────────────
// Asset — the abstract pair (asset_class, identifier)
// ──────────────────────────────────────────────────────────────────────────
// `identifier` is the external-system ID for this asset (Coinbase product_id
// for crypto-coinbase; broker symbol for equity). Opaque to strategy-core;
// adapters parse/validate per asset class.

export const AssetSchema = z.object({
  asset_class: AssetClassSchema,
  identifier: z.string().min(1),
});
export type Asset = z.infer<typeof AssetSchema>;

// ──────────────────────────────────────────────────────────────────────────
// EntryRules + ExitRules (signal config)
// ──────────────────────────────────────────────────────────────────────────
// Indicator math is universal across asset classes (RSI on BTC = RSI on AAPL).
// MA period is a strict set per Engineer DRI Decision #3 — z.union of
// literals preserves Zod's discriminated-union inference + TypeScript
// narrowing on consumers.

export const MaPeriodSchema = z.union([
  z.literal(5),
  z.literal(10),
  z.literal(20),
  z.literal(50),
]);
export type MaPeriod = z.infer<typeof MaPeriodSchema>;

export const EntryRulesSchema = z.object({
  rsi_threshold: z.number().min(0).max(100),
  ma_period: MaPeriodSchema,
  // Optional MA reinforcement: only buy when price < MA(period)
  ma_reinforcement: z.boolean().optional(),
});
export type EntryRules = z.infer<typeof EntryRulesSchema>;

export const ExitRulesSchema = z.object({
  rsi_threshold: z.number().min(0).max(100),
  min_profit_pct: z.number().min(0),
  // Fraction of position to sell when exit fires; 0..1 (e.g., 0.5 = sell half)
  sell_fraction: z.number().min(0).max(1),
});
export type ExitRules = z.infer<typeof ExitRulesSchema>;

// ──────────────────────────────────────────────────────────────────────────
// Strategy — the full row shape (mirrors `strategies` DB table columns)
// ──────────────────────────────────────────────────────────────────────────
// Field names match the DB columns from bet architecture Decision #4
// (ULIDs as text; selected_assets as jsonb array of Asset; rules as jsonb).
// Append-only at the application layer — revisions create new rows with
// `superseded_by_strategy_id` linking back.

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

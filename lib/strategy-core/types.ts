// `lib/strategy-core/types.ts` — portable type contracts for strategy authoring.
//
// CB-3.0 (FIRST CB-3 STORY) — pluggability primitive per CB-3 brief DRI
// Decision #6 + bet architecture Decision #1.
//
// ARCHITECTURAL INVARIANT: this file (and all of `lib/strategy-core/`) has
// ZERO dependencies on `lib/coinbase/*`, `lib/env/*`, `lib/db/*`, or any
// in-repo singleton. Verified mechanically by:
//   * tests/lib/strategy-core/no-coupling.test.ts (regex scan of imports)
//   * tests/lib/strategy-core/no-live-mode.test.ts (LIVE_MODE-free invariant)
// If a future contributor needs to import from one of those modules into
// strategy-core, the architectural pivot needs a brief amendment FIRST.
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
//
// Pattern: z.string().min(26).max(26).brand<"Tag">() — the brand is a
// phantom type; no runtime overhead.

export const StrategyIdSchema = z.string().min(26).max(26).brand<"StrategyId">();
export type StrategyId = z.infer<typeof StrategyIdSchema>;

export const UserIdSchema = z.string().min(26).max(26).brand<"UserId">();
export type UserId = z.infer<typeof UserIdSchema>;

// ──────────────────────────────────────────────────────────────────────────
// AssetClass (Engineer DRI Decision #2)
// ──────────────────────────────────────────────────────────────────────────
// Open-ended string, NOT z.enum(). Future adapters add their own class
// strings without re-publishing strategy-core. Each adapter declares its
// `assetClass` constant at the adapter level; code that needs to dispatch
// uses a discriminated union over the SET of installed adapters at runtime.
//
// Known values at MVP scope: "crypto-coinbase", "equity-mock" (test only).
// Future: "equity-alpaca", "equity-tradier", "futures-deribit", etc.

export const AssetClassSchema = z.string().min(1);
export type AssetClass = z.infer<typeof AssetClassSchema>;

// ──────────────────────────────────────────────────────────────────────────
// Asset — the abstract pair (assetClass, identifier)
// ──────────────────────────────────────────────────────────────────────────
// `identifier` is the external-system ID for this asset (Coinbase product_id
// for crypto-coinbase; broker symbol for equity). Opaque to strategy-core;
// adapters parse/validate per asset class.

export const AssetSchema = z.object({
  assetClass: AssetClassSchema,
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
// Strategy — the full row shape
// ──────────────────────────────────────────────────────────────────────────
// Matches the `strategies` DB schema from bet architecture Decision #4
// (ULIDs as text; selected_assets as jsonb array of Asset; rules as jsonb).
// Append-only at the application layer — revisions create new rows with
// `supersededByStrategyId` linking back.

export const StrategySchema = z.object({
  id: StrategyIdSchema,
  name: z.string().min(1).max(120),
  assetClass: AssetClassSchema,
  selectedAssets: z.array(AssetSchema).min(1).max(5),
  entryRules: EntryRulesSchema,
  exitRules: ExitRulesSchema,
  positionSizeUsd: z.number().positive(),
  perSessionBuyCountCap: z.number().int().positive(),
  perSessionDollarCap: z.number().positive(),
  createdAt: z.date(),
  createdByUserId: UserIdSchema,
  supersededByStrategyId: StrategyIdSchema.nullable(),
});
export type Strategy = z.infer<typeof StrategySchema>;

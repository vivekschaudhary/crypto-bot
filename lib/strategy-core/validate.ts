// `lib/strategy-core/validate.ts` — universal rule validation.
//
// CB-3.0 (FIRST CB-3 STORY). Pure function; no I/O; no Coinbase coupling.
// Validates the form-submitted payload against ALL the documented universal
// rules. Returns a discriminated-union result so callers can branch on
// success/failure without throwing.
//
// Every false-path has its own error code. The form UI (CB-3.3) translates
// codes to inline-error display; the bot runtime (CB-4) can also consume
// the codes for richer log emission.

import { z } from "zod";

import {
  EntryRulesSchema,
  ExitRulesSchema,
  AssetSchema,
  type EntryRules,
  type ExitRules,
  type Asset,
} from "./types";

// ──────────────────────────────────────────────────────────────────────────
// Error codes (exported as typed const for future doc generation)
// ──────────────────────────────────────────────────────────────────────────

export const VALIDATION_ERROR_CODES = [
  "ENTRY_RSI_OUT_OF_RANGE",
  "EXIT_RSI_OUT_OF_RANGE",
  "MA_PERIOD_INVALID",
  "ENTRY_RSI_NOT_LESS_THAN_EXIT_RSI",
  "POSITION_SIZE_USD_NOT_POSITIVE",
  "PER_SESSION_BUY_COUNT_CAP_NOT_POSITIVE",
  "PER_SESSION_DOLLAR_CAP_NOT_POSITIVE",
  "SELECTED_ASSETS_COUNT_OUT_OF_RANGE",
  "SHAPE_INVALID",
] as const;
export type ValidationErrorCode = (typeof VALIDATION_ERROR_CODES)[number];

export interface ValidationError {
  code: ValidationErrorCode;
  path: string;
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: ValidationError[] };

// ──────────────────────────────────────────────────────────────────────────
// Strategy payload schema (input to validateStrategyPayload)
// ──────────────────────────────────────────────────────────────────────────
// This is the shape the form action submits — pre-ULID-assignment + pre-
// supersession-resolution. The save action wires id/createdAt/createdByUserId
// after validation.

const StrategyPayloadSchema = z.object({
  name: z.string().min(1).max(120),
  assetClass: z.string().min(1),
  selectedAssets: z.array(AssetSchema),
  entryRules: EntryRulesSchema,
  exitRules: ExitRulesSchema,
  positionSizeUsd: z.number(),
  perSessionBuyCountCap: z.number(),
  perSessionDollarCap: z.number(),
});
export type StrategyPayload = z.infer<typeof StrategyPayloadSchema>;

// ──────────────────────────────────────────────────────────────────────────
// validateStrategyPayload — the load-bearing function
// ──────────────────────────────────────────────────────────────────────────

export function validateStrategyPayload(
  input: unknown,
): ValidationResult<StrategyPayload> {
  // Step 1: shape validation via Zod. If shape is wrong, return SHAPE_INVALID
  // with the Zod issue paths so the form UI can surface field-level errors.
  const parsed = StrategyPayloadSchema.safeParse(input);
  if (!parsed.success) {
    const errors: ValidationError[] = parsed.error.issues.map((issue) => ({
      code: "SHAPE_INVALID",
      path: issue.path.join("."),
      message: issue.message,
    }));
    return { ok: false, errors };
  }

  // Step 2: business-rule validation. Shape is already correct; now apply
  // every universal rule + collect all violations (NOT short-circuit on
  // first failure — operator wants to see all errors at once).
  const value = parsed.data;
  const errors: ValidationError[] = [];

  // Rule: entry RSI threshold in [0, 100]
  // (Zod's EntryRulesSchema enforces this at shape-validation; this branch
  // exists only if a caller bypasses the schema. Defense-in-depth.)
  if (value.entryRules.rsiThreshold < 0 || value.entryRules.rsiThreshold > 100) {
    errors.push({
      code: "ENTRY_RSI_OUT_OF_RANGE",
      path: "entryRules.rsiThreshold",
      message: "Entry RSI threshold must be in [0, 100]",
    });
  }

  // Rule: exit RSI threshold in [0, 100]
  if (value.exitRules.rsiThreshold < 0 || value.exitRules.rsiThreshold > 100) {
    errors.push({
      code: "EXIT_RSI_OUT_OF_RANGE",
      path: "exitRules.rsiThreshold",
      message: "Exit RSI threshold must be in [0, 100]",
    });
  }

  // Rule: MA period in {5, 10, 20, 50}
  // (Also enforced at shape level via z.union of literals; defense-in-depth.)
  const validMaPeriods = [5, 10, 20, 50];
  if (!validMaPeriods.includes(value.entryRules.maPeriod)) {
    errors.push({
      code: "MA_PERIOD_INVALID",
      path: "entryRules.maPeriod",
      message: `MA period must be one of {5, 10, 20, 50}, got ${value.entryRules.maPeriod}`,
    });
  }

  // Rule: entry RSI < exit RSI (no contradictions)
  // This is the cross-rule check; can't be expressed at shape level.
  if (value.entryRules.rsiThreshold >= value.exitRules.rsiThreshold) {
    errors.push({
      code: "ENTRY_RSI_NOT_LESS_THAN_EXIT_RSI",
      path: "entryRules.rsiThreshold",
      message:
        `Entry RSI (${value.entryRules.rsiThreshold}) must be strictly less than ` +
        `exit RSI (${value.exitRules.rsiThreshold}) — otherwise the bot would buy ` +
        `and immediately sell.`,
    });
  }

  // Rule: position size > 0
  if (value.positionSizeUsd <= 0) {
    errors.push({
      code: "POSITION_SIZE_USD_NOT_POSITIVE",
      path: "positionSizeUsd",
      message: "Position size USD must be > 0",
    });
  }

  // Rule: per-session buy count cap > 0
  if (
    value.perSessionBuyCountCap <= 0 ||
    !Number.isInteger(value.perSessionBuyCountCap)
  ) {
    errors.push({
      code: "PER_SESSION_BUY_COUNT_CAP_NOT_POSITIVE",
      path: "perSessionBuyCountCap",
      message: "Per-session buy count cap must be a positive integer",
    });
  }

  // Rule: per-session dollar cap > 0
  if (value.perSessionDollarCap <= 0) {
    errors.push({
      code: "PER_SESSION_DOLLAR_CAP_NOT_POSITIVE",
      path: "perSessionDollarCap",
      message: "Per-session dollar cap must be > 0",
    });
  }

  // Rule: selected assets count in [1, 5]
  if (value.selectedAssets.length < 1 || value.selectedAssets.length > 5) {
    errors.push({
      code: "SELECTED_ASSETS_COUNT_OUT_OF_RANGE",
      path: "selectedAssets",
      message: `Selected assets count must be in [1, 5], got ${value.selectedAssets.length}`,
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value };
}

// ──────────────────────────────────────────────────────────────────────────
// Re-exports for convenience (consumer downstream stories use these)
// ──────────────────────────────────────────────────────────────────────────
export type { EntryRules, ExitRules, Asset };

// `lib/strategy-core/validate.ts` — universal rule validation.
//
// CB-3.0 (FIRST CB-3 STORY). Pure function; no I/O; no Coinbase coupling.
// Validates the form-submitted payload against ALL the documented universal
// rules. Returns a discriminated-union result so callers can branch on
// success/failure without throwing.
//
// Field paths in error messages use snake_case to match the contract per
// AC 6 + Tech notes Decision #1.
//
// Every false-path has its own error code. The form UI (CB-3.3) translates
// codes to inline-error display; the bot runtime (CB-4) can also consume
// the codes for richer log emission.

import { z } from "zod";

import {
  AssetSchema,
  EntryRulesSchema,
  ExitRulesSchema,
  type Asset,
  type EntryRules,
  type ExitRules,
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
// supersession-resolution. The save action wires id/created_at/created_by_
// user_id after validation.

const StrategyPayloadSchema = z.object({
  name: z.string().min(1).max(120),
  asset_class: z.string().min(1),
  selected_assets: z.array(AssetSchema),
  entry_rules: EntryRulesSchema,
  exit_rules: ExitRulesSchema,
  position_size_usd: z.number(),
  per_session_buy_count_cap: z.number(),
  per_session_dollar_cap: z.number(),
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
  if (value.entry_rules.rsi_threshold < 0 || value.entry_rules.rsi_threshold > 100) {
    errors.push({
      code: "ENTRY_RSI_OUT_OF_RANGE",
      path: "entry_rules.rsi_threshold",
      message: "Entry RSI threshold must be in [0, 100]",
    });
  }

  // Rule: exit RSI threshold in [0, 100]
  if (value.exit_rules.rsi_threshold < 0 || value.exit_rules.rsi_threshold > 100) {
    errors.push({
      code: "EXIT_RSI_OUT_OF_RANGE",
      path: "exit_rules.rsi_threshold",
      message: "Exit RSI threshold must be in [0, 100]",
    });
  }

  // Rule: MA period in {5, 10, 20, 50}
  // (Also enforced at shape level via z.union of literals; defense-in-depth.)
  const validMaPeriods = [5, 10, 20, 50];
  if (!validMaPeriods.includes(value.entry_rules.ma_period)) {
    errors.push({
      code: "MA_PERIOD_INVALID",
      path: "entry_rules.ma_period",
      message: `MA period must be one of {5, 10, 20, 50}, got ${value.entry_rules.ma_period}`,
    });
  }

  // Rule: entry RSI < exit RSI (no contradictions)
  // This is the cross-rule check; can't be expressed at shape level.
  if (value.entry_rules.rsi_threshold >= value.exit_rules.rsi_threshold) {
    errors.push({
      code: "ENTRY_RSI_NOT_LESS_THAN_EXIT_RSI",
      path: "entry_rules.rsi_threshold",
      message:
        `Entry RSI (${value.entry_rules.rsi_threshold}) must be strictly less than ` +
        `exit RSI (${value.exit_rules.rsi_threshold}) — otherwise the bot would buy ` +
        `and immediately sell.`,
    });
  }

  // Rule: position size > 0
  if (value.position_size_usd <= 0) {
    errors.push({
      code: "POSITION_SIZE_USD_NOT_POSITIVE",
      path: "position_size_usd",
      message: "Position size USD must be > 0",
    });
  }

  // Rule: per-session buy count cap > 0
  if (
    value.per_session_buy_count_cap <= 0 ||
    !Number.isInteger(value.per_session_buy_count_cap)
  ) {
    errors.push({
      code: "PER_SESSION_BUY_COUNT_CAP_NOT_POSITIVE",
      path: "per_session_buy_count_cap",
      message: "Per-session buy count cap must be a positive integer",
    });
  }

  // Rule: per-session dollar cap > 0
  if (value.per_session_dollar_cap <= 0) {
    errors.push({
      code: "PER_SESSION_DOLLAR_CAP_NOT_POSITIVE",
      path: "per_session_dollar_cap",
      message: "Per-session dollar cap must be > 0",
    });
  }

  // Rule: selected assets count in [1, 5]
  if (value.selected_assets.length < 1 || value.selected_assets.length > 5) {
    errors.push({
      code: "SELECTED_ASSETS_COUNT_OUT_OF_RANGE",
      path: "selected_assets",
      message: `Selected assets count must be in [1, 5], got ${value.selected_assets.length}`,
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

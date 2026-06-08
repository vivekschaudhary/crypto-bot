// `lib/strategy-core/validate.ts` — universal rule validation.
//
// CB-3.0 (FIRST CB-3 STORY). Pure function; no I/O; no Coinbase coupling.
// Validates the form-submitted payload against ALL the documented universal
// rules. Returns a discriminated-union result so callers can branch on
// success/failure without throwing.
//
// CONTRACT (per AC 3 — round-2 BLOCKER fix):
//   "Every false-path has its own error code."
//
// To satisfy this, validate.ts uses a PERMISSIVE input schema that accepts
// any number/MA-period value at shape-validation time (Zod just enforces
// "is a number"; "is an array"; etc.). Range checks + MA-period strict-set
// checks + cross-field checks + cardinality checks are then enforced by
// the explicit RULE BRANCHES below, each emitting its own named code.
//
// This is the correct split between:
//   * types.ts — STRICT schemas for the storage/wire contract (`Strategy`,
//                `EntryRules`, `ExitRules`). These embed range checks so
//                values that flow into the DB / out across the wire are
//                guaranteed valid. Consumers downstream of validation
//                use these strict types.
//   * validate.ts — PERMISSIVE input schema for the validation gate. Range
//                   violations get named codes, not collapsed into
//                   SHAPE_INVALID. This is what AC 3 explicitly required.
//
// SHAPE_INVALID remains the catch-all for TRULY malformed inputs (wrong
// type: string where number expected; missing required field; not an
// object; etc.). All RECOVERABLE rule violations (out-of-range, non-
// canonical MA period, cross-field contradiction, cardinality) get
// specific codes the form UI can map to field-level inline errors.

import { z } from "zod";

import {
  AssetSchema,
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
// PERMISSIVE input schemas (NOT the storage contract — these accept
// out-of-range values so the rule branches can attribute them to named codes)
// ──────────────────────────────────────────────────────────────────────────

const PermissiveEntryRulesSchema = z.object({
  rsiThreshold: z.number(),                  // range checked in rule branch
  maPeriod: z.number(),                      // strict-set checked in rule branch
  maReinforcement: z.boolean().optional(),
});

const PermissiveExitRulesSchema = z.object({
  rsiThreshold: z.number(),                  // range checked in rule branch
  minProfitPct: z.number(),                  // not range-checked here (>= 0
                                             // is a strict-schema concern;
                                             // negative profit is operator
                                             // error, but typed.ts catches
                                             // it downstream)
  sellFraction: z.number(),                  // 0..1 enforced downstream
});

const PermissiveStrategyPayloadSchema = z.object({
  name: z.string().min(1).max(120),
  asset_class: z.string().min(1),
  selected_assets: z.array(AssetSchema),     // cardinality checked in rule branch
  entry_rules: PermissiveEntryRulesSchema,
  exit_rules: PermissiveExitRulesSchema,
  position_size_usd: z.number(),             // > 0 checked in rule branch
  per_session_buy_count_cap: z.number(),     // > 0 + integer checked in rule branch
  per_session_dollar_cap: z.number(),        // > 0 checked in rule branch
});
export type StrategyPayload = z.infer<typeof PermissiveStrategyPayloadSchema>;

// ──────────────────────────────────────────────────────────────────────────
// validateStrategyPayload — the load-bearing function
// ──────────────────────────────────────────────────────────────────────────

const VALID_MA_PERIODS = [5, 10, 20, 50] as const;

export function validateStrategyPayload(
  input: unknown,
): ValidationResult<StrategyPayload> {
  // Step 1: shape validation via PERMISSIVE Zod. Only catches truly
  // malformed inputs (wrong types; missing required fields; not an object).
  // Out-of-range values pass shape validation and get named codes below.
  const parsed = PermissiveStrategyPayloadSchema.safeParse(input);
  if (!parsed.success) {
    const errors: ValidationError[] = parsed.error.issues.map((issue) => ({
      code: "SHAPE_INVALID",
      path: issue.path.join("."),
      message: issue.message,
    }));
    return { ok: false, errors };
  }

  // Step 2: business-rule validation. Each false-path emits ITS OWN named
  // code so the form UI can translate to field-level inline errors. NOT
  // short-circuit on first failure — operator sees all errors at once.
  const value = parsed.data;
  const errors: ValidationError[] = [];

  // Rule: entry RSI threshold in [0, 100]
  if (value.entry_rules.rsiThreshold < 0 || value.entry_rules.rsiThreshold > 100) {
    errors.push({
      code: "ENTRY_RSI_OUT_OF_RANGE",
      path: "entry_rules.rsiThreshold",
      message: `Entry RSI threshold must be in [0, 100], got ${value.entry_rules.rsiThreshold}`,
    });
  }

  // Rule: exit RSI threshold in [0, 100]
  if (value.exit_rules.rsiThreshold < 0 || value.exit_rules.rsiThreshold > 100) {
    errors.push({
      code: "EXIT_RSI_OUT_OF_RANGE",
      path: "exit_rules.rsiThreshold",
      message: `Exit RSI threshold must be in [0, 100], got ${value.exit_rules.rsiThreshold}`,
    });
  }

  // Rule: MA period in {5, 10, 20, 50}
  if (!VALID_MA_PERIODS.includes(value.entry_rules.maPeriod as 5 | 10 | 20 | 50)) {
    errors.push({
      code: "MA_PERIOD_INVALID",
      path: "entry_rules.maPeriod",
      message: `MA period must be one of {5, 10, 20, 50}, got ${value.entry_rules.maPeriod}`,
    });
  }

  // Rule: entry RSI < exit RSI (no contradictions)
  // Only meaningful when both RSI values are in [0, 100]; otherwise the
  // out-of-range errors above are the primary signal. Still emit the
  // cross-field code if both are valid range AND contradictory.
  const entryInRange =
    value.entry_rules.rsiThreshold >= 0 && value.entry_rules.rsiThreshold <= 100;
  const exitInRange =
    value.exit_rules.rsiThreshold >= 0 && value.exit_rules.rsiThreshold <= 100;
  if (
    entryInRange &&
    exitInRange &&
    value.entry_rules.rsiThreshold >= value.exit_rules.rsiThreshold
  ) {
    errors.push({
      code: "ENTRY_RSI_NOT_LESS_THAN_EXIT_RSI",
      path: "entry_rules.rsiThreshold",
      message:
        `Entry RSI (${value.entry_rules.rsiThreshold}) must be strictly less than ` +
        `exit RSI (${value.exit_rules.rsiThreshold}) — otherwise the bot would buy ` +
        `and immediately sell.`,
    });
  }

  // Rule: position size > 0
  if (value.position_size_usd <= 0) {
    errors.push({
      code: "POSITION_SIZE_USD_NOT_POSITIVE",
      path: "position_size_usd",
      message: `Position size USD must be > 0, got ${value.position_size_usd}`,
    });
  }

  // Rule: per-session buy count cap > 0 AND integer
  if (
    value.per_session_buy_count_cap <= 0 ||
    !Number.isInteger(value.per_session_buy_count_cap)
  ) {
    errors.push({
      code: "PER_SESSION_BUY_COUNT_CAP_NOT_POSITIVE",
      path: "per_session_buy_count_cap",
      message:
        `Per-session buy count cap must be a positive integer, ` +
        `got ${value.per_session_buy_count_cap}`,
    });
  }

  // Rule: per-session dollar cap > 0
  if (value.per_session_dollar_cap <= 0) {
    errors.push({
      code: "PER_SESSION_DOLLAR_CAP_NOT_POSITIVE",
      path: "per_session_dollar_cap",
      message: `Per-session dollar cap must be > 0, got ${value.per_session_dollar_cap}`,
    });
  }

  // Rule: selected_assets count in [1, 5]
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

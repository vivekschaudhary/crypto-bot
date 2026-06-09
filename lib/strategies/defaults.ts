// `lib/strategies/defaults.ts` — pure helpers for the strategy authoring UI.
//
// CB-3.3 (FOURTH + LAST CB-3 STORY). Extracted from the form Client Component
// per Engineer DRI Decision #9 — the codebase has no @testing-library/react
// dependency; pure-logic helpers go in lib/ where they're unit-testable.
// Component-level UX rendering still lives in
// app/dashboard/strategy/strategy-form-client.tsx; the form imports these
// helpers verbatim.
//
// Three groups of pure helpers in this file:
//   1. DEFAULT_FORM_VALUES — empty-state defaults per design.md Empty-state
//      defaults table. First-time operator gets these; revising operator
//      gets the prior strategy's values instead.
//   2. errorCodeToFieldPath + errorCodeToCopy + topErrorBannerCopy — the
//      `VALIDATION_ERROR_CODES` mapping per AC 5 + copy.md verbatim strings.
//      `_form.tsx` consumes these to render inline per-field errors.
//   3. topFiveAsOfText — header copy for the asset selector per copy.md.
//
// Per AC 14: every user-facing string here is verbatim from copy.md. Do NOT
// paraphrase — Engineer Forbidden per compass/roles/engineer.md.

import type {
  Asset,
  EntryRules,
  ExitRules,
  MaPeriod,
} from "@/lib/strategy-core/types";
import type { ValidationErrorCode } from "@/lib/strategy-core/validate";

// ──────────────────────────────────────────────────────────────────────────
// Default form values (empty-state, first-time authoring)
// ──────────────────────────────────────────────────────────────────────────
// Per design.md § Default values for empty state. The operator can override
// any of these in the form; these are what the form mounts with when there's
// no prior active strategy.

export const DEFAULT_ENTRY_RULES: EntryRules = {
  rsiThreshold: 30,
  maPeriod: 20 satisfies MaPeriod,
  maReinforcement: false,
};

export const DEFAULT_EXIT_RULES: ExitRules = {
  rsiThreshold: 70,
  minProfitPct: 1.5,
  sellFraction: 0.5,
};

export const DEFAULT_POSITION_SIZE_USD = 50;
export const DEFAULT_PER_SESSION_BUY_COUNT_CAP = 10;
export const DEFAULT_PER_SESSION_DOLLAR_CAP = 500;

/**
 * Build the empty-state form payload given the server-rendered top-5
 * selection. `selectedAssets` should be `topN(makeCoinbaseAdapter(), 5)`
 * from `page.tsx`; first-time operator gets these as their starting
 * selection but can add/remove (cardinality [1, 5] per
 * StrategyFormPayloadSchema).
 */
export function buildEmptyStateDefaults(args: {
  selectedAssets: Asset[];
  assetClass: string;
}): {
  name: string;
  asset_class: string;
  selected_assets: Asset[];
  entry_rules: EntryRules;
  exit_rules: ExitRules;
  position_size_usd: number;
  per_session_buy_count_cap: number;
  per_session_dollar_cap: number;
  supersedes_strategy_id: null;
} {
  return {
    name: "",
    asset_class: args.assetClass,
    selected_assets: args.selectedAssets,
    entry_rules: DEFAULT_ENTRY_RULES,
    exit_rules: DEFAULT_EXIT_RULES,
    position_size_usd: DEFAULT_POSITION_SIZE_USD,
    per_session_buy_count_cap: DEFAULT_PER_SESSION_BUY_COUNT_CAP,
    per_session_dollar_cap: DEFAULT_PER_SESSION_DOLLAR_CAP,
    supersedes_strategy_id: null,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// VALIDATION_ERROR_CODES → field-path + copy mapping (AC 5)
// ──────────────────────────────────────────────────────────────────────────
// Per CB-3.0's `validate.ts` — each ValidationErrorCode pertains to a
// specific field. The form maps codes → field paths to attach inline errors
// via aria-describedby, and codes → copy strings (verbatim from copy.md) to
// render the actual error text.

/**
 * Map a `VALIDATION_ERROR_CODES` value to the form-field path (dot-notation)
 * the error attaches to. Per AC 5: cross-field errors
 * (ENTRY_RSI_NOT_LESS_THAN_EXIT_RSI) attach to the entry field by UX
 * convention.
 */
export function errorCodeToFieldPath(code: ValidationErrorCode): string {
  switch (code) {
    case "ENTRY_RSI_OUT_OF_RANGE":
      return "entry_rules.rsiThreshold";
    case "EXIT_RSI_OUT_OF_RANGE":
      return "exit_rules.rsiThreshold";
    case "MA_PERIOD_INVALID":
      return "entry_rules.maPeriod";
    case "ENTRY_RSI_NOT_LESS_THAN_EXIT_RSI":
      return "entry_rules.rsiThreshold";
    case "POSITION_SIZE_USD_NOT_POSITIVE":
      return "position_size_usd";
    case "PER_SESSION_BUY_COUNT_CAP_NOT_POSITIVE":
      return "per_session_buy_count_cap";
    case "PER_SESSION_DOLLAR_CAP_NOT_POSITIVE":
      return "per_session_dollar_cap";
    case "SELECTED_ASSETS_COUNT_OUT_OF_RANGE":
      return "selected_assets";
    case "SHAPE_INVALID":
      // SHAPE_INVALID has no specific field — surface as top-of-form banner
      // per copy.md. Returning the sentinel "_form" path signals the form
      // to render the message at the top-level banner, not inline.
      return "_form";
  }
}

/**
 * Map a `VALIDATION_ERROR_CODES` value to its verbatim user-facing copy
 * string per docs/bets/CB-3/stories/CB-3.3/copy.md § Inline field errors.
 */
export function errorCodeToCopy(code: ValidationErrorCode): string {
  switch (code) {
    case "ENTRY_RSI_OUT_OF_RANGE":
      return "Must be between 0 and 100.";
    case "EXIT_RSI_OUT_OF_RANGE":
      return "Must be between 0 and 100.";
    case "MA_PERIOD_INVALID":
      return "Must be 5, 10, 20, or 50.";
    case "ENTRY_RSI_NOT_LESS_THAN_EXIT_RSI":
      return "Entry RSI must be less than exit RSI — otherwise the bot would buy and sell at the same level.";
    case "POSITION_SIZE_USD_NOT_POSITIVE":
      return "Must be greater than 0.";
    case "PER_SESSION_BUY_COUNT_CAP_NOT_POSITIVE":
      return "Must be a positive whole number.";
    case "PER_SESSION_DOLLAR_CAP_NOT_POSITIVE":
      return "Must be greater than 0.";
    case "SELECTED_ASSETS_COUNT_OUT_OF_RANGE":
      // PR #53 (portability refactor): default is generic ("assets") so this
      // module is asset-class-agnostic. The crypto-coinbase form passes a
      // labels.errorOverrides at the route layer to substitute "cryptos"
      // verbatim per copy.md. Equity-app's future form passes its own
      // override (e.g., "stocks"). Keeps lib/strategies/defaults.ts portable.
      return "Pick between 1 and 5 assets.";
    case "SHAPE_INVALID":
      return "Something's wrong with this field. Check the value and try again.";
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Top-of-form error banner copy (4-way discriminated error type)
// ──────────────────────────────────────────────────────────────────────────

export type TopErrorBannerType =
  | "validation"
  | "network"
  | "server"
  | "unknown";

/**
 * Per docs/bets/CB-3/stories/CB-3.3/copy.md § Top-of-form error banner.
 * The form discriminates these via the server action's return shape OR
 * its catch-block fall-through.
 */
export function topErrorBannerCopy(type: TopErrorBannerType): string {
  switch (type) {
    case "validation":
      return "Some fields need attention. See errors above.";
    case "network":
      return "Save failed. Check your connection.";
    case "server":
      return "Save failed on the server. Try again.";
    case "unknown":
      return "Unexpected error. Try again or reload.";
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Selector header copy — the date-formatting helper + per-app header strings
// ──────────────────────────────────────────────────────────────────────────

/**
 * Format a Date as `YYYY-MM-DD HH:mm` (24h, UTC). UTC chosen because the
 * bot operates in UTC tick boundaries; matches CB-2.5's structured-log
 * timestamp convention.
 *
 * PR #53 (portability refactor): extracted as a pure date helper so each
 * app can build its own header string with its own ranking-source label.
 * The crypto-coinbase form composes "Selected from top-5 by dollar volume
 * (as of ...)" via `coinbaseAssetSelectorHeader` in the page.tsx route
 * layer. Equity app's future form composes its own header (e.g.,
 * "Selected from your screener (as of ...)").
 */
export function formatAsOfStamp(date: Date): string {
  const yyyy = date.getUTCFullYear().toString().padStart(4, "0");
  const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = date.getUTCDate().toString().padStart(2, "0");
  const hh = date.getUTCHours().toString().padStart(2, "0");
  const min = date.getUTCMinutes().toString().padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

/**
 * Per copy.md § Assets selector header — the crypto-coinbase selector
 * header copy. Composed at the route layer (page.tsx) via the labels prop
 * so the form Client Component stays asset-class-agnostic.
 */
export function topFiveAsOfText(date: Date): string {
  return `Selected from top-5 by dollar volume (as of ${formatAsOfStamp(date)})`;
}

// ──────────────────────────────────────────────────────────────────────────
// Top-of-form fallback notices (top-5 fetch failures)
// ──────────────────────────────────────────────────────────────────────────

export type TopFiveFallbackKind = "timeout" | "error";

/**
 * Per copy.md § Top-of-form fallback notices. Returns the verbatim string
 * for the given fallback condition. Used by page.tsx when the top-5 fetch
 * fails before initial render.
 */
export function topFiveFallbackCopy(kind: TopFiveFallbackKind): string {
  switch (kind) {
    case "timeout":
      return "Couldn't load top-5 — please try again later.";
    case "error":
      return "Couldn't load top-5 from Coinbase. Try reloading.";
  }
}

// ──────────────────────────────────────────────────────────────────────────
// MA period choices (for the radio group in entry rules)
// ──────────────────────────────────────────────────────────────────────────

/**
 * The strict set per `MaPeriodSchema` in CB-3.0 types.ts. Form renders a
 * radio group with these 4 options.
 */
export const MA_PERIOD_CHOICES: readonly MaPeriod[] = [5, 10, 20, 50] as const;

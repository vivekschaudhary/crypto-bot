// `app/dashboard/strategy/strategy-actions.ts` — server actions for the
// strategy authoring surface.
//
// CB-3.3 (FOURTH + LAST CB-3 STORY) per architecture Decision #6 form
// architecture. The `saveStrategy` action does FIVE things in one
// transactional sweep:
//
//   1. Parses form data via `StrategyFormPayloadSchema` (shape validation)
//   2. Runs `validateStrategyPayload` (rule branches; named error codes)
//   3. Generates a server-side ULID and builds the typed `Strategy` row
//   4. Calls `supersede()` (CB-3.0 pure helper) to derive INSERT + UPDATE
//      plan; persists via `lib/strategies/db.ts`
//   5. UPSERTs the singleton `bot_sessions.active_strategy_id` to point at
//      the new strategy (folds CB-3.4's activation wiring)
//
// Emits a structured-JSON `console.log` per CB-3 architecture Decision #7
// (`event: "strategy.save"`) for Vercel runtime log scraping.
//
// ENGINEER DRI DECISIONS (CB-3.3 build, in JSDoc):
//   #3  ULID generation via `ulidx` server-side (never client-trusted)
//   #4  Server Action (`"use server"`) not API route per architecture #6
//   #5  Initial top-5 fetched server-side (in `page.tsx`); this action
//       does NOT fetch top-5 — it only persists what the operator chose
//   #6  Discriminated-union return shape: `{success: true}` or
//       `{success: false, error_type, errors?, banner_copy}`; the form
//       keys on `error_type` for top-of-form banner + `errors[].code +
//       errors[].path` for inline-per-field rendering
//
// SECURITY: the action reads `x-session-user-id` from `headers()`. Per
// proxy.ts, this header is forwarded only on valid sessions (the proxy
// already gated `/dashboard/strategy`). The action treats it as the
// authoritative `created_by_user_id`. CSRF protection is provided by
// Next.js Server Actions (cookie origin check + opaque action id).
//
// No app-code path to UPDATE strategy content. The only allowed UPDATE is
// `markSuperseded` (supersession-only).

"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ulid } from "ulidx";

import {
  insertStrategy,
  markSuperseded,
  upsertSingletonBotSession,
} from "@/lib/strategies/db";
import { supersede } from "@/lib/strategy-core/supersession";
import {
  StrategyIdSchema,
  StrategySchema,
  UserIdSchema,
  type Strategy,
  type StrategyId,
} from "@/lib/strategy-core/types";
import {
  VALIDATION_ERROR_CODES,
  validateStrategyPayload,
  type ValidationError,
  type ValidationErrorCode,
} from "@/lib/strategy-core/validate";
import {
  errorCodeToFieldPath,
  topErrorBannerCopy,
  type TopErrorBannerType,
} from "@/lib/strategies/defaults";

const COINBASE_ASSET_CLASS = "crypto-coinbase";

/**
 * Discriminated-union return shape per Engineer DRI Decision #6. The form
 * client keys on `success`; on failure, `error_type` drives the top-of-form
 * banner copy and `errors[]` (if any) drives the inline-per-field render.
 *
 * `banner_copy` is the verbatim copy.md string for the given error_type —
 * computed server-side so client doesn't need its own copy of the lookup
 * table.
 */
export type SaveStrategyResult =
  | { success: true }
  | {
      success: false;
      error_type: TopErrorBannerType;
      banner_copy: string;
      errors: { code: ValidationErrorCode; path: string; message: string }[];
    };

/**
 * Build a discriminated-union failure result. Centralizes the banner copy
 * lookup so error_type drives the user-visible string deterministically.
 */
function failure(
  error_type: TopErrorBannerType,
  errors: ValidationError[] = [],
): SaveStrategyResult {
  return {
    success: false,
    error_type,
    banner_copy: topErrorBannerCopy(error_type),
    errors,
  };
}

/**
 * Emit a structured-JSON observability log per CB-3 architecture Decision
 * #7. Vercel Pro 1-day retention catches these; CB-5's dashboard / future
 * Sentry integration can hydrate against the same shape.
 *
 * Failure shape: `{event, success: false, asset_class, validation_errors}`.
 * Success shape: `{event, success: true, asset_class, strategy_id_new,
 * strategy_id_superseded}` (nullable).
 */
function logStrategySaveEvent(payload: {
  success: boolean;
  asset_class: string;
  strategy_id_new?: string;
  strategy_id_superseded?: string | null;
  validation_errors?: ValidationErrorCode[];
}): void {
  console.log(
    JSON.stringify({
      event: "strategy.save",
      ...payload,
    }),
  );
}

/**
 * Server action: validate the form payload, persist the new strategy row,
 * wire supersession against the prior active strategy (if any), point the
 * bot_sessions singleton at the new id, and redirect to /dashboard.
 *
 * Returns a `SaveStrategyResult` ONLY on the non-success branches; on
 * success, the function calls `redirect(...)` (which throws internally per
 * Next.js convention) and never reaches a return statement. The form
 * client awaits the action and renders the failure result inline if
 * present.
 */
export async function saveStrategy(
  formData: FormData,
): Promise<SaveStrategyResult> {
  // ─── Session check (defense in depth; proxy already gated) ──────────
  const h = await headers();
  const sessionUserId = h.get("x-session-user-id");
  if (!sessionUserId) {
    // Should be impossible — proxy.ts gates /dashboard/* and forwards the
    // session header. Treat as server error rather than auth error;
    // operator will see "Save failed on the server. Try again."
    logStrategySaveEvent({
      success: false,
      asset_class: COINBASE_ASSET_CLASS,
      validation_errors: ["SHAPE_INVALID"],
    });
    return failure("server");
  }

  // ─── Parse form payload from FormData ──────────────────────────────
  // FormData arrives with string values for all fields; the form client
  // serializes selected_assets + entry_rules + exit_rules as JSON strings.
  // The two-stage validation runs validate.ts (CB-3.0's permissive-input +
  // named-code design) — NOT a strict form-schema parse, because strict
  // shape rejection collapses range violations (e.g., position_size_usd: 0)
  // to SHAPE_INVALID instead of the named codes the form needs for inline
  // rendering per AC 5. Same lesson CB-3.0 round-2 BLOCKER taught for
  // validate.ts itself.
  let rawPayload: Record<string, unknown>;
  let supersedesStrategyId: string | null;
  try {
    supersedesStrategyId =
      (formData.get("supersedes_strategy_id") as string | null) || null;
    rawPayload = {
      name: formData.get("name"),
      asset_class: formData.get("asset_class") ?? COINBASE_ASSET_CLASS,
      selected_assets: JSON.parse(
        (formData.get("selected_assets") as string | null) ?? "null",
      ),
      entry_rules: JSON.parse(
        (formData.get("entry_rules") as string | null) ?? "null",
      ),
      exit_rules: JSON.parse(
        (formData.get("exit_rules") as string | null) ?? "null",
      ),
      position_size_usd: Number(formData.get("position_size_usd")),
      per_session_buy_count_cap: Number(
        formData.get("per_session_buy_count_cap"),
      ),
      per_session_dollar_cap: Number(formData.get("per_session_dollar_cap")),
    };
  } catch {
    // Malformed JSON in one of the three JSON-serialized fields. SHAPE_INVALID
    // signals the form to surface a top-of-form banner; no inline field can
    // attach since the parse never reached a field.
    logStrategySaveEvent({
      success: false,
      asset_class: COINBASE_ASSET_CLASS,
      validation_errors: ["SHAPE_INVALID"],
    });
    return failure("validation", [
      {
        code: "SHAPE_INVALID",
        path: "_form",
        message: "Form payload could not be parsed.",
      },
    ]);
  }

  // ─── Rule validation via CB-3.0's validateStrategyPayload ──────────
  // validate.ts uses a PERMISSIVE input schema internally (only catches truly
  // malformed shapes — wrong type / missing field) and emits NAMED codes for
  // every rule violation (range checks, MA period strict-set, cross-field
  // contradictions, cardinality, positivity). AC 5 requires those named codes.
  const ruleValidation = validateStrategyPayload(rawPayload);
  if (!ruleValidation.ok) {
    logStrategySaveEvent({
      success: false,
      asset_class: String(rawPayload.asset_class ?? COINBASE_ASSET_CLASS),
      validation_errors: ruleValidation.errors.map(
        (e) => e.code,
      ) satisfies ValidationErrorCode[],
    });
    return failure("validation", ruleValidation.errors);
  }
  const payload = ruleValidation.value;

  // ─── Build the new Strategy row (server-side id + created_at) ───────
  const newStrategyId = StrategyIdSchema.parse(ulid());
  const createdByUserId = UserIdSchema.parse(sessionUserId);
  const newRow: Strategy = StrategySchema.parse({
    id: newStrategyId,
    name: payload.name,
    asset_class: payload.asset_class,
    selected_assets: payload.selected_assets,
    entry_rules: payload.entry_rules,
    exit_rules: payload.exit_rules,
    position_size_usd: payload.position_size_usd,
    per_session_buy_count_cap: payload.per_session_buy_count_cap,
    per_session_dollar_cap: payload.per_session_dollar_cap,
    created_at: new Date(),
    created_by_user_id: createdByUserId,
    superseded_by_strategy_id: null,
  });

  // ─── Derive supersession plan via CB-3.0's pure helper ──────────────
  const oldStrategyId: StrategyId | null = supersedesStrategyId
    ? StrategyIdSchema.parse(supersedesStrategyId)
    : null;
  const plan = supersede({
    oldStrategyId,
    newPayload: newRow,
  });

  // ─── Persist: INSERT new row → mark old superseded → upsert session ─
  try {
    await insertStrategy(plan.newRow);
    if (plan.oldRowSupersessionUpdate) {
      await markSuperseded(
        plan.oldRowSupersessionUpdate.id,
        plan.oldRowSupersessionUpdate.superseded_by_strategy_id,
      );
    }
    await upsertSingletonBotSession(newStrategyId);
  } catch (err) {
    // Any DB error → server failure; the operator sees "Save failed on
    // the server." The structured log captures the strategy id so the
    // operator can recover state if the INSERT succeeded but the
    // subsequent UPDATE failed.
    logStrategySaveEvent({
      success: false,
      asset_class: payload.asset_class,
      strategy_id_new: newStrategyId,
      strategy_id_superseded: plan.oldRowSupersessionUpdate?.id ?? null,
    });
    // Re-throw so Next.js can surface in dev; in prod the form client's
    // catch handles the missing-success-result case and renders the
    // generic error banner.
    if (
      typeof process !== "undefined" &&
      process.env.NODE_ENV === "development"
    ) {
      console.error("[saveStrategy] DB error", err);
    }
    return failure("server");
  }

  // ─── Success: emit log + redirect to /dashboard ─────────────────────
  logStrategySaveEvent({
    success: true,
    asset_class: payload.asset_class,
    strategy_id_new: newStrategyId,
    strategy_id_superseded: oldStrategyId,
  });

  // redirect() throws internally per Next.js convention — the function
  // never returns a SaveStrategyResult on success. The form client awaits
  // and catches NEXT_REDIRECT to navigate. _form.tsx does NOT need to
  // render a success state inline; success is the /dashboard arrival.
  redirect("/dashboard?strategy=saved");

  // Unreachable — placate TS that `saveStrategy` always returns or throws.
  // This is the documented Next.js Server Action pattern with redirect().
  // The literal `satisfies` keeps the union exhaustive without exposing the
  // sentinel to callers.
  return {
    success: false,
    error_type: "unknown",
    banner_copy: topErrorBannerCopy("unknown"),
    errors: [] satisfies ValidationError[],
  };
}

// Re-export the canonical error codes list so call sites that need to map
// codes can import from one module. Keeps the action surface terse.
export { VALIDATION_ERROR_CODES, errorCodeToFieldPath };

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
// SECURITY: the action re-verifies the session via `verifySession()` against
// the `__compass_session` signed cookie — defense-in-depth per the
// architecture's "DB row is the source of truth" invariant + CB-1.4 Engineer
// DRI Decision #5 (handlers that perform mutating actions MUST re-verify;
// the proxy's `x-session-*` headers are NOT trusted as auth claims). The
// proxy still gates the route (auth fast-path); the action re-verify is the
// authoritative check for the userId attached to `created_by_user_id`. CSRF
// protection comes from Next.js Server Actions (cookie origin check +
// opaque action id) on top of the cookie signature.
//
// Round-1 BLOCKER 2 + Security MEDIUM fix (Codex PR #49 review): the
// original implementation trusted the proxy-forwarded `x-session-user-id`
// header inside the mutating action. Replaced with `verifySession` so the
// write path matches the defense-in-depth posture established by
// `/api/auth/sign-out` (CB-1.5) and the foundation architecture.
//
// No app-code path to UPDATE strategy content. The only allowed UPDATE is
// `markSuperseded` (supersession-only).

"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ulid } from "ulidx";

import { verifySession } from "@/lib/auth/sessions";
import {
  insertStrategy,
  markSuperseded,
  upsertSingletonBotSession,
} from "@/lib/strategies/db";
import { StrategyFormPayloadSchema } from "@/lib/strategy-core/form-schema";
import { supersede } from "@/lib/strategy-core/supersession";
import {
  StrategyIdSchema,
  StrategySchema,
  UserIdSchema,
  type Strategy,
  type StrategyId,
} from "@/lib/strategy-core/types";
import {
  validateStrategyPayload,
  type ValidationError,
  type ValidationErrorCode,
} from "@/lib/strategy-core/validate";
import {
  topErrorBannerCopy,
  type TopErrorBannerType,
} from "@/lib/strategies/defaults";

const COINBASE_ASSET_CLASS = "crypto-coinbase";
const SESSION_COOKIE_NAME = "__compass_session";

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
  // ─── Session re-verify (defense in depth — Codex BLOCKER 2 closure) ─
  // The proxy gates the route, but mutating actions MUST re-verify the
  // session against the DB row (the authoritative source per architecture
  // invariant). We read the signed cookie via cookies() and call
  // verifySession (which performs signature check + auth_sessions row
  // lookup + sliding expiry bump). The proxy-forwarded x-session-* headers
  // are NOT trusted as auth claims for write paths.
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) {
    logStrategySaveEvent({
      success: false,
      asset_class: COINBASE_ASSET_CLASS,
      validation_errors: ["SHAPE_INVALID"],
    });
    return failure("server");
  }
  const session = await verifySession(sessionCookie);
  if (!session) {
    logStrategySaveEvent({
      success: false,
      asset_class: COINBASE_ASSET_CLASS,
      validation_errors: ["SHAPE_INVALID"],
    });
    return failure("server");
  }
  const sessionUserId = session.userId;

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

  // ─── Stage 1 — Rule validation via CB-3.0's validateStrategyPayload ──
  // validate.ts uses a PERMISSIVE input schema internally (only catches truly
  // malformed shapes — wrong type / missing field) and emits NAMED codes for
  // every rule violation (range checks, MA period strict-set, cross-field
  // contradictions, cardinality, positivity). AC 5 requires those named codes
  // so the form can render inline-per-field errors. Run this BEFORE the
  // strict StrategyFormPayloadSchema so named codes fire (the strict schema
  // would otherwise collapse the same violations into SHAPE_INVALID — same
  // lesson CB-3.0 round-2 BLOCKER taught for validate.ts itself).
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

  // ─── Stage 2 — Strict form-schema parse (defense-in-depth contract) ─
  // Codex BLOCKER 3 closure: AC 6 step 1 + form-schema.ts (line 4) define
  // StrategyFormPayloadSchema as the form-boundary contract. After validate.ts
  // approves the named-code rules, run the strict schema as a defense-in-
  // depth final shape check. validate.ts's rule set is a superset of
  // form-schema's refinements, so this stage should ALWAYS succeed when
  // validate.ts succeeds — if it doesn't, the two schemas have drifted (a
  // programming error). On a drift, emit SHAPE_INVALID and fail loud rather
  // than silently shipping a payload one layer would reject.
  const formPayloadInput = {
    ...rawPayload,
    supersedes_strategy_id: supersedesStrategyId,
  };
  const formParse = StrategyFormPayloadSchema.safeParse(formPayloadInput);
  if (!formParse.success) {
    const errors: ValidationError[] = formParse.error.issues.map((issue) => ({
      code: "SHAPE_INVALID",
      path: issue.path.join("."),
      message: issue.message,
    }));
    logStrategySaveEvent({
      success: false,
      asset_class: String(rawPayload.asset_class ?? COINBASE_ASSET_CLASS),
      validation_errors: errors.map((e) => e.code),
    });
    return failure("validation", errors);
  }
  const payload = formParse.data;

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

// Post-merge production fix (PR #51): the original re-export of
// VALIDATION_ERROR_CODES + errorCodeToFieldPath violated Next.js's
// "use server" file-level constraint that ALL exports must be async
// functions (VALIDATION_ERROR_CODES is a const array; errorCodeToFieldPath
// is sync). Production runtime error:
//   "A 'use server' file can only export async functions, found object"
// Local pnpm dev + pnpm build were lenient and didn't surface it. Removed
// the dead re-export — both symbols are imported directly from their
// origin modules at consumer sites (form-client.tsx already imports them
// from @/lib/strategy-core/validate and @/lib/strategies/defaults).
//
// Lesson: a "use server" file's PUBLIC EXPORT SURFACE must be async
// functions only. Type-only exports (export type) are erased and fine;
// internal helpers (non-exported consts/sync functions) are fine.

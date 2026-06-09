"use client";

// `app/dashboard/strategy/strategy-form-client.tsx` — strategy authoring form
// (Client Component; AC 3 generic over `adapter: AssetAdapter` prop).
//
// CB-3.3 (FOURTH + LAST CB-3 STORY). Renders the form per design.md layout +
// copy.md verbatim strings. Submits via the `saveStrategy` Server Action; on
// success the action redirects to /dashboard?strategy=saved; on failure the
// action returns a `SaveStrategyResult` discriminated union that drives the
// top-of-form banner + inline-per-field error rendering.
//
// ENGINEER DRI DECISIONS (CB-3.3 build):
//   #1  Plain React `useState` (no react-hook-form) — single form, low
//       complexity; library adds bundle weight without payoff
//   #6  Error mapping: codes → field paths + copy via lib/strategies/defaults
//   #8  beforeunload + cancel-button confirmation for dirty form state
//
// NO @testing-library/react dep — the pure logic helpers consumed here live
// in lib/strategies/defaults.ts so they can be unit-tested without DOM;
// rendering is covered by the Playwright e2e Codex writes in Phase 3.

import { useEffect, useRef, useState, type FormEvent, type JSX } from "react";

import type {
  Asset,
  AssetClass,
  EntryRules,
  ExitRules,
  MaPeriod,
} from "@/lib/strategy-core/types";
import {
  saveStrategy,
  type SaveStrategyResult,
} from "@/app/dashboard/strategy/strategy-actions";
import {
  MA_PERIOD_CHOICES,
  errorCodeToCopy,
  errorCodeToFieldPath,
  topErrorBannerCopy,
  topFiveAsOfText,
  type TopErrorBannerType,
} from "@/lib/strategies/defaults";
import { validateStrategyPayload } from "@/lib/strategy-core/validate";

// ──────────────────────────────────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────────────────────────────────

interface InitialPayload {
  name: string;
  asset_class: AssetClass;
  selected_assets: Asset[];
  entry_rules: EntryRules;
  exit_rules: ExitRules;
  position_size_usd: number;
  per_session_buy_count_cap: number;
  per_session_dollar_cap: number;
  supersedes_strategy_id: string | null;
}

/**
 * Production hardening (PR #49 post-merge fix): the adapter cannot be
 * passed across the RSC boundary because AssetAdapter has regular
 * function methods (not Server Actions) and React Server Components can
 * only serialize Server Actions across the boundary — regular functions
 * become broken `E{digest:...}` references that crash the page render in
 * production. The form was only using `adapter.assetClass` inside a
 * hidden span (a placeholder to satisfy the AC 3 generic-over-adapter
 * contract); replaced with the primitive `assetClass: AssetClass`. The
 * AC 3 contract is preserved at the architectural level: the form
 * receives asset-class-agnostic data (assetClass discriminator +
 * candidates list + selected_assets); the Server Component
 * (`page.tsx`) is responsible for materializing those primitives via
 * the adapter. This is the cleaner shape — Client Components shouldn't
 * have direct access to adapters since they run in the browser where
 * Coinbase credentials aren't available.
 */
export interface StrategyFormClientProps {
  assetClass: AssetClass;
  initialPayload: InitialPayload;
  candidates: Asset[];
  topFiveAsOf: Date;
  isRevise: boolean;
}

// ──────────────────────────────────────────────────────────────────────────
// Styles (inline React.CSSProperties matching the /dashboard pattern)
// ──────────────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  padding: "2rem",
  maxWidth: 640,
  margin: "0 auto",
};

const headingStyle: React.CSSProperties = {
  fontSize: "1.5rem",
  fontWeight: 600,
  marginBottom: "0.5rem",
  outline: "none",
};

const reviseBannerStyle: React.CSSProperties = {
  background: "#fff8e1",
  border: "1px solid #f0c674",
  padding: "0.75rem 1rem",
  borderRadius: 4,
  marginBottom: "1.5rem",
  fontSize: "0.9375rem",
};

const sectionStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 6,
  padding: "1rem 1.25rem",
  marginBottom: "1.25rem",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "1rem",
  fontWeight: 600,
  marginBottom: "0.75rem",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.875rem",
  fontWeight: 500,
  marginTop: "0.75rem",
  marginBottom: "0.25rem",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.4rem 0.5rem",
  fontSize: "0.9375rem",
  boxSizing: "border-box",
  border: "1px solid #bbb",
  borderRadius: 3,
};

const helperStyle: React.CSSProperties = {
  fontSize: "0.8125rem",
  color: "#666",
  marginTop: "0.25rem",
};

const errorStyle: React.CSSProperties = {
  color: "#b00020",
  fontSize: "0.8125rem",
  marginTop: "0.25rem",
};

const bannerStyle: React.CSSProperties = {
  background: "#fff3f3",
  border: "1px solid #d99",
  color: "#b00020",
  padding: "0.75rem 1rem",
  borderRadius: 4,
  marginBottom: "1.25rem",
};

const chipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  background: "#eef",
  border: "1px solid #99c",
  borderRadius: 999,
  padding: "0.25rem 0.5rem 0.25rem 0.75rem",
  marginRight: "0.4rem",
  marginBottom: "0.4rem",
  fontSize: "0.875rem",
};

const chipRemoveStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  cursor: "pointer",
  marginLeft: "0.4rem",
  padding: "0 0.25rem",
  fontSize: "0.875rem",
  color: "#446",
};

const submitRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: "1rem",
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "0.5rem 1.25rem",
  fontSize: "0.9375rem",
  background: "#111",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#446",
  fontSize: "0.9375rem",
  cursor: "pointer",
  textDecoration: "underline",
};

const modalBackdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  background: "#fff",
  padding: "1.5rem 2rem",
  borderRadius: 6,
  maxWidth: 420,
  margin: "0 1rem",
};

// ──────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────

export function StrategyFormClient(props: StrategyFormClientProps): JSX.Element {
  const { assetClass, initialPayload, candidates, topFiveAsOf, isRevise } = props;

  const [name, setName] = useState(initialPayload.name);
  const [selectedAssets, setSelectedAssets] = useState<Asset[]>(
    initialPayload.selected_assets,
  );
  const [entryRsi, setEntryRsi] = useState<number>(
    initialPayload.entry_rules.rsiThreshold,
  );
  const [maPeriod, setMaPeriod] = useState<MaPeriod>(
    initialPayload.entry_rules.maPeriod,
  );
  const [maReinforcement, setMaReinforcement] = useState<boolean>(
    initialPayload.entry_rules.maReinforcement ?? false,
  );
  const [exitRsi, setExitRsi] = useState<number>(
    initialPayload.exit_rules.rsiThreshold,
  );
  const [minProfitPct, setMinProfitPct] = useState<number>(
    initialPayload.exit_rules.minProfitPct,
  );
  const [sellFraction, setSellFraction] = useState<number>(
    initialPayload.exit_rules.sellFraction,
  );
  const [positionSizeUsd, setPositionSizeUsd] = useState<number>(
    initialPayload.position_size_usd,
  );
  const [perSessionBuyCountCap, setPerSessionBuyCountCap] = useState<number>(
    initialPayload.per_session_buy_count_cap,
  );
  const [perSessionDollarCap, setPerSessionDollarCap] = useState<number>(
    initialPayload.per_session_dollar_cap,
  );

  const [submitState, setSubmitState] = useState<
    "idle" | "pending" | "confirming"
  >("idle");
  const [banner, setBanner] = useState<{
    type: TopErrorBannerType;
    copy: string;
  } | null>(null);
  const [inlineErrors, setInlineErrors] = useState<Map<string, string>>(
    new Map(),
  );

  const nameInputRef = useRef<HTMLInputElement>(null);
  const initialDataRef = useRef(initialPayload);
  const formRef = useRef<HTMLFormElement>(null);

  // Per AC 10: focus the Name field on mount (first input).
  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  // Per AC 7 + Engineer DRI Decision #8: warn on browser-close/nav when
  // form is dirty.
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent): void {
      if (!isDirty(currentPayload(), initialDataRef.current)) return;
      e.preventDefault();
      // Modern browsers ignore custom strings; the OS dialog still appears.
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    // Intentionally bound on every render so the closure captures fresh
    // form state. Simpler than refs + sync; the listener is cheap to
    // re-bind. (No dep array would mean every render, which is what we
    // want anyway.)
  });

  // Per AC 8 + Engineer DRI Decision #6: assemble the current payload from
  // useState fields. Used by submit + dirty-check + log emission.
  function currentPayload(): InitialPayload {
    return {
      name,
      asset_class: initialPayload.asset_class,
      selected_assets: selectedAssets,
      entry_rules: {
        rsiThreshold: entryRsi,
        maPeriod,
        maReinforcement,
      },
      exit_rules: {
        rsiThreshold: exitRsi,
        minProfitPct,
        sellFraction,
      },
      position_size_usd: positionSizeUsd,
      per_session_buy_count_cap: perSessionBuyCountCap,
      per_session_dollar_cap: perSessionDollarCap,
      supersedes_strategy_id: initialPayload.supersedes_strategy_id,
    };
  }

  function getInlineError(path: string): string | undefined {
    return inlineErrors.get(path);
  }

  // ───── Submit handling ────────────────────────────────────────────────

  function handleSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    if (isRevise && submitState !== "confirming") {
      // First click on Save while revising → open destructive-confirm modal
      // per AC 9. The form does NOT submit until the operator confirms.
      setSubmitState("confirming");
      return;
    }
    void runSubmit();
  }

  async function runSubmit(): Promise<void> {
    setSubmitState("pending");
    setBanner(null);
    setInlineErrors(new Map());

    const formData = new FormData();
    formData.set("name", name);
    formData.set("asset_class", initialPayload.asset_class);
    formData.set("selected_assets", JSON.stringify(selectedAssets));
    formData.set(
      "entry_rules",
      JSON.stringify({
        rsiThreshold: entryRsi,
        maPeriod,
        maReinforcement,
      }),
    );
    formData.set(
      "exit_rules",
      JSON.stringify({
        rsiThreshold: exitRsi,
        minProfitPct,
        sellFraction,
      }),
    );
    formData.set("position_size_usd", String(positionSizeUsd));
    formData.set("per_session_buy_count_cap", String(perSessionBuyCountCap));
    formData.set("per_session_dollar_cap", String(perSessionDollarCap));
    formData.set(
      "supersedes_strategy_id",
      initialPayload.supersedes_strategy_id ?? "",
    );

    let result: SaveStrategyResult | undefined;
    try {
      result = await saveStrategy(formData);
    } catch (err) {
      // Next.js NEXT_REDIRECT throws on success; re-throw so the framework
      // can handle the redirect. Anything else → network/unknown banner.
      if (
        err &&
        typeof err === "object" &&
        "digest" in err &&
        typeof err.digest === "string" &&
        err.digest.startsWith("NEXT_REDIRECT")
      ) {
        throw err;
      }
      setBanner({
        type: "network",
        copy: topErrorBannerCopy("network"),
      });
      setSubmitState("idle");
      return;
    }

    if (result.success) {
      // Server action redirected; we shouldn't reach here. Defensive
      // catch-all: stay in pending state until the navigation completes.
      return;
    }

    const errMap = new Map<string, string>();
    for (const err of result.errors) {
      const path = errorCodeToFieldPath(err.code);
      // Prefer the code-mapped verbatim copy.md string over the Zod-emitted
      // `message` (Zod messages are i18n-fluid and not from copy.md).
      errMap.set(path, errorCodeToCopy(err.code));
    }
    setInlineErrors(errMap);
    setBanner({
      type: result.error_type,
      copy: result.banner_copy,
    });
    setSubmitState("idle");

    // Per AC 10: focus first invalid field on submit-error.
    queueMicrotask(() => {
      const firstError = result.errors[0];
      if (!firstError) return;
      const path = errorCodeToFieldPath(firstError.code);
      const el = formRef.current?.querySelector<HTMLElement>(
        `[data-field-path="${path}"]`,
      );
      el?.focus();
    });
  }

  // ───── Cancel handling ────────────────────────────────────────────────

  function handleCancel(): void {
    if (isDirty(currentPayload(), initialDataRef.current)) {
      const ok = window.confirm("Discard unsaved changes?");
      if (!ok) return;
    }
    window.location.assign("/dashboard");
  }

  function dismissConfirmation(): void {
    setSubmitState("idle");
  }

  // ───── Asset selector callbacks ───────────────────────────────────────

  function removeAsset(identifier: string): void {
    setSelectedAssets((current) =>
      current.filter((a) => a.identifier !== identifier),
    );
  }

  function addAsset(asset: Asset): void {
    setSelectedAssets((current) => {
      if (current.length >= 5) return current;
      if (current.some((a) => a.identifier === asset.identifier)) return current;
      return [...current, asset];
    });
  }

  // ───── Render ─────────────────────────────────────────────────────────

  const submitInFlight = submitState === "pending";
  const showConfirmModal = submitState === "confirming";
  const submitLabel = submitInFlight
    ? "Saving…"
    : isRevise
      ? "Save revision"
      : "Save strategy";

  // Codex round-1 ISSUE closure: submit must be disabled while the form is
  // invalid AND while inline errors are active (AC 5 + AC 8). Run the
  // CB-3.0 validateStrategyPayload locally against the current payload —
  // submit disables the moment any rule violation surfaces. Inline errors
  // displayed via inlineErrors map are separate signal (set on submit
  // attempt or stale-from-prior-attempt); both gate submit.
  const liveValidation = validateStrategyPayload({
    name,
    asset_class: initialPayload.asset_class,
    selected_assets: selectedAssets,
    entry_rules: {
      rsiThreshold: entryRsi,
      maPeriod,
      maReinforcement,
    },
    exit_rules: {
      rsiThreshold: exitRsi,
      minProfitPct,
      sellFraction,
    },
    position_size_usd: positionSizeUsd,
    per_session_buy_count_cap: perSessionBuyCountCap,
    per_session_dollar_cap: perSessionDollarCap,
  });
  const isFormInvalid = !liveValidation.ok;
  const hasActiveInlineErrors = inlineErrors.size > 0;
  // PR #52: NaN sentinel means "operator cleared the field." The
  // allNumericFieldsFilled pure function (exported below) is the
  // testable derivation that gates submit on every numeric field being
  // finite.
  const numericFieldsFilled = allNumericFieldsFilled({
    entryRsi,
    exitRsi,
    minProfitPct,
    sellFraction,
    positionSizeUsd,
    perSessionBuyCountCap,
    perSessionDollarCap,
  });
  const isSubmitDisabled =
    submitInFlight ||
    isFormInvalid ||
    hasActiveInlineErrors ||
    !numericFieldsFilled;

  const candidatesByIdentifier = new Map(
    candidates.map((c) => [c.identifier, c]),
  );
  const remainingCandidates = candidates.filter(
    (c) => !selectedAssets.some((a) => a.identifier === c.identifier),
  );

  return (
    <main style={pageStyle}>
      <h1 tabIndex={-1} style={headingStyle}>
        {isRevise ? "Revise your strategy" : "Create your strategy"}
      </h1>

      {isRevise && (
        <div role="note" style={reviseBannerStyle}>
          You&rsquo;re revising the active strategy. Saving creates a new
          version; the current one is archived but stays queryable in the
          dashboard.
        </div>
      )}

      {banner && (
        <div role="alert" style={bannerStyle}>
          {banner.copy}
        </div>
      )}

      <form ref={formRef} onSubmit={handleSubmit} noValidate>
        {/* ─── Name ───────────────────────────────────────────────── */}
        <fieldset style={sectionStyle}>
          <legend style={sectionTitleStyle}>Name</legend>
          <label htmlFor="strategy-name" style={labelStyle}>
            Name
          </label>
          <input
            id="strategy-name"
            ref={nameInputRef}
            data-field-path="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My DCA strategy"
            maxLength={120}
            required
            style={inputStyle}
          />
          <p style={helperStyle}>A short name you&rsquo;ll see in the dashboard.</p>
        </fieldset>

        {/* ─── Assets ─────────────────────────────────────────────── */}
        <fieldset style={sectionStyle}>
          <legend style={sectionTitleStyle}>Assets</legend>
          <p style={helperStyle}>{topFiveAsOfText(topFiveAsOf)}</p>
          <div
            data-field-path="selected_assets"
            aria-describedby="selected-assets-error"
            style={{ marginTop: "0.5rem", marginBottom: "0.5rem" }}
          >
            {selectedAssets.map((asset) => (
              <span key={asset.identifier} style={chipStyle}>
                {asset.identifier}
                <button
                  type="button"
                  aria-label={`Remove ${asset.identifier}`}
                  onClick={() => removeAsset(asset.identifier)}
                  style={chipRemoveStyle}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
          {remainingCandidates.length > 0 && selectedAssets.length < 5 && (
            <details>
              <summary style={{ cursor: "pointer", fontSize: "0.875rem" }}>
                + Add another
              </summary>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.4rem",
                  marginTop: "0.5rem",
                }}
              >
                {remainingCandidates.map((asset) => (
                  <button
                    key={asset.identifier}
                    type="button"
                    onClick={() => addAsset(asset)}
                    style={{
                      ...chipStyle,
                      cursor: "pointer",
                      background: "#f0f0f0",
                      borderColor: "#bbb",
                    }}
                  >
                    + {asset.identifier}
                  </button>
                ))}
              </div>
            </details>
          )}
          {selectedAssets.length >= 5 && (
            <p style={helperStyle}>
              Maximum 5 reached. Remove one to add another.
            </p>
          )}
          <p style={helperStyle}>1-5 cryptos. The bot considers ONLY these.</p>
          {getInlineError("selected_assets") && (
            <p
              id="selected-assets-error"
              role="alert"
              style={errorStyle}
            >
              {getInlineError("selected_assets")}
            </p>
          )}
        </fieldset>

        {/* ─── Entry rules ───────────────────────────────────────── */}
        <fieldset style={sectionStyle}>
          <legend style={sectionTitleStyle}>Entry rules</legend>
          <p style={{ fontSize: "0.875rem", marginBottom: "0.5rem" }}>Buy when:</p>

          <label htmlFor="entry-rsi" style={labelStyle}>
            RSI threshold
          </label>
          <input
            id="entry-rsi"
            data-field-path="entry_rules.rsiThreshold"
            type="number"
            min={0}
            max={100}
            value={numericDisplay(entryRsi)}
            onChange={makeNumericChangeHandler(setEntryRsi)}
            aria-invalid={Boolean(getInlineError("entry_rules.rsiThreshold"))}
            aria-describedby={
              getInlineError("entry_rules.rsiThreshold")
                ? "entry-rsi-error"
                : undefined
            }
            style={inputStyle}
          />
          <p style={helperStyle}>
            Between 0 and 100. Lower means the bot waits for deeper dips.
          </p>
          {getInlineError("entry_rules.rsiThreshold") && (
            <p id="entry-rsi-error" role="alert" style={errorStyle}>
              {getInlineError("entry_rules.rsiThreshold")}
            </p>
          )}

          <fieldset style={{ border: "none", padding: 0, marginTop: "0.75rem" }}>
            <legend style={labelStyle}>MA period</legend>
            {MA_PERIOD_CHOICES.map((choice) => (
              <label
                key={choice}
                style={{
                  marginRight: "1rem",
                  fontSize: "0.9375rem",
                }}
              >
                <input
                  type="radio"
                  name="ma_period"
                  data-field-path={
                    choice === MA_PERIOD_CHOICES[0]
                      ? "entry_rules.maPeriod"
                      : undefined
                  }
                  value={choice}
                  checked={maPeriod === choice}
                  onChange={() => setMaPeriod(choice)}
                  aria-invalid={Boolean(
                    getInlineError("entry_rules.maPeriod"),
                  )}
                />{" "}
                {choice}
              </label>
            ))}
            <p style={helperStyle}>Days the moving average looks back over.</p>
            {getInlineError("entry_rules.maPeriod") && (
              <p role="alert" style={errorStyle}>
                {getInlineError("entry_rules.maPeriod")}
              </p>
            )}
          </fieldset>

          <label
            style={{
              ...labelStyle,
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <input
              type="checkbox"
              checked={maReinforcement}
              onChange={(e) => setMaReinforcement(e.target.checked)}
            />
            Also require price &lt; MA(period)
          </label>
          <p style={helperStyle}>
            Optional. When on, the bot only buys if the price is below its
            moving average — extra confirmation.
          </p>
        </fieldset>

        {/* ─── Exit rules ────────────────────────────────────────── */}
        <fieldset style={sectionStyle}>
          <legend style={sectionTitleStyle}>Exit rules</legend>
          <p style={{ fontSize: "0.875rem", marginBottom: "0.5rem" }}>Sell when:</p>

          <label htmlFor="exit-rsi" style={labelStyle}>
            RSI threshold
          </label>
          <input
            id="exit-rsi"
            data-field-path="exit_rules.rsiThreshold"
            type="number"
            min={0}
            max={100}
            value={numericDisplay(exitRsi)}
            onChange={makeNumericChangeHandler(setExitRsi)}
            aria-invalid={Boolean(getInlineError("exit_rules.rsiThreshold"))}
            aria-describedby={
              getInlineError("exit_rules.rsiThreshold")
                ? "exit-rsi-error"
                : undefined
            }
            style={inputStyle}
          />
          <p style={helperStyle}>
            Between 0 and 100. Must be greater than the entry RSI.
          </p>
          {getInlineError("exit_rules.rsiThreshold") && (
            <p id="exit-rsi-error" role="alert" style={errorStyle}>
              {getInlineError("exit_rules.rsiThreshold")}
            </p>
          )}

          <label htmlFor="min-profit" style={labelStyle}>
            Min profit %
          </label>
          <input
            id="min-profit"
            type="number"
            step="0.1"
            value={numericDisplay(minProfitPct)}
            onChange={makeNumericChangeHandler(setMinProfitPct)}
            style={inputStyle}
          />
          <p style={helperStyle}>
            The bot only sells if the position is at least this much in profit.
          </p>

          <label htmlFor="sell-fraction" style={labelStyle}>
            Sell fraction
          </label>
          <input
            id="sell-fraction"
            type="number"
            min={0}
            max={1}
            step="0.05"
            value={numericDisplay(sellFraction)}
            onChange={makeNumericChangeHandler(setSellFraction)}
            style={inputStyle}
          />
          <p style={helperStyle}>
            0 to 1. For example, 0.5 sells half the position; 1 sells all of
            it.
          </p>
        </fieldset>

        {/* ─── Per-buy + per-session limits ──────────────────────── */}
        <fieldset style={sectionStyle}>
          <legend style={sectionTitleStyle}>Per-buy + per-session limits</legend>

          <label htmlFor="position-size" style={labelStyle}>
            Position size (USD)
          </label>
          <input
            id="position-size"
            data-field-path="position_size_usd"
            type="number"
            min={0}
            step="1"
            value={numericDisplay(positionSizeUsd)}
            onChange={makeNumericChangeHandler(setPositionSizeUsd)}
            aria-invalid={Boolean(getInlineError("position_size_usd"))}
            aria-describedby={
              getInlineError("position_size_usd")
                ? "position-size-error"
                : undefined
            }
            style={inputStyle}
          />
          <p style={helperStyle}>How much to spend per buy signal.</p>
          {getInlineError("position_size_usd") && (
            <p id="position-size-error" role="alert" style={errorStyle}>
              {getInlineError("position_size_usd")}
            </p>
          )}

          <label htmlFor="buy-count-cap" style={labelStyle}>
            Per-session buy count
          </label>
          <input
            id="buy-count-cap"
            data-field-path="per_session_buy_count_cap"
            type="number"
            min={1}
            step="1"
            value={numericDisplay(perSessionBuyCountCap)}
            onChange={makeNumericChangeHandler(setPerSessionBuyCountCap)}
            aria-invalid={Boolean(
              getInlineError("per_session_buy_count_cap"),
            )}
            aria-describedby={
              getInlineError("per_session_buy_count_cap")
                ? "buy-count-cap-error"
                : undefined
            }
            style={inputStyle}
          />
          <p style={helperStyle}>
            Maximum number of buys the bot will fire in one trading session.
          </p>
          {getInlineError("per_session_buy_count_cap") && (
            <p id="buy-count-cap-error" role="alert" style={errorStyle}>
              {getInlineError("per_session_buy_count_cap")}
            </p>
          )}

          <label htmlFor="dollar-cap" style={labelStyle}>
            Per-session dollar cap
          </label>
          <input
            id="dollar-cap"
            data-field-path="per_session_dollar_cap"
            type="number"
            min={0}
            step="1"
            value={numericDisplay(perSessionDollarCap)}
            onChange={makeNumericChangeHandler(setPerSessionDollarCap)}
            aria-invalid={Boolean(getInlineError("per_session_dollar_cap"))}
            aria-describedby={
              getInlineError("per_session_dollar_cap")
                ? "dollar-cap-error"
                : undefined
            }
            style={inputStyle}
          />
          <p style={helperStyle}>Maximum total spend in one trading session.</p>
          {getInlineError("per_session_dollar_cap") && (
            <p id="dollar-cap-error" role="alert" style={errorStyle}>
              {getInlineError("per_session_dollar_cap")}
            </p>
          )}
        </fieldset>

        {/* ─── Submit / Cancel ───────────────────────────────────── */}
        <div style={submitRowStyle}>
          <button
            type="button"
            onClick={handleCancel}
            disabled={submitInFlight}
            style={secondaryButtonStyle}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitDisabled}
            aria-busy={submitInFlight}
            style={{
              ...primaryButtonStyle,
              opacity: isSubmitDisabled ? 0.6 : 1,
              cursor: isSubmitDisabled ? "not-allowed" : "pointer",
            }}
          >
            {submitLabel}
          </button>
        </div>
      </form>

      {/* ─── Destructive supersession confirmation modal ────────── */}
      {showConfirmModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          style={modalBackdropStyle}
          onKeyDown={(e) => {
            if (e.key === "Escape") dismissConfirmation();
          }}
        >
          <div style={modalStyle}>
            <h2 id="confirm-title" style={{ marginTop: 0 }}>
              Revise strategy?
            </h2>
            <p>
              The current version will be archived but kept queryable for the
              dashboard.
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.75rem",
                marginTop: "1rem",
              }}
            >
              <button
                type="button"
                onClick={dismissConfirmation}
                style={secondaryButtonStyle}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void runSubmit()}
                style={primaryButtonStyle}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Suppress unused-prop warning while keeping the contract */}
      <span style={{ display: "none" }} aria-hidden="true">
        {assetClass}
        {candidatesByIdentifier.size}
      </span>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers (exported for tests; pure logic, no React)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Numeric input display helper (PR #52 post-merge UX fix).
 *
 * HTML number inputs render `value={NaN}` and `value={0}` very differently
 * — `0` displays the digit "0"; `NaN` displays empty. We use `NaN` as the
 * "operator cleared the field" sentinel: this helper maps NaN → "" (empty
 * string) so the input renders empty when state is non-finite, and returns
 * the number unchanged otherwise.
 *
 * Pre-PR-#52 the field used `value={n}` directly; clearing the input sent
 * `e.target.value === ""` which `Number("")` mapped to `0`, re-rendering
 * the field with "0" stuck. Operators couldn't visually clear without
 * typing a non-zero digit first.
 */
export function numericDisplay(n: number): number | string {
  return Number.isFinite(n) ? n : "";
}

/**
 * Numeric input onChange handler factory (PR #52). Maps the empty-string
 * HTML input event to `NaN` rather than `0`, so the field state correctly
 * represents "operator cleared this." Anything else is parsed via
 * `Number(...)`.
 */
export function makeNumericChangeHandler(
  setter: (n: number) => void,
): (e: React.ChangeEvent<HTMLInputElement>) => void {
  return (e: React.ChangeEvent<HTMLInputElement>): void => {
    const v = e.target.value;
    setter(v === "" ? NaN : Number(v));
  };
}

/**
 * All 7 form numeric fields filled? (PR #52). Submit is gated on this
 * predicate so a NaN-cleared field cannot reach the server action. Zod's
 * `z.number()` accepts NaN by default and rule-branch comparisons against
 * NaN always evaluate false, so `validateStrategyPayload` alone would NOT
 * reject a half-filled form.
 */
export function allNumericFieldsFilled(values: {
  entryRsi: number;
  exitRsi: number;
  minProfitPct: number;
  sellFraction: number;
  positionSizeUsd: number;
  perSessionBuyCountCap: number;
  perSessionDollarCap: number;
}): boolean {
  return (
    Number.isFinite(values.entryRsi) &&
    Number.isFinite(values.exitRsi) &&
    Number.isFinite(values.minProfitPct) &&
    Number.isFinite(values.sellFraction) &&
    Number.isFinite(values.positionSizeUsd) &&
    Number.isFinite(values.perSessionBuyCountCap) &&
    Number.isFinite(values.perSessionDollarCap)
  );
}

/**
 * Compare two form payloads for dirty-state detection (AC 7 unsaved-changes
 * prompt). Two payloads are "equal" if every scalar field matches and the
 * selected_assets identifier lists match in order.
 */
export function isDirty(
  current: InitialPayload,
  initial: InitialPayload,
): boolean {
  if (current.name !== initial.name) return true;
  if (current.asset_class !== initial.asset_class) return true;
  if (current.position_size_usd !== initial.position_size_usd) return true;
  if (current.per_session_buy_count_cap !== initial.per_session_buy_count_cap)
    return true;
  if (current.per_session_dollar_cap !== initial.per_session_dollar_cap)
    return true;
  if (current.supersedes_strategy_id !== initial.supersedes_strategy_id)
    return true;
  if (
    current.entry_rules.rsiThreshold !== initial.entry_rules.rsiThreshold ||
    current.entry_rules.maPeriod !== initial.entry_rules.maPeriod ||
    current.entry_rules.maReinforcement !== initial.entry_rules.maReinforcement
  ) {
    return true;
  }
  if (
    current.exit_rules.rsiThreshold !== initial.exit_rules.rsiThreshold ||
    current.exit_rules.minProfitPct !== initial.exit_rules.minProfitPct ||
    current.exit_rules.sellFraction !== initial.exit_rules.sellFraction
  ) {
    return true;
  }
  if (current.selected_assets.length !== initial.selected_assets.length) {
    return true;
  }
  for (let i = 0; i < current.selected_assets.length; i++) {
    if (
      current.selected_assets[i]?.identifier !==
      initial.selected_assets[i]?.identifier
    ) {
      return true;
    }
  }
  return false;
}

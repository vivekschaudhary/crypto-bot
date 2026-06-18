"use client";

// CB-6.6 — cockpit Manual Overrides (real-money), section 5. POSTs to
// /api/bot/override with the real-money kinds (force_buy/sell_50/sell_all) +
// reset, for the viewed pair. PAPER-WHILE-DARK: while LIVE_MODE=false the route
// records dry_run orders (no real money); the confirm wording + paper-mode line
// reflect the mode so the operator always knows. Two-step confirm on every
// action (no single-click real order). Pure view + helpers are render/unit
// tested (no @testing-library — CB-3.3 #9; CB-6.5 RunNowControl precedent). All
// strings VERBATIM (refusal rule #5).

import { useRouter } from "next/navigation";
import { useState, type JSX } from "react";

export type ManualAction = "force_buy" | "sell_50" | "sell_all" | "reset";
type Phase = "idle" | "working" | "done" | "error";

const COPY = {
  label: "MANUAL OVERRIDES",
  paperMode: "Paper mode — orders are simulated (dry-run).",
  sell50: "Sell 50%",
  sellAll: "Sell All",
  reset: "Reset Session",
  confirm: "Confirm",
  cancel: "Cancel",
  placing: "Placing…",
  done: "Order recorded — see the trade log.",
  capReached: "Session cap reached — can't buy.",
  noPosition: "No position to sell.",
  error: "Override failed — try again.",
} as const;

/** Mode-aware confirm prompt (copy.md). Pure — unit-tested. */
export function overrideConfirmPrompt(
  action: ManualAction,
  pair: string,
  buyDollars: number,
  liveMode: boolean,
): string {
  const p = pair.replace("-", "/");
  switch (action) {
    case "force_buy":
      return liveMode ? `Place a REAL $${buyDollars} buy of ${p}?` : `Simulate a $${buyDollars} buy of ${p}?`;
    case "sell_50":
      return liveMode ? `Sell 50% of your REAL ${p} position?` : `Simulate selling 50% of your ${p} position?`;
    case "sell_all":
      return liveMode ? `Sell your ENTIRE REAL ${p} position?` : `Simulate selling your entire ${p} position?`;
    case "reset":
      // Reuse the CB-5.3 reset confirm copy verbatim.
      return "Reset session? This starts a fresh session. Your transaction history is kept.";
  }
}

/** Map an /api/bot/override response to the feedback line (copy.md). Pure. */
export function manualOutcomeMessage(ok: boolean, body: { error?: unknown } | null): string {
  if (ok) return COPY.done;
  const err = body && typeof body.error === "string" ? body.error : "";
  if (err === "cap-reached") return COPY.capReached;
  if (err === "no-position") return COPY.noPosition;
  return COPY.error;
}

const headingStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  letterSpacing: "0.08em",
  color: "#888",
  marginBottom: "0.5rem",
};
const paperStyle: React.CSSProperties = { color: "#8a6d00", fontSize: "0.8125rem", marginBottom: "0.5rem" };
const buttonStyle: React.CSSProperties = { padding: "0.4rem 0.9rem", fontSize: "0.9375rem", marginRight: "0.5rem", cursor: "pointer" };
const resetButtonStyle: React.CSSProperties = { ...buttonStyle, color: "#a4441b" };
const promptStyle: React.CSSProperties = { fontSize: "0.9375rem", marginBottom: "0.5rem" };
const doneStyle: React.CSSProperties = { marginTop: "0.5rem", color: "#555", fontSize: "0.875rem" };
const errorStyle: React.CSSProperties = { marginTop: "0.5rem", color: "#b00020", fontSize: "0.875rem" };

/**
 * Pure presentational view — render-tested across every state. The container
 * owns the hooks + the POST; this renders from props only.
 */
export function ManualOverridesView({
  pair,
  buyDollars,
  liveMode,
  confirming,
  phase,
  message,
  onAction,
  onConfirm,
  onCancel,
}: {
  pair: string;
  buyDollars: number;
  liveMode: boolean;
  confirming: ManualAction | null;
  phase: Phase;
  message: string | null;
  onAction: (a: ManualAction) => void;
  onConfirm: () => void;
  onCancel: () => void;
}): JSX.Element {
  const busy = phase === "working";
  return (
    <section>
      <h2 style={headingStyle}>{COPY.label}</h2>
      {!liveMode && <p style={paperStyle}>{COPY.paperMode}</p>}

      {confirming ? (
        <div>
          <p style={promptStyle}>{overrideConfirmPrompt(confirming, pair, buyDollars, liveMode)}</p>
          <button type="button" onClick={onConfirm} disabled={busy} aria-busy={busy} style={confirming === "reset" || confirming === "sell_all" ? resetButtonStyle : buttonStyle}>
            {busy ? COPY.placing : COPY.confirm}
          </button>
          <button type="button" onClick={onCancel} disabled={busy} style={buttonStyle}>
            {COPY.cancel}
          </button>
        </div>
      ) : (
        <div>
          <button type="button" onClick={() => onAction("force_buy")} style={buttonStyle}>
            {`Buy $${buyDollars}`}
          </button>
          <button type="button" onClick={() => onAction("sell_50")} style={buttonStyle}>
            {COPY.sell50}
          </button>
          <button type="button" onClick={() => onAction("sell_all")} style={buttonStyle}>
            {COPY.sellAll}
          </button>
          <button type="button" onClick={() => onAction("reset")} style={resetButtonStyle}>
            {COPY.reset}
          </button>
        </div>
      )}

      {phase === "done" && message && (
        <div role="status" style={doneStyle}>
          {message}
        </div>
      )}
      {phase === "error" && message && (
        <div role="alert" style={errorStyle}>
          {message}
        </div>
      )}
    </section>
  );
}

export function ManualOverridesCard({
  pair,
  buyDollars,
  liveMode,
}: {
  pair: string;
  buyDollars: number;
  liveMode: boolean;
}): JSX.Element {
  const router = useRouter();
  const [confirming, setConfirming] = useState<ManualAction | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (!confirming) return;
    const action = confirming;
    setPhase("working");
    try {
      const res = await fetch("/api/bot/override", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action === "reset" ? { kind: "reset" } : { kind: action, asset: pair }),
      });
      const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
      setConfirming(null);
      if (res.ok) {
        // Reset's confirmation IS the status re-render (no order message).
        if (action === "reset") {
          setPhase("idle");
          setMessage(null);
        } else {
          setPhase("done");
          setMessage(manualOutcomeMessage(true, body));
        }
        router.refresh();
        return;
      }
      setPhase("error");
      setMessage(manualOutcomeMessage(false, body));
    } catch {
      setConfirming(null);
      setPhase("error");
      setMessage(COPY.error);
    }
  }

  return (
    <ManualOverridesView
      pair={pair}
      buyDollars={buyDollars}
      liveMode={liveMode}
      confirming={confirming}
      phase={phase}
      message={message}
      onAction={(a) => {
        setConfirming(a);
        setPhase("idle");
        setMessage(null);
      }}
      onConfirm={() => void submit()}
      onCancel={() => {
        setConfirming(null);
        setPhase("idle");
      }}
    />
  );
}

"use client";

// CB-5.3 — safe override controls on the /dashboard live-state Bot status
// panel. POSTs to /api/bot/override (pause/resume/reset); on success calls
// router.refresh() so the SSR live-state re-renders with the new status +
// (after a reset) the fresh session's zeroed activity. Per design.md:
// status-aware buttons, inline reset confirm, pending/disabled, inline error.
// All visible strings are VERBATIM from copy.md (refusal rule #5).

import { useRouter } from "next/navigation";
import { useState, type JSX } from "react";

import type { OverrideKind } from "@/lib/bot/overrides";

type SessionStatus = "active" | "paused" | "reset";
type Phase = "idle" | "working" | "error";

// Copy verbatim — copy.md.
const COPY = {
  pause: "Pause",
  resume: "Resume",
  reset: "Reset session",
  helper: "Pause takes effect on the next 15-minute tick.",
  confirmPrompt: "Reset session? This starts a fresh session. Your transaction history is kept.",
  confirm: "Reset",
  cancel: "Cancel",
  working: "Working…",
  error: "Couldn't update the bot. Try again.",
} as const;

/**
 * Which buttons are shown for a session status (design.md): Pause only when
 * active; Resume only when paused; Reset always. Pure — unit-tested (the
 * render itself is verified by the Playwright e2e, per CB-3.3 Decision #9).
 */
export function controlsForStatus(status: SessionStatus): {
  showPause: boolean;
  showResume: boolean;
  showReset: boolean;
} {
  return {
    showPause: status === "active",
    showResume: status === "paused",
    showReset: true,
  };
}

const buttonStyle: React.CSSProperties = {
  padding: "0.4rem 0.9rem",
  fontSize: "0.9375rem",
  marginRight: "0.5rem",
  cursor: "pointer",
};
const resetButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  color: "#a4441b", // de-emphasized destructive-ish (design.md)
};
const helperStyle: React.CSSProperties = {
  color: "#888",
  fontSize: "0.8125rem",
  marginTop: "0.5rem",
};
const errorStyle: React.CSSProperties = {
  marginTop: "0.5rem",
  color: "#b00020",
  fontSize: "0.875rem",
};

export function OverrideControls({ status }: { status: SessionStatus }): JSX.Element {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [confirmingReset, setConfirmingReset] = useState(false);

  const isBusy = phase === "working";
  const { showPause, showResume, showReset } = controlsForStatus(status);

  async function submit(kind: OverrideKind): Promise<void> {
    setPhase("working");
    try {
      const res = await fetch("/api/bot/override", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      if (res.ok) {
        // The live-state re-render IS the confirmation (copy.md — no toast).
        setConfirmingReset(false);
        setPhase("idle");
        router.refresh();
        return;
      }
      setPhase("error");
    } catch {
      setPhase("error");
    }
  }

  return (
    <div>
      {confirmingReset ? (
        <div>
          <p style={{ fontSize: "0.9375rem", marginBottom: "0.5rem" }}>{COPY.confirmPrompt}</p>
          <button
            type="button"
            onClick={() => void submit("reset")}
            disabled={isBusy}
            aria-busy={isBusy}
            style={resetButtonStyle}
          >
            {isBusy ? COPY.working : COPY.confirm}
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmingReset(false);
              setPhase("idle");
            }}
            disabled={isBusy}
            style={buttonStyle}
          >
            {COPY.cancel}
          </button>
        </div>
      ) : (
        <div>
          {showPause && (
            <button
              type="button"
              onClick={() => void submit("pause")}
              disabled={isBusy}
              aria-busy={isBusy}
              style={buttonStyle}
            >
              {isBusy ? COPY.working : COPY.pause}
            </button>
          )}
          {showResume && (
            <button
              type="button"
              onClick={() => void submit("resume")}
              disabled={isBusy}
              aria-busy={isBusy}
              style={buttonStyle}
            >
              {isBusy ? COPY.working : COPY.resume}
            </button>
          )}
          {showReset && (
            <button
              type="button"
              onClick={() => setConfirmingReset(true)}
              disabled={isBusy}
              style={resetButtonStyle}
            >
              {COPY.reset}
            </button>
          )}
          <p style={helperStyle}>{COPY.helper}</p>
        </div>
      )}

      {phase === "error" && (
        <div role="alert" style={errorStyle}>
          {COPY.error}
        </div>
      )}
    </div>
  );
}

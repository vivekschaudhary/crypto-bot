"use client";

// CB-6.0 — cockpit Bot Status controls (Start / Pause / Stop / Run Now), per
// the operator design. Mirrors override-controls-client.tsx (CB-5.3): POSTs to
// /api/bot/override and calls router.refresh() so the SSR status re-renders.
// Mapping (operator decision — Stop = alias for paused, NO migration):
//   Start → resume   Pause → pause   Stop → pause
// Run Now is rendered DISABLED in CB-6.0 (the on-demand trigger is CB-6.3) and
// calls no endpoint. All visible strings VERBATIM from copy.md (refusal #5).
//
// New component (not an edit of override-controls-client.tsx, which the CB-5.3
// live-state panel still uses with its own pause/resume/reset labels).

import { useRouter } from "next/navigation";
import { useState, type JSX } from "react";

import type { OverrideKind } from "@/lib/bot/overrides";

type SessionStatus = "active" | "paused" | "reset";
type Phase = "idle" | "working" | "error";
type Action = "start" | "pause" | "stop";

// Copy verbatim — copy.md.
const COPY = {
  start: "Start",
  pause: "Pause",
  stop: "Stop",
  runNow: "Run Now",
  working: "Working…",
  error: "Couldn't update the bot. Try again.",
} as const;

// Control → override route kind. Stop reuses `pause` (alias; no `stop` kind in
// the override_events CHECK — operator decision, no migration). Exported for
// the unit test that pins the mapping.
export const ACTION_KIND: Record<Action, OverrideKind> = {
  start: "resume",
  pause: "pause",
  stop: "pause",
};

/**
 * Which controls are shown for a session status: when running → Pause + Stop;
 * when not running (paused/reset) → Start. Run Now is always present (disabled
 * in CB-6.0). Pure — unit-tested (render verified by Playwright e2e).
 */
export function controlsForStatus(status: SessionStatus): {
  showStart: boolean;
  showPause: boolean;
  showStop: boolean;
} {
  const running = status === "active";
  return { showStart: !running, showPause: running, showStop: running };
}

const buttonStyle: React.CSSProperties = {
  padding: "0.4rem 0.9rem",
  fontSize: "0.9375rem",
  marginRight: "0.5rem",
  cursor: "pointer",
};
const disabledStyle: React.CSSProperties = {
  ...buttonStyle,
  cursor: "not-allowed",
  color: "#aaa",
};
const errorStyle: React.CSSProperties = {
  marginTop: "0.5rem",
  color: "#b00020",
  fontSize: "0.875rem",
};

export function BotControls({ status }: { status: SessionStatus }): JSX.Element {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const isBusy = phase === "working";
  const { showStart, showPause, showStop } = controlsForStatus(status);

  async function submit(action: Action): Promise<void> {
    setPhase("working");
    try {
      const res = await fetch("/api/bot/override", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: ACTION_KIND[action] }),
      });
      if (res.ok) {
        // The status re-render IS the confirmation (no toast) — copy.md.
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
      <div>
        {showStart && (
          <button type="button" onClick={() => void submit("start")} disabled={isBusy} aria-busy={isBusy} style={buttonStyle}>
            {isBusy ? COPY.working : COPY.start}
          </button>
        )}
        {showPause && (
          <button type="button" onClick={() => void submit("pause")} disabled={isBusy} aria-busy={isBusy} style={buttonStyle}>
            {isBusy ? COPY.working : COPY.pause}
          </button>
        )}
        {showStop && (
          <button type="button" onClick={() => void submit("stop")} disabled={isBusy} aria-busy={isBusy} style={buttonStyle}>
            {isBusy ? COPY.working : COPY.stop}
          </button>
        )}
        {/* Run Now — disabled in CB-6.0 (on-demand trigger is CB-6.3). */}
        <button type="button" disabled aria-disabled title="Coming soon" style={disabledStyle}>
          {COPY.runNow}
        </button>
      </div>
      {phase === "error" && (
        <div role="alert" style={errorStyle}>
          {COPY.error}
        </div>
      )}
    </div>
  );
}

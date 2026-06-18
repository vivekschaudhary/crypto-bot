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
// CB-6.5 — Run Now has its own outcomes (independent of the override controls).
type RunPhase = "idle" | "working" | "done" | "skipped" | "error";
type Action = "start" | "pause" | "stop";

// Copy verbatim — copy.md.
const COPY = {
  start: "Start",
  pause: "Pause",
  stop: "Stop",
  runNow: "Run Now",
  working: "Working…",
  error: "Couldn't update the bot. Try again.",
  // CB-6.5 Run Now feedback (copy.md).
  running: "Running…",
  runDone: "Done — see the trade log.",
  runSkipped: "Bot is paused — resume to run.",
  runError: "Run failed — try again.",
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
 * when not running (paused/reset) → Start. Run Now is always present. Pure —
 * unit-tested (render verified by Playwright e2e).
 */
export function controlsForStatus(status: SessionStatus): {
  showStart: boolean;
  showPause: boolean;
  showStop: boolean;
} {
  const running = status === "active";
  return { showStart: !running, showPause: running, showStop: running };
}

/**
 * Map a /api/run-now response to the Run Now feedback phase. Pure — unit-tested.
 * A `skipped` body (bot paused/stopped) → "skipped" feedback; any other ok body
 * (ran / duplicate) → "done"; a non-ok response → "error".
 */
export function runOutcomePhase(ok: boolean, body: Record<string, unknown> | null): RunPhase {
  if (!ok) return "error";
  if (body && body.skipped !== undefined) return "skipped";
  return "done";
}

/**
 * Run Now button + its feedback line. PURE presentational (no hooks) so the
 * full state matrix is render-testable via JSON.stringify (the repo's pattern;
 * no @testing-library — CB-3.3 Decision #9). BotControls owns the phase state.
 * Copy verbatim — copy.md.
 */
export function RunNowControl({ phase, onRun }: { phase: RunPhase; onRun: () => void }): JSX.Element {
  const busy = phase === "working";
  return (
    <>
      <button type="button" onClick={onRun} disabled={busy} aria-busy={busy} style={buttonStyle}>
        {busy ? COPY.running : COPY.runNow}
      </button>
      {phase === "done" && (
        <span role="status" style={runStatusStyle}>
          {COPY.runDone}
        </span>
      )}
      {phase === "skipped" && (
        <span role="status" style={runStatusStyle}>
          {COPY.runSkipped}
        </span>
      )}
      {phase === "error" && (
        <span role="alert" style={errorStyle}>
          {COPY.runError}
        </span>
      )}
    </>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: "0.4rem 0.9rem",
  fontSize: "0.9375rem",
  marginRight: "0.5rem",
  cursor: "pointer",
};
const errorStyle: React.CSSProperties = {
  marginTop: "0.5rem",
  color: "#b00020",
  fontSize: "0.875rem",
};
const runStatusStyle: React.CSSProperties = {
  marginTop: "0.5rem",
  color: "#555",
  fontSize: "0.875rem",
};

export function BotControls({ status }: { status: SessionStatus }): JSX.Element {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [runPhase, setRunPhase] = useState<RunPhase>("idle");
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

  // CB-6.5 — Run Now: trigger ONE bot evaluation (dry-run while dark). On a
  // ran/duplicate outcome, refresh so the new tick shows in Signals + Trade Log;
  // a skipped outcome (bot paused) surfaces its own line; errors → "Run failed".
  async function runNow(): Promise<void> {
    setRunPhase("working");
    try {
      const res = await fetch("/api/run-now", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
      });
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      const next = runOutcomePhase(res.ok, body);
      setRunPhase(next);
      if (next === "done") router.refresh();
    } catch {
      setRunPhase("error");
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
        {/* Run Now — CB-6.5: on-demand bot evaluation (dry-run while dark). */}
        <RunNowControl phase={runPhase} onRun={() => void runNow()} />
      </div>
      {phase === "error" && (
        <div role="alert" style={errorStyle}>
          {COPY.error}
        </div>
      )}
    </div>
  );
}

// `app/dashboard/signals-card.tsx` — CB-6.3 cockpit section 4.
//
// Server Component, presentational: renders the viewed pair's latest signal as
// RSI Zone, Price vs MA<period>, and Next Action (decision + reason verbatim).
// The RSI zone is STRATEGY-RELATIVE (the strategy's own entry/exit RSI
// thresholds, NOT a textbook 30/70) so the cockpit never contradicts
// /dashboard/trace. Decision colors match CB-5.1 trace. Copy VERBATIM (refusal
// rule #5). Pure derivation — no I/O. Cell text is built as single strings so
// render tests see contiguous values (the CB-6.1 split-text-node lesson).

import type { JSX } from "react";

import type { CockpitSignal } from "@/lib/dashboard/cockpit-signals";
import type { Decision } from "@/lib/dashboard/decision-trace";

const COPY = {
  label: "SIGNALS",
  rsiZone: "RSI ZONE",
  nextAction: "NEXT ACTION",
} as const;

// Match CB-5.1 trace (app/dashboard/trace/page.tsx).
const decisionColor: Record<Decision, string> = {
  buy: "#1b5e20",
  sell: "#8a6d00",
  hold: "#444",
};

const headingStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  letterSpacing: "0.08em",
  color: "#888",
  marginBottom: "0.5rem",
};
const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "1rem",
  padding: "0.25rem 0",
};
const rowLabelStyle: React.CSSProperties = { fontSize: "0.6875rem", letterSpacing: "0.06em", color: "#aaa" };
const rowValueStyle: React.CSSProperties = { fontSize: "0.9375rem", fontWeight: 600 };
const badgeStyle: React.CSSProperties = { fontSize: "1.125rem", fontWeight: 800, letterSpacing: "0.04em" };
const reasonStyle: React.CSSProperties = { fontSize: "0.8125rem", color: "#666", marginTop: "0.25rem" };

function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Strategy-relative RSI zone (copy.md — NOT hardcoded 30/70). */
function rsiZone(rsi: number, entryRsiThreshold: number, exitRsiThreshold: number): string {
  if (rsi <= entryRsiThreshold) return "Oversold";
  if (rsi >= exitRsiThreshold) return "Overbought";
  return "Neutral";
}

/** Price-vs-MA relation glyph + word. */
function priceVsMa(lastClose: number, ma: number): { glyph: string; word: string } {
  if (lastClose > ma) return { glyph: ">", word: "Above" };
  if (lastClose < ma) return { glyph: "<", word: "Below" };
  return { glyph: "=", word: "At" };
}

/**
 * Derive the operator-facing NEXT ACTION from the decision + whether a REAL
 * (non-dust) position is held. Fix 2026-06-22: when flat (no real position),
 * never show SELL — show a forward-looking buy-watch ("WAITING TO BUY · enters
 * when RSI < entry"). A stored `sell` against a dust/closed position (no real
 * holding) is treated as flat too, so a stale dust-sell renders correctly even
 * before the next tick. `tone` picks the badge color. Pure — unit-tested.
 */
export function nextAction(
  signal: Pick<CockpitSignal, "decision" | "rsi" | "reason">,
  hasRealPosition: boolean,
  entryRsiThreshold: number,
  exitRsiThreshold: number,
): { label: string; detail: string; tone: Decision } {
  if (signal.decision === "buy") return { label: "BUY", detail: signal.reason, tone: "buy" };
  if (signal.decision === "sell" && hasRealPosition) {
    return { label: "SELL", detail: signal.reason, tone: "sell" };
  }
  // hold, or a sell with no real position (dust/stale):
  if (hasRealPosition) {
    // Real position, not selling → holding toward take-profit.
    return { label: "HOLDING", detail: signal.reason, tone: "hold" };
  }
  // Flat (no position / dust) → buy-watch.
  const zone =
    signal.rsi === null
      ? ""
      : ` (currently ${signal.rsi.toFixed(1)}, ${rsiZone(signal.rsi, entryRsiThreshold, exitRsiThreshold)})`;
  return {
    label: "WAITING TO BUY",
    detail: `Enters when RSI < ${entryRsiThreshold}${zone}`,
    tone: "buy",
  };
}

export function SignalsCard({
  signal,
  hasRealPosition,
  entryRsiThreshold,
  exitRsiThreshold,
  maPeriod,
}: {
  signal: CockpitSignal;
  hasRealPosition: boolean;
  entryRsiThreshold: number;
  exitRsiThreshold: number;
  maPeriod: number;
}): JSX.Element {
  const action = nextAction(signal, hasRealPosition, entryRsiThreshold, exitRsiThreshold);
  const rsiCell =
    signal.rsi === null
      ? "—"
      : `${signal.rsi.toFixed(1)}  ·  ${rsiZone(signal.rsi, entryRsiThreshold, exitRsiThreshold)}`;

  let maCell = "—";
  if (signal.lastClose !== null && signal.ma !== null) {
    const rel = priceVsMa(signal.lastClose, signal.ma);
    maCell = `${fmtUsd(signal.lastClose)} ${rel.glyph} ${fmtUsd(signal.ma)}  ·  ${rel.word}`;
  }

  return (
    <section>
      <h2 style={headingStyle}>{COPY.label}</h2>

      <div style={rowStyle}>
        <span style={rowLabelStyle}>{COPY.rsiZone}</span>
        <span style={rowValueStyle}>{rsiCell}</span>
      </div>

      <div style={rowStyle}>
        <span style={rowLabelStyle}>{`PRICE vs MA${maPeriod}`}</span>
        <span style={rowValueStyle}>{maCell}</span>
      </div>

      <div style={{ marginTop: "0.75rem" }}>
        <div style={rowLabelStyle}>{COPY.nextAction}</div>
        <span style={{ ...badgeStyle, color: decisionColor[action.tone] }}>{action.label}</span>
        <p style={reasonStyle}>{action.detail}</p>
      </div>
    </section>
  );
}

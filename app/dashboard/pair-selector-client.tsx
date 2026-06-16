"use client";

// CB-6.1 — pair selector for the cockpit (the cockpit is a per-pair VIEW). A
// native <select> (keyboard-operable) of the strategy's selected assets;
// changing it navigates to /dashboard?pair=<id> (SSR re-render — no polling,
// brief PM Decision #2). Label "Pair" VERBATIM (copy.md).

import { useRouter } from "next/navigation";
import type { JSX } from "react";

const labelStyle: React.CSSProperties = {
  fontSize: "0.9375rem",
  color: "#555",
  marginBottom: "1rem",
  display: "inline-block",
};
const selectStyle: React.CSSProperties = {
  fontSize: "0.9375rem",
  padding: "0.25rem 0.4rem",
  marginLeft: "0.4rem",
};

export function PairSelector({ pairs, current }: { pairs: string[]; current: string }): JSX.Element {
  const router = useRouter();
  return (
    <label style={labelStyle}>
      Pair
      <select
        value={current}
        onChange={(e) => router.push(`/dashboard?pair=${encodeURIComponent(e.target.value)}`)}
        style={selectStyle}
        aria-label="Pair"
      >
        {pairs.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    </label>
  );
}

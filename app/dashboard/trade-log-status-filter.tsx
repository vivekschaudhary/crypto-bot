"use client";

// CB-6.4 — status filter for the cockpit Trade Log. A native <select>
// (keyboard-operable); changing it navigates to /dashboard?pair=<id>&txStatus=
// (SSR re-render — same pattern as the CB-6.1 pair selector). Preserves the
// viewed pair. Label "Status" + option labels VERBATIM (copy.md).

import { useRouter } from "next/navigation";
import type { JSX } from "react";

import type { TradeLogStatus } from "@/lib/dashboard/cockpit-trade-log";

const OPTIONS: { value: TradeLogStatus; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "dry_run", label: "Dry run" },
  { value: "submitted", label: "Submitted" },
  { value: "failed", label: "Failed" },
  { value: "skipped", label: "Skipped" },
];

const labelStyle: React.CSSProperties = { fontSize: "0.8125rem", color: "#555" };
const selectStyle: React.CSSProperties = { fontSize: "0.8125rem", padding: "0.2rem 0.35rem", marginLeft: "0.4rem" };

export function TradeLogStatusFilter({
  pair,
  current,
}: {
  pair: string;
  current: TradeLogStatus;
}): JSX.Element {
  const router = useRouter();
  return (
    <label style={labelStyle}>
      Status
      <select
        value={current}
        onChange={(e) =>
          router.push(`/dashboard?pair=${encodeURIComponent(pair)}&txStatus=${e.target.value}`)
        }
        style={selectStyle}
        aria-label="Status"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

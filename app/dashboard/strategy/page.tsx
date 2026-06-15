// `app/dashboard/strategy/page.tsx` — Server Component shell for the strategy
// authoring surface.
//
// CB-3.3 (FOURTH + LAST CB-3 STORY) per architecture Decision #6 form
// architecture. Server Component pattern: auth gate is structural via
// proxy.ts (no per-route auth code needed); initial state is fetched
// server-side (active strategy + top-5 from coinbase adapter) and passed
// as props into the Client Component.
//
// ENGINEER DRI DECISIONS (CB-3.3 build):
//   #5  Top-5 fetched SERVER-SIDE on initial render — no client waterfall;
//       the operator sees the pre-filled selector immediately on mount.
//       10s timeout per AC 11 edge case.
//   No `_form.tsx` — file naming follows the existing repo convention of
//   hyphenated client components (sign-out-client, setup-client, …).
//
// SECURITY: proxy.ts already gates /dashboard/strategy (PUBLIC_EXACT does
// NOT include it; any non-public path with no valid session → 302 to
// /sign-in?next=...). This page reads `x-session-user-id` only for the
// initial active-strategy fetch context (the actual created_by_user_id is
// assigned server-side in saveStrategy from the same header).

import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { JSX } from "react";

import { makeCoinbaseAdapter } from "@/lib/strategy-coinbase/adapter";
import { getActiveStrategy } from "@/lib/strategies/db";
import {
  buildEmptyStateDefaults,
  topFiveAsOfText,
  topFiveFallbackCopy,
} from "@/lib/strategies/defaults";
import { topN } from "@/lib/strategy-core/top-n";
import type { Asset, Strategy } from "@/lib/strategy-core/types";

import {
  StrategyFormClient,
  type StrategyFormLabels,
} from "./strategy-form-client";

/**
 * Crypto-coinbase-specific labels passed to the otherwise-agnostic
 * StrategyFormClient (PR #53 portability refactor). The form Client
 * Component receives these as a labels prop; equity-app's future page.tsx
 * will construct its own StrategyFormLabels (e.g., "1-5 stocks", "Selected
 * from your screener", "Pick between 1 and 5 stocks") and reuse the same
 * form unchanged. Per copy.md § Page-level + Assets selector header +
 * Inline field errors.
 */
/**
 * Build the crypto-coinbase labels for the form. `assetSelectorHeader` is
 * computed to a STRING here (server-side) from the as-of date — it must NOT
 * be passed as a function, which is not RSC-serializable and 500s every
 * production render of this route (regression 2026-06-15: "Functions cannot
 * be passed directly to Client Components"). The route layer owns composing
 * its own header copy; the form Client Component just renders the string.
 */
function coinbaseLabels(topFiveAsOf: Date): StrategyFormLabels {
  return {
    assetsHelperText: "1-5 cryptos. The bot considers ONLY these.",
    assetSelectorHeader: topFiveAsOfText(topFiveAsOf),
    errorOverrides: {
      SELECTED_ASSETS_COUNT_OUT_OF_RANGE: "Pick between 1 and 5 cryptos.",
    },
  };
}

/**
 * Per copy.md § Page-level — the browser title discriminates create vs
 * revise mode. Both strings are verbatim from copy.md (AC 14).
 *
 * Round-2 closure (Codex PR #49): metadata implementation was missing in
 * round-0 + round-1. generateMetadata fetches active strategy to drive
 * the same isRevise discriminator the page uses. The duplicate Postgres
 * call is acceptable cost for single-operator MVP (the query is a single
 * indexed row read); React's `cache()` could dedupe later if perf surfaces
 * as a concern.
 *
 * Failure-tolerance: any DB error here falls back to create-mode title so
 * metadata can never block page render.
 */
export async function generateMetadata(): Promise<Metadata> {
  let isRevise = false;
  try {
    isRevise = (await getActiveStrategy()) !== null;
  } catch {
    isRevise = false;
  }
  return {
    title: isRevise
      ? "Revise your strategy · DCA bot"
      : "Create your strategy · DCA bot",
  };
}

const TOP_FIVE_FETCH_TIMEOUT_MS = 10_000;
const COINBASE_ASSET_CLASS = "crypto-coinbase";

const pageStyle: React.CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  padding: "2rem",
  maxWidth: 640,
  margin: "0 auto",
};

const headerStyle: React.CSSProperties = {
  marginBottom: "1rem",
  fontSize: "0.9375rem",
};

const linkStyle: React.CSSProperties = {
  color: "#446",
  textDecoration: "underline",
};

const fallbackBannerStyle: React.CSSProperties = {
  background: "#fff3f3",
  border: "1px solid #d99",
  color: "#b00020",
  padding: "0.75rem 1rem",
  borderRadius: 4,
  marginBottom: "1.25rem",
};

/**
 * Wrap an async fetch with a timeout. On timeout, resolves with `kind:
 * "timeout"`; on error, resolves with `kind: "error"` + the error; on
 * success, resolves with `kind: "ok"` + the value. Never rejects.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<
  | { kind: "ok"; value: T }
  | { kind: "timeout" }
  | { kind: "error"; error: unknown }
> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race<T | "__timeout__">([
      promise,
      new Promise<"__timeout__">((resolve) => {
        timeoutHandle = setTimeout(() => resolve("__timeout__"), ms);
      }),
    ]);
    if (value === "__timeout__") return { kind: "timeout" };
    return { kind: "ok", value: value as T };
  } catch (error) {
    return { kind: "error", error };
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

export default async function StrategyPage(): Promise<JSX.Element> {
  // Read the proxy-forwarded session id. proxy.ts has already verified the
  // session; an absent header means something is wrong with the framework
  // contract — redirect rather than rendering an unauthenticated form.
  const h = await headers();
  const sessionUserId = h.get("x-session-user-id");
  if (!sessionUserId) {
    redirect("/sign-in?next=%2Fdashboard%2Fstrategy");
  }

  // Fetch the active strategy (pre-fill for revise mode) AND the top-5
  // candidate set (pre-fill for first-time empty state). Both run
  // server-side; the form mounts with both already resolved.
  const adapter = makeCoinbaseAdapter();

  const activeStrategyResult = await withTimeout(
    getActiveStrategy(),
    TOP_FIVE_FETCH_TIMEOUT_MS,
  );
  const topFiveResult = await withTimeout(
    topN(adapter, 5),
    TOP_FIVE_FETCH_TIMEOUT_MS,
  );

  // Top-5 fallback per AC 11: if the Coinbase call fails, render the form
  // without a pre-fill + a top-of-form notice. The form is still operable
  // for revise mode (active strategy carries its own selected_assets);
  // first-time empty state has no candidate set so submit will fail
  // validation until the operator adds at least one asset manually (which
  // requires the candidates list — degraded state).
  let topFive: Asset[] = [];
  let topFiveAsOf = new Date();
  let topFiveFallback: "timeout" | "error" | null = null;
  if (topFiveResult.kind === "ok") {
    topFive = topFiveResult.value;
  } else if (topFiveResult.kind === "timeout") {
    topFiveFallback = "timeout";
  } else {
    topFiveFallback = "error";
  }

  // Active strategy fallback: read errors fall back to "no active" → empty
  // state. The form simply renders defaults; the operator can author
  // a fresh strategy.
  let activeStrategy: Strategy | null = null;
  if (activeStrategyResult.kind === "ok") {
    activeStrategy = activeStrategyResult.value;
  }

  const isRevise = activeStrategy !== null;
  const initialPayload = activeStrategy
    ? {
        name: activeStrategy.name,
        asset_class: activeStrategy.asset_class,
        selected_assets: activeStrategy.selected_assets,
        entry_rules: {
          rsiThreshold: activeStrategy.entry_rules.rsiThreshold,
          maPeriod: activeStrategy.entry_rules.maPeriod,
          maReinforcement: activeStrategy.entry_rules.maReinforcement ?? false,
        },
        exit_rules: activeStrategy.exit_rules,
        position_size_usd: activeStrategy.position_size_usd,
        per_session_buy_count_cap: activeStrategy.per_session_buy_count_cap,
        per_session_dollar_cap: activeStrategy.per_session_dollar_cap,
        supersedes_strategy_id: activeStrategy.id as unknown as string,
      }
    : buildEmptyStateDefaults({
        selectedAssets: topFive,
        assetClass: COINBASE_ASSET_CLASS,
      });

  // Codex BLOCKER 4 closure: when top-5 fails AND there's no active strategy
  // (first-time authoring), render a degraded page — fallback notice + retry
  // link back to /dashboard — NOT the form with empty candidates. The story
  // (story.md AC 11) + design.md explicitly require "form unavailable + retry
  // link." For revise mode (active strategy exists), the form is still
  // operable because the operator's selected_assets are persisted on the
  // active row; the top-5 candidate list is only needed for first-time
  // authoring's pre-fill.
  if (topFiveFallback && !isRevise) {
    return (
      <div style={pageStyle}>
        <div style={headerStyle}>
          <a href="/dashboard" style={linkStyle}>
            ← Back to dashboard
          </a>
        </div>
        <div role="alert" style={fallbackBannerStyle}>
          {topFiveFallbackCopy(topFiveFallback)}
        </div>
        <p style={{ fontSize: "0.9375rem" }}>
          <a href="/dashboard" style={linkStyle}>
            Return to dashboard and try again
          </a>
        </p>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <a href="/dashboard" style={linkStyle}>
          ← Back to dashboard
        </a>
      </div>
      {topFiveFallback && (
        <div role="alert" style={fallbackBannerStyle}>
          {topFiveFallbackCopy(topFiveFallback)}
        </div>
      )}
      <StrategyFormClient
        assetClass={COINBASE_ASSET_CLASS}
        initialPayload={initialPayload}
        candidates={topFive}
        isRevise={isRevise}
        labels={coinbaseLabels(topFiveAsOf)}
      />
    </div>
  );
}

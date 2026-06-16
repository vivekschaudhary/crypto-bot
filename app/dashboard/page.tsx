// CB-6.0 — /dashboard is now the Crypto cockpit (single-screen), per the
// operator design (ETH_USD Bot — Coinbase.pdf). The 3-tab shell (Mutual Funds
// / Equity / Crypto) lives in app/dashboard/layout.tsx. This page recomposes
// CB-5's live-state read model into the cockpit frame: section 1 (Bot Status)
// is built; sections 2–6 (Profit/Loss · Current Position · Signals · Manual
// Overrides · Trade Log) are "Coming soon" placeholders filled in CB-6.1–6.4.
// The decision-trace + ledger views remain reachable via links in their cards.
// Read-only (writes happen only via the controls' POST to /api/bot/override).
//
// Proxy.ts gates this route; the x-session-* headers are CONVENIENCE only
// (CB-1.4 Decision #5) — used here for the device-label footer line.

import { headers } from "next/headers";
import type { JSX } from "react";

import { loadCockpitPosition, resolveViewedPair } from "@/lib/dashboard/cockpit-position";
import { loadLiveState } from "@/lib/dashboard/live-state";
import { db } from "@/lib/db/client";
import { getActiveStrategy } from "@/lib/strategies/db";

import { BotStatusPanel } from "./bot-status-panel";
import { CockpitSection } from "./cockpit-section";
import { CurrentPositionCard } from "./current-position-card";
import { LiveModeBanner } from "./live-mode-banner";
import { PairSelector } from "./pair-selector-client";
import { SignOutClient } from "./sign-out-client";

const pageStyle: React.CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  padding: "0 2rem 2rem",
  maxWidth: 960,
  margin: "0 auto",
};
const chromeStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  marginBottom: "1rem",
};
const eyebrowStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  letterSpacing: "0.1em",
  color: "#3b5bdb",
  fontWeight: 700,
  marginBottom: "0.25rem",
};
const titleStyle: React.CSSProperties = {
  fontSize: "1.75rem",
  fontWeight: 800,
  marginBottom: "1.25rem",
};
const statusCardStyle: React.CSSProperties = {
  border: "1px solid #eee",
  borderRadius: 6,
  padding: "1rem",
};
const deviceStyle: React.CSSProperties = {
  borderTop: "1px solid #ddd",
  marginTop: "1.5rem",
  paddingTop: "1rem",
  color: "#777",
  fontSize: "0.875rem",
};
const successBannerStyle: React.CSSProperties = {
  background: "#e8f5e9",
  border: "1px solid #4caf50",
  color: "#1b5e20",
  padding: "0.75rem 1rem",
  borderRadius: 4,
  marginBottom: "1.25rem",
  fontSize: "0.9375rem",
};
const linkStyle: React.CSSProperties = { color: "#446", textDecoration: "underline" };

type CredRow = { device_label: string | null };

interface DashboardPageProps {
  searchParams?: Promise<{ strategy?: string; pair?: string }>;
}

export default async function DashboardPage(
  { searchParams }: DashboardPageProps = {},
): Promise<JSX.Element> {
  const resolvedSearchParams = (await searchParams) ?? {};
  const showStrategySavedBanner = resolvedSearchParams.strategy === "saved";

  const h = await headers();
  const userId = h.get("x-session-user-id");

  let deviceLabel: string | null = null;
  if (userId) {
    try {
      const sql = db();
      const rows = await sql<CredRow[]>`
        SELECT device_label FROM auth_credentials WHERE user_id = ${userId} LIMIT 1
      `;
      deviceLabel = rows[0]?.device_label ?? null;
    } catch {
      deviceLabel = null;
    }
  }
  const connectedDevice = deviceLabel && deviceLabel.length > 0 ? deviceLabel : "this device";

  // CB-5.0 live-state read model (SSR per load), recomposed into the cockpit.
  const liveState = await loadLiveState();

  // CB-6.1 — per-pair view: pick the viewed pair from ?pair + the strategy's
  // selected assets, then load that pair's Current Position (held/price/RSI).
  const strategy = await getActiveStrategy();
  const pairs = strategy?.selected_assets.map((a) => a.identifier) ?? [];
  const viewedPair = resolveViewedPair(resolvedSearchParams.pair, pairs);
  const cockpitPosition = viewedPair ? await loadCockpitPosition(viewedPair) : null;
  const title = viewedPair ? `${viewedPair.replace("-", "/")} Trading Bot` : "Crypto Trading Bot";

  return (
    <main style={pageStyle}>
      <div style={chromeStyle}>
        <SignOutClient />
      </div>

      <div style={eyebrowStyle}>DCA + SIGNAL EXIT · COINBASE</div>
      <h1 style={titleStyle}>{title}</h1>
      {viewedPair && pairs.length > 0 && <PairSelector pairs={pairs} current={viewedPair} />}

      <LiveModeBanner liveMode={liveState.liveMode} />

      {showStrategySavedBanner && (
        <div role="status" style={successBannerStyle}>
          Strategy saved. Bot will pick it up on the next tick.
        </div>
      )}

      {/* Section 1 — Bot Status (built). */}
      <div style={statusCardStyle}>
        <BotStatusPanel session={liveState.session} />
      </div>

      {/* Sections 2–6 — Current Position built (CB-6.1); rest scaffolded. */}
      <CockpitSection label="PROFIT / LOSS" />
      {cockpitPosition ? (
        <div style={{ ...statusCardStyle, marginTop: "1rem" }}>
          <CurrentPositionCard data={cockpitPosition} />
        </div>
      ) : (
        <CockpitSection label="CURRENT POSITION" />
      )}
      <CockpitSection label="SIGNALS">
        <p style={{ fontSize: "0.875rem", color: "#aaa", marginBottom: "0.25rem" }}>Coming soon</p>
        <a href="/dashboard/trace" style={linkStyle}>
          View decision trace →
        </a>
      </CockpitSection>
      <CockpitSection label="MANUAL OVERRIDES" />
      <CockpitSection label="TRADE LOG">
        <p style={{ fontSize: "0.875rem", color: "#aaa", marginBottom: "0.25rem" }}>Coming soon</p>
        <a href="/dashboard/ledger" style={linkStyle}>
          View transaction ledger →
        </a>
      </CockpitSection>

      <p style={{ marginTop: "1.25rem" }}>
        <a href="/dashboard/strategy" style={linkStyle}>
          Create or revise your DCA strategy
        </a>
      </p>
      <p style={deviceStyle}>Connected device: {connectedDevice}</p>
    </main>
  );
}

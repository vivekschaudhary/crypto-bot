// CB-1.6 — /dashboard (Server Component, proxy-gated, minimal post-auth landing).
// Per docs/bets/CB-1/stories/CB-1.6/design.md § Surface 4 + copy.md § /dashboard.
//
// Proxy.ts has already gated this route via verifySession + DB row check.
// Per CB-1.4 Engineer DRI Decision #5, this page may use the proxy-forwarded
// x-session-* headers as CONVENIENCE for rendering (NOT auth claims). The
// page is read-only — it does not mutate state, so re-verification at the
// handler layer is not required for this surface specifically. The Sign Out
// button POSTs to /api/auth/sign-out which DOES re-verify (per CB-1.5).
//
// CB-3.3 amendment: render a success banner when ?strategy=saved is present
// (the strategy authoring save action redirects here) + a link to
// /dashboard/strategy so the operator has an entry point.

import { headers } from "next/headers";
import type { JSX } from "react";

import { db } from "@/lib/db/client";

import { SignOutClient } from "./sign-out-client";

const pageStyle: React.CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  padding: "2rem",
  maxWidth: 960,
  margin: "0 auto",
};

const chromeStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  borderBottom: "1px solid #ddd",
  paddingBottom: "1rem",
  marginBottom: "2rem",
};

const titleStyle: React.CSSProperties = {
  fontSize: "1.25rem",
  fontWeight: 600,
};

const bodyStyle: React.CSSProperties = {
  marginBottom: "1.5rem",
};

const placeholderStyle: React.CSSProperties = {
  color: "#666",
  marginBottom: "2rem",
};

const deviceStyle: React.CSSProperties = {
  borderTop: "1px solid #ddd",
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

const linkStyle: React.CSSProperties = {
  color: "#446",
  textDecoration: "underline",
};

type CredRow = { device_label: string | null };

interface DashboardPageProps {
  searchParams?: Promise<{ strategy?: string }>;
}

export default async function DashboardPage(
  { searchParams }: DashboardPageProps = {},
): Promise<JSX.Element> {
  const resolvedSearchParams = (await searchParams) ?? {};
  const showStrategySavedBanner = resolvedSearchParams.strategy === "saved";

  const h = await headers();
  // Convenience read — proxy.ts forwards the verified session ids via the
  // cloned-request-headers mechanism (CB-1.4 AC 1). NOT trusted as an auth
  // claim; the proxy gate already authenticated this request. We use it
  // only to fetch the credential's device_label for the rendering line.
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
      // Best-effort; rendering falls back to "this device" if the lookup
      // fails. The page's correctness doesn't depend on this read.
      deviceLabel = null;
    }
  }

  const connectedDevice = deviceLabel && deviceLabel.length > 0
    ? deviceLabel
    : "this device";

  return (
    <main style={pageStyle}>
      <div style={chromeStyle}>
        <div style={titleStyle}>crypto-bot</div>
        <SignOutClient />
      </div>
      {showStrategySavedBanner && (
        <div role="status" style={successBannerStyle}>
          Strategy saved. Bot will pick it up on the next tick.
        </div>
      )}
      <p style={bodyStyle}>Signed in.</p>
      <p style={{ marginBottom: "1.25rem" }}>
        <a href="/dashboard/strategy" style={linkStyle}>
          Create or revise your DCA strategy
        </a>
      </p>
      <p style={placeholderStyle}>
        Bot controls and decision trace will arrive in the next bet (CB-2).
      </p>
      <p style={deviceStyle}>Connected device: {connectedDevice}</p>
    </main>
  );
}

// CB-1.6 — /setup (Server Component, mode-gated).
// Per docs/bets/CB-1/stories/CB-1.6/design.md § Surface 2 + copy.md § /setup.
//
// Gate:
//   - active session       → redirect('/dashboard')
//   - count(creds) >= 1    → redirect('/sign-in')  (CB-1.2 first-time-only contract)
//   - count(creds) = 0     → render setup card + SetupClient
//
// The client component handles the WebAuthn ceremony; this page is just the
// gate + the surrounding chrome.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { JSX } from "react";

import { getCredentialCount } from "@/lib/auth/credential-count";
import { verifySession } from "@/lib/auth/sessions";

import { SetupClient } from "./setup-client";

const SESSION_COOKIE_NAME = "__compass_session";

const cardStyle: React.CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  padding: "4rem 2rem",
  maxWidth: 520,
  margin: "0 auto",
  textAlign: "center",
};

const headerStyle: React.CSSProperties = {
  fontSize: "1.125rem",
  fontWeight: 500,
  color: "#333",
  marginBottom: "0.5rem",
};

const dividerStyle: React.CSSProperties = {
  border: 0,
  borderTop: "1px solid #ddd",
  margin: "0 auto 2rem",
  width: "12rem",
};

const introStyle: React.CSSProperties = {
  color: "#222",
  marginBottom: "1rem",
};

const caveatStyle: React.CSSProperties = {
  color: "#666",
  fontSize: "0.9375rem",
  marginBottom: "2.5rem",
};

export default async function SetupPage(): Promise<JSX.Element> {
  // 1. Active-session gate
  const cookieStore = await cookies();
  const signedCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (signedCookie) {
    const session = await verifySession(signedCookie);
    if (session) {
      redirect("/dashboard");
    }
  }

  // 2. Already-set-up gate (CB-1.2's first-time-only contract surfaces in UI).
  // Cached via @/lib/auth/credential-count per M1 from the 2026-06-04
  // security audit — DoS-resistant on a pre-auth public surface.
  const credentialCount = await getCredentialCount();
  if (credentialCount >= 1) {
    redirect("/sign-in");
  }

  return (
    <main style={cardStyle}>
      <div style={headerStyle}>crypto-bot · setup</div>
      <hr style={dividerStyle} />
      <p style={introStyle}>Register your passkey to control this instance.</p>
      <p style={caveatStyle}>
        Once registered, this passkey will be the only way to access your Coinbase trade controls. Make sure the device you&apos;re on is one you trust.
      </p>
      <SetupClient />
    </main>
  );
}

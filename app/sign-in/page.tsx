// CB-1.6 — /sign-in (Server Component, mode-gated + ?next= validation).
// Per docs/bets/CB-1/stories/CB-1.6/design.md § Surface 3 + copy.md § /sign-in.
//
// Gate:
//   - active session       → redirect(safeNext ?? '/dashboard')
//   - count(creds) = 0     → redirect('/setup')
//   - count(creds) >= 1    → render sign-in card + SignInClient(safeNext)
//
// `?next=` is revalidated server-side via @/lib/auth/safe-next (the
// 4-rule consumer-side allowlist that mirrors proxy.ts's emit-side
// guard per CB-1.4 PR #10 security-review HIGH closure). Invalid
// candidates are silently dropped (no error UI per copy.md cross-
// surface strings); the client receives `safeNext: null`.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { JSX } from "react";

import { db } from "@/lib/db/client";
import { verifySession } from "@/lib/auth/sessions";
import { safeNextOrNull } from "@/lib/auth/safe-next";

import { SignInClient } from "./sign-in-client";

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

const bodyStyle: React.CSSProperties = {
  color: "#222",
  marginBottom: "2rem",
};

const footerStyle: React.CSSProperties = {
  marginTop: "3rem",
  color: "#666",
  fontSize: "0.875rem",
  lineHeight: 1.5,
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}): Promise<JSX.Element> {
  const params = await searchParams;
  // Consumer-side ?next= revalidation. Silently drop on invalid; null is the
  // honest signal to the client that no safe redirect target was provided.
  // Per copy.md § Cross-surface strings: no rejection error is rendered to
  // the user — the legitimate operator never crafts a malicious value, and
  // any rejection-visible UI would only inform an adversary.
  const safeNext = safeNextOrNull(params.next);

  // 1. Active-session gate
  const cookieStore = await cookies();
  const signedCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (signedCookie) {
    const session = await verifySession(signedCookie);
    if (session) {
      redirect(safeNext ?? "/dashboard");
    }
  }

  // 2. First-time-only gate (no creds = nothing to sign in to)
  const sql = db();
  const rows = await sql<Array<{ count: number | string }>>`
    SELECT count(*)::int AS count FROM auth_credentials
  `;
  const credentialCount = Number(rows[0]?.count ?? 0);
  if (credentialCount === 0) {
    redirect("/setup");
  }

  return (
    <main style={cardStyle}>
      <div style={headerStyle}>crypto-bot · sign in</div>
      <hr style={dividerStyle} />
      <p style={bodyStyle}>Welcome back. Use your passkey to continue.</p>
      <SignInClient safeNext={safeNext} />
      <p style={footerStyle}>
        Operator-only access. Lost your passkey? See the runbook — recovery requires direct DB access.
      </p>
    </main>
  );
}

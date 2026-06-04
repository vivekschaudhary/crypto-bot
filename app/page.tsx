// CB-1.6 — Landing `/` (Server Component, mode-detecting).
// Per docs/bets/CB-1/stories/CB-1.6/design.md § Surface 1 + copy.md § /.
//
// SSR pipeline:
//   1. Read __compass_session cookie via verifySession.
//      Authenticated → redirect('/dashboard').
//   2. Else query db().auth_credentials for count(*).
//      count = 0  → State A (first-deploy setup CTA → /setup).
//      count >= 1 → State B (sign-in CTA → /sign-in, forwards safe ?next=).
//
// Read-only SELECT; no DB writes from this surface.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { JSX } from "react";

import { db } from "@/lib/db/client";
import { verifySession } from "@/lib/auth/sessions";
import { isSafeNextPath } from "@/lib/auth/safe-next";
import { LandingCTA } from "@/app/landing-cta";

const SESSION_COOKIE_NAME = "__compass_session";

const cardStyle: React.CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  padding: "4rem 2rem",
  maxWidth: 480,
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

const ctaStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "0.75rem 1.5rem",
  fontSize: "1rem",
  background: "#111",
  color: "#fff",
  textDecoration: "none",
  borderRadius: "0.25rem",
  minWidth: "12rem",
};

const bodyStyle: React.CSSProperties = {
  color: "#444",
  marginBottom: "2rem",
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}): Promise<JSX.Element> {
  // 1. Session detection — short-circuit to /dashboard if authenticated.
  const cookieStore = await cookies();
  const signedCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (signedCookie) {
    const session = await verifySession(signedCookie);
    if (session) {
      redirect("/dashboard");
    }
  }

  // 2. Credential-count detection.
  const sql = db();
  const rows = await sql<Array<{ count: number | string }>>`
    SELECT count(*)::int AS count FROM auth_credentials
  `;
  const credentialCount = Number(rows[0]?.count ?? 0);

  // Forward a validated ?next= to /sign-in (State B only). Per design.md,
  // State A does NOT forward ?next= (registration completes by signing in
  // immediately; no separate redirect step).
  const params = await searchParams;
  const inboundNext = params.next;
  const safeNext = isSafeNextPath(inboundNext) ? inboundNext : null;
  const signInHref = safeNext
    ? `/sign-in?next=${encodeURIComponent(safeNext)}`
    : "/sign-in";

  if (credentialCount === 0) {
    // State A — first deploy.
    return (
      <main style={cardStyle}>
        <div style={headerStyle}>crypto-bot · operator console</div>
        <hr style={dividerStyle} />
        <p style={bodyStyle}>This instance hasn&apos;t been set up yet.</p>
        <LandingCTA href="/setup" label="Set up your passkey" style={ctaStyle} />
      </main>
    );
  }

  // State B — returning operator.
  return (
    <main style={cardStyle}>
      <div style={headerStyle}>crypto-bot · operator console</div>
      <hr style={dividerStyle} />
      <LandingCTA href={signInHref} label="Sign in" style={ctaStyle} />
    </main>
  );
}

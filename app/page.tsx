// Landing page. Unauthenticated.
// proxy.ts (session-gate) handles redirect of unauthenticated visitors away
// from /(dashboard)/* routes. This page is the safe public entry point.

export default function HomePage() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 2rem", maxWidth: 640, margin: "0 auto" }}>
      <h1>Crypto DCA Bot</h1>
      <p>Operator-only signal-driven DCA bot for Coinbase. Single-tenant by design.</p>
      <p>
        <a href="/dashboard">Sign in</a> · <a href="/api/auth/register">First-time setup</a>
      </p>
      <p style={{ marginTop: "3rem", color: "#666", fontSize: "0.875rem" }}>
        See <code>docs/foundation/product.md</code> for the product bet and{" "}
        <code>docs/foundation/architecture.md</code> for the architecture.
      </p>
    </main>
  );
}

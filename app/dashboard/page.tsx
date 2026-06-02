// Dashboard scaffold placeholder.
// Explicit `/dashboard` route used by the proxy-gating story and landing-page
// sign-in link. Real implementation arrives via later story tickets.

export default function DashboardPage() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 2rem", maxWidth: 960, margin: "0 auto" }}>
      <h1>Dashboard</h1>
      <p>Bot status, balances, trade log, manual overrides — coming via story tickets.</p>
      <p style={{ marginTop: "2rem", color: "#666", fontSize: "0.875rem" }}>
        Authenticated route. Session-gated by <code>proxy.ts</code>.
      </p>
    </main>
  );
}

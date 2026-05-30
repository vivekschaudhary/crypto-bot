// Dashboard scaffold placeholder.
// Real implementation arrives via /build story tickets per the bet portfolio.
// See product.md § Current quarter KR4 for what this page eventually surfaces.

export default function DashboardPage() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 2rem", maxWidth: 960, margin: "0 auto" }}>
      <h1>Dashboard</h1>
      <p>Bot status, balances, trade log, manual overrides — coming via story tickets.</p>
      <p style={{ marginTop: "2rem", color: "#666", fontSize: "0.875rem" }}>
        Authenticated route group. Session-gated by <code>app/proxy.ts</code> once auth flows ship.
      </p>
    </main>
  );
}

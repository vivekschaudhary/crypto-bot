// CB-8.0 — unit + render tests for the left-sidebar nav (replaces the CB-6.0
// dashboard-tabs test). `activeNavKey` is pure; the sidebar render is verified
// via JSON.stringify (mock next/navigation; Link/SignOutClient are referenced
// as element types, not invoked). Full responsive render is the Codex e2e.

import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
// next/link's Link is a forwardRef object (circular module refs) → mock to a
// plain passthrough so JSON.stringify of the element tree doesn't loop.
vi.mock("next/link", () => ({ default: (props: { children?: unknown }) => props.children }));
vi.mock("@/app/dashboard/sign-out-client", () => ({ SignOutClient: () => null }));

import { activeNavKey, DashboardSidebar } from "@/app/dashboard/dashboard-sidebar";

describe("activeNavKey — six-key route → nav mapping", () => {
  it("maps each route to its own key", () => {
    expect(activeNavKey("/dashboard")).toBe("crypto");
    expect(activeNavKey("/dashboard/equity")).toBe("equity");
    expect(activeNavKey("/dashboard/mutual-funds")).toBe("mutual-funds");
    expect(activeNavKey("/dashboard/strategy")).toBe("strategy");
    expect(activeNavKey("/dashboard/trace")).toBe("trace");
    expect(activeNavKey("/dashboard/ledger")).toBe("ledger");
  });
  it("strategy/trace/ledger are now distinct (not folded into crypto)", () => {
    // Regression vs CB-6.0 activeTab, which returned "crypto" for these.
    expect(activeNavKey("/dashboard/trace")).not.toBe("crypto");
    expect(activeNavKey("/dashboard/ledger")).not.toBe("crypto");
    expect(activeNavKey("/dashboard/strategy")).not.toBe("crypto");
  });
  it("unknown sub-routes default to crypto (the cockpit)", () => {
    expect(activeNavKey("/dashboard/whatever")).toBe("crypto");
  });
});

describe("DashboardSidebar render", () => {
  it("renders the title, six nav items (+ hrefs), and the footer", () => {
    const json = JSON.stringify(DashboardSidebar({ connectedDevice: "Vivek's Mac" }));
    expect(json).toContain("crypto-bot"); // app title
    expect(json).toContain("🤖 Crypto");
    expect(json).toContain("📈 Equity");
    expect(json).toContain("📊 Mutual Funds");
    expect(json).toContain("Strategy");
    expect(json).toContain("Decision trace");
    expect(json).toContain("Ledger");
    expect(json).toContain('"href":"/dashboard"');
    expect(json).toContain('"href":"/dashboard/ledger"');
    expect(json).toContain("Connected device: Vivek's Mac"); // footer device label
  });
  it("marks the active route (pathname=/dashboard → Crypto)", () => {
    const json = JSON.stringify(DashboardSidebar({ connectedDevice: "x" }));
    expect(json).toContain('"aria-current":"page"'); // exactly the active item
  });
});

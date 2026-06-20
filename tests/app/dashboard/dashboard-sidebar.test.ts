// CB-8.0/8.1 — unit + render tests for the left-sidebar nav. `activeNavKey` is
// pure; the sidebar render is verified via JSON.stringify (mock next/navigation;
// next/link, SignOutClient, and SidebarToggle are referenced as element types,
// not invoked — SidebarToggle is mocked since it has hooks). The interactive
// collapse + full responsive render are the Codex e2e.

import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
// next/link's Link is a forwardRef object → mock to a plain passthrough so
// JSON.stringify of the element tree doesn't loop.
vi.mock("next/link", () => ({ default: (props: { children?: unknown }) => props.children }));
vi.mock("@/app/dashboard/sign-out-client", () => ({ SignOutClient: () => null }));
vi.mock("@/app/dashboard/sidebar-toggle", () => ({ SidebarToggle: () => null }));
// CB-8.2 — DrawerCloseButton uses useContext (hooks) → mock it so the sidebar
// stays render-testable (same treatment as SidebarToggle/SignOutClient).
vi.mock("@/app/dashboard/mobile-nav", () => ({ DrawerCloseButton: () => null }));

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
  it("strategy/trace/ledger are distinct (not folded into crypto)", () => {
    expect(activeNavKey("/dashboard/trace")).not.toBe("crypto");
    expect(activeNavKey("/dashboard/ledger")).not.toBe("crypto");
    expect(activeNavKey("/dashboard/strategy")).not.toBe("crypto");
  });
  it("unknown sub-routes default to crypto (the cockpit)", () => {
    expect(activeNavKey("/dashboard/whatever")).toBe("crypto");
  });
});

describe("DashboardSidebar render", () => {
  it("renders the title, six items (icon + label + href), and the footer", () => {
    const json = JSON.stringify(DashboardSidebar({ connectedDevice: "Vivek's Mac" }));
    expect(json).toContain("crypto-bot"); // app title
    // labels (split from icons in CB-8.1; kept as the accessible name when collapsed)
    for (const label of ["Crypto", "Equity", "Mutual Funds", "Strategy", "Decision trace", "Ledger"]) {
      expect(json).toContain(label);
    }
    // icons on ALL six (so the collapsed rail stays navigable)
    for (const icon of ["🤖", "📈", "📊", "⚙️", "🧭", "📒"]) {
      expect(json).toContain(icon);
    }
    expect(json).toContain('"href":"/dashboard"');
    expect(json).toContain('"href":"/dashboard/ledger"');
    expect(json).toContain("Connected device: Vivek's Mac"); // footer device label
    expect(json).toContain('"id":"dashboard-drawer"'); // CB-8.2 — aria-controls target for the hamburger
    expect(json).toContain('"aria-label":"Sidebar"'); // CB-8.2 — labeled region (drawer accessible identity)
  });
  it("marks the active route (pathname=/dashboard → Crypto)", () => {
    expect(JSON.stringify(DashboardSidebar({ connectedDevice: "x" }))).toContain('"aria-current":"page"');
  });
});

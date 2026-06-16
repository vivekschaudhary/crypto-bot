// Per CB-1.6 AC 4 + AC 7. Tests the /dashboard Server Component render
// (device-label lookup + fallback). SignOutClient is mocked since its
// click behavior is the client-side concern; the sign-out network behavior
// is covered by CB-1.5 tests + Codex's E2E (AC 8).

import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  headersGetMock: vi.fn(),
  sqlMock: vi.fn(),
  state: { deviceLabelRows: [] as Array<{ device_label: string | null }> },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({ get: hoisted.headersGetMock })),
}));

vi.mock("@/lib/db/client", () => ({
  db: () => hoisted.sqlMock,
}));

vi.mock("@/app/dashboard/sign-out-client", () => ({
  SignOutClient: () => null,
}));

// CB-5.0: the page now composes the live-state read model. Mock it to a
// benign no-session state so these CB-1.6 chrome/device-label tests stay
// isolated to their concern (live-state has its own tests at
// tests/lib/dashboard/live-state.test.ts). With this mocked, loadLiveState
// makes no db()/Coinbase calls, so the device_label query is the only
// sqlMock consumer.
vi.mock("@/lib/dashboard/live-state", () => ({
  loadLiveState: vi.fn(async () => ({
    session: null,
    holdings: [],
    activity: { buyCount: 0, totalInvestedUsd: 0 },
    liveMode: false,
  })),
}));

// CB-6.1: the cockpit now reads the active strategy for the pair selector.
// Mock to null → no selected assets → resolveViewedPair returns null →
// loadCockpitPosition is NOT called, and the title stays generic ("Crypto
// Trading Bot"). Keeps these chrome/device-label tests isolated.
vi.mock("@/lib/strategies/db", () => ({
  getActiveStrategy: vi.fn(async () => null),
}));

hoisted.sqlMock.mockImplementation(async () => hoisted.state.deviceLabelRows);

const { headersGetMock, sqlMock, state } = hoisted;

import DashboardPage from "@/app/dashboard/page";

beforeEach(() => {
  headersGetMock.mockReset();
  sqlMock.mockClear();
  hoisted.sqlMock.mockImplementation(async () => hoisted.state.deviceLabelRows);
  state.deviceLabelRows = [];
});

describe("DashboardPage /dashboard", () => {
  it("renders the cockpit frame (CB-6.0 redesign)", async () => {
    headersGetMock.mockImplementation((name) => (name === "x-session-user-id" ? "u1" : null));
    state.deviceLabelRows = [{ device_label: "Safari on macOS" }];

    const el = await DashboardPage();
    const json = JSON.stringify(el);
    // CB-6.0: /dashboard is now the Crypto cockpit. JSON.stringify captures
    // DashboardPage's own direct JSX (eyebrow/title + the CockpitSection
    // `label` props + the trace/ledger links) — NOT nested-component output
    // (Bot Status / banner internals are verified in e2e + their own tests).
    expect(json).toContain("DCA + SIGNAL EXIT · COINBASE");
    expect(json).toContain("Crypto Trading Bot");
    expect(json).toContain("PROFIT / LOSS");
    expect(json).toContain("TRADE LOG");
    expect(json).toContain("Create or revise your DCA strategy");
    // The CB-1.6 "Signed in." landing + the old "crypto-bot" header are gone.
    expect(json).not.toContain("Signed in.");
    expect(json).not.toContain("will arrive in the next bet");
  });

  it("renders the device label from auth_credentials.device_label", async () => {
    headersGetMock.mockImplementation((name) => (name === "x-session-user-id" ? "u1" : null));
    state.deviceLabelRows = [{ device_label: "Chrome on Linux" }];

    const el = await DashboardPage();
    const json = JSON.stringify(el);
    expect(json).toContain("Connected device:");
    expect(json).toContain("Chrome on Linux");
  });

  it("falls back to 'this device' when device_label is NULL", async () => {
    headersGetMock.mockImplementation((name) => (name === "x-session-user-id" ? "u1" : null));
    state.deviceLabelRows = [{ device_label: null }];

    const el = await DashboardPage();
    const json = JSON.stringify(el);
    expect(json).toContain("Connected device:");
    expect(json).toContain("this device");
  });

  it("falls back to 'this device' when device_label is empty string", async () => {
    headersGetMock.mockImplementation((name) => (name === "x-session-user-id" ? "u1" : null));
    state.deviceLabelRows = [{ device_label: "" }];

    const el = await DashboardPage();
    const json = JSON.stringify(el);
    expect(json).toContain("this device");
  });

  it("falls back to 'this device' when no credential row exists (defensive)", async () => {
    headersGetMock.mockImplementation((name) => (name === "x-session-user-id" ? "u1" : null));
    state.deviceLabelRows = [];

    const el = await DashboardPage();
    const json = JSON.stringify(el);
    expect(json).toContain("this device");
  });

  it("falls back to 'this device' when x-session-user-id header is missing (defensive — should not happen post-proxy but defensive anyway)", async () => {
    headersGetMock.mockReturnValue(null);

    const el = await DashboardPage();
    const json = JSON.stringify(el);
    expect(json).toContain("this device");
    // DB should not be queried when there's no userId to look up
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("falls back to 'this device' when DB query throws (defensive)", async () => {
    headersGetMock.mockImplementation((name) => (name === "x-session-user-id" ? "u1" : null));
    sqlMock.mockRejectedValueOnce(new Error("db down"));

    const el = await DashboardPage();
    const json = JSON.stringify(el);
    expect(json).toContain("this device");
  });
});

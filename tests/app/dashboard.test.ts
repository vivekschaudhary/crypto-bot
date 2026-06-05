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
  it("renders standard chrome + body lines", async () => {
    headersGetMock.mockImplementation((name) => (name === "x-session-user-id" ? "u1" : null));
    state.deviceLabelRows = [{ device_label: "Safari on macOS" }];

    const el = await DashboardPage();
    const json = JSON.stringify(el);
    expect(json).toContain("crypto-bot");
    expect(json).toContain("Signed in.");
    expect(json).toContain("Bot controls and decision trace will arrive in the next bet (CB-2).");
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

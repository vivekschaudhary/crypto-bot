// Per CB-1.6 AC 2 + AC 7. Tests the /setup Server Component gate.
// Client component (SetupClient) is mocked — its WebAuthn behavior is
// covered by Codex's E2E (AC 8) since it requires a real browser context.

import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  cookiesGetMock: vi.fn(),
  verifySessionMock: vi.fn(),
  sqlMock: vi.fn(),
  state: { credCount: 0 },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: hoisted.cookiesGetMock })),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    const err = new Error(`NEXT_REDIRECT;${path}`);
    (err as Error & { digest?: string }).digest = `NEXT_REDIRECT;${path}`;
    throw err;
  }),
}));

vi.mock("@/lib/auth/sessions", () => ({
  verifySession: hoisted.verifySessionMock,
}));

vi.mock("@/lib/db/client", () => ({
  db: () => hoisted.sqlMock,
}));

vi.mock("@/app/setup/setup-client", () => ({
  SetupClient: () => null,
}));

hoisted.sqlMock.mockImplementation(async () => [{ count: hoisted.state.credCount }]);

const { cookiesGetMock, verifySessionMock, sqlMock, state } = hoisted;

import SetupPage from "@/app/setup/page";

beforeEach(() => {
  cookiesGetMock.mockReset();
  verifySessionMock.mockReset();
  sqlMock.mockClear();
  state.credCount = 0;
});

function tryRedirect(thrown: unknown): string | null {
  if (thrown instanceof Error && thrown.message.startsWith("NEXT_REDIRECT;")) {
    return thrown.message.slice("NEXT_REDIRECT;".length);
  }
  return null;
}

describe("SetupPage /setup", () => {
  describe("active-session gate", () => {
    it("active session → 302 to /dashboard (operator should not be at /setup)", async () => {
      cookiesGetMock.mockReturnValue({ value: "valid-cookie" });
      verifySessionMock.mockResolvedValue({ userId: "u1", sessionId: "s1" });
      state.credCount = 0; // doesn't matter — session check fires first

      try {
        await SetupPage();
        expect.fail("expected redirect to /dashboard");
      } catch (err) {
        expect(tryRedirect(err)).toBe("/dashboard");
      }
    });
  });

  describe("first-time-only gate (mirrors CB-1.2 API contract)", () => {
    it("count >= 1 + no session → 302 to /sign-in", async () => {
      cookiesGetMock.mockReturnValue(undefined);
      state.credCount = 1;

      try {
        await SetupPage();
        expect.fail("expected redirect to /sign-in");
      } catch (err) {
        expect(tryRedirect(err)).toBe("/sign-in");
      }
    });

    it("count = 5 + invalid cookie → 302 to /sign-in", async () => {
      cookiesGetMock.mockReturnValue({ value: "tampered" });
      verifySessionMock.mockResolvedValue(null);
      state.credCount = 5;

      try {
        await SetupPage();
        expect.fail("expected redirect to /sign-in");
      } catch (err) {
        expect(tryRedirect(err)).toBe("/sign-in");
      }
    });
  });

  describe("happy path — count = 0 + no session", () => {
    it("renders the setup card with verbatim copy", async () => {
      cookiesGetMock.mockReturnValue(undefined);
      state.credCount = 0;

      const el = await SetupPage();
      const json = JSON.stringify(el);
      expect(json).toContain("crypto-bot · setup");
      expect(json).toContain("Register your passkey to control this instance.");
      expect(json).toContain("Once registered, this passkey will be the only way");
      expect(json).toContain("Make sure the device you");
    });

    it("invalid cookie + count = 0 → renders setup (cookie invalid means no session)", async () => {
      cookiesGetMock.mockReturnValue({ value: "tampered" });
      verifySessionMock.mockResolvedValue(null);
      state.credCount = 0;

      const el = await SetupPage();
      const json = JSON.stringify(el);
      expect(json).toContain("Register your passkey");
    });
  });
});

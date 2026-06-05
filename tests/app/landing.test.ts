// Per CB-1.6 AC 1 + AC 7. Tests the mode-detecting Server Component at `/`.
//
// Mocking strategy: stub next/headers (cookies), next/navigation (redirect),
// the DB layer (count query), and verifySession. Each test scenario sets the
// stubs to a specific state then invokes the page function and inspects
// either (a) the thrown REDIRECT signal or (b) the returned JSX element tree.

import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock hoists to the top of the file — any captured variables must be
// declared via vi.hoisted() so they exist before the mock factories run.
const hoisted = vi.hoisted(() => ({
  cookiesGetMock: vi.fn(),
  verifySessionMock: vi.fn(),
  getCredentialCountMock: vi.fn(),
  state: { credCount: 0 },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: hoisted.cookiesGetMock })),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    // Next's real redirect() throws an error with a NEXT_REDIRECT digest;
    // mimic the throw so callers can detect with try/catch.
    const err = new Error(`NEXT_REDIRECT;${path}`);
    (err as Error & { digest?: string }).digest = `NEXT_REDIRECT;${path}`;
    throw err;
  }),
}));

vi.mock("@/lib/auth/sessions", () => ({
  verifySession: hoisted.verifySessionMock,
}));

vi.mock("@/lib/auth/credential-count", () => ({
  getCredentialCount: hoisted.getCredentialCountMock,
  CREDENTIAL_COUNT_TAG: "auth-credentials",
}));

// Bind state.credCount to the credential-count mock return so tests can mutate it.
hoisted.getCredentialCountMock.mockImplementation(async () => hoisted.state.credCount);

const { cookiesGetMock, verifySessionMock, getCredentialCountMock, state } = hoisted;

import HomePage from "@/app/page";

beforeEach(() => {
  cookiesGetMock.mockReset();
  verifySessionMock.mockReset();
  getCredentialCountMock.mockClear();
  hoisted.getCredentialCountMock.mockImplementation(async () => hoisted.state.credCount);
  state.credCount = 0;
});

function tryRedirect(thrown: unknown): string | null {
  if (thrown instanceof Error && thrown.message.startsWith("NEXT_REDIRECT;")) {
    return thrown.message.slice("NEXT_REDIRECT;".length);
  }
  return null;
}

describe("HomePage `/`", () => {
  describe("State C — authenticated session", () => {
    it("active session → 302 to /dashboard regardless of credential count", async () => {
      cookiesGetMock.mockReturnValue({ value: "signed-cookie" });
      verifySessionMock.mockResolvedValue({ userId: "u1", sessionId: "s1" });
      state.credCount = 5;

      try {
        await HomePage({ searchParams: Promise.resolve({}) });
        expect.fail("HomePage should have thrown a redirect");
      } catch (err) {
        expect(tryRedirect(err)).toBe("/dashboard");
      }
    });

    it("authenticated AND `?next=` present → still redirects to /dashboard (next is for sign-in, not for already-authed)", async () => {
      cookiesGetMock.mockReturnValue({ value: "signed-cookie" });
      verifySessionMock.mockResolvedValue({ userId: "u1", sessionId: "s1" });

      try {
        await HomePage({ searchParams: Promise.resolve({ next: "/dashboard/sub" }) });
        expect.fail("should have redirected");
      } catch (err) {
        expect(tryRedirect(err)).toBe("/dashboard");
      }
    });
  });

  describe("State A — zero credentials (first deploy)", () => {
    it("renders setup CTA when no cookie + count = 0", async () => {
      cookiesGetMock.mockReturnValue(undefined);
      state.credCount = 0;

      const el = await HomePage({ searchParams: Promise.resolve({}) });
      const json = JSON.stringify(el);
      expect(json).toContain("This instance hasn");
      expect(json).toContain("Set up your passkey");
      expect(json).toContain("/setup");
      // Should NOT contain sign-in copy or link
      expect(json).not.toContain("Sign in");
      expect(json).not.toContain("/sign-in");
    });

    it("ignores `?next=` parameter on State A (no forwarding to /setup)", async () => {
      cookiesGetMock.mockReturnValue(undefined);
      state.credCount = 0;

      const el = await HomePage({ searchParams: Promise.resolve({ next: "/dashboard" }) });
      const json = JSON.stringify(el);
      // The /setup CTA href must be exactly "/setup" — no query string
      expect(json).toMatch(/"href":\s*"\/setup"/);
      expect(json).not.toContain("next=");
    });

    it("invalid cookie + count = 0 → State A (verifySession returns null)", async () => {
      cookiesGetMock.mockReturnValue({ value: "tampered" });
      verifySessionMock.mockResolvedValue(null);
      state.credCount = 0;

      const el = await HomePage({ searchParams: Promise.resolve({}) });
      const json = JSON.stringify(el);
      expect(json).toContain("Set up your passkey");
    });
  });

  describe("State B — one+ credentials (returning operator)", () => {
    it("renders sign-in CTA when no cookie + count >= 1", async () => {
      cookiesGetMock.mockReturnValue(undefined);
      state.credCount = 1;

      const el = await HomePage({ searchParams: Promise.resolve({}) });
      const json = JSON.stringify(el);
      expect(json).toContain("Sign in");
      expect(json).toContain("/sign-in");
      // Should NOT contain setup copy
      expect(json).not.toContain("Set up your passkey");
    });

    it("forwards valid `?next=` to /sign-in href as encoded query string", async () => {
      cookiesGetMock.mockReturnValue(undefined);
      state.credCount = 2;

      const el = await HomePage({ searchParams: Promise.resolve({ next: "/dashboard/sub?a=1" }) });
      const json = JSON.stringify(el);
      expect(json).toContain("/sign-in?next=");
      expect(json).toContain(encodeURIComponent("/dashboard/sub?a=1"));
    });

    it("drops invalid `?next=` (protocol-relative) and links to bare /sign-in", async () => {
      cookiesGetMock.mockReturnValue(undefined);
      state.credCount = 1;

      const el = await HomePage({ searchParams: Promise.resolve({ next: "//evil.example" }) });
      const json = JSON.stringify(el);
      expect(json).toMatch(/"href":\s*"\/sign-in"/);
      expect(json).not.toContain("evil.example");
      expect(json).not.toContain("next=");
    });

    it("drops invalid `?next=` (javascript: scheme)", async () => {
      cookiesGetMock.mockReturnValue(undefined);
      state.credCount = 1;

      const el = await HomePage({ searchParams: Promise.resolve({ next: "javascript:alert(1)" }) });
      const json = JSON.stringify(el);
      expect(json).not.toContain("javascript");
      expect(json).toMatch(/"href":\s*"\/sign-in"/);
    });
  });
});

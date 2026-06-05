// Per CB-1.6 AC 3 + AC 7. Tests the /sign-in Server Component gate +
// ?next= revalidation. Client component (SignInClient) is mocked — its
// WebAuthn behavior is covered by Codex's E2E (AC 8).

import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  cookiesGetMock: vi.fn(),
  verifySessionMock: vi.fn(),
  sqlMock: vi.fn(),
  signInClientPropsSpy: vi.fn(),
  state: { credCount: 1 },
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

// env() is invoked by the page only on the rejected-?next= dev-warn path;
// we stub NODE_ENV to "test" so the warn is silenced under vitest.
vi.mock("@/lib/env", () => ({
  env: () => ({ NODE_ENV: "test" }),
  origin: () => "https://crypt-bot.kindtree.us",
}));

// Mock the client component so we can inspect what safeNext value it receives.
vi.mock("@/app/sign-in/sign-in-client", () => ({
  SignInClient: (props: { safeNext: string | null }) => {
    hoisted.signInClientPropsSpy(props);
    return null;
  },
}));

hoisted.sqlMock.mockImplementation(async () => [{ count: hoisted.state.credCount }]);

const { cookiesGetMock, verifySessionMock, sqlMock, signInClientPropsSpy, state } = hoisted;

import SignInPage from "@/app/sign-in/page";

beforeEach(() => {
  cookiesGetMock.mockReset();
  verifySessionMock.mockReset();
  sqlMock.mockClear();
  signInClientPropsSpy.mockClear();
  state.credCount = 1; // default: returning-operator scenario
});

function tryRedirect(thrown: unknown): string | null {
  if (thrown instanceof Error && thrown.message.startsWith("NEXT_REDIRECT;")) {
    return thrown.message.slice("NEXT_REDIRECT;".length);
  }
  return null;
}

describe("SignInPage /sign-in", () => {
  describe("active-session gate", () => {
    it("active session + no next → 302 to /dashboard", async () => {
      cookiesGetMock.mockReturnValue({ value: "valid" });
      verifySessionMock.mockResolvedValue({ userId: "u1", sessionId: "s1" });

      try {
        await SignInPage({ searchParams: Promise.resolve({}) });
        expect.fail("expected redirect");
      } catch (err) {
        expect(tryRedirect(err)).toBe("/dashboard");
      }
    });

    it("active session + valid next → 302 to that next", async () => {
      cookiesGetMock.mockReturnValue({ value: "valid" });
      verifySessionMock.mockResolvedValue({ userId: "u1", sessionId: "s1" });

      try {
        await SignInPage({ searchParams: Promise.resolve({ next: "/dashboard/sub" }) });
        expect.fail("expected redirect");
      } catch (err) {
        expect(tryRedirect(err)).toBe("/dashboard/sub");
      }
    });

    it("active session + invalid next → 302 to /dashboard (silent drop)", async () => {
      cookiesGetMock.mockReturnValue({ value: "valid" });
      verifySessionMock.mockResolvedValue({ userId: "u1", sessionId: "s1" });

      try {
        await SignInPage({ searchParams: Promise.resolve({ next: "//evil.example" }) });
        expect.fail("expected redirect");
      } catch (err) {
        expect(tryRedirect(err)).toBe("/dashboard");
      }
    });
  });

  describe("first-time-only gate (no creds → /setup)", () => {
    it("count = 0 + no session → 302 to /setup", async () => {
      cookiesGetMock.mockReturnValue(undefined);
      state.credCount = 0;

      try {
        await SignInPage({ searchParams: Promise.resolve({}) });
        expect.fail("expected redirect");
      } catch (err) {
        expect(tryRedirect(err)).toBe("/setup");
      }
    });
  });

  describe("?next= revalidation matrix", () => {
    // Helper: walk the JSX element tree for a child element whose type is the
    // (mocked) SignInClient function. The Server Component returns JSX
    // containing <SignInClient safeNext={...} /> — we extract the safeNext
    // prop without needing React to render the tree.
    function findSignInClientProps(node: unknown): { safeNext: string | null } | null {
      if (!node || typeof node !== "object") return null;
      const el = node as { type?: unknown; props?: { children?: unknown; safeNext?: unknown } };
      if (typeof el.type === "function" && el.props && "safeNext" in el.props) {
        return { safeNext: (el.props.safeNext as string | null | undefined) ?? null };
      }
      const children = el.props?.children;
      if (Array.isArray(children)) {
        for (const c of children) {
          const found = findSignInClientProps(c);
          if (found) return found;
        }
      } else if (children) {
        return findSignInClientProps(children);
      }
      return null;
    }

    it.each<[string, string | null]>([
      ["/dashboard", "/dashboard"],
      ["/dashboard?x=1", "/dashboard?x=1"],
      ["/dashboard/settings", "/dashboard/settings"],
      ["/", "/"],
      ["//evil.example", null],
      ["https://evil.example/path", null],
      ["evil.example", null],
      ["/path\\with\\backslash", null],
      ["javascript:alert(1)", null],
      ["data:text/html,<script>1</script>", null],
      ["", null],
    ])("for next=%j → SignInClient receives safeNext === %j", async (input, expected) => {
      cookiesGetMock.mockReturnValue(undefined);
      state.credCount = 1;

      const el = await SignInPage({ searchParams: Promise.resolve({ next: input }) });
      const props = findSignInClientProps(el);
      expect(props).not.toBeNull();
      expect(props?.safeNext).toBe(expected);
    });

    it("absent ?next= → SignInClient receives safeNext === null", async () => {
      cookiesGetMock.mockReturnValue(undefined);
      state.credCount = 1;

      const el = await SignInPage({ searchParams: Promise.resolve({}) });
      const props = findSignInClientProps(el);
      expect(props?.safeNext).toBeNull();
    });
  });

  describe("happy-path render — count >= 1 + no session", () => {
    it("renders sign-in card with verbatim copy + footer", async () => {
      cookiesGetMock.mockReturnValue(undefined);
      state.credCount = 1;

      const el = await SignInPage({ searchParams: Promise.resolve({}) });
      const json = JSON.stringify(el);
      expect(json).toContain("crypto-bot · sign in");
      expect(json).toContain("Welcome back. Use your passkey to continue.");
      expect(json).toContain("Operator-only access. Lost your passkey?");
      expect(json).toContain("recovery requires direct DB access");
    });
  });
});

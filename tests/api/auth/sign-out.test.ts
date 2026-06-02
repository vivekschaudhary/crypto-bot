// Tests for POST /api/auth/sign-out (CB-1.5).
//
// Mocking strategy: this route is pure composition over high-level helpers
// (`verifySession`, `invalidateSession`) plus the origin-check + rate-limit
// pipeline. We mock @/lib/auth/sessions to control verifySession/invalidate
// directly; the DB layer (lib/db/client) is therefore never reached by these
// tests — matching the route's actual call graph.

import { beforeEach, describe, expect, it, vi } from "vitest";

const FAKE_SECRET = "z".repeat(48);
const ORIGIN = "https://crypt-bot.kindtree.us";

vi.mock("@/lib/env", () => ({
  env: () => ({ SESSION_SIGNING_SECRET: FAKE_SECRET }),
  origin: () => ORIGIN,
}));

vi.mock("@/lib/auth/sessions", () => ({
  verifySession: vi.fn(),
  invalidateSession: vi.fn(),
}));

import { invalidateSession, verifySession } from "@/lib/auth/sessions";
import { DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT } from "@/app/api/auth/sign-out/route";
import { __resetRateLimits } from "@/lib/auth/rate-limit";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  buildSessionCookie,
  clearSessionCookie,
} from "@/lib/auth/cookie";

const verifySessionMock = vi.mocked(verifySession);
const invalidateSessionMock = vi.mocked(invalidateSession);

beforeEach(() => {
  verifySessionMock.mockReset();
  invalidateSessionMock.mockReset();
  __resetRateLimits();
});

function makeRequest(opts: {
  method?: string;
  cookie?: string | null;
  origin?: string | null;
} = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN;
  if (opts.cookie !== null && opts.cookie) headers.cookie = opts.cookie;
  return new Request(`${ORIGIN}/api/auth/sign-out`, {
    method: opts.method ?? "POST",
    headers,
  });
}

// Parse a Set-Cookie header into name=value plus an alphabetized set of attribute
// flags ("HttpOnly", "Secure", "SameSite=Strict", "Path=/", "Max-Age=N"). Used by
// the cookie-attribute parity test below.
function parseSetCookie(setCookie: string): {
  name: string;
  value: string;
  attrs: string[];
} {
  const parts = setCookie.split(/;\s*/);
  const head = parts[0] ?? "";
  const eq = head.indexOf("=");
  const name = eq === -1 ? head : head.slice(0, eq);
  const value = eq === -1 ? "" : head.slice(eq + 1);
  const attrs = parts.slice(1).slice().sort((a, b) => a.localeCompare(b));
  return { name, value, attrs };
}

describe("POST /api/auth/sign-out — happy path", () => {
  it("valid cookie → 200 { ok: true } + invalidateSession called + Set-Cookie clears the session", async () => {
    verifySessionMock.mockResolvedValueOnce({
      userId: "01ARZ3NDEKTSV4RRFFQ69G5USER",
      sessionId: "01ARZ3NDEKTSV4RRFFQ69G5SES1",
    });
    invalidateSessionMock.mockResolvedValueOnce(undefined);

    const res = await POST(
      makeRequest({ cookie: `${SESSION_COOKIE_NAME}=some-signed-token` }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(verifySessionMock).toHaveBeenCalledTimes(1);
    expect(verifySessionMock).toHaveBeenCalledWith("some-signed-token");
    expect(invalidateSessionMock).toHaveBeenCalledTimes(1);
    expect(invalidateSessionMock).toHaveBeenCalledWith("01ARZ3NDEKTSV4RRFFQ69G5SES1");

    const setCookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
    expect(setCookies).toHaveLength(1);
    const sc = setCookies[0]!;
    expect(sc).toContain(`${SESSION_COOKIE_NAME}=;`);
    expect(sc).toContain("HttpOnly");
    expect(sc).toContain("Secure");
    expect(sc).toContain("SameSite=Strict");
    expect(sc).toContain("Path=/");
    expect(sc).toContain("Max-Age=0");
  });
});

describe("POST /api/auth/sign-out — unauthenticated paths", () => {
  it("no cookie → 401, invalidateSession NOT called, no Set-Cookie", async () => {
    const res = await POST(makeRequest({ cookie: null }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated" });
    expect(verifySessionMock).not.toHaveBeenCalled();
    expect(invalidateSessionMock).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("invalid cookie signature → 401 (verifySession returns null), invalidateSession NOT called", async () => {
    verifySessionMock.mockResolvedValueOnce(null);

    const res = await POST(
      makeRequest({ cookie: `${SESSION_COOKIE_NAME}=tampered.signature` }),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated" });
    expect(verifySessionMock).toHaveBeenCalledTimes(1);
    expect(invalidateSessionMock).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("expired session row → 401 (verifySession returns null), invalidateSession NOT called", async () => {
    // verifySession returns null for any expires_at <= now() OR row-missing case;
    // the handler does not distinguish — same 401 either way.
    verifySessionMock.mockResolvedValueOnce(null);

    const res = await POST(
      makeRequest({ cookie: `${SESSION_COOKIE_NAME}=valid-sig-but-expired-row` }),
    );

    expect(res.status).toBe(401);
    expect(invalidateSessionMock).not.toHaveBeenCalled();
  });

  it("missing session row (already signed out) → 401, invalidateSession NOT called", async () => {
    verifySessionMock.mockResolvedValueOnce(null);

    const res = await POST(
      makeRequest({ cookie: `${SESSION_COOKIE_NAME}=valid-sig-but-row-gone` }),
    );

    expect(res.status).toBe(401);
    expect(invalidateSessionMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/sign-out — origin check", () => {
  it("origin mismatch → 403, verifySession NOT called, invalidateSession NOT called", async () => {
    const res = await POST(
      makeRequest({
        origin: "https://evil.example.com",
        cookie: `${SESSION_COOKIE_NAME}=any-value`,
      }),
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "origin-mismatch" });
    expect(verifySessionMock).not.toHaveBeenCalled();
    expect(invalidateSessionMock).not.toHaveBeenCalled();
  });

  it("missing origin → 403 (origin check rejects null/empty origin)", async () => {
    const res = await POST(
      makeRequest({ origin: null, cookie: `${SESSION_COOKIE_NAME}=any-value` }),
    );

    expect(res.status).toBe(403);
    expect(verifySessionMock).not.toHaveBeenCalled();
    expect(invalidateSessionMock).not.toHaveBeenCalled();
  });
});

describe("/api/auth/sign-out — method discipline (typed 405)", () => {
  it("GET → 405 { error: 'method-not-allowed' } + Allow header", async () => {
    const res = GET();
    expect(res.status).toBe(405);
    expect(await res.json()).toEqual({ error: "method-not-allowed" });
    expect(res.headers.get("allow")).toBe("POST, OPTIONS");
  });

  it("PUT → 405 typed JSON", async () => {
    const res = PUT();
    expect(res.status).toBe(405);
    expect(await res.json()).toEqual({ error: "method-not-allowed" });
  });

  it("PATCH → 405 typed JSON", async () => {
    const res = PATCH();
    expect(res.status).toBe(405);
    expect(await res.json()).toEqual({ error: "method-not-allowed" });
  });

  it("DELETE → 405 typed JSON", async () => {
    const res = DELETE();
    expect(res.status).toBe(405);
    expect(await res.json()).toEqual({ error: "method-not-allowed" });
  });

  it("HEAD → 405 typed JSON", async () => {
    const res = HEAD();
    expect(res.status).toBe(405);
    expect(await res.json()).toEqual({ error: "method-not-allowed" });
  });

  it("OPTIONS → 204 with Allow header (origin check passes)", async () => {
    const res = OPTIONS(makeRequest({ method: "OPTIONS" }));
    expect(res.status).toBe(204);
    expect(res.headers.get("allow")).toBe("POST, OPTIONS");
  });

  it("OPTIONS with bad origin → 403", async () => {
    const res = OPTIONS(makeRequest({ method: "OPTIONS", origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "origin-mismatch" });
  });
});

describe("POST /api/auth/sign-out — idempotency", () => {
  it("two consecutive calls with same originally-valid cookie: first 200, second 401 (row gone)", async () => {
    const cookie = `${SESSION_COOKIE_NAME}=some-signed-token`;

    // First call: row exists → verifySession resolves with claims → invalidateSession deletes
    verifySessionMock.mockResolvedValueOnce({
      userId: "01ARZ3NDEKTSV4RRFFQ69G5USER",
      sessionId: "01ARZ3NDEKTSV4RRFFQ69G5SES1",
    });
    invalidateSessionMock.mockResolvedValueOnce(undefined);

    const res1 = await POST(makeRequest({ cookie }));
    expect(res1.status).toBe(200);
    expect(invalidateSessionMock).toHaveBeenCalledTimes(1);

    // Second call: row already deleted → verifySession resolves null → handler short-circuits
    verifySessionMock.mockResolvedValueOnce(null);

    const res2 = await POST(makeRequest({ cookie }));
    expect(res2.status).toBe(401);
    // invalidateSession call count unchanged from the first call — no second invocation
    expect(invalidateSessionMock).toHaveBeenCalledTimes(1);
  });
});

describe("cookie-attribute parity (CB-1.5 AC 7 / AC 12)", () => {
  // Mechanical guard against attribute drift between issuance and clearing.
  // Both helpers live in lib/auth/cookie; this test asserts that drift would
  // require editing the same module (structurally impossible by accident).
  it("buildSessionCookie + clearSessionCookie share the same attribute set (except value + Max-Age)", () => {
    const issuance = parseSetCookie(buildSessionCookie("fake-signed-token"));
    const clearing = parseSetCookie(clearSessionCookie());

    // Same cookie name
    expect(issuance.name).toBe(SESSION_COOKIE_NAME);
    expect(clearing.name).toBe(SESSION_COOKIE_NAME);

    // Differing fields: value + Max-Age
    expect(issuance.value).toBe("fake-signed-token");
    expect(clearing.value).toBe("");

    // Pull out the Max-Age line from each side, then assert the REMAINING attrs match
    const maxAgePattern = /^Max-Age=/;
    const issuanceMaxAge = issuance.attrs.find((a) => maxAgePattern.test(a));
    const clearingMaxAge = clearing.attrs.find((a) => maxAgePattern.test(a));
    expect(issuanceMaxAge).toBe(`Max-Age=${SESSION_TTL_SECONDS}`);
    expect(clearingMaxAge).toBe("Max-Age=0");

    const issuanceRest = issuance.attrs.filter((a) => !maxAgePattern.test(a));
    const clearingRest = clearing.attrs.filter((a) => !maxAgePattern.test(a));
    // Alphabetized in parseSetCookie — direct array equality is a strict drift check
    expect(clearingRest).toEqual(issuanceRest);
    // Spell out the expected attribute set explicitly so a refactor surfaces here too
    expect(clearingRest).toEqual(["HttpOnly", "Path=/", "SameSite=Strict", "Secure"]);
  });

  it("happy-path response Set-Cookie attribute parity matches buildSessionCookie attribute set (modulo value + Max-Age)", async () => {
    verifySessionMock.mockResolvedValueOnce({
      userId: "01ARZ3NDEKTSV4RRFFQ69G5USER",
      sessionId: "01ARZ3NDEKTSV4RRFFQ69G5SES1",
    });
    invalidateSessionMock.mockResolvedValueOnce(undefined);

    const res = await POST(
      makeRequest({ cookie: `${SESSION_COOKIE_NAME}=signed-token` }),
    );
    const setCookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
    const actual = parseSetCookie(setCookies[0]!);
    const expected = parseSetCookie(clearSessionCookie());
    // The actual response cookie MUST equal the helper's output verbatim
    expect(actual).toEqual(expected);
  });
});

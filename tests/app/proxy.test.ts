import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const FAKE_SECRET = "z".repeat(48);
const ORIGIN = "https://crypt-bot.kindtree.us";

vi.mock("@/lib/env", () => ({
  env: () => ({ SESSION_SIGNING_SECRET: FAKE_SECRET }),
  origin: () => ORIGIN,
}));

// Mock lib/auth/sessions.verifySession — proxy's canonical session-check call.
// Tracks invocations so we can assert "public routes don't hit verify" (AC 6).
vi.mock("@/lib/auth/sessions", () => ({
  verifySession: vi.fn(),
  createSession: vi.fn(),
  rotateSession: vi.fn(),
  invalidateSession: vi.fn(),
}));

import { verifySession as libVerifySession } from "@/lib/auth/sessions";
import proxy from "@/app/proxy";

const verifySessionMock = vi.mocked(libVerifySession);

beforeEach(() => {
  verifySessionMock.mockReset();
});

function makeRequest(opts: { pathname: string; search?: string; sessionCookie?: string }): NextRequest {
  const url = new URL(`${ORIGIN}${opts.pathname}${opts.search ?? ""}`);
  const req = new NextRequest(url, { method: "GET" });
  if (opts.sessionCookie) {
    req.cookies.set("__compass_session", opts.sessionCookie);
  }
  return req;
}

describe("app/proxy.ts — public-route passthrough (no DB call)", () => {
  const publicPaths = [
    "/",
    "/api/auth/register/begin",
    "/api/auth/register/finish",
    "/api/auth/authenticate/begin",
    "/api/auth/authenticate/finish",
    "/api/auth/recovery",
    "/api/cron/tick",
  ];

  for (const pathname of publicPaths) {
    it(`passes through ${pathname} without calling verifySession (AC 6)`, async () => {
      const res = await proxy(makeRequest({ pathname }));
      expect(res.status).toBe(200);
      expect(verifySessionMock).not.toHaveBeenCalled();
    });
  }
});

describe("app/proxy.ts — protected dashboard-class routes", () => {
  it("redirects to /?next=<encoded> with no cookie (302)", async () => {
    const res = await proxy(makeRequest({ pathname: "/dashboard" }));
    expect(res.status).toBe(302); // explicit 302 per buildSignInRedirect's status arg
    const location = res.headers.get("location") ?? "";
    expect(location).toContain(`${ORIGIN}/`);
    expect(location).toContain("next=%2Fdashboard");
    expect(verifySessionMock).not.toHaveBeenCalled(); // fast-fail before DB
  });

  it("redirects to /?next=<encoded> with invalid/tampered cookie (302)", async () => {
    verifySessionMock.mockResolvedValueOnce(null);
    const res = await proxy(makeRequest({ pathname: "/dashboard", sessionCookie: "tampered.value" }));
    expect([302, 307]).toContain(res.status);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("next=%2Fdashboard");
    expect(verifySessionMock).toHaveBeenCalledTimes(1);
  });

  it("passes through with valid cookie + enriches x-session-* headers (informational, not auth claims)", async () => {
    verifySessionMock.mockResolvedValueOnce({
      userId: "01ARZ3NDEKTSV4RRFFQ69G5USER",
      sessionId: "01ARZ3NDEKTSV4RRFFQ69G5SES1",
    });
    const res = await proxy(makeRequest({ pathname: "/dashboard", sessionCookie: "valid-cookie" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-session-user-id")).toBe("01ARZ3NDEKTSV4RRFFQ69G5USER");
    expect(res.headers.get("x-session-id")).toBe("01ARZ3NDEKTSV4RRFFQ69G5SES1");
    expect(verifySessionMock).toHaveBeenCalledTimes(1);
  });

  it("preserves ?<query> in the next= parameter", async () => {
    const res = await proxy(makeRequest({ pathname: "/dashboard/positions", search: "?asset=BTC&from=signin" }));
    const location = res.headers.get("location") ?? "";
    // The expanded next should be /dashboard/positions?asset=BTC&from=signin
    // URL-encoded inside the next= parameter.
    expect(location).toContain("next=");
    const params = new URL(location).searchParams;
    expect(params.get("next")).toBe("/dashboard/positions?asset=BTC&from=signin");
  });
});

describe("app/proxy.ts — protected API routes", () => {
  it("returns 401 JSON with no cookie", async () => {
    const res = await proxy(makeRequest({ pathname: "/api/coinbase/balances" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthenticated");
    expect(verifySessionMock).not.toHaveBeenCalled();
  });

  it("returns 401 JSON with invalid/tampered cookie", async () => {
    verifySessionMock.mockResolvedValueOnce(null);
    const res = await proxy(makeRequest({ pathname: "/api/bot/pause", sessionCookie: "tampered" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthenticated");
    expect(verifySessionMock).toHaveBeenCalledTimes(1);
  });

  it("passes through with valid cookie + enriches x-session-* headers", async () => {
    verifySessionMock.mockResolvedValueOnce({
      userId: "01ARZ3NDEKTSV4RRFFQ69G5USER",
      sessionId: "01ARZ3NDEKTSV4RRFFQ69G5SES2",
    });
    const res = await proxy(makeRequest({ pathname: "/api/coinbase/balances", sessionCookie: "valid" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-session-user-id")).toBe("01ARZ3NDEKTSV4RRFFQ69G5USER");
    expect(res.headers.get("x-session-id")).toBe("01ARZ3NDEKTSV4RRFFQ69G5SES2");
  });
});

describe("app/proxy.ts — URL encoding of ?next", () => {
  it("preserves URL-form-encoded pathname through the ?next round-trip", async () => {
    // The URL constructor URL-encodes the pathname at request construction time,
    // so by the time proxy.ts reads request.nextUrl.pathname it's already URL-form
    // (spaces → %20). proxy.ts preserves that string verbatim in the next= param.
    // After URLSearchParams.set + .get round-trip, the value comes back in the
    // same URL-form. CB-1.6's onboarding flow will decodeURI when consuming.
    const res = await proxy(makeRequest({ pathname: "/dashboard/strategies/spaces in name" }));
    const location = res.headers.get("location") ?? "";
    const params = new URL(location).searchParams;
    // URLSearchParams.get returns the URL-form path (decoded once from the
    // search param's own encoding, but the pathname's original %20s remain).
    expect(params.get("next")).toBe("/dashboard/strategies/spaces%20in%20name");
    // The raw query string in the location is double-encoded (%2520) because
    // URLSearchParams escapes the % from the path's existing %20.
    const rawQuery = location.split("?")[1] ?? "";
    expect(rawQuery).toContain("next=");
    expect(rawQuery).toMatch(/spaces%2520in%2520name/);
  });
});

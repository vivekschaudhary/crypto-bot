// Tests for proxy.ts at project root (Next.js 16 middleware/proxy).
//
// Header-forwarding assertion approach: Next.js 16 uses two sentinel
// headers on the response to communicate cloned-request-header overrides
// to the downstream handler:
//
//   x-middleware-override-headers: comma-separated list of overridden keys
//   x-middleware-request-<lowercase-key>: value for each overridden key
//
// The framework reads these AFTER the proxy returns and applies them to
// the next handler's request. So tests asserting on these sentinel headers
// on the proxy's response prove the forwarded-headers contract works.
//
// (Both reviewers on PR #10's first attempt verified this from Next.js
// source. The first-attempt tests asserted on `res.headers.get('x-session-
// user-id')` directly — which is the WRONG surface; that header would be
// on the response visible to the browser. The corrected tests assert on
// the sentinel headers instead.)

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const FAKE_SECRET = "z".repeat(48);
const ORIGIN = "https://crypt-bot.kindtree.us";

vi.mock("@/lib/env", () => ({
  env: () => ({ SESSION_SIGNING_SECRET: FAKE_SECRET }),
  origin: () => ORIGIN,
}));

vi.mock("@/lib/auth/sessions", () => ({
  verifySession: vi.fn(),
  createSession: vi.fn(),
  rotateSession: vi.fn(),
  invalidateSession: vi.fn(),
}));

import { verifySession as libVerifySession } from "@/lib/auth/sessions";
import proxy from "@/proxy";

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

// Helper — extract the set of overridden header keys + their values from a
// NextResponse, using the Next.js documented sentinel-header contract.
function readForwardedHeaders(res: Response): Record<string, string> {
  const overrideList = res.headers.get("x-middleware-override-headers");
  if (!overrideList) return {};
  const keys = overrideList.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
  const out: Record<string, string> = {};
  for (const key of keys) {
    const value = res.headers.get(`x-middleware-request-${key}`);
    if (value !== null) out[key] = value;
  }
  return out;
}

describe("proxy.ts — public-route passthrough (no DB call)", () => {
  const publicPaths = [
    "/", // exact
    "/api/cron/tick", // exact (NOT a prefix — see "PUBLIC_ROUTES tightening" below)
    "/api/auth/register/begin", // intentional prefix sub-path
    "/api/auth/register/finish",
    "/api/auth/authenticate/begin",
    "/api/auth/authenticate/finish",
    "/api/auth/recovery/redeem", // future, but the prefix is reserved
  ];

  for (const pathname of publicPaths) {
    it(`passes through ${pathname} without calling verifySession (AC 6)`, async () => {
      const res = await proxy(makeRequest({ pathname }));
      expect(res.status).toBe(200);
      expect(verifySessionMock).not.toHaveBeenCalled();
    });
  }
});

describe("proxy.ts — PUBLIC_ROUTES tightened matching (security review MEDIUM)", () => {
  it("does NOT classify /api/cron/tick/admin as public (exact match required for /api/cron/tick)", async () => {
    const res = await proxy(makeRequest({ pathname: "/api/cron/tick/admin" }));
    // Should hit the API-401 path (no cookie)
    expect(res.status).toBe(401);
    expect(verifySessionMock).not.toHaveBeenCalled();
  });

  it("does NOT classify /api/cron/tickets as public (prefix-string startswith trap avoidance)", async () => {
    const res = await proxy(makeRequest({ pathname: "/api/cron/tickets" }));
    expect(res.status).toBe(401);
  });
});

describe("proxy.ts — protected dashboard-class routes", () => {
  it("redirects to /sign-in?next=<encoded> with no cookie (302) — CB-1.6 AC 5", async () => {
    const res = await proxy(makeRequest({ pathname: "/dashboard" }));
    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain(`${ORIGIN}/sign-in`);
    expect(location).toContain("next=%2Fdashboard");
    expect(verifySessionMock).not.toHaveBeenCalled();
  });

  it("redirects to /sign-in?next=<encoded> with invalid/tampered cookie (302) — CB-1.6 AC 5", async () => {
    verifySessionMock.mockResolvedValueOnce(null);
    const res = await proxy(makeRequest({ pathname: "/dashboard", sessionCookie: "tampered" }));
    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain(`${ORIGIN}/sign-in`);
    expect(verifySessionMock).toHaveBeenCalledTimes(1);
  });

  it("forwards x-session-user-id + x-session-id via Next.js middleware-override sentinels on valid session", async () => {
    verifySessionMock.mockResolvedValueOnce({
      userId: "01ARZ3NDEKTSV4RRFFQ69G5USER",
      sessionId: "01ARZ3NDEKTSV4RRFFQ69G5SES1",
    });
    const res = await proxy(makeRequest({ pathname: "/dashboard", sessionCookie: "valid" }));
    expect(res.status).toBe(200);

    const forwarded = readForwardedHeaders(res);
    expect(forwarded["x-session-user-id"]).toBe("01ARZ3NDEKTSV4RRFFQ69G5USER");
    expect(forwarded["x-session-id"]).toBe("01ARZ3NDEKTSV4RRFFQ69G5SES1");

    // Critical anti-leak check: the values must NOT appear on the actual
    // response headers (where they'd leak to the browser).
    expect(res.headers.get("x-session-user-id")).toBeNull();
    expect(res.headers.get("x-session-id")).toBeNull();
  });

  it("preserves ?<query> in the next= parameter", async () => {
    const res = await proxy(makeRequest({ pathname: "/dashboard/positions", search: "?asset=BTC" }));
    const location = res.headers.get("location") ?? "";
    const params = new URL(location).searchParams;
    expect(params.get("next")).toContain("/dashboard/positions");
    expect(params.get("next")).toContain("asset=BTC");
  });
});

describe("proxy.ts — protected API routes", () => {
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
  });

  it("forwards x-session-* via sentinels on valid session, doesn't leak to response", async () => {
    verifySessionMock.mockResolvedValueOnce({
      userId: "01ARZ3NDEKTSV4RRFFQ69G5USER",
      sessionId: "01ARZ3NDEKTSV4RRFFQ69G5SES2",
    });
    const res = await proxy(makeRequest({ pathname: "/api/coinbase/balances", sessionCookie: "valid" }));
    expect(res.status).toBe(200);
    const forwarded = readForwardedHeaders(res);
    expect(forwarded["x-session-user-id"]).toBe("01ARZ3NDEKTSV4RRFFQ69G5USER");
    expect(res.headers.get("x-session-user-id")).toBeNull();
  });
});

describe("proxy.ts — ?next path safety (security review HIGH)", () => {
  it("rejects protocol-relative pathname (//evil.example)", async () => {
    // Construct via raw URL bypassing typical normalization.
    const url = new URL(`${ORIGIN}//evil.example/path`);
    const req = new NextRequest(url, { method: "GET" });
    const res = await proxy(req);
    const location = res.headers.get("location") ?? "";
    const params = new URL(location).searchParams;
    // The redirect MUST NOT carry next=//evil.example/...
    expect(params.has("next")).toBe(false);
  });

  it("rejects pathname containing backslash", async () => {
    const url = new URL(`${ORIGIN}/dashboard/\\evil`);
    const req = new NextRequest(url, { method: "GET" });
    const res = await proxy(req);
    const location = res.headers.get("location") ?? "";
    const params = new URL(location).searchParams;
    expect(params.has("next")).toBe(false);
  });

  it("emits ?next=<safe-path> for legitimate same-origin paths", async () => {
    const res = await proxy(makeRequest({ pathname: "/dashboard/strategies" }));
    const location = res.headers.get("location") ?? "";
    const params = new URL(location).searchParams;
    expect(params.get("next")).toBe("/dashboard/strategies");
  });
});

describe("proxy.ts — cookie length cap (security review MEDIUM)", () => {
  it("rejects an excessively-long cookie without calling verifySession", async () => {
    const huge = "a".repeat(2049); // 1 byte over the cap
    const res = await proxy(makeRequest({ pathname: "/dashboard", sessionCookie: huge }));
    expect(res.status).toBe(302); // dashboard-class → redirect on invalid
    expect(verifySessionMock).not.toHaveBeenCalled(); // bypass HMAC compute
  });

  it("rejects an excessively-long cookie on API route (401)", async () => {
    const huge = "b".repeat(2049);
    const res = await proxy(makeRequest({ pathname: "/api/coinbase/balances", sessionCookie: huge }));
    expect(res.status).toBe(401);
    expect(verifySessionMock).not.toHaveBeenCalled();
  });

  it("accepts a normal-length cookie (passes to verifySession)", async () => {
    verifySessionMock.mockResolvedValueOnce({ userId: "u1", sessionId: "s1" });
    // Realistic signed-cookie length is ~70 bytes
    const normal = "valid-shape.signature";
    const res = await proxy(makeRequest({ pathname: "/dashboard", sessionCookie: normal }));
    expect(res.status).toBe(200);
    expect(verifySessionMock).toHaveBeenCalledTimes(1);
  });
});

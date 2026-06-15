// Tests for POST /api/bot/override (CB-5.3 AC 10).
//
// Mocking strategy mirrors tests/api/auth/sign-out.test.ts: the route is
// pure composition over high-level helpers (verifySession + the override DB
// ops + loadSingletonSession) plus the origin-check + rate-limit pipeline.
// We mock those modules directly; the DB layer is never reached by these
// tests, matching the route's real call graph.

import { beforeEach, describe, expect, it, vi } from "vitest";

const FAKE_SECRET = "z".repeat(48);
const ORIGIN = "https://crypto-bot.kindtree.us";

vi.mock("@/lib/env", () => ({
  env: () => ({ SESSION_SIGNING_SECRET: FAKE_SECRET }),
  origin: () => ORIGIN,
}));

vi.mock("@/lib/auth/sessions", () => ({ verifySession: vi.fn() }));

vi.mock("@/lib/bot/overrides", () => ({
  pauseSession: vi.fn(),
  resumeSession: vi.fn(),
  resetSession: vi.fn(),
}));

import { verifySession } from "@/lib/auth/sessions";
import { pauseSession, resetSession, resumeSession } from "@/lib/bot/overrides";
import { SESSION_COOKIE_NAME } from "@/lib/auth/cookie";
import { __resetRateLimits } from "@/lib/auth/rate-limit";
import { DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT } from "@/app/api/bot/override/route";

const verifySessionMock = vi.mocked(verifySession);
const pauseMock = vi.mocked(pauseSession);
const resumeMock = vi.mocked(resumeSession);
const resetMock = vi.mocked(resetSession);

const VALID_CLAIMS = { userId: "01ARZ3NDEKTSV4RRFFQ69G5USER", sessionId: "01ARZ3NDEKTSV4RRFFQ69G5SES1" };

function makeRequest(opts: {
  method?: string;
  cookie?: string | null;
  origin?: string | null;
  body?: unknown;
} = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN;
  if (opts.cookie !== null) headers.cookie = opts.cookie ?? `${SESSION_COOKIE_NAME}=signed-token`;
  return new Request(`${ORIGIN}/api/bot/override`, {
    method: opts.method ?? "POST",
    headers,
    body: opts.body === undefined ? JSON.stringify({ kind: "pause" }) : JSON.stringify(opts.body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimits();
  verifySessionMock.mockResolvedValue(VALID_CLAIMS);
  pauseMock.mockResolvedValue({ ok: true, status: "paused", sessionId: "session-1" });
  resumeMock.mockResolvedValue({ ok: true, status: "active", sessionId: "session-1" });
  resetMock.mockResolvedValue({ ok: true, status: "active", sessionId: "session-2" });
});

describe("POST /api/bot/override — happy paths per kind", () => {
  it("pause → 200 { ok, status: 'paused' } + pauseSession() (no route-supplied id)", async () => {
    const res = await POST(makeRequest({ body: { kind: "pause" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "paused" });
    // The helper resolves the current session itself (round-1 BLOCKER fix) —
    // the route passes NO session id.
    expect(pauseMock).toHaveBeenCalledWith();
    expect(resumeMock).not.toHaveBeenCalled();
    expect(resetMock).not.toHaveBeenCalled();
  });

  it("resume → 200 { ok, status: 'active' } + resumeSession()", async () => {
    const res = await POST(makeRequest({ body: { kind: "resume" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "active" });
    expect(resumeMock).toHaveBeenCalledWith();
  });

  it("reset → 200 + resetSession() (resolves + carries strategy in-tx)", async () => {
    const res = await POST(makeRequest({ body: { kind: "reset" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "active" });
    expect(resetMock).toHaveBeenCalledWith();
  });
});

describe("POST /api/bot/override — session-integrity outcomes", () => {
  it("helper returns no-session (none current) → 409 no-session", async () => {
    pauseMock.mockResolvedValueOnce({ ok: false, reason: "no-session" });
    const res = await POST(makeRequest({ body: { kind: "pause" } }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "no-session" });
  });

  it("concurrent fork (unique-index 23505) → 409 conflict, not 500", async () => {
    const err = Object.assign(new Error("duplicate key"), { code: "23505" });
    resetMock.mockRejectedValueOnce(err);
    const res = await POST(makeRequest({ body: { kind: "reset" } }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "conflict" });
  });

  it("a non-23505 helper error propagates (not swallowed as a conflict)", async () => {
    resetMock.mockRejectedValueOnce(new Error("db down"));
    await expect(POST(makeRequest({ body: { kind: "reset" } }))).rejects.toThrow("db down");
  });
});

describe("POST /api/bot/override — auth", () => {
  it("no cookie → 401, no DB ops", async () => {
    const res = await POST(makeRequest({ cookie: null }));
    expect(res.status).toBe(401);
    expect(verifySessionMock).not.toHaveBeenCalled();
    expect(pauseMock).not.toHaveBeenCalled();
  });

  it("invalid session (verifySession null) → 401, no DB ops", async () => {
    verifySessionMock.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
    expect(pauseMock).not.toHaveBeenCalled();
  });

  it("origin mismatch → 403, verifySession NOT called", async () => {
    const res = await POST(makeRequest({ origin: "https://evil.example.com" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "origin-mismatch" });
    expect(verifySessionMock).not.toHaveBeenCalled();
  });

  it("missing origin → 403", async () => {
    const res = await POST(makeRequest({ origin: null }));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/bot/override — kind validation", () => {
  it("unknown kind → 400 invalid-kind, no DB op", async () => {
    const res = await POST(makeRequest({ body: { kind: "frobnicate" } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid-kind" });
    expect(pauseMock).not.toHaveBeenCalled();
  });

  it("missing kind → 400 invalid-kind", async () => {
    const res = await POST(makeRequest({ body: {} }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid-kind" });
  });

  it.each(["force_buy", "sell_50", "sell_all"])(
    "deferred real-money kind %s → 400 kind-deferred, no DB op (CB-5.4)",
    async (kind) => {
      const res = await POST(makeRequest({ body: { kind } }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("kind-deferred");
      expect(pauseMock).not.toHaveBeenCalled();
      expect(resetMock).not.toHaveBeenCalled();
    },
  );
});

describe("/api/bot/override — method discipline (typed 405)", () => {
  it.each([
    ["GET", GET],
    ["PUT", PUT],
    ["PATCH", PATCH],
    ["DELETE", DELETE],
    ["HEAD", HEAD],
  ])("%s → 405 typed JSON + Allow", async (_name, handler) => {
    const res = handler();
    expect(res.status).toBe(405);
    expect(await res.json()).toEqual({ error: "method-not-allowed" });
    expect(res.headers.get("allow")).toBe("POST, OPTIONS");
  });

  it("OPTIONS → 204 + Allow (origin passes)", async () => {
    const res = OPTIONS(makeRequest({ method: "OPTIONS" }));
    expect(res.status).toBe(204);
    expect(res.headers.get("allow")).toBe("POST, OPTIONS");
  });

  it("OPTIONS bad origin → 403", async () => {
    const res = OPTIONS(makeRequest({ method: "OPTIONS", origin: "https://evil.example" }));
    expect(res.status).toBe(403);
  });
});

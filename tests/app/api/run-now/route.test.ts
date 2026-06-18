// Tests for POST /api/run-now (CB-6.5). Mirrors tests/app/api/bot/override.test.ts:
// the route is pure composition over high-level helpers (verifySession +
// runBotTick) plus the origin-check + rate-limit pipeline. We mock those; the
// tick pipeline itself is covered by run-tick.test.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";

const FAKE_SECRET = "z".repeat(48);
const ORIGIN = "https://crypto-bot.kindtree.us";

vi.mock("@/lib/env", () => ({
  env: () => ({ SESSION_SIGNING_SECRET: FAKE_SECRET }),
  origin: () => ORIGIN,
}));

vi.mock("@/lib/auth/sessions", () => ({ verifySession: vi.fn() }));
vi.mock("@/lib/ticks/run-tick", () => ({ runBotTick: vi.fn() }));

import { verifySession } from "@/lib/auth/sessions";
import { SESSION_COOKIE_NAME } from "@/lib/auth/cookie";
import { __resetRateLimits } from "@/lib/auth/rate-limit";
import { runBotTick } from "@/lib/ticks/run-tick";
import { DELETE, GET, OPTIONS, POST, PUT } from "@/app/api/run-now/route";

const verifySessionMock = vi.mocked(verifySession);
const runBotTickMock = vi.mocked(runBotTick);

const VALID_CLAIMS = { userId: "01ARZ3NDEKTSV4RRFFQ69G5USER", sessionId: "01ARZ3NDEKTSV4RRFFQ69G5SES1" };

function makeRequest(opts: { method?: string; cookie?: string | null; origin?: string | null } = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN;
  if (opts.cookie !== null) headers.cookie = opts.cookie ?? `${SESSION_COOKIE_NAME}=signed-token`;
  return new Request(`${ORIGIN}/api/run-now`, { method: opts.method ?? "POST", headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimits();
  verifySessionMock.mockResolvedValue(VALID_CLAIMS);
  runBotTickMock.mockResolvedValue({
    kind: "ran",
    tickId: "01HRUNTICK0000000000000000",
    tickStartedAt: new Date("2026-06-17T00:07:33.250Z"),
    liveMode: false,
    decisions: [{ asset: "BTC-USD", decision: "hold", reason: "BTC-USD: hold" }],
  });
});

describe("POST /api/run-now — auth", () => {
  it("401 without a session cookie (does NOT run the tick)", async () => {
    const res = await POST(makeRequest({ cookie: null }));
    expect(res.status).toBe(401);
    expect(runBotTickMock).not.toHaveBeenCalled();
  });

  it("401 when verifySession fails", async () => {
    verifySessionMock.mockResolvedValue(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(runBotTickMock).not.toHaveBeenCalled();
  });

  it("403 on origin mismatch (CSRF) — does NOT run the tick", async () => {
    const res = await POST(makeRequest({ origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(runBotTickMock).not.toHaveBeenCalled();
  });

  it("429 when rate-limited (6th request in the window)", async () => {
    for (let i = 0; i < 5; i++) await POST(makeRequest());
    const res = await POST(makeRequest());
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
  });
});

describe("POST /api/run-now — outcomes (source:\"manual\")", () => {
  it("ran → 200 { ok, ran } + runBotTick(source:manual)", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, ran: true, tickId: "01HRUNTICK0000000000000000" });
    expect(runBotTickMock).toHaveBeenCalledWith({ source: "manual" });
  });

  it("skipped (paused) → 200 { ok, skipped }", async () => {
    runBotTickMock.mockResolvedValue({ kind: "skipped", reason: "session_paused", liveMode: false });
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, skipped: "session_paused" });
  });

  it("duplicate → 200 { ok, duplicate }", async () => {
    runBotTickMock.mockResolvedValue({ kind: "duplicate", tickStartedAt: new Date(), liveMode: false });
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, duplicate: true });
  });

  it("error → 500 { ok:false, error }", async () => {
    runBotTickMock.mockResolvedValue({ kind: "error", message: "boom", liveMode: false });
    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "boom" });
  });
});

describe("POST /api/run-now — method gating", () => {
  it("GET/PUT/DELETE → 405", async () => {
    expect(GET().status).toBe(405);
    expect(PUT().status).toBe(405);
    expect(DELETE().status).toBe(405);
  });
  it("OPTIONS → 204 with Allow", () => {
    const res = OPTIONS(makeRequest({ method: "OPTIONS" }));
    expect(res.status).toBe(204);
    expect(res.headers.get("allow")).toContain("POST");
  });
});

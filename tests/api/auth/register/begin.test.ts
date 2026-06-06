import { beforeEach, describe, expect, it, vi } from "vitest";

const FAKE_SECRET = "z".repeat(48);
const ORIGIN = "https://crypto-bot.kindtree.us";

vi.mock("@/lib/env", () => ({
  env: () => ({ SESSION_SIGNING_SECRET: FAKE_SECRET }),
  origin: () => ORIGIN,
}));

// In-memory mock for the auth_users existence check.
let userCount = 0;

function makeSql() {
  function execute(parts: TemplateStringsArray, ..._args: unknown[]): unknown {
    const query = parts.join("?").trim().toUpperCase();
    if (query.startsWith("SELECT COUNT(*)::INT AS COUNT FROM AUTH_USERS")) {
      return Promise.resolve([{ count: userCount }]);
    }
    throw new Error(`Unhandled mock query in begin.test: ${query}`);
  }
  const sql = execute as unknown as {
    (parts: TemplateStringsArray, ...args: unknown[]): unknown;
    begin: (fn: (tx: typeof sql) => Promise<void>) => Promise<void>;
    unsafe: (s: string) => string;
  };
  sql.begin = async (fn) => {
    await fn(sql);
  };
  sql.unsafe = (s: string) => s;
  return sql;
}

let sqlClient = makeSql();
vi.mock("@/lib/db/client", () => ({
  db: () => sqlClient,
}));

import { OPTIONS, POST } from "@/app/api/auth/register/begin/route";
import { __resetRateLimits } from "@/lib/auth/rate-limit";

beforeEach(() => {
  userCount = 0;
  sqlClient = makeSql();
  __resetRateLimits();
});

function makeRequest(opts: { body?: unknown; origin?: string | null } = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN;
  return new Request(`${ORIGIN}/api/auth/register/begin`, {
    method: "POST",
    headers,
    body: JSON.stringify(opts.body ?? {}),
  });
}

describe("POST /api/auth/register/begin", () => {
  it("happy path: returns 200 with options + sets the reg-session cookie", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.options).toBeDefined();
    expect(body.options.rp.id).toBe("crypto-bot.kindtree.us");
    expect(body.options.challenge).toBeDefined();
    expect(body.pendingUserId).toBeUndefined(); // pendingUserId is NOT in response body

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("__compass_reg_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Path=/api/auth/register/finish");
    expect(setCookie).toContain("Max-Age=60");
  });

  it("returns 409 registration-disabled when a user already exists", async () => {
    userCount = 1;
    const res = await POST(makeRequest());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("registration-disabled");
  });

  it("returns 403 origin-mismatch when Origin header doesn't match", async () => {
    const res = await POST(makeRequest({ origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("origin-mismatch");
  });

  it("returns 400 invalid-body when deviceLabel is the wrong type", async () => {
    const res = await POST(makeRequest({ body: { deviceLabel: 12345 } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid-body");
  });

  it("returns 429 rate-limited after 5 calls from the same Origin", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
      // Reset for first-time-only gate (counter stays at 0; we're testing the limiter only)
      userCount = 0;
    }
    const res = await POST(makeRequest());
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("rate-limited");
    expect(typeof body.retryAfterSeconds).toBe("number");
    expect(res.headers.get("retry-after")).toBeTruthy();
  });

  it("OPTIONS preflight returns 204 on same-origin", () => {
    const req = new Request(`${ORIGIN}/api/auth/register/begin`, {
      method: "OPTIONS",
      headers: { origin: ORIGIN },
    });
    const res = OPTIONS(req);
    expect(res.status).toBe(204);
    expect(res.headers.get("allow")).toContain("POST");
  });

  it("OPTIONS preflight returns 403 origin-mismatch on cross-origin", async () => {
    const req = new Request(`${ORIGIN}/api/auth/register/begin`, {
      method: "OPTIONS",
      headers: { origin: "https://evil.example" },
    });
    const res = OPTIONS(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("origin-mismatch");
  });

  it("accepts a custom deviceLabel in the request body", async () => {
    const res = await POST(makeRequest({ body: { deviceLabel: "My iPad" } }));
    expect(res.status).toBe(200);
    // Decode the signed cookie to confirm the deviceLabel was carried through
    const setCookie = res.headers.get("set-cookie") ?? "";
    const cookieValue = /__compass_reg_session=([^;]+)/.exec(setCookie)?.[1];
    expect(cookieValue).toBeTruthy();
    const cookieModule = await import("@/lib/auth/cookie");
    const verified = cookieModule.verifyValue(cookieValue!, FAKE_SECRET);
    expect(verified).toBeTruthy();
    const payload = JSON.parse(verified!.value);
    expect(payload.deviceLabel).toBe("My iPad");
    expect(payload.pendingUserId).toMatch(/^[0-9A-Z]{26}$/); // ULID
    expect(payload.challenge).toBeDefined();
  });
});

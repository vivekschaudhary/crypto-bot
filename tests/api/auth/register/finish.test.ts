import { beforeEach, describe, expect, it, vi } from "vitest";

const FAKE_SECRET = "z".repeat(48);
const ORIGIN = "https://crypt-bot.kindtree.us";

vi.mock("@/lib/env", () => ({
  env: () => ({ SESSION_SIGNING_SECRET: FAKE_SECRET }),
  origin: () => ORIGIN,
}));

// Stub next/cache so the route handler can call revalidateTag under
// vitest where there's no incremental cache context. unstable_cache also
// needs stubbing because the route transitively imports
// @/lib/auth/credential-count which wraps a fn with it at module load.
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn,
  revalidateTag: vi.fn(),
}));

// Mock SimpleWebAuthn verify — the route exercises wrapper plumbing; lib's
// cryptographic verification is its own test surface (see CB-1.1.1 AC 3).
// Factory is hoisted to module top, so the mock fn must be declared inline.
// Retrieve via vi.mocked() in tests.
vi.mock("@simplewebauthn/server", () => ({
  generateRegistrationOptions: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}));
import { verifyRegistrationResponse as libVerifyRegistrationResponse } from "@simplewebauthn/server";
const verifyRegistrationResponseMock = vi.mocked(libVerifyRegistrationResponse);

// DB mock — covers the count-users gate, INSERT into auth_users, INSERT into
// auth_credentials, plus the createSession INSERT into auth_sessions.
type UserRow = { id: string; display_name: string };
type CredentialRow = { id: string; user_id: string; credential_id: Buffer; public_key: Buffer; counter: number; device_label: string; transports: string[] };
type SessionRow = { id: string; user_id: string; expires_at: Date };

let users: UserRow[] = [];
let credentials: CredentialRow[] = [];
let sessions: SessionRow[] = [];

function makeSql() {
  function execute(parts: TemplateStringsArray, ...args: unknown[]): unknown {
    const query = parts.join("?").trim().toUpperCase();
    if (query.startsWith("SELECT COUNT(*)::INT AS COUNT FROM AUTH_USERS")) {
      return Promise.resolve([{ count: users.length }]);
    }
    if (query.startsWith("INSERT INTO AUTH_USERS")) {
      const [id, displayName] = args as [string, string];
      users.push({ id, display_name: displayName });
      return Promise.resolve([]);
    }
    if (query.startsWith("INSERT INTO AUTH_CREDENTIALS")) {
      const [id, userId, credentialId, publicKey, counter, deviceLabel, transports] = args as [
        string,
        string,
        Buffer,
        Buffer,
        number,
        string,
        string[],
      ];
      credentials.push({ id, user_id: userId, credential_id: credentialId, public_key: publicKey, counter, device_label: deviceLabel, transports });
      return Promise.resolve([]);
    }
    if (query.startsWith("INSERT INTO AUTH_SESSIONS")) {
      const [id, userId] = args as [string, string];
      sessions.push({ id, user_id: userId, expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) });
      return Promise.resolve([]);
    }
    throw new Error(`Unhandled mock query in finish.test: ${query}`);
  }
  const sql = execute as unknown as {
    (parts: TemplateStringsArray, ...args: unknown[]): unknown;
    begin: (fn: (tx: typeof sql) => Promise<void>) => Promise<void>;
    unsafe: (s: string) => string;
  };
  sql.begin = async (fn) => {
    return fn(sql);
  };
  sql.unsafe = (s: string) => s;
  return sql;
}

let sqlClient = makeSql();
vi.mock("@/lib/db/client", () => ({
  db: () => sqlClient,
}));

import { OPTIONS, POST } from "@/app/api/auth/register/finish/route";
import { signValue } from "@/lib/auth/cookie";
import { __resetRateLimits } from "@/lib/auth/rate-limit";

function buildRegSessionCookie(payload: { challenge: string; pendingUserId: string; deviceLabel: string }, maxAge = 60): string {
  const signed = signValue(JSON.stringify(payload), FAKE_SECRET, maxAge);
  return `__compass_reg_session=${signed}`;
}

function makeRequest(opts: { body?: unknown; cookie?: string | null; origin?: string | null } = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN;
  if (opts.cookie !== null && opts.cookie !== undefined) headers.cookie = opts.cookie;
  return new Request(`${ORIGIN}/api/auth/register/finish`, {
    method: "POST",
    headers,
    body: JSON.stringify(opts.body ?? {}),
  });
}

beforeEach(() => {
  users = [];
  credentials = [];
  sessions = [];
  sqlClient = makeSql();
  verifyRegistrationResponseMock.mockReset();
  __resetRateLimits();
});

describe("POST /api/auth/register/finish", () => {
  const goodCookie = buildRegSessionCookie({
    challenge: "test-challenge",
    pendingUserId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    deviceLabel: "Test device",
  });

  const goodVerifyResult = {
    verified: true,
    registrationInfo: {
      credential: {
        id: "AAAA",
        publicKey: new Uint8Array([1, 2, 3]),
        counter: 0,
        transports: ["internal"],
      },
      credentialDeviceType: "singleDevice",
      credentialBackedUp: false,
    },
  };

  it("happy path: returns 200 + writes user/credential/session + sets session cookie + clears reg cookie", async () => {
    verifyRegistrationResponseMock.mockResolvedValueOnce(goodVerifyResult as never);
    const res = await POST(
      makeRequest({
        cookie: goodCookie,
        body: { response: { id: "AAAA" } },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe("01ARZ3NDEKTSV4RRFFQ69G5FAV");
    expect(body.sessionId).toMatch(/^[0-9A-Z]{26}$/);

    expect(users).toHaveLength(1);
    expect(users[0]).toEqual({ id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", display_name: "operator" });
    expect(credentials).toHaveLength(1);
    expect(credentials[0]!.device_label).toBe("Test device");
    expect(credentials[0]!.transports).toEqual(["internal"]);
    expect(sessions).toHaveLength(1);

    const setCookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
    const joined = setCookies.join("\n");
    // session cookie set
    expect(joined).toContain("__compass_session=");
    expect(joined).toContain("HttpOnly");
    expect(joined).toContain("Secure");
    expect(joined).toContain("SameSite=Strict");
    expect(joined).toContain("Path=/");
    // reg cookie cleared
    expect(joined).toMatch(/__compass_reg_session=;.*Max-Age=0/s);
  });

  it("returns 400 challenge-missing-or-expired when no reg-session cookie present", async () => {
    const res = await POST(makeRequest({ cookie: null, body: { response: { id: "AAAA" } } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("challenge-missing-or-expired");
  });

  it("returns 400 challenge-missing-or-expired for a tampered cookie", async () => {
    const cookie = buildRegSessionCookie({ challenge: "x", pendingUserId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", deviceLabel: "x" });
    const tampered = cookie.slice(0, -1) + (cookie.endsWith("A") ? "B" : "A");
    const res = await POST(makeRequest({ cookie: tampered, body: { response: { id: "AAAA" } } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("challenge-missing-or-expired");
  });

  it("returns 400 verification-failed when the WebAuthn verifier returns verified: false", async () => {
    verifyRegistrationResponseMock.mockResolvedValueOnce({ verified: false });
    const res = await POST(makeRequest({ cookie: goodCookie, body: { response: { id: "AAAA" } } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("verification-failed");
    expect(users).toHaveLength(0);
  });

  it("returns 400 verification-failed when the WebAuthn verifier throws", async () => {
    verifyRegistrationResponseMock.mockRejectedValueOnce(new Error("invalid attestation"));
    const res = await POST(makeRequest({ cookie: goodCookie, body: { response: { id: "AAAA" } } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("verification-failed");
    expect(users).toHaveLength(0);
  });

  it("returns 409 registration-disabled when a user already exists at DB time (race-safe gate)", async () => {
    users = [{ id: "existing-user", display_name: "operator" }];
    verifyRegistrationResponseMock.mockResolvedValueOnce(goodVerifyResult as never);
    const res = await POST(makeRequest({ cookie: goodCookie, body: { response: { id: "AAAA" } } }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("registration-disabled");
    expect(users).toHaveLength(1); // unchanged
    expect(credentials).toHaveLength(0);
    expect(sessions).toHaveLength(0);
  });

  it("returns 403 origin-mismatch when Origin header is wrong", async () => {
    const res = await POST(
      makeRequest({ cookie: goodCookie, origin: "https://evil.example", body: { response: { id: "AAAA" } } }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("origin-mismatch");
  });

  it("returns 400 invalid-body when response field is missing", async () => {
    const res = await POST(makeRequest({ cookie: goodCookie, body: {} }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid-body");
  });

  it("returns 409 registration-disabled when the DB singleton unique-index fires (race collision)", async () => {
    // Simulate the singleton index from migration 0002: the count check passes
    // (returns 0) but the INSERT INTO auth_users throws postgres error 23505.
    verifyRegistrationResponseMock.mockResolvedValueOnce(goodVerifyResult as never);
    sqlClient = (() => {
      function execute(parts: TemplateStringsArray, ..._args: unknown[]): unknown {
        const query = parts.join("?").trim().toUpperCase();
        if (query.startsWith("SELECT COUNT(*)::INT AS COUNT FROM AUTH_USERS")) {
          return Promise.resolve([{ count: 0 }]);
        }
        if (query.startsWith("INSERT INTO AUTH_USERS")) {
          const err = new Error("duplicate key value violates unique constraint") as Error & { code: string };
          err.code = "23505";
          throw err;
        }
        throw new Error(`Unhandled mock query in race test: ${query}`);
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
    })();

    const res = await POST(makeRequest({ cookie: goodCookie, body: { response: { id: "AAAA" } } }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("registration-disabled");
  });
});

describe("OPTIONS /api/auth/register/finish", () => {
  it("returns 204 when Origin matches APP_ORIGIN (same-origin preflight)", () => {
    const req = new Request(`${ORIGIN}/api/auth/register/finish`, {
      method: "OPTIONS",
      headers: { origin: ORIGIN },
    });
    const res = OPTIONS(req);
    expect(res.status).toBe(204);
    expect(res.headers.get("allow")).toContain("POST");
  });

  it("returns 403 origin-mismatch on cross-origin preflight", async () => {
    const req = new Request(`${ORIGIN}/api/auth/register/finish`, {
      method: "OPTIONS",
      headers: { origin: "https://evil.example" },
    });
    const res = OPTIONS(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("origin-mismatch");
  });

  it("returns 403 origin-mismatch when both Origin and Referer are absent", async () => {
    const req = new Request(`${ORIGIN}/api/auth/register/finish`, {
      method: "OPTIONS",
      headers: {},
    });
    const res = OPTIONS(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("origin-mismatch");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { signValue } from "@/lib/auth/cookie";

const FAKE_SECRET = "z".repeat(48);
const ORIGIN = "https://crypto-bot.kindtree.us";

vi.mock("@/lib/env", () => ({
  env: () => ({ SESSION_SIGNING_SECRET: FAKE_SECRET }),
  origin: () => ORIGIN,
}));

vi.mock("@simplewebauthn/server", () => ({
  generateRegistrationOptions: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}));
import { verifyAuthenticationResponse as libVerifyAuthenticationResponse } from "@simplewebauthn/server";
const verifyAuthenticationResponseMock = vi.mocked(libVerifyAuthenticationResponse);

// In-memory DB mock.
const credentialIdBase64 = Buffer.from("AAAA", "base64url").toString("base64url");

type CredRow = {
  id: string;
  user_id: string;
  public_key: Buffer;
  counter: number;
  transports: string[];
};
type SessionRow = { id: string; user_id: string; expires_at: Date };

let credentials: CredRow[] = [];
let sessions: SessionRow[] = [];
let credentialCounter = 0;
let credentialLastUsedAt: Date | null = null;

function freshCredentials(): CredRow[] {
  return [
    {
      id: "01ARZ3NDEKTSV4RRFFQ69G5CRED",
      user_id: "01ARZ3NDEKTSV4RRFFQ69G5USER",
      public_key: Buffer.from([1, 2, 3]),
      counter: 0,
      transports: ["internal"],
    },
  ];
}

function makeSql() {
  function execute(parts: TemplateStringsArray, ...args: unknown[]): unknown {
    // Normalize multi-line tagged-template SQL: collapse whitespace to single
    // spaces so route handlers' multi-line queries match the startsWith checks.
    const query = parts.join("?").replace(/\s+/g, " ").trim().toUpperCase();
    if (query.startsWith("SELECT ID, USER_ID, PUBLIC_KEY, COUNTER, TRANSPORTS FROM AUTH_CREDENTIALS")) {
      return Promise.resolve(credentials);
    }
    if (query.startsWith("UPDATE AUTH_CREDENTIALS")) {
      const [newCounter] = args as [number];
      credentialCounter = newCounter;
      credentialLastUsedAt = new Date();
      if (credentials[0]) credentials[0].counter = newCounter;
      return Promise.resolve([]);
    }
    if (query.startsWith("INSERT INTO AUTH_SESSIONS")) {
      const [id, userId] = args as [string, string];
      sessions.push({ id, user_id: userId, expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) });
      return Promise.resolve([]);
    }
    if (query.startsWith("DELETE FROM AUTH_SESSIONS WHERE ID =")) {
      const [id] = args as [string];
      sessions = sessions.filter((s) => s.id !== id);
      return Promise.resolve([]);
    }
    throw new Error(`Unhandled mock query in authenticate/finish.test: ${query}`);
  }
  const sql = execute as unknown as {
    (parts: TemplateStringsArray, ...args: unknown[]): unknown;
    begin: (fn: (tx: typeof sql) => Promise<unknown>) => Promise<unknown>;
    unsafe: (s: string) => string;
  };
  sql.begin = async (fn) => fn(sql);
  sql.unsafe = (s: string) => s;
  return sql;
}

let sqlClient = makeSql();
vi.mock("@/lib/db/client", () => ({
  db: () => sqlClient,
}));

import { OPTIONS, POST } from "@/app/api/auth/authenticate/finish/route";
import { mintChallenge } from "@/lib/auth/challenges";
import { __resetRateLimits } from "@/lib/auth/rate-limit";

beforeEach(() => {
  credentials = freshCredentials();
  sessions = [];
  credentialCounter = 0;
  credentialLastUsedAt = null;
  sqlClient = makeSql();
  verifyAuthenticationResponseMock.mockReset();
  __resetRateLimits();
});

function mintAuthCookie(): { challenge: string; cookie: string } {
  const { challenge, signedToken } = mintChallenge("authentication");
  return { challenge, cookie: `__compass_auth_session=${signedToken}` };
}

function makeRequest(opts: {
  body?: unknown;
  cookie?: string | null;
  origin?: string | null;
  extraCookies?: string;
} = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN;
  let cookieValue = opts.cookie ?? "";
  if (opts.extraCookies) cookieValue = cookieValue ? `${cookieValue}; ${opts.extraCookies}` : opts.extraCookies;
  if (opts.cookie !== null && cookieValue) headers.cookie = cookieValue;
  return new Request(`${ORIGIN}/api/auth/authenticate/finish`, {
    method: "POST",
    headers,
    body: JSON.stringify(opts.body ?? {}),
  });
}

function goodVerifyResult(opts: { newCounter: number }): unknown {
  return {
    verified: true,
    authenticationInfo: {
      credentialID: credentialIdBase64,
      newCounter: opts.newCounter,
      userVerified: true,
      credentialDeviceType: "singleDevice",
      credentialBackedUp: false,
      origin: ORIGIN,
      rpID: "crypto-bot.kindtree.us",
    },
  };
}

describe("POST /api/auth/authenticate/finish", () => {
  it("happy path (no pre-existing session): verifies, updates counter, creates session, sets cookie", async () => {
    const { cookie } = mintAuthCookie();
    verifyAuthenticationResponseMock.mockResolvedValueOnce(goodVerifyResult({ newCounter: 1 }) as never);

    const res = await POST(
      makeRequest({
        cookie,
        body: { response: { id: credentialIdBase64 } },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe("01ARZ3NDEKTSV4RRFFQ69G5USER");
    expect(body.sessionId).toMatch(/^[0-9A-Z]{26}$/);

    expect(credentialCounter).toBe(1);
    expect(credentialLastUsedAt).not.toBeNull();
    expect(sessions.length).toBe(1);

    const setCookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
    const joined = setCookies.join("\n");
    expect(joined).toContain("__compass_session=");
    expect(joined).toContain("HttpOnly");
    expect(joined).toContain("Secure");
    expect(joined).toContain("SameSite=Strict");
    expect(joined).toContain("Path=/");
    expect(joined).toMatch(/__compass_auth_session=;.*Max-Age=0/s);
  });

  it("happy path (with valid pre-existing session): rotates — old id deleted, new id different", async () => {
    // Seed an existing session row + signed cookie
    const oldSessionId = "01ARZ3NDEKTSV4RRFFQ69G5OLD0";
    sessions = [
      { id: oldSessionId, user_id: "01ARZ3NDEKTSV4RRFFQ69G5USER", expires_at: new Date(Date.now() + 1000_000) },
    ];
    const oldSessionCookie = signValue(oldSessionId, FAKE_SECRET, 60 * 60);

    const { cookie: authCookie } = mintAuthCookie();
    verifyAuthenticationResponseMock.mockResolvedValueOnce(goodVerifyResult({ newCounter: 1 }) as never);

    const res = await POST(
      makeRequest({
        cookie: authCookie,
        extraCookies: `__compass_session=${oldSessionCookie}`,
        body: { response: { id: credentialIdBase64 } },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessionId).not.toBe(oldSessionId);
    // Old session deleted, new session present
    expect(sessions.find((s) => s.id === oldSessionId)).toBeUndefined();
    expect(sessions.find((s) => s.id === body.sessionId)).toBeDefined();
  });

  it("returns 400 challenge-missing-or-expired when no auth cookie present", async () => {
    const res = await POST(makeRequest({ cookie: null, body: { response: { id: credentialIdBase64 } } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("challenge-missing-or-expired");
  });

  it("returns 400 challenge-missing-or-expired for tampered cookie", async () => {
    const { cookie } = mintAuthCookie();
    const tampered = cookie.slice(0, -1) + (cookie.endsWith("A") ? "B" : "A");
    const res = await POST(makeRequest({ cookie: tampered, body: { response: { id: credentialIdBase64 } } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("challenge-missing-or-expired");
  });

  it("returns 400 verification-failed when no credential row matches (unknown id)", async () => {
    credentials = []; // no credentials at all
    const { cookie } = mintAuthCookie();
    const res = await POST(makeRequest({ cookie, body: { response: { id: "ZZZZ" } } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("verification-failed");
    expect(verifyAuthenticationResponseMock).not.toHaveBeenCalled();
  });

  it("returns 400 verification-failed when WebAuthn verifier returns verified:false", async () => {
    const { cookie } = mintAuthCookie();
    verifyAuthenticationResponseMock.mockResolvedValueOnce({ verified: false } as never);
    const res = await POST(makeRequest({ cookie, body: { response: { id: credentialIdBase64 } } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("verification-failed");
    expect(credentials[0]!.counter).toBe(0); // row counter unchanged
    expect(credentialLastUsedAt).toBeNull(); // last_used_at never set
    expect(sessions.length).toBe(0); // no session created
  });

  it("returns 400 verification-failed when WebAuthn verifier throws", async () => {
    const { cookie } = mintAuthCookie();
    verifyAuthenticationResponseMock.mockRejectedValueOnce(new Error("bad attestation"));
    const res = await POST(makeRequest({ cookie, body: { response: { id: credentialIdBase64 } } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("verification-failed");
  });

  it("returns 400 counter-replay-detected when newCounter <= storedCounter and both non-zero", async () => {
    credentials[0]!.counter = 5;
    const { cookie } = mintAuthCookie();
    verifyAuthenticationResponseMock.mockResolvedValueOnce(goodVerifyResult({ newCounter: 5 }) as never);
    const res = await POST(makeRequest({ cookie, body: { response: { id: credentialIdBase64 } } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("counter-replay-detected");
    expect(credentials[0]!.counter).toBe(5); // row unchanged — UPDATE never ran
    expect(credentialLastUsedAt).toBeNull(); // last_used_at never set
    expect(sessions.length).toBe(0);
  });

  it("Apple platform-authenticator case: accepts newCounter=0 when storedCounter=0", async () => {
    // Both 0 — Apple authenticators never increment. Should NOT be flagged as replay.
    credentials[0]!.counter = 0;
    const { cookie } = mintAuthCookie();
    verifyAuthenticationResponseMock.mockResolvedValueOnce(goodVerifyResult({ newCounter: 0 }) as never);
    const res = await POST(makeRequest({ cookie, body: { response: { id: credentialIdBase64 } } }));
    expect(res.status).toBe(200);
    expect(sessions.length).toBe(1);
  });

  it("returns 403 origin-mismatch when Origin is wrong", async () => {
    const { cookie } = mintAuthCookie();
    const res = await POST(
      makeRequest({ cookie, origin: "https://evil.example", body: { response: { id: credentialIdBase64 } } }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("origin-mismatch");
  });

  it("returns 400 invalid-body when response field is missing", async () => {
    const { cookie } = mintAuthCookie();
    const res = await POST(makeRequest({ cookie, body: {} }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid-body");
  });

  it("returns 400 invalid-body when response.id is missing (not just response)", async () => {
    const { cookie } = mintAuthCookie();
    const res = await POST(makeRequest({ cookie, body: { response: {} } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid-body");
    // Verifier should NOT have been called — Zod rejected at the schema boundary
    expect(verifyAuthenticationResponseMock).not.toHaveBeenCalled();
  });

  it("returns 400 invalid-body when response.id is non-string (e.g., object)", async () => {
    const { cookie } = mintAuthCookie();
    const res = await POST(
      makeRequest({ cookie, body: { response: { id: { not: "a string" } } } }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid-body");
    expect(verifyAuthenticationResponseMock).not.toHaveBeenCalled();
  });

  it("returns 400 invalid-body when response.id is empty string", async () => {
    const { cookie } = mintAuthCookie();
    const res = await POST(makeRequest({ cookie, body: { response: { id: "" } } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid-body");
    expect(verifyAuthenticationResponseMock).not.toHaveBeenCalled();
  });
});

describe("OPTIONS /api/auth/authenticate/finish", () => {
  it("returns 204 same-origin preflight", () => {
    const req = new Request(`${ORIGIN}/api/auth/authenticate/finish`, {
      method: "OPTIONS",
      headers: { origin: ORIGIN },
    });
    const res = OPTIONS(req);
    expect(res.status).toBe(204);
    expect(res.headers.get("allow")).toContain("POST");
  });

  it("returns 403 origin-mismatch on cross-origin preflight", async () => {
    const req = new Request(`${ORIGIN}/api/auth/authenticate/finish`, {
      method: "OPTIONS",
      headers: { origin: "https://evil.example" },
    });
    const res = OPTIONS(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("origin-mismatch");
  });
});

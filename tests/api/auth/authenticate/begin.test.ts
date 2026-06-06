import { beforeEach, describe, expect, it, vi } from "vitest";

const FAKE_SECRET = "z".repeat(48);
const ORIGIN = "https://crypto-bot.kindtree.us";

vi.mock("@/lib/env", () => ({
  env: () => ({ SESSION_SIGNING_SECRET: FAKE_SECRET }),
  origin: () => ORIGIN,
}));

// In-memory mock for the auth_users count + auth_credentials rows.
let userCount = 1; // default: registered user exists (auth flow makes no sense otherwise)
let credentials: { credential_id: Buffer; transports: string[] }[] = [
  { credential_id: Buffer.from("AAAA", "base64url"), transports: ["internal"] },
];

function makeSql() {
  function execute(parts: TemplateStringsArray, ..._args: unknown[]): unknown {
    const query = parts.join("?").trim().toUpperCase();
    if (query.startsWith("SELECT COUNT(*)::INT AS COUNT FROM AUTH_USERS")) {
      return Promise.resolve([{ count: userCount }]);
    }
    if (query.startsWith("SELECT CREDENTIAL_ID, TRANSPORTS FROM AUTH_CREDENTIALS")) {
      return Promise.resolve(credentials);
    }
    throw new Error(`Unhandled mock query in authenticate/begin.test: ${query}`);
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

import { OPTIONS, POST } from "@/app/api/auth/authenticate/begin/route";
import { __resetRateLimits } from "@/lib/auth/rate-limit";

beforeEach(() => {
  userCount = 1;
  credentials = [{ credential_id: Buffer.from("AAAA", "base64url"), transports: ["internal"] }];
  sqlClient = makeSql();
  __resetRateLimits();
});

function makeRequest(opts: { body?: unknown; origin?: string | null } = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN;
  return new Request(`${ORIGIN}/api/auth/authenticate/begin`, {
    method: "POST",
    headers,
    body: JSON.stringify(opts.body ?? {}),
  });
}

describe("POST /api/auth/authenticate/begin", () => {
  it("happy path: 200 with options + allowCredentials populated + Set-Cookie", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.options).toBeDefined();
    expect(body.options.rpId).toBe("crypto-bot.kindtree.us");
    expect(body.options.challenge).toBeDefined();
    expect(body.options.allowCredentials).toBeDefined();
    expect(body.options.allowCredentials.length).toBe(1);

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("__compass_auth_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Path=/api/auth/authenticate/finish");
    expect(setCookie).toContain("Max-Age=60");
  });

  it("happy path: cookie carries a consumable challenge token (canonical helper produces valid wrapper)", async () => {
    const res = await POST(makeRequest());
    const setCookie = res.headers.get("set-cookie") ?? "";
    const tokenValue = /__compass_auth_session=([^;]+)/.exec(setCookie)?.[1];
    expect(tokenValue).toBeTruthy();
    // consumeChallenge accepts the cookie as a valid authentication-purpose token.
    // (Exact challenge-byte equality with options.challenge is covered by the
    // E2E test in AC 8 — SimpleWebAuthn may re-encode the challenge string,
    // so asserting binary equality at the unit-test layer is brittle.)
    const { consumeChallenge } = await import("@/lib/auth/challenges");
    const consumed = consumeChallenge(tokenValue!, "authentication");
    expect(consumed).toBeTruthy();
    expect(typeof consumed!.challenge).toBe("string");
    expect(consumed!.challenge.length).toBeGreaterThan(0);
  });

  it("returns 400 no-registered-user when auth_users is empty", async () => {
    userCount = 0;
    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("no-registered-user");
  });

  it("returns 400 invalid-body when extra fields are present (strict schema)", async () => {
    const res = await POST(makeRequest({ body: { unexpected: "field" } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid-body");
  });

  it("returns 403 origin-mismatch when Origin is wrong", async () => {
    const res = await POST(makeRequest({ origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("origin-mismatch");
  });

  it("returns 429 rate-limited after 5 calls from same Origin", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
    }
    const res = await POST(makeRequest());
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("rate-limited");
    expect(typeof body.retryAfterSeconds).toBe("number");
  });

  it("populates allowCredentials with multiple credentials when N > 1 (future-proof for multi-device)", async () => {
    credentials = [
      { credential_id: Buffer.from("AAAA", "base64url"), transports: ["internal"] },
      { credential_id: Buffer.from("BBBB", "base64url"), transports: ["usb", "nfc"] },
    ];
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.options.allowCredentials.length).toBe(2);
    expect(body.options.allowCredentials[0].transports).toEqual(["internal"]);
    expect(body.options.allowCredentials[1].transports).toEqual(["usb", "nfc"]);
  });
});

describe("OPTIONS /api/auth/authenticate/begin", () => {
  it("returns 204 same-origin preflight", () => {
    const req = new Request(`${ORIGIN}/api/auth/authenticate/begin`, {
      method: "OPTIONS",
      headers: { origin: ORIGIN },
    });
    const res = OPTIONS(req);
    expect(res.status).toBe(204);
    expect(res.headers.get("allow")).toContain("POST");
  });

  it("returns 403 origin-mismatch on cross-origin preflight", async () => {
    const req = new Request(`${ORIGIN}/api/auth/authenticate/begin`, {
      method: "OPTIONS",
      headers: { origin: "https://evil.example" },
    });
    const res = OPTIONS(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("origin-mismatch");
  });
});

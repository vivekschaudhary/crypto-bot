import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import { expect, test } from "@playwright/test";
import { ulid } from "ulidx";
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS, clearSessionCookie, signValue } from "@/lib/auth/cookie";

function loadEnvValue(key: string): string | undefined {
  if (process.env[key]) return process.env[key];

  for (const filename of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), filename);
    if (!existsSync(path)) continue;

    const line = readFileSync(path, "utf8")
      .split(/\r?\n/)
      .find((entry) => entry.startsWith(`${key}=`));

    if (!line) continue;

    const rawValue = line.slice(key.length + 1).trim();
    if (!rawValue) continue;

    if (
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
    ) {
      return rawValue.slice(1, -1);
    }

    return rawValue;
  }

  return undefined;
}

const DATABASE_URL = loadEnvValue("DATABASE_URL");
const SESSION_SIGNING_SECRET = loadEnvValue("SESSION_SIGNING_SECRET");

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required for e2e/auth/sign-out.spec.ts");
}

if (!SESSION_SIGNING_SECRET) {
  throw new Error("SESSION_SIGNING_SECRET is required for e2e/auth/sign-out.spec.ts");
}

const REQUIRED_SESSION_SIGNING_SECRET = SESSION_SIGNING_SECRET;

const sql = postgres(DATABASE_URL, {
  prepare: false,
  idle_timeout: 20,
  max: 1,
});

async function resetAuthTables(): Promise<void> {
  await sql`TRUNCATE auth_sessions, auth_credentials, auth_users RESTART IDENTITY CASCADE`;
}

async function authRowCounts(): Promise<{ users: number; credentials: number; sessions: number }> {
  const [users] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM auth_users`;
  const [credentials] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM auth_credentials`;
  const [sessions] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM auth_sessions`;

  return {
    users: users?.count ?? 0,
    credentials: credentials?.count ?? 0,
    sessions: sessions?.count ?? 0,
  };
}

async function seedAuthenticatedSession(): Promise<{ signedCookie: string; sessionId: string; userId: string }> {
  const userId = ulid();
  const sessionId = ulid();

  await sql`
    INSERT INTO auth_users (id, display_name)
    VALUES (${userId}, ${"Playwright Sign-out User"})
  `;

  await sql`
    INSERT INTO auth_credentials (id, user_id, credential_id, public_key, counter, device_label)
    VALUES (
      ${ulid()},
      ${userId},
      ${Buffer.from("pw-sign-out-credential")},
      ${Buffer.from("pw-sign-out-public-key")},
      0,
      ${"Playwright sign-out seeded credential"}
    )
  `;

  await sql`
    INSERT INTO auth_sessions (id, user_id, expires_at)
    VALUES (${sessionId}, ${userId}, now() + interval '30 days')
  `;

  return {
    signedCookie: signValue(sessionId, REQUIRED_SESSION_SIGNING_SECRET, SESSION_TTL_SECONDS),
    sessionId,
    userId,
  };
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async () => {
  await resetAuthTables();
});

test.afterEach(async () => {
  await resetAuthTables();
});

test.afterAll(async () => {
  await sql.end({ timeout: 5 });
});

test("CB-1.5 AC 8: sign-out clears the cookie, deletes the session row, and proxy rejects the same cookie afterward", async ({
  context,
  page,
  baseURL,
}) => {
  if (!baseURL) {
    throw new Error("baseURL is required for e2e/auth/sign-out.spec.ts");
  }

  await page.goto("/");

  const origin = new URL(baseURL).origin;
  const { signedCookie } = await seedAuthenticatedSession();
  const cookieHeader = `${SESSION_COOKIE_NAME}=${signedCookie}`;

  await expect.poll(authRowCounts).toEqual({
    users: 1,
    credentials: 1,
    sessions: 1,
  });

  const firstSignOut = await context.request.post("/api/auth/sign-out", {
    headers: {
      cookie: cookieHeader,
      origin,
    },
  });

  expect(firstSignOut.status()).toBe(200);
  expect(await firstSignOut.json()).toEqual({ ok: true });
  expect(firstSignOut.headers()["set-cookie"]).toBe(clearSessionCookie());

  await expect.poll(authRowCounts).toEqual({
    users: 1,
    credentials: 1,
    sessions: 0,
  });

  const dashboardAfterSignOut = await context.request.get("/dashboard", {
    headers: {
      cookie: cookieHeader,
    },
    maxRedirects: 0,
  });

  expect(dashboardAfterSignOut.status()).toBe(302);
  expect(dashboardAfterSignOut.headers()["location"]).toBe("/?next=%2Fdashboard");

  const secondSignOut = await context.request.post("/api/auth/sign-out", {
    headers: {
      cookie: cookieHeader,
      origin,
    },
  });

  expect(secondSignOut.status()).toBe(401);
  expect(await secondSignOut.json()).toEqual({ error: "unauthenticated" });
});

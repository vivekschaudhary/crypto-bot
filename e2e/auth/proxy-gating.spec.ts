import { expect, test } from "@playwright/test";
import { ulid } from "ulidx";
import { signValue } from "@/lib/auth/cookie";

import { getTestSql, loadEnvValue } from "../test-db";

const SESSION_SIGNING_SECRET = loadEnvValue("SESSION_SIGNING_SECRET");
const SESSION_COOKIE_NAME = "__compass_session";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

if (!SESSION_SIGNING_SECRET) {
  throw new Error("SESSION_SIGNING_SECRET is required for e2e/auth/proxy-gating.spec.ts");
}

const REQUIRED_SESSION_SIGNING_SECRET = SESSION_SIGNING_SECRET;

// Fail-closed against prod: getTestSql() uses TEST_DATABASE_URL and throws if
// it is unset or equals DATABASE_URL (see e2e/test-db.ts; 2026-06-15 incident).
const sql = getTestSql();

test.describe.configure({ mode: "serial" });

async function resetAuthTables(): Promise<void> {
  await sql`TRUNCATE auth_sessions, auth_credentials, auth_users RESTART IDENTITY CASCADE`;
}

async function seedAuthenticatedSession(): Promise<{ sessionId: string; signedCookie: string; userId: string }> {
  const userId = ulid();
  const sessionId = ulid();

  await sql`
    INSERT INTO auth_users (id, display_name)
    VALUES (${userId}, ${"Playwright Proxy User"})
  `;

  await sql`
    INSERT INTO auth_credentials (id, user_id, credential_id, public_key, counter, device_label)
    VALUES (
      ${ulid()},
      ${userId},
      ${Buffer.from("pw-proxy-credential")},
      ${Buffer.from("pw-proxy-public-key")},
      0,
      ${"Playwright seeded credential"}
    )
  `;

  await sql`
    INSERT INTO auth_sessions (id, user_id, expires_at)
    VALUES (${sessionId}, ${userId}, now() + interval '30 days')
  `;

  return {
    sessionId,
    signedCookie: signValue(sessionId, REQUIRED_SESSION_SIGNING_SECRET, SESSION_TTL_SECONDS),
    userId,
  };
}

test.beforeEach(async () => {
  await resetAuthTables();
});

test.afterEach(async () => {
  await resetAuthTables();
});

test.afterAll(async () => {
  await sql.end({ timeout: 5 });
});

test("CB-1.4 AC 8: proxy gating redirects unauthenticated dashboard, rejects unauthenticated API, and allows authenticated dashboard without leaking session headers", async ({
  context,
  page,
  baseURL,
}) => {
  await page.goto("/");

  const unauthenticatedDashboard = await context.request.get("/dashboard", {
    maxRedirects: 0,
  });

  expect(unauthenticatedDashboard.status()).toBe(302);
  expect(unauthenticatedDashboard.headers()["location"]).toBe("/?next=%2Fdashboard");

  const unauthenticatedApi = await context.request.get("/api/coinbase/_canary", {
    maxRedirects: 0,
  });

  expect(unauthenticatedApi.status()).toBe(401);
  expect(await unauthenticatedApi.json()).toEqual({ error: "unauthenticated" });
  expect(unauthenticatedApi.headers()["x-session-user-id"]).toBeUndefined();

  const { signedCookie } = await seedAuthenticatedSession();
  if (!baseURL) {
    throw new Error("baseURL is required for e2e/auth/proxy-gating.spec.ts");
  }

  await context.addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: signedCookie,
      url: baseURL,
      httpOnly: true,
      sameSite: "Strict",
      secure: baseURL.startsWith("https://"),
    },
  ]);

  const authenticatedDashboard = await context.request.get("/dashboard", {
    maxRedirects: 0,
  });

  expect(authenticatedDashboard.status()).toBe(200);
  expect(await authenticatedDashboard.text()).toContain("<h1>Dashboard</h1>");
  expect(authenticatedDashboard.headers()["x-session-user-id"]).toBeUndefined();
  expect(authenticatedDashboard.headers()["x-session-id"]).toBeUndefined();
});

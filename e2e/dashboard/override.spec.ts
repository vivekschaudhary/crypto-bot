// CB-5.3 AC 11 — safe override controls e2e (default project; LIVE_MODE=false).
//
// Auth → seed one active bot session + dry_run orders → drive Pause / Resume /
// Reset through the real /dashboard controls → assert both UI state changes and
// the backing DB side-effects (override_events, ended old session, new active
// session, historical orders preserved). Deterministic + zero Coinbase
// dependency: no strategy is seeded, so holdings resolves to the empty state.

import { expect, test } from "@playwright/test";
import { ulid } from "ulidx";

import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS, signValue } from "@/lib/auth/cookie";

import { getSql, loadEnvValue, resetAllTables } from "../helpers";

const sql = getSql();
const SESSION_SIGNING_SECRET = loadEnvValue("SESSION_SIGNING_SECRET");

if (!SESSION_SIGNING_SECRET) {
  throw new Error("SESSION_SIGNING_SECRET is required for e2e/dashboard/override.spec.ts");
}
const REQUIRED_SESSION_SIGNING_SECRET = SESSION_SIGNING_SECRET;

async function seedAuthenticatedSession(): Promise<{ signedCookie: string }> {
  const userId = ulid();
  const sessionId = ulid();

  await sql`
    INSERT INTO auth_users (id, display_name)
    VALUES (${userId}, ${"Playwright Override User"})
  `;

  await sql`
    INSERT INTO auth_credentials (id, user_id, credential_id, public_key, counter, device_label)
    VALUES (
      ${ulid()},
      ${userId},
      ${Buffer.from("pw-override-credential")},
      ${Buffer.from("pw-override-public-key")},
      0,
      ${"Playwright override seeded credential"}
    )
  `;

  await sql`
    INSERT INTO auth_sessions (id, user_id, expires_at)
    VALUES (${sessionId}, ${userId}, now() + interval '30 days')
  `;

  return {
    signedCookie: signValue(sessionId, REQUIRED_SESSION_SIGNING_SECRET, SESSION_TTL_SECONDS),
  };
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async () => {
  await resetAllTables(sql);
  await sql`TRUNCATE bot_ticks, signals, orders, override_events RESTART IDENTITY CASCADE`;
});

test.afterAll(async () => {
  await sql.end({ timeout: 5 });
});

test("override controls pause, resume, and reset the current session", async ({ context, page, baseURL }) => {
  if (!baseURL) {
    throw new Error("baseURL is required for e2e/dashboard/override.spec.ts");
  }

  const { signedCookie } = await seedAuthenticatedSession();
  await context.addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: signedCookie,
      url: baseURL,
      httpOnly: true,
      sameSite: "Strict",
      secure: true,
    },
  ]);

  await sql`
    INSERT INTO bot_sessions (id, status, started_at)
    VALUES ('sess-old', 'active', '2026-06-12 21:45:00+00')
  `;
  await sql`
    INSERT INTO orders (id, asset_identifier, session_id, source, side, amount, status)
    VALUES
      ('ord-1', 'BTC-USD', 'sess-old', 'bot', 'buy', 50, 'dry_run'),
      ('ord-2', 'ETH-USD', 'sess-old', 'bot', 'buy', 25, 'dry_run')
  `;

  await page.goto("/dashboard");
  await expect(page.getByTestId("live-mode-banner")).toBeVisible();
  await expect(page.getByText("● Active")).toBeVisible();
  await expect(page.getByText("2 bot buys · $75.00 invested (paper)")).toBeVisible();
  await expect(page.getByText("Pause takes effect on the next 15-minute tick.")).toBeVisible();

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByText("⏸ Paused")).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  const pausedEvents = await sql<{ kind: string; session_id: string }[]>`
    SELECT kind, session_id
      FROM override_events
     ORDER BY created_at ASC
  `;
  expect(pausedEvents).toEqual([{ kind: "pause", session_id: "sess-old" }]);

  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByText("● Active")).toBeVisible();
  const resumedEvents = await sql<{ kind: string; session_id: string }[]>`
    SELECT kind, session_id
      FROM override_events
     ORDER BY created_at ASC
  `;
  expect(resumedEvents).toEqual([
    { kind: "pause", session_id: "sess-old" },
    { kind: "resume", session_id: "sess-old" },
  ]);

  await page.getByRole("button", { name: "Reset session" }).click();
  await expect(
    page.getByText("Reset session? This starts a fresh session. Your transaction history is kept."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset" }).click();

  await expect(page.getByText("● Active")).toBeVisible();
  await expect(page.getByText("No bot orders this session yet.")).toBeVisible();

  const sessions = await sql<
    { id: string; status: string; active: boolean; ended_at: Date | null }[]
  >`
    SELECT id, status, (ended_at IS NULL) AS active, ended_at
      FROM bot_sessions
     ORDER BY started_at ASC
  `;
  expect(sessions).toHaveLength(2);
  expect(sessions[0]?.id).toBe("sess-old");
  expect(sessions[0]?.status).toBe("reset");
  expect(sessions[0]?.active).toBe(false);
  expect(sessions[0]?.ended_at).not.toBeNull();
  expect(sessions[1]?.id).not.toBe("sess-old");
  expect(sessions[1]?.status).toBe("active");
  expect(sessions[1]?.active).toBe(true);

  const resetEvents = await sql<{ kind: string; session_id: string }[]>`
    SELECT kind, session_id
      FROM override_events
     ORDER BY created_at ASC
  `;
  expect(resetEvents).toEqual([
    { kind: "pause", session_id: "sess-old" },
    { kind: "resume", session_id: "sess-old" },
    { kind: "reset", session_id: "sess-old" },
  ]);

  const orderCount = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
      FROM orders
  `;
  expect(orderCount[0]?.count).toBe(2);
});

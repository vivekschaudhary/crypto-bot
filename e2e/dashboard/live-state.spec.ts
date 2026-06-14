// CB-5.0 AC 8 — live-state view e2e (default project; LIVE_MODE=false).
//
// Asserts the DRY RUN banner + session status + session activity + the
// holdings empty-state, all from seeded DB data. DETERMINISTIC + zero
// real-Coinbase dependency: we seed a session + dry_run orders but NO
// strategy, so holdings resolves to the empty state without any Coinbase
// call (holdings-WITH-positions composition is covered deterministically
// by the unit test tests/lib/dashboard/live-state.test.ts with mocked
// Coinbase — Playwright can't mock the SERVER's outbound Coinbase calls,
// so coverage is split: unit = holdings logic, e2e = render + deterministic
// panels + the env-driven banner).
//
// The LIVE banner state is asserted by the sibling live-state.live.spec.ts
// on the LIVE_MODE=true server (AC 8 requires BOTH states via Playwright).

import { expect, test } from "@playwright/test";

import {
  addVirtualAuthenticator,
  completeSetupJourney,
  getSql,
  resetAllTables,
} from "../helpers";

const sql = getSql();

test.describe.configure({ mode: "serial" });

test.beforeEach(async () => {
  await resetAllTables(sql);
});

test.afterAll(async () => {
  await sql.end({ timeout: 5 });
});

test("dashboard live-state renders DRY banner + status + activity + empty holdings", async ({ page }) => {
  const auth = await addVirtualAuthenticator(page);
  try {
    await completeSetupJourney(page); // operator + session cookie; lands on /dashboard

    // Seed a bot session + 3 dry_run bot buys (no strategy → holdings empty,
    // no Coinbase call). Activity = 3 buys, $150.
    await sql`
      INSERT INTO bot_sessions (id, status, started_at)
      VALUES ('e2e-session', 'active', '2026-06-12 21:45:00+00')
    `;
    await sql`
      INSERT INTO orders (id, asset_identifier, session_id, source, side, amount, status)
      VALUES
        ('e2e-o1', 'BTC-USD', 'e2e-session', 'bot', 'buy', 50, 'dry_run'),
        ('e2e-o2', 'BTC-USD', 'e2e-session', 'bot', 'buy', 50, 'dry_run'),
        ('e2e-o3', 'BTC-USD', 'e2e-session', 'bot', 'buy', 50, 'dry_run')
    `;

    await page.goto("/dashboard");

    // LIVE_MODE banner — DRY state.
    const banner = page.getByTestId("live-mode-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute("data-live-mode", "false");
    await expect(banner).toContainText("DRY RUN");

    // Session status + start.
    await expect(page.getByText("● Active")).toBeVisible();
    await expect(page.getByText("2026-06-12 21:45 UTC")).toBeVisible();

    // Session activity (dry_run INCLUDED — paper) + holdings empty state.
    await expect(page.getByText("3 bot buys · $150.00 invested (paper)")).toBeVisible();
    await expect(page.getByText("No positions yet.")).toBeVisible();
  } finally {
    await auth.remove();
  }
});

test("dashboard with no session renders the no-active-session state", async ({ page }) => {
  const auth = await addVirtualAuthenticator(page);
  try {
    await completeSetupJourney(page); // no bot_sessions row seeded
    await page.goto("/dashboard");
    await expect(page.getByText("No active session. Save a strategy to start the bot.")).toBeVisible();
    // Banner is always present, even with no session.
    await expect(page.getByTestId("live-mode-banner")).toBeVisible();
  } finally {
    await auth.remove();
  }
});

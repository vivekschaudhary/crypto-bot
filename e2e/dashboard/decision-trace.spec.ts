// CB-5.1 AC 9 — decision-trace view e2e (default project; LIVE_MODE=false).
//
// Seeds bot_sessions + bot_ticks + signals (incl. one error tick + one
// insufficient-signal row), auths, loads /dashboard/trace, and asserts a
// tick's reason + per-asset signal rows render, the error tick shows its
// detail, and the nav link works. Deterministic + zero Coinbase dependency
// (the decision-trace reads only bot_ticks/signals, no Coinbase calls).
// Reuses e2e/helpers.ts.

import { expect, test } from "@playwright/test";

import { addVirtualAuthenticator, completeSetupJourney, getSql, resetAllTables } from "../helpers";

const sql = getSql();

test.describe.configure({ mode: "serial" });

test.beforeEach(async () => {
  await resetAllTables(sql);
  // resetAllTables truncates auth/strategies/bot_sessions cascade; ensure
  // ticks/signals are clear too (FK: signals.tick_id → bot_ticks.id;
  // bot_ticks.session_id → bot_sessions.id, cleared by the cascade).
  await sql`TRUNCATE bot_ticks, signals RESTART IDENTITY CASCADE`;
});

test.afterAll(async () => {
  await sql.end({ timeout: 5 });
});

async function seedTrace(): Promise<void> {
  await sql`INSERT INTO bot_sessions (id, status, started_at) VALUES ('e2e-s', 'active', now())`;
  // A normal tick (buy) + an error tick.
  await sql`
    INSERT INTO bot_ticks (id, session_id, tick_started_at, decision, reason, error_detail)
    VALUES
      ('tk-ok',  'e2e-s', '2026-06-14 17:00:00+00', 'buy',  'BTC-USD: buy', NULL),
      ('tk-err', 'e2e-s', '2026-06-14 16:45:00+00', 'hold', 'tick_error',   'coinbase 502 (sanitized)')
  `;
  // Signals for the ok tick: one real buy, one insufficient-signal hold.
  await sql`
    INSERT INTO signals (id, tick_id, asset_identifier, decision, reason, rsi, ma, ma_period, last_close)
    VALUES
      ('sg-1', 'tk-ok', 'BTC-USD', 'buy',  'buy: rsi=27.30 < entry_threshold=30; buy $50 BTC-USD', 27.30, 42010.00, 20, 41900.00),
      ('sg-2', 'tk-ok', 'ETH-USD', 'hold', 'hold: insufficient signal data (rsi=null, ma=null); insufficient bars at ETH-USD', NULL, NULL, NULL, NULL)
  `;
}

test("decision-trace renders ticks, reasons, signals, and the error tick", async ({ page }) => {
  const auth = await addVirtualAuthenticator(page);
  try {
    await completeSetupJourney(page);
    await seedTrace();

    // Navigate via the live-state link (AC 5).
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "View decision trace →" }).click();
    await expect(page).toHaveURL(/\/dashboard\/trace$/);

    // Banner + heading.
    await expect(page.getByTestId("live-mode-banner")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Decision trace" })).toBeVisible();

    // The ok tick's reason renders verbatim + the per-asset rows.
    await expect(page.getByText("buy: rsi=27.30 < entry_threshold=30; buy $50 BTC-USD")).toBeVisible();
    await expect(page.getByText(/insufficient signal data/)).toBeVisible();

    // The error tick shows its sanitized detail.
    await expect(page.getByText("coinbase 502 (sanitized)")).toBeVisible();

    // Back link.
    await page.getByRole("link", { name: "← Back to dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  } finally {
    await auth.remove();
  }
});

test("decision-trace empty state when no ticks", async ({ page }) => {
  const auth = await addVirtualAuthenticator(page);
  try {
    await completeSetupJourney(page); // no ticks seeded
    await page.goto("/dashboard/trace");
    await expect(page.getByText("No decisions logged yet.")).toBeVisible();
    await expect(page.getByTestId("live-mode-banner")).toBeVisible();
  } finally {
    await auth.remove();
  }
});

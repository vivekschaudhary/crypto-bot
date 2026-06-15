// CB-5.2 AC 12 — transaction-ledger e2e (default project; LIVE_MODE=false).
//
// Seeds orders (dry_run + submitted) → loads /dashboard/ledger → asserts
// the transactions table + per-execution status render. Deterministic on
// the orders table (pure DB); the PnL panel depends on real Coinbase reads
// so we assert the panel HEADING renders (not specific PnL numbers — those
// are unit-tested deterministically). Seeds NO strategy so the PnL read
// makes no Coinbase call and the panel shows "No open positions" cleanly.

import { expect, test } from "@playwright/test";

import { addVirtualAuthenticator, completeSetupJourney, getSql, resetAllTables } from "../helpers";

const sql = getSql();

test.describe.configure({ mode: "serial" });

test.beforeEach(async () => {
  await resetAllTables(sql);
  await sql`TRUNCATE bot_ticks, signals RESTART IDENTITY CASCADE`;
});

test.afterAll(async () => {
  await sql.end({ timeout: 5 });
});

test("ledger renders transactions with per-execution status; nav from live-state", async ({ page }) => {
  const auth = await addVirtualAuthenticator(page);
  try {
    await completeSetupJourney(page);
    await sql`INSERT INTO bot_sessions (id, status, started_at) VALUES ('e2e-s', 'active', now())`;
    await sql`
      INSERT INTO orders (id, asset_identifier, session_id, source, side, amount, status)
      VALUES
        ('o-dry', 'BTC-USD', 'e2e-s', 'bot', 'buy',  50, 'dry_run'),
        ('o-live','ETH-USD', 'e2e-s', 'bot', 'sell', 48, 'submitted')
    `;

    await page.goto("/dashboard");
    await page.getByRole("link", { name: "View transaction ledger →" }).click();
    await expect(page).toHaveURL(/\/dashboard\/ledger$/);

    await expect(page.getByTestId("live-mode-banner")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Transaction ledger" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Profit / loss" })).toBeVisible();

    // Transactions table + per-execution status (paper/live).
    await expect(page.getByText("dry_run")).toBeVisible();
    await expect(page.getByText("submitted")).toBeVisible();
    await expect(page.getByText("BTC-USD")).toBeVisible();
    await expect(page.getByText("ETH-USD")).toBeVisible();

    // Back nav.
    await page.getByRole("link", { name: "← Back to dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  } finally {
    await auth.remove();
  }
});

test("ledger empty state when no transactions", async ({ page }) => {
  const auth = await addVirtualAuthenticator(page);
  try {
    await completeSetupJourney(page);
    await page.goto("/dashboard/ledger");
    await expect(page.getByText("No transactions yet.")).toBeVisible();
    await expect(page.getByTestId("live-mode-banner")).toBeVisible();
  } finally {
    await auth.remove();
  }
});

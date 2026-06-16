// CB-6.0 AC 10 — cockpit e2e: load → status → Pause→STOPPED → Start→ACTIVE;
// Equity + Mutual Funds tabs show the "coming soon" placeholders.

import { expect, test } from "@playwright/test";

import { addVirtualAuthenticator, completeSetupJourney, getSql, resetAllTables } from "../helpers";

const sql = getSql();

test.describe.configure({ mode: "serial" });

test.beforeEach(async () => {
  await resetAllTables(sql);
});

test.afterAll(async () => {
  await sql.end({ timeout: 5 });
});

test("cockpit loads, status toggles Pause→STOPPED→Start→ACTIVE, and Equity/MF show coming soon", async ({
  page,
}) => {
  const auth = await addVirtualAuthenticator(page);

  try {
    await completeSetupJourney(page);

    await sql`
      INSERT INTO bot_sessions (id, status, started_at)
      VALUES ('sess-cockpit', 'active', '2026-06-16 00:00:00+00')
    `;

    await page.reload();

    await expect(page.getByRole("heading", { name: "Crypto Trading Bot" })).toBeVisible();
    await expect(page.getByRole("link", { name: "📊 Mutual Funds" })).toBeVisible();
    await expect(page.getByRole("link", { name: "📈 Equity" })).toBeVisible();
    await expect(page.getByRole("link", { name: "🤖 Crypto" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await expect(page.getByText("Bot is active — running every 15 minutes.")).toBeVisible();
    await expect(page.getByText("● ACTIVE")).toBeVisible();

    await page.getByRole("button", { name: "Pause" }).click();
    await expect(page.getByText("Bot is stopped — click Start to resume")).toBeVisible();
    await expect(page.getByText("⏸ STOPPED")).toBeVisible();
    await expect(page.getByText("stopped by user")).toBeVisible();

    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.getByText("Bot is active — running every 15 minutes.")).toBeVisible();
    await expect(page.getByText("● ACTIVE")).toBeVisible();

    await page.getByRole("link", { name: "📈 Equity" }).click();
    await expect(page).toHaveURL(/\/dashboard\/equity$/);
    await expect(page.getByText("Equity trading is coming soon.")).toBeVisible();
    await expect(page.getByRole("link", { name: "← Back to Crypto" })).toBeVisible();

    await page.getByRole("link", { name: "📊 Mutual Funds" }).click();
    await expect(page).toHaveURL(/\/dashboard\/mutual-funds$/);
    await expect(page.getByText("Mutual funds are coming soon.")).toBeVisible();
    await expect(page.getByRole("link", { name: "← Back to Crypto" })).toBeVisible();
  } finally {
    await auth.remove();
  }
});

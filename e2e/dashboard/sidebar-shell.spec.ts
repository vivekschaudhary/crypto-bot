import { expect, test } from "@playwright/test";

import { addVirtualAuthenticator, getSql, resetAllTables } from "../helpers";

const sql = getSql();

test.describe.configure({ mode: "serial" });

test.beforeEach(async () => {
  await resetAllTables(sql);
});

test.afterAll(async () => {
  await sql.end({ timeout: 5 });
});

async function onboard(page: Parameters<typeof addVirtualAuthenticator>[0]) {
  const auth = await addVirtualAuthenticator(page);
  await page.goto("/setup");
  await page.getByRole("button", { name: "Register passkey" }).click();
  await expect(page).toHaveURL("/dashboard");
  await expect(page.getByRole("heading", { name: "Crypto Trading Bot" })).toBeVisible();
  return auth;
}

const NAV_ITEMS = [
  { label: "🤖 Crypto", href: "/dashboard", heading: "Crypto Trading Bot" },
  { label: "📈 Equity", href: "/dashboard/equity", text: "Equity trading is coming soon." },
  { label: "📊 Mutual Funds", href: "/dashboard/mutual-funds", text: "Mutual funds are coming soon." },
  { label: "Strategy", href: "/dashboard/strategy", heading: "Create your strategy" },
  { label: "Decision trace", href: "/dashboard/trace", heading: "Decision trace" },
  { label: "Ledger", href: "/dashboard/ledger", heading: "Transaction ledger" },
] as const;

test("CB-8.0 Phase 3: sidebar renders, nav links route, active highlight follows, and footer sign-out works", async ({
  page,
}) => {
  const auth = await onboard(page);

  try {
    const nav = page.getByRole("navigation", { name: "Primary" });
    const sidebar = page.getByRole("complementary");
    await expect(nav).toBeVisible();
    await expect(page.getByText("crypto-bot")).toBeVisible();
    await expect(sidebar.getByText(/^Connected device:/)).toBeVisible();
    await expect(sidebar.getByRole("button", { name: "Sign out" })).toBeVisible();

    for (const item of NAV_ITEMS) {
      await page.getByRole("link", { name: item.label }).click();
      await expect(page).toHaveURL(item.href);
      await expect(page.getByRole("link", { name: item.label })).toHaveAttribute(
        "aria-current",
        "page",
      );
      if ("heading" in item) {
        await expect(page.getByRole("heading", { name: item.heading })).toBeVisible();
      } else {
        await expect(page.getByText(item.text)).toBeVisible();
      }
    }

    await page.setViewportSize({ width: 375, height: 900 });
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      return {
        clientWidth: root.clientWidth,
        scrollWidth: root.scrollWidth,
      };
    });
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

    await sidebar.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("link", { name: "Set up your passkey" })).toBeVisible();
  } finally {
    await auth.remove();
  }
});

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
  { label: "Crypto", href: "/dashboard", heading: "Crypto Trading Bot" },
  { label: "Equity", href: "/dashboard/equity", text: "Equity trading is coming soon." },
  { label: "Mutual Funds", href: "/dashboard/mutual-funds", text: "Mutual funds are coming soon." },
  { label: "Strategy", href: "/dashboard/strategy", heading: "Create your strategy" },
  { label: "Decision trace", href: "/dashboard/trace", heading: "Decision trace" },
  { label: "Ledger", href: "/dashboard/ledger", heading: "Transaction ledger" },
] as const;

test("CB-8.0/8.1 Phase 3: sidebar nav + collapse/expand + mobile behavior", async ({
  page,
}) => {
  const auth = await onboard(page);

  try {
    const nav = page.getByRole("navigation", { name: "Primary" });
    const sidebar = page.getByRole("complementary");
    const toggle = sidebar.getByRole("button", { name: "Collapse sidebar" });

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(nav).toBeVisible();
    await expect(page.getByText("crypto-bot")).toBeVisible();
    await expect(sidebar.getByText(/^Connected device:/)).toBeVisible();
    await expect(sidebar.getByRole("button", { name: "Sign out" })).toBeVisible();
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

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

    await page.goto("/dashboard");
    const expanded = await page.evaluate(() => {
      const sidebarEl = document.querySelector<HTMLElement>(".dashboard-sidebar");
      const contentEl = document.querySelector<HTMLElement>(".dashboard-content");
      if (!sidebarEl || !contentEl) throw new Error("dashboard shell missing");
      return {
        sidebarWidth: Math.round(sidebarEl.getBoundingClientRect().width),
        contentWidth: Math.round(contentEl.getBoundingClientRect().width),
      };
    });

    await toggle.click();
    const collapsedToggle = sidebar.getByRole("button", { name: "Expand sidebar" });
    await expect(collapsedToggle).toBeVisible();
    await expect(collapsedToggle).toHaveAttribute("aria-expanded", "false");
    await expect(sidebar.locator(".sidebar-title")).not.toBeVisible();
    await expect(sidebar.locator(".sidebar-device")).not.toBeVisible();
    await expect(page.locator('html')).toHaveAttribute("data-sidebar-collapsed", "");
    await expect.poll(async () => page.evaluate(() => localStorage.getItem("sidebar-collapsed"))).toBe("1");

    const collapsed = await page.evaluate(() => {
      const sidebarEl = document.querySelector<HTMLElement>(".dashboard-sidebar");
      const contentEl = document.querySelector<HTMLElement>(".dashboard-content");
      const labelEl = document.querySelector<HTMLElement>('a[href="/dashboard/trace"] .nav-label');
      if (!sidebarEl || !contentEl) throw new Error("dashboard shell missing");
      if (!labelEl) throw new Error("collapsed nav label missing");
      const styles = window.getComputedStyle(labelEl);
      return {
        sidebarWidth: Math.round(sidebarEl.getBoundingClientRect().width),
        contentWidth: Math.round(contentEl.getBoundingClientRect().width),
        labelWidth: styles.width,
        labelHeight: styles.height,
        labelPosition: styles.position,
        labelOverflow: styles.overflow,
      };
    });

    expect(collapsed.sidebarWidth).toBeLessThan(expanded.sidebarWidth);
    expect(collapsed.contentWidth).toBeGreaterThan(expanded.contentWidth);
    expect(collapsed.labelWidth).toBe("1px");
    expect(collapsed.labelHeight).toBe("1px");
    expect(collapsed.labelPosition).toBe("absolute");
    expect(collapsed.labelOverflow).toBe("hidden");

    for (const item of NAV_ITEMS) {
      await page.getByRole("link", { name: item.label }).click();
      await expect(page).toHaveURL(item.href);
      await expect(page.getByRole("link", { name: item.label })).toHaveAttribute(
        "aria-current",
        "page",
      );
    }

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("data-sidebar-collapsed", "");
    await expect(page.getByRole("complementary").getByRole("button", { name: "Expand sidebar" })).toBeVisible();
    const reloadedCollapsed = await page.evaluate(() => {
      const sidebarEl = document.querySelector<HTMLElement>(".dashboard-sidebar");
      const titleEl = document.querySelector<HTMLElement>(".sidebar-title");
      if (!sidebarEl || !titleEl) throw new Error("collapsed shell missing");
      return {
        sidebarWidth: Math.round(sidebarEl.getBoundingClientRect().width),
        titleVisible: !!(titleEl.offsetWidth || titleEl.offsetHeight || titleEl.getClientRects().length),
      };
    });
    expect(reloadedCollapsed.sidebarWidth).toBeLessThan(expanded.sidebarWidth);
    expect(reloadedCollapsed.titleVisible).toBe(false);

    await page.getByRole("complementary").getByRole("button", { name: "Expand sidebar" }).click();
    await expect(page.getByRole("complementary").getByRole("button", { name: "Collapse sidebar" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(page.locator("html")).not.toHaveAttribute("data-sidebar-collapsed", "");
    await expect.poll(async () => page.evaluate(() => localStorage.getItem("sidebar-collapsed"))).toBe("0");

    const expandedAgain = await page.evaluate(() => {
      const sidebarEl = document.querySelector<HTMLElement>(".dashboard-sidebar");
      const contentEl = document.querySelector<HTMLElement>(".dashboard-content");
      if (!sidebarEl || !contentEl) throw new Error("expanded shell missing");
      return {
        sidebarWidth: Math.round(sidebarEl.getBoundingClientRect().width),
        contentWidth: Math.round(contentEl.getBoundingClientRect().width),
      };
    });
    expect(expandedAgain.sidebarWidth).toBeGreaterThan(collapsed.sidebarWidth);
    expect(expandedAgain.contentWidth).toBeLessThan(collapsed.contentWidth);

    await page.setViewportSize({ width: 375, height: 900 });
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await expect(page.getByRole("complementary").getByRole("button", { name: "Collapse sidebar" })).toBeHidden();
    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      const sidebarEl = document.querySelector<HTMLElement>(".dashboard-sidebar");
      if (!sidebarEl) throw new Error("mobile sidebar missing");
      return {
        clientWidth: root.clientWidth,
        scrollWidth: root.scrollWidth,
        sidebarWidth: Math.round(sidebarEl.getBoundingClientRect().width),
      };
    });
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    expect(overflow.sidebarWidth).toBeGreaterThan(200);

    await sidebar.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/", { timeout: 10000 });
    await expect(page.getByRole("link", { name: "Set up your passkey" })).toBeVisible();
  } finally {
    await auth.remove();
  }
});

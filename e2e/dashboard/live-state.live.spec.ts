// CB-5.0 AC 8 (LIVE half) — LIVE_MODE=true banner e2e.
//
// Runs on the `chromium-live` project against the :3100 dev server booted
// with LIVE_MODE=true (playwright.config.ts). The CB-5 brief guardrail
// requires Playwright to assert the banner under BOTH LIVE_MODE=false AND
// =true — the false case is the sibling live-state.spec.ts; this is the
// true case. SAFE: the banner is a pure render of env().LIVE_MODE and
// /dashboard is read-only (no order placement), so booting under
// LIVE_MODE=true and asserting the LIVE banner risks nothing.
//
// No seeding needed — the banner is env-driven, independent of session
// state; we just need to reach /dashboard authenticated.

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

test("dashboard renders the LIVE banner when LIVE_MODE=true", async ({ page }) => {
  const auth = await addVirtualAuthenticator(page);
  try {
    await completeSetupJourney(page); // lands on /dashboard (on the :3100 LIVE server)

    const banner = page.getByTestId("live-mode-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute("data-live-mode", "true");
    await expect(banner).toContainText("LIVE — real orders");
  } finally {
    await auth.remove();
  }
});

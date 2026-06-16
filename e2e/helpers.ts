// Shared e2e helpers (CB-5.0). DB access is fail-closed against production —
// it routes through `e2e/test-db.ts` (TEST_DATABASE_URL only; throws if unset
// or equal to prod). See that module for the 2026-06-15 incident rationale.

import { expect, type Page } from "@playwright/test";
import type postgres from "postgres";

import { getTestSql, loadEnvValue } from "./test-db";

// Re-exported so existing specs can keep importing these from "../helpers".
export { loadEnvValue };

/** A postgres.js client bound to the guarded, disposable test database. */
export function getSql(): ReturnType<typeof postgres> {
  return getTestSql();
}

/** Clear all operator data (FK cascade through auth_users). */
export async function resetAllTables(sql: ReturnType<typeof postgres>): Promise<void> {
  await sql`TRUNCATE bot_sessions, strategies, auth_sessions, auth_credentials, auth_users RESTART IDENTITY CASCADE`;
}

export async function addVirtualAuthenticator(page: Page): Promise<{ remove: () => Promise<void> }> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return {
    remove: async () => {
      try {
        await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
      } catch {
        /* best-effort */
      }
    },
  };
}

/** Register a passkey and land authenticated on /dashboard. */
export async function completeSetupJourney(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("link", { name: "Set up your passkey" }).click();
  await expect(page).toHaveURL(/\/setup$/);
  await page.getByRole("button", { name: "Register passkey" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Crypto Trading Bot" })).toBeVisible();
}

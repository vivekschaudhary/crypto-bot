// Shared e2e helpers (CB-5.0). The CB-1.6 onboarding + CB-3.3 strategy
// specs predate this and duplicate these locally; new specs use this
// module (refactoring the old ones to it is a future cleanup, noted).

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, type Page } from "@playwright/test";
import postgres from "postgres";

export function loadEnvValue(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  for (const filename of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), filename);
    if (!existsSync(path)) continue;
    const line = readFileSync(path, "utf8")
      .split(/\r?\n/)
      .find((entry) => entry.startsWith(`${key}=`));
    if (!line) continue;
    const raw = line.slice(key.length + 1).trim();
    if (!raw) continue;
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      return raw.slice(1, -1);
    }
    return raw;
  }
  return undefined;
}

export function getSql(): ReturnType<typeof postgres> {
  const DATABASE_URL = loadEnvValue("DATABASE_URL");
  if (!DATABASE_URL) throw new Error("DATABASE_URL is required for e2e");
  return postgres(DATABASE_URL, { prepare: false, idle_timeout: 20, max: 1 });
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
  await expect(page.getByText("Signed in.")).toBeVisible();
}

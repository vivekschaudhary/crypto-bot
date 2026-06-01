// Playwright config — pre-stubbed by Engineer for CB-1.2 (per story Risk #1
// mitigation: Engineer drafts the harness; Codex fills in the E2E specs).
//
// E2E specs live under `e2e/`. Codex owns AC 8: `e2e/auth/register.spec.ts`
// uses Playwright's virtual-authenticator API to exercise the full passkey
// registration ceremony against the dev server.

import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_SKIP_WEB_SERVER
    ? undefined
    : {
        command: "pnpm dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});

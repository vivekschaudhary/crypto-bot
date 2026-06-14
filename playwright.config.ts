// Playwright config — pre-stubbed by Engineer for CB-1.2 (per story Risk #1
// mitigation: Engineer drafts the harness; Codex fills in the E2E specs).
//
// E2E specs live under `e2e/`. Codex owns AC 8: `e2e/auth/register.spec.ts`
// uses Playwright's virtual-authenticator API to exercise the full passkey
// registration ceremony against the dev server.
//
// CB-5.0: the LIVE_MODE banner is SSR'd from `env().LIVE_MODE` (a server
// process-env value, NOT request-overridable — it's the load-bearing
// safety primitive). To assert BOTH banner states via Playwright (CB-5.0
// AC 8, brief guardrail), we boot TWO dev servers — the default on :3000
// (LIVE_MODE from .env.local = false) and a second on :3100 with
// LIVE_MODE=true — and route `*.live.spec.ts` to the live one. This is the
// only way to exercise the env-driven banner end-to-end in a real browser.

import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const liveBaseURL = process.env.PLAYWRIGHT_LIVE_BASE_URL ?? "http://localhost:3100";
const skipWebServer = !!process.env.PLAYWRIGHT_SKIP_WEB_SERVER;

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
      // Default: LIVE_MODE=false (from .env.local). Runs everything EXCEPT
      // the dedicated live-banner spec.
      name: "chromium",
      use: { ...devices["Desktop Chrome"], baseURL },
      testIgnore: /\.live\.spec\.ts$/,
    },
    {
      // LIVE_MODE=true server (:3100). Runs ONLY *.live.spec.ts — the
      // LIVE-banner assertion (CB-5.0 AC 8).
      name: "chromium-live",
      use: { ...devices["Desktop Chrome"], baseURL: liveBaseURL },
      testMatch: /\.live\.spec\.ts$/,
    },
  ],
  webServer: skipWebServer
    ? undefined
    : [
        {
          command: "pnpm dev",
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
        {
          // Second server with LIVE_MODE=true (overrides .env.local's
          // false; Next.js still loads the rest of .env.local). Different
          // port so both run concurrently against the shared DB.
          command: "pnpm dev --port 3100",
          url: liveBaseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
          env: { LIVE_MODE: "true" },
        },
      ],
});

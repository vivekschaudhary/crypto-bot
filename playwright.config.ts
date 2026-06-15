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

import { requireTestDatabaseUrl } from "./e2e/test-db";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const liveBaseURL = process.env.PLAYWRIGHT_LIVE_BASE_URL ?? "http://localhost:3100";
const skipWebServer = !!process.env.PLAYWRIGHT_SKIP_WEB_SERVER;

// FAIL-CLOSED against production — UNCONDITIONALLY (both modes). The specs
// connect to TEST_DATABASE_URL via e2e/test-db.ts regardless of who starts the
// server, so TEST_DATABASE_URL must always be present. requireTestDatabaseUrl()
// throws if it is unset or equals DATABASE_URL → e2e refuses to run rather than
// letting the specs' TRUNCATEs hit prod (the 2026-06-15 data-loss incident).
const testDatabaseUrl = requireTestDatabaseUrl();

// External-server mode: Playwright does NOT start the server, so it cannot
// control that server's DATABASE_URL. If the already-running server points at
// prod (this repo shares one DATABASE_URL across local/preview/prod — see
// docs/ops/2026-06-06-db-migrate-env-and-build.md), the app-under-test would
// WRITE to prod even though the specs' TRUNCATEs are safely confined to the
// test DB. Playwright can't verify the external server's DB, so external mode
// is fail-closed too: it requires an explicit acknowledgment that the server
// was started against the test DB (DATABASE_URL=$TEST_DATABASE_URL).
if (skipWebServer && process.env.PLAYWRIGHT_EXTERNAL_DB_OK !== "1") {
  throw new Error(
    "[e2e] PLAYWRIGHT_SKIP_WEB_SERVER is set, but Playwright cannot control the " +
      "externally-started server's DATABASE_URL — if it points at production the " +
      "app-under-test will write prod. Start that server with " +
      "DATABASE_URL=$TEST_DATABASE_URL and set PLAYWRIGHT_EXTERNAL_DB_OK=1 to " +
      "confirm. Refusing to run.",
  );
}

// When Playwright boots the webServers, inject the test DB so the
// app-under-test uses it too (this `env` wins over .env.local — Next does not
// override an already-set process.env var). Empty in external mode (the
// operator owns the external server's env, gated by the assert above).
const webServerDbEnv: Record<string, string> = skipWebServer
  ? {}
  : { DATABASE_URL: testDatabaseUrl };

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
          // App-under-test uses the dedicated test DB, never prod (see above).
          env: webServerDbEnv,
        },
        {
          // Second server with LIVE_MODE=true (overrides .env.local's
          // false; Next.js still loads the rest of .env.local). Different
          // port so both run concurrently against the test DB.
          command: "pnpm dev --port 3100",
          url: liveBaseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
          env: { ...webServerDbEnv, LIVE_MODE: "true" },
        },
      ],
});

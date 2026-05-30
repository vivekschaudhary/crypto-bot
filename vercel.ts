// Vercel project config — typed.
// Replaces vercel.json per the platform's current recommendation.
// See: https://vercel.com/docs/project-configuration/vercel-ts
//
// If `@vercel/config` is not yet installed at build time, the build will
// still pick up these fields from a fallback vercel.json. After
// `pnpm install` adds @vercel/config to dependencies, this file is the
// source of truth.

import { type VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  buildCommand: "next build",
  crons: [
    {
      // Bot tick — every 15 minutes. Pro plan required for sub-daily crons.
      // See architecture.md Foundational Identity & Access Posture for the
      // CRON_SECRET-gated route handler.
      path: "/api/cron/tick",
      schedule: "*/15 * * * *",
    },
  ],
};

export default config;

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
  // Auto-apply DB migrations before building. `pnpm db:migrate` is idempotent:
  // the `_migrations` tracking table records applied filenames, so re-runs
  // skip already-applied migrations. Failed migrations abort the build,
  // preventing app deploys against a stale schema.
  //
  // Rollback: if a bad migration ships, revert this `buildCommand` line to
  // `"next build"` and redeploy. The failed migration may need a corrective
  // follow-up migration; revert + fix-forward is the documented pattern (no
  // down migrations at this scale).
  buildCommand: "pnpm db:migrate && next build",
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

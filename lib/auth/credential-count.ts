// Cached read of `count(*) FROM auth_credentials`.
//
// Closes M1 from the 2026-06-04 codebase security audit
// (docs/retros/2026-06-04-codebase-security-audit.md).
//
// The three pre-auth Server Component surfaces — `/` (landing), `/setup`,
// `/sign-in` — each need to know whether the instance has any registered
// credentials in order to render the right state (zero → setup CTA;
// non-zero → sign-in CTA; on `/sign-in`/`/setup` the count gates which
// page the user belongs on). Pre-fix, each surface issued an uncached
// `SELECT count(*)` on every render. The postgres.js pool caps at 10
// connections; an attacker burst-flooding any of the three public URLs
// could pin the pool and starve the `*/15` bot tick — directly attacking
// the architecture's `Bot tick reliability ≥ 99%` fitness function.
//
// At n=1 single-operator, the count is bounded {0, 1}. It transitions
// 0 → 1 exactly ONCE in the instance's lifetime (during first-deploy
// passkey registration) and never changes again until a runbook-driven
// manual DB intervention. So a long-TTL cache is structurally safe:
// the cache value can only go wrong in one direction (cached "0" while
// DB has "1") and only briefly during the setup window.
//
// The single invalidation hook lives in
// `app/api/auth/register/finish/route.ts`, which calls
// `updateTag(CREDENTIAL_COUNT_TAG)` after a successful registration.
// That's the only on-spec write path that mutates the count; any other
// (manual DB intervention via the runbook) requires a deploy or a
// process restart anyway.

import { unstable_cache } from "next/cache";

import { db } from "@/lib/db/client";

export const CREDENTIAL_COUNT_TAG = "auth-credentials";

// Long TTL (1 hour) — the cache is invalidated explicitly on registration.
// The TTL is the upper bound on cache staleness in the unlikely event the
// invalidate-tag call fails (e.g., a deploy-vs-fluid-compute race).
const CACHE_TTL_SECONDS = 60 * 60;

async function fetchCredentialCount(): Promise<number> {
  const sql = db();
  const rows = await sql<Array<{ count: number | string }>>`
    SELECT count(*)::int AS count FROM auth_credentials
  `;
  return Number(rows[0]?.count ?? 0);
}

/**
 * Cached `count(*) FROM auth_credentials`. Safe to call from any pre-auth
 * Server Component without rate-limit concerns — backed by Next.js's
 * unstable_cache with tag-based invalidation.
 *
 * Invalidated by `revalidateTag(CREDENTIAL_COUNT_TAG)` from
 * `/api/auth/register/finish` on successful registration.
 */
export const getCredentialCount = unstable_cache(
  fetchCredentialCount,
  ["auth-credentials-count"],
  { tags: [CREDENTIAL_COUNT_TAG], revalidate: CACHE_TTL_SECONDS },
);

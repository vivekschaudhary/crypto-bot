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
// **Invalidation surface — load-bearing.**
//
// The on-spec write path: `app/api/auth/register/finish/route.ts` calls
// `revalidateTag(CREDENTIAL_COUNT_TAG, "default")` after a successful
// registration. That covers the normal `0 → 1` transition.
//
// The OFF-spec write path: the runbook's absolute-last-resort recovery
// procedure (docs/ops/runbook.md § "Lost all passkeys AND lost the
// backup code") wipes `auth_credentials` directly in Supabase, OUTSIDE
// any Next.js code path. Nothing in the deployed code can call
// `revalidateTag` in response to that wipe. If the TTL were long, the
// operator's next visit to `/` would still see cached `count >= 1`,
// route them to `/sign-in`, find no credentials, redirect to `/setup`,
// find a cached "already set up" gate, redirect to `/sign-in` — soft
// lockout until TTL elapses.
//
// Mitigation: short TTL (60 seconds). That defeats the DoS attack on
// the postgres.js pool just as effectively as a longer TTL at the
// realistic public-page request rate, and bounds the runbook-recovery
// stuck window to ~1 minute. Per the audit context, the count is
// bounded `{0, 1}` at n=1, so the per-minute DB read is structurally
// trivial.

import { unstable_cache } from "next/cache";

import { db } from "@/lib/db/client";

export const CREDENTIAL_COUNT_TAG = "auth-credentials";

// 60-second TTL — see Invalidation surface above. Short enough that
// runbook-driven manual DB recovery clears in ~1 min; long enough that
// the public unauth surface doesn't issue DB reads under sustained
// traffic.
const CACHE_TTL_SECONDS = 60;

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

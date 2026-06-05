// `?next=<value>` allowlist — single source of truth for both emit (proxy.ts)
// and consume (app/sign-in/page.tsx) sides.
//
// History:
//   - CB-1.4 PR #10 (security-review HIGH closure): proxy.ts established the
//     emit-side allowlist with a 4-rule check inline.
//   - CB-1.6 (PR #17): the consumer at /sign-in needed the same rules. The
//     story DRI #3 explicitly deferred consolidation as post-CB-1 work; in
//     the meantime, lib/auth/safe-next.ts shipped with a SLIGHTLY-LOOSER copy
//     (`startsWith("//")` instead of `includes("//")`). The inline comment
//     in this file claimed the rules were "mirrored character-for-character"
//     — that claim was false. The codebase security audit on 2026-06-04
//     surfaced the drift.
//   - This file's current revision (post-audit fix, M2 closure): now the
//     single source of truth. proxy.ts imports `isSafeNextPath` from here.
//     The stricter `includes("//")` rule is the canonical one — it covers
//     BOTH protocol-relative leading `//` AND mid-path `//` that the URL
//     constructor can produce when normalizing `/dashboard/\evil` →
//     `/dashboard//evil`.
//
// Rules:
//   1. must be a non-empty string
//   2. must start with `/`
//   3. must NOT contain `//` anywhere (covers protocol-relative + URL-
//      constructor backslash-normalization)
//   4. must NOT contain `\` (defense-in-depth in case URL normalization
//      differs across runtimes)
//   5. must NOT contain `:` in the first path segment (catches
//      `javascript:`, `data:`, `file:`, `mailto:`, etc.)
//
// Behavior on rejection: caller MUST silently drop the candidate (no error
// UI or response shown to the user) per CB-1.6 copy.md § Cross-surface
// strings.

/**
 * Validate a candidate `?next=<value>` against the allowlist. Returns
 * `true` if the value is safe to use as a same-origin path; `false`
 * otherwise. Used by proxy.ts at emit-side and app/sign-in/page.tsx at
 * consume-side.
 *
 * Callers SHOULD silently drop on `false` — do not render the rejection.
 */
export function isSafeNextPath(candidate: unknown): candidate is string {
  if (typeof candidate !== "string" || candidate.length === 0) return false;
  if (!candidate.startsWith("/")) return false;
  if (candidate.includes("//")) return false;
  if (candidate.includes("\\")) return false;
  // Reject anything with `:` in the first path segment — catches protocol-
  // like prefixes (`javascript:`, `data:`, etc.). The first segment ends at
  // the first `/` after position 0.
  const firstColon = candidate.indexOf(":");
  if (firstColon !== -1) {
    const firstSlash = candidate.indexOf("/", 1);
    if (firstSlash === -1 || firstColon < firstSlash) return false;
  }
  return true;
}

/**
 * Convenience wrapper: returns the candidate if safe, otherwise `null`.
 * Use in Server Components that pass a validated `next` to client props.
 */
export function safeNextOrNull(candidate: unknown): string | null {
  return isSafeNextPath(candidate) ? candidate : null;
}

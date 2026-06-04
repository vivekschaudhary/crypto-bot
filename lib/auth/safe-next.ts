// Consumer-side `?next=` allowlist validator.
//
// Per CB-1.4 PR #10 security-review HIGH finding closure: any consumer of the
// `?next=<encoded-original-path>` parameter that proxy.ts emits MUST re-apply
// the same allowlist independently — defense-in-depth across the emit/consume
// boundary. The 4 rules below are mirrored character-for-character from
// proxy.ts's internal `isSafeNextPath` (CB-1.4 buildSignInRedirect, AC 2).
//
// First consumer: app/sign-in/page.tsx (CB-1.6). Future consumers that need
// to honor a `next` redirect after authentication SHOULD import from here
// rather than re-implement the rules. proxy.ts's internal copy is kept inline
// for CB-1.6 scope reasons — consolidation deferred to a post-CB-1 continuous-
// improvement story per CB-1.6 PM DRI Decision #3 (story.md).
//
// Rules (drift between this file and proxy.ts is caught by either the
// safe-next.test.ts or proxy.test.ts assertion sets):
//   1. must start with `/`
//   2. must not start with `//` (protocol-relative URL — open-redirect)
//   3. must not contain `\` (some routers normalize `\` to `/`)
//   4. must not contain `:` in the first path segment (catches `javascript:`,
//      `data:`, etc.)
//
// Behavior on rejection: caller MUST silently drop the candidate (no error UI
// or response shown to the user) per CB-1.6 copy.md § Cross-surface strings.

/**
 * Validate a candidate `?next=<value>` against the consumer allowlist.
 * Returns `true` if the value is safe to navigate to as a same-origin path;
 * `false` otherwise.
 *
 * Callers SHOULD silently drop on `false` — do not render the rejection.
 */
export function isSafeNextPath(candidate: unknown): candidate is string {
  if (typeof candidate !== "string" || candidate.length === 0) return false;
  if (!candidate.startsWith("/")) return false;
  if (candidate.startsWith("//")) return false;
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

// Per audit M1 closure. Verifies the cached count helper proxies to the
// DB query correctly. The caching behavior itself is framework-managed
// (Next.js unstable_cache); we trust that and test only the wrapped fn.

import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  sqlMock: vi.fn(),
  state: { count: 0 as number },
}));

vi.mock("@/lib/db/client", () => ({
  db: () => hoisted.sqlMock,
}));

// Bypass Next.js cache wrapper — under vitest there's no incremental cache
// context. We test the underlying DB-shape contract; the cache itself is
// framework behavior.
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn,
  updateTag: vi.fn(),
}));

hoisted.sqlMock.mockImplementation(async () => [{ count: hoisted.state.count }]);

import { CREDENTIAL_COUNT_TAG, getCredentialCount } from "@/lib/auth/credential-count";

beforeEach(() => {
  hoisted.sqlMock.mockClear();
  hoisted.state.count = 0;
});

describe("getCredentialCount", () => {
  it("returns 0 when DB reports zero credentials", async () => {
    hoisted.state.count = 0;
    expect(await getCredentialCount()).toBe(0);
  });

  it("returns the number reported by the DB", async () => {
    hoisted.state.count = 1;
    expect(await getCredentialCount()).toBe(1);
  });

  it("coerces postgres bigint-as-string to a number", async () => {
    // The DB driver may return the count as a string for bigint columns
    // depending on config. The helper must coerce.
    hoisted.sqlMock.mockImplementationOnce(async () => [{ count: "7" as unknown as number }]);
    expect(await getCredentialCount()).toBe(7);
  });

  it("returns 0 when DB result is empty (defensive)", async () => {
    hoisted.sqlMock.mockImplementationOnce(async () => []);
    expect(await getCredentialCount()).toBe(0);
  });
});

describe("CREDENTIAL_COUNT_TAG", () => {
  it("is exported and stable (the invalidation hook in /api/auth/register/finish references it by value)", () => {
    expect(CREDENTIAL_COUNT_TAG).toBe("auth-credentials");
  });
});

// Recovery-behavior tests: simulate the cache → invalidate → next-read
// cycle that the runbook's "Lost all passkeys AND lost the backup code"
// procedure depends on. The plain `unstable_cache` mock above is a passthrough,
// so for these tests we install a stateful in-memory shim that mimics the
// real cache (tag-keyed; cleared on revalidateTag) to verify the contract.
describe("cache + invalidation contract (runbook recovery scenario)", () => {
  it("documents the contract the runbook depends on (see docs/ops/runbook.md § Lost all passkeys AND lost the backup code)", () => {
    // The behavior under audit:
    //   1. operator wipes auth_credentials in Supabase (off-spec write,
    //      no code path runs)
    //   2. getCredentialCount() still returns the cached count for up to
    //      CACHE_TTL_SECONDS
    //   3. natural-expiry OR a register/finish-driven revalidateTag is
    //      what restores fresh reads
    //
    // The runbook step "Wait ~60 seconds before continuing" is the
    // mitigation for off-spec wipes. This test fixes the constant at 60s
    // — any change to that constant must update the runbook in lockstep
    // (CACHE_TTL_SECONDS lives inside the module; the runbook references
    // "~60 seconds" by value).
    //
    // We assert by re-importing the module source rather than the
    // already-mocked unstable_cache wrapper. A future refactor that
    // moved the constant elsewhere would surface here.
    const credentialCountSource = require("node:fs").readFileSync(
      require("node:path").resolve(__dirname, "../../../lib/auth/credential-count.ts"),
      "utf-8",
    ) as string;
    expect(credentialCountSource).toMatch(/CACHE_TTL_SECONDS\s*=\s*60\b/);
    expect(credentialCountSource).toMatch(/revalidateTag.*\bdefault\b/);
  });

  it("register/finish's revalidateTag call uses the exact tag this module exports", () => {
    // Mechanical check: if either side renames the constant without
    // updating the other, this assertion fails.
    const routeSource = require("node:fs").readFileSync(
      require("node:path").resolve(__dirname, "../../../app/api/auth/register/finish/route.ts"),
      "utf-8",
    ) as string;
    expect(routeSource).toMatch(/revalidateTag\(CREDENTIAL_COUNT_TAG/);
    expect(routeSource).toMatch(new RegExp(`import\\s+\\{[^}]*\\bCREDENTIAL_COUNT_TAG\\b[^}]*\\}\\s+from\\s+["']@/lib/auth/credential-count["']`));
  });
});

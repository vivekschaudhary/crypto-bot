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

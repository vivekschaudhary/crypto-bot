import { beforeEach, describe, expect, it, vi } from "vitest";

const FAKE_SECRET = "z".repeat(48);
vi.mock("@/lib/env", () => ({
  env: () => ({ SESSION_SIGNING_SECRET: FAKE_SECRET }),
  origin: () => "http://localhost:3000",
}));

// In-memory mock DB for the auth_sessions table.
type Row = { id: string; user_id: string; expires_at: Date; rotated_at?: Date };
let rows: Row[] = [];

// Postgres.js-style sql template tag stub.
function makeSql() {
  function execute(parts: TemplateStringsArray, ...args: unknown[]): unknown {
    const query = parts.join("?").trim().toUpperCase();
    if (query.startsWith("INSERT INTO AUTH_SESSIONS")) {
      const [id, userId] = args as [string, string];
      // Mock 30-day expiry; ignore the SQL interval expression
      rows.push({
        id,
        user_id: userId,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        rotated_at: query.includes("ROTATED_AT") ? new Date() : undefined,
      });
      return Promise.resolve([]);
    }
    if (query.startsWith("SELECT USER_ID, EXPIRES_AT FROM AUTH_SESSIONS WHERE ID =")) {
      const [id] = args as [string];
      const row = rows.find((r) => r.id === id);
      return Promise.resolve(row ? [{ user_id: row.user_id, expires_at: row.expires_at }] : []);
    }
    if (query.startsWith("UPDATE AUTH_SESSIONS")) {
      const [id] = args as [string];
      const row = rows.find((r) => r.id === id);
      if (row) row.expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      return Promise.resolve([]);
    }
    if (query.startsWith("DELETE FROM AUTH_SESSIONS WHERE ID =")) {
      const [id] = args as [string];
      rows = rows.filter((r) => r.id !== id);
      return Promise.resolve([]);
    }
    throw new Error(`Unhandled mock query: ${query}`);
  }
  const sql = execute as unknown as {
    (parts: TemplateStringsArray, ...args: unknown[]): unknown;
    begin: (fn: (tx: typeof sql) => Promise<unknown>) => Promise<unknown>;
    unsafe: (s: string) => string;
  };
  sql.begin = async (fn) => {
    return fn(sql);
  };
  sql.unsafe = (s: string) => s;
  return sql;
}

let sqlClient = makeSql();
vi.mock("@/lib/db/client", () => ({
  db: () => sqlClient,
}));

import {
  createSession,
  invalidateSession,
  rotateSession,
  verifySession,
} from "@/lib/auth/sessions";

beforeEach(() => {
  rows = [];
  sqlClient = makeSql();
});

describe("lib/auth/sessions", () => {
  it("createSession + verifySession round-trip", async () => {
    const { sessionId, signedCookie } = await createSession("user-123");
    expect(sessionId).toMatch(/^[0-9A-Z]{26}$/); // ULID shape
    const verified = await verifySession(signedCookie);
    expect(verified).toEqual({ userId: "user-123", sessionId });
  });

  it("verifySession returns null for an unknown session id", async () => {
    // Hand-craft a signed cookie for a session id that doesn't exist in the DB
    const cookieModule = await import("@/lib/auth/cookie");
    const orphanCookie = cookieModule.signValue("01ARZ3NDEKTSV4RRFFQ69G5FAV", FAKE_SECRET, 60);
    expect(await verifySession(orphanCookie)).toBeNull();
  });

  it("verifySession returns null for a tampered cookie", async () => {
    const { signedCookie } = await createSession("user-123");
    const parts = signedCookie.split(".");
    const p = parts[0]!;
    const s = parts[1]!;
    const tampered = `${p}.${s.slice(0, -1)}${s.slice(-1) === "A" ? "B" : "A"}`;
    expect(await verifySession(tampered)).toBeNull();
  });

  it("verifySession returns null when the row is expired", async () => {
    const { sessionId, signedCookie } = await createSession("user-123");
    // Manually expire the row
    const row = rows.find((r) => r.id === sessionId);
    if (row) row.expires_at = new Date(Date.now() - 1000);
    expect(await verifySession(signedCookie)).toBeNull();
  });

  it("invalidateSession deletes the row; subsequent verify returns null", async () => {
    const { sessionId, signedCookie } = await createSession("user-123");
    await invalidateSession(sessionId);
    expect(rows.find((r) => r.id === sessionId)).toBeUndefined();
    expect(await verifySession(signedCookie)).toBeNull();
  });

  it("invalidateSession on a non-existent id is a no-op (idempotent)", async () => {
    // Should not throw
    await expect(invalidateSession("01ARZ3NDEKTSV4RRFFQ69G5FAV")).resolves.toBeUndefined();
  });

  it("rotateSession deletes the prior row and creates a fresh one for the same user", async () => {
    const { sessionId: oldId } = await createSession("user-123");
    const { sessionId: newId, signedCookie: newCookie } = await rotateSession(oldId, "user-123");

    expect(newId).not.toBe(oldId);
    expect(rows.find((r) => r.id === oldId)).toBeUndefined();
    expect(rows.find((r) => r.id === newId)).toBeDefined();

    const verified = await verifySession(newCookie);
    expect(verified).toEqual({ userId: "user-123", sessionId: newId });
  });

  it("rotateSession participates in caller's transaction when txClient is provided (CB-1.3 AC 12)", async () => {
    // Seed an existing session that will get rotated.
    const { sessionId: oldId } = await createSession("user-123");
    expect(rows.find((r) => r.id === oldId)).toBeDefined();

    // Run rotateSession INSIDE a caller-owned sql.begin block.
    // The mock's structural sql type doesn't match postgres's Sql<> exactly,
    // so cast at the boundary — the runtime behavior is what we're testing.
    const sql = sqlClient;
    const result = await sql.begin(async (tx) => {
      return rotateSession(oldId, "user-123", tx as unknown as Parameters<typeof rotateSession>[2]);
    });
    // sql.begin returns whatever the callback returns (postgres.js semantics);
    // the mock implements this in makeSql() above.
    const { sessionId: newId } = result as { sessionId: string; signedCookie: string };

    expect(newId).not.toBe(oldId);
    expect(rows.find((r) => r.id === oldId)).toBeUndefined();
    expect(rows.find((r) => r.id === newId)).toBeDefined();
  });
});

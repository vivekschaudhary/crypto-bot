// Unit tests for lib/bot/overrides.ts (CB-5.3 override DB ops).
//
// Recording-mock DB: captures every tagged-template SQL call + the .begin
// transaction wrapper, and ROUTES the in-transaction current-session SELECT
// (the round-1 BLOCKER fix — each helper resolves + locks the current session
// itself) to a configurable row. Asserts query TEXT + transactional grouping
// + that mutations target the LOCKED id — NOT real Postgres. Pattern mirrors
// tests/lib/strategies/db.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface CapturedCall {
  text: string;
  values: unknown[];
}

const capturedCalls: CapturedCall[] = [];
// The row returned by the in-tx `SELECT ... FROM bot_sessions ... FOR UPDATE`.
// null-equivalent = no current session (empty array).
let currentSessionRow: Record<string, unknown> | null = { id: "session-1", active_strategy_id: "strat-1" };

function captureSqlCall(strings: TemplateStringsArray, ...values: unknown[]) {
  const text = strings.join("?");
  capturedCalls.push({ text, values });
  if (/SELECT[\s\S]*FROM bot_sessions/.test(text)) {
    return Promise.resolve(currentSessionRow ? [currentSessionRow] : []);
  }
  return Promise.resolve([]);
}

const txMock = vi.fn(captureSqlCall);

const sqlMock = Object.assign(vi.fn(captureSqlCall), {
  // Return the callback's resolved value (postgres.js sql.begin contract).
  begin: vi.fn((cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
});

vi.mock("@/lib/db/client", () => ({ db: () => sqlMock }));

let ulidCounter = 0;
vi.mock("ulidx", () => ({ ulid: () => `01ULID${ulidCounter++}` }));

import { pauseSession, resetSession, resumeSession } from "@/lib/bot/overrides";

beforeEach(() => {
  capturedCalls.length = 0;
  ulidCounter = 0;
  currentSessionRow = { id: "session-1", active_strategy_id: "strat-1" };
  sqlMock.begin.mockClear();
});
afterEach(() => vi.clearAllMocks());

describe("pauseSession — locks current session IN-TX, then mutates", () => {
  it("SELECTs current (ended_at IS NULL, FOR UPDATE), UPDATEs status='paused', logs event — ONE tx", async () => {
    const result = await pauseSession();
    expect(sqlMock.begin).toHaveBeenCalledOnce();
    expect(capturedCalls).toHaveLength(3);

    // 1. Resolve + LOCK the current session inside the transaction — the
    //    round-1 BLOCKER fix (act on a row proven-current at commit time).
    expect(capturedCalls[0]?.text).toContain("FROM bot_sessions");
    expect(capturedCalls[0]?.text).toContain("ended_at IS NULL");
    expect(capturedCalls[0]?.text).toContain("FOR UPDATE");

    // 2. Mutate the LOCKED id (not a route-supplied id).
    expect(capturedCalls[1]?.text).toContain("UPDATE bot_sessions");
    expect(capturedCalls[1]?.text).toContain("status =");
    expect(capturedCalls[1]?.values).toContain("paused");
    expect(capturedCalls[1]?.values).toContain("session-1");

    // 3. Audit row on the same session.
    expect(capturedCalls[2]?.text).toContain("INSERT INTO override_events");
    expect(capturedCalls[2]?.values).toContain("pause");
    expect(capturedCalls[2]?.values).toContain("session-1");

    expect(result).toEqual({ ok: true, status: "paused", sessionId: "session-1" });
  });

  it("no current session → { ok: false, no-session }, NO mutation (only the SELECT ran)", async () => {
    currentSessionRow = null;
    const result = await pauseSession();
    expect(result).toEqual({ ok: false, reason: "no-session" });
    expect(capturedCalls).toHaveLength(1); // the SELECT only — no UPDATE/INSERT
    expect(capturedCalls[0]?.text).toContain("FOR UPDATE");
  });
});

describe("resumeSession", () => {
  it("UPDATEs status='active' + logs a resume event on the locked current session", async () => {
    const result = await resumeSession();
    expect(capturedCalls[1]?.text).toContain("UPDATE bot_sessions");
    expect(capturedCalls[1]?.values).toContain("active");
    expect(capturedCalls[2]?.values).toContain("resume");
    expect(result).toEqual({ ok: true, status: "active", sessionId: "session-1" });
  });

  it("no current session → no-session, no mutation", async () => {
    currentSessionRow = null;
    expect(await resumeSession()).toEqual({ ok: false, reason: "no-session" });
    expect(capturedCalls).toHaveLength(1);
  });
});

describe("resetSession — MULTI-ROW (AC 4)", () => {
  it("locks current, ENDs it, INSERTs a NEW active row carrying active_strategy_id, logs reset on the ENDED id — ONE tx", async () => {
    const result = await resetSession();
    expect(sqlMock.begin).toHaveBeenCalledOnce();
    expect(capturedCalls).toHaveLength(4);

    // 1. Lock the current session.
    expect(capturedCalls[0]?.text).toContain("ended_at IS NULL");
    expect(capturedCalls[0]?.text).toContain("FOR UPDATE");

    // 2. END the locked session (status='reset' + ended_at).
    expect(capturedCalls[1]?.text).toContain("UPDATE bot_sessions");
    expect(capturedCalls[1]?.text).toContain("status = 'reset'");
    expect(capturedCalls[1]?.text).toContain("ended_at = now()");
    expect(capturedCalls[1]?.values).toContain("session-1");

    // 3. INSERT a NEW active row, carrying active_strategy_id forward (from
    //    the LOCKED row, not a stale route read).
    expect(capturedCalls[2]?.text).toContain("INSERT INTO bot_sessions");
    expect(capturedCalls[2]?.text).toContain("'active'");
    expect(capturedCalls[2]?.values).toContain("strat-1");

    // 4. Audit the reset against the ENDED session (Decision #2). 'reset' is
    //    an inline literal in this INSERT (vs. parameterized for pause/resume).
    expect(capturedCalls[3]?.text).toContain("INSERT INTO override_events");
    expect(capturedCalls[3]?.text).toContain("'reset'");
    expect(capturedCalls[3]?.values).toContain("session-1");

    // The new current session id is returned (a fresh ULID, NOT the old one).
    expect(result).toEqual({ ok: true, status: "active", sessionId: expect.not.stringMatching(/^session-1$/) });
  });

  it("carries a null active_strategy_id forward when the ended session had none", async () => {
    currentSessionRow = { id: "session-1", active_strategy_id: null };
    await resetSession();
    expect(capturedCalls[2]?.text).toContain("INSERT INTO bot_sessions");
    expect(capturedCalls[2]?.values).toContain(null);
  });

  it("no current session → no-session, no end/insert", async () => {
    currentSessionRow = null;
    expect(await resetSession()).toEqual({ ok: false, reason: "no-session" });
    expect(capturedCalls).toHaveLength(1);
  });

  it("does NOT delete or update historical orders/bot_ticks/signals (audit preserved)", async () => {
    await resetSession();
    const allText = capturedCalls.map((c) => c.text).join("\n");
    expect(allText).not.toMatch(/DELETE\s+FROM\s+orders/i);
    expect(allText).not.toMatch(/UPDATE\s+orders/i);
    expect(allText).not.toMatch(/(DELETE\s+FROM|UPDATE)\s+(bot_ticks|signals)/i);
  });
});

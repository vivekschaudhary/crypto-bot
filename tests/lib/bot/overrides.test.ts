// Unit tests for lib/bot/overrides.ts (CB-5.3 override DB ops).
//
// Recording-mock DB (captures every tagged-template SQL call + the .begin
// transaction wrapper). Pattern mirrors tests/lib/strategies/db.test.ts.
// Asserts the captured query TEXT + transactional grouping — NOT real Postgres.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface CapturedCall {
  text: string;
  values: unknown[];
}

const capturedCalls: CapturedCall[] = [];

function captureSqlCall(strings: TemplateStringsArray, ...values: unknown[]) {
  capturedCalls.push({ text: strings.join("?"), values });
  return Promise.resolve([]);
}

const txMock = vi.fn(captureSqlCall);

const sqlMock = Object.assign(vi.fn(captureSqlCall), {
  begin: vi.fn(async (cb: (tx: typeof txMock) => Promise<void>) => {
    await cb(txMock);
  }),
});

vi.mock("@/lib/db/client", () => ({ db: () => sqlMock }));

let ulidCounter = 0;
vi.mock("ulidx", () => ({ ulid: () => `01ULID${ulidCounter++}` }));

import { pauseSession, resetSession, resumeSession } from "@/lib/bot/overrides";

beforeEach(() => {
  capturedCalls.length = 0;
  ulidCounter = 0;
  sqlMock.begin.mockClear();
});
afterEach(() => vi.clearAllMocks());

describe("pauseSession", () => {
  it("UPDATEs status='paused' + INSERTs a pause override_event, in ONE transaction", async () => {
    const result = await pauseSession("session-1");
    expect(sqlMock.begin).toHaveBeenCalledOnce();
    expect(capturedCalls).toHaveLength(2);
    expect(capturedCalls[0]?.text).toContain("UPDATE bot_sessions");
    expect(capturedCalls[0]?.text).toContain("status = 'paused'");
    expect(capturedCalls[0]?.values).toContain("session-1");
    expect(capturedCalls[1]?.text).toContain("INSERT INTO override_events");
    expect(capturedCalls[1]?.text).toContain("'pause'");
    expect(capturedCalls[1]?.values).toContain("session-1");
    expect(result).toEqual({ status: "paused", sessionId: "session-1" });
  });
});

describe("resumeSession", () => {
  it("UPDATEs status='active' + INSERTs a resume override_event, in ONE transaction", async () => {
    const result = await resumeSession("session-1");
    expect(sqlMock.begin).toHaveBeenCalledOnce();
    expect(capturedCalls).toHaveLength(2);
    expect(capturedCalls[0]?.text).toContain("UPDATE bot_sessions");
    expect(capturedCalls[0]?.text).toContain("status = 'active'");
    expect(capturedCalls[1]?.text).toContain("INSERT INTO override_events");
    expect(capturedCalls[1]?.text).toContain("'resume'");
    expect(result).toEqual({ status: "active", sessionId: "session-1" });
  });
});

describe("resetSession — MULTI-ROW (AC 4)", () => {
  it("ENDs the current row, INSERTs a NEW active row carrying active_strategy_id, logs reset — ONE transaction", async () => {
    const result = await resetSession({ sessionId: "old-session", activeStrategyId: "strat-1" });
    expect(sqlMock.begin).toHaveBeenCalledOnce();
    expect(capturedCalls).toHaveLength(3);

    // 1. END the current session (status='reset' + ended_at).
    expect(capturedCalls[0]?.text).toContain("UPDATE bot_sessions");
    expect(capturedCalls[0]?.text).toContain("status = 'reset'");
    expect(capturedCalls[0]?.text).toContain("ended_at = now()");
    expect(capturedCalls[0]?.values).toContain("old-session");

    // 2. INSERT a NEW active row, carrying active_strategy_id forward.
    expect(capturedCalls[1]?.text).toContain("INSERT INTO bot_sessions");
    expect(capturedCalls[1]?.text).toContain("'active'");
    expect(capturedCalls[1]?.values).toContain("strat-1");

    // 3. Audit the reset against the ENDED session (Decision #2).
    expect(capturedCalls[2]?.text).toContain("INSERT INTO override_events");
    expect(capturedCalls[2]?.text).toContain("'reset'");
    expect(capturedCalls[2]?.values).toContain("old-session");

    // The new current session id is returned (a fresh ULID, NOT the old one).
    expect(result.status).toBe("active");
    expect(result.sessionId).not.toBe("old-session");
  });

  it("carries a null active_strategy_id forward when the ended session had none", async () => {
    await resetSession({ sessionId: "old-session", activeStrategyId: null });
    expect(capturedCalls[1]?.text).toContain("INSERT INTO bot_sessions");
    expect(capturedCalls[1]?.values).toContain(null);
  });

  it("does NOT delete or update historical orders/bot_ticks/signals (audit preserved)", async () => {
    await resetSession({ sessionId: "old-session", activeStrategyId: "strat-1" });
    const allText = capturedCalls.map((c) => c.text).join("\n");
    expect(allText).not.toMatch(/DELETE\s+FROM\s+orders/i);
    expect(allText).not.toMatch(/UPDATE\s+orders/i);
    expect(allText).not.toMatch(/(DELETE\s+FROM|UPDATE)\s+(bot_ticks|signals)/i);
  });
});

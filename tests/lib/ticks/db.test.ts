// Unit tests for lib/ticks/db.ts SQL predicates.
//
// Mocks @/lib/db/client with a recording mock that captures every tagged-
// template SQL call (pattern from tests/lib/strategies/db.test.ts). Asserts
// the captured query TEXT — NOT against real Postgres.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface CapturedCall {
  text: string;
  values: unknown[];
}

const capturedCalls: CapturedCall[] = [];
let nextResolvedValue: unknown[] = [];

function captureSqlCall(strings: TemplateStringsArray, ...values: unknown[]) {
  capturedCalls.push({ text: strings.join("?"), values });
  return Promise.resolve(nextResolvedValue);
}

const sqlMock = vi.fn(captureSqlCall);

vi.mock("@/lib/db/client", () => ({
  db: () => sqlMock,
}));

import { aggregateSessionTotals } from "@/lib/ticks/db";

beforeEach(() => {
  capturedCalls.length = 0;
  nextResolvedValue = [{ dollar_spent: 0, buy_count: 0 }];
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("aggregateSessionTotals — cap totals count live deployments only (PR #65 BLOCKER)", () => {
  it("excludes BOTH dry_run AND failed from the cap predicate", async () => {
    await aggregateSessionTotals("session-1");
    const q = capturedCalls[0]?.text ?? "";
    // The load-bearing assertion: dry_run must NOT count toward real-money
    // caps (else paper trading exhausts the cap pre-LIVE_MODE).
    expect(q).toContain("status NOT IN ('failed', 'dry_run')");
    // Regression guard against reverting to the CB-4.2 predicate.
    expect(q).not.toContain("status <> 'failed'");
  });

  it("scopes to the session's bot BUY rows", async () => {
    await aggregateSessionTotals("session-1");
    const call = capturedCalls[0];
    expect(call?.text).toContain("FROM orders");
    expect(call?.text).toContain("source = 'bot'");
    expect(call?.text).toContain("side = 'buy'");
    expect(call?.values).toContain("session-1");
  });

  it("returns the aggregated row shape", async () => {
    nextResolvedValue = [{ dollar_spent: 150, buy_count: 3 }];
    const totals = await aggregateSessionTotals("session-1");
    expect(totals).toEqual({ dollarSpent: 150, buyCount: 3 });
  });

  it("coalesces an empty session to zeros", async () => {
    nextResolvedValue = [{ dollar_spent: 0, buy_count: 0 }];
    const totals = await aggregateSessionTotals("session-1");
    expect(totals).toEqual({ dollarSpent: 0, buyCount: 0 });
  });
});

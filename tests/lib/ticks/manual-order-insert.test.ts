// CB-6.6 unit test for lib/ticks/db.ts:insertManualOrder — the standalone
// manual order row (source='manual') + its override_events audit row, written
// in ONE transaction. begin-capable recording mock.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls: { text: string; values: unknown[] }[] = [];
function tx(strings: TemplateStringsArray, ...values: unknown[]) {
  calls.push({ text: strings.join("?"), values });
  return Promise.resolve([]);
}
const sqlMock = { begin: async (cb: (t: typeof tx) => Promise<void>) => cb(tx) };
vi.mock("@/lib/db/client", () => ({ db: () => sqlMock }));
vi.mock("ulidx", () => ({ ulid: () => "01EVENT00000000000000000000" }));

import { insertManualOrder } from "@/lib/ticks/db";

beforeEach(() => {
  calls.length = 0;
});
afterEach(() => vi.clearAllMocks());

describe("insertManualOrder — manual order + override_events in one tx", () => {
  it("writes the order row (source='manual') AND the audit event", async () => {
    await insertManualOrder({
      id: "order-1",
      sessionId: "session-1",
      assetIdentifier: "BTC-USD",
      side: "buy",
      amount: 50,
      status: "dry_run",
      coinbaseOrderId: null,
      errorDetail: null,
      kind: "force_buy",
    });
    expect(calls).toHaveLength(2); // order + event, same tx

    const orderInsert = calls.find((c) => /INSERT INTO orders/.test(c.text));
    expect(orderInsert?.text).toContain("'manual'"); // source hardcoded
    expect(orderInsert?.values).toContain("order-1");
    expect(orderInsert?.values).toContain("BTC-USD");
    expect(orderInsert?.values).toContain("dry_run");

    const eventInsert = calls.find((c) => /INSERT INTO override_events/.test(c.text));
    expect(eventInsert?.values).toContain("session-1");
    expect(eventInsert?.values).toContain("force_buy");
  });
});

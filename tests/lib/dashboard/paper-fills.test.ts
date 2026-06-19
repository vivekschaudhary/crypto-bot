// CB-6.7 unit tests for lib/dashboard/paper-fills.ts (synthesizePaperFills).
// Recording-mock DB (bot_sessions + orders). Asserts the dry_run → Fill mapping
// (price = amount / base_quantity), NULL-qty exclusion, and no-session → [].

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let sessionRows: { id: string }[] = [];
let orderRows: { id: string; side: string; amount: number; base_quantity: number | null; created_at: Date }[] = [];
function sqlMock(strings: TemplateStringsArray, ..._v: unknown[]) {
  const text = strings.join("?");
  if (/FROM bot_sessions/.test(text)) return Promise.resolve(sessionRows);
  if (/FROM orders/.test(text)) return Promise.resolve(orderRows);
  return Promise.resolve([]);
}
vi.mock("@/lib/db/client", () => ({ db: () => sqlMock }));

import { synthesizePaperFills } from "@/lib/dashboard/paper-fills";

beforeEach(() => {
  sessionRows = [{ id: "session-1" }];
  orderRows = [
    { id: "o1", side: "buy", amount: 100, base_quantity: 0.05, created_at: new Date("2026-06-18T00:00:00Z") },
    { id: "o2", side: "buy", amount: 50, base_quantity: 0.02, created_at: new Date("2026-06-18T00:15:00Z") },
    { id: "o3", side: "sell", amount: 30, base_quantity: 0.01, created_at: new Date("2026-06-18T00:30:00Z") },
  ];
});
afterEach(() => vi.clearAllMocks());

describe("synthesizePaperFills", () => {
  it("maps each dry_run order to a Fill (price = amount / base_quantity)", async () => {
    const fills = await synthesizePaperFills("ETH-USD");
    expect(fills).toHaveLength(3);
    expect(fills[0]).toMatchObject({ side: "BUY", size: "0.05", price: "2000", product_id: "ETH-USD" }); // 100/0.05
    expect(fills[1]).toMatchObject({ side: "BUY", size: "0.02", price: "2500" }); // 50/0.02
    expect(fills[2]).toMatchObject({ side: "SELL", size: "0.01", price: "3000" }); // 30/0.01
  });

  it("excludes rows with NULL or zero base_quantity (forward-only)", async () => {
    orderRows = [
      { id: "ok", side: "buy", amount: 100, base_quantity: 0.05, created_at: new Date("2026-06-18T00:00:00Z") },
      { id: "null-qty", side: "buy", amount: 100, base_quantity: null, created_at: new Date("2026-06-18T00:01:00Z") },
      { id: "zero-qty", side: "buy", amount: 100, base_quantity: 0, created_at: new Date("2026-06-18T00:02:00Z") },
    ];
    const fills = await synthesizePaperFills("ETH-USD");
    expect(fills.map((f) => f.entry_id)).toEqual(["ok"]);
  });

  it("no active session → [] (no Coinbase, no orders read needed)", async () => {
    sessionRows = [];
    expect(await synthesizePaperFills("ETH-USD")).toEqual([]);
  });

  it("no dry_run orders → []", async () => {
    orderRows = [];
    expect(await synthesizePaperFills("ETH-USD")).toEqual([]);
  });
});

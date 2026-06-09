// CB-3.3 unit tests for lib/strategies/db.ts.
//
// Mocks @/lib/db/client at the module level via vi.mock — the postgres
// tagged-template client is replaced by a recording mock that captures
// every SQL call. Tests assert against the captured calls (NOT against
// real Postgres).
//
// Pattern mirrors `tests/lib/auth/sessions.test.ts` (CB-1.2+).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Strategy, StrategyId } from "@/lib/strategy-core/types";

// ──────────────────────────────────────────────────────────────────────────
// Mock the postgres client. The mock returns a function that, when called
// as a tagged template, captures the call and returns a configurable Promise.
// ──────────────────────────────────────────────────────────────────────────

interface CapturedCall {
  text: string;
  values: unknown[];
}

const capturedCalls: CapturedCall[] = [];
let nextResolvedValue: unknown[] = [];

function captureSqlCall(strings: TemplateStringsArray, ...values: unknown[]) {
  capturedCalls.push({
    text: strings.join("?"),
    values,
  });
  return Promise.resolve(nextResolvedValue);
}

// Add the `.begin` + `.json` helpers postgres.js exposes. The mock's begin
// invokes the callback with a tx that has the same tagged-template shape.
const txMock = Object.assign(
  vi.fn(captureSqlCall) as unknown as {
    (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
    json: (v: unknown) => unknown;
  },
  {
    json: (v: unknown) => ({ __json: v }),
  },
);

const sqlMock = Object.assign(
  vi.fn(captureSqlCall) as unknown as {
    (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
    begin: (cb: (tx: typeof txMock) => Promise<void>) => Promise<void>;
    json: (v: unknown) => unknown;
  },
  {
    begin: vi.fn(async (cb: (tx: typeof txMock) => Promise<void>) => {
      await cb(txMock);
    }),
    json: (v: unknown) => ({ __json: v }),
  },
);

vi.mock("@/lib/db/client", () => ({
  db: () => sqlMock,
}));

vi.mock("ulidx", () => ({
  ulid: () => "01HSESSIONABC123XYZ4567890",
}));

// Import-after-mock — required so the mock takes effect.
import {
  getActiveStrategy,
  insertStrategy,
  markSuperseded,
  upsertSingletonBotSession,
} from "@/lib/strategies/db";

const VALID_ULID = "01H8XGJWBWBAQ4N7CHR3M9YT8K" as StrategyId;
const OTHER_ULID = "01H8XGJWBWBAQ4N7CHR3M9YT8L" as StrategyId;
const USER_ULID = "01H8XGJWBWBAQ4N7CHR3M9YT8M";

beforeEach(() => {
  capturedCalls.length = 0;
  nextResolvedValue = [];
  sqlMock.begin.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("getActiveStrategy", () => {
  it("returns null when no rows are found (first-time authoring)", async () => {
    nextResolvedValue = [];
    const result = await getActiveStrategy();
    expect(result).toBeNull();
    expect(capturedCalls).toHaveLength(1);
    expect(capturedCalls[0]?.text).toContain("FROM strategies");
    expect(capturedCalls[0]?.text).toContain(
      "WHERE superseded_by_strategy_id IS NULL",
    );
    expect(capturedCalls[0]?.text).toContain("ORDER BY created_at DESC");
    expect(capturedCalls[0]?.text).toContain("LIMIT 1");
  });

  it("parses the returned row through StrategySchema", async () => {
    nextResolvedValue = [
      {
        id: VALID_ULID,
        name: "Test",
        asset_class: "crypto-coinbase",
        selected_assets: [
          { assetClass: "crypto-coinbase", identifier: "BTC-USD" },
        ],
        entry_rules: { rsiThreshold: 30, maPeriod: 20, maReinforcement: false },
        exit_rules: { rsiThreshold: 70, minProfitPct: 1.5, sellFraction: 0.5 },
        position_size_usd: 50,
        per_session_buy_count_cap: 10,
        per_session_dollar_cap: 500,
        created_at: new Date("2026-06-08T12:00:00.000Z"),
        created_by_user_id: USER_ULID,
        superseded_by_strategy_id: null,
      },
    ];
    const result = await getActiveStrategy();
    expect(result).not.toBeNull();
    expect(result?.name).toBe("Test");
    expect(result?.id).toBe(VALID_ULID);
  });
});

describe("insertStrategy", () => {
  const row: Strategy = {
    id: VALID_ULID,
    name: "Insert Test",
    asset_class: "crypto-coinbase",
    selected_assets: [
      { assetClass: "crypto-coinbase", identifier: "BTC-USD" },
    ],
    entry_rules: { rsiThreshold: 30, maPeriod: 20, maReinforcement: false },
    exit_rules: { rsiThreshold: 70, minProfitPct: 1.5, sellFraction: 0.5 },
    position_size_usd: 50,
    per_session_buy_count_cap: 10,
    per_session_dollar_cap: 500,
    created_at: new Date("2026-06-08T12:00:00.000Z"),
    created_by_user_id: USER_ULID as unknown as Strategy["created_by_user_id"],
    superseded_by_strategy_id: null,
  };

  it("issues an INSERT into strategies with the expected columns", async () => {
    await insertStrategy(row);
    expect(capturedCalls).toHaveLength(1);
    const call = capturedCalls[0];
    expect(call?.text).toContain("INSERT INTO strategies");
    expect(call?.text).toContain("VALUES");
    // First value is the id; values are passed through tagged-template args.
    expect(call?.values[0]).toBe(VALID_ULID);
    expect(call?.values[1]).toBe("Insert Test");
  });
});

describe("markSuperseded", () => {
  it("UPDATEs only the superseded_by_strategy_id column", async () => {
    await markSuperseded(VALID_ULID, OTHER_ULID);
    expect(capturedCalls).toHaveLength(1);
    const call = capturedCalls[0];
    expect(call?.text).toContain("UPDATE strategies");
    expect(call?.text).toContain("SET superseded_by_strategy_id");
    expect(call?.text).toContain("WHERE id");
    expect(call?.values).toEqual([OTHER_ULID, VALID_ULID]);
  });

  it("does NOT touch any strategy content columns (append-only invariant)", async () => {
    await markSuperseded(VALID_ULID, OTHER_ULID);
    const text = capturedCalls[0]?.text ?? "";
    expect(text).not.toMatch(/SET\s+name/);
    expect(text).not.toMatch(/SET\s+selected_assets/);
    expect(text).not.toMatch(/SET\s+entry_rules/);
    expect(text).not.toMatch(/SET\s+exit_rules/);
    expect(text).not.toMatch(/SET\s+position_size_usd/);
  });
});

describe("upsertSingletonBotSession", () => {
  it("INSERTs a new row when bot_sessions is empty", async () => {
    nextResolvedValue = []; // SELECT FOR UPDATE returns no row
    await upsertSingletonBotSession(VALID_ULID);
    expect(sqlMock.begin).toHaveBeenCalledOnce();
    // Inside the transaction: SELECT then INSERT.
    expect(capturedCalls).toHaveLength(2);
    expect(capturedCalls[0]?.text).toContain("SELECT id FROM bot_sessions");
    expect(capturedCalls[0]?.text).toContain("FOR UPDATE");
    expect(capturedCalls[1]?.text).toContain("INSERT INTO bot_sessions");
    // status='active' is inline in the INSERT SQL (not a parameterized value)
    expect(capturedCalls[1]?.text).toContain("'active'");
    // active_strategy_id flows through as a tagged-template value
    expect(capturedCalls[1]?.values).toContain(VALID_ULID);
  });

  it("UPDATEs the existing row's active_strategy_id when bot_sessions has a row", async () => {
    nextResolvedValue = [{ id: "01HBOT_SESSION_EXISTS01234567890" }];
    await upsertSingletonBotSession(VALID_ULID);
    expect(sqlMock.begin).toHaveBeenCalledOnce();
    // Inside the transaction: SELECT then UPDATE.
    expect(capturedCalls).toHaveLength(2);
    expect(capturedCalls[1]?.text).toContain("UPDATE bot_sessions");
    expect(capturedCalls[1]?.text).toContain("SET active_strategy_id");
    expect(capturedCalls[1]?.text).toContain("updated_at = now()");
    expect(capturedCalls[1]?.values).toContain(VALID_ULID);
  });

  it("wraps the read + write in a single transaction (concurrent-save defense)", async () => {
    nextResolvedValue = [];
    await upsertSingletonBotSession(VALID_ULID);
    expect(sqlMock.begin).toHaveBeenCalledOnce();
  });
});

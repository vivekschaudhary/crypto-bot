// CB-3.3 — unit tests for the saveStrategy server action.
//
// Mocks @/lib/strategies/db + next/headers + next/navigation + ulidx so the
// action runs end-to-end against fixtures. Validation paths return
// SaveStrategyResult; success path calls redirect() which the mock records.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildEmptyStateDefaults,
} from "@/lib/strategies/defaults";

// ──────────────────────────────────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────────────────────────────────

// Mock the lib/strategies/db module with vi.hoisted-friendly mocks. Each
// helper has a non-empty parameter signature so the action's call sites
// typecheck through the mock.
const insertStrategy = vi.fn<(row: unknown) => Promise<void>>(async () => undefined);
const markSuperseded = vi.fn<(oldId: unknown, newId: unknown) => Promise<void>>(
  async () => undefined,
);
const upsertSingletonBotSession = vi.fn<(id: unknown) => Promise<void>>(
  async () => undefined,
);

vi.mock("@/lib/strategies/db", () => ({
  insertStrategy: (row: unknown) => insertStrategy(row),
  markSuperseded: (a: unknown, b: unknown) => markSuperseded(a, b),
  upsertSingletonBotSession: (id: unknown) => upsertSingletonBotSession(id),
}));

// Round-1 BLOCKER 2 closure: action now re-verifies the session via
// verifySession(cookieValue) rather than trusting the proxy-forwarded
// x-session-user-id header. Tests mock cookies() + lib/auth/sessions
// verifySession to drive the action through the new auth path.
const cookieStoreMock = vi.fn();
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve(cookieStoreMock()),
}));

const verifySessionMock = vi.fn<
  (cookie: string) => Promise<{ userId: string; sessionId: string } | null>
>();
vi.mock("@/lib/auth/sessions", () => ({
  verifySession: (cookie: unknown) => verifySessionMock(cookie as string),
}));

const redirectMock = vi.fn((path: string) => {
  // Mirror next/navigation's behavior: redirect() throws an error with
  // digest starting with NEXT_REDIRECT.
  const err = new Error(`NEXT_REDIRECT;${path}`) as Error & { digest: string };
  err.digest = `NEXT_REDIRECT;${path}`;
  throw err;
});
vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirectMock(path),
}));

const ulidMock = vi.fn(() => "01HSTRATEGYNEWXY567890123T");
vi.mock("ulidx", () => ({
  ulid: () => ulidMock(),
}));

// Import-after-mock.
import { saveStrategy } from "@/app/dashboard/strategy/strategy-actions";

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

const USER_ID = "01HUSER0000000000000000000";

function makeFormData(overrides: Record<string, string> = {}): FormData {
  const defaults = buildEmptyStateDefaults({
    selectedAssets: [
      { assetClass: "crypto-coinbase", identifier: "BTC-USD" },
      { assetClass: "crypto-coinbase", identifier: "ETH-USD" },
    ],
    assetClass: "crypto-coinbase",
  });

  const formData = new FormData();
  formData.set("name", overrides.name ?? "Test Strategy");
  formData.set("asset_class", overrides.asset_class ?? defaults.asset_class);
  formData.set(
    "selected_assets",
    overrides.selected_assets ?? JSON.stringify(defaults.selected_assets),
  );
  formData.set(
    "entry_rules",
    overrides.entry_rules ?? JSON.stringify(defaults.entry_rules),
  );
  formData.set(
    "exit_rules",
    overrides.exit_rules ?? JSON.stringify(defaults.exit_rules),
  );
  formData.set(
    "position_size_usd",
    overrides.position_size_usd ?? String(defaults.position_size_usd),
  );
  formData.set(
    "per_session_buy_count_cap",
    overrides.per_session_buy_count_cap ??
      String(defaults.per_session_buy_count_cap),
  );
  formData.set(
    "per_session_dollar_cap",
    overrides.per_session_dollar_cap ?? String(defaults.per_session_dollar_cap),
  );
  formData.set("supersedes_strategy_id", overrides.supersedes_strategy_id ?? "");

  return formData;
}

beforeEach(() => {
  insertStrategy.mockClear();
  markSuperseded.mockClear();
  upsertSingletonBotSession.mockClear();
  cookieStoreMock.mockReset();
  verifySessionMock.mockReset();
  redirectMock.mockClear();
  ulidMock.mockReset();
  ulidMock.mockReturnValue("01HSTRATEGYNEWXY567890123T");
  // Default: a valid session cookie present + verifySession succeeds.
  cookieStoreMock.mockReturnValue({
    get: (key: string) =>
      key === "__compass_session" ? { value: "signed.cookie.value" } : undefined,
  });
  verifySessionMock.mockResolvedValue({
    userId: USER_ID,
    sessionId: "01HSESSION00000000000000",
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ──────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────

describe("saveStrategy — happy path (first-time authoring; no supersession)", () => {
  it("INSERTs new strategy, does NOT call markSuperseded, UPSERTs bot_session, redirects to /dashboard?strategy=saved", async () => {
    const formData = makeFormData();
    await expect(saveStrategy(formData)).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
    expect(insertStrategy).toHaveBeenCalledOnce();
    expect(markSuperseded).not.toHaveBeenCalled();
    expect(upsertSingletonBotSession).toHaveBeenCalledOnce();
    expect(redirectMock).toHaveBeenCalledWith("/dashboard?strategy=saved");
  });

  it("emits a structured-JSON success log with strategy_id_superseded=null", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const formData = makeFormData();
    try {
      await saveStrategy(formData);
    } catch {
      // expected NEXT_REDIRECT
    }
    // Find the success log line
    const successLog = logSpy.mock.calls
      .map(([arg]) => arg)
      .filter((arg): arg is string => typeof arg === "string")
      .map((arg) => JSON.parse(arg))
      .find((j) => j.event === "strategy.save" && j.success === true);
    expect(successLog).toBeDefined();
    expect(successLog?.asset_class).toBe("crypto-coinbase");
    expect(successLog?.strategy_id_superseded).toBeNull();
    logSpy.mockRestore();
  });
});

describe("saveStrategy — supersession (revising an existing strategy)", () => {
  it("INSERTs new strategy AND marks the old one superseded", async () => {
    const OLD_ID = "01HOLDSTRATEGY01234567890Z";
    const formData = makeFormData({ supersedes_strategy_id: OLD_ID });
    await expect(saveStrategy(formData)).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
    expect(insertStrategy).toHaveBeenCalledOnce();
    expect(markSuperseded).toHaveBeenCalledOnce();
    expect(markSuperseded).toHaveBeenCalledWith(
      OLD_ID,
      "01HSTRATEGYNEWXY567890123T",
    );
    expect(upsertSingletonBotSession).toHaveBeenCalledOnce();
  });
});

describe("saveStrategy — validation failures (returns SaveStrategyResult; no redirect)", () => {
  it("returns ENTRY_RSI_NOT_LESS_THAN_EXIT_RSI when entry RSI >= exit RSI", async () => {
    const formData = makeFormData({
      entry_rules: JSON.stringify({
        rsiThreshold: 80,
        maPeriod: 20,
        maReinforcement: false,
      }),
      exit_rules: JSON.stringify({
        rsiThreshold: 60,
        minProfitPct: 1.5,
        sellFraction: 0.5,
      }),
    });
    const result = await saveStrategy(formData);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error_type).toBe("validation");
    expect(result.errors.some((e) => e.code === "ENTRY_RSI_NOT_LESS_THAN_EXIT_RSI")).toBe(true);
    expect(insertStrategy).not.toHaveBeenCalled();
    expect(upsertSingletonBotSession).not.toHaveBeenCalled();
  });

  it("returns POSITION_SIZE_USD_NOT_POSITIVE when position size is 0", async () => {
    const formData = makeFormData({ position_size_usd: "0" });
    const result = await saveStrategy(formData);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.some((e) => e.code === "POSITION_SIZE_USD_NOT_POSITIVE")).toBe(true);
    expect(insertStrategy).not.toHaveBeenCalled();
  });

  it("returns SELECTED_ASSETS_COUNT_OUT_OF_RANGE when selected_assets is empty", async () => {
    const formData = makeFormData({ selected_assets: "[]" });
    const result = await saveStrategy(formData);
    expect(result.success).toBe(false);
    if (result.success) return;
    // Empty array fails StrategyFormPayloadSchema.min(1) first (SHAPE_INVALID
    // at the schema layer) — same banner copy, same behavior, no DB writes.
    expect(insertStrategy).not.toHaveBeenCalled();
  });

  it("returns SHAPE_INVALID with no DB writes when entry_rules is unparseable JSON", async () => {
    const formData = makeFormData({ entry_rules: "{not json" });
    const result = await saveStrategy(formData);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error_type).toBe("validation");
    expect(result.errors.some((e) => e.code === "SHAPE_INVALID")).toBe(true);
    expect(insertStrategy).not.toHaveBeenCalled();
  });

  it("emits a structured-JSON failure log with validation_errors array", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const formData = makeFormData({ position_size_usd: "0" });
    await saveStrategy(formData);
    const failureLog = logSpy.mock.calls
      .map(([arg]) => arg)
      .filter((arg): arg is string => typeof arg === "string")
      .map((arg) => JSON.parse(arg))
      .find((j) => j.event === "strategy.save" && j.success === false);
    expect(failureLog).toBeDefined();
    expect(failureLog?.validation_errors).toContain(
      "POSITION_SIZE_USD_NOT_POSITIVE",
    );
    logSpy.mockRestore();
  });
});

describe("saveStrategy — auth posture (defense-in-depth via verifySession)", () => {
  it("returns server-error result + no DB writes when the session cookie is missing", async () => {
    cookieStoreMock.mockReturnValue({ get: () => undefined });
    const formData = makeFormData();
    const result = await saveStrategy(formData);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error_type).toBe("server");
    expect(verifySessionMock).not.toHaveBeenCalled();
    expect(insertStrategy).not.toHaveBeenCalled();
  });

  it("returns server-error result + no DB writes when verifySession rejects (forged/expired cookie)", async () => {
    verifySessionMock.mockResolvedValueOnce(null);
    const formData = makeFormData();
    const result = await saveStrategy(formData);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error_type).toBe("server");
    expect(verifySessionMock).toHaveBeenCalledOnce();
    expect(insertStrategy).not.toHaveBeenCalled();
  });

  it("uses the verifySession userId as the canonical auth claim (not a header)", async () => {
    const formData = makeFormData();
    try {
      await saveStrategy(formData);
    } catch {
      // expected NEXT_REDIRECT on success
    }
    // The cookie was read AND verifySession was invoked — the action does
    // NOT trust headers as auth claims.
    expect(cookieStoreMock).toHaveBeenCalled();
    expect(verifySessionMock).toHaveBeenCalledOnce();
  });
});

describe("saveStrategy — DB error path (returns server failure, no redirect)", () => {
  it("returns server failure when insertStrategy throws", async () => {
    insertStrategy.mockImplementationOnce(async () => {
      throw new Error("simulated postgres failure");
    });
    const formData = makeFormData();
    const result = await saveStrategy(formData);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error_type).toBe("server");
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

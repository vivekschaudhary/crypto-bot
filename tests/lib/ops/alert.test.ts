// CB-6.8 — operator alerting (Telegram). Unit tests: the pure formatters
// (incl. secret-redaction defense-in-depth) + sendAlert's env-gating, payload,
// and never-throw contract. `@/lib/env` is mocked so we control the Telegram
// config per test; global `fetch` is stubbed.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let mockEnv: Record<string, unknown> = {};
vi.mock("@/lib/env", () => ({ env: () => mockEnv }));

import { formatOrderFailureAlert, formatTickErrorAlert, sendAlert } from "@/lib/ops/alert";

const fetchMock = vi.fn();

beforeEach(() => {
  mockEnv = {};
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("formatOrderFailureAlert", () => {
  it("formats source · side · asset · amount · reason", () => {
    const msg = formatOrderFailureAlert({
      source: "manual",
      asset: "ETH-USD",
      side: "buy",
      amountUsd: 50,
      reason: "insufficient funds",
    });
    expect(msg).toContain("manual order FAILED");
    expect(msg).toContain("BUY ETH-USD");
    expect(msg).toContain("$50");
    expect(msg).toContain("insufficient funds");
  });

  it("omits the amount when absent and handles a null reason", () => {
    const msg = formatOrderFailureAlert({ source: "bot", asset: "BTC-USD", side: "sell", reason: null });
    expect(msg).toContain("SELL BTC-USD");
    expect(msg).toContain("unknown reason");
    expect(msg).not.toContain("$");
  });

  it("redacts secret-shaped reasons (no JWT egress to Telegram)", () => {
    const jwt = "eyJhbGciOiJ.eyJzdWIiOiI.SflKxwRJSMeKKF";
    const msg = formatOrderFailureAlert({ source: "bot", asset: "ETH-USD", side: "buy", reason: `boom ${jwt}` });
    expect(msg).not.toContain(jwt);
    expect(msg).toContain("[REDACTED_JWT]");
  });
});

describe("formatTickErrorAlert", () => {
  it("formats and redacts", () => {
    expect(formatTickErrorAlert("db unreachable")).toContain("Bot tick ERROR: db unreachable");
    expect(formatTickErrorAlert("Bearer abc.def.ghi tok")).toContain("Bearer [REDACTED]");
  });
});

describe("sendAlert — env-gating, payload, never-throw", () => {
  it("is a no-op (no fetch) when neither token nor chat is set", async () => {
    mockEnv = {};
    await sendAlert("hi");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is a no-op when only one of token/chat is set", async () => {
    mockEnv = { TELEGRAM_BOT_TOKEN: "t" };
    await sendAlert("hi");
    expect(fetchMock).not.toHaveBeenCalled();

    mockEnv = { TELEGRAM_CHAT_ID: "c" };
    await sendAlert("hi");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs to the Telegram API with chat_id + text when configured", async () => {
    mockEnv = { TELEGRAM_BOT_TOKEN: "BOT123", TELEGRAM_CHAT_ID: "999" };
    fetchMock.mockResolvedValue({ ok: true });
    await sendAlert("hello");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.telegram.org/botBOT123/sendMessage");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body as string)).toEqual({ chat_id: "999", text: "hello" });
  });

  it("never throws when fetch rejects (an alert failure must not break the caller)", async () => {
    mockEnv = { TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "c" };
    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(sendAlert("x")).resolves.toBeUndefined();
  });
});

// CB-5.2 — Ledger render tests. PnlPanel + TransactionsTable are exported
// sync components rendering text directly, so JSON.stringify captures their
// output (the page composes them — its OWN direct JSX, e.g. the bounded
// note, is tested on LedgerPage). Assert RENDERED output, not just the
// read model (CB-5.1 precedent).

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AssetPnlRow, Ledger, LedgerRow } from "@/lib/dashboard/ledger";

const hoisted = vi.hoisted(() => ({ ledger: { orders: [], pnl: [], hasMore: false } as Ledger }));
vi.mock("@/lib/dashboard/ledger", () => ({ loadLedger: vi.fn(async () => hoisted.ledger) }));
vi.mock("@/lib/env", () => ({ env: () => ({ LIVE_MODE: false }) }));
vi.mock("@/app/dashboard/sign-out-client", () => ({ SignOutClient: () => null }));

import LedgerPage, { PnlPanel, TransactionsTable } from "@/app/dashboard/ledger/page";

const NOTE = "Showing the 50 most recent transactions. Older transactions not shown.";

function orderRow(over: Partial<LedgerRow> = {}): LedgerRow {
  return { id: "o1", assetIdentifier: "BTC-USD", source: "bot", side: "buy", amount: 50, status: "dry_run", createdAt: new Date("2026-06-14T17:00:00Z"), ...over };
}
function pnlRow(over: Partial<AssetPnlRow> = {}): AssetPnlRow {
  return { assetIdentifier: "BTC-USD", quantity: 0.001, avgCostUsd: 42000, currentPrice: 43000, realizedPnlUsd: 12.4, unrealizedPnlUsd: 13.41, ...over };
}

beforeEach(() => {
  hoisted.ledger = { orders: [], pnl: [], hasMore: false };
});

describe("TransactionsTable render", () => {
  it("renders rows incl. the per-execution status (paper/live)", () => {
    const json = JSON.stringify(TransactionsTable({ orders: [orderRow(), orderRow({ id: "o2", assetIdentifier: "ETH-USD", status: "submitted", side: "sell" })] }));
    expect(json).toContain("BTC-USD");
    expect(json).toContain("ETH-USD");
    expect(json).toContain("dry_run");
    expect(json).toContain("submitted");
  });
  it("empty → No transactions yet.", () => {
    expect(JSON.stringify(TransactionsTable({ orders: [] }))).toContain("No transactions yet.");
  });
});

describe("PnlPanel render", () => {
  it("signed realized + unrealized", () => {
    const json = JSON.stringify(PnlPanel({ pnl: [pnlRow()] }));
    expect(json).toContain("+$12.40");
    expect(json).toContain("+$13.41");
  });
  it("loss renders the minus sign", () => {
    const json = JSON.stringify(PnlPanel({ pnl: [pnlRow({ realizedPnlUsd: 0, unrealizedPnlUsd: -1, currentPrice: 41000 })] }));
    expect(json).toContain("−$1.00");
  });
  it("null unrealized (no current price) → em dash", () => {
    const json = JSON.stringify(PnlPanel({ pnl: [pnlRow({ currentPrice: null, unrealizedPnlUsd: null })] }));
    expect(json).toContain("—");
  });
  it("degraded (pnl null) → PnL unavailable", () => {
    expect(JSON.stringify(PnlPanel({ pnl: null }))).toContain("PnL unavailable");
  });
  it("empty (no positions) → No open positions.", () => {
    expect(JSON.stringify(PnlPanel({ pnl: [] }))).toContain("No open positions.");
  });
});

describe("LedgerPage render", () => {
  it("bounded note when hasMore", async () => {
    hoisted.ledger = { orders: [orderRow()], pnl: [], hasMore: true };
    expect(JSON.stringify(await LedgerPage())).toContain(NOTE);
  });
  it("no bounded note when within limit", async () => {
    hoisted.ledger = { orders: [orderRow()], pnl: [], hasMore: false };
    expect(JSON.stringify(await LedgerPage())).not.toContain(NOTE);
  });
  it("degraded ledger still renders the page (PnlPanel + TransactionsTable composed)", async () => {
    hoisted.ledger = { orders: [orderRow()], pnl: null, hasMore: false };
    // LedgerPage composes the sub-components; assert it renders without throwing
    // + carries the page heading (direct JSX).
    expect(JSON.stringify(await LedgerPage())).toContain("Transaction ledger");
  });
});

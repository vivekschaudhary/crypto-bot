// CB-6.0/CB-6.6 cockpit e2e:
//   - load → status → Pause→STOPPED → Start→ACTIVE
//   - per-pair selector + Current Position happy path (held qty + avg cost +
//     live price + latest RSI) using the operator's REAL Coinbase reads
//   - Profit/Loss happy path (session invested + signed P&L)
//   - Signals happy path (seeded signal → RSI zone + price-vs-MA + next action)
//   - Trade Log happy path (trades + skipped hold rows) + status filtering
//   - Run Now happy path (fresh manual tick reflected in the cockpit)
//   - paused Run Now → skip feedback (no silent no-op)
//   - Manual Overrides happy paths: dry_run Buy → confirm → order in Trade Log;
//     Sell All on a valid pair with no position → "No position to sell."
//   - unevaluated pair path (fake pair → no position + live-price-unavailable +
//     P&L unavailable + "No signals yet")
//   - Equity + Mutual Funds tabs show the "coming soon" placeholders
//
// Why a real Coinbase happy path here? The cockpit's Current Position card is
// server-rendered from outbound Coinbase reads (`getAccountTradeHistory` +
// `getProduct`), and Playwright cannot mock the Next server's outbound fetches.
// So this e2e mirrors the route's real composition using the same read fns
// the app uses, while deterministic unit tests cover the fully-mocked logic.

import { expect, test } from "@playwright/test";
import { ulid } from "ulidx";

import { getAccountTradeHistory } from "@/lib/coinbase/accounts";
import { computeAssetPnl } from "@/lib/dashboard/pnl";
import { getProduct } from "@/lib/coinbase/market";
import { aggregatePosition } from "@/lib/ticks/cost-basis";

import { addVirtualAuthenticator, completeSetupJourney, getSql, resetAllTables } from "../helpers";

const sql = getSql();
const DEGRADE_PAIR = "FAKE-USD";
const HELD_PAIR_CANDIDATES = ["BTC-USD", "ETH-USD", "SOL-USD", "XRP-USD", "ZEC-USD"] as const;
const NO_POSITION_PAIR_CANDIDATES = [
  "BTC-USD",
  "ETH-USD",
  "SOL-USD",
  "XRP-USD",
  "ZEC-USD",
  "LTC-USD",
  "LINK-USD",
  "ADA-USD",
] as const;

test.describe.configure({ mode: "serial" });

test.beforeEach(async () => {
  await resetAllTables(sql);
});

test.afterAll(async () => {
  await sql.end({ timeout: 5 });
});

function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtTs(d: Date): string {
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function slashPair(pair: string): string {
  return pair.replace("-", "/");
}

function baseOf(pair: string): string {
  return (pair.split("-")[0] ?? pair).toUpperCase();
}

async function seedStrategyAndSession(pairs: readonly string[]): Promise<void> {
  const users = await sql<{ id: string }[]>`SELECT id FROM auth_users ORDER BY created_at DESC LIMIT 1`;
  const userId = users[0]?.id;
  if (!userId) {
    throw new Error("cockpit e2e requires an auth_users row after onboarding");
  }

  const strategyId = ulid();
  await sql`
    INSERT INTO strategies (
      id,
      name,
      asset_class,
      selected_assets,
      entry_rules,
      exit_rules,
      position_size_usd,
      per_session_buy_count_cap,
      per_session_dollar_cap,
      created_by_user_id
    ) VALUES (
      ${strategyId},
      ${"Cockpit E2E Strategy"},
      ${"crypto-coinbase"},
      ${sql.json(pairs.map((identifier) => ({ assetClass: "crypto-coinbase", identifier })))},
      ${sql.json({ rsiThreshold: 30, maPeriod: 20, maReinforcement: false })},
      ${sql.json({ rsiThreshold: 70, minProfitPct: 1.5, sellFraction: 0.5 })},
      ${100},
      ${5},
      ${500},
      ${userId}
    )
  `;

  await sql`
    INSERT INTO bot_sessions (id, status, started_at, active_strategy_id)
    VALUES ('sess-cockpit', 'active', '2026-06-16 00:00:00+00', ${strategyId})
  `;
}

async function seedLatestSignals(heldPair: string): Promise<void> {
  await sql`
    INSERT INTO bot_ticks (id, session_id, tick_started_at, decision, reason, error_detail)
    VALUES
      ('tick-held', 'sess-cockpit', '2026-06-16 00:15:00+00', 'hold', 'held pair signal', null)
  `;
  await sql`
    INSERT INTO signals (id, tick_id, asset_identifier, decision, reason, rsi, ma, ma_period, last_close)
    VALUES
      (
        'sig-held',
        'tick-held',
        ${heldPair},
        'hold',
        'hold: rsi=61.00 < entry_threshold=30 BUT price=1792.39 >= ma20=1740.10; no buy at held pair',
        61,
        1740.1,
        20,
        1792.39
      )
  `;
}

async function seedSessionOrders(held: {
  pair: string;
  avgCostUsd: number;
}): Promise<void> {
  const paperBaseQuantity = 100 / held.avgCostUsd;
  await sql`
    INSERT INTO orders (id, asset_identifier, session_id, source, side, amount, base_quantity, status)
    VALUES
      ('order-held-1', ${held.pair}, 'sess-cockpit', 'bot', 'buy', 100, ${paperBaseQuantity}, 'dry_run'),
      ('order-held-2', ${held.pair}, 'sess-cockpit', 'bot', 'buy', 50, null, 'submitted'),
      ('order-held-failed', ${held.pair}, 'sess-cockpit', 'bot', 'buy', 999, null, 'failed'),
      ('order-degrade-1', ${DEGRADE_PAIR}, 'sess-cockpit', 'bot', 'buy', 25, null, 'dry_run'),
      ('order-degrade-2', ${DEGRADE_PAIR}, 'sess-cockpit', 'bot', 'buy', 5, null, 'submitted')
  `;
}

async function loadHeldPairFixture(): Promise<{
  pair: string;
  quantity: number;
  avgCostUsd: number;
  livePrice: number;
  unrealizedPnlUsd: number;
  realizedPnlUsd: number;
  unrealizedPct: number | null;
}> {
  for (const pair of HELD_PAIR_CANDIDATES) {
    const { fills } = await getAccountTradeHistory({ productIds: [pair], limit: 250 });
    const position = aggregatePosition(fills);
    if (position === null) continue;
    const product = await getProduct(pair);
    const livePrice = Number(product.price);
    if (!Number.isFinite(livePrice)) continue;
    const pnl = computeAssetPnl(fills, livePrice);
    const costBasis = pnl.avgCostUsd * pnl.quantity;
    return {
      pair,
      quantity: position.quantity,
      avgCostUsd: position.avgCostUsd,
      livePrice,
      unrealizedPnlUsd: pnl.unrealizedPnlUsd ?? 0,
      realizedPnlUsd: pnl.realizedPnlUsd,
      unrealizedPct:
        pnl.unrealizedPnlUsd !== null && costBasis > 0 ? pnl.unrealizedPnlUsd / costBasis : null,
    };
  }

  throw new Error(
    `cockpit e2e requires at least one held pair among ${HELD_PAIR_CANDIDATES.join(", ")}`,
  );
}

async function loadNoPositionPairFixtures(
  excludePair: string,
  count: number,
): Promise<string[]> {
  const matches: string[] = [];
  for (const pair of NO_POSITION_PAIR_CANDIDATES) {
    if (pair === excludePair) continue;
    const [{ fills }, product] = await Promise.all([
      getAccountTradeHistory({ productIds: [pair], limit: 250 }),
      getProduct(pair).catch(() => null),
    ]);
    if (!product) continue;
    const livePrice = Number(product.price);
    if (!Number.isFinite(livePrice)) continue;
    if (aggregatePosition(fills) !== null) continue;
    matches.push(pair);
    if (matches.length === count) return matches;
  }

  throw new Error(
    `cockpit e2e requires ${count} valid pair(s) with no position among ${NO_POSITION_PAIR_CANDIDATES.join(", ")}`,
  );
}

test("cockpit loads, run-now/filters/status flows work, unevaluated pair degrades, and Equity/MF show coming soon", async ({
  page,
}) => {
  const auth = await addVirtualAuthenticator(page);

  try {
    await completeSetupJourney(page);
    const held = await loadHeldPairFixture();
    const heldPaperQuantity = 100 / held.avgCostUsd;
    const noPositionPairs = await loadNoPositionPairFixtures(held.pair, 2);
    const paperBuyPair = noPositionPairs[0]!;
    const noPositionSellPair = noPositionPairs[1]!;
    await seedStrategyAndSession([held.pair, paperBuyPair, noPositionSellPair, DEGRADE_PAIR]);
    await seedLatestSignals(held.pair);
    await seedSessionOrders(held);

    await page.goto("/dashboard");

    await expect(
      page.getByRole("heading", { name: `${slashPair(held.pair)} Trading Bot` }),
    ).toBeVisible();
    await expect(page.getByLabel("Pair")).toHaveValue(held.pair);
    await expect(page.getByRole("link", { name: "📊 Mutual Funds" })).toBeVisible();
    await expect(page.getByRole("link", { name: "📈 Equity" })).toBeVisible();
    await expect(page.getByRole("link", { name: "🤖 Crypto" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await expect(page.getByText("Bot is active — running every 15 minutes.")).toBeVisible();
    await expect(page.getByText("● ACTIVE")).toBeVisible();
    await expect(page.getByText("TOTAL INVESTED")).toBeVisible();
    await expect(page.getByText("$100.00").first()).toBeVisible();
    await expect(page.getByText("1 buy this session")).toBeVisible();
    await expect(page.getByText("CURRENT VALUE")).toBeVisible();
    await expect(page.getByText("P&L unavailable")).toHaveCount(0);
    await expect(page.getByText(`${baseOf(held.pair)} HELD`)).toBeVisible();
    await expect(page.getByText(`${heldPaperQuantity} ${baseOf(held.pair)}`)).toBeVisible();
    await expect(page.getByText(`Avg cost: ${fmtUsd(held.avgCostUsd)}`)).toBeVisible();
    await expect(page.getByText("RSI: 61")).toBeVisible();
    await expect(page.getByText("SIGNALS")).toBeVisible();
    await expect(page.getByText("RSI ZONE")).toBeVisible();
    await expect(page.getByText("61.0  ·  Neutral")).toBeVisible();
    await expect(page.getByText("PRICE vs MA20")).toBeVisible();
    await expect(page.getByText("$1,792.39 > $1,740.10  ·  Above")).toBeVisible();
    await expect(page.getByText("NEXT ACTION")).toBeVisible();
    await expect(page.getByText("HOLD", { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        "hold: rsi=61.00 < entry_threshold=30 BUT price=1792.39 >= ma20=1740.10; no buy at held pair",
      ).first(),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "View decision trace →" })).toBeVisible();
    await expect(page.getByText("TRADE LOG")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Time", exact: true })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Side", exact: true })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "USD", exact: true })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Reason", exact: true })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Status", exact: true })).toBeVisible();
    const statusFilter = page.getByLabel("Status");
    await expect(statusFilter).toHaveValue("all");
    await expect(statusFilter).toContainText("All statuses");
    await expect(statusFilter).toContainText("Dry run");
    await expect(statusFilter).toContainText("Submitted");
    await expect(statusFilter).toContainText("Failed");
    await expect(statusFilter).toContainText("Skipped");

    const tradeLog = page.getByRole("table");
    await expect(tradeLog.getByText("SKIPPED")).toBeVisible();
    await expect(
      tradeLog.getByText(
        "hold: rsi=61.00 < entry_threshold=30 BUT price=1792.39 >= ma20=1740.10; no buy at held pair",
      ),
    ).toBeVisible();
    await expect(tradeLog).toContainText("buy");
    await expect(tradeLog).toContainText("$100.00");
    await expect(tradeLog).toContainText("dry_run");
    await expect(tradeLog).toContainText("$50.00");
    await expect(tradeLog).toContainText("submitted");
    await expect(tradeLog).toContainText("$999.00");
    await expect(tradeLog).toContainText("failed");
    await expect(page.getByRole("link", { name: "View transaction ledger →" })).toBeVisible();

    await expect(page.getByText("MANUAL OVERRIDES")).toBeVisible();
    await expect(page.getByText("Paper mode — orders are simulated (dry-run).")).toBeVisible();
    await expect(page.getByRole("button", { name: "Buy $100" })).toBeVisible();
    const manualOrderCountBefore = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
        FROM orders
       WHERE session_id = 'sess-cockpit'
         AND source = 'manual'
    `;
    await page.getByRole("button", { name: "Buy $100" }).click();
    await expect(page.getByText(`Simulate a $100 buy of ${slashPair(held.pair)}?`)).toBeVisible();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("Order recorded — see the trade log.")).toBeVisible();
    await expect
      .poll(async () => {
        const rows = await sql<{ count: number }[]>`
          SELECT COUNT(*)::int AS count
            FROM orders
           WHERE session_id = 'sess-cockpit'
             AND source = 'manual'
        `;
        return rows[0]?.count ?? 0;
      })
      .toBe((manualOrderCountBefore[0]?.count ?? 0) + 1);
    await expect(tradeLog).toContainText("$100.00");
    await expect(tradeLog).toContainText("dry_run");

    await page.getByLabel("Pair").selectOption(paperBuyPair);
    await expect(page).toHaveURL(
      new RegExp(`/dashboard\\?pair=${paperBuyPair.replace("-", "\\-")}(?:&txStatus=all)?$`),
    );
    await expect(
      page.getByRole("heading", { name: `${slashPair(paperBuyPair)} Trading Bot` }),
    ).toBeVisible();
    await expect(page.getByText("No position yet")).toBeVisible();
    await expect(page.getByRole("button", { name: "Buy $100" })).toBeVisible();
    await page.getByRole("button", { name: "Buy $100" }).click();
    await expect(page.getByText(`Simulate a $100 buy of ${slashPair(paperBuyPair)}?`)).toBeVisible();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("Order recorded — see the trade log.")).toBeVisible();
    const paperManualOrder = await sql<
      { amount: number; base_quantity: number }[]
    >`
      SELECT amount::float8 AS amount, base_quantity::float8 AS base_quantity
        FROM orders
       WHERE session_id = 'sess-cockpit'
         AND asset_identifier = ${paperBuyPair}
         AND source = 'manual'
         AND status = 'dry_run'
       ORDER BY created_at DESC
       LIMIT 1
    `;
    const paperLiveProduct = await getProduct(paperBuyPair);
    const paperLivePrice = Number(paperLiveProduct.price);
    expect(Number.isFinite(paperLivePrice)).toBe(true);
    const expectedPaperValue = paperManualOrder[0]!.base_quantity * paperLivePrice;
    await expect(page.getByText("Paper", { exact: true })).toHaveCount(2);
    await expect(page.getByText("1 buy this session")).toBeVisible();
    await expect(page.getByText("$100.00").first()).toBeVisible();
    await expect(page.getByText(fmtUsd(expectedPaperValue))).toBeVisible();
    await expect(page.getByText("P&L unavailable")).toHaveCount(0);
    await expect(page.getByText("No position yet")).toHaveCount(0);

    await page.getByLabel("Pair").selectOption(held.pair);
    await expect(page).toHaveURL(new RegExp(`/dashboard\\?pair=${held.pair.replace("-", "\\-")}(?:&txStatus=all)?$`));
    await expect(
      page.getByRole("heading", { name: `${slashPair(held.pair)} Trading Bot` }),
    ).toBeVisible();

    const botTickCountBefore = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
        FROM bot_ticks
       WHERE session_id = 'sess-cockpit'
    `;
    await page.getByRole("button", { name: "Run Now" }).click();
    await expect
      .poll(async () => {
        const rows = await sql<{ count: number }[]>`
          SELECT COUNT(*)::int AS count
            FROM bot_ticks
           WHERE session_id = 'sess-cockpit'
        `;
        return rows[0]?.count ?? 0;
      })
      .toBe((botTickCountBefore[0]?.count ?? 0) + 1);
    const latestSignal = await sql<
      { tick_started_at: Date; reason: string }[]
    >`
      SELECT t.tick_started_at, s.reason
        FROM signals s
        JOIN bot_ticks t ON t.id = s.tick_id
       WHERE t.session_id = 'sess-cockpit'
         AND s.asset_identifier = ${held.pair}
       ORDER BY t.tick_started_at DESC
       LIMIT 1
    `;
    await expect(page.getByText(latestSignal[0]!.reason).first()).toBeVisible();
    await expect(page.getByText(fmtTs(latestSignal[0]!.tick_started_at))).toBeVisible();

    await page.getByLabel("Status").selectOption("skipped");
    await expect(page).toHaveURL(new RegExp(`/dashboard\\?pair=${held.pair}&txStatus=skipped$`));
    await expect(page.getByLabel("Status")).toHaveValue("skipped");
    const skippedLog = page.getByRole("table");
    await expect(skippedLog.getByText("SKIPPED")).toBeVisible();
    await expect(
      skippedLog.getByText(
        "hold: rsi=61.00 < entry_threshold=30 BUT price=1792.39 >= ma20=1740.10; no buy at held pair",
      ),
    ).toBeVisible();
    await expect(skippedLog.getByText("dry_run")).toHaveCount(0);
    await expect(skippedLog.getByText("submitted")).toHaveCount(0);
    await expect(skippedLog.getByText("failed")).toHaveCount(0);

    await page.getByLabel("Status").selectOption("failed");
    await expect(page).toHaveURL(new RegExp(`/dashboard\\?pair=${held.pair}&txStatus=failed$`));
    await expect(page.getByLabel("Status")).toHaveValue("failed");
    const failedLog = page.getByRole("table");
    await expect(failedLog.getByText("failed")).toBeVisible();
    await expect(failedLog.getByText("$999.00")).toBeVisible();
    await expect(failedLog.getByText("SKIPPED")).toHaveCount(0);
    await expect(failedLog.getByText("dry_run")).toHaveCount(0);
    await expect(failedLog.getByText("submitted")).toHaveCount(0);

    await page.getByLabel("Status").selectOption("all");
    await expect(page.getByLabel("Status")).toHaveValue("all");

    await page.getByRole("button", { name: "Pause" }).click();
    await expect(page.getByText("Bot is stopped — click Start to resume")).toBeVisible();
    await expect(page.getByText("⏸ STOPPED")).toBeVisible();
    await expect(page.getByText("stopped by user")).toBeVisible();
    const pausedRunTickCount = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
        FROM bot_ticks
       WHERE session_id = 'sess-cockpit'
    `;
    await page.getByRole("button", { name: "Run Now" }).click();
    await expect(page.getByText("Bot is paused — resume to run.")).toBeVisible();
    const pausedRunTickCountAfter = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
        FROM bot_ticks
       WHERE session_id = 'sess-cockpit'
    `;
    expect(pausedRunTickCountAfter[0]?.count).toBe(pausedRunTickCount[0]?.count);

    await page.getByLabel("Pair").selectOption(noPositionSellPair);
    await expect(page).toHaveURL(
      new RegExp(`/dashboard\\?pair=${noPositionSellPair.replace("-", "\\-")}(?:&txStatus=all)?$`),
    );
    await expect(
      page.getByRole("heading", { name: `${slashPair(noPositionSellPair)} Trading Bot` }),
    ).toBeVisible();
    await expect(page.getByText("No position yet")).toBeVisible();
    await page.getByRole("button", { name: "Sell All" }).click();
    await expect(
      page.getByText(`Simulate selling your entire ${slashPair(noPositionSellPair)} position?`),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("No position to sell.")).toBeVisible();

    await page.getByLabel("Pair").selectOption(DEGRADE_PAIR);
    await expect(page).toHaveURL(/\/dashboard\?pair=FAKE-USD$/);
    await expect(page.getByRole("heading", { name: "FAKE/USD Trading Bot" })).toBeVisible();
    await expect(page.getByText("TOTAL INVESTED")).toBeVisible();
    await expect(page.getByText("$25.00").first()).toBeVisible();
    await expect(page.getByText("1 buy this session")).toBeVisible();
    await expect(page.getByText("CURRENT VALUE")).toBeVisible();
    await expect(page.getByText("P&L unavailable")).toBeVisible();
    await expect(page.getByText("FAKE HELD")).toBeVisible();
    await expect(page.getByText("No position yet")).toBeVisible();
    await expect(page.getByText("Live price unavailable")).toBeVisible();
    await expect(page.getByText("RSI: —")).toBeVisible();
    await expect(
      page.getByText("No signals yet — the bot hasn't evaluated this pair yet."),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "View decision trace →" })).toBeVisible();

    await page.getByRole("link", { name: "📈 Equity" }).click();
    await expect(page).toHaveURL(/\/dashboard\/equity$/);
    await expect(page.getByText("Equity trading is coming soon.")).toBeVisible();
    await expect(page.getByRole("link", { name: "← Back to Crypto" })).toBeVisible();

    await page.getByRole("link", { name: "📊 Mutual Funds" }).click();
    await expect(page).toHaveURL(/\/dashboard\/mutual-funds$/);
    await expect(page.getByText("Mutual funds are coming soon.")).toBeVisible();
    await expect(page.getByRole("link", { name: "← Back to Crypto" })).toBeVisible();
  } finally {
    await auth.remove();
  }
});

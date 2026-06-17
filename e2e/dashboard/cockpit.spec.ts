// CB-6.0/CB-6.1 cockpit e2e:
//   - load → status → Pause→STOPPED → Start→ACTIVE
//   - per-pair selector + Current Position happy path (held qty + avg cost +
//     live price + latest RSI) using the operator's REAL Coinbase reads
//   - degraded pair path (fake pair → no position + live-price-unavailable)
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
import { getProduct } from "@/lib/coinbase/market";
import { aggregatePosition } from "@/lib/ticks/cost-basis";

import { addVirtualAuthenticator, completeSetupJourney, getSql, resetAllTables } from "../helpers";

const sql = getSql();
const DEGRADE_PAIR = "FAKE-USD";
const HELD_PAIR_CANDIDATES = ["BTC-USD", "ETH-USD", "SOL-USD", "XRP-USD", "ZEC-USD"] as const;

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
      ('tick-held', 'sess-cockpit', '2026-06-16 00:15:00+00', 'hold', 'held pair signal', null),
      ('tick-degrade', 'sess-cockpit', '2026-06-16 00:30:00+00', 'hold', 'degraded pair signal', null)
  `;
  await sql`
    INSERT INTO signals (id, tick_id, asset_identifier, decision, reason, rsi, ma, ma_period, last_close)
    VALUES
      ('sig-held', 'tick-held', ${heldPair}, 'hold', 'held pair latest rsi', 61, null, 20, null),
      ('sig-degrade', 'tick-degrade', ${DEGRADE_PAIR}, 'hold', 'degraded pair latest rsi', 47, null, 20, null)
  `;
}

async function loadHeldPairFixture(): Promise<{
  pair: string;
  quantity: number;
  avgCostUsd: number;
  livePrice: number;
}> {
  for (const pair of HELD_PAIR_CANDIDATES) {
    const { fills } = await getAccountTradeHistory({ productIds: [pair], limit: 250 });
    const position = aggregatePosition(fills);
    if (position === null) continue;
    const product = await getProduct(pair);
    const livePrice = Number(product.price);
    if (!Number.isFinite(livePrice)) continue;
    return {
      pair,
      quantity: position.quantity,
      avgCostUsd: position.avgCostUsd,
      livePrice,
    };
  }

  throw new Error(
    `cockpit e2e requires at least one held pair among ${HELD_PAIR_CANDIDATES.join(", ")}`,
  );
}

test("cockpit loads, status toggles, pair view updates, degraded pair degrades, and Equity/MF show coming soon", async ({
  page,
}) => {
  const auth = await addVirtualAuthenticator(page);

  try {
    await completeSetupJourney(page);
    const held = await loadHeldPairFixture();
    await seedStrategyAndSession([held.pair, DEGRADE_PAIR]);
    await seedLatestSignals(held.pair);

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
    await expect(page.getByText(`${baseOf(held.pair)} HELD`)).toBeVisible();
    await expect(page.getByText(`${held.quantity} ${baseOf(held.pair)}`)).toBeVisible();
    await expect(page.getByText(`Avg cost: ${fmtUsd(held.avgCostUsd)}`)).toBeVisible();
    await expect(page.getByText(fmtUsd(held.livePrice))).toBeVisible();
    await expect(page.getByText("RSI: 61")).toBeVisible();

    await page.getByRole("button", { name: "Pause" }).click();
    await expect(page.getByText("Bot is stopped — click Start to resume")).toBeVisible();
    await expect(page.getByText("⏸ STOPPED")).toBeVisible();
    await expect(page.getByText("stopped by user")).toBeVisible();

    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.getByText("Bot is active — running every 15 minutes.")).toBeVisible();
    await expect(page.getByText("● ACTIVE")).toBeVisible();

    await page.getByLabel("Pair").selectOption(DEGRADE_PAIR);
    await expect(page).toHaveURL(/\/dashboard\?pair=FAKE-USD$/);
    await expect(page.getByRole("heading", { name: "FAKE/USD Trading Bot" })).toBeVisible();
    await expect(page.getByText("FAKE HELD")).toBeVisible();
    await expect(page.getByText("No position yet")).toBeVisible();
    await expect(page.getByText("Live price unavailable")).toBeVisible();
    await expect(page.getByText("RSI: 47")).toBeVisible();

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

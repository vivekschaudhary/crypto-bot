// CB-3.3 AC 13 — Playwright e2e against /dashboard/strategy.
//
// Two specs:
//   1. Happy path — register passkey → /dashboard/strategy → top-5 pre-fill
//      → fill rules → submit → success banner → revisit → form pre-fills
//      with the saved values (revise mode)
//   2. Supersession — save twice with different rules; assert the DB has
//      two strategy rows + the first's `superseded_by_strategy_id` points
//      at the second + `bot_sessions.active_strategy_id` points at the
//      second
//
// PATTERN: mirrors `e2e/auth/onboarding.spec.ts` (CB-1.6) — postgres
// direct cleanup, virtual-authenticator via CDP, serial mode, env loading
// via .env.local fallback.
//
// HISTORICAL NOTE (round-1 BLOCKER 1 closure): per
// `compass/workflows/build.md` Phase 3, the canonical role split is Codex
// writes E2E. Codex's PR #49 round-1 review flagged this absence as a
// BLOCKER on Engineer's PR. Engineer is shipping the specs to unblock the
// merge; the procedural question (who writes the e2e) is documented for
// the next `/retro` cycle. Pattern precedent: `playwright.config.ts:2`
// already says "Engineer drafts the harness; Codex fills in the E2E
// specs" — there's room in the spec for either side to commit.

import {
  expect,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import { getTestSql } from "../test-db";

// Fail-closed against prod: getTestSql() uses TEST_DATABASE_URL and throws if
// it is unset or equals DATABASE_URL (see e2e/test-db.ts; 2026-06-15 incident).
const sql = getTestSql();

test.describe.configure({ mode: "serial" });

async function resetAllTables(): Promise<void> {
  // Strategies + bot_sessions cascade through auth_users (strategies.created_
  // by_user_id FK → auth_users.id) so TRUNCATE auth_users CASCADE clears
  // them all. Explicit list to make the intent obvious + survive future
  // FK additions.
  await sql`TRUNCATE bot_sessions, strategies, auth_sessions, auth_credentials, auth_users RESTART IDENTITY CASCADE`;
}

interface StrategyRow {
  id: string;
  name: string;
  position_size_usd: string;
  superseded_by_strategy_id: string | null;
}

async function strategyRows(): Promise<StrategyRow[]> {
  return (await sql<StrategyRow[]>`
    SELECT id, name, position_size_usd::text AS position_size_usd, superseded_by_strategy_id
      FROM strategies
     ORDER BY created_at ASC
  `) as StrategyRow[];
}

interface BotSessionRow {
  id: string;
  active_strategy_id: string | null;
}

async function botSessionRows(): Promise<BotSessionRow[]> {
  return (await sql<BotSessionRow[]>`
    SELECT id, active_strategy_id FROM bot_sessions
  `) as BotSessionRow[];
}

async function addVirtualAuthenticator(page: Page): Promise<{
  authenticatorId: string;
  remove: () => Promise<void>;
}> {
  const cdpSession = await page.context().newCDPSession(page);
  await cdpSession.send("WebAuthn.enable");
  const { authenticatorId } = await cdpSession.send(
    "WebAuthn.addVirtualAuthenticator",
    {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    },
  );

  return {
    authenticatorId,
    remove: async () => {
      try {
        await cdpSession.send("WebAuthn.removeVirtualAuthenticator", {
          authenticatorId,
        });
      } catch {
        // best-effort cleanup
      }
    },
  };
}

/**
 * Drives the operator through the CB-1.6 setup journey: navigate to /,
 * click setup link, click register, end at /dashboard. After this returns
 * the operator is authenticated (an auth_users row + session cookie).
 */
async function completeSetupJourney(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("link", { name: "Set up your passkey" }).click();
  await expect(page).toHaveURL(/\/setup$/);
  await page.getByRole("button", { name: "Register passkey" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Crypto Trading Bot" })).toBeVisible();
}

/**
 * Fill the strategy form's rule + cap fields to known values. The Name
 * field is required. Asset selection is left as the top-5 pre-fill.
 */
async function fillStrategyForm(
  page: Page,
  args: {
    name: string;
    entryRsi: string;
    exitRsi: string;
    positionSizeUsd: string;
    perSessionBuyCountCap: string;
    perSessionDollarCap: string;
  },
): Promise<void> {
  await page.locator("#strategy-name").fill(args.name);
  await page.locator("#entry-rsi").fill(args.entryRsi);
  await page.locator("#exit-rsi").fill(args.exitRsi);
  await page.locator("#position-size").fill(args.positionSizeUsd);
  await page.locator("#buy-count-cap").fill(args.perSessionBuyCountCap);
  await page.locator("#dollar-cap").fill(args.perSessionDollarCap);
}

test.beforeEach(async () => {
  await resetAllTables();
});

test.afterEach(async () => {
  await resetAllTables();
});

test.afterAll(async () => {
  await sql.end({ timeout: 5 });
});

test("CB-3.3 AC 13 Spec 1 — happy path: author strategy, persist, revisit shows revise mode", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const authenticator = await addVirtualAuthenticator(page);

  try {
    await completeSetupJourney(page);

    // Navigate to /dashboard/strategy via the link on /dashboard.
    await page
      .getByRole("link", { name: "Create or revise your DCA strategy" })
      .click();
    await expect(page).toHaveURL(/\/dashboard\/strategy$/);

    // Browser title (per copy.md § Page-level) discriminates create mode.
    await expect(page).toHaveTitle("Create your strategy · DCA bot");

    // H1 is "Create your strategy" for first-time authoring.
    await expect(
      page.getByRole("heading", { name: "Create your strategy" }),
    ).toBeVisible();

    // Asset selector pre-fill: the top-5 from makeCoinbaseAdapter is server-
    // rendered; assert the form shows 5 chips. We check via the Remove
    // buttons (one per chip).
    const removeButtons = page.getByRole("button", { name: /^Remove / });
    await expect(removeButtons).toHaveCount(5, { timeout: 30_000 });

    // Fill in the form (override defaults).
    await fillStrategyForm(page, {
      name: "Conservative DCA",
      entryRsi: "25",
      exitRsi: "75",
      positionSizeUsd: "100",
      perSessionBuyCountCap: "5",
      perSessionDollarCap: "500",
    });

    // Submit.
    await page.getByRole("button", { name: "Save strategy" }).click();

    // Server action redirects to /dashboard?strategy=saved.
    await expect(page).toHaveURL(/\/dashboard\?strategy=saved$/);
    await expect(
      page.getByText("Strategy saved. Bot will pick it up on the next tick."),
    ).toBeVisible();

    // DB shape after the save: 1 strategy row + 1 bot_session row.
    const strategies = await strategyRows();
    expect(strategies).toHaveLength(1);
    expect(strategies[0]?.name).toBe("Conservative DCA");
    expect(strategies[0]?.superseded_by_strategy_id).toBeNull();

    const sessions = await botSessionRows();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.active_strategy_id).toBe(strategies[0]?.id);

    // Revisit /dashboard/strategy — should now be in revise mode.
    await page.goto("/dashboard/strategy");
    // Browser title (per copy.md § Page-level) flips to revise mode.
    await expect(page).toHaveTitle("Revise your strategy · DCA bot");
    await expect(
      page.getByRole("heading", { name: "Revise your strategy" }),
    ).toBeVisible();
    // Name field carries the previously-saved value.
    await expect(page.locator("#strategy-name")).toHaveValue("Conservative DCA");
    // Rule fields carry the previously-saved values.
    await expect(page.locator("#entry-rsi")).toHaveValue("25");
    await expect(page.locator("#exit-rsi")).toHaveValue("75");
    await expect(page.locator("#position-size")).toHaveValue("100");
  } finally {
    await authenticator.remove();
  }
});

test("CB-3.3 AC 13 Spec 2 — supersession: revising creates a new row + sets superseded_by_strategy_id", async ({
  page,
}: {
  page: Page;
  context: BrowserContext;
}) => {
  test.setTimeout(180_000);
  const authenticator = await addVirtualAuthenticator(page);

  try {
    await completeSetupJourney(page);

    // First save.
    await page.goto("/dashboard/strategy");
    const removeButtons = page.getByRole("button", { name: /^Remove / });
    await expect(removeButtons).toHaveCount(5, { timeout: 30_000 });
    await fillStrategyForm(page, {
      name: "First Version",
      entryRsi: "30",
      exitRsi: "70",
      positionSizeUsd: "50",
      perSessionBuyCountCap: "10",
      perSessionDollarCap: "500",
    });
    await page.getByRole("button", { name: "Save strategy" }).click();
    await expect(page).toHaveURL(/\/dashboard\?strategy=saved$/);

    // Second save (revision). The form is now in revise mode + submit
    // routes through the destructive-confirm modal.
    await page.goto("/dashboard/strategy");
    await expect(
      page.getByRole("heading", { name: "Revise your strategy" }),
    ).toBeVisible();
    await fillStrategyForm(page, {
      name: "Second Version",
      entryRsi: "20",
      exitRsi: "80",
      positionSizeUsd: "75",
      perSessionBuyCountCap: "8",
      perSessionDollarCap: "600",
    });
    await page.getByRole("button", { name: "Save revision" }).click();

    // Confirmation modal — click Continue.
    await expect(
      page.getByRole("heading", { name: "Revise strategy?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/dashboard\?strategy=saved$/);

    // DB shape after supersession:
    //   * 2 strategies rows (ordered by created_at ASC)
    //   * rows[0] has superseded_by_strategy_id = rows[1].id
    //   * rows[1] has superseded_by_strategy_id = null
    //   * bot_sessions.active_strategy_id = rows[1].id
    const strategies = await strategyRows();
    expect(strategies).toHaveLength(2);
    expect(strategies[0]?.name).toBe("First Version");
    expect(strategies[1]?.name).toBe("Second Version");
    expect(strategies[0]?.superseded_by_strategy_id).toBe(strategies[1]?.id);
    expect(strategies[1]?.superseded_by_strategy_id).toBeNull();

    const sessions = await botSessionRows();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.active_strategy_id).toBe(strategies[1]?.id);
  } finally {
    await authenticator.remove();
  }
});

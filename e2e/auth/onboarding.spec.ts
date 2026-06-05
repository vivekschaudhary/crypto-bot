import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

function loadEnvValue(key: string): string | undefined {
  if (process.env[key]) return process.env[key];

  for (const filename of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), filename);
    if (!existsSync(path)) continue;

    const line = readFileSync(path, "utf8")
      .split(/\r?\n/)
      .find((entry) => entry.startsWith(`${key}=`));

    if (!line) continue;

    const rawValue = line.slice(key.length + 1).trim();
    if (!rawValue) continue;

    if (
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
    ) {
      return rawValue.slice(1, -1);
    }

    return rawValue;
  }

  return undefined;
}

const DATABASE_URL = loadEnvValue("DATABASE_URL");

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required for e2e/auth/onboarding.spec.ts");
}

const sql = postgres(DATABASE_URL, {
  prepare: false,
  idle_timeout: 20,
  max: 1,
});

test.describe.configure({ mode: "serial" });

async function resetAuthTables(): Promise<void> {
  await sql`TRUNCATE auth_sessions, auth_credentials, auth_users RESTART IDENTITY CASCADE`;
}

async function deleteAuthSessions(): Promise<void> {
  await sql`DELETE FROM auth_sessions`;
}

async function authRowCounts(): Promise<{ users: number; credentials: number; sessions: number }> {
  const [users] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM auth_users`;
  const [credentials] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM auth_credentials`;
  const [sessions] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM auth_sessions`;

  return {
    users: users?.count ?? 0,
    credentials: credentials?.count ?? 0,
    sessions: sessions?.count ?? 0,
  };
}

async function addVirtualAuthenticator(page: Page): Promise<{
  authenticatorId: string;
  remove: () => Promise<void>;
}> {
  const cdpSession = await page.context().newCDPSession(page);
  await cdpSession.send("WebAuthn.enable");
  const { authenticatorId } = await cdpSession.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  return {
    authenticatorId,
    remove: async () => {
      try {
        await cdpSession.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
      } catch {
        // If the page/context is already gone (for example after a timeout),
        // cleanup is best-effort only.
      }
    },
  };
}

async function completeSetupJourney(page: Page): Promise<number> {
  const startedAt = Date.now();

  await page.goto("/");
  await expect(page.getByText("This instance hasn't been set up yet.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Set up your passkey" })).toBeVisible();

  await page.getByRole("link", { name: "Set up your passkey" }).click();
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByText("Register your passkey to control this instance.")).toBeVisible();

  await page.getByRole("button", { name: "Register passkey" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Signed in.")).toBeVisible();
  await expect(page.getByText("Connected device:")).toBeVisible();

  return Date.now() - startedAt;
}

async function seedRegisteredCredential(page: Page, context: BrowserContext): Promise<void> {
  await completeSetupJourney(page);
  await expect.poll(authRowCounts).toEqual({
    users: 1,
    credentials: 1,
    sessions: 1,
  });

  await deleteAuthSessions();
  await context.clearCookies();
  await expect.poll(authRowCounts).toEqual({
    users: 1,
    credentials: 1,
    sessions: 0,
  });
}

async function completeSignInJourney(page: Page): Promise<void> {
  await expect(page.getByText("Welcome back. Use your passkey to continue.")).toBeVisible();
  await page.getByRole("button", { name: "Sign in with passkey" }).click();
}

test.beforeEach(async () => {
  await resetAuthTables();
});

test.afterEach(async () => {
  await resetAuthTables();
});

test.afterAll(async () => {
  await sql.end({ timeout: 5 });
});

test("CB-1.6 AC 8: fresh-instance journey reaches /dashboard in under 5 minutes", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  const authenticator = await addVirtualAuthenticator(page);

  try {
    const elapsedMs = await completeSetupJourney(page);

    expect(elapsedMs).toBeLessThan(5 * 60 * 1000);
    await expect.poll(authRowCounts).toEqual({
      users: 1,
      credentials: 1,
      sessions: 1,
    });
  } finally {
    await authenticator.remove();
  }
});

test("CB-1.6 AC 8: returning operator journey lands on /sign-in then /dashboard", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  const authenticator = await addVirtualAuthenticator(page);

  try {
    await seedRegisteredCredential(page, context);

    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();

    await page.getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);

    await completeSignInJourney(page);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("Signed in.")).toBeVisible();
    await expect.poll(authRowCounts).toEqual({
      users: 1,
      credentials: 1,
      sessions: 1,
    });
  } finally {
    await authenticator.remove();
  }
});

test("CB-1.6 AC 8: deep-link preservation returns the operator to the original next target", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  const authenticator = await addVirtualAuthenticator(page);

  try {
    await seedRegisteredCredential(page, context);

    await page.goto("/dashboard/somewhere", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fdashboard%2Fsomewhere$/);

    await completeSignInJourney(page);
    await expect(page).toHaveURL(/\/dashboard\/somewhere$/);
    expect(page.url()).toMatch(/\/dashboard\/somewhere$/);
  } finally {
    await authenticator.remove();
  }
});

test("CB-1.6 AC 8: malicious ?next payload is dropped and falls back to /dashboard", async ({
  context,
  page,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const authenticator = await addVirtualAuthenticator(page);

  try {
    await seedRegisteredCredential(page, context);

    await page.goto("/sign-in?next=//evil.example");
    await expect(page).toHaveURL(/\/sign-in\?next=\/\/evil\.example$/);

    await completeSignInJourney(page);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("Signed in.")).toBeVisible();

    const currentUrl = new URL(page.url());
    if (baseURL) {
      expect(currentUrl.origin).toBe(new URL(baseURL).origin);
    }
    expect(currentUrl.pathname).toBe("/dashboard");
  } finally {
    await authenticator.remove();
  }
});

test("CB-1.6 AC 8: sign-out round trip returns to State B and re-protects /dashboard", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  const authenticator = await addVirtualAuthenticator(page);

  try {
    await seedRegisteredCredential(page, context);

    await page.goto("/");
    await page.getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);

    await completeSignInJourney(page);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("Signed in.")).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fdashboard$/);
    await expect(page.getByText("Welcome back. Use your passkey to continue.")).toBeVisible();
  } finally {
    await authenticator.remove();
  }
});

# E2E Tests

End-to-end tests run by Playwright. **Owned by Codex** per Compass tool-division
(`AGENTS.md` — Codex writes E2E / automation; Engineer writes unit + integration
tests).

## ⚠️ e2e is FAIL-CLOSED against production (read first)

Every spec `TRUNCATE`s tables in setup, so e2e runs **only** against a
dedicated, disposable database. e2e reads **`TEST_DATABASE_URL`** (never
`DATABASE_URL`) via `e2e/test-db.ts`, and **throws — running nothing —** if
`TEST_DATABASE_URL` is unset or equals `DATABASE_URL`. The Playwright
webServers are also booted with `DATABASE_URL=$TEST_DATABASE_URL`, so the
app-under-test uses the test DB too.

**Why:** on 2026-06-15 a local `pnpm e2e` resolved its DB from the prod
`DATABASE_URL` (`.env.local`) and wiped production — operator passkey, DCA
strategy, and all bot history. Never point `TEST_DATABASE_URL` at prod.

### One-time setup (local Docker Postgres — recommended)

```bash
# 1. Start a disposable Postgres on :5433
docker run --name crypto-e2e-db -e POSTGRES_PASSWORD=postgres -p 5433:5432 -d postgres:16

# 2. Point e2e at it (add to .env.local):
#    TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5433/postgres"

# 3. Apply the schema (the migrate runner is the source of truth):
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/postgres" \
  MIGRATE_DESTINATION=production pnpm db:migrate
```

Re-run step 3 whenever a new migration lands so the test DB matches prod.

## Run

```bash
pnpm e2e          # one-shot run against the test DB (TEST_DATABASE_URL required)
pnpm e2e:ui       # interactive runner
```

Set `PLAYWRIGHT_BASE_URL=https://...` to run against a deployed preview/canary.

`PLAYWRIGHT_SKIP_WEB_SERVER=1` (use an already-running server) is **fail-closed
too**: Playwright can't control that server's `DATABASE_URL`, so this mode
additionally requires `PLAYWRIGHT_EXTERNAL_DB_OK=1` — an explicit confirmation
that you started the server against the test DB (`DATABASE_URL=$TEST_DATABASE_URL
pnpm dev`). Without it, e2e refuses to run. **Never** point e2e at a server
backed by the production database — its specs `TRUNCATE` and its app writes.

## First test to land

`e2e/auth/register.spec.ts` — passkey registration ceremony per CB-1.2 AC 8.

Use Playwright's virtual-authenticator API:

```ts
const cdpSession = await page.context().newCDPSession(page);
await cdpSession.send("WebAuthn.enable");
const { authenticatorId } = await cdpSession.send("WebAuthn.addVirtualAuthenticator", {
  options: {
    protocol: "ctap2",
    transport: "internal",
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true,
  },
});
```

Then drive the registration flow (UI lands in CB-1.6 — for CB-1.2 the spec
hits the endpoints directly OR uses a thin test harness page that calls
`navigator.credentials.create()`).

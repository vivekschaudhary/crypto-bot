# E2E Tests

End-to-end tests run by Playwright. **Owned by Codex** per Compass tool-division
(`AGENTS.md` — Codex writes E2E / automation; Engineer writes unit + integration
tests).

## 🚧 Known limitation: the suite is not yet runnable on Next 16

The config boots **two** dev servers (default + a LIVE_MODE=true one for the
banner spec), but Next 16 enforces a **single `next dev` instance per project
dir** ("Another next dev server is already running"), so the second server can't
start. The suite has effectively been non-runnable on Next 16. **Deferred fix
(operator decision 2026-06-15):** switch the webServers to a production build +
two `next start` instances (no dev lock — and it would run e2e against the real
prod build, catching prod-only bugs like the PR #77 RSC-500 that dev masked), or
split into two sequential single-server runs. Until then, what IS shipped is the
**safety** posture below (fail-closed DB + no prod-server reuse) — and the suite
IS runnable today via the single-server external-mode recipe (see
[Runnable today](#-runnable-today-single-server-external-mode-80-workaround)),
which sidesteps the two-instance lock by running ONE server you start yourself.

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

## ✅ Runnable today: single-server external mode (#80 workaround)

`pnpm e2e` is blocked by the two-`next dev` lock above, but you can run any spec
**now** by starting ONE server yourself and pointing Playwright at it. This was
exercised end-to-end on 2026-06-19 (the full CB-6 cockpit spec, green) and prod
was verified untouched. Works for every non-`*.live.spec.ts` spec (the
`chromium` project; the LIVE-banner spec still needs the deferred two-server fix).

```bash
TEST="postgresql://postgres:postgres@localhost:5433/postgres"   # = TEST_DATABASE_URL

# 1. Test DB up (one-time setup above) + schema current (re-run after any migration):
docker start crypto-e2e-db
DATABASE_URL="$TEST" MIGRATE_DESTINATION=production pnpm db:migrate

# 2. Cold caches — getCredentialCount() is unstable_cache and PERSISTS in
#    .next/cache across dev restarts; a stale non-zero count makes the landing
#    page show "Sign in" instead of "Set up your passkey" and the setup journey
#    hangs. A raw TRUNCATE does NOT invalidate it. Clear it before each run:
rm -rf .next/cache

# 3. Start ONE dev server on the TEST DB (your explicit DATABASE_URL wins over
#    .env.local — Next does not override an already-set process.env var):
DATABASE_URL="$TEST" APP_ORIGIN="http://localhost:3200" LIVE_MODE=false \
  pnpm dev --port 3200 &
#    Wait for readiness by probing a STATIC asset, NOT "/" (probing "/" renders
#    the landing page and caches the credential count before your test truncates):
curl --retry 60 --retry-delay 2 --retry-connrefused -so /dev/null http://localhost:3200/favicon.ico

# 4. Run the spec. node --env-file loads .env.local into the SPEC process (it
#    needs COINBASE_*/SESSION_SIGNING_SECRET for the real-Coinbase fixtures);
#    invoke the JS CLI directly (node_modules/.bin/playwright is a shell wrapper,
#    not runnable via `node`). TEST_DATABASE_URL from .env.local keeps DB ops
#    fail-closed on the test DB regardless of the loaded prod DATABASE_URL.
PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_EXTERNAL_DB_OK=1 \
  node --env-file-if-exists=.env.local node_modules/@playwright/test/cli.js \
  test e2e/dashboard/cockpit.spec.ts --project=chromium --timeout=90000
```

Gotchas this recipe encodes (each cost a failed run): (a) the spec process needs
the full `.env.local`, not just `TEST_DATABASE_URL`; (b) `.next/cache` must be
cold or the cached credential count breaks the setup journey; (c) probe a static
asset for readiness, never `/`; (d) call `@playwright/test/cli.js`, not the
`.bin` wrapper. The proper fix (two `next start` instances) remains tracked in
issue #80.

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

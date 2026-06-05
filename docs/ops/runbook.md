---
id: OPS-RUNBOOK
type: runbook
version: 1
status: active
created: 2026-05-29
owner: operator
---

# Crypto DCA Bot — Operator Runbook

Setup + operations procedures for the single operator. Companion to `docs/foundation/architecture.md`.

## Initial setup (first deploy)

### 1. Local install

```bash
pnpm install
pnpm typecheck
pnpm test
```

### 2. Create Supabase project (DB only — Auth/RLS NOT used)

1. Sign in to <https://supabase.com> (existing account)
2. **New project** → name it `crypto-app`; pick a region close to you; set a strong DB password
3. Wait for provisioning (~1-2 min)
4. **Project Settings → Database → Connection pooling** → copy the **Transaction mode** pooler URI (port 6543)
   - This is what goes into `DATABASE_URL`
5. The pooler URI contains your password. Keep it in Vercel env only — never commit.

### 3. Generate auth secrets

```bash
# Session signing key (≥ 32 chars)
openssl rand -base64 48

# Recovery code pepper (≥ 32 chars)
openssl rand -base64 32

# Cron secret
openssl rand -base64 32
```

### 4. Coinbase API key (CDP — Trade-only)

The Coinbase Advanced Trade API uses Coinbase Developer Platform (CDP) credentials with JWT (ES256) signing. **Not** the legacy Coinbase Pro `API_KEY` + `API_SECRET` + HMAC pattern.

1. Visit <https://portal.cdp.coinbase.com/> (CDP portal) → sign in with your Coinbase account
2. **API keys** → **Create API key**
3. Give it a name (e.g., `crypto-app-prod`)
4. **Permissions:** select **Trade** only. **DO NOT** select Withdraw, Transfer, or any other scope.
5. Download the JSON credentials file when shown. **You can't download it again** — Coinbase only shows the private key once.
6. The JSON contains two fields:
   - `name` — looks like `organizations/<org-id>/apiKeys/<key-id>` → maps to `COINBASE_API_KEY_NAME`
   - `privateKey` — a multi-line EC PEM (`-----BEGIN EC PRIVATE KEY-----...`) → maps to `COINBASE_API_PRIVATE_KEY`
7. Store the JSON file offline (password manager) in case you need to re-seed env vars later.

### 5. Create the Vercel project

```bash
npx vercel link    # link this repo to a new Vercel project (Pro tier required for */15 cron)
npx vercel         # initial preview deploy (will fail without env vars — expected)
```

Or via dashboard: <https://vercel.com/new> → import from Git.

### 6. Seed Vercel environment variables

In Vercel dashboard → Project → Settings → Environment Variables, add (set scope to Production + Preview + Development as appropriate):

| Variable | Value | Notes |
|---|---|---|
| `COINBASE_API_KEY_NAME` | `name` field from CDP JSON (step 4) | encrypted at rest |
| `COINBASE_API_PRIVATE_KEY` | `privateKey` field from CDP JSON (step 4) | encrypted at rest; multi-line PEM — Vercel preserves newlines; env loader normalizes `\n` if escaped |
| `LIVE_MODE` | `false` | **never set to `true` until the bot has been observed in dry-run for ≥ 30 sessions** |
| `SESSION_SIGNING_SECRET` | from step 3 | rotation = forced reauth |
| `RECOVERY_CODE_PEPPER` | from step 3 | rotation regenerates recovery code |
| `CRON_SECRET` | from step 3 | Vercel auto-injects on cron invocations |
| `DATABASE_URL` | from step 2 | Supabase transaction-mode pooler URI |
| `APP_ORIGIN` | `https://<your-app>.vercel.app` | needed for WebAuthn RP + CSRF check |

Or via CLI:

```bash
vercel env add COINBASE_API_KEY_NAME production
vercel env add COINBASE_API_PRIVATE_KEY production
# When prompted for COINBASE_API_PRIVATE_KEY value, paste the entire PEM
# including the BEGIN/END lines. Vercel CLI accepts multi-line input.
# ...etc
```

### 7. Apply database migrations

Locally (one-time after env is set in `.env.local`):

```bash
pnpm db:migrate
```

Or via Supabase SQL Editor → paste `db/migrations/0001-init.sql` → Run.

### 8. Deploy + verify canary

```bash
git push origin main   # triggers Vercel deploy
```

Then verify (replace `<URL>`):

```bash
# Landing page returns 200
curl -I https://<URL>/

# Cron endpoint returns 401 without auth, 200 with CRON_SECRET
curl https://<URL>/api/cron/tick
curl https://<URL>/api/cron/tick -H "Authorization: Bearer <CRON_SECRET>"
# Expected: { ok: true, tickedAt: "...", fromVercelCron: false, liveMode: false }

# Wait until the next */15 boundary (e.g., 14:30) and check Vercel logs for an actual cron invocation
```

When all three checks pass, share the deployment URL — it gets recorded in `compass/config.yaml` `ci_cd.canary_artifacts[]` as the foundational web canary per Phase B Verification.

## Passkey initial-setup ceremony

To be implemented by `/build` story tickets; UX must:

1. Show a clear "this is your first device — register your passkey now"
2. After registration succeeds, **prompt to register a second device** ("Add another device now so you can't get locked out") — operator can dismiss but the UI must surface the recommendation explicitly
3. After ≥ 1 passkey exists, **generate one offline backup recovery code** — display it exactly once with a "I've stored this safely" confirmation gate before closing the dialog
4. Hash the code with Argon2id + `RECOVERY_CODE_PEPPER` and store in `auth_recovery_codes`

Per `architecture.md` § Foundational Identity & Access Posture / Recovery posture.

## Rotation procedures

### Coinbase API key (quarterly)

1. CDP portal → create a new Trade-only API key; download the JSON
2. Vercel env: update `COINBASE_API_KEY_NAME` and `COINBASE_API_PRIVATE_KEY` from the new JSON
3. Vercel: redeploy (env changes don't auto-rebuild)
4. CDP portal: delete the old key after 24h grace

### `SESSION_SIGNING_SECRET` (quarterly)

1. Generate new value: `openssl rand -base64 48`
2. Vercel env: update `SESSION_SIGNING_SECRET`
3. Redeploy
4. **All existing sessions invalidate** — operator re-authenticates with passkey

### `RECOVERY_CODE_PEPPER` (on suspected compromise only)

1. Generate new value: `openssl rand -base64 32`
2. Vercel env: update `RECOVERY_CODE_PEPPER`
3. Connect to Supabase → `DELETE FROM auth_recovery_codes WHERE used_at IS NULL`
4. Trigger UI to generate + display a fresh recovery code to the operator

## Recovery scenarios

### Lost one passkey (have another)

Just authenticate with the surviving passkey on another registered device. Then visit Settings → register a replacement passkey.

### Lost all passkeys, have offline backup code

1. Visit `/api/auth/recovery` (UI flow handles this)
2. Enter the backup code
3. System verifies + forces immediate registration of a new passkey before closing the recovery flow

### Lost all passkeys AND lost the backup code (absolute last resort)

1. Open Supabase SQL Editor or connect via `psql`:
   ```sql
   DELETE FROM auth_sessions WHERE user_id = (SELECT id FROM auth_users LIMIT 1);
   DELETE FROM auth_credentials WHERE user_id = (SELECT id FROM auth_users LIMIT 1);
   DELETE FROM auth_recovery_codes WHERE user_id = (SELECT id FROM auth_users LIMIT 1);
   ```
2. **Wait ~60 seconds before continuing.** The pre-auth landing surfaces (`/`, `/setup`, `/sign-in`) cache `count(auth_credentials)` for 60 seconds to prevent DoS against the `*/15` bot tick. The cache is only invalidated by a successful `register/finish` ceremony — which you cannot run yet because there's no UI path to `/setup` while the cache still reads `count = 1`. The TTL was deliberately kept short for this scenario; longer waits would magnify recovery friction. (See `lib/auth/credential-count.ts` § "Invalidation surface" for the on-spec + off-spec write paths.)
3. Visit `/` (the landing page) — the now-uncached read will show State A (first-time setup). Click "Set up your passkey", which routes you to `/setup`. The UI treats zero-credentials state as "first-time setup" and starts the ceremony fresh.
4. Re-register passkeys + generate a new recovery code per the initial-setup ceremony above.

**Optional fast path:** if you control Vercel deploys, you can `vercel redeploy` the production deployment instead of waiting 60 seconds. Each new Fluid Compute instance starts with an empty in-memory cache; the first request after the redeploy will read fresh from the DB.

**Note:** the bot itself keeps running on whatever `LIVE_MODE` it was in when access was lost — Coinbase API keys live in Vercel env, not behind app auth. If you need to pause the bot during lockout, either (a) flip `LIVE_MODE=false` in Vercel env, (b) delete the Coinbase API key from Coinbase, or (c) delete the Vercel cron via dashboard.

## Live-mode promotion (dry-run → real money)

**Prerequisites (per [product.md § Annual KR1](../foundation/product.md)):**

- ≥ 60 consecutive dry-run sessions
- ≤ 1% deviation between intended and actual trade decisions
- Operator has reviewed at least the last 30 days of decision-trace history and is satisfied

**Procedure:**

1. Final sanity check: open the dashboard and confirm the dry-run badge is still showing
2. Vercel env → change `LIVE_MODE` from `false` to `true`
3. Vercel → trigger a redeploy
4. Open the dashboard immediately and verify the dry-run badge is gone and live-mode banner is showing
5. Wait for the next cron tick → confirm in `bot_ticks` table that the decision was `hold` (or whatever signal yields) and that no order was placed yet
6. Once the first non-`hold` tick fires, watch carefully for the first 24h

**Per [product.md § Guardrails](../foundation/product.md):** zero unintended live-mode trades is a non-negotiable guardrail. Any unexpected order is a P0.

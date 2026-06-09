-- Canonical DDL for the crypto DCA bot.
-- See architecture.md § Foundational Data Model for entity rationale.
-- This file is the canonical reference; runtime schema is built by
-- applying db/migrations/*.sql in order via lib/db/migrate.ts.

-- ─── Product entities (trace to product.md) ───────────────────────────

CREATE TABLE IF NOT EXISTS assets (
    id text PRIMARY KEY,
    symbol text NOT NULL UNIQUE,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS accounts (
    id text PRIMARY KEY,
    coinbase_account_id text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bot_sessions (
    id text PRIMARY KEY,
    status text NOT NULL CHECK (status IN ('active', 'paused', 'reset')),
    started_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    -- FK to currently-active strategy revision. Nullable: a session can
    -- exist before any strategy is activated. Added by migration
    -- 0004-strategies.sql (CB-3.2). REFERENCES strategies(id) below.
    active_strategy_id text
);

CREATE TABLE IF NOT EXISTS orders (
    id text PRIMARY KEY,
    account_id text NOT NULL REFERENCES accounts(id),
    asset_id text NOT NULL REFERENCES assets(id),
    session_id text REFERENCES bot_sessions(id),  -- NULL for manual orders
    source text NOT NULL CHECK (source IN ('manual', 'bot')),
    side text NOT NULL CHECK (side IN ('buy', 'sell')),
    amount numeric NOT NULL,
    status text NOT NULL,
    coinbase_order_id text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trade_fills (
    id text PRIMARY KEY,
    order_id text NOT NULL REFERENCES orders(id),
    fill_amount numeric NOT NULL,
    fill_price numeric NOT NULL,
    filled_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bot_ticks (
    id text PRIMARY KEY,
    session_id text NOT NULL REFERENCES bot_sessions(id),
    tick_started_at timestamptz NOT NULL,
    decision text NOT NULL CHECK (decision IN ('buy', 'sell', 'hold')),
    reason text NOT NULL,
    error_detail text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (session_id, tick_started_at)  -- prevents cron-overlap double-fires
);

CREATE TABLE IF NOT EXISTS signals (
    id text PRIMARY KEY,
    tick_id text NOT NULL REFERENCES bot_ticks(id),
    asset_id text NOT NULL REFERENCES assets(id),
    kind text NOT NULL CHECK (kind IN ('RSI', 'MA20')),
    value numeric NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS override_events (
    id text PRIMARY KEY,
    session_id text NOT NULL REFERENCES bot_sessions(id),
    kind text NOT NULL CHECK (kind IN ('pause', 'resume', 'force_buy', 'sell_50', 'sell_all', 'reset')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS account_snapshots (
    id text PRIMARY KEY,
    asset_id text NOT NULL REFERENCES assets(id),
    balance numeric NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Infrastructure (auth) tables ─────────────────────────────────────
-- Implement the Foundational Identity & Access Posture. Not product entities.

CREATE TABLE IF NOT EXISTS auth_users (
    id text PRIMARY KEY,
    display_name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_credentials (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    credential_id bytea NOT NULL UNIQUE,
    public_key bytea NOT NULL,
    counter bigint NOT NULL DEFAULT 0,
    device_label text,
    transports text[] NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz
);

CREATE TABLE IF NOT EXISTS auth_sessions (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    rotated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_recovery_codes (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    code_hash text NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Strategies (CB-3.2) ──────────────────────────────────────────────
-- Placed AFTER auth_users so the FK to created_by_user_id resolves on
-- a fresh schema apply. The table IS a product entity per architecture;
-- placement here is a structural concession to FK declaration order, not
-- a semantic re-classification.
--
-- Top-level columns snake_case; inner jsonb (selected_assets, entry_rules,
-- exit_rules) carries camelCase keys per lib/strategy-core/types.ts
-- convention split. Append-only at app layer via
-- lib/strategy-core/supersession.ts (DB-level enforcement deferred per
-- CB-3.2 Engineer DRI Decision #4).
CREATE TABLE IF NOT EXISTS strategies (
    id                          text PRIMARY KEY,
    name                        text NOT NULL,
    asset_class                 text NOT NULL,
    selected_assets             jsonb NOT NULL,
    entry_rules                 jsonb NOT NULL,
    exit_rules                  jsonb NOT NULL,
    position_size_usd           numeric NOT NULL CHECK (position_size_usd > 0),
    per_session_buy_count_cap   integer NOT NULL CHECK (per_session_buy_count_cap > 0),
    per_session_dollar_cap      numeric NOT NULL CHECK (per_session_dollar_cap > 0),
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by_user_id          text NOT NULL REFERENCES auth_users(id),
    superseded_by_strategy_id   text REFERENCES strategies(id)
);

-- bot_sessions.active_strategy_id FK constraint. The column is declared
-- in the bot_sessions CREATE TABLE block above; the FK constraint is
-- declared here so strategies(id) exists at constraint-creation time.
-- Idempotent via DO block (Postgres has no `ADD CONSTRAINT IF NOT EXISTS`).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bot_sessions_active_strategy_id_fkey'
  ) THEN
    ALTER TABLE bot_sessions
      ADD CONSTRAINT bot_sessions_active_strategy_id_fkey
      FOREIGN KEY (active_strategy_id) REFERENCES strategies(id);
  END IF;
END $$;

-- ─── Indices ──────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_orders_session ON orders(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_account_created ON orders(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_ticks_session_started ON bot_ticks(session_id, tick_started_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_fills_order ON trade_fills(order_id);
CREATE INDEX IF NOT EXISTS idx_signals_tick ON signals(tick_id);
CREATE INDEX IF NOT EXISTS idx_account_snapshots_asset_created ON account_snapshots(asset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);

-- Singleton constraint on auth_users — enforces "at most one user row" at the
-- DB layer. Per CB-1.2 AC 3 + migration 0002-auth-users-singleton.sql.
-- Closes the concurrent-insert race where two /register/finish requests with
-- different ULIDs could both pass the count(*) gate.
CREATE UNIQUE INDEX IF NOT EXISTS auth_users_singleton ON auth_users ((TRUE));

-- ─── Row-Level Security (defense-in-depth) ────────────────────────────
-- Per migration 0003-auth-tables-rls.sql + the 2026-06-04 security audit.
-- The app connects via the `postgres.<project-ref>` pooler role which
-- bypasses RLS, so server code is unaffected. Anon/authenticated roles
-- (used by PostgREST if ever enabled) are explicitly denied.
ALTER TABLE auth_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_recovery_codes ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['auth_users','auth_credentials','auth_sessions','auth_recovery_codes']::text[]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "deny anon" ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "deny authenticated" ON %I', tbl);
    EXECUTE format('CREATE POLICY "deny anon" ON %I TO anon USING (false) WITH CHECK (false)', tbl);
    EXECUTE format('CREATE POLICY "deny authenticated" ON %I TO authenticated USING (false) WITH CHECK (false)', tbl);
  END LOOP;
END $$;

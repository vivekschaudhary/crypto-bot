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
    updated_at timestamptz NOT NULL DEFAULT now()
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

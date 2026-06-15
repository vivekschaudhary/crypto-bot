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

-- Unified buy/sell ledger across dry-run + live modes. Reshaped by
-- migration 0006 (CB-4.3) per the amended Order entity at
-- docs/foundation/architecture.md DRI Log 2026-06-13: the original
-- accounts/assets dimension FKs were dropped (nothing populated them —
-- same root cause as the 0005 signals reshape); asset_id → asset_identifier
-- text; account_id dropped (single-operator MVP). status free-form
-- (dry_run | submitted | failed for bot rows); coinbase_order_id NULL for
-- dry_run + failed; error_detail holds the redacted failure reason.
CREATE TABLE IF NOT EXISTS orders (
    id text PRIMARY KEY,
    asset_identifier text NOT NULL,
    session_id text REFERENCES bot_sessions(id),  -- NULL for manual orders
    source text NOT NULL CHECK (source IN ('manual', 'bot')),
    side text NOT NULL CHECK (side IN ('buy', 'sell')),
    amount numeric NOT NULL,
    status text NOT NULL,
    coinbase_order_id text,
    error_detail text,
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

-- Per-asset decision rows — one per asset evaluated per tick. Reshaped by
-- migration 0005 (CB-4.2) per the amended Signal entity at
-- docs/foundation/architecture.md DRI Log 2026-06-11: the original
-- kind/value shape predated multi-asset strategies. rsi/ma are nullable
-- (CB-4.0 insufficient-bars sentinel persists honestly); asset_identifier
-- matches lib/strategy-core Asset.identifier (assets-dimension FK dropped —
-- nothing populates that table).
CREATE TABLE IF NOT EXISTS signals (
    id text PRIMARY KEY,
    tick_id text NOT NULL REFERENCES bot_ticks(id),
    asset_identifier text NOT NULL,
    decision text NOT NULL CHECK (decision IN ('buy', 'sell', 'hold')),
    reason text NOT NULL,
    rsi numeric,
    ma numeric,
    ma_period int,
    last_close numeric,
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

-- Strategies — product entity (CB-3.2). Top-level columns snake_case;
-- inner jsonb (selected_assets, entry_rules, exit_rules) carries
-- camelCase keys per lib/strategy-core/types.ts convention split.
-- Append-only at app layer via lib/strategy-core/supersession.ts
-- (DB-level enforcement deferred per CB-3.2 Engineer DRI Decision #4).
--
-- The FK on created_by_user_id → auth_users(id) is declared as a separate
-- ALTER TABLE further down the file (Cross-section FK constraints section),
-- so this product-entities-first ordering is preserved on a fresh schema
-- apply (auth_users doesn't exist yet at this point in the file).
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
    created_by_user_id          text NOT NULL,
    superseded_by_strategy_id   text REFERENCES strategies(id)
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

-- ─── Cross-section FK constraints ────────────────────────────────────
-- FKs that cross the product / auth section boundary. Declared here so
-- the canonical reference preserves the existing product-then-auth section
-- ordering while still resolving forward references on a fresh schema
-- apply. Both ALTERs are idempotent via DO blocks (Postgres has no
-- `ADD CONSTRAINT IF NOT EXISTS`).

-- strategies.created_by_user_id → auth_users(id) — declared after both
-- tables exist (CB-3.2).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'strategies_created_by_user_id_fkey'
  ) THEN
    ALTER TABLE strategies
      ADD CONSTRAINT strategies_created_by_user_id_fkey
      FOREIGN KEY (created_by_user_id) REFERENCES auth_users(id);
  END IF;
END $$;

-- bot_sessions.active_strategy_id → strategies(id) — the column was added
-- to the existing bot_sessions block above without an inline FK; the
-- constraint lands here so strategies(id) exists at constraint-creation
-- time (CB-3.2).
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

-- At most one CURRENT (non-ended) bot_session — the multi-row BotSession
-- invariant (CB-5.3 + migration 0007-one-current-session.sql). A reset ends
-- the current run (ended_at set) and inserts a new one; precisely one row has
-- ended_at NULL at steady state. Blocks a forked session under concurrent
-- resets (second insert → 23505 → the override route returns 409).
CREATE UNIQUE INDEX IF NOT EXISTS bot_sessions_single_current
    ON bot_sessions ((TRUE))
    WHERE ended_at IS NULL;

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

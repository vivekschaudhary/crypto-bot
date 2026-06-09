-- Migration: strategies table + bot_sessions.active_strategy_id FK column.
--
-- CB-3.2 (THIRD CB-3 STORY) — materializes CB-3.0's Zod types from
-- lib/strategy-core/types.ts into a queryable Postgres table. Per bet
-- architecture Decision #4 (see docs/bets/CB-3/architecture.md); DDL is
-- verbatim from the documented decision, NOT improvised per Compass
-- refusal rule #4.
--
-- ARCHITECTURE ISSUE #1 RESOLUTION (closed at /create-story CB-3.2 drafting,
-- 2026-06-08): `bot_sessions` table already exists in 0001-init.sql:23-30
-- (v1 foundation scaffold). CB-3.2 ships ONLY the `ALTER TABLE bot_sessions
-- ADD COLUMN active_strategy_id ...` — NOT a second creation of the table.
--
-- ENGINEER DRI DECISIONS (committed at this commit per story Tech notes):
--
--   1. FILENAME = `0004-strategies.sql` — lexical-sort pattern of the
--      migrate runner (lib/db/migrate.ts:83); next in series after 0003.
--
--   2. `CREATE TABLE strategies` (NOT `IF NOT EXISTS`) — mirrors
--      0001-init.sql pattern. Fails-loud if a `strategies` table exists
--      with a different shape from out-of-band manual changes. The
--      `_migrations` tracking table prevents re-application via the runner;
--      bare `CREATE TABLE` is defense-in-depth. Story AC 3.
--
--   3. NO INDEXES THIS STORY. Defer until CB-3.3 form fetches + CB-4 bot
--      tick reads surface the actual access patterns; speculative indexes
--      waste write throughput. Future candidates (CB-3.3 or CB-4 follow-up
--      migration): idx_strategies_created_by_user_id (dashboard list),
--      idx_strategies_superseded_by (active-strategy resolution).
--
--   4. DB-LEVEL APPEND-ONLY ENFORCEMENT (trigger / RLS policy) = DEFERRED.
--      Application-side enforcement via
--      lib/strategy-core/supersession.ts:assertSupersessionOnlyUpdate
--      is sufficient at MVP. DB-level trigger adds complexity; defer to a
--      follow-up /ops migration if app-side enforcement ever has a bug.
--
--   5. db/schema.sql SWEEP — happens in this same PR (NOT a follow-up).
--      Per status.md drift-pattern discipline: shipping migration without
--      updating the canonical reference creates load-bearing inconsistencies
--      that compound. Single PR.
--
--   6. NO APP-CODE QUERIES THIS STORY. CB-3.3 ships the INSERT/UPDATE
--      paths against this schema. Mixing a migration story with query-code
--      decisions creates review-cycle noise.
--
-- APPEND-ONLY AT APP LAYER (per AC 7 + bet architecture Decision #4):
--   * NO `UPDATE strategies` paths from app code.
--   * Revising a strategy: INSERT a new row + UPDATE the old row's
--     `superseded_by_strategy_id` (this is the ONE allowed UPDATE —
--     supersession-only; never strategy content).
--   * `bot_sessions.active_strategy_id` IS mutable (changes when operator
--     activates a new revision).
--   * Enforced application-side by lib/strategy-core/supersession.ts:87
--     (assertSupersessionOnlyUpdate). DB-level enforcement deferred per
--     Engineer DRI Decision #4.

-- ─── strategies table ────────────────────────────────────────────────
-- ULID stored as text per foundation architecture § Identity strategy
-- (Crockford base32; 26 chars; debuggable; matches external-tool expectations).
-- Top-level fields snake_case = DB columns; inner jsonb shapes (selected_assets,
-- entry_rules, exit_rules) carry camelCase keys per the convention split
-- documented at lib/strategy-core/types.ts:13-28.
CREATE TABLE strategies (
    id                          text PRIMARY KEY,
    name                        text NOT NULL,
    asset_class                 text NOT NULL,  -- discriminator: 'crypto-coinbase' | 'equity-broker' | ...
    selected_assets             jsonb NOT NULL, -- array of {assetClass, identifier}; validated app-layer
    entry_rules                 jsonb NOT NULL, -- Zod-validated; RSI threshold, MA period, MA reinforcement
    exit_rules                  jsonb NOT NULL, -- Zod-validated; RSI threshold, min-profit %, sell-fraction
    position_size_usd           numeric NOT NULL CHECK (position_size_usd > 0),
    per_session_buy_count_cap   integer NOT NULL CHECK (per_session_buy_count_cap > 0),
    per_session_dollar_cap      numeric NOT NULL CHECK (per_session_dollar_cap > 0),
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by_user_id          text NOT NULL REFERENCES auth_users(id),
    superseded_by_strategy_id   text REFERENCES strategies(id)
);

-- ─── bot_sessions.active_strategy_id FK column ────────────────────────
-- `bot_sessions` table already exists per 0001-init.sql:23-30. CB-3.2 only
-- adds the FK column linking a session to its currently-active strategy
-- revision. Nullable: a session can exist without an active strategy
-- (initial state; pre-CB-3.3 activation).
ALTER TABLE bot_sessions
    ADD COLUMN active_strategy_id text REFERENCES strategies(id);

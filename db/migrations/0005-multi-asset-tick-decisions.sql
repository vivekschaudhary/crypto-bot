-- Migration: reshape `signals` into per-asset decision rows.
--
-- CB-4.2 (THIRD CB-4 STORY) — executes the amended `Signal` entity at
-- docs/foundation/architecture.md DRI Log 2026-06-11 (Enterprise/Solution
-- Architect amendment; escalated per AGENTS.md Principle #16 during PR #62
-- review). DDL is verbatim from the documented entity shape, NOT improvised
-- per Compass refusal rule #4.
--
-- WHY: the 0001-init shape (`asset_id` FK + `kind IN ('RSI','MA20')` +
-- `value NOT NULL`) was derived 2026-05-29 under a single-asset, MA20-only
-- assumption. Three shipped contracts invalidated it:
--   1. CB-3.0 MaPeriodSchema allows {5,10,20,50} — the MA20 CHECK is wrong
--   2. CB-4.0's null sentinel (insufficient candle bars) cannot persist in
--      a NOT NULL value column
--   3. CB-4.1's evaluate() returns per-asset {decision, reason} which had
--      no home (bot_ticks carries ONE decision per tick)
--
-- ZERO-DATA-RISK VERIFICATION: all event-log tables (`bot_ticks`,
-- `signals`, `orders`) are EMPTY in production — the cron has been
-- heartbeat-only since 2026-05-31 (zero writes shipped before CB-4.2).
-- DROP + CREATE is therefore safe and cleaner than a chain of ALTERs.
--
-- ENGINEER DRI DECISIONS (committed at this commit per story Tech notes):
--
--   1. DROP + CREATE (not ALTER chain) — table is empty; recreating
--      documents the full new shape in one readable block. `DROP TABLE`
--      without IF EXISTS: fails loud if 0001 never ran (defense-in-depth,
--      mirrors 0004's bare-CREATE posture).
--
--   2. `asset_identifier text` replaces the `assets(id)` FK — nothing
--      populates the assets dimension table; the identifier matches
--      lib/strategy-core Asset.identifier (e.g. 'BTC-USD') verbatim, which
--      is what CB-5's dashboard will join/display on.
--
--   3. NO new indexes beyond idx_signals_tick (recreated) — same
--      defer-until-access-patterns-surface posture as 0004 Decision #3.
--
--   4. `bot_ticks` is UNTOUCHED — its `decision` CHECK serves the
--      tick-level aggregate (story AC 6) and `UNIQUE (session_id,
--      tick_started_at)` stays load-bearing for cron-overlap defense.

DROP TABLE signals;

CREATE TABLE signals (
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

CREATE INDEX idx_signals_tick ON signals(tick_id);

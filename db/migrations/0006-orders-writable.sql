-- Migration: make `orders` writable for the bot's unified transaction ledger.
--
-- CB-4.3 (FOURTH / LAST LOAD-BEARING CB-4 STORY) — executes the amended
-- `Order` entity at docs/foundation/architecture.md DRI Log 2026-06-13
-- (Enterprise/Solution Architect amendment, landed upstream in PR #64 per
-- AGENTS.md Principle #16). DDL is verbatim from the documented entity
-- shape, NOT improvised per Compass refusal rule #4.
--
-- WHY: the 0001-init `orders` table FKs `accounts(id)` + `assets(id)` —
-- two dimension tables that NOTHING populates (zero INSERT paths in
-- lib/+app/+db/). Any INSERT fails the FK, blocking CB-4.3's LIVE_MODE
-- order placement + the unified-ledger writes (brief PM Decision #8). Same
-- root cause as the 0005 `signals` reshape.
--
-- ZERO-DATA-RISK VERIFICATION: `orders` is EMPTY in production — no writes
-- have ever happened (CB-4.2 is dry-run and writes only bot_ticks/signals;
-- CB-4.3's writes are the FIRST). Adding NOT NULL columns to an empty
-- table needs no default.
--
-- ENGINEER DRI DECISIONS (committed at this commit per story Tech notes):
--
--   1. ALTER, **not** DROP+recreate (REVISION of the plan's Decision #1).
--      `trade_fills.order_id REFERENCES orders(id)` (0001-init:47) depends
--      on `orders`, so `DROP TABLE orders` fails and `DROP ... CASCADE`
--      would needlessly recreate the untouched `trade_fills` table. ALTER
--      expresses the delta cleanly and touches nothing downstream.
--      Dropping a column drops its inline FK constraint automatically, so
--      no constraint-name lookup is needed.
--
--   2. SANITIZED FAILURE REASON = new nullable `error_detail text` column
--      (consistent with `bot_ticks.error_detail`; queryable for CB-5
--      rather than log-only). Holds the redacted Coinbase order-failure
--      reason for `status='failed'` rows.
--
--   3. `account_id` DROPPED (single-operator MVP — one Coinbase account;
--      the column is dead weight). `asset_id` (assets FK) → `asset_identifier
--      text` matching strategy-core Asset.identifier + the reshaped signals.
--      `status` stays free-form text (dry_run | submitted | failed for bot
--      rows; no CHECK — CB-4.3 + future manual-order statuses coexist).

ALTER TABLE orders DROP COLUMN account_id;          -- drops orders_account_id_fkey with it
ALTER TABLE orders DROP COLUMN asset_id;            -- drops orders_asset_id_fkey with it
ALTER TABLE orders ADD COLUMN asset_identifier text NOT NULL;  -- empty table → no default needed
ALTER TABLE orders ADD COLUMN error_detail text;    -- nullable; redacted failure reason for status='failed'

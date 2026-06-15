-- Migration: enforce AT MOST ONE current (non-ended) bot_session.
--
-- CB-5.3 (override controls) round-1 review BLOCKER — session integrity.
-- The multi-row BotSession model (a reset ENDS the current run and STARTS a
-- new one) has a load-bearing invariant the schema did not yet enforce:
-- exactly one session is "current" (not yet ended) at a time. Without it,
-- two concurrent reset requests could each insert a new active row → a
-- FORKED session (two current rows), and the cron's current-session lookup
-- would silently pick one and orphan the other.
--
-- "current" = `ended_at IS NULL` (the not-yet-ended run). A reset sets
-- ended_at on the old row and inserts a new row with ended_at NULL, so at
-- steady state precisely one row matches. This partial UNIQUE index makes a
-- second concurrent current-session insert fail with 23505 — the override
-- route maps that to 409 (conflict) rather than forking.
--
-- Idiom: a UNIQUE index on the constant expression ((TRUE)) over the partial
-- predicate allows at most ONE matching row — the same singleton pattern as
-- `auth_users_singleton` (0003), here scoped to the non-ended sessions.
--
-- ZERO-DATA-RISK: production currently holds exactly one bot_sessions row
-- with ended_at NULL (never reset). One matching row → the index builds
-- cleanly. Ended sessions (ended_at set) are unconstrained.

CREATE UNIQUE INDEX IF NOT EXISTS bot_sessions_single_current
    ON bot_sessions ((TRUE))
    WHERE ended_at IS NULL;

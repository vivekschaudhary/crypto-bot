-- Enforce the first-time-only auth_users invariant at the DB layer.
-- Per CB-1.2 AC 3 (Codex review BLOCKER on PR #5): the count(*) gate inside
-- /api/auth/register/finish is raceable across concurrent inserts with
-- different ULIDs. A partial unique index on a constant expression makes
-- the table physically singleton — any second INSERT fails with a unique
-- constraint violation regardless of the transaction's read snapshot.
--
-- Multi-device registration returns post-MVP per portfolio. When it does,
-- this constraint either drops or stays in place (multi-device adds
-- credentials under the same single user, not new user rows).

CREATE UNIQUE INDEX IF NOT EXISTS auth_users_singleton ON auth_users ((TRUE));

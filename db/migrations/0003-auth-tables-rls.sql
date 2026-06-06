-- Enable Row-Level Security (RLS) on every auth_* table.
--
-- WHY: Supabase's dashboard flags any table without RLS as "Unrestricted"
-- because Supabase's primary use case is exposing tables to clients via the
-- auto-generated PostgREST API where row-level filtering by JWT claim is the
-- security boundary. We DON'T use PostgREST — all DB access in this app goes
-- through lib/db/client.ts, which connects via the `postgres.<project-ref>`
-- pooler role. That role has BYPASSRLS, so enabling RLS doesn't change how
-- our server code reads/writes these tables.
--
-- BUT: enabling RLS closes a defense-in-depth gap that would otherwise widen
-- if either of these two conditions ever holds:
--   (a) the Supabase project's anon/auth keys leak AND PostgREST is enabled
--       (it's on by default on Supabase free/pro)
--   (b) a future feature adds a non-superuser DB role (e.g., a read-only
--       reporting role) and someone reuses it without remembering these
--       tables have no row-level filter
--
-- The 2026-06-04 codebase security audit
-- (docs/retros/2026-06-04-codebase-security-audit.md § "Unrestricted tables")
-- flagged this as defense-in-depth.
--
-- POSTURE: enable RLS + add explicit "no access" policies for `anon` and
-- `authenticated` Supabase roles. The `postgres` (pooler) role bypasses RLS
-- and continues to read/write normally, so our server code is unchanged.
-- If a future feature genuinely needs PostgREST access (we don't expect it),
-- new policies can be added without first having to remember RLS isn't on.

-- ─── auth_users ──────────────────────────────────────────────────────
ALTER TABLE auth_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny anon" ON auth_users;
DROP POLICY IF EXISTS "deny authenticated" ON auth_users;
CREATE POLICY "deny anon" ON auth_users TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny authenticated" ON auth_users TO authenticated USING (false) WITH CHECK (false);

-- ─── auth_credentials ────────────────────────────────────────────────
ALTER TABLE auth_credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny anon" ON auth_credentials;
DROP POLICY IF EXISTS "deny authenticated" ON auth_credentials;
CREATE POLICY "deny anon" ON auth_credentials TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny authenticated" ON auth_credentials TO authenticated USING (false) WITH CHECK (false);

-- ─── auth_sessions ───────────────────────────────────────────────────
ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny anon" ON auth_sessions;
DROP POLICY IF EXISTS "deny authenticated" ON auth_sessions;
CREATE POLICY "deny anon" ON auth_sessions TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny authenticated" ON auth_sessions TO authenticated USING (false) WITH CHECK (false);

-- ─── auth_recovery_codes ─────────────────────────────────────────────
ALTER TABLE auth_recovery_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny anon" ON auth_recovery_codes;
DROP POLICY IF EXISTS "deny authenticated" ON auth_recovery_codes;
CREATE POLICY "deny anon" ON auth_recovery_codes TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny authenticated" ON auth_recovery_codes TO authenticated USING (false) WITH CHECK (false);

-- VERIFY:
--   SELECT schemaname, tablename, rowsecurity FROM pg_tables
--     WHERE tablename LIKE 'auth_%';
-- All four rows should show rowsecurity = true.

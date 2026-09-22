-- 0005_revoke_anon.sql — take the anon role off the public schema.
--
-- Why this exists, since 0002 already says "Nothing is granted to anon".
--
-- That sentence is true of 0002 read on its own and false of a real Supabase
-- project. Every project ships with default privileges along the lines of
--
--   alter default privileges in schema public
--     grant all on tables to anon, authenticated;
--
-- so a table created in `public` is reachable by the anon role from the moment
-- it exists, no matter what later migrations grant. Granting to `authenticated`
-- in 0002 added a privilege; it never took anon's away.
--
-- Probing a live project with nothing but the publishable key showed the
-- difference: reads returned `200 []` rather than `401 permission denied`.
-- No data escaped — RLS matched no policy for anon and filtered every row,
-- and an anonymous insert came back 42501 — so this migration is not closing
-- a leak. It restores the second layer the schema always claimed to have.
--
-- That layer earns its keep the day someone adds a table and forgets
-- `enable row level security`, or writes `to public` where they meant
-- `to authenticated`. With the grant gone, those mistakes fail closed instead
-- of publishing a table. RLS should not be the only thing standing there.
--
-- Safe for this app specifically because it has no public surface: every route
-- is behind sign-in, and the anon key is used only to reach GoTrue at
-- /auth/v1/*, which is a separate service with its own role and is untouched
-- by anything here. Sign-up, sign-in and password reset keep working.
--
-- To reverse:
--   grant usage on schema public to anon;
--   grant select on all tables in schema public to anon;

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all routines  in schema public from anon;

-- Existing objects are handled above; these two lines cover the ones migration
-- 0006 has not created yet, so the hole does not quietly reopen.
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- Without usage on the schema, nothing inside it is reachable by name at all.
revoke usage on schema public from anon;

-- Note on scope: `alter default privileges` only cancels defaults that were
-- installed by the role running it. Supabase sets some of its defaults as
-- supabase_admin, so run this as `postgres` in the SQL editor and treat the
-- `revoke ... on all tables` lines above as the part that is guaranteed to
-- bite. Re-run this file after any migration that creates a table if you want
-- belt and braces.

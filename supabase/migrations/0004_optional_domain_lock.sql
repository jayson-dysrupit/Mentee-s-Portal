-- 0004_optional_domain_lock.sql — OPTIONAL, AND NOT FOR THIS COHORT.
--
-- ┌──────────────────────────────────────────────────────────────────────┐
-- │ DO NOT APPLY THIS if your interns sign up with personal addresses.   │
-- │ It aborts the signup transaction for any address outside the list    │
-- │ below, so a Gmail or Yahoo address is rejected at the database and   │
-- │ the person simply cannot create an account. That is the entire       │
-- │ purpose of the file; it is not a setting that can be half-applied.   │
-- └──────────────────────────────────────────────────────────────────────┘
--
-- The app itself asks for an "Email address", not a work address, precisely
-- because interns arrive with whatever mailbox they already have. Applying
-- this migration contradicts that and locks the cohort out.
--
-- It is kept in the repo for the other case: a future intake issued company
-- mailboxes, where you want the rule to hold no matter which auth provider or
-- dashboard setting is in play, because the trigger fires inside the signup
-- transaction rather than in front of one provider.
--
-- If you ever do want it:
--   1. Replace the placeholder below with your real domains — as shipped it
--      would reject everyone, including you.
--   2. Run this file once in the SQL editor.
--   3. To undo: drop trigger enforce_email_domain_on_signup on auth.users;
--
-- Supabase's dashboard can restrict allowed email domains per provider, which
-- is the easier control and the one to reach for first.

create or replace function public.enforce_email_domain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Edit before applying. Left as an obvious placeholder so that running this
  -- file unread fails loudly and immediately, instead of silently locking out
  -- a domain you forgot was in use.
  allowed text[] := array['REPLACE-WITH-YOUR-DOMAIN.example'];
begin
  if lower(split_part(new.email, '@', 2)) <> all (allowed) then
    raise exception 'Sign-up is limited to: %', array_to_string(allowed, ', ')
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger enforce_email_domain_on_signup
  before insert on auth.users
  for each row execute function public.enforce_email_domain();

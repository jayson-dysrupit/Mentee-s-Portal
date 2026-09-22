-- 0006_drop_supervisor_role.sql — two roles, not three.
--
-- The middle role never earned its keep here. `supervisor` existed to let a
-- mentor see only their own mentees, which needed every intern linked to a
-- mentor via profiles.supervisor_id. That linking was dropped as a product
-- decision, and an unlinked supervisor sees an empty page — so in practice
-- everyone who monitors was already an admin.
--
-- What this changes:
--   * any existing supervisor becomes an admin, before the constraint tightens,
--     so nobody is locked out by their own row failing the new check;
--   * the role check allows only 'intern' and 'admin';
--   * policies and the column guard stop consulting is_supervisor_of();
--   * is_supervisor_of() is dropped, since nothing calls it any more.
--
-- profiles.supervisor_id is deliberately LEFT IN PLACE. Dropping a column
-- destroys whatever is in it and forces both views to be rebuilt, and nothing
-- reads it now, so it is inert rather than harmful. To remove it as well:
--
--   drop view public.intern_progress;
--   drop view public.daily_log_details;
--   alter table public.profiles drop column supervisor_id;
--   -- then recreate both views from 0001 without the supervisor_id columns.

-- ---------------------------------------------------------------- roles

update public.profiles set role = 'admin' where role = 'supervisor';

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('intern', 'admin'));

-- ---------------------------------------------------------------- policies

-- Yourself, or everyone if you are an admin. There is no third case now.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.current_role_name() = 'admin'
  );

drop policy if exists daily_logs_select on public.daily_logs;
create policy daily_logs_select on public.daily_logs
  for select to authenticated
  using (
    intern_id = auth.uid()
    or public.current_role_name() = 'admin'
  );

-- An admin may comment on any row at any age. guard_log_columns still keeps
-- them out of the intern's own words.
drop policy if exists daily_logs_update_reviewer on public.daily_logs;
create policy daily_logs_update_reviewer on public.daily_logs
  for update to authenticated
  using (public.current_role_name() = 'admin')
  with check (public.current_role_name() = 'admin');

-- ---------------------------------------------------------------- guards

-- Same body as 0001 with the is_supervisor_of() branch folded into the admin
-- one. Restated in full rather than patched, so this file is the whole truth
-- about what the trigger does.
create or replace function public.guard_log_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Trusted server-side callers (migrations, SQL editor, service_role).
  if auth.uid() is null then
    return new;
  end if;

  if public.current_role_name() = 'admin' then
    new.intern_id     := old.intern_id;
    new.log_date      := old.log_date;
    new.clock_in      := old.clock_in;
    new.clock_out     := old.clock_out;
    new.break_minutes := old.break_minutes;
    new.work_mode     := old.work_mode;
    new.worked_on     := old.worked_on;
    new.learned       := old.learned;
    new.blockers      := old.blockers;
    new.plan_tomorrow := old.plan_tomorrow;
    new.skills        := old.skills;
    new.confidence    := old.confidence;
    return new;
  end if;

  new.intern_id          := old.intern_id;
  new.log_date           := old.log_date;
  new.clock_in           := old.clock_in;
  new.clock_in_lat       := old.clock_in_lat;
  new.clock_in_lng       := old.clock_in_lng;
  new.supervisor_comment := old.supervisor_comment;
  new.reviewed_at        := old.reviewed_at;
  new.reviewed_by        := old.reviewed_by;
  return new;
end
$$;

-- Nothing references it now. Dropping a function destroys no data.
drop function if exists public.is_supervisor_of(uuid);

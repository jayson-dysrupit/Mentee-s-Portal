-- 0002_policies.sql — row level security.
--
-- Every rule an intern could care about is enforced here, server side, not in
-- the Vue app. A row excluded by a policy is never sent to the browser, so
-- "hide it in the UI" and "they cannot read it" are the same statement.
--
-- Column-level rules live in the guard triggers in 0001. Policies pick rows;
-- triggers pin columns. Both are needed: a policy cannot say "you may update
-- this row but not that column".

alter table public.profiles   enable row level security;
alter table public.skills     enable row level security;
alter table public.daily_logs enable row level security;

-- ---------------------------------------------------------------- profiles

-- Yourself, the interns reporting to you, or everyone if you are an admin.
-- A supervisor deliberately cannot see another supervisor's interns.
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or supervisor_id = auth.uid()
    or public.current_role_name() = 'admin'
  );

-- Your own row (guard_profile_privileges pins role, supervisor and dates), or
-- any row if you are an admin.
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.current_role_name() = 'admin')
  with check (id = auth.uid() or public.current_role_name() = 'admin');

-- Rows normally arrive via the handle_new_user trigger; this is for an admin
-- pre-registering someone.
create policy profiles_insert_admin on public.profiles
  for insert to authenticated
  with check (public.current_role_name() = 'admin');

-- No delete policy, deliberately. Deleting a profile cascades its whole
-- attendance history; deactivate with active = false instead.

-- ---------------------------------------------------------------- skills

create policy skills_select on public.skills
  for select to authenticated
  using (true);

create policy skills_admin_write on public.skills
  for all to authenticated
  using (public.current_role_name() = 'admin')
  with check (public.current_role_name() = 'admin');

-- ---------------------------------------------------------------- daily_logs

create policy daily_logs_select on public.daily_logs
  for select to authenticated
  using (
    intern_id = auth.uid()
    or public.is_supervisor_of(intern_id)
    or public.current_role_name() = 'admin'
  );

-- You clock yourself in, for today or yesterday. Nobody back-files a week of
-- attendance, and nobody clocks in for someone else.
create policy daily_logs_insert_self on public.daily_logs
  for insert to authenticated
  with check (
    intern_id = auth.uid()
    and log_date between current_date - 1 and current_date
  );

-- The same 48-hour window for edits: finish today, or close out a day you
-- forgot to clock out of yesterday. Older rows are frozen.
create policy daily_logs_update_self on public.daily_logs
  for update to authenticated
  using (intern_id = auth.uid() and log_date >= current_date - 1)
  with check (intern_id = auth.uid() and log_date >= current_date - 1);

-- A reviewer may comment on any of their interns' rows at any age.
-- guard_log_columns keeps them out of the intern's own words.
create policy daily_logs_update_reviewer on public.daily_logs
  for update to authenticated
  using (
    public.is_supervisor_of(intern_id)
    or public.current_role_name() = 'admin'
  )
  with check (
    public.is_supervisor_of(intern_id)
    or public.current_role_name() = 'admin'
  );

create policy daily_logs_delete_admin on public.daily_logs
  for delete to authenticated
  using (public.current_role_name() = 'admin');

-- ---------------------------------------------------------------- grants
--
-- RLS filters rows but grants decide whether the table is reachable at all.
-- Nothing is granted to anon: this app has no public surface.

grant usage on schema public to authenticated;

grant select, insert, update, delete on public.daily_logs to authenticated;
grant select, insert, update          on public.profiles   to authenticated;
grant select, insert, update, delete  on public.skills     to authenticated;
grant usage, select on all sequences in schema public to authenticated;

grant select on public.daily_log_details to authenticated;
grant select on public.intern_progress   to authenticated;

-- 0007_time_adjustments.sql — admins may correct clock times, and every
-- correction is recorded.
--
-- 0001 pinned clock_in and clock_out against every caller with a JWT, which
-- made the SQL editor the only way to fix a mistyped day. That is fine for one
-- correction a month and useless as a routine. This opens the two fields to an
-- admin and, in the same breath, makes the record of who changed what
-- something the database writes rather than something the app remembers to.
--
-- The audit is a trigger, not app code, for the same reason the reflection
-- rule is a constraint: an adjustment made from the SQL editor, from a script
-- or from a future client is logged exactly the same. There is no code path
-- that edits a clock time quietly.
--
-- What an admin still cannot touch: intern_id, log_date, work_mode, and every
-- word the intern wrote. Correcting attendance is not editing someone's diary.

-- ---------------------------------------------------------------- audit table

create table public.log_adjustments (
  id         uuid primary key default gen_random_uuid(),
  log_id     uuid not null references public.daily_logs (id) on delete cascade,
  intern_id  uuid not null references public.profiles (id)   on delete cascade,
  changed_by uuid not null references public.profiles (id),
  field      text not null check (field in ('clock_in', 'clock_out', 'break_minutes')),
  old_value  text,
  new_value  text,
  reason     text,
  created_at timestamptz not null default now()
);

create index log_adjustments_log_idx    on public.log_adjustments (log_id, created_at desc);
create index log_adjustments_intern_idx on public.log_adjustments (intern_id, created_at desc);

-- ---------------------------------------------------------------- guard

-- As 0006, with the three attendance fields lifted out of the admin's pinned
-- list. Everything the intern wrote stays pinned.
create or replace function public.guard_log_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if public.current_role_name() = 'admin' then
    new.intern_id     := old.intern_id;
    new.log_date      := old.log_date;
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

-- ---------------------------------------------------------------- audit trigger

-- Only an admin's edit is an "adjustment". An intern clocking out sets
-- clock_out for the first time in the ordinary course of the day, and logging
-- that as a correction would bury the real ones.
create or replace function public.record_time_adjustments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor  uuid := auth.uid();
  why    text := nullif(current_setting('app.adjustment_reason', true), '');
begin
  if actor is null or public.current_role_name() <> 'admin' then
    return null;
  end if;

  if new.clock_in is distinct from old.clock_in then
    insert into public.log_adjustments (log_id, intern_id, changed_by, field, old_value, new_value, reason)
    values (new.id, new.intern_id, actor, 'clock_in', old.clock_in::text, new.clock_in::text, why);
  end if;

  if new.clock_out is distinct from old.clock_out then
    insert into public.log_adjustments (log_id, intern_id, changed_by, field, old_value, new_value, reason)
    values (new.id, new.intern_id, actor, 'clock_out', old.clock_out::text, new.clock_out::text, why);
  end if;

  if new.break_minutes is distinct from old.break_minutes then
    insert into public.log_adjustments (log_id, intern_id, changed_by, field, old_value, new_value, reason)
    values (new.id, new.intern_id, actor, 'break_minutes', old.break_minutes::text, new.break_minutes::text, why);
  end if;

  return null;
end
$$;

create trigger daily_logs_audit_times
  after update on public.daily_logs
  for each row execute function public.record_time_adjustments();

-- ---------------------------------------------------------------- rpc

-- One call so the reason travels with the change. set_config(..., true) is
-- transaction-local, which is what lets the trigger read it without a column
-- on daily_logs holding "the reason for the most recent edit" forever.
--
-- security invoker on purpose: RLS still decides whether this admin may touch
-- this row, and the guard trigger still decides which columns land.
create or replace function public.adjust_log_times(
  p_log_id        uuid,
  p_clock_in      timestamptz default null,
  p_clock_out     timestamptz default null,
  p_break_minutes integer     default null,
  p_reason        text        default null
)
returns public.daily_logs
language plpgsql
security invoker
set search_path = public
as $$
declare
  rec public.daily_logs;
begin
  if public.current_role_name() <> 'admin' then
    raise exception 'Only an admin may adjust clock times'
      using errcode = '42501';
  end if;

  perform set_config('app.adjustment_reason', coalesce(p_reason, ''), true);

  update public.daily_logs
     set clock_in      = coalesce(p_clock_in, clock_in),
         clock_out     = coalesce(p_clock_out, clock_out),
         break_minutes = coalesce(p_break_minutes, break_minutes)
   where id = p_log_id
  returning * into rec;

  if rec.id is null then
    raise exception 'No such log, or it is not yours to change'
      using errcode = '42501';
  end if;

  return rec;
end
$$;

-- ---------------------------------------------------------------- read view

create view public.log_adjustment_details with (security_invoker = true) as
select
  a.*,
  i.full_name as intern_name,
  i.email     as intern_email,
  b.full_name as changed_by_name,
  l.log_date
from public.log_adjustments a
join public.profiles   i on i.id = a.intern_id
join public.profiles   b on b.id = a.changed_by
join public.daily_logs l on l.id = a.log_id;

-- ---------------------------------------------------------------- policies

alter table public.log_adjustments enable row level security;

-- An intern can see that their own attendance was altered, and by whom. An
-- audit trail the audited party cannot read is a weaker thing.
create policy log_adjustments_select on public.log_adjustments
  for select to authenticated
  using (
    intern_id = auth.uid()
    or public.current_role_name() = 'admin'
  );

-- No insert, update or delete policy, deliberately. Rows arrive only from the
-- trigger, which is security definer and bypasses RLS; nobody edits or erases
-- an entry afterwards through the API.

grant select on public.log_adjustments        to authenticated;

-- Supabase grants new tables in `public` to authenticated by default, so the
-- table arrives writable and only the missing policies stop a delete — which
-- then fails silently as "0 rows" rather than as an error. Same lesson as
-- 0005: take the privilege away so tampering is refused, not merely filtered.
revoke insert, update, delete on public.log_adjustments from authenticated;
grant select on public.log_adjustment_details to authenticated;
grant execute on function public.adjust_log_times(uuid, timestamptz, timestamptz, integer, text)
  to authenticated;

-- Keep 0005's posture: the signed-out role gets nothing new.
revoke all on public.log_adjustments        from anon;
revoke all on public.log_adjustment_details from anon;
revoke all on function public.adjust_log_times(uuid, timestamptz, timestamptz, integer, text)
  from anon;

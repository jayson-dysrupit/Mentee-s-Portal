-- 0008_audit_deletions.sql — deleting a day is recorded too, and the record
-- outlives the row.
--
-- 0007 logged every change to a clock time but left a hole either side of it:
--
--   * A delete went unrecorded. An admin could correct a day into something
--     convenient, or simply remove it, and only the correction left a trace.
--   * log_adjustments.log_id cascaded, so deleting a day also deleted its own
--     correction history. The audit disappeared with the evidence, which is
--     the one thing an audit table must not do.
--
-- So the foreign key becomes `on delete set null` and the row keeps enough of
-- its own context — log_date, and a jsonb snapshot of the deleted record — to
-- mean something after the daily_logs row is gone.
--
-- Limitation, stated rather than hidden: a delete run from the SQL editor or
-- with a service_role key is NOT audited, because changed_by must name a
-- profile and those callers have no auth.uid(). The same is true of 0007's
-- adjustments. The trail covers what the application and its users can do.

-- ---------------------------------------------------------------- columns

alter table public.log_adjustments
  add column if not exists action          text not null default 'adjust',
  add column if not exists snapshot        jsonb,
  add column if not exists log_date        date,
  add column if not exists changed_by_name text;

-- Why the actor's name is stored rather than joined: the view runs
-- security_invoker, so an intern reading their own audit row brings their own
-- RLS to the join — and profiles_select lets an intern read only themselves.
-- Joining profiles to name the admin therefore matched nothing and the INNER
-- JOIN dropped the intern's own row entirely: the audited party could not see
-- their own trail. Capturing the name at write time is also the more honest
-- record, since it says who the actor was then rather than who they are now.
update public.log_adjustments a
   set changed_by_name = p.full_name
  from public.profiles p
 where p.id = a.changed_by
   and a.changed_by_name is null;

alter table public.log_adjustments
  drop constraint if exists log_adjustments_action_check;
alter table public.log_adjustments
  add constraint log_adjustments_action_check check (action in ('adjust', 'delete'));

-- Carry the date on the row itself. The view used to read it through a join
-- to daily_logs, which cannot work once the row being described is gone.
update public.log_adjustments a
   set log_date = l.log_date
  from public.daily_logs l
 where l.id = a.log_id
   and a.log_date is null;

-- `field` names which stamp moved, and means nothing for a deletion.
alter table public.log_adjustments alter column field drop not null;
alter table public.log_adjustments drop constraint if exists log_adjustments_field_check;
alter table public.log_adjustments
  add constraint log_adjustments_field_check
  check (field is null or field in ('clock_in', 'clock_out', 'break_minutes'));

-- An adjustment names a field; a deletion carries a snapshot instead.
alter table public.log_adjustments drop constraint if exists log_adjustments_shape;
alter table public.log_adjustments
  add constraint log_adjustments_shape check (
    (action = 'adjust' and field is not null)
    or (action = 'delete' and field is null and snapshot is not null)
  );

-- ---------------------------------------------------------------- the key

-- This is the fix that matters. Cascading meant "delete the day, delete the
-- proof"; set null keeps the audit row and lets it stand on its own context.
alter table public.log_adjustments drop constraint if exists log_adjustments_log_id_fkey;
alter table public.log_adjustments alter column log_id drop not null;
alter table public.log_adjustments
  add constraint log_adjustments_log_id_fkey
  foreign key (log_id) references public.daily_logs (id) on delete set null;

-- ---------------------------------------------------------------- view

-- Dropped rather than replaced: the column list changes, and `create or
-- replace view` cannot reorder or rename existing columns.
drop view if exists public.log_adjustment_details;

create view public.log_adjustment_details with (security_invoker = true) as
select
  a.*,
  i.full_name as intern_name,
  i.email     as intern_email
from public.log_adjustments a
join public.profiles i on i.id = a.intern_id;

-- ---------------------------------------------------------------- trigger

create or replace function public.record_log_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  why   text := nullif(current_setting('app.adjustment_reason', true), '');
begin
  if actor is null then
    return old;
  end if;

  insert into public.log_adjustments
    (log_id, intern_id, changed_by, changed_by_name,
     action, field, reason, log_date, snapshot)
  values
    (null, old.intern_id, actor,
     (select full_name from public.profiles where id = actor),
     'delete', null, why, old.log_date, to_jsonb(old));

  return old;
end
$$;

-- AFTER, so a delete that is rolled back leaves no phantom entry.
create trigger daily_logs_audit_delete
  after delete on public.daily_logs
  for each row execute function public.record_log_deletion();

-- 0007's trigger predates the changed_by_name column; restated so adjustments
-- and deletions both stamp the actor.
create or replace function public.record_time_adjustments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  why   text := nullif(current_setting('app.adjustment_reason', true), '');
  who   text;
begin
  if actor is null or public.current_role_name() <> 'admin' then
    return null;
  end if;

  select full_name into who from public.profiles where id = actor;

  if new.clock_in is distinct from old.clock_in then
    insert into public.log_adjustments
      (log_id, intern_id, changed_by, changed_by_name, action, field, old_value, new_value, reason, log_date)
    values (new.id, new.intern_id, actor, who, 'adjust', 'clock_in',
            old.clock_in::text, new.clock_in::text, why, new.log_date);
  end if;

  if new.clock_out is distinct from old.clock_out then
    insert into public.log_adjustments
      (log_id, intern_id, changed_by, changed_by_name, action, field, old_value, new_value, reason, log_date)
    values (new.id, new.intern_id, actor, who, 'adjust', 'clock_out',
            old.clock_out::text, new.clock_out::text, why, new.log_date);
  end if;

  if new.break_minutes is distinct from old.break_minutes then
    insert into public.log_adjustments
      (log_id, intern_id, changed_by, changed_by_name, action, field, old_value, new_value, reason, log_date)
    values (new.id, new.intern_id, actor, who, 'adjust', 'break_minutes',
            old.break_minutes::text, new.break_minutes::text, why, new.log_date);
  end if;

  return null;
end
$$;

-- ---------------------------------------------------------------- rpc

-- The counterpart to adjust_log_times: one call so the reason reaches the
-- trigger in the same transaction. security invoker, so RLS still decides
-- whether this caller may delete this row.
create or replace function public.delete_log(p_log_id uuid, p_reason text default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  hit integer;
begin
  if public.current_role_name() <> 'admin' then
    raise exception 'Only an admin may delete a day'
      using errcode = '42501';
  end if;

  perform set_config('app.adjustment_reason', coalesce(p_reason, ''), true);

  delete from public.daily_logs where id = p_log_id;
  get diagnostics hit = row_count;

  if hit = 0 then
    raise exception 'No such log, or it is not yours to delete'
      using errcode = '42501';
  end if;
end
$$;

-- ---------------------------------------------------------------- grants

grant select on public.log_adjustment_details to authenticated;
grant execute on function public.delete_log(uuid, text) to authenticated;

revoke all on public.log_adjustment_details from anon;
revoke all on function public.delete_log(uuid, text) from anon;

-- Writing to the audit table stays closed; only the triggers put rows in it.
revoke insert, update, delete on public.log_adjustments from authenticated;

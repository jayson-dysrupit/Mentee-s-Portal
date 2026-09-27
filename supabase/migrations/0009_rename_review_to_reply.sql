-- 0009_rename_review_to_reply.sql — the schema catches up with the product.
--
-- "Review" implied an approval step that never existed. Nothing is gated on
-- it: hours count whether or not an admin reads the entry, and the intern
-- never waits on one. The UI says reply; these columns still said review, and
-- a schema that disagrees with the screen is a trap for whoever reads it next.
--
--   supervisor_comment -> reply
--   reviewed_at        -> replied_at
--   reviewed_by        -> replied_by
--   awaiting_review    -> awaiting_reply   (intern_progress)
--
-- Three things do NOT follow a column rename, and each would fail quietly:
--
--   * a plpgsql body is text, so guard_log_columns() would keep naming columns
--     that no longer exist and fail at the next update;
--   * a view's output column names are fixed when it is created, so
--     daily_log_details would still publish `supervisor_comment` however the
--     base table is spelt;
--   * an index NAME is cosmetic, though its predicate does follow.
--
-- So the function and both views are restated here in full.

-- ---------------------------------------------------------------- columns

alter table public.daily_logs rename column supervisor_comment to reply;
alter table public.daily_logs rename column reviewed_at        to replied_at;
alter table public.daily_logs rename column reviewed_by        to replied_by;

alter index if exists daily_logs_review_queue_idx rename to daily_logs_reply_queue_idx;

-- ---------------------------------------------------------------- guard

-- As 0007, with the three renamed columns. The rule is unchanged: an admin
-- writes the reply and the clock times, the intern writes everything else,
-- and neither writes the other's.
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

  new.intern_id    := old.intern_id;
  new.log_date     := old.log_date;
  new.clock_in     := old.clock_in;
  new.clock_in_lat := old.clock_in_lat;
  new.clock_in_lng := old.clock_in_lng;
  new.reply        := old.reply;
  new.replied_at   := old.replied_at;
  new.replied_by   := old.replied_by;
  return new;
end
$$;

-- ---------------------------------------------------------------- views

-- intern_progress reads daily_log_details, so it goes first and comes back last.
drop view if exists public.intern_progress;
drop view if exists public.daily_log_details;

create view public.daily_log_details with (security_invoker = true) as
select
  l.*,
  p.email         as intern_email,
  p.full_name     as intern_name,
  p.team          as intern_team,
  p.supervisor_id as intern_supervisor_id,
  case when l.clock_out is null then 'open' else 'submitted' end as status,
  case
    when l.clock_out is null then null
    else greatest(
      0::numeric,
      round(
        extract(epoch from (l.clock_out - l.clock_in)) / 3600.0
          - l.break_minutes / 60.0,
        2
      )
    )
  end as hours_worked
from public.daily_logs l
join public.profiles p on p.id = l.intern_id;

create view public.intern_progress with (security_invoker = true) as
select
  p.id,
  p.email,
  p.full_name,
  p.team,
  p.supervisor_id,
  p.active,
  p.internship_start,
  p.internship_end,
  p.required_hours,
  count(d.id) filter (where d.clock_out is not null)  as days_logged,
  coalesce(sum(d.hours_worked), 0)::numeric(8, 2)     as hours_logged,
  count(d.id) filter (where d.clock_out is null)      as days_open,
  count(d.id) filter (
    where d.clock_out is not null and d.replied_at is null
  )                                                   as awaiting_reply,
  max(d.log_date)                                     as last_log_date
from public.profiles p
left join public.daily_log_details d on d.intern_id = p.id
where p.role = 'intern'
group by p.id;

-- ---------------------------------------------------------------- grants

-- Dropping a view drops its grants with it.
grant select on public.daily_log_details to authenticated;
grant select on public.intern_progress   to authenticated;

revoke all on public.daily_log_details from anon;
revoke all on public.intern_progress   from anon;

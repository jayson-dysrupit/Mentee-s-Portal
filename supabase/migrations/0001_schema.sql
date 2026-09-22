-- 0001_schema.sql — tables, triggers and read views.
--
-- Design notes, because three of these are load-bearing:
--
--  * daily_logs is unique on (intern_id, log_date). The day is the unit of
--    work, so "clock in twice today" is a constraint violation rather than a
--    second row nobody reconciles.
--
--  * daily_logs_reflection_required makes the learning entry structural: a row
--    may not carry a clock_out unless worked_on and learned are both non-empty.
--    Clocking out and writing the reflection are therefore one UPDATE. The
--    rule lives in the database, so it holds for the UI, a stray SQL editor
--    session, and anything built against this schema later.
--
--  * hours_worked is computed in a view rather than stored. Attendance is
--    derived from clock_in, clock_out and break_minutes; storing it invites a
--    second source of truth that drifts.
--
-- Order matters in this file. Postgres validates the body of a `language sql`
-- function when you create it, so the helper functions come after the tables
-- they read, and the triggers come after the functions they call.
--
-- gen_random_uuid() is core since PG13, so no pgcrypto extension is required.

-- ---------------------------------------------------------------- profiles

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  email            text not null unique,
  full_name        text not null default '',
  role             text not null default 'intern'
                     check (role in ('intern', 'supervisor', 'admin')),
  team             text,
  supervisor_id    uuid references public.profiles (id) on delete set null,
  internship_start date,
  internship_end   date,
  required_hours   numeric(6, 1) check (required_hours is null or required_hours > 0),
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint profiles_not_own_supervisor
    check (supervisor_id is null or supervisor_id <> id),
  constraint profiles_internship_order
    check (internship_start is null
           or internship_end is null
           or internship_end >= internship_start)
);

create index profiles_supervisor_idx on public.profiles (supervisor_id);

create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- skills

create table public.skills (
  id       bigint generated always as identity primary key,
  name     text not null unique,
  category text not null default 'General',
  active   boolean not null default true
);

-- ---------------------------------------------------------------- daily_logs

create table public.daily_logs (
  id                 uuid primary key default gen_random_uuid(),
  intern_id          uuid not null references public.profiles (id) on delete cascade,
  log_date           date not null default current_date,

  clock_in           timestamptz not null default now(),
  clock_out          timestamptz,
  break_minutes      integer not null default 60 check (break_minutes between 0 and 480),
  work_mode          text not null default 'office'
                       check (work_mode in ('office', 'remote', 'client_site')),
  clock_in_lat       double precision,
  clock_in_lng       double precision,
  clock_out_lat      double precision,
  clock_out_lng      double precision,

  worked_on          text,
  learned            text,
  blockers           text,
  plan_tomorrow      text,
  skills             text[] not null default '{}',
  confidence         smallint check (confidence between 1 and 5),

  supervisor_comment text,
  reviewed_at        timestamptz,
  reviewed_by        uuid references public.profiles (id) on delete set null,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint daily_logs_one_per_day unique (intern_id, log_date),
  constraint daily_logs_clock_order check (clock_out is null or clock_out > clock_in),
  constraint daily_logs_reflection_required
    check (
      clock_out is null
      or (length(btrim(coalesce(worked_on, ''))) > 0
          and length(btrim(coalesce(learned, ''))) > 0)
    )
);

create index daily_logs_intern_date_idx on public.daily_logs (intern_id, log_date desc);
create index daily_logs_open_idx on public.daily_logs (intern_id) where clock_out is null;
create index daily_logs_skills_idx on public.daily_logs using gin (skills);
create index daily_logs_review_queue_idx on public.daily_logs (intern_id)
  where clock_out is not null and reviewed_at is null;

create trigger daily_logs_touch
  before update on public.daily_logs
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- helpers
--
-- security definer with a pinned search_path is the Supabase-recommended
-- shape. The definer rights are what stop a policy on profiles from recursing
-- into itself when it needs to know the caller's role.

create or replace function public.current_role_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_supervisor_of(target_intern uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = target_intern
      and supervisor_id = auth.uid()
  )
$$;

-- ---------------------------------------------------------------- column guards
--
-- RLS decides which rows you may touch. These decide which columns, which a
-- policy cannot express.

-- Interns and supervisors may edit their own profile row, so the columns that
-- decide what they can see are pinned back to their old values rather than
-- being left to the UI.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No end-user JWT means a migration, the SQL editor or a service_role key,
  -- all of which are trusted; an admin is trusted too. Everyone else has the
  -- privileged columns pinned back to their previous values.
  if auth.uid() is null or public.current_role_name() = 'admin' then
    return new;
  end if;

  new.email            := old.email;
  new.role             := old.role;
  new.supervisor_id    := old.supervisor_id;
  new.required_hours   := old.required_hours;
  new.internship_start := old.internship_start;
  new.internship_end   := old.internship_end;
  new.active           := old.active;
  return new;
end
$$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- Both sides of a log row may update it, for different reasons. The intern
-- writes the record; the reviewer writes the feedback. Neither may write the
-- other's columns, and the clock-in stamp is nobody's to rewrite.
create or replace function public.guard_log_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Trusted server-side callers (migrations, SQL editor, service_role) write
  -- whatever they ask for; see guard_profile_privileges.
  if auth.uid() is null then
    return new;
  end if;

  if public.is_supervisor_of(new.intern_id) or public.current_role_name() = 'admin' then
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

create trigger daily_logs_guard
  before update on public.daily_logs
  for each row execute function public.guard_log_columns();

-- ---------------------------------------------------------------- signup
--
-- A profile row per auth user, created inside the signup transaction so the
-- app never has to handle a signed-in user with no profile.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- views
--
-- security_invoker = true is not optional. Without it a view runs with its
-- owner's rights and reads straight past the RLS policies in 0002, which
-- would hand every intern the whole table.

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
    where d.clock_out is not null and d.reviewed_at is null
  )                                                   as awaiting_review,
  max(d.log_date)                                     as last_log_date
from public.profiles p
left join public.daily_log_details d on d.intern_id = p.id
where p.role = 'intern'
group by p.id;

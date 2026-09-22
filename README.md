# DysrupIT Intern Log

Time in / time out plus a daily learning reflection, one record per intern per
day. Vue 3 + Vite front end talking straight to Supabase — Postgres for the
data, Supabase Auth for sign-in, and row level security for the access rules.
There is no backend server to run or host.

```bash
npm install
cp .env.example .env     # then paste your Supabase URL + anon key
npm run dev              # :5174
npm run verify:schema    # 42 assertions against a real Postgres, no setup
npm run type-check
```

## Setup

**1. Create a Supabase project** at `supabase.com/dashboard`. Free tier is fine.

**2. Run the migrations.** Open the SQL editor and run, in order:

| File                                                | What it does                                    |
| --------------------------------------------------- | ----------------------------------------------- |
| `supabase/migrations/0001_schema.sql`               | tables, constraints, guard triggers, read views |
| `supabase/migrations/0002_policies.sql`             | row level security and grants                   |
| `supabase/migrations/0003_seed_skills.sql`          | the skill tag list                              |
| `supabase/migrations/0004_optional_domain_lock.sql` | **skip this one** — see below                   |
| `supabase/migrations/0005_revoke_anon.sql`          | takes the signed-out role off the public schema |
| `supabase/migrations/0006_drop_supervisor_role.sql` | two roles only: `intern` and `admin`            |

`0004` is deliberately not part of the run. It restricts signups to a list of
company domains, and interns sign up with whatever personal mailbox they
already have — applying it would reject those addresses inside the signup
transaction and lock the cohort out of their own accounts. The file stays in
the repo for a future intake that is issued company mailboxes; its header says
what to change first. Everything else assumes it is unapplied.

**3. Add your keys.** `Settings → API` gives you the Project URL and the
publishable (or legacy anon) key. Put both in `.env` **under the `VITE_` names
in `.env.example`** — Vite only exposes variables prefixed `VITE_`, and the
snippet Supabase shows in the dashboard uses Next.js's `NEXT_PUBLIC_` names. Copy
that verbatim and both values arrive `undefined`, so the app shows the setup
screen as though you had never added them. Either key format works.

The key is designed to ship in a browser bundle: it grants exactly what the
policies in `0002` allow, and after `0005` the signed-out role cannot reach the
tables at all.

**4. Turn on sign-in.** `Authentication → Providers → Email` is on by default
and already allows email + password, which is the flow the app leads with. Two
settings there are worth a look:

- **Confirm email.** On by default. Leave it on and a new account gets a
  confirmation mail before it can sign in; the signup screen says so. Turn it
  off and `Create account` signs you straight in — convenient while you are
  setting the project up.
- **Minimum password length.** Supabase's floor is 6. The app enforces 8 of its
  own accord (`MIN_PASSWORD` in `src/stores/auth.ts`); raise the project
  setting to match if you want it enforced server-side too.

Then add the reset URL under `Authentication → URL Configuration → Redirect
URLs`, or the emailed link will bounce:

```
http://localhost:5174/reset-password
https://your-deployed-host/reset-password
```

**A caution about email volume.** Confirmation is on for this project
(`mailer_autoconfirm: false`), so every new account waits on a mail — and
Supabase's built-in SMTP is rate-limited and explicitly not meant for
production. Onboard a whole cohort in one sitting and the later signups will
silently not receive anything. Pick one before intake day:

- **Enable Google** (`Authentication → Providers → Google`). Interns on Gmail
  sign in with one tap, and a Google account is already verified, so no
  confirmation mail is sent at all. This sidesteps the limit entirely and is
  the least work on the day.
- **Configure custom SMTP** (`Project Settings → Auth → SMTP Settings`) with
  your own provider, if you want to keep email + password for everyone.
- **Turn Confirm email off** for a controlled intake where you already know who
  is signing up, and rely on step 6 to link only the people you expect.

Magic link and Google are kept as alternates. The login screen renders the
Google button only when the provider is actually enabled — it asks the project
on load — so nothing shows a control that would answer "provider is not
enabled". Magic link needs nothing further;
for the Google button, enable Google and add your OAuth client — the app works
without it.

**4b. Decide who may sign up.** Worth a minute, because it is the control that
replaces the domain rule. Interns use personal addresses, so the email suffix
no longer tells you anything about who belongs — with open signup, anyone who
finds the URL can create an account.

That is not a data leak: a stranger's account is an `intern` with no
`supervisor_id`, and RLS means they see their own rows and nobody else's, while
no supervisor sees theirs. It is a junk-rows problem, not an exposure one.

For a known cohort the tidy answer is to close signup and invite people:

- `Authentication → Providers → Email` → turn **Allow new users to sign up** off.
- Invite each intern from `Authentication → Users → Invite user`. They get a
  link, set a password, and `handle_new_user()` seeds their profile exactly as a
  self-signup would.

Leave signup open if you would rather interns onboard themselves; just expect
to tidy up the occasional stray account.

**5. Make yourself the first admin.** Sign in once so your profile row exists,
then in the SQL editor:

```sql
update public.profiles set role = 'admin' where email = 'you@dysrupit.com';
```

**6. Set up an intern.** Have them sign in once, then link them:

```sql
update public.profiles
   set supervisor_id  = (select id from public.profiles where email = 'supervisor@dysrupit.com'),
       required_hours = 480,
       team           = 'Engineering'
 where email = 'intern.personal.address@gmail.com';
```

Or promote a supervisor with `set role = 'supervisor'`. Roles are `intern`,
`supervisor`, `admin`.

## How it is put together

Three rules carry most of the weight, and all three live in the database rather
than the UI.

**A closed day always carries its reflection.** `daily_logs_reflection_required`
refuses any row that has a `clock_out` but no `worked_on` and `learned`.
Clocking out and writing the reflection are therefore a single UPDATE — not a
convention the front end follows, a constraint it cannot violate. Point another
client at this schema and the rule still holds.

**One record per intern per day.** `unique (intern_id, log_date)`. Clocking in
twice is a constraint violation, not a duplicate row for someone to reconcile.

**Signing in is Supabase's problem, not the app's.** Passwords are hashed and
held in `auth.users`; this codebase never sees one. Creating an account fires
`handle_new_user()`, which seeds the `profiles` row from the signup metadata —
so a profile always exists by the time the app loads one, whether the person
arrived by password, magic link or Google. A failed sign-in says the same thing
for a wrong password as for an unknown address, on purpose: the form should not
double as a way to find out who has an account.

**The signed-out role is off the schema entirely.** Supabase grants the `public`
schema to `anon` by project default, so `0002` granting to `authenticated` did
not take that away — a signed-out read of a live project returned `200 []`
rather than `permission denied`. RLS held (zero rows out, inserts rejected
42501), so nothing leaked, but RLS was the only thing there. `0005` revokes the
grant, which is what makes a future table missing `enable row level security`
fail closed instead of publishing itself. `verify:schema` grants anon the same
default first, so the test proves a revoke rather than asserting into a vacuum.

**Access is decided server-side.** Policies in `0002_policies.sql` mean an
intern's rows are never sent to another intern's browser. A supervisor sees
their own interns and deliberately not another supervisor's. Hiding things in
the UI is not part of the security model.

Policies pick _rows_; a policy cannot say "you may update this row but not that
column". So two guard triggers in `0001` pin the columns: an intern cannot write
`supervisor_comment` or promote themselves, and a reviewer cannot rewrite the
intern's own words. Both guards exempt callers with no end-user JWT, which is
how migrations, the SQL editor and `service_role` keep working.

`hours_worked` is computed in the `daily_log_details` view, not stored — clock
times and the break are the facts, hours are derived. Both views are declared
`security_invoker = true`; without it a view runs with its owner's rights and
reads straight past RLS.

The 48-hour window is deliberate: an intern can write today and close out
yesterday, and nothing older. Nobody back-files a week of attendance.

### Layout

```
src/
  lib/supabase.ts      client + error humanizing; isConfigured gates the setup screen
  lib/format.ts        durations, hours, local-date helpers
  lib/location.ts      one-shot geolocation, resolves null on denial
  stores/auth.ts       session, profile, role; password, magic link, reset
  stores/logs.ts       my logs, clock in/out, amend
  stores/team.ts       supervisor reads and review writes
  components/TimeTable.vue  sortable time table, shared by Time log and Team
  views/               Login, ResetPassword, Today, TimeLog, Learnings, Team
supabase/migrations/   the schema, applied in order
scripts/verify-schema.mjs
```

## Monitoring mentees

`/team` is the supervisor and admin screen. It carries three things:

- **Mentee cards** — hours against target, days logged, days still open, how
  many entries await review, last log date. Click one to scope the rest of the
  page to that person; click again to clear.
- **Time rendered** — every logged day, as a sortable table or a month
  calendar. The calendar puts `present/total in` and the day's total hours in
  each cell; picking a day names who was in, their clock times and hours, and
  lists who was not. Drilling into one mentee scopes the calendar too.
- **Sorting** — in the table view, Any column heading
  sorts; In and Out sort by _time of day_ rather than absolute instant, because
  the Day column already answers chronological order and "who starts late" is
  the question the column is there for. Open days have no clock-out and no
  hours, so they sink to the bottom whichever way you sort rather than posing
  as zero. Status sorts Open → Submitted → Reviewed, which puts what needs
  attention first.
- **Learning entries** — the reflections, filtered to awaiting-review by
  default, with inline feedback.

An intern's own Time log carries the same two views: that table minus the Who
column, and a calendar of hours per day with open days flagged. Both calendars
open on the month of the most recent entry rather than always on today, and
weeks run Monday to Sunday so the weekend sits together.

Who sees what is decided in `0002`, not in the UI: a supervisor sees the people
whose `profiles.supervisor_id` points at them, an admin sees everyone. **If you
are not linking mentees to mentors, whoever monitors needs `role = 'admin'`** —
a supervisor with no links sees an empty page, by design.

### What each role sees

| Role     | Today | Time log | Learnings | Team |
| -------- | ----- | -------- | --------- | ---- |
| `intern` | yes   | yes      | yes       | no   |
| `admin`  | no    | no       | no        | yes  |

`supervisor` was removed in `0006`. It existed so a mentor could see only their
own mentees, which required every intern linked through
`profiles.supervisor_id` — and that linking was dropped as a product decision,
leaving an unlinked supervisor staring at an empty page. Anyone monitoring was
already an admin in practice. The migration promotes any existing supervisor to
admin before tightening the check constraint, so nobody is locked out by their
own row failing it.

`profiles.supervisor_id` is left in place but unread; `0006`'s header carries
the SQL to drop it too, which also means rebuilding both views.

An admin does not clock in, so their own Today, Time log and Learnings would be
three tabs of nothing. Those routes redirect to Team and the links are dropped
from the nav; `/` lands them on Team too. The redirect is a router guard, so
typing the URL behaves the same as clicking — and it runs before render, so
there is no flash of a screen they were never meant to see.

An admin does not clock in, so those routes redirect to Team and their links
leave the nav.

## Verifying the schema

`npm run verify:schema` applies the migrations to a real Postgres 16 — PGlite,
compiled to WASM — and asserts the behaviour: that the constraints reject bad
rows, that hours compute correctly, and that one intern genuinely cannot read
another's entries. No Docker, no Supabase project, no network.

It shims the three things Supabase provides at the platform level:
`auth.users`, `auth.uid()`, and the `authenticated` / `anon` roles. `auth.uid()`
reads the same `request.jwt.claims` setting as the real implementation, which is
what makes impersonating a user in the test meaningful.

Run it after any migration change. It caught two real bugs during the build:
helper functions declared before the tables they read (Postgres validates
`language sql` bodies at creation), and guard triggers that also blocked the
operator — which would have made step 5 above silently do nothing.

## What is deliberately not built

Named seams, not oversights.

- **No geofence.** `clock_in_lat/lng` are captured, but nothing validates
  location. `0004` shows the shape a signup-time rule takes if you ever want
  one; whether to block a remote clock-in is a people decision, not a schema
  one.
- **No company-email requirement.** Interns sign in with personal addresses, so
  identity is the account, not the domain. Linking a person to the organisation
  is `profiles.supervisor_id`, set by an admin in step 6 — deliberately a
  human act rather than something inferred from an email suffix.
- **No overtime, holiday or leave rules.** `hours_worked` is raw attendance.
- **No reminder job.** A Supabase scheduled function over
  `daily_logs where clock_out is null` is the obvious add; the `daily_logs_open_idx`
  partial index is already there for it.
- **No export.** `daily_log_details` is a clean view to select from; there is no
  CSV or payroll integration.
- **Skills are a `text[]`**, not a join table, so one write closes a day. The
  `skills` table drives the picker and the GIN index makes tag queries fast. A
  join table is the upgrade if you need per-skill reporting with referential
  integrity.
- **No admin UI.** Roster changes are SQL, as in steps 5 and 6.
- **No account settings screen.** `updatePassword` in the auth store is written
  to be reusable, but the only thing that calls it today is the reset flow. A
  "change your password" form is a view away.
- **No password strength meter.** The rule is a length floor, not a policy.
  Supabase can also check passwords against HaveIBeenPwned — that is a project
  setting, not app code.

## Placeholders

`required_hours 480` in the README example is 12 weeks × 40 hours — invented.
Set it from your actual internship agreement. The default break of 60 minutes
is in `daily_logs.break_minutes`; change the column default if your policy
differs.

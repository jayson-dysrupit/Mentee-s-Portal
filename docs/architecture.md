# Architecture

Vue 3 + Vite in the browser, Supabase for everything else. There is no API
layer of our own: the client talks to PostgREST, and every access rule is a
row level security policy.

## Data model

| Object                   | Holds                                                         |
| ------------------------ | ------------------------------------------------------------- |
| `profiles`               | one row per auth user; `role`, `team`, `required_hours`       |
| `daily_logs`             | one row per intern per day: clock times, break, reflection    |
| `skills`                 | the tag list behind the skill picker                          |
| `log_adjustments`        | audit trail of admin edits and deletions                      |
| `daily_log_details` view | `daily_logs` + intern name, `status`, computed `hours_worked` |
| `intern_progress` view   | one row per intern with running totals                        |

`hours_worked` is computed in the view, never stored. Clock times and the break
are the facts; hours are derived, so there is no second source of truth to
drift.

Both views are declared `security_invoker = true`. Without it a view runs with
its owner's rights and reads straight past RLS.

## Roles

Two: `intern` and `admin`. New accounts arrive as interns.

| Route                      | intern | admin |
| -------------------------- | ------ | ----- |
| Today, Time log, Learnings | yes    | no    |
| Team                       | no     | yes   |

An admin does not clock in, so their own Today and Learnings would be empty.
Those routes redirect to Team and the links leave the nav. The redirect is a
router guard, so typing the URL behaves like clicking, and it runs before
render so there is no flash.

`supervisor` was removed in `0006`. It existed so a mentor could see only their
own mentees, which required linking every intern to a mentor — and that linking
was dropped as a product decision, leaving an unlinked supervisor with an empty
page. `profiles.supervisor_id` survives as an unread column; `0006`'s header
has the SQL to drop it.

## What the database enforces

Policies pick _rows_; a policy cannot say "you may update this row but not that
column". So guard triggers pin the columns, and both are needed.

**Interns** may write their own log for today or yesterday. Older rows are
frozen — nobody back-files a week of attendance. They cannot touch
`supervisor_comment`, their own `role`, or `required_hours`.

**Admins** may read everything, leave feedback, correct clock times and delete
a day. They cannot rewrite `intern_id`, `log_date`, `work_mode`, or any word
the intern wrote. Correcting attendance is not editing someone's diary.

**Signed-out callers** get nothing. `0005` revokes the `public` schema from
`anon`, because Supabase grants new tables to it by default — reads were
returning `200 []` rather than `permission denied`. Nothing leaked, RLS saw to
that, but RLS was the only layer. Now a future table where somebody forgets
`enable row level security` fails closed instead of publishing itself.

## The audit trail

Every admin change to `clock_in`, `clock_out` or `break_minutes`, and every
deleted day, lands in `log_adjustments` with the old value, the new one, who
did it, when, and why.

It is written by a **trigger**, not by the app. An edit made from the SQL
editor, a script or a future client is recorded identically, so there is no
code path that changes a clock time quietly. The app calls `adjust_log_times()`
and `delete_log()` only so the admin's _reason_ reaches the trigger in the same
transaction; a plain `UPDATE` is still audited, just without one.

Two details worth knowing:

- **`log_id` is `on delete set null`, not cascade.** Cascading meant deleting a
  day also deleted its own correction history — the audit vanished with the
  evidence. Each row now carries its own `log_date` and a jsonb `snapshot` of
  the deleted record, so it still means something once the day is gone.
- **The actor's name is stored, not joined.** The view runs `security_invoker`,
  so an intern reading their own trail brings their own RLS to the join — and
  an intern may read only their own profile. Joining `profiles` to name the
  admin matched nothing and the inner join dropped the intern's row entirely.

Interns can read their own adjustment rows; an audit trail the audited party
cannot see is a weaker thing. Nobody can edit or delete an entry through the
API — there is no policy for it, and `authenticated` has the write privileges
revoked outright, so tampering is refused rather than filtered to zero rows.

**What it does not cover:** anything done with no end-user JWT — the SQL
editor, a `service_role` key, a migration. `changed_by` must name a profile and
those callers have none. The trail covers what the application and its users
can do.

## Verifying the schema

```bash
npm run verify:schema
```

Applies the migrations to a real Postgres 16 — PGlite, compiled to WASM — and
asserts the behaviour rather than the intent: that the constraints reject bad
rows, that hours compute correctly, that one intern cannot read another's
entries, and that the audit survives a deletion. 78 assertions, no Docker, no
network, no Supabase project.

It shims the three things Supabase provides at the platform level: `auth.users`,
`auth.uid()`, and the `authenticated` / `anon` roles — including the default
privileges a real project grants, without which the `0005` and `0007` tests
would assert into a vacuum and pass while proving nothing.

Run it after any migration change. It has caught real bugs: helper functions
declared before the tables they read, guard triggers that also blocked the
operator, an audit table that arrived deletable, and a view whose join hid the
audit from the person being audited.

## What is deliberately not built

Named seams, not oversights.

- **No geofence.** `clock_in_lat/lng` are captured; nothing validates them.
- **No overtime, holiday or leave rules.** `hours_worked` is raw attendance.
- **No reminder job.** A scheduled function over `daily_logs where clock_out is
null` is the obvious add; the partial index is already there for it.
- **No account settings screen.** `updateName` and `updatePassword` exist in
  the auth store, but only the reset flow calls the latter and nothing calls
  the former — a mistyped display name needs SQL.
- **No roster UI.** Hour targets and roles are SQL; see [Operations](operations.md).
- **Skills are a `text[]`**, not a join table, so one write closes a day. A join
  table is the upgrade if you need per-skill reporting.

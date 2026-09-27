# Operations

Day-to-day admin tasks. Anything not in the UI is SQL, run from the Supabase
SQL editor.

## In the app

All of this lives on **Team**, which only admins see.

| Task                    | Where                                           |
| ----------------------- | ----------------------------------------------- |
| See one intern only     | Click their name in the table; again to clear   |
| Sort the time table     | Click any column heading                        |
| See who was in on a day | Time rendered → **Calendar** → pick a day       |
| Correct a clock time    | Time rendered → **Table** → **Edit** on the row |
| See past corrections    | **Corrections** button, top right               |
| Delete a day            | Same dialog → _Delete this day instead_         |
| Reply to an entry       | Learning entries → _Reply_                      |
| Export a month          | Month picker → **Export CSV**                   |

**Corrections and deletions both require a reason.** It is stored with your
name and the old value, and appears in the **Corrections** panel — the button
at the top right. A deletion's record outlives the day it removed.

**Replying is not approval.** Nothing is gated on it: hours count whether or
not anyone reads the entry, and the intern never waits on you. The _No reply_
filter is a reading list, not a queue.

**Sorting notes.** In and Out sort by _time of day_, not absolute instant — the
Day column already gives chronological order, so this answers "who starts
late". Open days have no hours and sink to the bottom whichever way you sort.
Status sorts Open → Closed → Replied, so what needs attention is first.

**The CSV** covers the chosen month, scoped to one intern if you have drilled
into one. Hours export as a bare number so the column sums.

## Roster SQL

Everyone signs in once first — that creates their profile row.

**Promote an admin.** They lose Today, Time log and Learnings, since admins do
not clock in. Keep a separate intern account if you also want to log hours.

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

**Set an intern's target.** New accounts are already `intern`; this only sets
the hour target and team. Leave `required_hours` unset and the progress bar
simply does not appear.

```sql
update public.profiles
   set required_hours = 480,
       team           = 'Engineering'
 where email = 'intern@example.com';
```

**Fix a display name.** There is no UI for this.

```sql
update public.profiles set full_name = 'Juan Dela Cruz'
 where email = 'intern@example.com';
```

**See who has signed up.**

```sql
select email, full_name, role, created_at
  from public.profiles order by created_at desc;
```

**Deactivate someone** rather than deleting them — deleting a profile cascades
their whole attendance history.

```sql
update public.profiles set active = false where email = 'intern@example.com';
```

## Editing a day in SQL

The UI covers this; these are for bulk or historical fixes outside the app.

Corrections made here are **not** audited — the trigger needs an end-user JWT
to name who made the change, and the SQL editor has none.

**Always write the timezone offset.** Without one, Postgres reads the literal
in the session timezone, which is **UTC** in the SQL editor: `'09:00'` would
land as 5:00 PM Manila. This is the easiest way to silently corrupt a day.

```sql
update public.daily_logs
   set clock_in = '2026-09-24 09:00:00+08'::timestamptz
 where intern_id = (select id from public.profiles where email = 'intern@example.com')
   and log_date  = '2026-09-24';
```

You cannot move a clock-in past its clock-out; the constraint rejects it. Shift
both in one statement if you are moving a whole day.

**Look before you delete** — there is no undo and the reflection goes too:

```sql
select intern_name, log_date, clock_in, clock_out, hours_worked, learned
  from public.daily_log_details where id = '<uuid>';

delete from public.daily_logs where id = '<uuid>';
```

Deleting frees that date, since one record per intern per day is a unique
constraint.

## Reading the audit trail

```sql
select log_date, intern_name, action, field, old_value, new_value,
       changed_by_name, reason, created_at
  from public.log_adjustment_details
 order by created_at desc;
```

`action` is `adjust` or `delete`. For a deletion, `snapshot` holds the whole
row that was removed.

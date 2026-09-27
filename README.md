# DysrupIT Intern Log

Interns clock in and out once a day and write down what they learned. Admins
watch the hours, read the reflections and correct mistakes.

Vue 3 + Vite talking straight to Supabase — Postgres for the data, Supabase
Auth for sign-in, row level security for the access rules. No backend server
to run or host.

```bash
npm install
cp .env.example .env     # paste your Supabase URL + key (VITE_ names, see docs)
npm run dev              # :5174
```

| Command                 | What it does                                    |
| ----------------------- | ----------------------------------------------- |
| `npm run dev`           | dev server on :5174                             |
| `npm run build`         | type-check, then build to `dist/`               |
| `npm run verify:schema` | 78 assertions against a real Postgres, no setup |
| `npm run type-check`    | `vue-tsc` only                                  |
| `npm run format`        | Prettier                                        |

## Documentation

| Document                                 | For                                           |
| ---------------------------------------- | --------------------------------------------- |
| **[Setup](docs/setup.md)**               | Supabase project, migrations, auth, deploying |
| **[Architecture](docs/architecture.md)** | Data model, roles, what the database enforces |
| **[Operations](docs/operations.md)**     | Admin runbook — roster, corrections, export   |

## What it does

**Interns** clock in, clock out, and write a reflection when they close the
day. They see their own hours as a table or a calendar, and their own journal
of what they learned.

**Admins** see every intern: hours against target, days still open, entries
awaiting review. They can read the reflections and leave feedback, correct a
mistyped clock time, delete a day, and export a month as CSV. They do not clock
in themselves, so the intern screens are not shown to them.

## The three rules that carry it

All three live in the database, not in the Vue app, so they hold for the UI, a
stray SQL editor session, and anything built against this schema later.

**A closed day always carries its reflection.** A row may not have a
`clock_out` unless `worked_on` and `learned` are both filled in, so clocking
out and writing the reflection are a single write rather than a convention the
front end follows.

**One record per intern per day.** A unique constraint, so clocking in twice is
an error rather than a duplicate row for somebody to reconcile.

**Access is decided server-side.** Policies mean one intern's rows are never
sent to another intern's browser. Hiding things in the UI is not part of the
security model.

## Layout

```
src/
  lib/          supabase client, formatting, calendar maths, CSV
  stores/       auth · logs (mine) · team (admin)
  views/        Login · ResetPassword · Today · TimeLog · Learnings · Team
  components/   clock card, reflection form, time table, calendar, dialogs
supabase/migrations/   the schema, applied in order
scripts/verify-schema.mjs
```

## Licence and scope

Internal tool. See [Architecture](docs/architecture.md#what-is-deliberately-not-built)
for the things that are deliberately missing rather than overlooked.

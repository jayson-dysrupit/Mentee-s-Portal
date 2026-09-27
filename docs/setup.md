# Setup

## 1. Create a Supabase project

At `supabase.com/dashboard`. Free tier is fine.

## 2. Run the migrations

SQL editor, in order. **Skip `0004`.**

| File                        | What it does                                       |
| --------------------------- | -------------------------------------------------- |
| `0001_schema.sql`           | tables, constraints, guard triggers, read views    |
| `0002_policies.sql`         | row level security and grants                      |
| `0003_seed_skills.sql`      | the 15 skill tags                                  |
| `0004_optional_domain_lock` | **do not run** — see below                         |
| `0005_revoke_anon.sql`      | takes the signed-out role off the `public` schema  |
| `0006_drop_supervisor_role` | two roles only: `intern` and `admin`               |
| `0007_time_adjustments.sql` | admins may correct clock times; every edit logged  |
| `0008_audit_deletions.sql`  | deletions logged too, and the log outlives the row |

`0004` restricts sign-up to company email domains. Interns sign up with
personal addresses, so applying it rejects them inside the signup transaction
and locks the cohort out of their own accounts. It stays in the repo for a
future intake issued company mailboxes; its header says what to change first.

## 3. Add your keys

`Settings → API` gives you the Project URL and the publishable (or legacy anon)
key. Put both in `.env` **under the `VITE_` names** from `.env.example`:

```
VITE_SUPABASE_URL=https://your-ref.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

Vite only exposes variables prefixed `VITE_`. The snippet Supabase shows in the
dashboard uses Next.js's `NEXT_PUBLIC_` names — copy that verbatim and both
values arrive `undefined`, so the app shows the setup screen as though you had
never added them.

The key is designed to ship in a browser bundle: it grants exactly what the
policies in `0002` allow, and after `0005` the signed-out role cannot reach the
tables at all.

## 4. Configure sign-in

`Authentication → Providers → Email` is on by default and allows email +
password, which is the flow the app leads with.

**Add the reset URL** under `Authentication → URL Configuration → Redirect
URLs`, or the emailed link will bounce:

```
http://localhost:5174/reset-password
https://your-app.vercel.app/**
```

**Email volume.** Supabase's built-in mailer is rate-limited to roughly 2
emails an hour across _all_ auth mail — confirmations, magic links and password
resets share the allowance. Onboard a cohort in one sitting and the later
signups silently receive nothing. Pick one before intake day:

- **Enable Google.** Interns on Gmail sign in with one tap and those accounts
  are pre-verified, so no mail is sent at all. The login screen renders the
  Google button only once the provider is actually enabled.
- **Custom SMTP** (`Project Settings → Auth → SMTP`) raises the default to 30
  an hour.
- **Turn off Confirm email** for a known intake. Signup then sends nothing.
  Password resets still consume the allowance.

**Closing sign-up.** Nothing verifies that a person owns the address they
typed, and anyone with the URL can create an account. That is not an exposure —
RLS means a stranger sees only their own rows — but you will collect junk
profiles. For a known cohort, turn off _Allow new users to sign up_ after
intake and add people from `Authentication → Users → Add user` with **Auto
Confirm** ticked, which also sends no email.

## 5. Make the first admin

Sign in once so the profile row exists, then:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

Reload — no sign-out needed. See [Operations](operations.md) for the rest.

For the very first admin, `Authentication → Users → Add user` with **Auto
Confirm** avoids the email limit entirely. It does not set a display name, so
set `full_name` in the same `update`.

## Deploying

The build is static; any host that serves a folder will do. Three things trip
up every first deploy.

**Environment variables must exist at build time.** Vite inlines
`import.meta.env.VITE_*` when it compiles — it does not read them at runtime.
`.env` is gitignored, so a host building from a clone has neither value and the
deployed site shows the setup screen. Set both variables in the host's project
settings and then **redeploy**: adding a variable rebuilds nothing, so an
existing deployment never picks it up.

**Deep links need an SPA rewrite.** The router uses HTML5 history mode, so
`/team` and `/reset-password` are not files. Without a catch-all rewrite they
404 — and `/reset-password` is where the password-reset email sends people.
`vercel.json` handles this for Vercel:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

Netlify wants `/* /index.html 200` in `_redirects`; nginx wants
`try_files $uri $uri/ /index.html`.

**Supabase needs the new origin** in its Redirect URLs, or sign-in links and
password resets send people back to localhost.

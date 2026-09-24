/**
 * Applies the migrations to a real Postgres (PGlite — Postgres 16 compiled to
 * WASM) and asserts the things that would otherwise only be claims: that the
 * DDL loads, that the constraints reject bad rows, and that the RLS policies
 * actually isolate one intern from another.
 *
 * No Docker, no Supabase project, no network. `npm run verify:schema`.
 *
 * Supabase supplies auth.users, auth.uid() and the authenticated/anon roles at
 * the platform level, so they are shimmed here. auth.uid() reads the same
 * request.jwt.claims GUC that Supabase's real implementation reads, which is
 * why setting that GUC is enough to impersonate a user.
 */
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MIGRATIONS = dirname(fileURLToPath(import.meta.url)) + '/../supabase/migrations'
const db = new PGlite()

let passed = 0
const failures = []

const ok = (name) => {
  passed++
  console.log(`  \x1b[32m✓\x1b[0m ${name}`)
}
const bad = (name, detail) => {
  failures.push({ name, detail })
  console.log(`  \x1b[31m✗\x1b[0m ${name}\n      ${detail}`)
}

/** Assert a statement succeeds. */
async function allow(name, sql, params = []) {
  try {
    const r = await db.query(sql, params)
    ok(name)
    return r
  } catch (e) {
    bad(name, `expected success, got: ${e.message}`)
    return null
  }
}

/** Assert a statement fails, and that the message mentions `expect`. */
async function deny(name, sql, params = [], expect = '') {
  try {
    await db.query(sql, params)
    bad(name, 'expected the database to reject this, but it succeeded')
  } catch (e) {
    if (expect && !e.message.toLowerCase().includes(expect.toLowerCase())) {
      bad(name, `rejected, but for the wrong reason: ${e.message}`)
    } else {
      ok(name)
    }
  }
}

/** Assert a scalar query returns `want`. */
async function equals(name, want, sql, params = []) {
  try {
    const { rows } = await db.query(sql, params)
    const got = rows.length ? Object.values(rows[0])[0] : undefined
    if (String(got) === String(want)) ok(`${name} → ${got}`)
    else bad(name, `expected ${want}, got ${got}`)
  } catch (e) {
    bad(name, `query threw: ${e.message}`)
  }
}

/** Run everything after this as `id`, through the authenticated role. */
async function actingAs(id) {
  await db.exec('reset role')
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ sub: id, role: 'authenticated' }),
  ])
  await db.exec('set role authenticated')
}
/** Run everything after this as a signed-out caller, through the anon role. */
async function actingAsAnon() {
  await db.exec('reset role')
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [''])
  await db.exec('set role anon')
}
/** Drop back to the table owner, which bypasses RLS — used only for seeding. */
async function actingAsOwner() {
  await db.exec('reset role')
  await db.query(`select set_config('request.jwt.claims', '', false)`)
}

const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`)

// ---------------------------------------------------------------- platform shim
section('Supabase platform shim')
await db.exec(`
  create schema auth;
  create table auth.users (
    id                 uuid primary key default gen_random_uuid(),
    email              text unique not null,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at         timestamptz not null default now()
  );
  create function auth.uid() returns uuid language sql stable as $fn$
    select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
  $fn$;
  create role authenticated;
  create role anon;

  -- Not decoration: a real Supabase project grants the public schema to anon
  -- by default, which is the whole reason 0005 exists. Without these two lines
  -- PGlite's anon starts with no privileges, 0005 would revoke nothing, and
  -- the test would pass while proving nothing.
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
`)
ok('auth.users, auth.uid(), authenticated + anon roles')
ok('Supabase default privileges (public schema granted to anon)')

// ---------------------------------------------------------------- migrations
section('Migrations')
for (const file of [
  '0001_schema.sql',
  '0002_policies.sql',
  '0003_seed_skills.sql',
  '0006_drop_supervisor_role.sql',
  '0007_time_adjustments.sql',
]) {
  try {
    await db.exec(await readFile(join(MIGRATIONS, file), 'utf8'))
    ok(`${file} applied`)
  } catch (e) {
    bad(`${file} applied`, e.message)
    console.error('\nMigration failed — later assertions would be meaningless.\n')
    process.exit(1)
  }
}
await equals('skills seeded', 15, 'select count(*) from public.skills')

// ---------------------------------------------------------------- signup trigger
section('Signup trigger')
const signUp = async (email, meta = {}) => {
  const { rows } = await db.query(
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
    [email, JSON.stringify(meta)],
  )
  return rows[0].id
}
const ana = await signUp('ana.reyes@gmail.com', { full_name: 'Ana Reyes' })
const ben = await signUp('bencruz21@yahoo.com', { full_name: 'Ben Cruz' })
const sup = await signUp('sam@dysrupit.com', { full_name: 'Sam Lopez' })
const other = await signUp('olive@dysrupit.com', { full_name: 'Olive Tan' })
const boss = await signUp('mia.santos@dysrupit.com', { name: 'Mia Santos' })
const bare = await signUp('noname@outlook.com')

await equals('a profile row per auth user', 6, 'select count(*) from public.profiles')
await equals(
  'full_name lifted from user metadata',
  'Ana Reyes',
  `select full_name from public.profiles where id = $1`,
  [ana],
)
await equals(
  'the Google "name" claim is accepted too',
  'Mia Santos',
  `select full_name from public.profiles where id = $1`,
  [boss],
)
await equals(
  'with no metadata at all, falls back to the email local-part',
  'noname',
  `select full_name from public.profiles where id = $1`,
  [bare],
)

// wire up roles as an operator would, at the owner level. Two roles only
// since 0006: Sam and Mark administer, everyone else is an intern.
await db.query(`update public.profiles set role = 'admin' where id = any($1)`, [[sup, boss]])
await db.query(`update public.profiles set required_hours = 480 where id = any($1)`, [[ana, ben]])

await deny(
  'supervisor is no longer an accepted role',
  `update public.profiles set role = 'supervisor' where id = $1`,
  [other],
  'profiles_role_check',
)

// ---------------------------------------------------------------- constraints
section('Constraints')
const today = 'current_date'
await allow(
  'clock in',
  `insert into public.daily_logs (intern_id, log_date, clock_in)
   values ($1, current_date, current_date + time '09:02')`,
  [ana],
)
await deny(
  'a second clock-in the same day is refused',
  `insert into public.daily_logs (intern_id, log_date) values ($1, current_date)`,
  [ana],
  'daily_logs_one_per_day',
)
await deny(
  'clocking out without a reflection is refused',
  `update public.daily_logs set clock_out = current_date + time '18:06'
   where intern_id = $1 and log_date = ${today}`,
  [ana],
  'daily_logs_reflection_required',
)
await deny(
  'clocking out before clocking in is refused',
  `update public.daily_logs
     set clock_out = current_date + time '08:00', worked_on = 'x', learned = 'y'
   where intern_id = $1 and log_date = ${today}`,
  [ana],
  'daily_logs_clock_order',
)
await allow(
  'clock out together with the reflection',
  `update public.daily_logs
     set clock_out = current_date + time '18:06',
         worked_on = 'Paired on the intake form.',
         learned   = 'How RLS policies compose with OR.',
         skills    = array['SQL','Testing'],
         confidence = 4
   where intern_id = $1 and log_date = ${today}`,
  [ana],
)
await deny(
  'confidence outside 1..5 is refused',
  `update public.daily_logs set confidence = 9 where intern_id = $1`,
  [ana],
  'confidence',
)
await actingAs(boss)
await deny(
  'a profile cannot supervise itself, even for an admin',
  `update public.profiles set supervisor_id = id where id = $1`,
  [ana],
  'profiles_not_own_supervisor',
)
await actingAsOwner()

// ---------------------------------------------------------------- derived values
section('Derived values')
await equals(
  '09:02 to 18:06 less a 60 min break',
  '8.07',
  `select hours_worked from public.daily_log_details where intern_id = $1`,
  [ana],
)
await db.query(`insert into public.daily_logs (intern_id, log_date) values ($1, current_date)`, [
  ben,
])
await equals(
  'an open day reports status open',
  'open',
  `select status from public.daily_log_details where intern_id = $1`,
  [ben],
)
await equals(
  'an open day has no hours yet',
  null,
  `select hours_worked from public.daily_log_details where intern_id = $1`,
  [ben],
)
await equals(
  'a closed day reports status submitted',
  'submitted',
  `select status from public.daily_log_details where intern_id = $1`,
  [ana],
)
await equals(
  'intern_progress totals the hours',
  '8.07',
  `select hours_logged from public.intern_progress where id = $1`,
  [ana],
)
await equals(
  'intern_progress counts the review queue',
  1,
  `select awaiting_review from public.intern_progress where id = $1`,
  [ana],
)
await equals(
  'intern_progress lists only interns, never admins',
  4,
  `select count(*) from public.intern_progress`,
)
await equals(
  // numeric(8,2) comes back as '0.00', and the helper compares as strings.
  'an intern who has logged nothing still appears, at zero',
  '0.00',
  `select hours_logged from public.intern_progress where id = $1`,
  [other],
)

// ---------------------------------------------------------------- RLS
section('Row level security')
await actingAs(ana)
await equals('Ana sees her own log', 1, `select count(*) from public.daily_logs`)
await equals(
  'Ana sees only her own profile, nobody else in the cohort',
  1,
  `select count(*) from public.profiles`,
)
await equals(
  'the view honours RLS too (security_invoker)',
  1,
  `select count(*) from public.daily_log_details`,
)
await deny(
  'Ana cannot clock in as Ben',
  `insert into public.daily_logs (intern_id, log_date) values ($1, current_date)`,
  [ben],
  'row-level security',
)
await deny(
  'Ana cannot back-file last week',
  `insert into public.daily_logs (intern_id, log_date) values ($1, current_date - 7)`,
  [ana],
  'row-level security',
)
await allow(
  'Ana may still close out yesterday',
  `insert into public.daily_logs (intern_id, log_date, clock_in)
   values ($1, current_date - 1, current_date - 1 + time '09:00')`,
  [ana],
)

await actingAs(ben)
await equals('Ben cannot see Ana rows', 1, `select count(*) from public.daily_logs`)
await equals(
  'Ben cannot read Ana learnings through the view',
  0,
  `select count(*) from public.daily_log_details where intern_id = $1`,
  [ana],
)

await actingAs(other)
await equals(
  'an intern with no logs of her own sees no logs at all',
  0,
  `select count(*) from public.daily_logs`,
)

await actingAs(boss)
await equals('the admin sees every log', 3, `select count(*) from public.daily_logs`)
await equals('the admin sees every profile', 6, `select count(*) from public.profiles`)

// ---------------------------------------------------------------- column guards
section('Column guards')
await actingAs(ana)
await db.query(
  `update public.daily_logs set supervisor_comment = 'I approve of myself' where intern_id = $1 and log_date = current_date`,
  [ana],
)
await equals(
  'an intern writing supervisor_comment is silently pinned back',
  null,
  `select supervisor_comment from public.daily_logs where intern_id = $1 and log_date = current_date`,
  [ana],
)
await db.query(`update public.profiles set role = 'admin' where id = $1`, [ana])
await equals(
  'an intern cannot promote herself',
  'intern',
  `select role from public.profiles where id = $1`,
  [ana],
)
await db.query(`update public.profiles set required_hours = 1 where id = $1`, [ana])
await equals(
  'an intern cannot rewrite her own hour target',
  '480.0',
  `select required_hours from public.profiles where id = $1`,
  [ana],
)
await allow(
  'an intern can still edit her own name',
  `update public.profiles set full_name = 'Ana R. Reyes' where id = $1`,
  [ana],
)

await actingAs(sup)
await db.query(
  `update public.daily_logs
     set supervisor_comment = 'Good catch. Read the policy docs I sent.',
         reviewed_at = now(), reviewed_by = $2,
         learned = 'REWRITTEN BY THE ADMIN'
   where intern_id = $1 and log_date = current_date`,
  [ana, sup],
)
await equals(
  'an admin reviewing cannot rewrite the intern own words',
  'How RLS policies compose with OR.',
  `select learned from public.daily_logs where intern_id = $1 and log_date = current_date`,
  [ana],
)
await equals(
  'but the review itself lands',
  'Good catch. Read the policy docs I sent.',
  `select supervisor_comment from public.daily_logs where intern_id = $1 and log_date = current_date`,
  [ana],
)

await actingAsOwner()

// ---------------------------------------------------------------- time adjustments
section('Time adjustments (0007)')

// What the day looked like before anyone touched it.
// clock_in::text, because log_adjustments stores the cast and comparing a
// JS Date against it only tests date formatting.
const { rows: before } = await db.query(
  `select id, clock_in, clock_in::text as clock_in_text
     from public.daily_logs where intern_id = $1 and log_date = current_date`,
  [ana],
)
const anaLog = before[0].id

await actingAs(ana)
await db.query(`update public.daily_logs set clock_in = now() - interval '5 hours' where id = $1`, [
  anaLog,
])
await equals(
  'an intern still cannot move her own clock-in',
  String(before[0].clock_in),
  `select clock_in from public.daily_logs where id = $1`,
  [anaLog],
)
await deny(
  'and she cannot call the adjust function either',
  `select public.adjust_log_times($1, now(), null, null, 'nice try')`,
  [anaLog],
  'only an admin',
)

await actingAs(boss)
await allow(
  'an admin may correct a clock-in, through the function',
  `select public.adjust_log_times($1, $2::timestamptz, null, null, 'Forgot to clock in after standup')`,
  [anaLog, '2026-01-05 09:00:00+08'],
)
await equals(
  'the correction lands',
  '2026-01-05 01:00:00',
  `select to_char(clock_in at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') from public.daily_logs where id = $1`,
  [anaLog],
)
await equals(
  'and is audited, against the admin who made it',
  boss,
  `select changed_by from public.log_adjustments where log_id = $1 and field = 'clock_in'`,
  [anaLog],
)
await equals(
  'the reason travels with it',
  'Forgot to clock in after standup',
  `select reason from public.log_adjustments where log_id = $1 and field = 'clock_in'`,
  [anaLog],
)
await equals(
  'the old value is kept, not just the new one',
  before[0].clock_in_text,
  `select old_value from public.log_adjustments where log_id = $1 and field = 'clock_in'`,
  [anaLog],
)

// The audit is a trigger, so the ordinary UPDATE path is covered too — not
// only the function the app happens to call.
await db.query(`update public.daily_logs set break_minutes = 45 where id = $1`, [anaLog])
await equals(
  'a direct update is audited the same, with no function involved',
  '45',
  `select new_value from public.log_adjustments where log_id = $1 and field = 'break_minutes'`,
  [anaLog],
)

await equals(
  'an admin still cannot rewrite the intern own words',
  'How RLS policies compose with OR.',
  `select learned from public.daily_logs where id = $1`,
  [anaLog],
)

await actingAs(ana)
await equals(
  'the intern can read the trail of changes to her own attendance',
  2,
  `select count(*) from public.log_adjustments where intern_id = $1`,
  [ana],
)
await actingAs(ben)
await equals(
  'another intern cannot',
  0,
  `select count(*) from public.log_adjustments where intern_id = $1`,
  [ana],
)
await deny(
  'and nobody can erase an entry through the API',
  `delete from public.log_adjustments where intern_id = $1`,
  [ana],
  'permission denied',
)

await actingAsOwner()

// ---------------------------------------------------------------- anon lockdown
//
// Ordered deliberately: prove the hole is open first, then close it. An
// assertion that anon is denied, run against a database where anon was never
// granted anything, is a test that cannot fail and therefore proves nothing.
section('Anon lockdown (0005)')

await actingAsAnon()
await allow(
  'before 0005, a signed-out caller can reach the table at all',
  'select count(*) from public.skills',
)
await equals(
  'RLS still returns it nothing — no data was ever exposed',
  0,
  'select count(*) from public.skills',
)
await deny(
  'and a signed-out insert is rejected',
  `insert into public.daily_logs (intern_id, log_date) values ($1, current_date)`,
  [ana],
  'row-level security',
)

await actingAsOwner()
try {
  await db.exec(await readFile(join(MIGRATIONS, '0005_revoke_anon.sql'), 'utf8'))
  ok('0005_revoke_anon.sql applied')
} catch (e) {
  bad('0005_revoke_anon.sql applied', e.message)
}

await actingAsAnon()
await deny(
  'after 0005, the table is unreachable, not merely empty',
  'select count(*) from public.skills',
  [],
  'permission denied',
)
await deny(
  'the views are closed to anon too',
  'select count(*) from public.daily_log_details',
  [],
  'permission denied',
)
await deny('and so is profiles', 'select count(*) from public.profiles', [], 'permission denied')

await actingAsOwner()
await equals(
  'the owner is untouched — migrations and the SQL editor still work',
  15,
  'select count(*) from public.skills',
)
await actingAs(ana)
await equals(
  'and a signed-in intern still reads her own profile',
  1,
  'select count(*) from public.profiles where id = $1',
  [ana],
)
await actingAsOwner()

// ---------------------------------------------------------------- report
console.log(
  `\n${failures.length === 0 ? '\x1b[32m' : '\x1b[31m'}${passed} passed, ${failures.length} failed\x1b[0m`,
)
if (failures.length) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  • ${f.name}\n      ${f.detail}`)
}
await db.close()
process.exit(failures.length ? 1 : 0)

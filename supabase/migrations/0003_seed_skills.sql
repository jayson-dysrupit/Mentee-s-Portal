-- 0003_seed_skills.sql — the tag list interns pick from.
-- Safe to re-run. Retire a skill with active = false rather than deleting it,
-- so historical logs keep meaning what they said.

insert into public.skills (name, category) values
  ('Python',                  'Engineering'),
  ('JavaScript / TypeScript', 'Engineering'),
  ('Vue / Frontend',          'Engineering'),
  ('APIs & Integrations',     'Engineering'),
  ('Git & Code Review',       'Engineering'),
  ('Testing',                 'Engineering'),
  ('SQL',                     'Data'),
  ('Data Analysis',           'Data'),
  ('Prompt Engineering',      'AI'),
  ('LLM Integration',         'AI'),
  ('UI / UX Design',          'Design'),
  ('Client Discovery',        'Consulting'),
  ('Documentation',           'Communication'),
  ('Presenting & Demos',      'Communication'),
  ('Time Management',         'Professional')
on conflict (name) do nothing;

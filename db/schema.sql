-- Developer Community Pulse: database schema and seed data (plain Postgres, works on Neon).
-- Apply with: npm run db:setup   (or paste into Neon console -> SQL Editor -> Run).
-- Safe to run more than once.

create table if not exists topics (
  id bigint generated always as identity primary key,
  category text not null,
  keyword text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (category, keyword)
);

create table if not exists settings (key text primary key, value jsonb not null);

create table if not exists posts (
  source text not null,              -- 'hn' | 'devto' | 'so'
  post_id text not null,
  title text not null,
  snippet text,
  url text not null,                 -- link to the discussion itself
  created_at timestamptz not null,   -- when the post was created at the source
  comments int, score int,
  answer_count int, has_accepted_answer boolean, tags text[],
  fetched_at timestamptz not null default now(),
  relevant boolean, sentiment text, pain_point text, seeking_help boolean, classified_at timestamptz,
  primary key (source, post_id)
);

create table if not exists post_matches (
  source text not null, post_id text not null, category text not null, keyword text not null,
  primary key (source, post_id, category, keyword),
  foreign key (source, post_id) references posts(source, post_id) on delete cascade
);

create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null check (run_type in ('scheduled','manual')),
  week_key text,                     -- ISO timestamp of the anchor, scheduled runs only
  anchor timestamptz not null,
  status text not null default 'running' check (status in ('running','sent','partial','failed')),
  attempts int not null default 0,
  source_status jsonb, error text,
  started_at timestamptz default now(), finished_at timestamptz,
  stage text                         -- live progress for the Run now panel: fetch | count | analyse | write | email | done | failed
);
alter table runs add column if not exists stage text;
create unique index if not exists runs_one_scheduled_per_week on runs(week_key) where run_type = 'scheduled';

create table if not exists weekly_stats (
  run_id uuid references runs(id) on delete cascade,
  level text check (level in ('category','keyword')),
  category text not null, keyword text not null default '',
  current_count int, previous_count int, pct_change numeric,
  trend_label text not null, data_status text not null,   -- 'complete' | 'incomplete'
  primary key (run_id, level, category, keyword)
);

create table if not exists briefs (
  run_id uuid primary key references runs(id) on delete cascade,
  content jsonb not null, html text,
  email_status text not null default 'pending', email_sent_at timestamptz, email_error text,
  created_at timestamptz default now()
);

-- Seed settings (edit recipient_email in Neon: Tables or SQL Editor).
insert into settings (key, value) values
  ('recipient_email', '"change-me@example.com"'::jsonb),
  ('min_mentions', '5'::jsonb),
  ('flat_threshold_pct', '10'::jsonb),
  ('devto_tags', '["codereview","cicd","devops","githubactions","testing","productivity","softwareengineering"]'::jsonb),
  ('classify_cap', '120'::jsonb)
on conflict (key) do nothing;

-- Seed topics (editable examples).
insert into topics (category, keyword) values
  ('Code review process and culture', 'code review'),
  ('Code review process and culture', 'pull request review'),
  ('Code review process and culture', 'review turnaround'),
  ('False positives and noisy tooling', 'false positive'),
  ('False positives and noisy tooling', 'linter noise'),
  ('False positives and noisy tooling', 'alert fatigue'),
  ('CI/CD pipeline pain', 'flaky tests'),
  ('CI/CD pipeline pain', 'slow CI'),
  ('CI/CD pipeline pain', 'GitHub Actions'),
  ('CI/CD pipeline pain', 'CI/CD'),
  ('Developer workflow and productivity', 'developer productivity'),
  ('Developer workflow and productivity', 'developer workflow'),
  ('Developer workflow and productivity', 'context switching'),
  ('AI code review tools', 'AI code review'),
  ('AI code review tools', 'automated code review'),
  ('AI code review tools', 'Copilot review')
on conflict (category, keyword) do nothing;

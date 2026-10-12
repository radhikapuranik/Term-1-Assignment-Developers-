-- Developer Community Pulse: database schema, migration and seed data (plain Postgres, works on Neon).
-- Apply with: npm run db:setup   (or paste into Neon console -> SQL Editor -> Run).
-- Safe to run more than once. It also migrates an older install (text categories/keywords) to permanent ids.

create table if not exists categories (
  id bigint generated always as identity primary key,
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists topics (
  id bigint generated always as identity primary key,   -- permanent keyword id
  category_id bigint references categories(id),
  keyword text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table topics add column if not exists category_id bigint references categories(id);

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
  source text not null, post_id text not null,
  topic_id bigint not null references topics(id),
  primary key (source, post_id, topic_id),
  foreign key (source, post_id) references posts(source, post_id) on delete cascade
);
alter table post_matches add column if not exists topic_id bigint;

create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null,
  week_key text,                     -- ISO timestamp of the anchor, scheduled runs only
  anchor timestamptz not null,
  status text not null default 'running' check (status in ('running','sent','partial','failed')),
  attempts int not null default 0,
  source_status jsonb, error text,
  started_at timestamptz default now(), finished_at timestamptz,
  stage text                         -- live progress: fetch | count | analyse | write | email | done | failed
);
alter table runs add column if not exists stage text;
alter table runs drop constraint if exists runs_run_type_check;
alter table runs add constraint runs_run_type_check check (run_type in ('scheduled','manual','backfill'));
create unique index if not exists runs_one_scheduled_per_week on runs(week_key) where run_type = 'scheduled';

create table if not exists weekly_stats (
  run_id uuid references runs(id) on delete cascade,
  level text check (level in ('category','keyword')),
  category_id bigint not null,
  topic_id bigint not null default 0,                    -- 0 for category rows
  category text, keyword text default '',                -- label snapshots at the time of the run (not used for joins)
  current_count int, previous_count int, pct_change numeric,
  trend_label text not null, data_status text not null,  -- 'complete' | 'incomplete'
  primary key (run_id, level, category_id, topic_id)
);
alter table weekly_stats add column if not exists category_id bigint;
alter table weekly_stats add column if not exists topic_id bigint not null default 0;

create table if not exists briefs (
  run_id uuid primary key references runs(id) on delete cascade,
  content jsonb not null, html text,
  email_status text not null default 'pending', email_sent_at timestamptz, email_error text,
  created_at timestamptz default now()
);

-- Migration from text categories/keywords to permanent ids. Runs only while the old columns exist, so it is safe to repeat.
do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'topics' and column_name = 'category') then
    insert into categories (name) select distinct category from topics where category is not null on conflict (name) do nothing;
    update topics t set category_id = c.id from categories c where c.name = t.category and t.category_id is null;
    alter table topics alter column category drop not null;
    alter table topics drop constraint if exists topics_category_keyword_key;
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'post_matches' and column_name = 'category') then
    insert into categories (name, active) select distinct m.category, false from post_matches m
      where not exists (select 1 from categories c where c.name = m.category) on conflict (name) do nothing;
    insert into topics (category_id, keyword, active)
      select distinct c.id, m.keyword, false from post_matches m join categories c on c.name = m.category
      where not exists (select 1 from topics t where t.category_id = c.id and t.keyword = m.keyword);
    update post_matches m set topic_id = t.id from topics t join categories c on c.id = t.category_id
      where m.topic_id is null and c.name = m.category and t.keyword = m.keyword;
    alter table post_matches drop constraint if exists post_matches_pkey;
    alter table post_matches add primary key (source, post_id, topic_id);
    alter table post_matches drop column category;
    alter table post_matches drop column keyword;
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'weekly_stats' and column_name = 'category')
     and not exists (select 1 from information_schema.key_column_usage where table_name = 'weekly_stats' and constraint_name = 'weekly_stats_pkey' and column_name = 'category_id') then
    insert into categories (name, active) select distinct w.category, false from weekly_stats w
      where not exists (select 1 from categories c where c.name = w.category) on conflict (name) do nothing;
    update weekly_stats w set category_id = c.id from categories c where w.category_id is null and c.name = w.category;
    insert into topics (category_id, keyword, active)
      select distinct w.category_id, w.keyword, false from weekly_stats w
      where w.level = 'keyword' and not exists (select 1 from topics t where t.category_id = w.category_id and t.keyword = w.keyword);
    update weekly_stats w set topic_id = t.id from topics t
      where w.level = 'keyword' and w.topic_id = 0 and t.category_id = w.category_id and t.keyword = w.keyword;
    alter table weekly_stats drop constraint if exists weekly_stats_pkey;
    alter table weekly_stats alter column category_id set not null;
    alter table weekly_stats add primary key (run_id, level, category_id, topic_id);
    alter table weekly_stats alter column category drop not null;
    alter table weekly_stats alter column keyword drop not null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'post_matches_topic_id_fkey') then
    alter table post_matches add constraint post_matches_topic_id_fkey foreign key (topic_id) references topics(id);
  end if;
end $$;

alter table topics alter column category_id set not null;
create unique index if not exists topics_category_keyword_uq on topics (category_id, keyword);

-- Seed settings (edit recipient_email in the Settings table in Neon).
insert into settings (key, value) values
  ('recipient_email', '"change-me@example.com"'::jsonb),
  ('min_mentions', '5'::jsonb),
  ('flat_threshold_pct', '10'::jsonb),
  ('devto_tags', '["codereview","cicd","devops","githubactions","testing","productivity","softwareengineering"]'::jsonb),
  ('classify_cap', '120'::jsonb)
on conflict (key) do nothing;

-- Seed categories and keywords only into an empty database (renames later must never bring the old names back).
insert into categories (name)
  select v.name from (values
    ('Code review process and culture'), ('False positives and noisy tooling'), ('CI/CD pipeline pain'),
    ('Developer workflow and productivity'), ('AI code review tools')) v(name)
  where not exists (select 1 from categories);

insert into topics (category_id, keyword)
  select c.id, v.keyword from (values
    ('Code review process and culture', 'code review'), ('Code review process and culture', 'pull request review'), ('Code review process and culture', 'review turnaround'),
    ('False positives and noisy tooling', 'false positive'), ('False positives and noisy tooling', 'linter noise'), ('False positives and noisy tooling', 'alert fatigue'),
    ('CI/CD pipeline pain', 'flaky tests'), ('CI/CD pipeline pain', 'slow CI'), ('CI/CD pipeline pain', 'GitHub Actions'), ('CI/CD pipeline pain', 'CI/CD'),
    ('Developer workflow and productivity', 'developer productivity'), ('Developer workflow and productivity', 'developer workflow'), ('Developer workflow and productivity', 'context switching'),
    ('AI code review tools', 'AI code review'), ('AI code review tools', 'automated code review'), ('AI code review tools', 'Copilot review')) v(category, keyword)
  join categories c on c.name = v.category
  where not exists (select 1 from topics);

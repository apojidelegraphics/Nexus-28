-- Nexus '28 3.9 + Apoji Admin 2.4 — run once in the Supabase SQL editor (after nexus-v3.8.sql). Safe to run again.
--   1. Lessons: training examples an admin approved; every agent looks them up before it answers
--   2. Points, achievements and the daily challenge across your computers (each computer's own share, added up)
--   3. Nexus speech: the free speech-to-text allowance (Edge Function nexus-stt)

-- ============================================================ 1. lessons
alter table public.training_examples add column if not exists approved boolean not null default false;
alter table public.training_examples add column if not exists approved_by uuid references auth.users(id);
alter table public.training_examples add column if not exists approved_at timestamptz;
alter table public.training_examples add column if not exists lesson text check (char_length(lesson) <= 600);   -- optional one-line rule ("Always give units")
create index if not exists training_examples_lessons_idx on public.training_examples using gin (to_tsvector('english', prompt)) where approved;
drop policy if exists training_examples_admin_update on public.training_examples;
create policy training_examples_admin_update on public.training_examples for update using (public.admin_has_perm('training')) with check (public.admin_has_perm('training'));

-- The lessons that match a question (approved only; personal details were stripped when they were collected)
create or replace function public.training_lessons(p_query text, p_agent text default '', p_limit int default 3) returns jsonb
language sql stable security definer set search_path = public as $$
  -- any of the question's words (not all of them), best matches first; weak matches are left out
  with q as (select nullif(replace(plainto_tsquery('english', left(coalesce(p_query, ''), 500))::text, ' & ', ' | '), '')::tsquery tq)
  select coalesce(jsonb_agg(jsonb_build_object('q', left(e.prompt, 600), 'a', left(coalesce(e.correction, e.answer), 1200), 'rule', e.lesson, 'agent', e.agent) order by e.rank desc), '[]'::jsonb)
  from (select t.*, ts_rank(to_tsvector('english', t.prompt), q.tq) + case when t.agent = p_agent then 0.05 else 0 end as rank
        from training_examples t, q where t.approved and q.tq is not null and to_tsvector('english', t.prompt) @@ q.tq and ts_rank(to_tsvector('english', t.prompt), q.tq) > 0.02
        order by rank desc limit greatest(1, least(coalesce(p_limit, 3), 5))) e;
$$;
-- rules that apply to every answer (lessons without a question match: approved examples that have a rule)
create or replace function public.training_rules(p_agent text default '') returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(lesson order by approved_at desc), '[]'::jsonb) from (
    select lesson, approved_at from training_examples where approved and lesson is not null and (agent = p_agent or p_agent = '' or agent = '') order by approved_at desc limit 12) r;
$$;
create or replace function public.admin_training_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.admin_has_perm('training') then raise exception 'not allowed'; end if;
  return jsonb_build_object(
    'total', (select count(*) from training_examples),
    'week', (select count(*) from training_examples where created_at > now() - interval '7 days'),
    'people', (select count(distinct user_id) from training_examples),
    'consenting', (select count(*) from training_consent where revoked_at is null),
    'testers', (select count(*) from profiles where is_beta_tester),
    'testers_consenting', (select count(*) from profiles p join training_consent c on c.user_id = p.id and c.revoked_at is null where p.is_beta_tester),
    'up', (select count(*) from training_examples where rating = 1),
    'down', (select count(*) from training_examples where rating = -1),
    'corrected', (select count(*) from training_examples where correction is not null),
    'lessons', (select count(*) from training_examples where approved),
    'rules', (select count(*) from training_examples where approved and lesson is not null),
    'to_review', (select count(*) from training_examples where not approved and (rating <> 0 or correction is not null)),
    'up_rate_7d', (select round(100.0 * count(*) filter (where rating = 1) / nullif(count(*) filter (where rating <> 0), 0)) from training_examples where created_at > now() - interval '7 days'),
    'up_rate_prev', (select round(100.0 * count(*) filter (where rating = 1) / nullif(count(*) filter (where rating <> 0), 0)) from training_examples where created_at between now() - interval '14 days' and now() - interval '7 days'),
    'by_agent', coalesce((select jsonb_object_agg(agent, n) from (select coalesce(nullif(agent, ''), '?') agent, count(*) n from training_examples group by 1) a), '{}'::jsonb),
    'by_source', coalesce((select jsonb_object_agg(source, n) from (select source, count(*) n from training_examples group by 1) s), '{}'::jsonb),
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'n', n) order by d) from (select created_at::date d, count(*) n from training_examples where created_at > now() - interval '30 days' group by 1) x), '[]'::jsonb));
end $$;
revoke all on function public.training_lessons(text, text, int) from public, anon;
grant execute on function public.training_lessons(text, text, int) to authenticated;
revoke all on function public.training_rules(text) from public, anon;
grant execute on function public.training_rules(text) to authenticated;

-- ============================================================ 2. stats across your computers
create table if not exists public.user_stats (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  device text not null check (char_length(device) between 1 and 80),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, device),
  check (pg_column_size(data) < 200000)
);
alter table public.user_stats enable row level security;
drop policy if exists user_stats_own on public.user_stats;
create policy user_stats_own on public.user_stats for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================ 3. Nexus speech (free speech-to-text)
create table if not exists public.stt_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  calls int not null default 0,
  seconds int not null default 0,
  primary key (user_id, day)
);
alter table public.stt_usage enable row level security;
drop policy if exists stt_usage_own on public.stt_usage;
create policy stt_usage_own on public.stt_usage for select using (user_id = auth.uid() or public.is_admin());
-- called by the Edge Function (service role): 300 a day, about an hour of talking
create or replace function public.stt_take(p_user uuid, p_seconds int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u stt_usage;
begin
  insert into stt_usage (user_id, day) values (p_user, current_date) on conflict do nothing;
  select * into u from stt_usage where user_id = p_user and day = current_date for update;
  if u.calls >= 300 or u.seconds >= 3600 then return jsonb_build_object('ok', false, 'message', 'That’s all the free speech-to-text for today. It resets tomorrow, or add a Groq key in Settings → Voice.'); end if;
  update stt_usage set calls = calls + 1, seconds = seconds + greatest(1, least(p_seconds, 120)) where user_id = p_user and day = current_date;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.stt_take(uuid, int) from public, anon, authenticated;

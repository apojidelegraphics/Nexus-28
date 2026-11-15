-- Nexus '28 v2.4: the Apex tier (Nexus '28 Axiom, BETA). Run once in Supabase → SQL Editor, after
-- Apoji Admin's apoji-admin-1.2.sql. Safe to run again.
--
-- Axiom is "an AI too advanced for its use": the database decides who may use it and for how long.
--   • Stage: off · owner (only accounts in apex_unlimited) · high-admin · admin · beta · all.  Starts at high-admin.
--   • Weekly minutes (default 90) for everyone except accounts in apex_unlimited.
--   • Its prompt lives here, not in the app, and is only handed out to someone who's allowed and has time left.
--   • Providers: admins may use any; everyone else only Claude, OpenRouter and ChatGPT (changeable).
-- Nobody can add themselves to apex_unlimited from the app: only the SQL editor can.

create table if not exists public.apex_config (
  id int primary key default 1 check (id = 1),
  stage text not null default 'high-admin' check (stage in ('off', 'owner', 'high-admin', 'admin', 'beta', 'all')),
  weekly_minutes int not null default 90 check (weekly_minutes between 0 and 10080),
  public_providers text[] not null default array['anthropic', 'openrouter', 'openai'],
  prompt text not null default '' check (char_length(prompt) <= 40000),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.apex_config (id) values (1) on conflict (id) do nothing;
alter table public.apex_config enable row level security;
drop policy if exists apex_config_read on public.apex_config;
create policy apex_config_read on public.apex_config for select using (public.get_my_admin_level() = 'high-admin');
revoke insert, update, delete on public.apex_config from anon, authenticated;

create table if not exists public.apex_unlimited (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text not null default '',
  created_at timestamptz not null default now()
);
alter table public.apex_unlimited enable row level security;
drop policy if exists apex_unlimited_read on public.apex_unlimited;
create policy apex_unlimited_read on public.apex_unlimited for select using (user_id = auth.uid() or public.get_my_admin_level() = 'high-admin');
revoke insert, update, delete on public.apex_unlimited from anon, authenticated;

create table if not exists public.apex_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  seconds int not null check (seconds between 1 and 1800),
  kind text not null default 'chat' check (kind in ('chat', 'phone', 'swarm', 'operation', 'other')),
  provider text not null default '' check (char_length(provider) <= 40),
  model text not null default '' check (char_length(model) <= 120),
  created_at timestamptz not null default now()
);
create index if not exists apex_usage_user_week on public.apex_usage (user_id, created_at desc);
alter table public.apex_usage enable row level security;
drop policy if exists apex_usage_read on public.apex_usage;
create policy apex_usage_read on public.apex_usage for select using (user_id = auth.uid() or public.get_my_admin_level() = 'high-admin');
revoke insert, update, delete on public.apex_usage from anon, authenticated;

-- Who gets Axiom right now, and how many minutes are left this week (weeks start Monday 00:00 UTC)
create or replace function public.apex_status(p_uid uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c public.apex_config; lvl text; unl boolean; beta boolean; ok boolean; used numeric; wk timestamptz := date_trunc('week', now() at time zone 'utc') at time zone 'utc';
begin
  select * into c from public.apex_config where id = 1;
  if p_uid is null or c is null then return jsonb_build_object('allowed', false, 'reason', 'sign_in'); end if;
  select level into lvl from public.admin_roles where user_id = p_uid;
  unl := exists (select 1 from public.apex_unlimited where user_id = p_uid);
  select coalesce(is_beta_tester, false) into beta from public.profiles where id = p_uid;
  ok := case c.stage
    when 'off' then false
    when 'owner' then unl
    when 'high-admin' then unl or lvl = 'high-admin'
    when 'admin' then unl or lvl is not null
    when 'beta' then unl or lvl is not null or coalesce(beta, false)
    else true end;
  ok := coalesce(ok, false);
  select coalesce(sum(seconds), 0) / 60.0 into used from public.apex_usage where user_id = p_uid and created_at >= wk;
  return jsonb_build_object(
    'allowed', ok, 'reason', case when ok then '' when c.stage = 'off' then 'off' else 'not_yet' end,
    'stage', c.stage, 'unlimited', unl, 'admin', lvl is not null, 'level', coalesce(lvl, ''),
    'limit', case when unl then null else c.weekly_minutes end,
    'used', round(used, 1),
    'left', case when unl then null else greatest(0, round(c.weekly_minutes - used, 1)) end,
    'resets_at', wk + interval '7 days',
    'providers', case when lvl is not null or unl then null else to_jsonb(c.public_providers) end);
end $$;
revoke all on function public.apex_status(uuid) from public, anon, authenticated;

-- The app asks for this before every Axiom turn. The prompt only comes back if you're allowed and have time left.
create or replace function public.apex_session()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s jsonb := public.apex_status(auth.uid()); p text;
begin
  if (s->>'allowed')::boolean and (s->>'unlimited')::boolean or ((s->>'allowed')::boolean and (s->>'left')::numeric > 0) then
    select prompt into p from public.apex_config where id = 1;
    return s || jsonb_build_object('success', true, 'prompt', coalesce(p, ''), 'exhausted', false);
  end if;
  return s || jsonb_build_object('success', true, 'prompt', null, 'exhausted', (s->>'allowed')::boolean);
end $$;

-- Time spent with Axiom (answering, Swarm workers, Operations). Returns what's left.
create or replace function public.apex_log(p_seconds int, p_kind text default 'chat', p_provider text default '', p_model text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare s jsonb := public.apex_status(auth.uid());
begin
  if not coalesce((s->>'allowed')::boolean, false) then return jsonb_build_object('success', false, 'error', 'not_allowed'); end if;
  insert into public.apex_usage (user_id, seconds, kind, provider, model)
    values (auth.uid(), least(greatest(coalesce(p_seconds, 1), 1), 1800), case when p_kind in ('chat', 'phone', 'swarm', 'operation') then p_kind else 'other' end, left(coalesce(p_provider, ''), 40), left(coalesce(p_model, ''), 120));
  return public.apex_status(auth.uid()) || jsonb_build_object('success', true);
end $$;

-- Apoji Admin: the Axiom page (high-admins only)
create or replace function public.admin_apex_overview()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare wk timestamptz := date_trunc('week', now() at time zone 'utc') at time zone 'utc';
begin
  if public.get_my_admin_level() is distinct from 'high-admin' then return jsonb_build_object('success', false, 'error', 'not_high_admin'); end if;
  return jsonb_build_object('success', true,
    'config', (select to_jsonb(c) from public.apex_config c where id = 1),
    'unlimited', (select coalesce(jsonb_agg(jsonb_build_object('user_id', x.user_id, 'email', u.email, 'note', x.note)), '[]'::jsonb) from public.apex_unlimited x join auth.users u on u.id = x.user_id),
    'week', (select coalesce(jsonb_agg(jsonb_build_object('user_id', w.user_id, 'email', u.email, 'level', coalesce(r.level, ''), 'minutes', w.minutes, 'turns', w.turns, 'last', w.last,
        'unlimited', exists (select 1 from public.apex_unlimited x where x.user_id = w.user_id)) order by w.minutes desc), '[]'::jsonb)
      from (select user_id, round(sum(seconds) / 60.0, 1) minutes, count(*) turns, max(created_at) last from public.apex_usage where created_at >= wk group by user_id) w
      join auth.users u on u.id = w.user_id left join public.admin_roles r on r.user_id = w.user_id),
    'weeks', (select coalesce(jsonb_agg(jsonb_build_object('week', x.wk, 'minutes', x.minutes, 'people', x.people) order by x.wk), '[]'::jsonb)
      from (select date_trunc('week', created_at at time zone 'utc')::date wk, round(sum(seconds) / 60.0, 1) minutes, count(distinct user_id) people
            from public.apex_usage where created_at > now() - interval '8 weeks' group by 1) x),
    'resets_at', wk + interval '7 days');
end $$;

create or replace function public.admin_apex_set(p_stage text default null, p_weekly_minutes int default null, p_providers text[] default null, p_prompt text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if public.get_my_admin_level() is distinct from 'high-admin' then return jsonb_build_object('success', false, 'error', 'not_high_admin'); end if;
  if p_providers is not null and not (p_providers <@ array['anthropic', 'openrouter', 'openai', 'gemini', 'ollama', 'lmstudio', 'groq', 'mistral', 'xai', 'deepseek']) then
    return jsonb_build_object('success', false, 'error', 'bad_provider'); end if;
  update public.apex_config set
    stage = coalesce(p_stage, stage), weekly_minutes = coalesce(p_weekly_minutes, weekly_minutes),
    public_providers = coalesce(p_providers, public_providers), prompt = coalesce(p_prompt, prompt),
    updated_by = auth.uid(), updated_at = now() where id = 1;
  insert into public.moderation_log (action, performed_by, details)
    values ('apex_settings_changed', auth.uid(), jsonb_strip_nulls(jsonb_build_object('stage', p_stage, 'weekly_minutes', p_weekly_minutes, 'providers', p_providers, 'prompt_changed', p_prompt is not null)));
  return jsonb_build_object('success', true);
end $$;

do $$ declare f text; begin
  foreach f in array array['apex_session()', 'apex_log(int, text, text, text)', 'admin_apex_overview()', 'admin_apex_set(text, int, text[], text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

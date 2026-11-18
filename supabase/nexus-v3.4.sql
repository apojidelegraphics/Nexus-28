-- Nexus '28 3.4 / Apoji Admin 2.0.3
-- Run once in Supabase → SQL Editor (after nexus-v3.3.2.sql). Safe to run again.
--   1. The Owner's crown: who the Owner is (just the account id) is public, so every app can show the 👑.
--   2. Nexus Test Run (the web version for people without a Mac): saved chats + daily limits for the free key.
--      The free key never reaches the browser: the try-chat Edge Function reads it here and calls OpenRouter.
--   3. Apoji Admin: a Test Run card on the dashboard.

-- ---------- 1. the Owner
create or replace function public.app_owner_ids()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(user_id), '{}') from public.admin_roles where high_tier = 'owner'
$$;
revoke all on function public.app_owner_ids() from public;
grant execute on function public.app_owner_ids() to anon, authenticated;

-- ---------- 2. Test Run
create table if not exists public.try_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'New chat' check (char_length(title) <= 120),
  agent text not null default 'flash' check (agent in ('flash', 'lyte', 'neodela')),
  messages jsonb not null default '[]'::jsonb check (jsonb_typeof(messages) = 'array' and pg_column_size(messages) < 600000),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists try_chats_mine on public.try_chats (user_id, updated_at desc);
alter table public.try_chats enable row level security;
drop policy if exists try_chats_own on public.try_chats;
create policy try_chats_own on public.try_chats for all using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.try_chats from anon;
grant select, insert, update, delete on public.try_chats to authenticated;
-- at most 300 chats each
create or replace function public.try_chats_cap() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.try_chats where user_id = new.user_id) >= 300 then raise exception 'You have 300 chats. Delete some old ones first.'; end if;
  return new;
end $$;
drop trigger if exists try_chats_cap on public.try_chats;
create trigger try_chats_cap before insert on public.try_chats for each row execute function public.try_chats_cap();

-- daily counts for the free key (written only by the try-chat function with the service role)
create table if not exists public.try_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  main int not null default 0,
  extra int not null default 0,
  searches int not null default 0,
  primary key (user_id, day)
);
alter table public.try_usage enable row level security;
drop policy if exists try_usage_read_own on public.try_usage;
create policy try_usage_read_own on public.try_usage for select using (user_id = auth.uid());
revoke all on public.try_usage from anon, authenticated;
grant select on public.try_usage to authenticated;

-- One call from the function: is this person allowed right now, and count it. kind: main | extra | search
create or replace function public.try_take(p_user uuid, p_kind text, p_agent text default 'flash')
returns jsonb language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'utc')::date; u public.try_usage; lim int; used int; name text; life int; m record;
begin
  select status, suspended_until into m from public.user_moderation where user_id = p_user;
  if found and (m.status = 'banned' or (m.status = 'suspended' and (m.suspended_until is null or m.suspended_until > now()))) then
    return jsonb_build_object('ok', false, 'error', 'account', 'message', 'Your account can''t use Nexus right now.');
  end if;
  insert into public.try_usage (user_id, day) values (p_user, d) on conflict do nothing;
  select * into u from public.try_usage where user_id = p_user and day = d for update;
  if p_kind = 'search' then
    if u.searches >= 60 then return jsonb_build_object('ok', false, 'error', 'daily', 'message', 'That''s 60 web searches today. More tomorrow!'); end if;
    update public.try_usage set searches = searches + 1 where user_id = p_user and day = d;
    return jsonb_build_object('ok', true);
  end if;
  if p_kind = 'extra' then
    if u.extra >= 120 then return jsonb_build_object('ok', false, 'error', 'daily', 'message', 'Thinking features are done for today. Plain answers still work.'); end if;
    update public.try_usage set extra = extra + 1 where user_id = p_user and day = d;
    return jsonb_build_object('ok', true);
  end if;
  -- main answers: 100 a day on the free key, plus the same lifetime allowances as the Mac app (Lyte 95, Neodela 28)
  if u.main >= 100 then return jsonb_build_object('ok', false, 'error', 'daily', 'message', 'That''s 100 free answers today. Come back tomorrow, or add your own key in Settings.'); end if;
  name := case p_agent when 'lyte' then 'Nexus 28 Lyte' when 'neodela' then 'Nexus 28 Neodela' else 'Nexus 28 Flash' end;
  lim := case p_agent when 'lyte' then 95 when 'neodela' then 28 else null end;
  select count into used from public.chat_usage where user_id = p_user and assistant_name = name;
  used := coalesce(used, 0);
  if lim is not null and used >= lim then
    return jsonb_build_object('ok', false, 'error', 'agent', 'message', format('You''ve used your %s free %s chats. Flash is unlimited, or add your own key in Settings.', lim, initcap(p_agent)));
  end if;
  update public.try_usage set main = main + 1 where user_id = p_user and day = d;
  insert into public.chat_usage (user_id, assistant_name, count, updated_at) values (p_user, name, 1, now())
    on conflict (user_id, assistant_name) do update set count = public.chat_usage.count + 1, updated_at = now();
  return jsonb_build_object('ok', true, 'today', u.main + 1, 'left_today', 100 - u.main - 1, 'left_agent', case when lim is null then null else lim - used - 1 end);
end $$;
revoke all on function public.try_take(uuid, text, text) from public, anon, authenticated;
grant execute on function public.try_take(uuid, text, text) to service_role;

-- What the Test Run shows you: today's counts and the agent allowances
create or replace function public.try_my_usage()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'today', coalesce((select main from public.try_usage where user_id = auth.uid() and day = (now() at time zone 'utc')::date), 0), 'daily', 100,
    'lyte', coalesce((select count from public.chat_usage where user_id = auth.uid() and assistant_name = 'Nexus 28 Lyte'), 0), 'lyte_limit', 95,
    'neodela', coalesce((select count from public.chat_usage where user_id = auth.uid() and assistant_name = 'Nexus 28 Neodela'), 0), 'neodela_limit', 28)
$$;
revoke all on function public.try_my_usage() from public, anon;
grant execute on function public.try_my_usage() to authenticated;

-- ---------- 3. Apoji Admin: Test Run numbers
create or replace function public.admin_try_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if public.get_my_admin_level() is null then return jsonb_build_object('success', false); end if;
  return jsonb_build_object('success', true,
    'people', (select count(distinct user_id) from public.try_chats),
    'chats', (select count(*) from public.try_chats),
    'active_week', (select count(distinct user_id) from public.try_usage where day > (now() at time zone 'utc')::date - 7),
    'answers_today', coalesce((select sum(main) from public.try_usage where day = (now() at time zone 'utc')::date), 0),
    'answers_week', coalesce((select sum(main) from public.try_usage where day > (now() at time zone 'utc')::date - 7), 0),
    'searches_week', coalesce((select sum(searches) from public.try_usage where day > (now() at time zone 'utc')::date - 7), 0));
end $$;
revoke all on function public.admin_try_stats() from public, anon;
grant execute on function public.admin_try_stats() to authenticated;

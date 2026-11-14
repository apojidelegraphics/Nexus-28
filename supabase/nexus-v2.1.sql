-- Nexus '28 v2.1 — shared custom agents, live study sessions in Shared Spaces, admin chat, faster N28C (realtime).
-- Run once, after nexus-v2.0.sql. Safe to run again.

-- 1) Agent Builder share codes: anyone signed in can publish an agent; anyone with the code can import it.
create table if not exists public.shared_agents (
  code text primary key check (code ~ '^[A-Z0-9]{6}$'),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  agent jsonb not null check (pg_column_size(agent) <= 40000),
  name text not null default '' check (char_length(name) <= 40),
  imports int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.shared_agents enable row level security;
drop policy if exists shared_agents_select_own on public.shared_agents;
create policy shared_agents_select_own on public.shared_agents for select using (owner = auth.uid());
drop policy if exists shared_agents_delete_own on public.shared_agents;
create policy shared_agents_delete_own on public.shared_agents for delete using (owner = auth.uid());

create or replace function public.share_agent(p_agent jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare c text; tries int := 0;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if (select count(*) from public.shared_agents where owner = auth.uid()) >= 50 then raise exception 'You have shared 50 agents already. Delete some first.'; end if;
  loop
    c := upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.shared_agents where code = c);
    tries := tries + 1; if tries > 20 then raise exception 'Try again.'; end if;
  end loop;
  insert into public.shared_agents (code, agent, name) values (c, p_agent, left(coalesce(p_agent->>'name', ''), 40));
  return c;
end $$;
create or replace function public.get_shared_agent(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  update public.shared_agents set imports = imports + 1 where code = upper(trim(p_code)) returning agent into a;
  if a is null then raise exception 'No agent with that code.'; end if;
  return a;
end $$;
revoke all on function public.share_agent(jsonb) from public, anon;
revoke all on function public.get_shared_agent(text) from public, anon;
grant execute on function public.share_agent(jsonb) to authenticated;
grant execute on function public.get_shared_agent(text) to authenticated;

-- 2) Live study sessions in Shared Spaces: one person starts a deck, everyone answers the same cards, live leaderboard.
create table if not exists public.space_sessions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.shared_spaces(id) on delete cascade,
  host uuid not null default auth.uid() references auth.users(id) on delete cascade,
  host_name text not null default 'Friend' check (char_length(host_name) <= 40),
  title text not null check (char_length(title) between 1 and 80),
  questions jsonb not null check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) between 1 and 40 and pg_column_size(questions) <= 150000),
  status text not null default 'live' check (status in ('live', 'ended')),
  created_at timestamptz not null default now(),
  ends_at timestamptz not null default now() + interval '30 minutes'
);
create index if not exists space_sessions_space on public.space_sessions (space_id, created_at desc);
create table if not exists public.space_session_scores (
  session_id uuid not null references public.space_sessions(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nickname text not null default 'Friend' check (char_length(nickname) between 1 and 24),
  answered int not null default 0 check (answered between 0 and 40),
  correct int not null default 0 check (correct between 0 and 40 and correct <= answered),
  points int not null default 0 check (points between 0 and 100000),
  updated_at timestamptz not null default now(),
  primary key (session_id, user_id)
);
alter table public.space_sessions enable row level security;
alter table public.space_session_scores enable row level security;
drop policy if exists ss_select on public.space_sessions;
create policy ss_select on public.space_sessions for select using (public.is_space_member(space_id));
drop policy if exists ss_insert on public.space_sessions;
create policy ss_insert on public.space_sessions for insert with check (host = auth.uid() and public.is_space_member(space_id));
drop policy if exists ss_update_host on public.space_sessions;
create policy ss_update_host on public.space_sessions for update using (host = auth.uid()) with check (host = auth.uid());
drop policy if exists ss_delete_host on public.space_sessions;
create policy ss_delete_host on public.space_sessions for delete using (host = auth.uid());
-- Scores: members of the session's space can read; you can only write your own row.
create or replace function public.session_space_member(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.space_sessions s where s.id = sid and public.is_space_member(s.space_id));
$$;
grant execute on function public.session_space_member(uuid) to authenticated;
drop policy if exists sss_select on public.space_session_scores;
create policy sss_select on public.space_session_scores for select using (public.session_space_member(session_id));
drop policy if exists sss_insert on public.space_session_scores;
create policy sss_insert on public.space_session_scores for insert with check (user_id = auth.uid() and public.session_space_member(session_id));
drop policy if exists sss_update on public.space_session_scores;
create policy sss_update on public.space_session_scores for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 3) Admin chat: one group chat for every admin ("all") plus private messages between two admins.
create table if not exists public.admin_messages (
  id bigint generated always as identity primary key,
  room text not null check (room = 'all' or room ~ '^dm:[0-9a-f-]{36}:[0-9a-f-]{36}$'),
  sender uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sender_name text not null default '' check (char_length(sender_name) <= 60),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists admin_messages_room on public.admin_messages (room, id desc);
alter table public.admin_messages enable row level security;
drop policy if exists am_select on public.admin_messages;
create policy am_select on public.admin_messages for select using (public.is_admin() and (room = 'all' or position(auth.uid()::text in room) > 0));
drop policy if exists am_insert on public.admin_messages;
create policy am_insert on public.admin_messages for insert with check (public.is_admin() and sender = auth.uid() and (room = 'all' or position(auth.uid()::text in room) > 0));
drop policy if exists am_delete_own on public.admin_messages;
create policy am_delete_own on public.admin_messages for delete using (sender = auth.uid());

create or replace function public.admin_list_admins()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then return jsonb_build_object('success', false, 'error', 'not_admin'); end if;
  return jsonb_build_object('success', true, 'me', auth.uid(), 'admins', (select coalesce(jsonb_agg(jsonb_build_object('id', r.user_id, 'level', r.level,
    'email', u.email, 'username', p.username, 'nickname', p.nickname) order by u.email), '[]'::jsonb)
    from public.admin_roles r join auth.users u on u.id = r.user_id left join public.profiles p on p.id = r.user_id));
end $$;
revoke all on function public.admin_list_admins() from public, anon;
grant execute on function public.admin_list_admins() to authenticated;

-- 4) Realtime: N28C, the admin chat and live sessions update instantly instead of polling.
do $$ declare t text; begin
  foreach t in array array['relay_messages', 'companion_sync', 'admin_messages', 'space_session_scores', 'space_sessions', 'shared_space_posts'] loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

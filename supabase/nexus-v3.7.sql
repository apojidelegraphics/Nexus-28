-- Nexus '28 3.7: in Test Run the Owner, High-Admins and Admins have no limits (and don't see a counter).
-- Run after nexus-v3.6.sql.

create or replace function public.try_take(p_user uuid, p_kind text, p_agent text default 'flash')
returns jsonb language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'utc')::date; u public.try_usage; lim int; used int; name text; life int; m record; unlimited boolean;
begin
  select status, suspended_until into m from public.user_moderation where user_id = p_user;
  if found and (m.status = 'banned' or (m.status = 'suspended' and (m.suspended_until is null or m.suspended_until > now()))) then
    return jsonb_build_object('ok', false, 'error', 'account', 'message', 'Your account can''t use Nexus right now.');
  end if;
  -- 3.7: the Owner, High-Admins and Admins have no limits (still counted, for the dashboard)
  unlimited := exists (select 1 from public.admin_roles r where r.user_id = p_user and (r.level in ('high-admin', 'admin') or r.high_tier = 'owner'));
  insert into public.try_usage (user_id, day) values (p_user, d) on conflict do nothing;
  select * into u from public.try_usage where user_id = p_user and day = d for update;
  if p_kind = 'search' then
    if not unlimited and u.searches >= 60 then return jsonb_build_object('ok', false, 'error', 'daily', 'message', 'That''s 60 web searches today. More tomorrow!'); end if;
    update public.try_usage set searches = searches + 1 where user_id = p_user and day = d;
    return jsonb_build_object('ok', true);
  end if;
  if p_kind = 'extra' then
    if not unlimited and u.extra >= 120 then return jsonb_build_object('ok', false, 'error', 'daily', 'message', 'Thinking features are done for today. Plain answers still work.'); end if;
    update public.try_usage set extra = extra + 1 where user_id = p_user and day = d;
    return jsonb_build_object('ok', true);
  end if;
  -- main answers: 200 a day on the free key, plus the same lifetime allowances as the Mac app (Lyte 95, Neodela 28)
  if not unlimited and u.main >= 200 then return jsonb_build_object('ok', false, 'error', 'daily', 'message', 'That''s 200 free answers today. Come back tomorrow, or add your own key in Settings.'); end if;
  name := case p_agent when 'lyte' then 'Nexus 28 Lyte' when 'neodela' then 'Nexus 28 Neodela' else 'Nexus 28 Flash' end;
  lim := case p_agent when 'lyte' then 95 when 'neodela' then 28 else null end;
  select count into used from public.chat_usage where user_id = p_user and assistant_name = name;
  used := coalesce(used, 0);
  if not unlimited and lim is not null and used >= lim then
    return jsonb_build_object('ok', false, 'error', 'agent', 'message', format('You''ve used your %s free %s chats. Flash is unlimited, or add your own key in Settings.', lim, initcap(p_agent)));
  end if;
  update public.try_usage set main = main + 1 where user_id = p_user and day = d;
  if unlimited then return jsonb_build_object('ok', true, 'today', u.main + 1, 'unlimited', true); end if;   -- doesn't use up their Lyte / Neodela allowance
  insert into public.chat_usage (user_id, assistant_name, count, updated_at) values (p_user, name, 1, now())
    on conflict (user_id, assistant_name) do update set count = public.chat_usage.count + 1, updated_at = now();
  return jsonb_build_object('ok', true, 'today', u.main + 1, 'left_today', 200 - u.main - 1, 'left_agent', case when lim is null then null else lim - used - 1 end);
end $$;
revoke all on function public.try_take(uuid, text, text) from public, anon, authenticated;
grant execute on function public.try_take(uuid, text, text) to service_role;

-- What the Test Run shows you: today's counts and the agent allowances
create or replace function public.try_my_usage()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'today', coalesce((select main from public.try_usage where user_id = auth.uid() and day = (now() at time zone 'utc')::date), 0), 'daily', 200,
    'lyte', coalesce((select count from public.chat_usage where user_id = auth.uid() and assistant_name = 'Nexus 28 Lyte'), 0), 'lyte_limit', 95,
    'neodela', coalesce((select count from public.chat_usage where user_id = auth.uid() and assistant_name = 'Nexus 28 Neodela'), 0), 'neodela_limit', 28,
    'unlimited', exists (select 1 from public.admin_roles r where r.user_id = auth.uid() and (r.level in ('high-admin', 'admin') or r.high_tier = 'owner')))
$$;
revoke all on function public.try_my_usage() from public, anon;
grant execute on function public.try_my_usage() to authenticated;

-- ---------- Chat sync between your computers (Settings → Account → Sync chats). Only you can see your rows.
create table if not exists public.desktop_chats (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  title text not null default '',
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  device text not null default '',
  data jsonb,
  primary key (user_id, id)
);
create index if not exists desktop_chats_user_updated on public.desktop_chats (user_id, updated_at);
alter table public.desktop_chats enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'desktop_chats' and policyname = 'desktop_chats_own') then
    create policy desktop_chats_own on public.desktop_chats for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;
grant select, insert, update, delete on public.desktop_chats to authenticated;

-- ---------- Move to another computer (3.6): a private file per account (same as nexus-v3.6.sql, safe to run twice)
insert into storage.buckets (id, name, public, file_size_limit)
values ('nexus-transfers', 'nexus-transfers', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'objects' and policyname = 'transfers_own_select') then
    create policy "transfers_own_select" on storage.objects for select to authenticated using (bucket_id = 'nexus-transfers' and (storage.foldername(name))[1] = auth.uid()::text);
    create policy "transfers_own_insert" on storage.objects for insert to authenticated with check (bucket_id = 'nexus-transfers' and (storage.foldername(name))[1] = auth.uid()::text);
    create policy "transfers_own_update" on storage.objects for update to authenticated using (bucket_id = 'nexus-transfers' and (storage.foldername(name))[1] = auth.uid()::text);
    create policy "transfers_own_delete" on storage.objects for delete to authenticated using (bucket_id = 'nexus-transfers' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;

-- ---------- 3.7 Beta dashboard (Apoji Admin → Beta): how each beta feature is doing
-- The apps log a tiny event when someone uses a beta feature, or taps 👍 / 👎 on it. No message text is stored.
create table if not exists public.beta_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  feature text not null check (feature ~ '^[a-z0-9_]{2,48}$'),
  kind text not null check (kind in ('use', 'up', 'down')),
  platform text check (platform in ('mac', 'windows', 'web', 'phone', 'other')),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists beta_events_feature_idx on public.beta_events (feature, created_at desc);
alter table public.beta_events enable row level security;
drop policy if exists beta_events_insert_own on public.beta_events;
create policy beta_events_insert_own on public.beta_events for insert to authenticated with check (user_id = auth.uid());
drop policy if exists beta_events_admin_read on public.beta_events;
create policy beta_events_admin_read on public.beta_events for select using (public.is_admin());

-- per feature: stage, uses and people (7 / 30 days), thumbs, beta bug reports (open / all), by platform
create or replace function public.admin_beta_stats() returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return coalesce((select jsonb_agg(row_to_json(x) order by x.stage, x.key) from (
    select f.key, f.title, f.stage, f.min_version,
      (select count(*) from beta_events e where e.feature = f.key and e.kind = 'use' and e.created_at > now() - interval '7 days') as uses_7d,
      (select count(distinct e.user_id) from beta_events e where e.feature = f.key and e.created_at > now() - interval '30 days') as people_30d,
      (select count(*) from beta_events e where e.feature = f.key and e.kind = 'up') as up,
      (select count(*) from beta_events e where e.feature = f.key and e.kind = 'down') as down,
      (select count(*) from feedback_reports r where r.feature = f.key) as reports,
      (select count(*) from feedback_reports r where r.feature = f.key and coalesce(r.status, 'new') in ('new', 'triaged', 'working')) as open_reports,
      (select jsonb_object_agg(p, n) from (select coalesce(e.platform, 'other') p, count(*) n from beta_events e where e.feature = f.key and e.created_at > now() - interval '30 days' group by 1) q) as platforms,
      (select max(e.created_at) from beta_events e where e.feature = f.key) as last_used,
      (select jsonb_agg(jsonb_build_object('kind', e.kind, 'note', e.note, 'platform', e.platform, 'at', e.created_at) order by e.created_at desc) from (select * from beta_events e2 where e2.feature = f.key and e2.note is not null order by created_at desc limit 8) e) as notes
    from feature_flags f) x), '[]'::jsonb);
end $$;
revoke all on function public.admin_beta_stats() from public, anon;
grant execute on function public.admin_beta_stats() to authenticated;

-- Nexus '28 v1.7 — run once in Supabase (SQL editor) for project yzbnxpkuhlxsuwzbjifx. Safe to run again.

-- 1) Beta channel backbone: which features are on for whom. stage: off | admin | beta | all
create table if not exists public.feature_flags (
  key text primary key check (key ~ '^[a-z0-9_]{2,48}$'),
  stage text not null default 'admin' check (stage in ('off','admin','beta','all')),
  title text not null default '',
  description text not null default '',
  min_version text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.feature_flags enable row level security;
drop policy if exists feature_flags_public_read on public.feature_flags;
create policy feature_flags_public_read on public.feature_flags for select using (true);
drop policy if exists feature_flags_admin_write on public.feature_flags;
create policy feature_flags_admin_write on public.feature_flags for all using (public.is_admin()) with check (public.is_admin());
insert into public.feature_flags (key, stage, title, description, min_version) values
  ('phone_companion', 'beta', 'Phone companion', 'Ask Nexus on your Mac from your phone.', '1.7.0'),
  ('homework_helper', 'all', 'Homework helper', 'Step-by-step hints for the problem on your screen.', '1.7.0'),
  ('citations', 'all', 'Citation helper', 'MLA / APA / Chicago citations from a link or your browser.', '1.7.0'),
  ('orb_skins', 'all', 'Orb skins', 'Unlock orb skins with points.', '1.7.0'),
  ('daily_challenge', 'all', 'Daily challenge', 'A small challenge every day for bonus points.', '1.7.0'),
  ('nexus_wrapped', 'all', 'Nexus Wrapped', 'Your year in Nexus.', '1.7.0'),
  ('beta_lab', 'beta', 'Beta lab', 'Early features, one-tap bug reports, prerelease updates.', '1.7.0')
on conflict (key) do nothing;

-- 2) Phone companion relay: your phone and your Mac exchange messages for your account only.
create table if not exists public.relay_messages (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  direction text not null check (direction in ('to_desktop','to_phone')),
  kind text not null default 'ask' check (kind in ('ask','reply','status','error','ping','request','data')),
  agent text not null default '',
  content text not null default '' check (char_length(content) <= 20000),
  reply_to bigint,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  handled_at timestamptz
);
create index if not exists relay_messages_user_created on public.relay_messages (user_id, created_at desc);
alter table public.relay_messages enable row level security;
drop policy if exists relay_select_own on public.relay_messages;
create policy relay_select_own on public.relay_messages for select using (auth.uid() = user_id);
drop policy if exists relay_insert_own on public.relay_messages;
create policy relay_insert_own on public.relay_messages for insert with check (auth.uid() = user_id);
drop policy if exists relay_update_own on public.relay_messages;
create policy relay_update_own on public.relay_messages for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists relay_delete_own on public.relay_messages;
create policy relay_delete_own on public.relay_messages for delete using (auth.uid() = user_id);

-- 3) RECOMMENDED: stop people from making themselves beta testers (or comped) by editing their own profile.
--    Admins (is_admin()) can still change these; everyone else keeps the old values.
create or replace function public.profiles_protect_flags() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    if tg_op = 'INSERT' then
      new.is_beta_tester := false;
      new.is_comped := false;
    else
      new.is_beta_tester := old.is_beta_tester;
      new.is_comped := old.is_comped;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect_flags on public.profiles;
create trigger profiles_protect_flags before insert or update on public.profiles for each row execute function public.profiles_protect_flags();

-- 4) Phone companion data (added in v1.7.1; same as nexus-v1.7.1.sql)
create table if not exists public.companion_sync (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9:_-]{1,80}$'),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.companion_sync enable row level security;
drop policy if exists companion_select_own on public.companion_sync;
create policy companion_select_own on public.companion_sync for select using (auth.uid() = user_id);
drop policy if exists companion_insert_own on public.companion_sync;
create policy companion_insert_own on public.companion_sync for insert with check (auth.uid() = user_id);
drop policy if exists companion_update_own on public.companion_sync;
create policy companion_update_own on public.companion_sync for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists companion_delete_own on public.companion_sync;
create policy companion_delete_own on public.companion_sync for delete using (auth.uid() = user_id);

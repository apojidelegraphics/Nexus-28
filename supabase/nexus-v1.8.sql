-- Nexus '28 v1.8 — N28C phone app: photos/files from the phone, and Shared Spaces (study groups with friends).
-- Run once, after nexus-v1.7.sql and nexus-v1.7.1.sql. Safe to run again.

-- 1) Photos and files the phone sends to your Mac (homework photos, "Send to Mac"). Private to you; the Mac deletes
--    each one after it picks it up.
create table if not exists public.companion_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null default 'photo.jpg' check (char_length(name) <= 120),
  mime text not null default 'image/jpeg' check (mime in ('image/jpeg','image/png','image/webp','text/plain')),
  data text not null check (char_length(data) <= 6000000),           -- base64, ~4.5 MB max
  created_at timestamptz not null default now()
);
alter table public.companion_files enable row level security;
drop policy if exists cfiles_select_own on public.companion_files;
create policy cfiles_select_own on public.companion_files for select using (auth.uid() = user_id);
drop policy if exists cfiles_insert_own on public.companion_files;
create policy cfiles_insert_own on public.companion_files for insert with check (auth.uid() = user_id);
drop policy if exists cfiles_delete_own on public.companion_files;
create policy cfiles_delete_own on public.companion_files for delete using (auth.uid() = user_id);

-- 2) Shared Spaces: a group with an invite code, a feed (messages, shared decks, answers from members' Nexus),
--    and each member's study streak.
create table if not exists public.shared_spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  color text not null default '#3dffa0' check (color ~ '^#[0-9a-fA-F]{6}$'),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.shared_space_members (
  space_id uuid not null references public.shared_spaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nickname text not null default 'Friend' check (char_length(nickname) between 1 and 24),
  streak int not null default 0 check (streak between 0 and 10000),
  reviewed_today int not null default 0 check (reviewed_today between 0 and 100000),
  stats_day date,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (space_id, user_id)
);
create table if not exists public.shared_space_posts (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.shared_spaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nickname text not null default 'Friend' check (char_length(nickname) between 1 and 40),
  kind text not null default 'msg' check (kind in ('msg','deck','ai','join')),
  content text not null default '' check (char_length(content) <= 12000),
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) <= 200000),
  created_at timestamptz not null default now()
);
create index if not exists shared_space_posts_space_created on public.shared_space_posts (space_id, created_at desc);

-- Membership check that doesn't recurse through RLS.
create or replace function public.is_space_member(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shared_space_members where space_id = sid and user_id = auth.uid());
$$;

alter table public.shared_spaces enable row level security;
alter table public.shared_space_members enable row level security;
alter table public.shared_space_posts enable row level security;

drop policy if exists sspaces_select on public.shared_spaces;
create policy sspaces_select on public.shared_spaces for select using (public.is_space_member(id));
drop policy if exists sspaces_update_owner on public.shared_spaces;
create policy sspaces_update_owner on public.shared_spaces for update using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists sspaces_delete_owner on public.shared_spaces;
create policy sspaces_delete_owner on public.shared_spaces for delete using (owner = auth.uid());
-- (spaces are created and joined only through the functions below)

drop policy if exists ssm_select on public.shared_space_members;
create policy ssm_select on public.shared_space_members for select using (public.is_space_member(space_id));
drop policy if exists ssm_update_own on public.shared_space_members;
create policy ssm_update_own on public.shared_space_members for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists ssm_delete_own on public.shared_space_members;
create policy ssm_delete_own on public.shared_space_members for delete using (user_id = auth.uid());

drop policy if exists ssp_select on public.shared_space_posts;
create policy ssp_select on public.shared_space_posts for select using (public.is_space_member(space_id));
drop policy if exists ssp_insert on public.shared_space_posts;
create policy ssp_insert on public.shared_space_posts for insert with check (user_id = auth.uid() and public.is_space_member(space_id));
drop policy if exists ssp_delete_own on public.shared_space_posts;
create policy ssp_delete_own on public.shared_space_posts for delete using (user_id = auth.uid());

create or replace function public.create_shared_space(p_name text, p_nickname text, p_color text default '#3dffa0')
returns public.shared_spaces language plpgsql security definer set search_path = public as $$
declare s public.shared_spaces; c text; tries int := 0;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if (select count(*) from public.shared_space_members where user_id = auth.uid()) >= 20 then raise exception 'You are in 20 spaces already.'; end if;
  loop
    c := upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 6));
    exit when char_length(c) = 6 and not exists (select 1 from public.shared_spaces where code = c);
    tries := tries + 1; if tries > 20 then raise exception 'Try again.'; end if;
  end loop;
  insert into public.shared_spaces (name, code, color, owner)
    values (left(trim(p_name), 40), c, case when p_color ~ '^#[0-9a-fA-F]{6}$' then p_color else '#3dffa0' end, auth.uid()) returning * into s;
  insert into public.shared_space_members (space_id, user_id, nickname) values (s.id, auth.uid(), left(coalesce(nullif(trim(p_nickname), ''), 'Friend'), 24));
  return s;
end $$;

create or replace function public.join_shared_space(p_code text, p_nickname text)
returns public.shared_spaces language plpgsql security definer set search_path = public as $$
declare s public.shared_spaces; nick text := left(coalesce(nullif(trim(p_nickname), ''), 'Friend'), 24);
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into s from public.shared_spaces where code = upper(trim(p_code));
  if s.id is null then raise exception 'No space with that code.'; end if;
  if (select count(*) from public.shared_space_members where space_id = s.id) >= 30 then raise exception 'That space is full.'; end if;
  insert into public.shared_space_members (space_id, user_id, nickname) values (s.id, auth.uid(), nick)
    on conflict (space_id, user_id) do nothing;
  if found then insert into public.shared_space_posts (space_id, user_id, nickname, kind, content) values (s.id, auth.uid(), nick, 'join', nick || ' joined'); end if;
  return s;
end $$;

revoke all on function public.create_shared_space(text, text, text) from public, anon;
revoke all on function public.join_shared_space(text, text) from public, anon;
grant execute on function public.create_shared_space(text, text, text) to authenticated;
grant execute on function public.join_shared_space(text, text) to authenticated;
grant execute on function public.is_space_member(uuid) to authenticated;

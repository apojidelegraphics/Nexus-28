-- Nexus '28 v2.7: group challenges in Shared Spaces, and changelog emails (opt-in, sent with EmailJS from Apoji Admin).
-- Run once in Supabase → SQL Editor, after nexus-v2.6.sql. Safe to run again.

-- =====================================================================================================
-- 1) Group challenges: "review 300 cards together this week", "everyone studies 5 days", "200 focus minutes"
-- =====================================================================================================
create table if not exists public.space_challenges (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.shared_spaces(id) on delete cascade,
  kind text not null check (kind in ('cards', 'days', 'focus')),
  goal int not null check (goal between 1 and 100000),
  title text not null default '' check (char_length(title) <= 80),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null default now() + interval '7 days',
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at <= starts_at + interval '31 days')
);
create index if not exists space_challenges_space on public.space_challenges (space_id, ends_at desc);
alter table public.space_challenges enable row level security;
drop policy if exists sch_select on public.space_challenges;
create policy sch_select on public.space_challenges for select using (public.is_space_member(space_id));
drop policy if exists sch_insert on public.space_challenges;
create policy sch_insert on public.space_challenges for insert with check (public.is_space_member(space_id) and created_by = auth.uid()
  and (select count(*) from public.space_challenges c where c.space_id = space_challenges.space_id and c.ends_at > now()) < 3);
drop policy if exists sch_delete on public.space_challenges;
create policy sch_delete on public.space_challenges for delete using (created_by = auth.uid() or exists (select 1 from public.shared_spaces s where s.id = space_id and s.owner = auth.uid()));

create table if not exists public.space_challenge_progress (
  challenge_id uuid not null references public.space_challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null default 'Friend' check (char_length(nickname) <= 24),
  amount int not null default 0 check (amount between 0 and 1000000),
  days date[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);
alter table public.space_challenge_progress enable row level security;
drop policy if exists scp_select on public.space_challenge_progress;
create policy scp_select on public.space_challenge_progress for select using (exists (select 1 from public.space_challenges c where c.id = challenge_id and public.is_space_member(c.space_id)));
revoke insert, update, delete on public.space_challenge_progress from anon, authenticated;

-- Report what you did (cards reviewed, focus minutes, a study day) to every running challenge of that kind in the
-- spaces you're in. Called by the Mac app and N28C; capped so nobody can type in a fake number.
create or replace function public.challenge_report(p_kind text, p_amount int default 1, p_day date default current_date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c record; n int := 0; nick text;
begin
  if auth.uid() is null or p_kind not in ('cards', 'days', 'focus') then return jsonb_build_object('success', false, 'error', 'bad_request'); end if;
  for c in select ch.id, ch.kind, m.nickname from public.space_challenges ch join public.shared_space_members m on m.space_id = ch.space_id and m.user_id = auth.uid()
           where ch.kind = p_kind and now() between ch.starts_at and ch.ends_at loop
    if p_kind = 'days' then
      insert into public.space_challenge_progress (challenge_id, user_id, nickname, amount, days) values (c.id, auth.uid(), c.nickname, 1, array[coalesce(p_day, current_date)])
      on conflict (challenge_id, user_id) do update set nickname = excluded.nickname, updated_at = now(),
        days = case when coalesce(p_day, current_date) = any(space_challenge_progress.days) then space_challenge_progress.days else space_challenge_progress.days || coalesce(p_day, current_date) end,
        amount = cardinality(case when coalesce(p_day, current_date) = any(space_challenge_progress.days) then space_challenge_progress.days else space_challenge_progress.days || coalesce(p_day, current_date) end);
    else
      insert into public.space_challenge_progress (challenge_id, user_id, nickname, amount) values (c.id, auth.uid(), c.nickname, least(greatest(coalesce(p_amount, 1), 1), case when p_kind = 'focus' then 240 else 500 end))
      on conflict (challenge_id, user_id) do update set nickname = excluded.nickname, updated_at = now(),
        amount = least(space_challenge_progress.amount + least(greatest(coalesce(p_amount, 1), 1), case when p_kind = 'focus' then 240 else 500 end), 1000000);
    end if;
    n := n + 1;
  end loop;
  return jsonb_build_object('success', true, 'challenges', n);
end $$;

-- A space's challenges with the group total and the leaderboard
create or replace function public.space_challenges_for(p_space uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_space_member(p_space) then return jsonb_build_object('success', false, 'error', 'not_member'); end if;
  return jsonb_build_object('success', true, 'challenges', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'goal', c.goal, 'title', c.title, 'starts_at', c.starts_at, 'ends_at', c.ends_at,
      'mine', c.created_by = auth.uid(), 'total', coalesce((select sum(amount) from public.space_challenge_progress p where p.challenge_id = c.id), 0),
      'board', (select coalesce(jsonb_agg(jsonb_build_object('nickname', p.nickname, 'amount', p.amount, 'me', p.user_id = auth.uid()) order by p.amount desc), '[]'::jsonb) from public.space_challenge_progress p where p.challenge_id = c.id))
    order by c.ends_at desc), '[]'::jsonb) from public.space_challenges c where c.space_id = p_space and c.ends_at > now() - interval '14 days'));
end $$;

-- =====================================================================================================
-- 2) Changelog emails: opt in from the app or N28C; Apoji Admin sends each release with EmailJS
-- =====================================================================================================
create table if not exists public.changelog_subscribers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token uuid not null default gen_random_uuid() unique,       -- for the one-click unsubscribe link
  subscribed_at timestamptz not null default now(),
  last_sent_version text not null default ''
);
alter table public.changelog_subscribers enable row level security;
drop policy if exists cs_own on public.changelog_subscribers;
create policy cs_own on public.changelog_subscribers for select using (user_id = auth.uid());
revoke insert, update, delete on public.changelog_subscribers from anon, authenticated;

create or replace function public.changelog_subscribe(p_on boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return jsonb_build_object('success', false, 'error', 'sign_in'); end if;
  if p_on then insert into public.changelog_subscribers (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  else delete from public.changelog_subscribers where user_id = auth.uid(); end if;
  return jsonb_build_object('success', true, 'on', p_on);
end $$;

-- The unsubscribe page (no sign-in): just the token from the email
create or replace function public.changelog_unsubscribe(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  delete from public.changelog_subscribers where token = p_token;
  return jsonb_build_object('success', true, 'removed', found);
end $$;

-- Apoji Admin: who to email (high-admins only), and remember what was sent
create or replace function public.admin_changelog_recipients(p_version text)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if public.get_my_admin_level() is distinct from 'high-admin' then return jsonb_build_object('success', false, 'error', 'not_high_admin'); end if;
  return jsonb_build_object('success', true,
    'total', (select count(*) from public.changelog_subscribers),
    'recipients', (select coalesce(jsonb_agg(jsonb_build_object('user_id', s.user_id, 'email', u.email, 'name', coalesce(nullif(p.nickname, ''), nullif(p.username, ''), split_part(u.email, '@', 1)), 'token', s.token)), '[]'::jsonb)
      from public.changelog_subscribers s join auth.users u on u.id = s.user_id left join public.profiles p on p.id = s.user_id
      where s.last_sent_version is distinct from p_version and u.email is not null));
end $$;
create or replace function public.admin_changelog_mark_sent(p_version text, p_users uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if public.get_my_admin_level() is distinct from 'high-admin' then return jsonb_build_object('success', false, 'error', 'not_high_admin'); end if;
  update public.changelog_subscribers set last_sent_version = left(p_version, 20) where user_id = any(p_users);
  insert into public.moderation_log (action, performed_by, details) values ('changelog_emailed', auth.uid(), jsonb_build_object('version', p_version, 'count', cardinality(p_users)));
  return jsonb_build_object('success', true);
end $$;

-- EmailJS settings for Apoji Admin (high-admins only; the public key, service and template ids are not secret,
-- but keep them out of the repo anyway)
create table if not exists public.admin_settings (
  key text primary key check (char_length(key) <= 40),
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.admin_settings enable row level security;
drop policy if exists ads_hi on public.admin_settings;
create policy ads_hi on public.admin_settings for all using (public.get_my_admin_level() = 'high-admin') with check (public.get_my_admin_level() = 'high-admin');

do $$ declare f text; begin
  foreach f in array array['challenge_report(text, int, date)', 'space_challenges_for(uuid)', 'changelog_subscribe(boolean)', 'admin_changelog_recipients(text)', 'admin_changelog_mark_sent(text, uuid[])'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on function public.changelog_unsubscribe(uuid) from public;
grant execute on function public.changelog_unsubscribe(uuid) to anon, authenticated;

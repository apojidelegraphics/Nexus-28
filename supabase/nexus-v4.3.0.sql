-- Nexus '28 4.3.0 (run in the Nexus project's SQL editor, after nexus-v4.2.0.sql). Safe to run more than once.
--  1) Widget themes in the Cirkts shop (kind 'wtheme') and event-only items you earn instead of buy.
--  2) Pinned achievements on your profile (up to three, everyone who sees your card sees them).
--  3) Gift a cosmetic to a friend (you pay, they get it, they get a notice).
--  4) Seasonal events: two weeks of event quests, and an exclusive frame for finishing them.
--  5) Friends feed: what your friends unlocked and did, with reactions.
--  6) Classroom mode: a teacher makes a class, students join with a code, the teacher shares decks and sees progress
--     on them (never anyone's chats).
--  7) Developers: an "Ask Nexus" box or floating chat button for your own site (embed_bots + the embed-chat function).

-- 1) ------------------------------------------------------------------------------------------------------
alter table public.cosmetics drop constraint if exists cosmetics_kind_check;
alter table public.cosmetics add constraint cosmetics_kind_check check (kind in ('frame', 'pframe', 'ptheme', 'theme', 'font', 'color', 'banner', 'skin', 'effect', 'wtheme'));
alter table public.cosmetics drop constraint if exists cosmetics_id_check;
alter table public.cosmetics add constraint cosmetics_id_check check (id ~ '^(frame|pframe|ptheme|theme|font|color|banner|skin|effect|wtheme):[a-z0-9_-]{2,30}$');
alter table public.cirkts_owned drop constraint if exists cirkts_owned_how_check;
alter table public.cirkts_owned add constraint cirkts_owned_how_check check (how in ('bought', 'kept', 'gift', 'admin', 'pack', 'event'));
insert into public.cosmetics (id, kind, name, price, sort, data) values
  ('wtheme:frost', 'wtheme', 'Frosted', 0, 300, '{}'::jsonb),
  ('wtheme:solid', 'wtheme', 'Solid', 200, 301, '{}'::jsonb),
  ('wtheme:minimal', 'wtheme', 'Minimal', 300, 302, '{}'::jsonb),
  ('wtheme:paper', 'wtheme', 'Paper', 450, 303, '{}'::jsonb),
  ('wtheme:neon', 'wtheme', 'Neon edge', 600, 304, '{}'::jsonb),
  ('wtheme:sunset', 'wtheme', 'Sunset glass', 700, 305, '{}'::jsonb),
  ('wtheme:terminal', 'wtheme', 'Terminal', 800, 306, '{}'::jsonb),
  ('wtheme:aurora', 'wtheme', 'Aurora', 1000, 307, '{}'::jsonb),
  -- earned by finishing an event, never sold
  ('frame:firstfrost', 'frame', 'First Frost', 1000000, 400, '{"event": "first-frost-2026"}'::jsonb),   -- a price nobody can pay, so only finishing the event gives it (price 0 would mean free to wear)
  ('frame:winterlights', 'frame', 'Winter Lights', 1000000, 401, '{"event": "winter-lights-2026"}'::jsonb)
on conflict (id) do update set name = excluded.name, price = excluded.price, sort = excluded.sort, data = excluded.data, active = true;

-- event items can't be bought (cirkts_buy from 4.2.0 + one check)
create or replace function public.cirkts_buy(p_item text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c cosmetics; w cirkts_wallet; bal int;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Sign in first.'); end if;
  select * into c from cosmetics where id = p_item and active;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'That isn''t in the shop.'); end if;
  if c.data ? 'event' then return jsonb_build_object('ok', false, 'error', 'That one is earned in an event, not bought.'); end if;
  if c.data ? 'months' and not exists (select 1 from jsonb_array_elements_text(c.data -> 'months') m
      where m::int in (extract(month from now() - interval '14 hours')::int, extract(month from now() + interval '14 hours')::int)) then
    return jsonb_build_object('ok', false, 'error', 'That one is only in the shop during its month.');
  end if;
  if exists (select 1 from cirkts_owned where user_id = me and item_id = c.id) then return jsonb_build_object('ok', false, 'error', 'You already have it.', 'owned', true); end if;
  select * into w from cirkts_wallet where user_id = me for update;
  if w.user_id is null then return jsonb_build_object('ok', false, 'error', 'You don''t have any Cirkts yet. Earn some with daily quests.'); end if;
  bal := w.earned + w.extra - w.spent;
  if bal < c.price then return jsonb_build_object('ok', false, 'error', format('You need %s more Cirkts.', c.price - bal), 'short', c.price - bal); end if;
  update cirkts_wallet set spent = spent + c.price where user_id = me;
  insert into cirkts_owned (user_id, item_id, price_paid) values (me, c.id, c.price);
  return public.cirkts_state() || jsonb_build_object('bought', c.id, 'price', c.price);
end $$;

-- a widget theme is worn like the rest of your look
alter table public.profile_style add column if not exists wtheme text;

-- 2) ------------------------------------------------------------------------------------------------------
alter table public.profile_style add column if not exists pins jsonb not null default '[]'::jsonb;
alter table public.profile_style drop constraint if exists profile_style_pins_check;
alter table public.profile_style add constraint profile_style_pins_check check (jsonb_typeof(pins) = 'array' and jsonb_array_length(pins) <= 3 and octet_length(pins::text) <= 600);
create or replace function public.profile_pins_set(p_pins jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); clean jsonb;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Sign in first.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', left(regexp_replace(coalesce(x ->> 'id', ''), '[^a-z0-9_]', '', 'g'), 32),
      'name', left(regexp_replace(coalesce(x ->> 'name', ''), '[[:cntrl:]<>]', '', 'g'), 32), 'icon', left(coalesce(x ->> 'icon', ''), 4), 'rare', coalesce((x ->> 'rare')::boolean, false))), '[]'::jsonb)
    into clean from (select x from jsonb_array_elements(case when jsonb_typeof(p_pins) = 'array' then p_pins else '[]'::jsonb end) x where jsonb_typeof(x) = 'object' limit 3) y;
  insert into profile_style (user_id) values (me) on conflict do nothing;
  update profile_style set pins = clean, updated_at = now() where user_id = me;
  return jsonb_build_object('ok', true, 'pins', clean);
end $$;
revoke all on function public.profile_pins_set(jsonb) from public, anon;
grant execute on function public.profile_pins_set(jsonb) to authenticated;
create or replace function public.profile_wtheme_set(p_item text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Sign in first.'); end if;
  if coalesce(p_item, '') <> '' and not exists (select 1 from cosmetics c where c.id = p_item and c.kind = 'wtheme' and (c.price = 0 or exists (select 1 from cirkts_owned o where o.user_id = me and o.item_id = c.id))) then
    return jsonb_build_object('ok', false, 'error', 'You don''t own that widget theme yet.'); end if;
  insert into profile_style (user_id) values (me) on conflict do nothing;
  update profile_style set wtheme = nullif(p_item, ''), updated_at = now() where user_id = me;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.profile_wtheme_set(text) from public, anon;
grant execute on function public.profile_wtheme_set(text) to authenticated;

-- 3) ------------------------------------------------------------------------------------------------------
create table if not exists public.cosmetic_gifts (
  id bigint generated always as identity primary key,
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  item_id text not null references public.cosmetics(id) on delete cascade,
  note text not null default '' check (char_length(note) <= 120),
  price int not null,
  at timestamptz not null default now()
);
alter table public.cosmetic_gifts enable row level security;
drop policy if exists cosmetic_gifts_read on public.cosmetic_gifts;
create policy cosmetic_gifts_read on public.cosmetic_gifts for select using (from_user = auth.uid() or to_user = auth.uid() or public.is_admin());
create or replace function public.cirkts_gift(p_to text, p_item text, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); them uuid; c cosmetics; w cirkts_wallet; bal int; who text;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Sign in first.'); end if;
  select id into them from profiles where lower(username) = lower(regexp_replace(coalesce(p_to, ''), '^@', ''));
  if them is null then return jsonb_build_object('ok', false, 'error', 'Nobody has that username.'); end if;
  if them = me then return jsonb_build_object('ok', false, 'error', 'That''s you.'); end if;
  if not exists (select 1 from friendships where user_a = least(me, them) and user_b = greatest(me, them) and status = 'accepted') then return jsonb_build_object('ok', false, 'error', 'You can only send gifts to friends.'); end if;
  select * into c from cosmetics where id = p_item and active;
  if c.id is null or c.price <= 0 or c.data ? 'event' or c.data ? 'owner' then return jsonb_build_object('ok', false, 'error', 'That can''t be a gift.'); end if;
  if exists (select 1 from cirkts_owned where user_id = them and item_id = c.id) then return jsonb_build_object('ok', false, 'error', 'They already have it.'); end if;
  if (select count(*) from cosmetic_gifts where from_user = me and at > now() - interval '1 day') >= 10 then return jsonb_build_object('ok', false, 'error', 'That''s a lot of gifts today. Try again tomorrow.'); end if;
  select * into w from cirkts_wallet where user_id = me for update;
  bal := coalesce(w.earned, 0) + coalesce(w.extra, 0) - coalesce(w.spent, 0);
  if w.user_id is null or bal < c.price then return jsonb_build_object('ok', false, 'error', format('You need %s more Cirkts.', c.price - greatest(bal, 0))); end if;
  update cirkts_wallet set spent = spent + c.price where user_id = me;
  insert into cirkts_owned (user_id, item_id, price_paid, how) values (them, c.id, 0, 'gift') on conflict do nothing;
  insert into cosmetic_gifts (from_user, to_user, item_id, note, price) values (me, them, c.id, left(regexp_replace(coalesce(p_note, ''), '[[:cntrl:]<>]', '', 'g'), 120), c.price);
  select coalesce(nullif(username, ''), 'A friend') into who from profiles where id = me;
  insert into broadcasts (title, body, audience, to_user, created_by) values ('🎁 You got a gift', left(format('@%s sent you %s.%s', who, c.name, case when coalesce(p_note, '') <> '' then ' “' || p_note || '”' else '' end), 400), 'user', them, me);
  insert into activity_feed (user_id, kind, text) values (me, 'gift', format('sent a gift: %s', c.name));
  return public.cirkts_state() || jsonb_build_object('gifted', c.id, 'to', who);
end $$;

-- 4) ------------------------------------------------------------------------------------------------------
create table if not exists public.seasonal_events (
  id text primary key check (id ~ '^[a-z0-9-]{3,40}$'),
  name text not null, blurb text not null default '',
  starts_at timestamptz not null, ends_at timestamptz not null,
  quests jsonb not null,        -- [{ id, text, event, n }] (counted by the apps from the day you join)
  reward_item text references public.cosmetics(id),
  color text not null default '#5ce1ff',
  active boolean not null default true
);
alter table public.seasonal_events enable row level security;
drop policy if exists seasonal_events_read on public.seasonal_events;
create policy seasonal_events_read on public.seasonal_events for select using (true);
grant select on public.seasonal_events to anon, authenticated;
create table if not exists public.event_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null references public.seasonal_events(id) on delete cascade,
  quest text not null,
  at timestamptz not null default now(),
  primary key (user_id, event_id, quest)
);
alter table public.event_claims enable row level security;
drop policy if exists event_claims_read on public.event_claims;
create policy event_claims_read on public.event_claims for select using (user_id = auth.uid() or public.is_admin());
insert into public.seasonal_events (id, name, blurb, starts_at, ends_at, quests, reward_item, color) values
  ('first-frost-2026', 'First Frost', 'Two weeks to cool down and lock in. Finish all four for the First Frost frame.', '2026-11-26T05:00:00Z', '2026-12-10T05:00:00Z',
   '[{"id":"ff_chat25","text":"Send 25 messages","event":"chats","n":25},{"id":"ff_study40","text":"Review 40 flashcards","event":"study_review","n":40},{"id":"ff_focus3","text":"Finish 3 Focus sessions","event":"focus","n":3},{"id":"ff_streak5","text":"Reach a 5-day streak","event":"streak","n":5}]', 'frame:firstfrost', '#9fe7ff'),
  ('winter-lights-2026', 'Winter Lights', 'Light up the end of the year. Finish all four for the Winter Lights frame.', '2026-12-14T05:00:00Z', '2026-12-31T05:00:00Z',
   '[{"id":"wl_chat40","text":"Send 40 messages","event":"chats","n":40},{"id":"wl_deck2","text":"Make 2 flashcard decks","event":"study_cards","n":2},{"id":"wl_write","text":"Write something in Jots & Docs","event":"write","n":1},{"id":"wl_huddle","text":"Start a @huddle","event":"huddle","n":1}]', 'frame:winterlights', '#ffd36b')
on conflict (id) do update set name = excluded.name, blurb = excluded.blurb, starts_at = excluded.starts_at, ends_at = excluded.ends_at, quests = excluded.quests, reward_item = excluded.reward_item, color = excluded.color;

create or replace function public.event_state()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'blurb', e.blurb, 'starts_at', e.starts_at, 'ends_at', e.ends_at, 'quests', e.quests, 'reward', e.reward_item, 'color', e.color,
      'live', now() between e.starts_at and e.ends_at,
      'claimed', coalesce((select jsonb_agg(quest) from event_claims c where c.user_id = auth.uid() and c.event_id = e.id), '[]'::jsonb),
      'rewarded', exists (select 1 from cirkts_owned o where o.user_id = auth.uid() and o.item_id = e.reward_item)) order by e.starts_at), '[]'::jsonb)
  from seasonal_events e where e.active and e.ends_at > now() - interval '3 days' and e.starts_at < now() + interval '30 days';
$$;
-- the apps count progress from when you joined the event and claim each quest when it's done; all four → the frame
create or replace function public.event_claim(p_event text, p_quest text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); e seasonal_events; n int; done boolean := false;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Sign in first.'); end if;
  select * into e from seasonal_events where id = p_event and active;
  if e.id is null or now() not between e.starts_at and e.ends_at then return jsonb_build_object('ok', false, 'error', 'That event isn''t on right now.'); end if;
  if not exists (select 1 from jsonb_array_elements(e.quests) q where q ->> 'id' = p_quest) then return jsonb_build_object('ok', false, 'error', 'Unknown quest.'); end if;
  insert into event_claims (user_id, event_id, quest) values (me, e.id, p_quest) on conflict do nothing;
  select count(*) into n from event_claims where user_id = me and event_id = e.id;
  if n >= jsonb_array_length(e.quests) and e.reward_item is not null then
    insert into cirkts_owned (user_id, item_id, price_paid, how) values (me, e.reward_item, 0, 'event') on conflict do nothing;
    if found then done := true; insert into activity_feed (user_id, kind, text) values (me, 'event', format('finished %s and earned a new frame', e.name)); end if;
  end if;
  return jsonb_build_object('ok', true, 'claimed', n, 'total', jsonb_array_length(e.quests), 'rewarded', done, 'reward', e.reward_item);
end $$;
revoke all on function public.event_claim(text, text) from public, anon;
grant execute on function public.event_claim(text, text) to authenticated;
grant execute on function public.event_state() to authenticated;

-- 5) ------------------------------------------------------------------------------------------------------
create table if not exists public.activity_feed (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('achievement', 'quests', 'streak', 'look', 'event', 'gift', 'deck', 'class')),
  text text not null check (char_length(text) between 1 and 140),
  at timestamptz not null default now()
);
create index if not exists activity_feed_user on public.activity_feed (user_id, at desc);
alter table public.activity_feed enable row level security;
drop policy if exists activity_feed_own on public.activity_feed;
create policy activity_feed_own on public.activity_feed for select using (user_id = auth.uid() or public.is_admin());
create table if not exists public.feed_reactions (
  item bigint not null references public.activity_feed(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('🔥', '👏', '❤️', '😂', '🎉')),
  primary key (item, user_id)
);
alter table public.feed_reactions enable row level security;
-- what you did (posted by your apps; a few a day at most per kind)
create or replace function public.feed_post(p_kind text, p_text text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or coalesce(p_kind, '') not in ('achievement', 'quests', 'streak', 'look', 'deck', 'class') then return jsonb_build_object('ok', false); end if;
  if (select count(*) from activity_feed where user_id = me and kind = p_kind and at > now() - interval '1 day') >= 5 then return jsonb_build_object('ok', false, 'error', 'enough for today'); end if;
  insert into activity_feed (user_id, kind, text) values (me, p_kind, left(regexp_replace(coalesce(p_text, ''), '[[:cntrl:]<>]', '', 'g'), 140));
  return jsonb_build_object('ok', true);
end $$;
-- your friends' last two weeks (only accepted friends; invisible people still show, it's not presence)
create or replace function public.friends_feed(p_limit int default 40)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(x) order by x.at desc), '[]'::jsonb) from (
    select a.id, a.kind, a.text, a.at, p.username, coalesce(nullif(s.display_name, ''), p.nickname, p.username) as name, p.avatar_url, s.frame,
      coalesce((select jsonb_object_agg(emoji, n) from (select emoji, count(*) n from feed_reactions r where r.item = a.id group by emoji) z), '{}'::jsonb) as reactions,
      (select emoji from feed_reactions r where r.item = a.id and r.user_id = auth.uid()) as mine
    from activity_feed a join profiles p on p.id = a.user_id left join profile_style s on s.user_id = a.user_id
    where a.at > now() - interval '14 days' and exists (select 1 from friendships f where f.status = 'accepted' and ((f.user_a = auth.uid() and f.user_b = a.user_id) or (f.user_b = auth.uid() and f.user_a = a.user_id)))
    order by a.at desc limit least(greatest(coalesce(p_limit, 40), 1), 100)) x;
$$;
create or replace function public.feed_react(p_item bigint, p_emoji text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); owner uuid;
begin
  select user_id into owner from activity_feed where id = p_item;
  if me is null or owner is null or not exists (select 1 from friendships f where f.status = 'accepted' and f.user_a = least(me, owner) and f.user_b = greatest(me, owner)) then return jsonb_build_object('ok', false); end if;
  if coalesce(p_emoji, '') = '' then delete from feed_reactions where item = p_item and user_id = me;
  else insert into feed_reactions (item, user_id, emoji) values (p_item, me, p_emoji) on conflict (item, user_id) do update set emoji = excluded.emoji; end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.feed_post(text, text) from public, anon;
revoke all on function public.friends_feed(int) from public, anon;
revoke all on function public.feed_react(bigint, text) from public, anon;
grant execute on function public.feed_post(text, text), public.friends_feed(int), public.feed_react(bigint, text) to authenticated;
revoke all on function public.cirkts_gift(text, text, text) from public, anon;
grant execute on function public.cirkts_gift(text, text, text) to authenticated;

-- 6) ------------------------------------------------------------------------------------------------------
create table if not exists public.classrooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  name text not null check (char_length(name) between 1 and 60),
  owner uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.classroom_members (
  class_id uuid not null references public.classrooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'student' check (role in ('teacher', 'student')),
  joined_at timestamptz not null default now(),
  primary key (class_id, user_id)
);
create table if not exists public.classroom_decks (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classrooms(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  cards jsonb not null check (jsonb_typeof(cards) = 'array' and jsonb_array_length(cards) between 1 and 100 and octet_length(cards::text) <= 100000),
  due date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.classroom_progress (
  deck_id uuid not null references public.classroom_decks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reviewed int not null default 0, correct int not null default 0, done boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (deck_id, user_id)
);
alter table public.classrooms enable row level security;
alter table public.classroom_members enable row level security;
alter table public.classroom_decks enable row level security;
alter table public.classroom_progress enable row level security;
-- everything goes through the functions below
create or replace function public.classroom_create(p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c text; id uuid;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Sign in first.'); end if;
  if coalesce(trim(p_name), '') = '' then return jsonb_build_object('ok', false, 'error', 'Give the class a name.'); end if;
  if (select count(*) from classrooms where owner = me) >= 20 then return jsonb_build_object('ok', false, 'error', 'You have 20 classes already.'); end if;
  loop c := upper(substr(translate(replace(gen_random_uuid()::text, '-', ''), '01', 'XY'), 1, 6)); exit when not exists (select 1 from classrooms where code = c); end loop;
  insert into classrooms (code, name, owner) values (c, left(trim(p_name), 60), me) returning classrooms.id into id;
  insert into classroom_members (class_id, user_id, role) values (id, me, 'teacher');
  return jsonb_build_object('ok', true, 'id', id, 'code', c);
end $$;
create or replace function public.classroom_join(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r classrooms;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Sign in first.'); end if;
  select * into r from classrooms where code = upper(trim(coalesce(p_code, '')));
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'No class has that code. Check it with your teacher.'); end if;
  if (select count(*) from classroom_members where class_id = r.id) >= 300 then return jsonb_build_object('ok', false, 'error', 'That class is full.'); end if;
  insert into classroom_members (class_id, user_id, role) values (r.id, me, 'student') on conflict do nothing;
  return jsonb_build_object('ok', true, 'id', r.id, 'name', r.name);
end $$;
create or replace function public.classroom_leave(p_class uuid, p_user uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); who uuid := coalesce(p_user, auth.uid());
begin
  if who <> me and not exists (select 1 from classroom_members where class_id = p_class and user_id = me and role = 'teacher') then return jsonb_build_object('ok', false, 'error', 'Only the teacher can remove people.'); end if;
  if exists (select 1 from classrooms where id = p_class and owner = who) then delete from classrooms where id = p_class and owner = me; return jsonb_build_object('ok', true, 'deleted', true); end if;
  delete from classroom_members where class_id = p_class and user_id = who;
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.my_classrooms()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'role', m.role, 'code', case when m.role = 'teacher' then c.code end,
      'members', (select count(*) from classroom_members x where x.class_id = c.id and x.role = 'student'),
      'decks', (select count(*) from classroom_decks d where d.class_id = c.id),
      'todo', (select count(*) from classroom_decks d where d.class_id = c.id and not exists (select 1 from classroom_progress p where p.deck_id = d.id and p.user_id = auth.uid() and p.done))) order by c.created_at desc), '[]'::jsonb)
  from classroom_members m join classrooms c on c.id = m.class_id where m.user_id = auth.uid();
$$;
create or replace function public.classroom_deck_add(p_class uuid, p_name text, p_cards jsonb, p_due date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); clean jsonb; id uuid;
begin
  if not exists (select 1 from classroom_members where class_id = p_class and user_id = me and role = 'teacher') then return jsonb_build_object('ok', false, 'error', 'Only the teacher can add decks.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('f', left(coalesce(x ->> 'f', x ->> 'front', ''), 300), 'b', left(coalesce(x ->> 'b', x ->> 'back', ''), 600))), '[]'::jsonb) into clean
    from (select x from jsonb_array_elements(case when jsonb_typeof(p_cards) = 'array' then p_cards else '[]'::jsonb end) x where coalesce(x ->> 'f', x ->> 'front', '') <> '' limit 100) y;
  if jsonb_array_length(clean) = 0 then return jsonb_build_object('ok', false, 'error', 'The deck has no cards.'); end if;
  insert into classroom_decks (class_id, name, cards, due, created_by) values (p_class, left(coalesce(nullif(trim(p_name), ''), 'Deck'), 60), clean, p_due, me) returning classroom_decks.id into id;
  return jsonb_build_object('ok', true, 'id', id);
end $$;
create or replace function public.classroom_deck_remove(p_deck uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  delete from classroom_decks d where d.id = p_deck and exists (select 1 from classroom_members m where m.class_id = d.class_id and m.user_id = auth.uid() and m.role = 'teacher');
  return jsonb_build_object('ok', found);
end $$;
create or replace function public.classroom_progress_set(p_deck uuid, p_reviewed int, p_correct int, p_done boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if not exists (select 1 from classroom_decks d join classroom_members m on m.class_id = d.class_id where d.id = p_deck and m.user_id = me) then return jsonb_build_object('ok', false); end if;
  insert into classroom_progress (deck_id, user_id, reviewed, correct, done) values (p_deck, me, greatest(0, least(coalesce(p_reviewed, 0), 100000)), greatest(0, least(coalesce(p_correct, 0), 100000)), coalesce(p_done, false))
  on conflict (deck_id, user_id) do update set reviewed = greatest(classroom_progress.reviewed, excluded.reviewed), correct = greatest(classroom_progress.correct, excluded.correct), done = classroom_progress.done or excluded.done, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;
-- the class: decks for everyone; the teacher also sees each student's progress on them (and nothing else)
create or replace function public.classroom_view(p_class uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); role text; c classrooms;
begin
  select m.role into role from classroom_members m where m.class_id = p_class and m.user_id = me;
  if role is null then return jsonb_build_object('ok', false, 'error', 'You aren''t in that class.'); end if;
  select * into c from classrooms where id = p_class;
  return jsonb_build_object('ok', true, 'id', c.id, 'name', c.name, 'role', role, 'code', case when role = 'teacher' then c.code end,
    'decks', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'cards', d.cards, 'due', d.due,
        'mine', (select jsonb_build_object('reviewed', p.reviewed, 'correct', p.correct, 'done', p.done) from classroom_progress p where p.deck_id = d.id and p.user_id = me),
        'done', (select count(*) from classroom_progress p where p.deck_id = d.id and p.done)) order by d.created_at desc) from classroom_decks d where d.class_id = c.id), '[]'::jsonb),
    'students', case when role = 'teacher' then coalesce((select jsonb_agg(jsonb_build_object('id', m.user_id, 'name', coalesce(nullif(s.display_name, ''), pr.nickname, pr.username, 'Student'), 'username', pr.username, 'joined', m.joined_at,
        'progress', coalesce((select jsonb_object_agg(p.deck_id, jsonb_build_object('reviewed', p.reviewed, 'correct', p.correct, 'done', p.done)) from classroom_progress p join classroom_decks d on d.id = p.deck_id where d.class_id = c.id and p.user_id = m.user_id), '{}'::jsonb)) order by pr.username)
      from classroom_members m join profiles pr on pr.id = m.user_id left join profile_style s on s.user_id = m.user_id where m.class_id = c.id and m.role = 'student'), '[]'::jsonb) end);
end $$;
do $$ declare f text; begin
  foreach f in array array['classroom_create(text)', 'classroom_join(text)', 'classroom_leave(uuid, uuid)', 'my_classrooms()', 'classroom_deck_add(uuid, text, jsonb, date)', 'classroom_deck_remove(uuid)', 'classroom_progress_set(uuid, int, int, boolean)', 'classroom_view(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f); execute format('grant execute on function public.%s to authenticated', f);
  end loop; end $$;

-- 7) ------------------------------------------------------------------------------------------------------
create table if not exists public.embed_bots (
  id text primary key check (id ~ '^[a-z0-9]{10,16}$'),
  owner uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Ask Nexus' check (char_length(name) between 1 and 40),
  agent text not null default 'flash' check (agent in ('flash', 'lyte', 'neodela')),
  web boolean not null default false,
  rules text not null default '' check (char_length(rules) <= 2000),
  knowledge text not null default '' check (char_length(knowledge) <= 20000),
  greeting text not null default 'Hi! What can I help with?' check (char_length(greeting) <= 200),
  color text not null default '#3dffa0' check (color ~ '^#[0-9a-fA-F]{6}$'),
  origins text[] not null default '{}',
  daily_limit int not null default 200 check (daily_limit between 1 and 2000),
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.embed_bots enable row level security;
drop policy if exists embed_bots_own on public.embed_bots;
create policy embed_bots_own on public.embed_bots for all using (owner = auth.uid() or public.is_admin()) with check (owner = auth.uid());
grant select, insert, update, delete on public.embed_bots to authenticated;
create table if not exists public.embed_usage (bot text not null references public.embed_bots(id) on delete cascade, day date not null default current_date, n int not null default 0, primary key (bot, day));
alter table public.embed_usage enable row level security;
drop policy if exists embed_usage_own on public.embed_usage;
create policy embed_usage_own on public.embed_usage for select using (exists (select 1 from embed_bots b where b.id = bot and b.owner = auth.uid()));
-- what a visitor's page may know (no rules or knowledge, no owner)
create or replace function public.embed_bot_public(p_id text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', true, 'id', id, 'name', name, 'agent', agent, 'greeting', greeting, 'color', color, 'web', web) from embed_bots where id = p_id and active;
$$;
grant execute on function public.embed_bot_public(text) to anon, authenticated;
-- the embed-chat function (service role) counts each answer; false when the bot is out for today
create or replace function public.embed_take(p_bot text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b embed_bots; n int;
begin
  select * into b from embed_bots where id = p_bot and active; if b.id is null then return jsonb_build_object('ok', false, 'error', 'This chat is switched off.'); end if;
  insert into embed_usage (bot, day, n) values (b.id, current_date, 1) on conflict (bot, day) do update set n = embed_usage.n + 1 returning embed_usage.n into n;
  if n > b.daily_limit then return jsonb_build_object('ok', false, 'error', 'This chat has answered all it can today. Try again tomorrow.'); end if;
  return jsonb_build_object('ok', true, 'left', b.daily_limit - n);
end $$;
revoke all on function public.embed_take(text) from public, anon, authenticated;

-- Nexus '28 4.0 — run in the NEXUS Supabase project (yzbnxpkuhlxsuwzbjifx), after nexus-v3.12.sql and Apoji Admin 2.8.x.
-- Safe to run more than once.
--   1) Cirkts: points become a currency you spend. Earned the same ways as points; unlocks are bought and lower your balance.
--      Your points so far become your balance 1:1, and orb skins you had already unlocked stay yours for free.
--   2) Cosmetics: profile frames, profile themes, app themes, name fonts, name colors, banners and orb skins (a catalog the
--      Apoji Team can change), what you own, and what you show on your profile.
--   3) Profiles + friends: a public profile card (picture, frame, name style, bio, a few stats), friend requests, blocking.
--   4) Spaces chat: a chat inside every Shared Space (members only; reportable), and inviting friends to a Space.
--   5) The Apoji account: one profile across Apoji apps (aARgon3 reads it by username, or by a link code you make).
--   6) Status incidents linked to known issues and releases.
--   7) Apoji-wide search over the public things (known issues, incidents, releases plans, agents, people, your Spaces).

-- =====================================================================================================
-- 1 + 2) Cirkts and cosmetics
-- =====================================================================================================
create table if not exists public.cosmetics (
  id text primary key check (id ~ '^(frame|ptheme|theme|font|color|banner|skin):[a-z0-9_-]{2,30}$'),
  kind text not null check (kind in ('frame', 'ptheme', 'theme', 'font', 'color', 'banner', 'skin')),
  name text not null check (char_length(name) between 1 and 40),
  price int not null default 0 check (price between 0 and 1000000),
  data jsonb not null default '{}'::jsonb,
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.cosmetics enable row level security;
drop policy if exists cos_read on public.cosmetics;
create policy cos_read on public.cosmetics for select using (true);
drop policy if exists cos_admin on public.cosmetics;
create policy cos_admin on public.cosmetics for all using (public.is_admin() and public.hi_can_write()) with check (public.is_admin() and public.hi_can_write());

-- the catalog (the app has the same list built in, so it works before this runs; prices here are the ones that count)
insert into public.cosmetics (id, kind, name, price, sort) values
  ('frame:neon', 'frame', 'Neon ring', 150, 1), ('frame:halo', 'frame', 'Halo', 300, 2), ('frame:circuit', 'frame', 'Circuit', 500, 3), ('frame:flame', 'frame', 'Flame', 700, 4),
  ('frame:crown', 'frame', 'Gold crown', 900, 5), ('frame:orbit', 'frame', 'Orbit', 1200, 6), ('frame:glitch', 'frame', 'Glitch', 1500, 7), ('frame:prism', 'frame', 'Prism', 2000, 8),
  ('ptheme:midnight', 'ptheme', 'Midnight', 200, 1), ('ptheme:sunset', 'ptheme', 'Sunset', 300, 2), ('ptheme:aurora', 'ptheme', 'Aurora', 450, 3), ('ptheme:sakura', 'ptheme', 'Sakura', 450, 4),
  ('ptheme:void', 'ptheme', 'Void', 600, 5), ('ptheme:circuit', 'ptheme', 'Circuit board', 750, 6),
  ('theme:sakura', 'theme', 'Sakura', 600, 1), ('theme:ocean', 'theme', 'Midnight Ocean', 600, 2), ('theme:ember', 'theme', 'Ember', 700, 3), ('theme:obsidian', 'theme', 'Obsidian Gold', 800, 4),
  ('theme:aurora', 'theme', 'Aurora Borealis', 1000, 5), ('theme:holo', 'theme', 'Holo', 1500, 6),
  ('font:mono', 'font', 'Terminal', 100, 1), ('font:serif', 'font', 'Classic serif', 150, 2), ('font:rounded', 'font', 'Rounded', 150, 3), ('font:display', 'font', 'Display', 250, 4),
  ('font:hand', 'font', 'Handwritten', 300, 5), ('font:pixel', 'font', 'Pixel', 400, 6),
  ('color:mint', 'color', 'Mint', 50, 1), ('color:sky', 'color', 'Sky', 50, 2), ('color:rose', 'color', 'Rose', 50, 3), ('color:amber', 'color', 'Amber', 50, 4), ('color:violet', 'color', 'Violet', 50, 5),
  ('color:gold', 'color', 'Gold', 300, 6), ('color:sunset', 'color', 'Sunset fade', 400, 7), ('color:aurora', 'color', 'Aurora fade', 500, 8), ('color:rainbow', 'color', 'Rainbow', 800, 9),
  ('banner:grid', 'banner', 'Grid', 200, 1), ('banner:waves', 'banner', 'Waves', 250, 2), ('banner:stars', 'banner', 'Starfield', 350, 3), ('banner:topo', 'banner', 'Topography', 350, 4), ('banner:nebula', 'banner', 'Nebula', 500, 5),
  ('skin:reactor', 'skin', 'Reactor', 100, 1), ('skin:nebula', 'skin', 'Nebula', 250, 2), ('skin:pulse', 'skin', 'Pulse', 500, 3), ('skin:tide', 'skin', 'Tide', 600, 4), ('skin:prism', 'skin', 'Prism', 750, 5),
  ('skin:ember', 'skin', 'Ember', 900, 6), ('skin:pixel', 'skin', 'Pixel', 1000, 7), ('skin:vortex', 'skin', 'Vortex', 1250, 8), ('skin:crystal', 'skin', 'Crystal', 1400, 9), ('skin:eclipse', 'skin', 'Eclipse', 1500, 10),
  ('skin:circuit', 'skin', 'Circuit', 1750, 11), ('skin:overlord', 'skin', 'Overlord', 2000, 12), ('skin:quasar', 'skin', 'Quasar', 2250, 13), ('skin:solar', 'skin', 'Solar', 2500, 14), ('skin:glyph', 'skin', 'Glyph', 2750, 15),
  ('skin:hologram', 'skin', 'Hologram', 3000, 16)
on conflict (id) do nothing;

create table if not exists public.cirkts_wallet (
  user_id uuid primary key references auth.users(id) on delete cascade,
  earned int not null default 0 check (earned >= 0),
  spent int not null default 0 check (spent >= 0),
  migrated_at timestamptz,
  synced_at timestamptz not null default now()
);
create table if not exists public.cirkts_owned (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null references public.cosmetics(id) on delete cascade,
  price_paid int not null default 0,
  how text not null default 'bought' check (how in ('bought', 'kept', 'gift', 'admin')),
  at timestamptz not null default now(),
  primary key (user_id, item_id)
);
alter table public.cirkts_wallet enable row level security;
alter table public.cirkts_owned enable row level security;
drop policy if exists cw_read on public.cirkts_wallet;
create policy cw_read on public.cirkts_wallet for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists co_read on public.cirkts_owned;
create policy co_read on public.cirkts_owned for select using (user_id = auth.uid() or public.is_admin());
-- no insert/update policies: everything goes through the functions below

create or replace function public.cirkts_state()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', true, 'earned', coalesce(w.earned, 0), 'spent', coalesce(w.spent, 0), 'balance', coalesce(w.earned, 0) - coalesce(w.spent, 0), 'migrated', w.migrated_at is not null,
    'owned', coalesce((select jsonb_agg(item_id order by at) from cirkts_owned where user_id = auth.uid()), '[]'::jsonb))
  from (select auth.uid() u) x left join cirkts_wallet w on w.user_id = x.u;
$$;

-- What you've earned (points, counted by the app across your computers) → your wallet. It only ever goes up, by at most
-- 5,000 at a time after the first sync. The first sync keeps the orb skins your points had already unlocked (free).
create or replace function public.cirkts_sync(p_earned int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); w cirkts_wallet; e int := greatest(0, least(coalesce(p_earned, 0), 10000000));
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Sign in first.'); end if;
  select * into w from cirkts_wallet where user_id = me for update;
  if w.user_id is null then
    insert into cirkts_wallet (user_id, earned, migrated_at) values (me, e, now()) returning * into w;
    insert into cirkts_owned (user_id, item_id, price_paid, how)
      select me, id, 0, 'kept' from cosmetics where kind = 'skin' and price <= e on conflict do nothing;
  else
    update cirkts_wallet set earned = greatest(earned, least(e, earned + 5000)), synced_at = now() where user_id = me returning * into w;
  end if;
  return public.cirkts_state();
end $$;

create or replace function public.cirkts_buy(p_item text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c cosmetics; w cirkts_wallet;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Sign in first.'); end if;
  select * into c from cosmetics where id = p_item and active;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'That isn''t in the shop.'); end if;
  if exists (select 1 from cirkts_owned where user_id = me and item_id = c.id) then return jsonb_build_object('ok', false, 'error', 'You already have it.', 'owned', true); end if;
  select * into w from cirkts_wallet where user_id = me for update;
  if w.user_id is null then return jsonb_build_object('ok', false, 'error', 'Open Nexus on your computer once so your Cirkts sync.'); end if;
  if w.earned - w.spent < c.price then return jsonb_build_object('ok', false, 'error', format('You need %s more Cirkts.', c.price - (w.earned - w.spent)), 'short', c.price - (w.earned - w.spent)); end if;
  update cirkts_wallet set spent = spent + c.price where user_id = me;
  insert into cirkts_owned (user_id, item_id, price_paid) values (me, c.id, c.price);
  return public.cirkts_state() || jsonb_build_object('bought', c.id, 'price', c.price);
end $$;

-- the Apoji Team can give someone an item (or Cirkts)
create or replace function public.admin_cirkts_gift(p_user uuid, p_item text default null, p_amount int default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() and public.hi_can_write()) then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  insert into cirkts_wallet (user_id, migrated_at) values (p_user, now()) on conflict do nothing;
  if coalesce(p_amount, 0) <> 0 then update cirkts_wallet set earned = greatest(0, earned + least(p_amount, 100000)) where user_id = p_user; end if;
  if p_item is not null then insert into cirkts_owned (user_id, item_id, price_paid, how) values (p_user, p_item, 0, 'gift') on conflict do nothing; end if;
  insert into moderation_log (action, target_user_id, details, performed_by) values ('cirkts_gift', p_user, jsonb_build_object('item', p_item, 'amount', p_amount), auth.uid());
  return jsonb_build_object('ok', true);
exception when undefined_table or undefined_column then return jsonb_build_object('ok', true);
end $$;

-- =====================================================================================================
-- 3) Profiles and friends
-- =====================================================================================================
create table if not exists public.profile_style (
  user_id uuid primary key references auth.users(id) on delete cascade,
  frame text, ptheme text, font text, color text, banner text, skin text,
  bio text not null default '' check (char_length(bio) <= 160),
  status_text text not null default '' check (char_length(status_text) <= 60),
  show_stats boolean not null default true,
  stats jsonb not null default '{}'::jsonb,      -- streak, best, achievements, chats: shown on your card if show_stats
  updated_at timestamptz not null default now()
);
alter table public.profile_style enable row level security;
drop policy if exists ps_read on public.profile_style;
create policy ps_read on public.profile_style for select to authenticated using (true);

-- put something on your profile (only things you own, or nothing). p_style: { frame, ptheme, font, color, banner, skin, bio, status_text, show_stats, stats }
create or replace function public.profile_style_set(p_style jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); k text; v text; owned text[];
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Sign in first.'); end if;
  select coalesce(array_agg(item_id), '{}') into owned from cirkts_owned where user_id = me;
  foreach k in array array['frame', 'ptheme', 'font', 'color', 'banner', 'skin'] loop
    if p_style ? k then
      v := nullif(p_style ->> k, '');
      if v is not null and not (v = any(owned)) and not exists (select 1 from cosmetics where id = v and price = 0) then
        return jsonb_build_object('ok', false, 'error', 'You don''t own that yet.', 'item', v);
      end if;
    end if;
  end loop;
  insert into profile_style (user_id) values (me) on conflict do nothing;
  update profile_style set
    frame = case when p_style ? 'frame' then nullif(p_style ->> 'frame', '') else frame end,
    ptheme = case when p_style ? 'ptheme' then nullif(p_style ->> 'ptheme', '') else ptheme end,
    font = case when p_style ? 'font' then nullif(p_style ->> 'font', '') else font end,
    color = case when p_style ? 'color' then nullif(p_style ->> 'color', '') else color end,
    banner = case when p_style ? 'banner' then nullif(p_style ->> 'banner', '') else banner end,
    skin = case when p_style ? 'skin' then nullif(p_style ->> 'skin', '') else skin end,
    bio = case when p_style ? 'bio' then left(coalesce(p_style ->> 'bio', ''), 160) else bio end,
    status_text = case when p_style ? 'status_text' then left(coalesce(p_style ->> 'status_text', ''), 60) else status_text end,
    show_stats = case when p_style ? 'show_stats' then coalesce((p_style ->> 'show_stats')::boolean, true) else show_stats end,
    stats = case when p_style ? 'stats' and jsonb_typeof(p_style -> 'stats') = 'object' then (select coalesce(jsonb_object_agg(key, value), '{}') from jsonb_each(p_style -> 'stats') where key in ('streak', 'best', 'achievements', 'chats', 'cirkts', 'level') and jsonb_typeof(value) = 'number') else stats end,
    updated_at = now()
  where user_id = me;
  return jsonb_build_object('ok', true);
end $$;

create table if not exists public.friendships (
  user_a uuid not null references auth.users(id) on delete cascade,   -- the smaller id
  user_b uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'blocked')),
  requested_by uuid not null references auth.users(id) on delete cascade,
  blocked_by uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index if not exists friendships_b on public.friendships (user_b);
alter table public.friendships enable row level security;
drop policy if exists fr_read on public.friendships;
create policy fr_read on public.friendships for select using (auth.uid() in (user_a, user_b));

-- someone's public card: what anyone signed in can see (never email, never chats)
create or replace function public.profile_card_of(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p.id, 'username', p.username, 'nickname', coalesce(p.nickname, ''), 'avatar_url', p.avatar_url,
    'owner', p.id = any(public.app_owner_ids()),
    'style', coalesce((select to_jsonb(s) - 'user_id' - case when s.show_stats then 'nothing' else 'stats' end from profile_style s where s.user_id = p.id), '{}'::jsonb),
    'online', (select max(seen_at) from user_presence u where u.user_id = p.id) > now() - interval '5 minutes',
    'last_seen', (select max(seen_at) from user_presence u where u.user_id = p.id),
    'friends', (select count(*) from friendships f where p.id in (f.user_a, f.user_b) and f.status = 'accepted'),
    'relation', (select case when f.status = 'accepted' then 'friend' when f.status = 'blocked' then 'blocked' when f.requested_by = auth.uid() then 'requested' else 'incoming' end
                   from friendships f where f.user_a = least(p.id, auth.uid()) and f.user_b = greatest(p.id, auth.uid())))
  from profiles p where p.id = p_user;
$$;
create or replace function public.profile_card(p_username text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'Sign in first.'); end if;
  select id into uid from profiles where lower(username) = lower(trim(leading '@' from coalesce(p_username, '')));
  if uid is null then return jsonb_build_object('ok', false, 'error', 'Nobody has that username.'); end if;
  if exists (select 1 from friendships f where f.user_a = least(uid, auth.uid()) and f.user_b = greatest(uid, auth.uid()) and f.status = 'blocked' and f.blocked_by = uid) then
    return jsonb_build_object('ok', false, 'error', 'Nobody has that username.'); end if;
  return jsonb_build_object('ok', true, 'card', public.profile_card_of(uid));
end $$;

create or replace function public.friend_request(p_username text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); them uuid; f friendships; myname text;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Sign in first.'); end if;
  select id into them from profiles where lower(username) = lower(trim(leading '@' from coalesce(p_username, '')));
  if them is null then return jsonb_build_object('ok', false, 'error', 'Nobody has that username.'); end if;
  if them = me then return jsonb_build_object('ok', false, 'error', 'That''s you.'); end if;
  if (select count(*) from friendships where requested_by = me and status = 'pending' and created_at > now() - interval '1 day') >= 30 then
    return jsonb_build_object('ok', false, 'error', 'That''s a lot of requests today. Try again tomorrow.'); end if;
  select * into f from friendships where user_a = least(me, them) and user_b = greatest(me, them);
  if f.status = 'blocked' then return jsonb_build_object('ok', false, 'error', case when f.blocked_by = me then 'Unblock them first.' else 'Nobody has that username.' end); end if;
  if f.status = 'accepted' then return jsonb_build_object('ok', true, 'status', 'friend'); end if;
  if f.status = 'pending' and f.requested_by = them then   -- they already asked you: that's a yes
    update friendships set status = 'accepted', updated_at = now() where user_a = f.user_a and user_b = f.user_b;
    return jsonb_build_object('ok', true, 'status', 'friend');
  end if;
  if f.status = 'pending' then return jsonb_build_object('ok', true, 'status', 'requested'); end if;
  insert into friendships (user_a, user_b, requested_by) values (least(me, them), greatest(me, them), me);
  select coalesce(nullif(nickname, ''), username, 'Someone') into myname from profiles where id = me;
  begin
    insert into broadcasts (title, body, audience, to_user, created_by, expires_at, phone, desktop)
    values ('Friend request', left(coalesce(myname, 'Someone') || ' wants to be friends on Nexus. Open People to say yes.', 400), 'user', them, me, now() + interval '7 days', true, true);
  exception when others then null; end;
  return jsonb_build_object('ok', true, 'status', 'requested');
end $$;

create or replace function public.friend_respond(p_user uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if p_accept then update friendships set status = 'accepted', updated_at = now() where user_a = least(me, p_user) and user_b = greatest(me, p_user) and status = 'pending' and requested_by = p_user;
  else delete from friendships where user_a = least(me, p_user) and user_b = greatest(me, p_user) and status = 'pending'; end if;
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.friend_remove(p_user uuid)
returns jsonb language sql security definer set search_path = public as $$
  delete from friendships where user_a = least(auth.uid(), p_user) and user_b = greatest(auth.uid(), p_user) and status <> 'blocked';
  select jsonb_build_object('ok', true);
$$;
create or replace function public.friend_block(p_user uuid, p_on boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if p_user = me then return jsonb_build_object('ok', false); end if;
  if p_on then
    insert into friendships (user_a, user_b, requested_by, status, blocked_by) values (least(me, p_user), greatest(me, p_user), me, 'blocked', me)
    on conflict (user_a, user_b) do update set status = 'blocked', blocked_by = me, updated_at = now();
  else delete from friendships where user_a = least(me, p_user) and user_b = greatest(me, p_user) and status = 'blocked' and blocked_by = me; end if;
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.my_friends()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', true,
    'friends', coalesce(jsonb_agg(public.profile_card_of(case when f.user_a = auth.uid() then f.user_b else f.user_a end) order by f.updated_at desc) filter (where f.status = 'accepted'), '[]'::jsonb),
    'incoming', coalesce(jsonb_agg(public.profile_card_of(f.requested_by)) filter (where f.status = 'pending' and f.requested_by <> auth.uid()), '[]'::jsonb),
    'outgoing', coalesce(jsonb_agg(public.profile_card_of(case when f.user_a = auth.uid() then f.user_b else f.user_a end)) filter (where f.status = 'pending' and f.requested_by = auth.uid()), '[]'::jsonb),
    'blocked', coalesce(jsonb_agg(jsonb_build_object('id', case when f.user_a = auth.uid() then f.user_b else f.user_a end, 'username', (select username from profiles where id = case when f.user_a = auth.uid() then f.user_b else f.user_a end))) filter (where f.status = 'blocked' and f.blocked_by = auth.uid()), '[]'::jsonb))
  from friendships f where auth.uid() in (f.user_a, f.user_b);
$$;
create or replace function public.are_friends(a uuid, b uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from friendships where user_a = least(a, b) and user_b = greatest(a, b) and status = 'accepted');
$$;

-- =====================================================================================================
-- 4) Spaces chat and inviting friends to a Space
-- =====================================================================================================
create or replace function public.is_space_member(p_space uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from shared_space_members where space_id = p_space and user_id = auth.uid());
$$;
create table if not exists public.space_messages (
  id bigint generated always as identity primary key,
  space_id uuid not null references public.shared_spaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  reply_to bigint references public.space_messages(id) on delete set null,
  edited_at timestamptz,
  deleted boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists space_messages_space on public.space_messages (space_id, id desc);
alter table public.space_messages enable row level security;
drop policy if exists sm_read on public.space_messages;
create policy sm_read on public.space_messages for select using (public.is_space_member(space_id) or public.is_admin());
drop policy if exists sm_insert on public.space_messages;
create policy sm_insert on public.space_messages for insert to authenticated with check (user_id = auth.uid() and public.is_space_member(space_id)
  and not exists (select 1 from user_moderation m where m.user_id = auth.uid() and m.status in ('suspended', 'banned') and (m.suspended_until is null or m.suspended_until > now())));
drop policy if exists sm_update on public.space_messages;
create policy sm_update on public.space_messages for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- the Space's owner (and admins) can remove a message; you can remove your own
create or replace function public.space_message_remove(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m space_messages;
begin
  select * into m from space_messages where id = p_id;
  if m.id is null then return jsonb_build_object('ok', false, 'error', 'Gone already.'); end if;
  if not (m.user_id = auth.uid() or public.is_admin() or exists (select 1 from shared_spaces s where s.id = m.space_id and s.owner = auth.uid())) then return jsonb_build_object('ok', false, 'error', 'Only the person who wrote it or the Space''s owner can remove it.'); end if;
  update space_messages set deleted = true, body = '(removed)' where id = p_id;
  return jsonb_build_object('ok', true);
end $$;
do $$ begin
  begin alter publication supabase_realtime add table public.space_messages; exception when others then null; end;
  begin alter publication supabase_realtime add table public.friendships; exception when others then null; end;
end $$;
-- reports can point at a Spaces chat message, a profile or a username too
do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'public.content_reports'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%kind%' loop
    execute format('alter table public.content_reports drop constraint %I', c); end loop;
  alter table public.content_reports add constraint content_reports_kind_check check (kind in ('space', 'post', 'agent', 'session', 'space_message', 'profile'));
exception when undefined_table then null; end $$;

create table if not exists public.space_invites (
  space_id uuid not null references public.shared_spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (space_id, user_id)
);
alter table public.space_invites enable row level security;
drop policy if exists si_read on public.space_invites;
create policy si_read on public.space_invites for select using (user_id = auth.uid() or invited_by = auth.uid());
create or replace function public.space_invite(p_space uuid, p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare sname text; myname text;
begin
  if not public.is_space_member(p_space) then return jsonb_build_object('ok', false, 'error', 'You''re not in that Space.'); end if;
  if not public.are_friends(auth.uid(), p_user) then return jsonb_build_object('ok', false, 'error', 'You can invite friends.'); end if;
  if exists (select 1 from shared_space_members where space_id = p_space and user_id = p_user) then return jsonb_build_object('ok', true, 'already', true); end if;
  insert into space_invites (space_id, user_id) values (p_space, p_user) on conflict do nothing;
  select name into sname from shared_spaces where id = p_space;
  select coalesce(nullif(nickname, ''), username, 'A friend') into myname from profiles where id = auth.uid();
  begin insert into broadcasts (title, body, audience, to_user, created_by, expires_at) values ('Space invite', left(myname || ' invited you to the Space "' || coalesce(sname, '') || '". Open People to join.', 400), 'user', p_user, auth.uid(), now() + interval '7 days');
  exception when others then null; end;
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.space_invite_respond(p_space uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare nick text;
begin
  if not exists (select 1 from space_invites where space_id = p_space and user_id = auth.uid()) then return jsonb_build_object('ok', false, 'error', 'That invite is gone.'); end if;
  delete from space_invites where space_id = p_space and user_id = auth.uid();
  if p_accept then
    if (select count(*) from shared_space_members where space_id = p_space) >= 50 then return jsonb_build_object('ok', false, 'error', 'That Space is full.'); end if;
    select left(coalesce(nullif(nickname, ''), username, 'Friend'), 24) into nick from profiles where id = auth.uid();
    insert into shared_space_members (space_id, user_id, nickname) values (p_space, auth.uid(), coalesce(nick, 'Friend')) on conflict do nothing;
  end if;
  return jsonb_build_object('ok', true, 'joined', p_accept);
end $$;
create or replace function public.my_space_invites()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('space_id', i.space_id, 'name', s.name, 'color', s.color, 'members', (select count(*) from shared_space_members m where m.space_id = s.id), 'from', public.profile_card_of(i.invited_by), 'at', i.created_at) order by i.created_at desc), '[]'::jsonb)
  from space_invites i join shared_spaces s on s.id = i.space_id where i.user_id = auth.uid();
$$;
-- a Space's members with their profile cards (for the Spaces chat)
create or replace function public.space_people(p_space uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not public.is_space_member(p_space) then '[]'::jsonb else coalesce(jsonb_agg(public.profile_card_of(m.user_id) || jsonb_build_object('space_nickname', m.nickname, 'is_owner', s.owner = m.user_id) order by (s.owner = m.user_id) desc, m.joined_at), '[]'::jsonb) end
  from shared_space_members m join shared_spaces s on s.id = m.space_id where m.space_id = p_space;
$$;

-- =====================================================================================================
-- 5) One Apoji account (Nexus side): your profile everywhere. aARgon3 (its own Supabase project) shows your Nexus picture,
--    frame and name by reading this with the publishable key, by username or a link code you make in Nexus.
-- =====================================================================================================
create table if not exists public.apoji_link_codes (
  code text primary key check (code ~ '^[A-Z0-9]{8}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_by text
);
alter table public.apoji_link_codes enable row level security;
create or replace function public.apoji_link_code()
returns jsonb language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'Sign in first.'); end if;
  delete from apoji_link_codes where user_id = auth.uid() and used_at is null;
  c := upper(substr(translate(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), '01', ''), 1, 8));
  insert into apoji_link_codes (code, user_id) values (c, auth.uid());
  return jsonb_build_object('ok', true, 'code', c, 'expires_in', 900);
end $$;
-- for other Apoji apps (anon): a username or a link code → the public look of that account (nothing private)
create or replace function public.apoji_public_profile(p_username text default null, p_code text default null, p_app text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if p_code is not null then
    select user_id into uid from apoji_link_codes where code = upper(p_code) and used_at is null and created_at > now() - interval '15 minutes';
    if uid is not null then update apoji_link_codes set used_at = now(), used_by = left(coalesce(p_app, ''), 40) where code = upper(p_code); end if;
  elsif p_username is not null then select id into uid from profiles where lower(username) = lower(trim(leading '@' from p_username));
  end if;
  if uid is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'profile', (select jsonb_build_object('username', p.username, 'nickname', coalesce(p.nickname, ''), 'avatar_url', p.avatar_url,
    'frame', s.frame, 'font', s.font, 'color', s.color, 'ptheme', s.ptheme, 'banner', s.banner, 'bio', coalesce(s.bio, ''), 'owner', p.id = any(public.app_owner_ids()))
    from profiles p left join profile_style s on s.user_id = p.id where p.id = uid));
end $$;
grant execute on function public.apoji_public_profile(text, text, text) to anon, authenticated;
create or replace function public.apoji_account()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', auth.uid() is not null, 'card', public.profile_card_of(auth.uid()), 'cirkts', public.cirkts_state(),
    'apps', coalesce((select jsonb_agg(jsonb_build_object('surface', surface, 'version', version, 'first_seen', first_seen, 'seen_at', seen_at) order by seen_at desc) from user_presence where user_id = auth.uid()), '[]'::jsonb));
$$;

-- =====================================================================================================
-- 6) Status incidents ↔ known issues and releases
-- =====================================================================================================
alter table public.status_incidents add column if not exists known_issue_ids bigint[] not null default '{}';
alter table public.status_incidents add column if not exists release text not null default '' check (char_length(release) <= 40);
alter table public.known_issues add column if not exists incident_ids bigint[] not null default '{}';
create or replace function public.admin_link_incident(p_incident bigint, p_known bigint[] default '{}', p_release text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() and public.hi_can_write()) then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  update status_incidents set known_issue_ids = coalesce(p_known, '{}'), release = left(coalesce(p_release, ''), 40) where id = p_incident;
  update known_issues set incident_ids = array(select distinct unnest(incident_ids || p_incident)) where id = any(coalesce(p_known, '{}'));
  update known_issues set incident_ids = array_remove(incident_ids, p_incident) where not (id = any(coalesce(p_known, '{}'))) and p_incident = any(incident_ids);
  return jsonb_build_object('ok', true);
end $$;
-- for the status page (anon): recent incidents with their known issues and the release that fixes them
create or replace function public.public_status_links()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('incident', i.id, 'release', nullif(i.release, ''),
    'known', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'title', k.title, 'status', k.status, 'fixed_in', nullif(k.fixed_in, ''), 'workaround', k.workaround)) from known_issues k where k.id = any(i.known_issue_ids)), '[]'::jsonb))), '[]'::jsonb)
  from status_incidents i where i.started_at > now() - interval '90 days' and (cardinality(i.known_issue_ids) > 0 or i.release <> '');
$$;
grant execute on function public.public_status_links() to anon, authenticated;

-- =====================================================================================================
-- 7) Apoji-wide search (signed in): public things across Apoji, plus your own Spaces and friends
-- =====================================================================================================
create or replace function public.apoji_search(p_q text, p_limit int default 20)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare q text := left(trim(coalesce(p_q, '')), 80); pat text; n int := greatest(1, least(coalesce(p_limit, 20), 50));
begin
  if auth.uid() is null or length(q) < 2 then return '[]'::jsonb; end if;
  pat := '%' || replace(replace(q, '%', ''), '_', '') || '%';
  return coalesce((select jsonb_agg(r) from (
    (select jsonb_build_object('kind', 'known_issue', 'id', id, 'title', title, 'sub', status || coalesce(' · fixed in ' || nullif(fixed_in, ''), ''), 'at', updated_at) r from known_issues where title ilike pat or details ilike pat or workaround ilike pat order by updated_at desc limit n)
    union all
    (select jsonb_build_object('kind', 'incident', 'id', id, 'title', title, 'sub', status, 'at', started_at) from status_incidents where title ilike pat order by started_at desc limit n)
    union all
    (select jsonb_build_object('kind', 'person', 'id', id, 'title', '@' || username, 'sub', coalesce(nickname, ''), 'at', null) from profiles where username ilike pat and username is not null
       and not exists (select 1 from friendships f where f.user_a = least(id, auth.uid()) and f.user_b = greatest(id, auth.uid()) and f.status = 'blocked') limit 8)
    union all
    (select jsonb_build_object('kind', 'space', 'id', s.id, 'title', s.name, 'sub', (select count(*) from shared_space_members m2 where m2.space_id = s.id) || ' members', 'at', s.created_at) from shared_spaces s
       where s.name ilike pat and exists (select 1 from shared_space_members m where m.space_id = s.id and m.user_id = auth.uid()) limit n)
    union all
    (select jsonb_build_object('kind', 'space_message', 'id', sm.id, 'space', sm.space_id, 'title', left(sm.body, 120), 'sub', (select name from shared_spaces where id = sm.space_id), 'at', sm.created_at) from space_messages sm
       where not sm.deleted and sm.body ilike pat and public.is_space_member(sm.space_id) order by sm.id desc limit n)
    union all
    (select jsonb_build_object('kind', 'agent', 'id', code, 'title', name, 'sub', '@' || coalesce(agent ->> 'handle', name), 'at', created_at) from shared_agents where name ilike pat or coalesce(agent ->> 'handle', '') ilike pat order by created_at desc limit 8)
  ) x), '[]'::jsonb);
exception when undefined_table or undefined_column then return '[]'::jsonb;
end $$;

-- grants for the functions people call
do $$ declare f text; begin
  foreach f in array array['cirkts_state()', 'cirkts_sync(int)', 'cirkts_buy(text)', 'profile_style_set(jsonb)', 'profile_card(text)', 'friend_request(text)', 'friend_respond(uuid, boolean)', 'friend_remove(uuid)',
    'friend_block(uuid, boolean)', 'my_friends()', 'space_message_remove(bigint)', 'space_invite(uuid, uuid)', 'space_invite_respond(uuid, boolean)', 'my_space_invites()', 'space_people(uuid)', 'apoji_link_code()', 'apoji_account()', 'apoji_search(text, int)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Nexus '28 4.0.6 (run after nexus-v4.0.4.sql, in the Nexus project's SQL editor). Safe to run more than once.
--  1) Sets: matching frames, profile frames, themes, effects, banners, name styles, app themes and orb skins. Buying a set
--     gets the pieces you don't have yet for 25% less. Four new pieces so every set matches. "Inferno" is now "Ember".
--  2) More on a friend's profile: member since, where they use Nexus, favorite agent, badges, friends you both know,
--     Spaces you share. Only friends (and you) see the extra parts.
--  3) Make your own (beta): your own picture frame, profile frame and profile effect, built in the shop. You can also
--     upload your own frame or overlay picture; the Apoji Team checks it before anyone else sees it.
--  4) Smarter topics, Ask the map and Continue on my other computer are out of beta (everyone gets them).

-- 1) -------------------------------------------------------------------------------------------------
insert into public.cosmetics (id, kind, name, price, sort) values
  ('pframe:flame', 'pframe', 'Ember', 800, 226),
  ('pframe:sakura', 'pframe', 'Blossom', 750, 231),
  ('pframe:aurora', 'pframe', 'Aurora veil', 1100, 232),
  ('ptheme:frost', 'ptheme', 'Frozen', 350, 233),
  ('effect:petals', 'effect', 'Falling petals', 650, 234),
  ('frame:mine', 'frame', 'Make your own', 0, 235),
  ('pframe:mine', 'pframe', 'Make your own', 0, 236),
  ('effect:mine', 'effect', 'Make your own', 0, 237)
on conflict (id) do update set name = excluded.name, price = excluded.price, sort = excluded.sort, active = true;

create table if not exists public.cosmetic_packs (
  id text primary key check (id ~ '^pack:[a-z0-9_-]{2,30}$'),
  name text not null check (char_length(name) between 1 and 40),
  items text[] not null,
  off numeric not null default 0.25 check (off >= 0 and off < 1),
  sort int not null default 0,
  active boolean not null default true
);
alter table public.cosmetic_packs enable row level security;
drop policy if exists cosmetic_packs_read on public.cosmetic_packs;
create policy cosmetic_packs_read on public.cosmetic_packs for select using (true);
insert into public.cosmetic_packs (id, name, items, sort) values
  ('pack:ember', 'Ember', array['frame:flame', 'pframe:flame', 'ptheme:ember', 'effect:embers', 'banner:sunset', 'color:sunset', 'theme:ember', 'skin:ember'], 1),
  ('pack:frost', 'Frost', array['frame:frost', 'pframe:frost', 'ptheme:frost', 'effect:snow', 'banner:waves', 'color:sky', 'theme:glacier', 'skin:crystal'], 2),
  ('pack:neon', 'Neon', array['frame:neon', 'pframe:neon', 'ptheme:circuit', 'effect:sparkle', 'banner:grid', 'color:mint', 'theme:cyber', 'skin:reactor'], 3),
  ('pack:royal', 'Royal', array['frame:gold', 'pframe:royal', 'ptheme:midnight', 'effect:stars', 'banner:stars', 'color:gold', 'font:serif', 'theme:royal'], 4),
  ('pack:void', 'Void', array['frame:void', 'pframe:void', 'ptheme:void', 'effect:stars', 'banner:nebula', 'color:violet', 'theme:obsidian', 'skin:eclipse'], 5),
  ('pack:aurora', 'Aurora', array['frame:aurora', 'pframe:aurora', 'ptheme:aurora', 'effect:sparkle', 'banner:aurora', 'color:aurora', 'theme:aurora', 'skin:nebula'], 6),
  ('pack:sakura', 'Sakura', array['frame:sakura', 'pframe:sakura', 'ptheme:sakura', 'effect:petals', 'banner:sunset', 'color:rose', 'font:hand', 'theme:sakura'], 7),
  ('pack:arcade', 'Arcade', array['frame:pixel', 'pframe:pixel', 'ptheme:circuit', 'effect:sparkle', 'banner:matrix', 'color:rainbow', 'font:pixel', 'theme:toxic', 'skin:pixel'], 8),
  ('pack:circuit', 'Circuit', array['frame:circuit', 'pframe:hud', 'ptheme:ocean', 'effect:rain', 'banner:topo', 'color:sky', 'font:mono', 'theme:arc', 'skin:circuit'], 9)
on conflict (id) do update set name = excluded.name, items = excluded.items, sort = excluded.sort, active = true;

alter table public.cirkts_owned drop constraint if exists cirkts_owned_how_check;
alter table public.cirkts_owned add constraint cirkts_owned_how_check check (how in ('bought', 'kept', 'gift', 'admin', 'pack'));

-- buy every piece of a set you don't have yet. Free pieces (like the free app themes) aren't in the cosmetics table and
-- cost nothing, so they're skipped. The price is rounded to 10, the same way the apps show it.
create or replace function public.cirkts_buy_pack(p_pack text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pk cosmetic_packs; w cirkts_wallet; left_ids text[]; full_price int; price int;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Sign in first.'); end if;
  select * into pk from cosmetic_packs where id = p_pack and active;
  if pk.id is null then return jsonb_build_object('ok', false, 'error', 'That set isn''t in the shop.'); end if;
  select coalesce(array_agg(c.id), '{}'), coalesce(sum(c.price), 0) into left_ids, full_price
    from cosmetics c where c.id = any(pk.items) and c.active and c.price > 0
      and not exists (select 1 from cirkts_owned o where o.user_id = me and o.item_id = c.id);
  if coalesce(array_length(left_ids, 1), 0) = 0 then return jsonb_build_object('ok', false, 'error', 'You already have everything in this set.', 'owned', true); end if;
  price := (round(full_price * (1 - pk.off) / 10.0) * 10)::int;
  select * into w from cirkts_wallet where user_id = me for update;
  if w.user_id is null then return jsonb_build_object('ok', false, 'error', 'Open Nexus on your computer once so your Cirkts sync.'); end if;
  if w.earned - w.spent < price then return jsonb_build_object('ok', false, 'error', format('You need %s more Cirkts.', price - (w.earned - w.spent)), 'short', price - (w.earned - w.spent)); end if;
  update cirkts_wallet set spent = spent + price where user_id = me;
  insert into cirkts_owned (user_id, item_id, price_paid, how)
    select me, c.id, round(c.price * (1 - pk.off))::int, 'pack' from cosmetics c where c.id = any(left_ids)
  on conflict do nothing;
  return public.cirkts_state() || jsonb_build_object('bought_pack', pk.id, 'items', to_jsonb(left_ids), 'price', price);
end $$;
revoke all on function public.cirkts_buy_pack(text) from public, anon;
grant execute on function public.cirkts_buy_pack(text) to authenticated;

-- 2) and 3) new profile columns ---------------------------------------------------------------------------
alter table public.profile_style add column if not exists custom jsonb not null default '{}'::jsonb;
alter table public.profile_style add column if not exists extra jsonb not null default '{}'::jsonb;
alter table public.profile_style add column if not exists frame_img text;      -- set only when the Apoji Team approves an upload
alter table public.profile_style add column if not exists overlay_img text;
alter table public.profile_style drop constraint if exists profile_style_custom_check;
alter table public.profile_style add constraint profile_style_custom_check check (jsonb_typeof(custom) = 'object' and octet_length(custom::text) <= 2000);
alter table public.profile_style drop constraint if exists profile_style_extra_check;
alter table public.profile_style add constraint profile_style_extra_check check (jsonb_typeof(extra) = 'object' and octet_length(extra::text) <= 1200);

-- what you built in the shop: only the keys the apps know, with colors that look like #rrggbb (the apps check again
-- before they draw it)
create or replace function public.profile_custom_set(p_custom jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); out jsonb := '{}'::jsonb; part text; k text; v jsonb; clean jsonb;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Sign in first.'); end if;
  if jsonb_typeof(p_custom) <> 'object' then return jsonb_build_object('ok', false, 'error', 'That isn''t a design.'); end if;
  foreach part in array array['frame', 'pframe', 'effect'] loop
    if jsonb_typeof(p_custom -> part) = 'object' then
      clean := '{}'::jsonb;
      for k, v in select * from jsonb_each(p_custom -> part) loop
        if k in ('a', 'b') and jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^#[0-9a-fA-F]{6}$' then clean := clean || jsonb_build_object(k, v);
        elsif k in ('style', 'anim', 'shape', 'dir') and jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^[a-z]{2,12}$' then clean := clean || jsonb_build_object(k, v);
        elsif k in ('width', 'glow', 'speed', 'amount') and jsonb_typeof(v) = 'number' then clean := clean || jsonb_build_object(k, greatest(0, least(5, round((v #>> '{}')::numeric))));
        end if;
      end loop;
      out := out || jsonb_build_object(part, clean);
    end if;
  end loop;
  insert into profile_style (user_id) values (me) on conflict do nothing;
  update profile_style set custom = out, updated_at = now() where user_id = me;
  return jsonb_build_object('ok', true, 'custom', out);
end $$;
revoke all on function public.profile_custom_set(jsonb) from public, anon;
grant execute on function public.profile_custom_set(jsonb) to authenticated;

-- the extra things friends see (sent by your computer with your stats)
create or replace function public.profile_extra_set(p_extra jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); out jsonb := '{}'::jsonb;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Sign in first.'); end if;
  if jsonb_typeof(p_extra) <> 'object' then return jsonb_build_object('ok', false); end if;
  if jsonb_typeof(p_extra -> 'fav_agent') = 'string' then out := out || jsonb_build_object('fav_agent', left(regexp_replace(p_extra ->> 'fav_agent', '[[:cntrl:]<>]', '', 'g'), 24)); end if;
  if jsonb_typeof(p_extra -> 'chats') = 'number' then out := out || jsonb_build_object('chats', greatest(0, least(10000000, (p_extra ->> 'chats')::numeric::bigint))); end if;
  if jsonb_typeof(p_extra -> 'best') = 'number' then out := out || jsonb_build_object('best', greatest(0, least(100000, (p_extra ->> 'best')::numeric::bigint))); end if;
  if jsonb_typeof(p_extra -> 'badges') = 'array' then
    out := out || jsonb_build_object('badges', (select coalesce(jsonb_agg(left(regexp_replace(b, '[[:cntrl:]<>]', '', 'g'), 28)), '[]'::jsonb)
      from (select jsonb_array_elements_text(p_extra -> 'badges') b limit 8) x));
  end if;
  insert into profile_style (user_id) values (me) on conflict do nothing;
  update profile_style set extra = out, updated_at = now() where user_id = me;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.profile_extra_set(jsonb) from public, anon;
grant execute on function public.profile_extra_set(jsonb) to authenticated;

-- 2) a profile card, now with "more" for friends and for you. Strangers still see only the card.
create or replace function public.profile_card_of(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with rel as (
    select case when p_user = auth.uid() then 'self' else (select case when f.status = 'accepted' then 'friend' when f.status = 'blocked' then 'blocked' when f.requested_by = auth.uid() then 'requested' else 'incoming' end
      from friendships f where f.user_a = least(p_user, auth.uid()) and f.user_b = greatest(p_user, auth.uid())) end as r
  ), vis as (
    select p_user = auth.uid() or coalesce((select s.presence from profile_style s where s.user_id = p_user), 'online') <> 'invisible' as shown
  )
  select jsonb_build_object('id', p.id, 'username', p.username, 'nickname', coalesce(p.nickname, ''), 'avatar_url', p.avatar_url,
    'owner', p.id = any(public.app_owner_ids()),
    'style', coalesce((select to_jsonb(s) - 'user_id'
                          - case when s.show_stats then 'nothing' else 'stats' end
                          - case when s.show_stats and (select r from rel) in ('self', 'friend') then 'nothing' else 'extra' end
                        from profile_style s where s.user_id = p.id), '{}'::jsonb),
    'online', (select max(seen_at) from user_presence u where u.user_id = p.id) > now() - interval '5 minutes' and (select shown from vis),
    'last_seen', case when (select shown from vis) then (select max(seen_at) from user_presence u where u.user_id = p.id) end,
    'friends', (select count(*) from friendships f where p.id in (f.user_a, f.user_b) and f.status = 'accepted'),
    'relation', (select case when r = 'self' then null else r end from rel),
    'more', case when (select r from rel) in ('self', 'friend') then jsonb_build_object(
      'since', p.created_at,
      'last_seen', case when (select shown from vis) then (select max(seen_at) from user_presence u where u.user_id = p.id) end,
      'active_on', case when (select shown from vis) then (select coalesce(jsonb_agg(distinct u.surface), '[]'::jsonb) from user_presence u where u.user_id = p.id and u.seen_at > now() - interval '30 days' and u.surface <> 'admin') else '[]'::jsonb end,
      'friends', (select count(*) from friendships f where p.id in (f.user_a, f.user_b) and f.status = 'accepted'),
      'mutual', case when p.id = auth.uid() then null else (select count(*) from (
          select case when f.user_a = p.id then f.user_b else f.user_a end as o from friendships f where p.id in (f.user_a, f.user_b) and f.status = 'accepted'
          intersect
          select case when f.user_a = auth.uid() then f.user_b else f.user_a end from friendships f where auth.uid() in (f.user_a, f.user_b) and f.status = 'accepted') m) end,
      'spaces', case when p.id = auth.uid() then '[]'::jsonb else (select coalesce(jsonb_agg(sp.name order by sp.name), '[]'::jsonb) from shared_spaces sp
          where exists (select 1 from shared_space_members a where a.space_id = sp.id and a.user_id = p.id)
            and exists (select 1 from shared_space_members b where b.space_id = sp.id and b.user_id = auth.uid())) end
    ) end)
  from profiles p where p.id = p_user;
$$;

-- every Apoji app's way to draw people: now with what they made themselves
create or replace function public.apoji_profiles(p_ids uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'nickname', coalesce(p.nickname, ''), 'avatar_url', p.avatar_url,
    'owner', p.id = any(public.app_owner_ids()), 'frame', s.frame, 'font', s.font, 'color', s.color, 'ptheme', s.ptheme, 'banner', s.banner,
    'status_text', coalesce(s.status_text, ''), 'effect', s.effect, 'banner_url', s.banner_url, 'theme_a', s.theme_a, 'theme_b', s.theme_b, 'pronouns', coalesce(s.pronouns, ''), 'pframe', s.pframe, 'name_a', s.name_a, 'name_b', s.name_b, 'display_name', coalesce(s.display_name, ''),
    'custom', coalesce(s.custom, '{}'::jsonb), 'frame_img', s.frame_img, 'overlay_img', s.overlay_img,
    'presence', case when p.id = auth.uid() or coalesce(s.presence, 'online') <> 'invisible' then coalesce(s.presence, 'online') else 'offline' end)), '[]'::jsonb)
  from profiles p left join profile_style s on s.user_id = p.id
  where auth.uid() is not null and p.id = any((coalesce(p_ids, '{}'::uuid[]))[1:200])
    and not exists (select 1 from friendships f where f.status = 'blocked' and f.user_a = least(p.id, auth.uid()) and f.user_b = greatest(p.id, auth.uid()));
$$;
revoke all on function public.apoji_profiles(uuid[]) from public, anon;
grant execute on function public.apoji_profiles(uuid[]) to authenticated;

-- 3) your own pictures, checked first ----------------------------------------------------------------------
-- The picture goes into your own folder of the avatars bucket (avatars/<you>/frame.png or overlay.png), then this
-- asks the Apoji Team to look at it. Until they approve, only you see it (in the shop's preview).
create table if not exists public.cosmetic_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('frame', 'overlay')),
  url text not null check (char_length(url) <= 400),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'removed')),
  note text not null default '' check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);
alter table public.cosmetic_uploads enable row level security;
drop policy if exists cosmetic_uploads_own on public.cosmetic_uploads;
create policy cosmetic_uploads_own on public.cosmetic_uploads for select using (user_id = auth.uid() or public.is_admin());
create index if not exists cosmetic_uploads_pending on public.cosmetic_uploads (status, created_at);

create or replace function public.cosmetic_upload_submit(p_kind text, p_url text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); new_id uuid;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Sign in first.'); end if;
  if p_kind not in ('frame', 'overlay') then return jsonb_build_object('ok', false, 'error', 'Unknown kind.'); end if;
  if coalesce(p_url, '') !~ ('^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/avatars/' || me::text || '/' || p_kind || '\.(webp|png|gif)(\?v=[0-9]+)?$') then
    return jsonb_build_object('ok', false, 'error', 'That picture has to be uploaded from Nexus.');
  end if;
  if (select count(*) from cosmetic_uploads where user_id = me and created_at > now() - interval '1 day') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'That''s a lot of uploads today. Try again tomorrow.');
  end if;
  update cosmetic_uploads set status = 'removed' where user_id = me and kind = p_kind and status = 'pending';
  insert into cosmetic_uploads (user_id, kind, url) values (me, p_kind, p_url) returning id into new_id;
  return jsonb_build_object('ok', true, 'id', new_id, 'status', 'pending');
end $$;

create or replace function public.my_cosmetic_uploads()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
    select distinct on (kind) id, kind, url, status, note, created_at, reviewed_at from cosmetic_uploads
    where user_id = auth.uid() and status <> 'removed' order by kind, created_at desc) x;
$$;

-- stop using your own picture (it stays approved in the list, but your profile stops showing it)
create or replace function public.cosmetic_upload_remove(p_kind text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Sign in first.'); end if;
  update cosmetic_uploads set status = 'removed' where user_id = me and kind = p_kind and status in ('pending', 'approved');
  if p_kind = 'frame' then update profile_style set frame_img = null, updated_at = now() where user_id = me;
  elsif p_kind = 'overlay' then update profile_style set overlay_img = null, updated_at = now() where user_id = me; end if;
  return jsonb_build_object('ok', true);
end $$;

-- Apoji Admin: the queue and the decision
create or replace function public.admin_cosmetic_uploads(p_status text default 'pending')
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not public.is_admin() then '[]'::jsonb else coalesce((select jsonb_agg(x order by x.created_at) from (
    select c.id, c.user_id, c.kind, c.url, c.status, c.note, c.created_at, c.reviewed_at, p.username, p.avatar_url,
      (select r.username from profiles r where r.id = c.reviewed_by) as reviewer
    from cosmetic_uploads c join profiles p on p.id = c.user_id
    where c.status = coalesce(nullif(p_status, ''), 'pending') order by c.created_at limit 200) x), '[]'::jsonb) end;
$$;

create or replace function public.admin_cosmetic_review(p_id uuid, p_ok boolean, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare u cosmetic_uploads;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  select * into u from cosmetic_uploads where id = p_id for update;
  if u.id is null then return jsonb_build_object('ok', false, 'error', 'Not found.'); end if;
  if u.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'Someone already looked at this one.'); end if;
  update cosmetic_uploads set status = case when p_ok then 'approved' else 'rejected' end, note = left(coalesce(p_note, ''), 300), reviewed_at = now(), reviewed_by = auth.uid() where id = p_id;
  if p_ok then
    insert into profile_style (user_id) values (u.user_id) on conflict do nothing;
    if u.kind = 'frame' then update profile_style set frame_img = u.url, updated_at = now() where user_id = u.user_id;
    else update profile_style set overlay_img = u.url, updated_at = now() where user_id = u.user_id; end if;
  end if;
  begin   -- tell them (a notice just for them, in every Nexus app)
    insert into broadcasts (title, body, audience, to_user, created_by)
    values (case when p_ok then 'Your picture was approved' else 'Your picture wasn''t approved' end,
            case when p_ok then format('Your own %s picture is on your profile now. Everyone can see it.', case when u.kind = 'frame' then 'frame' else 'profile frame' end)
                 else 'The Apoji Team didn''t approve your upload' || case when coalesce(p_note, '') <> '' then ': ' || left(p_note, 200) else '.' end || ' You can upload a different one in the shop.' end,
            'user', u.user_id, auth.uid());
  exception when others then null; end;
  insert into moderation_log (action, target_user_id, details, performed_by) values ('cosmetic_review', u.user_id, jsonb_build_object('upload', u.id, 'kind', u.kind, 'ok', p_ok, 'note', p_note), auth.uid());
  return jsonb_build_object('ok', true);
end $$;

-- an admin can also take an approved picture back down
create or replace function public.admin_cosmetic_takedown(p_id uuid, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare u cosmetic_uploads;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  select * into u from cosmetic_uploads where id = p_id;
  if u.id is null then return jsonb_build_object('ok', false, 'error', 'Not found.'); end if;
  update cosmetic_uploads set status = 'rejected', note = left(coalesce(p_note, ''), 300), reviewed_at = now(), reviewed_by = auth.uid() where id = p_id;
  update profile_style set frame_img = case when frame_img = u.url then null else frame_img end, overlay_img = case when overlay_img = u.url then null else overlay_img end where user_id = u.user_id;
  insert into moderation_log (action, target_user_id, details, performed_by) values ('cosmetic_takedown', u.user_id, jsonb_build_object('upload', u.id, 'note', p_note), auth.uid());
  return jsonb_build_object('ok', true);
end $$;

do $$ declare f text; begin
  foreach f in array array['cosmetic_upload_submit(text, text)', 'my_cosmetic_uploads()', 'cosmetic_upload_remove(text)', 'admin_cosmetic_uploads(text)', 'admin_cosmetic_review(uuid, boolean, text)', 'admin_cosmetic_takedown(uuid, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- 4) out of beta, and the new beta ---------------------------------------------------------------------------
update public.feature_flags set stage = 'all', updated_at = now() where key in ('smart_topics', 'ask_map', 'continue_on');
insert into public.feature_flags (key, stage, title, description, min_version) values
  ('make_your_own', 'beta', 'Make your own', 'Build your own picture frame, profile frame and profile effect in the shop, or upload your own image for the team to check.', '4.0.6')
on conflict (key) do nothing;

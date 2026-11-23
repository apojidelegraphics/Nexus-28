-- Nexus '28 4.0.4 (run after nexus-v4.0.2.sql, in the Nexus project's SQL editor). Safe to run more than once.
--  1) Profile frames (decorations around your whole card), six more picture frames, and "Your own color" for your name.
--  2) A display name (what people see on your profile), separate from what Nexus calls you.
--  3) Your status (online, idle, do not disturb, invisible) is on your account, and it's the same one Apoji Admin uses.

-- 1) -------------------------------------------------------------------------------------------------
alter table public.cosmetics drop constraint if exists cosmetics_kind_check;
alter table public.cosmetics add constraint cosmetics_kind_check check (kind in ('frame', 'pframe', 'ptheme', 'theme', 'font', 'color', 'banner', 'skin', 'effect'));
alter table public.cosmetics drop constraint if exists cosmetics_id_check;
alter table public.cosmetics add constraint cosmetics_id_check check (id ~ '^(frame|pframe|ptheme|theme|font|color|banner|skin|effect):[a-z0-9_-]{2,30}$');
insert into public.cosmetics (id, kind, name, price, sort) values
  ('frame:storm', 'frame', 'Storm', 1400, 215),
  ('frame:vines', 'frame', 'Overgrowth', 1000, 216),
  ('frame:void', 'frame', 'Event horizon', 2200, 217),
  ('frame:hex', 'frame', 'Hex shield', 1300, 218),
  ('frame:pixel', 'frame', '8-bit', 850, 219),
  ('frame:aurora', 'frame', 'Aurora', 1700, 220),
  ('pframe:neon', 'pframe', 'Neon glow', 400, 221),
  ('pframe:hud', 'pframe', 'HUD brackets', 500, 222),
  ('pframe:gold', 'pframe', 'Gilded', 700, 223),
  ('pframe:pixel', 'pframe', '8-bit', 600, 224),
  ('pframe:frost', 'pframe', 'Frostbite', 650, 225),
  ('pframe:flame', 'pframe', 'Inferno', 800, 226),
  ('pframe:holo', 'pframe', 'Holographic', 1100, 227),
  ('pframe:circuit', 'pframe', 'Live circuit', 900, 228),
  ('pframe:royal', 'pframe', 'Royal', 1000, 229),
  ('pframe:void', 'pframe', 'Void pulse', 1200, 230),
  ('color:custom', 'color', 'Your own color', 600, 267)
on conflict (id) do update set name = excluded.name, price = excluded.price, sort = excluded.sort, active = true;

alter table public.profile_style add column if not exists pframe text;
alter table public.profile_style add column if not exists name_a text check (name_a is null or name_a ~ '^#[0-9a-fA-F]{6}$');
alter table public.profile_style add column if not exists name_b text check (name_b is null or name_b ~ '^#[0-9a-fA-F]{6}$');
-- 2)
alter table public.profile_style add column if not exists display_name text not null default '' check (char_length(display_name) <= 32);
-- 3)
alter table public.profile_style add column if not exists presence text not null default 'online' check (presence in ('online', 'idle', 'dnd', 'invisible'));

create or replace function public.profile_style_set(p_style jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); k text; v text; owned text[]; boss boolean; adm boolean;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Sign in first.'); end if;
  boss := me = any(public.app_owner_ids()); adm := public.is_admin();
  select coalesce(array_agg(item_id), '{}') into owned from cirkts_owned where user_id = me;
  foreach k in array array['frame', 'pframe', 'ptheme', 'font', 'color', 'banner', 'skin', 'effect'] loop
    if p_style ? k then
      v := nullif(p_style ->> k, '');
      if v = 'frame:crown' and not boss then return jsonb_build_object('ok', false, 'error', 'The crown is only for the Owner.', 'item', v); end if;
      if v is not null and v <> 'frame:crown' and not (v = any(owned)) and not exists (select 1 from cosmetics where id = v and price = 0 and active) and not adm then
        return jsonb_build_object('ok', false, 'error', 'You don''t own that yet.', 'item', v);
      end if;
    end if;
  end loop;
  -- your own banner image: only from your own folder in the avatars bucket, and only if you have "Your own image"
  if p_style ? 'banner_url' and nullif(p_style ->> 'banner_url', '') is not null then
    if not ('banner:custom' = any(owned) or adm) then return jsonb_build_object('ok', false, 'error', 'Get "Your own image" in the shop first.'); end if;
    if (p_style ->> 'banner_url') !~ ('^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/avatars/' || me::text || '/banner\.(webp|png|jpe?g|gif)(\?v=[0-9]+)?$') then
      return jsonb_build_object('ok', false, 'error', 'That picture has to be uploaded from Nexus.');
    end if;
  end if;
  if (p_style ? 'theme_a' or p_style ? 'theme_b') and not ('ptheme:custom' = any(owned) or adm) then return jsonb_build_object('ok', false, 'error', 'Get "Your own colors" in the shop first.'); end if;
  if (p_style ? 'name_a' or p_style ? 'name_b') and nullif(coalesce(p_style ->> 'name_a', '') || coalesce(p_style ->> 'name_b', ''), '') is not null and not ('color:custom' = any(owned) or adm) then return jsonb_build_object('ok', false, 'error', 'Get "Your own color" in the shop first.'); end if;
  if coalesce(nullif(p_style ->> 'name_a', ''), '#000000') !~ '^#[0-9a-fA-F]{6}$' or coalesce(nullif(p_style ->> 'name_b', ''), '#000000') !~ '^#[0-9a-fA-F]{6}$' then return jsonb_build_object('ok', false, 'error', 'Colors look like #3dffa0.'); end if;
  if p_style ? 'presence' and coalesce(p_style ->> 'presence', '') not in ('', 'online', 'idle', 'dnd', 'invisible') then return jsonb_build_object('ok', false, 'error', 'Unknown status.'); end if;
  if coalesce(p_style ->> 'theme_a', '#000000') !~ '^#[0-9a-fA-F]{6}$' or coalesce(p_style ->> 'theme_b', '#000000') !~ '^#[0-9a-fA-F]{6}$' then return jsonb_build_object('ok', false, 'error', 'Colors look like #3dffa0.'); end if;
  insert into profile_style (user_id) values (me) on conflict do nothing;
  update profile_style set
    frame = case when p_style ? 'frame' then nullif(p_style ->> 'frame', '') else frame end,
    ptheme = case when p_style ? 'ptheme' then nullif(p_style ->> 'ptheme', '') else ptheme end,
    font = case when p_style ? 'font' then nullif(p_style ->> 'font', '') else font end,
    color = case when p_style ? 'color' then nullif(p_style ->> 'color', '') else color end,
    banner = case when p_style ? 'banner' then nullif(p_style ->> 'banner', '') else banner end,
    skin = case when p_style ? 'skin' then nullif(p_style ->> 'skin', '') else skin end,
    effect = case when p_style ? 'effect' then nullif(p_style ->> 'effect', '') else effect end,
    pframe = case when p_style ? 'pframe' then nullif(p_style ->> 'pframe', '') else pframe end,
    name_a = case when p_style ? 'name_a' then nullif(p_style ->> 'name_a', '') else name_a end,
    name_b = case when p_style ? 'name_b' then nullif(p_style ->> 'name_b', '') else name_b end,
    display_name = case when p_style ? 'display_name' then left(btrim(regexp_replace(coalesce(p_style ->> 'display_name', ''), '[[:cntrl:]]', '', 'g')), 32) else display_name end,
    presence = case when p_style ? 'presence' then coalesce(nullif(p_style ->> 'presence', ''), 'online') else presence end,
    banner_url = case when p_style ? 'banner_url' then nullif(p_style ->> 'banner_url', '') else banner_url end,
    theme_a = case when p_style ? 'theme_a' then nullif(p_style ->> 'theme_a', '') else theme_a end,
    theme_b = case when p_style ? 'theme_b' then nullif(p_style ->> 'theme_b', '') else theme_b end,
    pronouns = case when p_style ? 'pronouns' then left(coalesce(p_style ->> 'pronouns', ''), 24) else pronouns end,
    bio = case when p_style ? 'bio' then left(coalesce(p_style ->> 'bio', ''), 160) else bio end,
    status_text = case when p_style ? 'status_text' then left(coalesce(p_style ->> 'status_text', ''), 60) else status_text end,
    show_stats = case when p_style ? 'show_stats' then coalesce((p_style ->> 'show_stats')::boolean, true) else show_stats end,
    stats = case when p_style ? 'stats' and jsonb_typeof(p_style -> 'stats') = 'object' then (select coalesce(jsonb_object_agg(key, value), '{}') from jsonb_each(p_style -> 'stats') where key in ('streak', 'best', 'achievements', 'chats', 'cirkts', 'level') and jsonb_typeof(value) = 'number') else stats end,
    updated_at = now()
  where user_id = me;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.profile_card_of(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p.id, 'username', p.username, 'nickname', coalesce(p.nickname, ''), 'avatar_url', p.avatar_url,
    'owner', p.id = any(public.app_owner_ids()),
    'style', coalesce((select to_jsonb(s) - 'user_id' - case when s.show_stats then 'nothing' else 'stats' end from profile_style s where s.user_id = p.id), '{}'::jsonb),
    -- 4.0.4: "invisible" looks offline to everyone else
    'online', (select max(seen_at) from user_presence u where u.user_id = p.id) > now() - interval '5 minutes'
              and (p.id = auth.uid() or coalesce((select s.presence from profile_style s where s.user_id = p.id), 'online') <> 'invisible'),
    'last_seen', (select max(seen_at) from user_presence u where u.user_id = p.id),
    'friends', (select count(*) from friendships f where p.id in (f.user_a, f.user_b) and f.status = 'accepted'),
    'relation', (select case when f.status = 'accepted' then 'friend' when f.status = 'blocked' then 'blocked' when f.requested_by = auth.uid() then 'requested' else 'incoming' end
                   from friendships f where f.user_a = least(p.id, auth.uid()) and f.user_b = greatest(p.id, auth.uid())))
  from profiles p where p.id = p_user;
$$;

create or replace function public.apoji_profiles(p_ids uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'nickname', coalesce(p.nickname, ''), 'avatar_url', p.avatar_url,
    'owner', p.id = any(public.app_owner_ids()), 'frame', s.frame, 'font', s.font, 'color', s.color, 'ptheme', s.ptheme, 'banner', s.banner,
    'status_text', coalesce(s.status_text, ''), 'effect', s.effect, 'banner_url', s.banner_url, 'theme_a', s.theme_a, 'theme_b', s.theme_b, 'pronouns', coalesce(s.pronouns, ''), 'pframe', s.pframe, 'name_a', s.name_a, 'name_b', s.name_b, 'display_name', coalesce(s.display_name, ''),
    'presence', case when p.id = auth.uid() or coalesce(s.presence, 'online') <> 'invisible' then coalesce(s.presence, 'online') else 'offline' end)), '[]'::jsonb)
  from profiles p left join profile_style s on s.user_id = p.id
  where auth.uid() is not null and p.id = any((coalesce(p_ids, '{}'::uuid[]))[1:200])
    and not exists (select 1 from friendships f where f.status = 'blocked' and f.user_a = least(p.id, auth.uid()) and f.user_b = greatest(p.id, auth.uid()));
$$;
revoke all on function public.apoji_profiles(uuid[]) from public, anon;
grant execute on function public.apoji_profiles(uuid[]) to authenticated;

-- 3) one status for Nexus and Apoji Admin --------------------------------------------------------------
-- set it from Nexus / N28C / Test Run: also sets Apoji Admin's status if you're an admin ("online" = Admin's "auto")
create or replace function public.set_my_presence(p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); st text := coalesce(nullif(p_status, ''), 'online');
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Sign in first.'); end if;
  if st not in ('online', 'idle', 'dnd', 'invisible') then return jsonb_build_object('ok', false, 'error', 'Unknown status.'); end if;
  insert into profile_style (user_id, presence) values (me, st) on conflict (user_id) do update set presence = excluded.presence, updated_at = now();
  update admin_prefs set status = case st when 'online' then 'auto' else st end, back_at = null where user_id = me;
  return jsonb_build_object('ok', true, 'presence', st);
end $$;
revoke all on function public.set_my_presence(text) from public, anon;
grant execute on function public.set_my_presence(text) to authenticated;
-- set it in Apoji Admin: Nexus follows
create or replace function public.admin_prefs_presence_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into profile_style (user_id, presence) values (new.user_id, case new.status when 'auto' then 'online' else new.status end)
    on conflict (user_id) do update set presence = excluded.presence, updated_at = now();
  end if;
  return new;
end $$;
drop trigger if exists admin_prefs_presence_sync on public.admin_prefs;
create trigger admin_prefs_presence_sync after update of status on public.admin_prefs for each row execute function public.admin_prefs_presence_sync();

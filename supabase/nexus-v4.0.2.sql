-- Nexus '28 4.0.2 (run after nexus-v4.0.1.sql, in the Nexus project's SQL editor). Safe to run more than once.
--  1) The Gold crown frame is the Owner's alone: never sold; anyone who bought it gets their Cirkts back.
--  2) More frames, profile themes, banners, and a new kind: profile effects.
--  3) Discord-style profile: your own banner image (GIFs too), your own profile colors, pronouns.

-- 2) a new kind of item ----------------------------------------------------------------------------
alter table public.cosmetics drop constraint if exists cosmetics_kind_check;
alter table public.cosmetics add constraint cosmetics_kind_check check (kind in ('frame', 'ptheme', 'theme', 'font', 'color', 'banner', 'skin', 'effect'));
alter table public.cosmetics drop constraint if exists cosmetics_id_check;
alter table public.cosmetics add constraint cosmetics_id_check check (id ~ '^(frame|ptheme|theme|font|color|banner|skin|effect):[a-z0-9_-]{2,30}$');
insert into public.cosmetics (id, kind, name, price, sort) values
  ('frame:gold', 'frame', 'Gold ring', 600, 108),
  ('frame:frost', 'frame', 'Frost', 800, 109),
  ('frame:sakura', 'frame', 'Petals', 950, 110),
  ('frame:pulse', 'frame', 'Heartbeat', 1100, 111),
  ('frame:shadow', 'frame', 'Shadow', 1300, 112),
  ('frame:galaxy', 'frame', 'Galaxy', 1600, 113),
  ('frame:rgb', 'frame', 'Chroma', 2500, 114),
  ('ptheme:ocean', 'ptheme', 'Deep sea', 300, 121),
  ('ptheme:ember', 'ptheme', 'Embers', 400, 122),
  ('ptheme:custom', 'ptheme', 'Your own colors', 900, 123),
  ('banner:sunset', 'banner', 'Sunset', 300, 156),
  ('banner:aurora', 'banner', 'Aurora', 400, 157),
  ('banner:matrix', 'banner', 'Matrix', 600, 158),
  ('banner:custom', 'banner', 'Your own image', 1200, 159),
  ('effect:sparkle', 'effect', 'Sparkles', 700, 160),
  ('effect:snow', 'effect', 'Snowfall', 600, 161),
  ('effect:rain', 'effect', 'Rain', 650, 162),
  ('effect:embers', 'effect', 'Embers', 800, 163),
  ('effect:stars', 'effect', 'Shooting stars', 900, 164)
on conflict (id) do update set name = excluded.name, price = excluded.price, sort = excluded.sort, active = true;

-- 1) the crown -------------------------------------------------------------------------------------
update public.cosmetics set price = 0, active = false, data = data || '{"owner_only": true}'::jsonb where id = 'frame:crown';
with refunds as (
  delete from public.cirkts_owned o where o.item_id = 'frame:crown' and not (o.user_id = any(public.app_owner_ids()))
  returning o.user_id, o.price_paid
)
update public.cirkts_wallet w set spent = greatest(0, w.spent - r.paid)
from (select user_id, sum(price_paid) as paid from refunds group by user_id) r where w.user_id = r.user_id;
update public.profile_style set frame = null where frame = 'frame:crown' and not (user_id = any(public.app_owner_ids()));

-- 3) profile columns -------------------------------------------------------------------------------
alter table public.profile_style add column if not exists effect text;
alter table public.profile_style add column if not exists banner_url text check (banner_url is null or char_length(banner_url) <= 400);
alter table public.profile_style add column if not exists theme_a text check (theme_a is null or theme_a ~ '^#[0-9a-fA-F]{6}$');
alter table public.profile_style add column if not exists theme_b text check (theme_b is null or theme_b ~ '^#[0-9a-fA-F]{6}$');
alter table public.profile_style add column if not exists pronouns text not null default '' check (char_length(pronouns) <= 24);

create or replace function public.profile_style_set(p_style jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); k text; v text; owned text[]; boss boolean; adm boolean;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Sign in first.'); end if;
  boss := me = any(public.app_owner_ids()); adm := public.is_admin();
  select coalesce(array_agg(item_id), '{}') into owned from cirkts_owned where user_id = me;
  foreach k in array array['frame', 'ptheme', 'font', 'color', 'banner', 'skin', 'effect'] loop
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

-- other apps get the new parts of your profile too
create or replace function public.apoji_profiles(p_ids uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'nickname', coalesce(p.nickname, ''), 'avatar_url', p.avatar_url,
    'owner', p.id = any(public.app_owner_ids()), 'frame', s.frame, 'font', s.font, 'color', s.color, 'ptheme', s.ptheme, 'banner', s.banner,
    'status_text', coalesce(s.status_text, ''), 'effect', s.effect, 'banner_url', s.banner_url, 'theme_a', s.theme_a, 'theme_b', s.theme_b, 'pronouns', coalesce(s.pronouns, ''))), '[]'::jsonb)
  from profiles p left join profile_style s on s.user_id = p.id
  where auth.uid() is not null and p.id = any((coalesce(p_ids, '{}'::uuid[]))[1:200])
    and not exists (select 1 from friendships f where f.status = 'blocked' and f.user_a = least(p.id, auth.uid()) and f.user_b = greatest(p.id, auth.uid()));
$$;
revoke all on function public.apoji_profiles(uuid[]) from public, anon;
grant execute on function public.apoji_profiles(uuid[]) to authenticated;

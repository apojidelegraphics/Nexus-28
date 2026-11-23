-- Nexus '28 4.0.1 (run after nexus-v4.0.sql, in the Nexus project's SQL editor). Safe to run more than once.
--  1) Admins with "Unlock everything" can put any frame, font, color, banner or theme on their profile.
--  2) Six new app themes in the Cirkts shop.
--  3) apoji_profiles(ids): picture, frame and name style for a list of people, for Apoji Admin and any future Apoji app.
--  4) my_apoji_profile(): your own picture + style in one call (for apps that only need "me").

-- 1) ------------------------------------------------------------------------------------------------
create or replace function public.profile_style_set(p_style jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); k text; v text; owned text[];
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Sign in first.'); end if;
  select coalesce(array_agg(item_id), '{}') into owned from cirkts_owned where user_id = me;
  foreach k in array array['frame', 'ptheme', 'font', 'color', 'banner', 'skin'] loop
    if p_style ? k then
      v := nullif(p_style ->> k, '');
      if v is not null and not (v = any(owned)) and not exists (select 1 from cosmetics where id = v and price = 0) and not public.is_admin() then
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

-- 2) ------------------------------------------------------------------------------------------------
insert into public.cosmetics (id, kind, name, price, sort) values
  ('theme:cyber', 'theme', 'Cyberpunk', 650, 20),
  ('theme:vapor', 'theme', 'Vaporwave', 700, 21),
  ('theme:bloodmoon', 'theme', 'Blood Moon', 800, 22),
  ('theme:emerald', 'theme', 'Emerald City', 850, 23),
  ('theme:royal', 'theme', 'Royal', 1100, 24),
  ('theme:toxic', 'theme', 'Toxic', 1250, 25)
on conflict (id) do update set name = excluded.name, price = excluded.price, sort = excluded.sort, active = true;

-- 3) ------------------------------------------------------------------------------------------------
create or replace function public.apoji_profiles(p_ids uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'nickname', coalesce(p.nickname, ''), 'avatar_url', p.avatar_url,
    'owner', p.id = any(public.app_owner_ids()), 'frame', s.frame, 'font', s.font, 'color', s.color, 'ptheme', s.ptheme, 'banner', s.banner,
    'status_text', coalesce(s.status_text, ''))), '[]'::jsonb)
  from profiles p left join profile_style s on s.user_id = p.id
  where auth.uid() is not null and p.id = any((coalesce(p_ids, '{}'::uuid[]))[1:200])
    and not exists (select 1 from friendships f where f.status = 'blocked' and f.user_a = least(p.id, auth.uid()) and f.user_b = greatest(p.id, auth.uid()));
$$;
revoke all on function public.apoji_profiles(uuid[]) from public, anon;
grant execute on function public.apoji_profiles(uuid[]) to authenticated;

-- 4) ------------------------------------------------------------------------------------------------
create or replace function public.my_apoji_profile()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then jsonb_build_object('ok', false) else
    jsonb_build_object('ok', true, 'profile', (select (x -> 0) || jsonb_build_object('has_style', s.user_id is not null, 'bio', coalesce(s.bio, ''), 'show_stats', coalesce(s.show_stats, true))
      from public.apoji_profiles(array[auth.uid()]) x left join profile_style s on s.user_id = auth.uid())) end;
$$;
revoke all on function public.my_apoji_profile() from public, anon;
grant execute on function public.my_apoji_profile() to authenticated;

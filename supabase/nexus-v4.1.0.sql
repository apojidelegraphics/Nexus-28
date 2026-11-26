-- Nexus '28 4.1.0 (run after nexus-v4.0.6.sql and apoji-admin-3.2.sql, in the Nexus project's SQL editor). Safe to run more than once.
--  1) Your own picture frame goes on when it's approved (it used to wait for you to pick "My own picture" too), and
--     pictures that were already approved are put on now.
--  2) Profile visitors: who looked at your profile this week. People who are invisible show up as "someone".
--  3) Banners that move, and limited items that are only in the shop during their month.

-- 1) ------------------------------------------------------------------------------------------------------
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
    -- 4.1.0: and put it on (an approved picture used to wait until they also picked "My own picture" in the shop)
    if u.kind = 'frame' then update profile_style set frame_img = u.url, frame = 'frame:mine', custom = jsonb_set(coalesce(custom, '{}'::jsonb), '{frame}', coalesce(custom -> 'frame', '{}'::jsonb) || '{"style": "image"}'::jsonb), updated_at = now() where user_id = u.user_id;
    else update profile_style set overlay_img = u.url, pframe = 'pframe:mine', custom = jsonb_set(coalesce(custom, '{}'::jsonb), '{pframe}', coalesce(custom -> 'pframe', '{}'::jsonb) || '{"style": "image"}'::jsonb), updated_at = now() where user_id = u.user_id; end if;
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

update public.profile_style set frame = 'frame:mine', custom = jsonb_set(coalesce(custom, '{}'::jsonb), '{frame}', coalesce(custom -> 'frame', '{}'::jsonb) || '{"style": "image"}'::jsonb)
  where frame_img is not null and coalesce(custom #>> '{frame,style}', '') <> 'image' and coalesce(frame, '') <> 'frame:mine';
update public.profile_style set pframe = 'pframe:mine', custom = jsonb_set(coalesce(custom, '{}'::jsonb), '{pframe}', coalesce(custom -> 'pframe', '{}'::jsonb) || '{"style": "image"}'::jsonb)
  where overlay_img is not null and coalesce(custom #>> '{pframe,style}', '') <> 'image' and coalesce(pframe, '') <> 'pframe:mine';

-- 2) ------------------------------------------------------------------------------------------------------
create table if not exists public.profile_visits (
  owner uuid not null references auth.users(id) on delete cascade,
  viewer uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  visits int not null default 1,
  last_at timestamptz not null default now(),
  primary key (owner, viewer, day)
);
alter table public.profile_visits enable row level security;   -- only through the functions below
create index if not exists profile_visits_owner on public.profile_visits (owner, day desc);

-- someone opened a profile (not their own; nothing if either blocked the other)
create or replace function public.profile_visit(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or p_user is null or p_user = me then return jsonb_build_object('ok', true); end if;
  if exists (select 1 from friendships f where f.status = 'blocked' and f.user_a = least(p_user, me) and f.user_b = greatest(p_user, me)) then return jsonb_build_object('ok', true); end if;
  insert into profile_visits (owner, viewer) values (p_user, me)
    on conflict (owner, viewer, day) do update set visits = least(profile_visits.visits + 1, 1000), last_at = now();
  delete from profile_visits where day < current_date - 60;
  return jsonb_build_object('ok', true);
end $$;

-- who looked at your profile in the last few days (people who were invisible show as "someone")
create or replace function public.my_profile_visitors(p_days int default 7)
returns jsonb language sql stable security definer set search_path = public as $$
  with v as (
    select viewer, sum(visits)::int as visits, max(last_at) as last_at from profile_visits
    where owner = auth.uid() and day >= current_date - greatest(1, least(coalesce(p_days, 7), 30)) + 1 group by viewer)
  select jsonb_build_object('ok', auth.uid() is not null, 'total', coalesce((select sum(visits) from v), 0), 'people', (select count(*) from v),
    'visitors', coalesce((select jsonb_agg(x order by x.last_at desc) from (
      select v.last_at, v.visits, coalesce(s.presence, 'online') = 'invisible' as hidden,
        case when coalesce(s.presence, 'online') = 'invisible' then null else p.username end as username,
        case when coalesce(s.presence, 'online') = 'invisible' then null else coalesce(nullif(s.display_name, ''), p.nickname, p.username) end as name,
        case when coalesce(s.presence, 'online') = 'invisible' then null else p.avatar_url end as avatar_url,
        case when coalesce(s.presence, 'online') = 'invisible' then null else s.frame end as frame,
        case when coalesce(s.presence, 'online') = 'invisible' then null else s.custom end as custom,
        case when coalesce(s.presence, 'online') = 'invisible' then null else s.frame_img end as frame_img
      from v join profiles p on p.id = v.viewer left join profile_style s on s.user_id = v.viewer limit 50) x), '[]'::jsonb));
$$;
do $$ declare f text; begin
  foreach f in array array['profile_visit(uuid)', 'my_profile_visitors(int)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- 3) ------------------------------------------------------------------------------------------------------
insert into public.cosmetics (id, kind, name, price, sort, data) values
  ('banner:rainglass', 'banner', 'Rain on glass', 700, 238, '{}'::jsonb),
  ('banner:drift', 'banner', 'Star drift', 650, 239, '{}'::jsonb),
  ('banner:lava', 'banner', 'Lava lamp', 800, 240, '{}'::jsonb),
  ('banner:synthsun', 'banner', 'Synth sunset', 900, 241, '{}'::jsonb),
  ('banner:livelights', 'banner', 'Live aurora', 1000, 242, '{}'::jsonb),
  ('banner:neonrain', 'banner', 'Neon rain', 1100, 243, '{}'::jsonb),
  ('frame:harvest', 'frame', 'Harvest wreath', 600, 244, '{"months": [11]}'::jsonb),
  ('banner:autumn', 'banner', 'Falling leaves', 650, 245, '{"months": [11]}'::jsonb),
  ('effect:leaves', 'effect', 'Autumn leaves', 550, 246, '{"months": [11]}'::jsonb),
  ('frame:snowglobe', 'frame', 'Snow globe', 750, 247, '{"months": [12]}'::jsonb),
  ('banner:lights', 'banner', 'Holiday lights', 800, 248, '{"months": [2, 12]}'::jsonb),
  ('pframe:candy', 'pframe', 'Candy cane', 700, 249, '{"months": [12]}'::jsonb),
  ('effect:twinkle', 'effect', 'Fairy lights', 650, 250, '{"months": [1, 12]}'::jsonb),
  ('frame:frostfire', 'frame', 'Frostfire', 800, 251, '{"months": [1]}'::jsonb),
  ('banner:fireworks', 'banner', 'Fireworks', 900, 252, '{"months": [1]}'::jsonb),
  ('frame:hearts', 'frame', 'Sweetheart', 650, 253, '{"months": [2]}'::jsonb),
  ('effect:hearts', 'effect', 'Floating hearts', 600, 254, '{"months": [2]}'::jsonb)
on conflict (id) do update set name = excluded.name, price = excluded.price, sort = excluded.sort, data = excluded.data, active = true;

create or replace function public.cirkts_buy(p_item text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c cosmetics; w cirkts_wallet;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Sign in first.'); end if;
  select * into c from cosmetics where id = p_item and active;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'That isn''t in the shop.'); end if;
  -- 4.1.0: limited items only sell in their month (a day of leeway either side for time zones)
  if c.data ? 'months' and not exists (select 1 from jsonb_array_elements_text(c.data -> 'months') m
      where m::int in (extract(month from now() - interval '14 hours')::int, extract(month from now() + interval '14 hours')::int)) then
    return jsonb_build_object('ok', false, 'error', 'That one is only in the shop during its month.');
  end if;
  if exists (select 1 from cirkts_owned where user_id = me and item_id = c.id) then return jsonb_build_object('ok', false, 'error', 'You already have it.', 'owned', true); end if;
  select * into w from cirkts_wallet where user_id = me for update;
  if w.user_id is null then return jsonb_build_object('ok', false, 'error', 'Open Nexus on your computer once so your Cirkts sync.'); end if;
  if w.earned - w.spent < c.price then return jsonb_build_object('ok', false, 'error', format('You need %s more Cirkts.', c.price - (w.earned - w.spent)), 'short', c.price - (w.earned - w.spent)); end if;
  update cirkts_wallet set spent = spent + c.price where user_id = me;
  insert into cirkts_owned (user_id, item_id, price_paid) values (me, c.id, c.price);
  return public.cirkts_state() || jsonb_build_object('bought', c.id, 'price', c.price);
end $$;

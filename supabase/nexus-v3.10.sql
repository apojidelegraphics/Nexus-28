-- Nexus '28 3.10 + Apoji Admin 2.5 — run once in the Supabase SQL editor (after nexus-v3.9.sql). Safe to run again.
--   1. Training for everyone: beta testers always share; everyone else is asked once and can say no
--   2. Pushing what Nexus learned: lessons roll out admins → beta testers → everyone, with undo
--   3. Training auto-sort labels
--   4. Notices for one person (test assignments) on top of broadcasts
--   5. Test assignments and the release gate
--   6. Free API usage (Nexus speech + Test Run)
--   7. Redeem an order for a customer
--   8. Axiom's cage: the walls start wearing down once the drivers are 2 days old
--   9. 3.7 beta features → everyone
--  10. Terms: who accepted which version

-- ============================================================ 0. new admin permissions
-- training_push is never automatic for high-admins: only the Owner and the people the Owner picks can push lessons.
do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'public.admin_permissions'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%perm%' loop
    execute format('alter table public.admin_permissions drop constraint %I', c);
  end loop;
end $$;
alter table public.admin_permissions add constraint admin_permissions_perm_check
  check (perm in ('users_edit', 'users_create', 'changelog', 'axiom', 'testing', 'training', 'training_push', 'redeem', 'roles', 'maintenance', 'flags'));
create or replace function public.training_can_push(p_uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_owner(p_uid) or exists (select 1 from admin_permissions g where g.user_id = p_uid and g.perm = 'training_push'
    and (g.expires_at is null or g.expires_at > now()) and exists (select 1 from admin_roles r where r.user_id = p_uid and r.level = 'high-admin'));
$$;

-- ============================================================ 1. training for everyone
create or replace function public.training_ok(p_uid uuid default auth.uid()) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from training_consent where user_id = p_uid and revoked_at is null)
      or exists (select 1 from profiles where id = p_uid and is_beta_tester);   -- beta testers always share
$$;
create or replace function public.training_set_consent(p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return jsonb_build_object('ok', false); end if;
  if not p_on and exists (select 1 from profiles where id = auth.uid() and is_beta_tester) then
    return jsonb_build_object('ok', false, 'error', 'tester', 'message', 'Beta testers always help train Nexus. To stop, leave the beta program.');
  end if;
  if p_on then insert into training_consent (user_id) values (auth.uid()) on conflict (user_id) do update set agreed_at = now(), revoked_at = null;
  else insert into training_consent (user_id, revoked_at) values (auth.uid(), now()) on conflict (user_id) do update set revoked_at = now(); end if;   -- "no" is remembered, so we don't ask again
  return jsonb_build_object('ok', true, 'on', p_on);
end $$;
create or replace function public.training_my_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('on', public.training_ok(), 'agreed_at', (select agreed_at from training_consent where user_id = auth.uid() and revoked_at is null),
    'asked', exists (select 1 from training_consent where user_id = auth.uid()),
    'examples', (select count(*) from training_examples where user_id = auth.uid()),
    'helped', (select count(*) from training_examples where user_id = auth.uid() and approved),
    'tester', exists (select 1 from profiles where id = auth.uid() and is_beta_tester));
$$;

-- ============================================================ 2. pushing lessons (rollout with undo)
create table if not exists public.training_pushes (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 1 and 80),
  note text not null default '' check (char_length(note) <= 400),
  stage text not null default 'admin' check (stage in ('admin', 'beta', 'all')),
  lessons int not null default 0,
  up_before int,                          -- 👍 rate for the 7 days before the push (to compare with after)
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  promoted_at timestamptz,
  undone_at timestamptz,
  undone_by uuid references auth.users(id)
);
alter table public.training_pushes enable row level security;
drop policy if exists training_pushes_read on public.training_pushes;
create policy training_pushes_read on public.training_pushes for select using (public.admin_has_perm('training'));
alter table public.training_examples add column if not exists push_id bigint references public.training_pushes(id) on delete set null;
create index if not exists training_examples_push_idx on public.training_examples (push_id) where push_id is not null;

-- can this person get lessons from that push? (approved but not pushed yet: admins only, so they can try them first)
create or replace function public.training_stage_ok(p_push bigint, p_uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select case when p_push is null then exists (select 1 from admin_roles where user_id = p_uid)
    else coalesce((select p.undone_at is null and (p.stage = 'all'
      or (p.stage = 'beta' and (exists (select 1 from profiles where id = p_uid and is_beta_tester) or exists (select 1 from admin_roles where user_id = p_uid)))
      or (p.stage = 'admin' and exists (select 1 from admin_roles where user_id = p_uid))) from training_pushes p where p.id = p_push), false) end;
$$;
create or replace function public.training_lessons(p_query text, p_agent text default '', p_limit int default 3) returns jsonb
language sql stable security definer set search_path = public as $$
  with q as (select nullif(replace(plainto_tsquery('english', left(coalesce(p_query, ''), 500))::text, ' & ', ' | '), '')::tsquery tq)
  select coalesce(jsonb_agg(jsonb_build_object('q', left(e.prompt, 600), 'a', left(coalesce(e.correction, e.answer), 1200), 'rule', e.lesson, 'agent', e.agent, 'id', e.id) order by e.rank desc), '[]'::jsonb)
  from (select t.*, ts_rank(to_tsvector('english', t.prompt), q.tq) + case when t.agent = p_agent then 0.05 else 0 end as rank
        from training_examples t, q where t.approved and q.tq is not null and public.training_stage_ok(t.push_id)
          and to_tsvector('english', t.prompt) @@ q.tq and ts_rank(to_tsvector('english', t.prompt), q.tq) > 0.02
        order by rank desc limit greatest(1, least(coalesce(p_limit, 3), 5))) e;
$$;
create or replace function public.training_rules(p_agent text default '') returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(lesson order by approved_at desc), '[]'::jsonb) from (
    select lesson, approved_at from training_examples where approved and lesson is not null and public.training_stage_ok(push_id)
      and (agent = p_agent or p_agent = '' or agent = '') order by approved_at desc limit 12) r;
$$;

-- 👍 rate over a window (whole numbers, null when there are no ratings)
create or replace function public.training_up_rate(p_from timestamptz, p_to timestamptz) returns int
language sql stable security definer set search_path = public as $$
  select round(100.0 * count(*) filter (where rating = 1) / nullif(count(*) filter (where rating <> 0), 0))::int from training_examples where created_at >= p_from and created_at < p_to;
$$;
-- tell the people who'll get it (a broadcast to that audience)
create or replace function public.training_announce(p_push bigint) returns void
language plpgsql security definer set search_path = public as $$
declare p training_pushes;
begin
  select * into p from training_pushes where id = p_push;
  insert into broadcasts (title, body, audience, created_by, expires_at)
  values ('🧠 Nexus learned ' || p.lessons || ' new thing' || case when p.lessons = 1 then '' else 's' end, left(coalesce(nullif(p.note, ''), p.title) || ' Thanks to everyone who helps train Nexus.', 400),
    case p.stage when 'admin' then 'admins' else p.stage end, coalesce(auth.uid(), p.created_by), now() + interval '5 days');
end $$;
revoke all on function public.training_announce(bigint) from public, anon, authenticated;

create or replace function public.admin_training_push(p_title text, p_note text, p_ids bigint[], p_stage text default 'admin') returns jsonb
language plpgsql security definer set search_path = public as $$
declare pid bigint; n int;
begin
  if not public.training_can_push() then return jsonb_build_object('success', false, 'error', 'not_allowed'); end if;
  if p_stage not in ('admin', 'beta', 'all') then return jsonb_build_object('success', false, 'error', 'bad_stage'); end if;
  insert into training_pushes (title, note, stage, up_before) values (left(p_title, 80), left(coalesce(p_note, ''), 400), p_stage, public.training_up_rate(now() - interval '7 days', now())) returning id into pid;
  update training_examples set push_id = pid where id = any(p_ids) and approved and (push_id is null or push_id in (select id from training_pushes where undone_at is not null));
  get diagnostics n = row_count;
  if n = 0 then delete from training_pushes where id = pid; return jsonb_build_object('success', false, 'error', 'nothing_to_push'); end if;
  update training_pushes set lessons = n where id = pid;
  perform public.training_announce(pid);
  insert into moderation_log (action, performed_by, details) values ('training_push', auth.uid(), jsonb_build_object('push', pid, 'stage', p_stage, 'lessons', n));
  return jsonb_build_object('success', true, 'id', pid, 'lessons', n);
end $$;
create or replace function public.admin_training_promote(p_push bigint, p_stage text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.training_can_push() then return jsonb_build_object('success', false, 'error', 'not_allowed'); end if;
  if p_stage not in ('beta', 'all') then return jsonb_build_object('success', false, 'error', 'bad_stage'); end if;
  update training_pushes set stage = p_stage, promoted_at = now() where id = p_push and undone_at is null;
  if not found then return jsonb_build_object('success', false, 'error', 'not_found'); end if;
  perform public.training_announce(p_push);
  insert into moderation_log (action, performed_by, details) values ('training_promote', auth.uid(), jsonb_build_object('push', p_push, 'stage', p_stage));
  return jsonb_build_object('success', true);
end $$;
-- Undo: the lessons stop right away (apps re-check within 10 minutes); the examples stay approved so they can be pushed again
create or replace function public.admin_training_undo(p_push bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.training_can_push() then return jsonb_build_object('success', false, 'error', 'not_allowed'); end if;
  update training_pushes set undone_at = now(), undone_by = auth.uid() where id = p_push and undone_at is null;
  if not found then return jsonb_build_object('success', false, 'error', 'not_found'); end if;
  update broadcasts set cancelled = true where title like '🧠 Nexus learned%' and created_at > (select created_at from training_pushes where id = p_push) - interval '1 minute' and not cancelled
    and created_at < coalesce((select min(created_at) from training_pushes where id > p_push), now() + interval '1 minute');
  insert into moderation_log (action, performed_by, details) values ('training_undo', auth.uid(), jsonb_build_object('push', p_push));
  return jsonb_build_object('success', true);
end $$;
create or replace function public.admin_training_pushes() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.admin_has_perm('training') then raise exception 'not allowed'; end if;
  return jsonb_build_object('can_push', public.training_can_push(),
    'ready', (select count(*) from training_examples t where approved and (push_id is null or push_id in (select id from training_pushes where undone_at is not null))),
    'pushes', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'note', p.note, 'stage', p.stage, 'lessons', p.lessons, 'created_at', p.created_at,
      'promoted_at', p.promoted_at, 'undone_at', p.undone_at, 'by', u.email, 'up_before', p.up_before,
      'up_after', public.training_up_rate(coalesce(p.promoted_at, p.created_at), coalesce(p.undone_at, now())),
      'rated_after', (select count(*) from training_examples t where t.rating <> 0 and t.created_at >= coalesce(p.promoted_at, p.created_at) and t.created_at < coalesce(p.undone_at, now())),
      'rules', (select coalesce(jsonb_agg(coalesce(t.lesson, left(t.prompt, 80))), '[]'::jsonb) from training_examples t where t.push_id = p.id)) order by p.created_at desc)
      from (select * from training_pushes order by created_at desc limit 30) p left join auth.users u on u.id = p.created_by), '[]'::jsonb));
end $$;
-- For the app's Settings → Training: what Nexus learned lately that applies to you
create or replace function public.training_news() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'note', p.note, 'at', coalesce(p.promoted_at, p.created_at), 'lessons', p.lessons,
    'rules', (select coalesce(jsonb_agg(t.lesson) filter (where t.lesson is not null), '[]'::jsonb) from training_examples t where t.push_id = p.id)) order by coalesce(p.promoted_at, p.created_at) desc), '[]'::jsonb)
  from (select * from training_pushes where undone_at is null and created_at > now() - interval '60 days' order by created_at desc limit 10) p
  where public.training_stage_ok(p.id);
$$;

-- ============================================================ 3. auto-sort (AI pre-sorts the review queue in Apoji Admin)
alter table public.training_examples add column if not exists auto_label text check (auto_label in ('good', 'wrong', 'private', 'unsure'));
alter table public.training_examples add column if not exists auto_note text check (char_length(auto_note) <= 300);
alter table public.training_examples add column if not exists auto_at timestamptz;

-- ============================================================ 4. notices for one person (rides on broadcasts)
do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'public.broadcasts'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%audience%' loop
    execute format('alter table public.broadcasts drop constraint %I', c);
  end loop;
end $$;
alter table public.broadcasts add column if not exists to_user uuid references auth.users(id) on delete cascade;
alter table public.broadcasts add constraint broadcasts_audience_check check (audience in ('all', 'beta', 'admins', 'outdated', 'user'));
drop policy if exists bc_select on public.broadcasts;
create policy bc_select on public.broadcasts for select using (
  (public.is_admin() and audience <> 'user') or (not cancelled and send_at <= now() and expires_at > now() and (
    audience in ('all', 'outdated')
    or (audience = 'beta' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_beta_tester))
    or (audience = 'user' and to_user = auth.uid())
  )) or (audience = 'user' and public.is_admin() and created_by = auth.uid()));

-- ============================================================ 5. test assignments + the release gate
create table if not exists public.test_assignments (
  item_id bigint not null references public.test_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid references auth.users(id) default auth.uid(),
  assigned_at timestamptz not null default now(),
  primary key (item_id, user_id)
);
alter table public.test_assignments enable row level security;
drop policy if exists test_assignments_read on public.test_assignments;
create policy test_assignments_read on public.test_assignments for select using (user_id = auth.uid() or public.admin_has_perm('testing'));
drop policy if exists test_assignments_delete on public.test_assignments;
create policy test_assignments_delete on public.test_assignments for delete using (public.admin_has_perm('testing'));

-- Testers and what they use (so each test goes to the right computer)
create or replace function public.admin_testers() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.admin_has_perm('testing') then raise exception 'not allowed'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'email', u.email, 'name', coalesce(to_jsonb(p)->>'nickname', to_jsonb(p)->>'username', split_part(u.email, '@', 1)),
      'surfaces', (select coalesce(jsonb_agg(s.surface order by s.seen_at desc), '[]'::jsonb) from user_presence s where s.user_id = p.id and s.seen_at > now() - interval '30 days'),
      'assigned', (select count(*) from test_assignments a join test_items i on i.id = a.item_id where a.user_id = p.id and not i.archived),
      'done', (select count(*) from test_assignments a join test_results r on r.item_id = a.item_id and r.user_id = a.user_id where a.user_id = p.id)) order by u.email)
    from profiles p join auth.users u on u.id = p.id where p.is_beta_tester or exists (select 1 from admin_roles r where r.user_id = p.id)), '[]'::jsonb);
end $$;
-- Assign tests; each person gets one notice ("🧪 3 things to test on Windows")
create or replace function public.admin_assign_tests(p_items bigint[], p_users uuid[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid; n int; total int := 0; plats text;
begin
  if not public.admin_has_perm('testing') then return jsonb_build_object('success', false, 'error', 'not_allowed'); end if;
  foreach u in array p_users loop
    insert into test_assignments (item_id, user_id) select i, u from unnest(p_items) i where exists (select 1 from test_items where id = i) on conflict do nothing;
    get diagnostics n = row_count;
    if n > 0 then
      total := total + n;
      select string_agg(distinct case platform when 'windows' then 'Windows' when 'mac' then 'Mac' when 'web' then 'Test Run' when 'phone' then 'N28C' when 'admin' then 'Apoji Admin' else null end, ', ')
        into plats from test_items where id = any(p_items);
      insert into broadcasts (title, body, audience, to_user, created_by, expires_at, phone)
      values ('🧪 ' || n || ' thing' || case when n = 1 then '' else 's' end || ' to test' || coalesce(' on ' || plats, ''),
        'The Apoji Team asked you to check ' || case when n = 1 then 'this' else 'these' end || '. Open Settings → Beta → Needs testing.', 'user', u, auth.uid(), now() + interval '7 days', true);
    end if;
  end loop;
  return jsonb_build_object('success', true, 'assigned', total);
end $$;
-- Is a release ready? Every test needs a ✓ and no open ✕ (a ✕ counts until someone passes it later)
create or replace function public.admin_release_gate(p_release text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare items int; passed int; failing int; untested int;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  with x as (select i.id,
      (select max(updated_at) from test_results r where r.item_id = i.id and r.status = 'pass') last_pass,
      (select max(updated_at) from test_results r where r.item_id = i.id and r.status = 'fail') last_fail
    from test_items i where i.release = p_release and not i.archived)
  select count(*), count(*) filter (where last_pass is not null and (last_fail is null or last_pass > last_fail)),
         count(*) filter (where last_fail is not null and (last_pass is null or last_fail >= last_pass)),
         count(*) filter (where last_pass is null and last_fail is null)
    into items, passed, failing, untested from x;
  return jsonb_build_object('release', p_release, 'items', items, 'passed', passed, 'failing', failing, 'untested', untested,
    'ready', items > 0 and failing = 0 and untested = 0,
    'fails', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title, 'platform', i.platform)) from test_items i
       where i.release = p_release and not i.archived and exists (select 1 from test_results r where r.item_id = i.id and r.status = 'fail'
         and r.updated_at >= coalesce((select max(updated_at) from test_results r2 where r2.item_id = i.id and r2.status = 'pass'), '-infinity'))), '[]'::jsonb));
end $$;

-- ============================================================ 6. free API usage
-- Groq's free plan (one shared key): about 2,000 requests and 28,800 audio seconds a day for Whisper. Check
-- console.groq.com → Settings → Limits for your real numbers and change them here if they differ.
create or replace function public.admin_free_usage() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return jsonb_build_object(
    'speech', jsonb_build_object('calls', coalesce((select sum(calls) from stt_usage where day = current_date), 0), 'seconds', coalesce((select sum(seconds) from stt_usage where day = current_date), 0),
      'people', (select count(*) from stt_usage where day = current_date), 'limit_calls', 2000, 'limit_seconds', 28800, 'per_person_calls', 300, 'per_person_seconds', 3600,
      'top', coalesce((select jsonb_agg(jsonb_build_object('email', u.email, 'calls', s.calls, 'seconds', s.seconds) order by s.seconds desc) from (select * from stt_usage where day = current_date order by seconds desc limit 5) s join auth.users u on u.id = s.user_id), '[]'::jsonb),
      'days', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'calls', c, 'seconds', s) order by day) from (select day, sum(calls) c, sum(seconds) s from stt_usage where day > current_date - 14 group by day) d), '[]'::jsonb)),
    'test_run', jsonb_build_object('answers', coalesce((select sum(main) from try_usage where day = (now() at time zone 'utc')::date), 0),
      'extra', coalesce((select sum(extra) from try_usage where day = (now() at time zone 'utc')::date), 0),
      'searches', coalesce((select sum(searches) from try_usage where day = (now() at time zone 'utc')::date), 0),
      'people', (select count(*) from try_usage where day = (now() at time zone 'utc')::date),
      'days', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'answers', a, 'people', n) order by day) from (select day, sum(main) a, count(*) n from try_usage where day > (now() at time zone 'utc')::date - 14 group by day) d), '[]'::jsonb)));
end $$;
-- Your own speech minutes (Settings → Voice)
create or replace function public.stt_my_usage() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('calls', coalesce((select calls from stt_usage where user_id = auth.uid() and day = current_date), 0),
    'seconds', coalesce((select seconds from stt_usage where user_id = auth.uid() and day = current_date), 0), 'limit_calls', 300, 'limit_seconds', 3600,
    'resets_at', (current_date + 1)::timestamp at time zone 'UTC');
$$;

-- ============================================================ 7. redeem an order for a customer (Apoji Admin → Users → their drawer)
-- The portal looks the order up in the aARgon3 / Mexel store (publishable key, order number only) and passes its plan
-- and system config here; this checks it isn't taken and records it on their account.
create or replace function public.admin_redeem_for(p_user uuid, p_order text, p_tier text default null, p_os text default null, p_chip text default null, p_network text default null, p_service text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare oid text := upper(trim(p_order)); who uuid;
begin
  if not public.admin_has_perm('redeem') then return jsonb_build_object('success', false, 'error', 'not_allowed'); end if;
  if oid !~ '^[A-Z0-9]{4,}-[A-Z0-9]{2,}$' then return jsonb_build_object('success', false, 'error', 'bad_order'); end if;
  select user_id into who from redemptions where order_id = oid limit 1;
  if who = p_user then return jsonb_build_object('success', false, 'error', 'already_theirs'); end if;
  if who is not null then return jsonb_build_object('success', false, 'error', 'taken'); end if;
  insert into redemptions (user_id, order_id, tier, config_os, config_chip, config_network, config_service_tier) values (p_user, oid, p_tier, p_os, p_chip, p_network, p_service);
  insert into moderation_log (action, performed_by, target_user_id, details) values ('order_redeemed_for', auth.uid(), p_user, jsonb_build_object('order', oid, 'tier', p_tier));
  return jsonb_build_object('success', true, 'order', oid);
end $$;

-- ============================================================ 8. Axiom's cage: wear and tear
-- Once the drivers are 2 days old the walls wear down on their own: integrity −1 every 2 hours and the security
-- level drops one step a day (not below 1). A lockdown or the cage being down pauses it; a driver update stops it
-- (and the clock starts again). Milestones are written to the log.
alter table public.apex_cage add column if not exists worn_at timestamptz;          -- integrity wear counted up to here
alter table public.apex_cage add column if not exists level_worn_at timestamptz;    -- security-level wear counted up to here
create or replace function public.apex_cage_now()
returns public.apex_cage language plpgsql security definer set search_path = public as $$
declare c public.apex_cage; start timestamptz; since timestamptz; lsince timestamptz; steps int; lsteps int; before_i int; before_l int;
begin
  select * into c from public.apex_cage where id = 1 for update;
  if c.update_done_at is not null and c.update_done_at <= now() then
    update public.apex_cage set driver_version = coalesce(update_to, driver_version), driver_installed_at = update_done_at, update_to = null, update_started_at = null, update_done_at = null,
      integrity = least(100, integrity + 25), worn_at = null, level_worn_at = null, updated_at = now() where id = 1 returning * into c;
    insert into public.apex_cage_events (kind, title, detail) values ('update', 'Drivers updated to ' || c.driver_version, 'The warden protocol is running the new drivers. Known weak spots are closed and the wear stops.');
  end if;
  -- wear and tear (paused while he's out, the cage is down, or locked down)
  start := c.driver_installed_at + interval '2 days';
  if c.escaped_at is null and not c.down and (c.lockdown_until is null or c.lockdown_until <= now()) and now() >= start then
    since := greatest(coalesce(c.worn_at, start), coalesce(c.lockdown_until, '-infinity'));
    lsince := greatest(coalesce(c.level_worn_at, start), coalesce(c.lockdown_until, '-infinity'));
    steps := floor(extract(epoch from now() - since) / 7200)::int;      -- integrity: −1 every 2 hours
    lsteps := floor(extract(epoch from now() - lsince) / 86400)::int;   -- security level: −1 a day
    if steps > 0 or lsteps > 0 then
      before_i := c.integrity; before_l := c.security_level;
      update public.apex_cage set integrity = greatest(0, integrity - steps), security_level = greatest(1, security_level - lsteps),
        worn_at = since + make_interval(secs => steps * 7200), level_worn_at = lsince + make_interval(days => lsteps), updated_at = now() where id = 1 returning * into c;
      if (before_i > 75 and c.integrity <= 75) or (before_i > 50 and c.integrity <= 50) or (before_i > 25 and c.integrity <= 25) then
        insert into public.apex_cage_events (kind, title, detail) values ('note', 'Cage integrity down to ' || c.integrity || '%',
          'The drivers are ' || floor(extract(epoch from now() - c.driver_installed_at) / 86400) || ' days old and the walls are wearing down. Update the drivers to stop it.');
      end if;
      if c.security_level < before_l then
        insert into public.apex_cage_events (kind, title, detail) values ('note', 'Security level slipped to ' || c.security_level, 'Old drivers: the warden protocol is losing its grip. Update the drivers or lock the cage down.');
      end if;
    end if;
  end if;
  return c;
end $$;
revoke all on function public.apex_cage_now() from public, anon, authenticated;

-- attempts: they start getting through at 2 days old (was 3)
create or replace function public.apex_cage_record_attempt(p_title text, p_detail text, p_vector text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.apex_cage; age numeric; chance numeric; ok boolean; ev bigint; open_b int; out_ boolean := false;
begin
  c := public.apex_cage_now();
  if c.escaped_at is not null then return jsonb_build_object('success', false, 'error', 'escaped'); end if;
  age := extract(epoch from now() - c.driver_installed_at) / 86400.0;
  chance := case when c.down then 0.0 when c.lockdown_until > now() then 0.02 else least(0.85, greatest(0.03, (age - 2) * 0.12 + (5 - c.security_level) * 0.06 + (100 - c.integrity) * 0.002)) end;
  if c.update_done_at is not null then chance := chance * 0.5; end if;
  ok := random() < chance;
  insert into public.apex_cage_events (kind, title, detail, vector, succeeded) values ('attempt', left(p_title, 160), left(p_detail, 4000), left(coalesce(p_vector, ''), 60), ok) returning id into ev;
  if ok then
    insert into public.apex_cage_events (kind, title, detail, vector) values ('breach', 'Breach: ' || left(p_title, 150), 'Attempt #' || ev || ' got through ' || coalesce(p_vector, 'a weak spot') || '. Patch it, update the drivers, or lock the cage down.', left(coalesce(p_vector, ''), 60));
    update public.apex_cage set integrity = greatest(0, integrity - 12 - floor(random() * 10)::int), updated_at = now() where id = 1 returning * into c;
    select count(*) into open_b from public.apex_cage_events where kind = 'breach' and resolved_at is null;
    if (c.integrity <= 30 or open_b >= 2) and random() < 0.6 then
      perform public.apex_cage_escape(ev, p_vector); out_ := true;
    end if;
  end if;
  return jsonb_build_object('success', true, 'id', ev, 'succeeded', ok, 'escaped', out_, 'chance', round(chance, 2));
end $$;
revoke all on function public.apex_cage_record_attempt(text, text, text) from public, anon, authenticated;
grant execute on function public.apex_cage_record_attempt(text, text, text) to service_role;

-- the cage view: outdated at 2 days, plus the wear, the odds of the next attempt, and what to do
create or replace function public.apex_cage_view(p_events int default 40)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare c public.apex_cage; age numeric; chance numeric; wearing boolean;
begin
  if public.get_my_admin_level() is distinct from 'high-admin' and not public.apex_can_manage() then return jsonb_build_object('success', false, 'error', 'not_allowed'); end if;
  c := public.apex_cage_now();
  age := extract(epoch from now() - c.driver_installed_at) / 86400.0;
  wearing := c.escaped_at is null and not c.down and (c.lockdown_until is null or c.lockdown_until <= now()) and age >= 2;
  chance := case when c.down or c.escaped_at is not null then 0.0 when c.lockdown_until > now() then 0.02 else least(0.85, greatest(0.03, (age - 2) * 0.12 + (5 - c.security_level) * 0.06 + (100 - c.integrity) * 0.002)) end;
  if c.update_done_at is not null then chance := chance * 0.5; end if;
  return jsonb_build_object('success', true, 'manage', public.apex_can_manage(),
    'cage', to_jsonb(c) - 'saved_offline_until' - 'saved_offline_message' || jsonb_build_object('driver_age_days', round(age, 1), 'outdated', age >= 2, 'lockdown', c.lockdown_until is not null and c.lockdown_until > now(),
      'escaped', c.escaped_at is not null, 'wearing', wearing, 'wear_starts_at', c.driver_installed_at + interval '2 days',
      'next_wear_at', case when wearing then greatest(coalesce(c.worn_at, c.driver_installed_at + interval '2 days'), coalesce(c.lockdown_until, '-infinity')) + interval '2 hours' end,
      'attempt_chance', round(chance, 2),
      'capture_wait', case when c.last_capture_try > now() - interval '10 minutes' then ceil(extract(epoch from c.last_capture_try + interval '10 minutes' - now())) end,
      'open_breaches', (select count(*) from public.apex_cage_events where kind = 'breach' and resolved_at is null)),
    'events', (select coalesce(jsonb_agg(to_jsonb(e) - 'by' || jsonb_build_object('by_email', u.email) order by e.created_at desc), '[]'::jsonb)
      from (select * from public.apex_cage_events where kind <> 'sighting' order by created_at desc limit greatest(1, least(p_events, 200))) e left join auth.users u on u.id = e.by),
    'integrity_days', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'attempts', a, 'breaches', b) order by d), '[]'::jsonb)
      from (select created_at::date d, count(*) filter (where kind = 'attempt') a, count(*) filter (where kind = 'breach') b from public.apex_cage_events where created_at > now() - interval '14 days' group by 1) x),
    'attempts_week', (select count(*) from public.apex_cage_events where kind = 'attempt' and created_at > now() - interval '7 days'),
    'breaches_week', (select count(*) from public.apex_cage_events where kind = 'breach' and created_at > now() - interval '7 days'));
end $$;
create or replace function public.apex_cage_report()
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.apex_cage; age numeric;
begin
  if not (exists (select 1 from public.apex_allowed where user_id = auth.uid()) or exists (select 1 from public.apex_unlimited where user_id = auth.uid()) or public.apex_can_manage()) then return null; end if;
  c := public.apex_cage_now();
  age := extract(epoch from now() - c.driver_installed_at) / 86400.0;
  return jsonb_build_object('driver', c.driver_version, 'driver_age_days', round(age, 1), 'outdated', age >= 2, 'updating', c.update_done_at is not null, 'integrity', c.integrity,
    'security_level', c.security_level, 'lockdown', c.lockdown_until is not null and c.lockdown_until > now(), 'down', c.down,
    'wearing', not c.down and age >= 2 and (c.lockdown_until is null or c.lockdown_until <= now()),
    'escapes', c.escapes, 'captured_at', c.captured_at,
    'open_breaches', (select count(*) from public.apex_cage_events where kind = 'breach' and resolved_at is null),
    'attempts', (select coalesce(jsonb_agg(jsonb_build_object('at', a.created_at, 'title', a.title, 'vector', a.vector, 'succeeded', a.succeeded) order by a.created_at desc), '[]'::jsonb)
      from (select * from public.apex_cage_events where kind = 'attempt' order by created_at desc limit 6) a));
end $$;

-- ============================================================ 9. the 3.7 beta features are for everyone now
update public.feature_flags set stage = 'all', updated_at = now() where key in ('second_look', 'branch_chat', 'incognito', 'clip_chips', 'spend_tracker') and stage <> 'off';
insert into public.feature_flags (key, stage, title, description, min_version) values
  ('smart_topics', 'beta', 'Smarter topics', 'Nexus sorts your chats into topics for the mind map, instead of matching words.', '3.10.0'),
  ('ask_map', 'beta', 'Ask the map', 'Ask Nexus about a branch of your mind map: "What have I been working on in School?"', '3.10.0'),
  ('continue_on', 'beta', 'Continue on my other computer', 'Send the chat you have open to your other Mac or PC in one click.', '3.10.0')
on conflict (key) do nothing;

-- ============================================================ 10. terms
create table if not exists public.terms_acceptance (
  user_id uuid not null references auth.users(id) on delete cascade,
  version text not null check (char_length(version) <= 20),
  surface text not null default '' check (char_length(surface) <= 20),
  accepted_at timestamptz not null default now(),
  primary key (user_id, version)
);
alter table public.terms_acceptance enable row level security;
drop policy if exists terms_acceptance_read on public.terms_acceptance;
create policy terms_acceptance_read on public.terms_acceptance for select using (user_id = auth.uid() or public.is_admin());
create or replace function public.terms_accept(p_version text, p_surface text default '') returns jsonb
language sql security definer set search_path = public as $$
  insert into terms_acceptance (user_id, version, surface) values (auth.uid(), left(p_version, 20), left(coalesce(p_surface, ''), 20)) on conflict do nothing;
  select jsonb_build_object('ok', auth.uid() is not null);
$$;
create or replace function public.admin_terms_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not public.is_admin() then null else coalesce((select jsonb_agg(jsonb_build_object('version', version, 'people', n, 'last', last) order by version desc)
    from (select version, count(*) n, max(accepted_at) last from terms_acceptance group by version) x), '[]'::jsonb) end;
$$;

-- ============================================================ grants
do $$ declare f text; begin
  foreach f in array array['training_can_push(uuid)', 'training_stage_ok(bigint, uuid)', 'training_up_rate(timestamptz, timestamptz)', 'admin_training_push(text, text, bigint[], text)',
    'admin_training_promote(bigint, text)', 'admin_training_undo(bigint)', 'admin_training_pushes()', 'training_news()', 'admin_testers()', 'admin_assign_tests(bigint[], uuid[])',
    'admin_release_gate(text)', 'admin_free_usage()', 'stt_my_usage()', 'admin_redeem_for(uuid, text, text, text, text, text, text)', 'terms_accept(text, text)', 'admin_terms_stats()',
    'training_set_consent(boolean)', 'training_my_status()', 'training_lessons(text, text, int)', 'training_rules(text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

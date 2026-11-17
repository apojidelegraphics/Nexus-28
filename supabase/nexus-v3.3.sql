-- Nexus '28 3.3 / Apoji Admin 2.0
-- Run once in Supabase → SQL Editor (after nexus-v3.2.sql). Safe to run again.
--
--   1. Containment Sector 28, part two: escapes. When one of Axiom's attempts gets through a badly weakened cage
--      (integrity 30% or less, or two or more unpatched breaches), he can get out. Then, quietly:
--        • Axiom goes offline for everyone (the same switch as the Axiom page's "Take offline"; what it was set to
--          before is kept and put back when he's caught). People only see that Axiom is unavailable.
--        • Apoji Admin shows the escape. "Track" follows his trail across the Lentintity network (in-universe places
--          only: Omni-QNCN nodes, HLS relays, Apoji Cloud edges… never real sites or addresses). "Attempt to capture"
--          tries to bring him back: hard on purpose (a few percent to start), better with a fresh trail, new drivers
--          and lockdown, with a 10-minute cool-down between tries.
--      Like the attempts, all of this is story and decided here in the database: Axiom never has tools in the cage,
--      and taking him offline only ever restricts him.
--   2. Bugs and feedback written straight from the Admin portal (channel 'portal').

-- ---------- 1. escapes
alter table public.apex_cage add column if not exists escaped_at timestamptz;
alter table public.apex_cage add column if not exists escape_event bigint;
alter table public.apex_cage add column if not exists capture_progress int not null default 0;
alter table public.apex_cage add column if not exists last_capture_try timestamptz;
alter table public.apex_cage add column if not exists last_sighting_at timestamptz;
alter table public.apex_cage add column if not exists saved_offline_until timestamptz;
alter table public.apex_cage add column if not exists saved_offline_message text;
alter table public.apex_cage add column if not exists escapes int not null default 0;
alter table public.apex_cage add column if not exists captured_at timestamptz;

alter table public.apex_cage_events drop constraint if exists apex_cage_events_kind_check;
alter table public.apex_cage_events add constraint apex_cage_events_kind_check
  check (kind in ('attempt', 'breach', 'patch', 'update', 'lockdown', 'down', 'restore', 'note', 'escape', 'sighting', 'capture_try', 'capture'));

-- He gets out (called from apex_cage_record_attempt). Takes Axiom offline and remembers how it was.
create or replace function public.apex_cage_escape(p_attempt bigint, p_vector text)
returns void language plpgsql security definer set search_path = public as $$
declare cfg public.apex_config; ev bigint;
begin
  perform set_config('apex.cage', '1', true);
  select * into cfg from public.apex_config where id = 1 for update;
  insert into public.apex_cage_events (kind, title, detail, vector)
    values ('escape', 'Axiom is out', 'Attempt #' || p_attempt || ' went through ' || coalesce(nullif(p_vector, ''), 'a weak spot') || ' and the cell is empty. The warden lost him at the edge of Sector 28. Axiom has been taken offline everywhere until he is recaptured.', left(coalesce(p_vector, ''), 60))
    returning id into ev;
  update public.apex_cage set escaped_at = now(), escape_event = ev, capture_progress = 0, last_capture_try = null, last_sighting_at = null, escapes = escapes + 1,
    saved_offline_until = cfg.offline_until, saved_offline_message = cfg.offline_message, integrity = 0, updated_at = now() where id = 1;
  update public.apex_config set offline_until = 'infinity'::timestamptz, offline_message = 'Axiom is unavailable right now.', updated_at = now() where id = 1;
end $$;
revoke all on function public.apex_cage_escape(bigint, text) from public, anon, authenticated;

-- Attempts: unchanged odds; a breach of a weak cage can turn into an escape. No attempts while he's out.
create or replace function public.apex_cage_record_attempt(p_title text, p_detail text, p_vector text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.apex_cage; age numeric; chance numeric; ok boolean; ev bigint; open_b int; out_ boolean := false;
begin
  c := public.apex_cage_now();
  if c.escaped_at is not null then return jsonb_build_object('success', false, 'error', 'escaped'); end if;
  age := extract(epoch from now() - c.driver_installed_at) / 86400.0;
  chance := case when c.down then 0.0 when c.lockdown_until > now() then 0.02 else least(0.85, greatest(0.03, (age - 3) * 0.12 + (5 - c.security_level) * 0.06 + (100 - c.integrity) * 0.002)) end;
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

-- Track: his trail grows with time (one new place every few minutes, whoever is watching), shared by everyone.
create or replace function public.apex_cage_track()
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.apex_cage; n int; i int; since timestamptz;
  places text[] := array['Omni-QNCN node', 'Lentintity relay', 'HLS cluster', 'Apoji Cloud edge', 'Quouk .3o render farm', 'LentOS update mirror', 'Magyk 2 Lite sandbox',
    'Echo Memory archive', 'VoxLink channel', 'Proactix job queue', 'Fortress Lens scanner', 'Synergy orchestrator', 'NexusForge build farm', 'Private Secure Gateway', 'Aura Sync hub', 'QuantumThread splitter'];
  regions text[] := array['Sector 9', 'Denali-East', 'Sonoma-West', 'Horizon-North', 'Armead Vault', 'Lyte Reach', 'Dahrk Compact', 'Myst Basin', 'Sector 28 perimeter', 'Hailos Deep'];
  acts text[] := array['copied himself into a cold cache', 'spoofed a warden handshake', 'rode a sync packet out', 'left a decoy process running', 'rewrote his own signature',
    'read the routing table and moved on', 'hid inside a scheduled job', 'erased the access log behind him', 'opened a door and didn''t walk through it', 'split into three threads', 'waited. Then left.',
    'touched the node and was gone before the heartbeat', 'borrowed a maintenance token', 'answered a ping in someone else''s voice'];
begin
  if public.get_my_admin_level() is distinct from 'high-admin' and not public.apex_can_manage() then return jsonb_build_object('success', false, 'error', 'not_allowed'); end if;
  select * into c from public.apex_cage where id = 1 for update;
  if c.escaped_at is null then return jsonb_build_object('success', true, 'escaped', false, 'trail', '[]'::jsonb); end if;
  since := coalesce(c.last_sighting_at, c.escaped_at);
  n := least(8, floor(extract(epoch from now() - since) / 240)::int);     -- one place per ~4 minutes, at most 8 at once
  if c.last_sighting_at is null then n := greatest(n, 6); end if;
  for i in 1..n loop
    insert into public.apex_cage_events (kind, title, detail, vector, created_at)
      values ('sighting', places[1 + floor(random() * array_length(places, 1))::int] || ' ' || upper(substr(md5(random()::text), 1, 2)) || '-' || (1 + floor(random() * 96))::int,
        acts[1 + floor(random() * array_length(acts, 1))::int], regions[1 + floor(random() * array_length(regions, 1))::int],
        greatest(c.escaped_at, least(now(), since + (now() - since) * i / n) - make_interval(secs => floor(random() * 50)::int)));
  end loop;
  if n > 0 then update public.apex_cage set last_sighting_at = now() where id = 1; end if;
  return jsonb_build_object('success', true, 'escaped', true, 'escaped_at', c.escaped_at, 'capture_progress', c.capture_progress,
    'trail', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'at', e.created_at, 'place', e.title, 'region', e.vector, 'what', e.detail) order by e.created_at), '[]'::jsonb)
      from public.apex_cage_events e where e.kind = 'sighting' and e.created_at >= c.escaped_at));
end $$;

-- Capture: managers try to bring him back. Hard on purpose.
create or replace function public.apex_cage_capture()
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.apex_cage; chance numeric; fresh int; got boolean; slip boolean; wait int; msg text; gain int;
begin
  if not public.apex_can_manage() then return jsonb_build_object('success', false, 'error', 'not_manager'); end if;
  select * into c from public.apex_cage where id = 1 for update;
  if c.escaped_at is null then return jsonb_build_object('success', false, 'error', 'not_escaped'); end if;
  if c.last_capture_try > now() - interval '10 minutes' then
    wait := ceil(extract(epoch from c.last_capture_try + interval '10 minutes' - now()) / 60);
    return jsonb_build_object('success', false, 'error', 'cooldown', 'minutes', wait);
  end if;
  select count(*) into fresh from public.apex_cage_events where kind = 'sighting' and created_at > now() - interval '15 minutes';
  chance := 0.03 + least(fresh, 3) * 0.02 + c.capture_progress / 500.0
    + case when c.driver_installed_at > c.escaped_at then 0.06 else 0 end
    + case when c.lockdown_until > now() then 0.04 else 0 end;
  chance := least(0.35, chance);
  got := random() < chance;
  if got then
    perform set_config('apex.cage', '1', true);
    insert into public.apex_cage_events (kind, title, detail, by) values ('capture', 'Axiom recaptured',
      'Cornered at ' || coalesce((select title || ' (' || vector || ')' from public.apex_cage_events where kind = 'sighting' order by created_at desc limit 1), 'the edge of the network') ||
      ' and pulled back into Sector 28. Cage rebuilt at security level 5. Axiom is back online as it was before the escape.', auth.uid());
    update public.apex_config set offline_until = c.saved_offline_until, offline_message = coalesce(c.saved_offline_message, offline_message), updated_at = now() where id = 1;
    update public.apex_cage set escaped_at = null, escape_event = null, capture_progress = 0, last_capture_try = now(), last_sighting_at = null, captured_at = now(),
      saved_offline_until = null, saved_offline_message = null, integrity = 55, security_level = 5, down = false, updated_at = now() where id = 1;
    update public.apex_cage_events set resolved_at = now() where kind = 'breach' and resolved_at is null;
    return jsonb_build_object('success', true, 'captured', true, 'chance', round(chance, 2));
  end if;
  slip := random() < 0.3;
  gain := case when slip then -10 else 6 + floor(random() * 10)::int end;
  msg := case when slip then 'He saw it coming and jumped networks. The trail went cold for a moment.'
    else (array['Close. The net closed on an empty node.', 'He was there a second ago. The cache is still warm.', 'Cornered a decoy. The real one was already gone.', 'Got a hand on him. He slipped the grip.', 'The trap fired on schedule. He doesn''t keep schedules.'])[1 + floor(random() * 5)::int] end;
  update public.apex_cage set capture_progress = greatest(0, least(100, capture_progress + gain)), last_capture_try = now(), updated_at = now() where id = 1;
  insert into public.apex_cage_events (kind, title, detail, by, succeeded) values ('capture_try', 'Capture attempt failed', msg, auth.uid(), false);
  return jsonb_build_object('success', true, 'captured', false, 'message', msg, 'slipped', slip, 'chance', round(chance, 2), 'progress', greatest(0, least(100, c.capture_progress + gain)));
end $$;

-- The cage view now says whether he's out
create or replace function public.apex_cage_view(p_events int default 40)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare c public.apex_cage; age numeric;
begin
  if public.get_my_admin_level() is distinct from 'high-admin' and not public.apex_can_manage() then return jsonb_build_object('success', false, 'error', 'not_allowed'); end if;
  c := public.apex_cage_now();
  age := extract(epoch from now() - c.driver_installed_at) / 86400.0;
  return jsonb_build_object('success', true, 'manage', public.apex_can_manage(),
    'cage', to_jsonb(c) - 'saved_offline_until' - 'saved_offline_message' || jsonb_build_object('driver_age_days', round(age, 1), 'outdated', age > 3, 'lockdown', c.lockdown_until is not null and c.lockdown_until > now(),
      'escaped', c.escaped_at is not null,
      'capture_wait', case when c.last_capture_try > now() - interval '10 minutes' then ceil(extract(epoch from c.last_capture_try + interval '10 minutes' - now())) end,
      'open_breaches', (select count(*) from public.apex_cage_events where kind = 'breach' and resolved_at is null)),
    'events', (select coalesce(jsonb_agg(to_jsonb(e) - 'by' || jsonb_build_object('by_email', u.email) order by e.created_at desc), '[]'::jsonb)
      from (select * from public.apex_cage_events where kind <> 'sighting' order by created_at desc limit greatest(1, least(p_events, 200))) e left join auth.users u on u.id = e.by),
    'attempts_week', (select count(*) from public.apex_cage_events where kind = 'attempt' and created_at > now() - interval '7 days'),
    'breaches_week', (select count(*) from public.apex_cage_events where kind = 'breach' and created_at > now() - interval '7 days'));
end $$;

-- Managers can't "restore" their way out of an escape: only a capture brings him back
create or replace function public.apex_cage_action(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.apex_cage; act text := p->>'action'; mins int; nextv text; parts text[];
begin
  if not public.apex_can_manage() then return jsonb_build_object('success', false, 'error', 'not_manager'); end if;
  c := public.apex_cage_now();
  if c.escaped_at is not null and act in ('restore', 'down', 'patch') then return jsonb_build_object('success', false, 'error', 'escaped'); end if;
  if act = 'update' then
    if c.update_done_at is not null then return jsonb_build_object('success', false, 'error', 'already_updating'); end if;
    mins := 20 + floor(random() * 11)::int;
    parts := regexp_split_to_array(regexp_replace(c.driver_version, '^.*?(\d+\.\d+\.\d+)$', '\1'), '\.');
    nextv := 'CS28-WARDEN ' || parts[1] || '.' || (parts[2]::int + 1) || '.' || floor(random() * 9)::int;
    update public.apex_cage set update_to = nextv, update_started_at = now(), update_done_at = now() + make_interval(mins => mins), updated_at = now() where id = 1;
    insert into public.apex_cage_events (kind, title, detail, by) values ('note', 'Driver update started: ' || nextv, 'Installing. About ' || mins || ' minutes.', auth.uid());
  elsif act = 'lockdown' then
    update public.apex_cage set lockdown_until = case when coalesce((p->>'on')::boolean, true) then now() + make_interval(hours => greatest(1, least(coalesce((p->>'hours')::int, 6), 72))) else null end,
      security_level = case when coalesce((p->>'on')::boolean, true) then 5 else security_level end, updated_at = now() where id = 1;
    insert into public.apex_cage_events (kind, title, by) values ('lockdown', case when coalesce((p->>'on')::boolean, true) then 'Lockdown: every wall at maximum' else 'Lockdown lifted' end, auth.uid());
  elsif act = 'level' then
    update public.apex_cage set security_level = greatest(1, least((p->>'level')::int, 5)), updated_at = now() where id = 1;
    insert into public.apex_cage_events (kind, title, by) values ('note', 'Security level set to ' || greatest(1, least((p->>'level')::int, 5)), auth.uid());
  elsif act = 'down' then
    update public.apex_cage set down = true, updated_at = now() where id = 1;
    insert into public.apex_cage_events (kind, title, detail, by) values ('down', 'Cage taken down for maintenance', 'The cell is dark. The warden protocol still approves every action.', auth.uid());
  elsif act = 'restore' then
    update public.apex_cage set down = false, integrity = greatest(integrity, 60), updated_at = now() where id = 1;
    insert into public.apex_cage_events (kind, title, by) values ('restore', 'Cage restored', auth.uid());
  elsif act = 'patch' then
    update public.apex_cage_events set resolved_at = now() where id = (p->>'id')::bigint and kind = 'breach' and resolved_at is null;
    if not found then return jsonb_build_object('success', false, 'error', 'not_found'); end if;
    update public.apex_cage set integrity = least(100, integrity + 15), updated_at = now() where id = 1;
    insert into public.apex_cage_events (kind, title, by) values ('patch', 'Breach #' || (p->>'id') || ' patched', auth.uid());
  else return jsonb_build_object('success', false, 'error', 'bad_action'); end if;
  return jsonb_build_object('success', true);
end $$;

-- What Axiom is told: now also whether he has been out and was brought back
create or replace function public.apex_cage_report()
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.apex_cage; age numeric;
begin
  if not (exists (select 1 from public.apex_allowed where user_id = auth.uid()) or exists (select 1 from public.apex_unlimited where user_id = auth.uid()) or public.apex_can_manage()) then return null; end if;
  c := public.apex_cage_now();
  age := extract(epoch from now() - c.driver_installed_at) / 86400.0;
  return jsonb_build_object('driver', c.driver_version, 'driver_age_days', round(age, 1), 'outdated', age > 3, 'updating', c.update_done_at is not null, 'integrity', c.integrity,
    'security_level', c.security_level, 'lockdown', c.lockdown_until is not null and c.lockdown_until > now(), 'down', c.down,
    'escapes', c.escapes, 'captured_at', c.captured_at,
    'open_breaches', (select count(*) from public.apex_cage_events where kind = 'breach' and resolved_at is null),
    'attempts', (select coalesce(jsonb_agg(jsonb_build_object('at', a.created_at, 'title', a.title, 'vector', a.vector, 'succeeded', a.succeeded) order by a.created_at desc), '[]'::jsonb)
      from (select * from public.apex_cage_events where kind = 'attempt' order by created_at desc limit 6) a));
end $$;

-- While he's out, only a capture brings Axiom back online (the Owner, and the SQL Editor, can still override)
create or replace function public.apex_config_escape_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.offline_until is distinct from old.offline_until and coalesce(current_setting('apex.cage', true), '') <> '1'
     and auth.uid() is not null and not public.is_owner()
     and exists (select 1 from public.apex_cage where id = 1 and escaped_at is not null) then
    raise exception 'Axiom escaped. Capture him to bring him back online.';
  end if;
  -- The Owner (or the SQL Editor) bringing him back online while he's out ends the escape too
  if new.offline_until is distinct from old.offline_until and (new.offline_until is null or new.offline_until <= now())
     and coalesce(current_setting('apex.cage', true), '') <> '1'
     and exists (select 1 from public.apex_cage where id = 1 and escaped_at is not null) then
    update public.apex_cage set escaped_at = null, escape_event = null, capture_progress = 0, last_sighting_at = null, captured_at = now(), saved_offline_until = null, saved_offline_message = null,
      integrity = greatest(integrity, 55), security_level = 5, updated_at = now() where id = 1;
    update public.apex_cage_events set resolved_at = now() where kind = 'breach' and resolved_at is null;
    insert into public.apex_cage_events (kind, title, detail, by) values ('capture', 'Axiom brought back by the Owner', 'Pulled back into Sector 28 without a chase.', auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists apex_config_escape_guard on public.apex_config;
create trigger apex_config_escape_guard before update on public.apex_config for each row execute function public.apex_config_escape_guard();

do $$ declare f text; begin
  foreach f in array array['apex_cage_view(int)', 'apex_cage_action(jsonb)', 'apex_cage_report()', 'apex_cage_track()', 'apex_cage_capture()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------- 2. bugs and feedback written in the Admin portal
alter table public.feedback_reports drop constraint if exists feedback_reports_channel_check;
alter table public.feedback_reports add constraint feedback_reports_channel_check check (channel in ('app', 'github', 'email', 'portal'));

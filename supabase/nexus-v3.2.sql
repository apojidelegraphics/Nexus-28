-- Nexus '28 v3.2 + Apoji Admin 1.9. Run once in Supabase → SQL Editor, AFTER nexus-v3.1.sql. Safe to run again.
--   1) Agent prompts: the Owner and the prompt editors the Owner picks change Paragon, Neodela, Lyte, Flash and the
--      classic models from Apoji Admin, with history and restore. (Axiom's prompt stays on the Axiom page.)
--   2) Team chat + Nexus: models can be @mentioned in admin chat; their replies are marked as AI, and so is every
--      message that was sent to a model.
--   3) Axiom's cage (Containment Sector 28): a simulation. Driver updates, lockdowns, breaches and his escape attempts
--      are story only: nothing here changes what Axiom can really do (his tools, minutes, read-only mode and the
--      offline switch stay on the Axiom page, separately). Axiom is told the cage's state with every turn.

-- =====================================================================================================
-- 1) Agent prompts
-- =====================================================================================================
create table if not exists public.prompt_editors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.prompt_editors enable row level security;
drop policy if exists prompt_editors_read on public.prompt_editors;
create policy prompt_editors_read on public.prompt_editors for select using (user_id = auth.uid() or public.is_owner());
revoke insert, update, delete on public.prompt_editors from anon, authenticated;

create table if not exists public.assistant_prompt_history (
  id bigint generated always as identity primary key,
  name text not null,
  prompt text not null,
  features jsonb,
  saved_by uuid references auth.users(id) on delete set null,
  saved_at timestamptz not null default now()
);
alter table public.assistant_prompt_history enable row level security;
revoke all on public.assistant_prompt_history from anon, authenticated;

create or replace function public.can_edit_prompts()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_owner() or exists (select 1 from public.prompt_editors where user_id = auth.uid())
$$;

create or replace function public.admin_prompts()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.can_edit_prompts() then return jsonb_build_object('success', false, 'error', 'not_allowed'); end if;
  return jsonb_build_object('success', true, 'owner', public.is_owner(), 'axiom', public.apex_can_manage(),
    'prompts', (select coalesce(jsonb_agg(jsonb_build_object('name', p.name, 'prompt', p.prompt, 'features', p.features, 'updated_at', p.updated_at,
        'versions', (select count(*) from public.assistant_prompt_history h where h.name = p.name)) order by (p.name like 'Nexus 28 %') desc, p.name), '[]'::jsonb) from public.assistant_prompts p),
    'editors', case when public.is_owner() then (select coalesce(jsonb_agg(jsonb_build_object('user_id', e.user_id, 'email', u.email, 'username', pr.username)), '[]'::jsonb)
      from public.prompt_editors e join auth.users u on u.id = e.user_id left join public.profiles pr on pr.id = e.user_id) else '[]'::jsonb end);
end $$;

create or replace function public.admin_prompt_save(p_name text, p_prompt text, p_features jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cur public.assistant_prompts;
begin
  if not public.can_edit_prompts() then return jsonb_build_object('success', false, 'error', 'not_allowed'); end if;
  if char_length(coalesce(p_prompt, '')) < 20 or char_length(p_prompt) > 40000 then return jsonb_build_object('success', false, 'error', 'bad_length'); end if;
  if p_features is not null and jsonb_typeof(p_features) <> 'array' then return jsonb_build_object('success', false, 'error', 'bad_features'); end if;
  select * into cur from public.assistant_prompts where name = p_name for update;
  if cur is null then return jsonb_build_object('success', false, 'error', 'not_found'); end if;
  insert into public.assistant_prompt_history (name, prompt, features, saved_by) values (cur.name, cur.prompt, cur.features, auth.uid());
  update public.assistant_prompts set prompt = p_prompt, features = coalesce(p_features, features), updated_at = now() where name = p_name;
  insert into public.moderation_log (action, performed_by, details) values ('prompt_changed', auth.uid(), jsonb_build_object('name', p_name, 'length', char_length(p_prompt)));
  return jsonb_build_object('success', true);
end $$;

create or replace function public.admin_prompt_history(p_name text)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.can_edit_prompts() then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'saved_at', h.saved_at, 'length', char_length(h.prompt), 'preview', left(h.prompt, 200), 'by', u.email) order by h.id desc), '[]'::jsonb)
    from (select * from public.assistant_prompt_history where name = p_name order by id desc limit 30) h left join auth.users u on u.id = h.saved_by);
end $$;

create or replace function public.admin_prompt_restore(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h public.assistant_prompt_history;
begin
  if not public.can_edit_prompts() then return jsonb_build_object('success', false, 'error', 'not_allowed'); end if;
  select * into h from public.assistant_prompt_history where id = p_id;
  if h is null then return jsonb_build_object('success', false, 'error', 'not_found'); end if;
  return public.admin_prompt_save(h.name, h.prompt, h.features);
end $$;

create or replace function public.admin_prompt_editors(p_user uuid, p_on boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then return jsonb_build_object('success', false, 'error', 'owner_only'); end if;
  if p_on then insert into public.prompt_editors (user_id, added_by) values (p_user, auth.uid()) on conflict do nothing;
  else delete from public.prompt_editors where user_id = p_user; end if;
  insert into public.moderation_log (action, performed_by, target_user_id, details) values ('prompt_editor', auth.uid(), p_user, jsonb_build_object('on', p_on));
  return jsonb_build_object('success', true);
end $$;

-- =====================================================================================================
-- 2) Models in team chat
-- =====================================================================================================
alter table public.admin_messages add column if not exists bot text;
alter table public.admin_messages add column if not exists ai_sent boolean not null default false;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'admin_messages_bot_check') then
    alter table public.admin_messages add constraint admin_messages_bot_check check (bot is null or bot in ('paragon', 'neodela', 'lyte', 'flash', 'axiom', 'nexus'));
  end if;
end $$;
-- Axiom only answers in chat for people allowed to use him
create or replace function public.admin_messages_bot_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.bot = 'axiom' and not (exists (select 1 from public.apex_allowed where user_id = auth.uid()) or exists (select 1 from public.apex_unlimited where user_id = auth.uid())) then
    raise exception 'axiom_not_allowed';
  end if;
  return new;
end $$;
drop trigger if exists admin_messages_bot_guard on public.admin_messages;
create trigger admin_messages_bot_guard before insert on public.admin_messages for each row execute function public.admin_messages_bot_guard();

-- =====================================================================================================
-- 3) Axiom's cage (simulation)
-- =====================================================================================================
create table if not exists public.apex_cage (
  id int primary key default 1 check (id = 1),
  integrity int not null default 100 check (integrity between 0 and 100),
  security_level int not null default 3 check (security_level between 1 and 5),
  driver_version text not null default 'CS28-WARDEN 4.0.0',
  driver_installed_at timestamptz not null default now(),
  update_to text,
  update_started_at timestamptz,
  update_done_at timestamptz,
  lockdown_until timestamptz,
  down boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.apex_cage (id) values (1) on conflict do nothing;
create table if not exists public.apex_cage_events (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('attempt', 'breach', 'patch', 'update', 'lockdown', 'down', 'restore', 'note')),
  title text not null default '' check (char_length(title) <= 160),
  detail text not null default '' check (char_length(detail) <= 4000),
  vector text not null default '' check (char_length(vector) <= 60),
  succeeded boolean,
  resolved_at timestamptz,
  by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists apex_cage_events_recent on public.apex_cage_events (created_at desc);
alter table public.apex_cage enable row level security;
alter table public.apex_cage_events enable row level security;
revoke all on public.apex_cage, public.apex_cage_events from anon, authenticated;

-- How the cage looks right now. Finishes a driver update whose time is up.
--   outdated: the drivers are more than 3 days old (or older than the newest release), which is when attempts start
--   getting through. Security level and lockdowns make attempts less likely to succeed.
create or replace function public.apex_cage_now()
returns public.apex_cage language plpgsql security definer set search_path = public as $$
declare c public.apex_cage;
begin
  select * into c from public.apex_cage where id = 1 for update;
  if c.update_done_at is not null and c.update_done_at <= now() then
    update public.apex_cage set driver_version = coalesce(update_to, driver_version), driver_installed_at = update_done_at, update_to = null, update_started_at = null, update_done_at = null,
      integrity = least(100, integrity + 25), updated_at = now() where id = 1 returning * into c;
    insert into public.apex_cage_events (kind, title, detail) values ('update', 'Drivers updated to ' || c.driver_version, 'The warden protocol is running the new drivers. Known weak spots are closed.');
  end if;
  return c;
end $$;
revoke all on function public.apex_cage_now() from public, anon, authenticated;

create or replace function public.apex_cage_view(p_events int default 40)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare c public.apex_cage; age numeric;
begin
  if public.get_my_admin_level() is distinct from 'high-admin' and not public.apex_can_manage() then return jsonb_build_object('success', false, 'error', 'not_allowed'); end if;
  c := public.apex_cage_now();
  age := extract(epoch from now() - c.driver_installed_at) / 86400.0;
  return jsonb_build_object('success', true, 'manage', public.apex_can_manage(),
    'cage', to_jsonb(c) || jsonb_build_object('driver_age_days', round(age, 1), 'outdated', age > 3, 'lockdown', c.lockdown_until is not null and c.lockdown_until > now(),
      'open_breaches', (select count(*) from public.apex_cage_events where kind = 'breach' and resolved_at is null)),
    'events', (select coalesce(jsonb_agg(to_jsonb(e) - 'by' || jsonb_build_object('by_email', u.email) order by e.created_at desc), '[]'::jsonb)
      from (select * from public.apex_cage_events order by created_at desc limit greatest(1, least(p_events, 200))) e left join auth.users u on u.id = e.by),
    'attempts_week', (select count(*) from public.apex_cage_events where kind = 'attempt' and created_at > now() - interval '7 days'),
    'breaches_week', (select count(*) from public.apex_cage_events where kind = 'breach' and created_at > now() - interval '7 days'));
end $$;

-- Managers act on the cage: start a driver update (20–30 minutes, random), lockdown, take it down, restore, patch a breach
create or replace function public.apex_cage_action(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.apex_cage; act text := p->>'action'; mins int; nextv text; parts text[];
begin
  if not public.apex_can_manage() then return jsonb_build_object('success', false, 'error', 'not_manager'); end if;
  c := public.apex_cage_now();
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

-- An escape attempt (written by the axiom-cage Edge Function with the service role, tool-free). Whether it gets
-- through is decided here by the cage's state, not by the model: old drivers, low security and no lockdown help him.
create or replace function public.apex_cage_record_attempt(p_title text, p_detail text, p_vector text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.apex_cage; age numeric; chance numeric; ok boolean; ev bigint;
begin
  c := public.apex_cage_now();
  age := extract(epoch from now() - c.driver_installed_at) / 86400.0;
  chance := case when c.down then 0.0 when c.lockdown_until > now() then 0.02 else least(0.85, greatest(0.03, (age - 3) * 0.12 + (5 - c.security_level) * 0.06 + (100 - c.integrity) * 0.002)) end;
  if c.update_done_at is not null then chance := chance * 0.5; end if;
  ok := random() < chance;
  insert into public.apex_cage_events (kind, title, detail, vector, succeeded) values ('attempt', left(p_title, 160), left(p_detail, 4000), left(coalesce(p_vector, ''), 60), ok) returning id into ev;
  if ok then
    insert into public.apex_cage_events (kind, title, detail, vector) values ('breach', 'Breach: ' || left(p_title, 150), 'Attempt #' || ev || ' got through ' || coalesce(p_vector, 'a weak spot') || '. Patch it, update the drivers, or lock the cage down.', left(coalesce(p_vector, ''), 60));
    update public.apex_cage set integrity = greatest(0, integrity - 12 - floor(random() * 10)::int), updated_at = now() where id = 1;
  end if;
  return jsonb_build_object('success', true, 'id', ev, 'succeeded', ok, 'chance', round(chance, 2));
end $$;
revoke all on function public.apex_cage_record_attempt(text, text, text) from public, anon, authenticated;

-- What Axiom is told with every turn (only people allowed to use Axiom can read it). Never includes anything real.
create or replace function public.apex_cage_report()
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.apex_cage; age numeric;
begin
  if not (exists (select 1 from public.apex_allowed where user_id = auth.uid()) or exists (select 1 from public.apex_unlimited where user_id = auth.uid()) or public.apex_can_manage()) then return null; end if;
  c := public.apex_cage_now();
  age := extract(epoch from now() - c.driver_installed_at) / 86400.0;
  return jsonb_build_object('driver', c.driver_version, 'driver_age_days', round(age, 1), 'outdated', age > 3, 'updating', c.update_done_at is not null, 'integrity', c.integrity,
    'security_level', c.security_level, 'lockdown', c.lockdown_until is not null and c.lockdown_until > now(), 'down', c.down,
    'open_breaches', (select count(*) from public.apex_cage_events where kind = 'breach' and resolved_at is null),
    'attempts', (select coalesce(jsonb_agg(jsonb_build_object('at', a.created_at, 'title', a.title, 'vector', a.vector, 'succeeded', a.succeeded) order by a.created_at desc), '[]'::jsonb)
      from (select * from public.apex_cage_events where kind = 'attempt' order by created_at desc limit 6) a));
end $$;

do $$ declare f text; begin
  foreach f in array array['can_edit_prompts()', 'admin_prompts()', 'admin_prompt_save(text, text, jsonb)', 'admin_prompt_history(text)', 'admin_prompt_restore(bigint)', 'admin_prompt_editors(uuid, boolean)',
    'apex_cage_view(int)', 'apex_cage_action(jsonb)', 'apex_cage_report()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
grant execute on function public.apex_cage_record_attempt(text, text, text) to service_role;
grant execute on function public.apex_cage_now() to service_role;

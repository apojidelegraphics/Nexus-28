-- Nexus '28 v3.1 + Apoji Admin 1.8. Run once in Supabase → SQL Editor, AFTER Apoji Admin's apoji-admin-1.7.sql.
-- Safe to run again.
--   1) Axiom: only "select people" can use it (the Owner picks them) and only the Owner and Axiom managers can
--      change its settings.
--   2) Access requests: people ask for Axiom, an early feature, beta, or something else; the Owner and Axiom
--      managers approve or deny.
--   3) Per-person feature grants (what an approved feature request turns on).
--   4) Redeemed aARgon3 / Mexel orders: see and remove them in Apoji Admin; people can un-redeem their own in Nexus.
--   5) Every report reaches the Apoji Team: which way it was sent (app, GitHub, email), and reports from people
--      who aren't signed in.

-- =====================================================================================================
-- 1) Axiom: select people + managers
-- =====================================================================================================
create table if not exists public.apex_allowed (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.apex_managers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.apex_allowed enable row level security;
alter table public.apex_managers enable row level security;
drop policy if exists apex_allowed_read on public.apex_allowed;
create policy apex_allowed_read on public.apex_allowed for select using (user_id = auth.uid() or public.get_my_admin_level() = 'high-admin');
drop policy if exists apex_managers_read on public.apex_managers;
create policy apex_managers_read on public.apex_managers for select using (user_id = auth.uid() or public.get_my_admin_level() = 'high-admin');
revoke insert, update, delete on public.apex_allowed, public.apex_managers from anon, authenticated;

-- Who may change Axiom's settings and review requests: the Owner and the managers the Owner picked
create or replace function public.apex_can_manage()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_owner() or exists (select 1 from public.apex_managers where user_id = auth.uid())
$$;

-- New stage "select": only the Owner's list (plus unlimited accounts)
alter table public.apex_config drop constraint if exists apex_config_stage_check;
alter table public.apex_config add constraint apex_config_stage_check check (stage in ('off', 'owner', 'select', 'high-admin', 'admin', 'beta', 'all'));
update public.apex_config set stage = 'select' where id = 1 and stage in ('high-admin', 'admin', 'beta', 'all');
-- Nobody is added automatically: the Owner picks people in Apoji Admin → Axiom → Select people (or approves their requests).

create or replace function public.apex_status(p_uid uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c public.apex_config; o public.apex_overrides; lvl text; unl boolean; sel boolean; beta boolean; ok boolean; used numeric; lim int; off boolean;
  wk timestamptz := date_trunc('week', now() at time zone 'utc') at time zone 'utc'; since timestamptz;
begin
  select * into c from public.apex_config where id = 1;
  if p_uid is null or c is null then return jsonb_build_object('allowed', false, 'reason', 'sign_in'); end if;
  select level into lvl from public.admin_roles where user_id = p_uid;
  select * into o from public.apex_overrides where user_id = p_uid;
  unl := exists (select 1 from public.apex_unlimited where user_id = p_uid);
  sel := exists (select 1 from public.apex_allowed where user_id = p_uid);
  select coalesce(is_beta_tester, false) into beta from public.profiles where id = p_uid;
  off := c.offline_until is not null and c.offline_until > now();
  ok := case c.stage
    when 'off' then false
    when 'owner' then unl
    when 'select' then unl or sel
    when 'high-admin' then unl or sel or lvl = 'high-admin'
    when 'admin' then unl or sel or lvl is not null
    when 'beta' then unl or sel or lvl is not null or coalesce(beta, false)
    else true end;
  ok := coalesce(ok, false) and not off and not (coalesce(o.blocked, false) and not unl);
  lim := coalesce(o.weekly_minutes, c.weekly_minutes);
  since := greatest(wk, coalesce(o.reset_at, wk));
  select coalesce(sum(seconds), 0) / 60.0 into used from public.apex_usage where user_id = p_uid and created_at >= since;
  return jsonb_build_object(
    'allowed', ok,
    'reason', case when ok then '' when off then 'offline' when c.stage = 'off' then 'off' when coalesce(o.blocked, false) then 'blocked' else 'not_yet' end,
    'notice', case when off or c.stage = 'off' then nullif(c.offline_message, '') end,
    'back_at', case when off and c.offline_until < 'infinity' then c.offline_until end,
    'stage', c.stage, 'unlimited', unl, 'selected', sel, 'admin', lvl is not null, 'level', coalesce(lvl, ''),
    'limit', case when unl then null else lim end,
    'used', round(used, 1),
    'left', case when unl then null else greatest(0, round(lim - used, 1)) end,
    'resets_at', wk + interval '7 days',
    'kits_off', to_jsonb(coalesce(c.kits_off, '{}')), 'read_only', coalesce(c.read_only, false),
    'providers', case when lvl is not null or unl then null else to_jsonb(c.public_providers) end);
end $$;
revoke all on function public.apex_status(uuid) from public, anon, authenticated;

-- Only the Owner and managers change Axiom (replaces the Editor check from 1.7)
create or replace function public.admin_apex_set(p_stage text default null, p_weekly_minutes int default null, p_providers text[] default null, p_prompt text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.apex_can_manage() then return jsonb_build_object('success', false, 'error', 'not_manager'); end if;
  -- Only these three now: nobody, just the unlimited accounts, or the people the Owner picked
  if p_stage is not null and p_stage not in ('off', 'owner', 'select') then return jsonb_build_object('success', false, 'error', 'bad_stage'); end if;
  if p_providers is not null and not (p_providers <@ array['anthropic', 'openrouter', 'openai', 'gemini', 'ollama', 'lmstudio', 'groq', 'mistral', 'xai', 'deepseek', 'together', 'fireworks', 'cerebras', 'perplexity', 'cohere', 'huggingface', 'nvidia']) then
    return jsonb_build_object('success', false, 'error', 'bad_provider'); end if;
  if p_prompt is not null then insert into public.apex_prompt_history (prompt, saved_by) select prompt, auth.uid() from public.apex_config where id = 1 and prompt <> ''; end if;
  update public.apex_config set stage = coalesce(p_stage, stage), weekly_minutes = coalesce(p_weekly_minutes, weekly_minutes),
    public_providers = coalesce(p_providers, public_providers), prompt = coalesce(p_prompt, prompt), updated_by = auth.uid(), updated_at = now() where id = 1;
  insert into public.moderation_log (action, performed_by, details)
    values ('apex_settings_changed', auth.uid(), jsonb_strip_nulls(jsonb_build_object('stage', p_stage, 'weekly_minutes', p_weekly_minutes, 'providers', p_providers, 'prompt_changed', p_prompt is not null)));
  return jsonb_build_object('success', true);
end $$;
create or replace function public.admin_apex_control(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare kits text[];
begin
  if not public.apex_can_manage() then return jsonb_build_object('success', false, 'error', 'not_manager'); end if;
  if p ? 'online' and (p->>'online')::boolean then
    update public.apex_config set offline_until = null, updated_by = auth.uid(), updated_at = now() where id = 1;
  elsif p ? 'offline' then
    update public.apex_config set offline_until = case when coalesce((p->>'offline')::int, 0) <= 0 then 'infinity'::timestamptz else now() + make_interval(mins => least((p->>'offline')::int, 60 * 24 * 60)) end,
      offline_message = left(coalesce(p->>'message', offline_message), 300), updated_by = auth.uid(), updated_at = now() where id = 1;
  end if;
  if p ? 'message' and not (p ? 'offline') then update public.apex_config set offline_message = left(p->>'message', 300) where id = 1; end if;
  if p ? 'kits_off' then
    select coalesce(array_agg(k), '{}') into kits from jsonb_array_elements_text(p->'kits_off') k where k in ('mac', 'dev', 'web', 'nexus');
    update public.apex_config set kits_off = kits, updated_by = auth.uid(), updated_at = now() where id = 1;
  end if;
  if p ? 'read_only' then update public.apex_config set read_only = (p->>'read_only')::boolean, updated_by = auth.uid(), updated_at = now() where id = 1; end if;
  insert into public.moderation_log (action, performed_by, details) values ('apex_control', auth.uid(), p);
  return jsonb_build_object('success', true);
end $$;
create or replace function public.admin_apex_user(p_user uuid, p_blocked boolean default null, p_minutes int default null, p_clear_minutes boolean default false, p_reset boolean default false, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.apex_can_manage() then return jsonb_build_object('success', false, 'error', 'not_manager'); end if;
  if public.is_owner(p_user) and not public.is_owner() then return jsonb_build_object('success', false, 'error', 'owner'); end if;
  insert into public.apex_overrides (user_id) values (p_user) on conflict (user_id) do nothing;
  update public.apex_overrides set blocked = coalesce(p_blocked, blocked),
    weekly_minutes = case when p_clear_minutes then null when p_minutes is not null then greatest(0, least(p_minutes, 10080)) else weekly_minutes end,
    reset_at = case when p_reset then now() else reset_at end, note = coalesce(left(p_note, 200), note), updated_by = auth.uid(), updated_at = now()
    where user_id = p_user;
  insert into public.moderation_log (action, performed_by, details) values ('apex_user', auth.uid(), jsonb_strip_nulls(jsonb_build_object('user', p_user, 'blocked', p_blocked, 'minutes', p_minutes, 'reset', p_reset)));
  return jsonb_build_object('success', true);
end $$;
create or replace function public.admin_apex_restore_prompt(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare old text;
begin
  if not public.apex_can_manage() then return jsonb_build_object('success', false, 'error', 'not_manager'); end if;
  select prompt into old from public.apex_prompt_history where id = p_id;
  if old is null then return jsonb_build_object('success', false, 'error', 'not_found'); end if;
  return public.admin_apex_set(null, null, null, old);
end $$;

-- The Owner picks who can use Axiom and who manages it
create or replace function public.admin_apex_people(p_user uuid, p_list text, p_on boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then return jsonb_build_object('success', false, 'error', 'owner_only'); end if;
  if p_list = 'allowed' then
    if p_on then insert into public.apex_allowed (user_id, added_by) values (p_user, auth.uid()) on conflict do nothing; else delete from public.apex_allowed where user_id = p_user; end if;
  elsif p_list = 'manager' then
    if p_on then insert into public.apex_managers (user_id, added_by) values (p_user, auth.uid()) on conflict do nothing; else delete from public.apex_managers where user_id = p_user; end if;
  else return jsonb_build_object('success', false, 'error', 'bad_list'); end if;
  insert into public.moderation_log (action, performed_by, details) values ('apex_people', auth.uid(), jsonb_build_object('user', p_user, 'list', p_list, 'on', p_on));
  return jsonb_build_object('success', true);
end $$;

-- The Axiom page for high-admins and managers (managers don't have to be high-admins)
create or replace function public.admin_apex_overview()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare wk timestamptz := date_trunc('week', now() at time zone 'utc') at time zone 'utc';
begin
  if public.get_my_admin_level() is distinct from 'high-admin' and not public.apex_can_manage() then return jsonb_build_object('success', false, 'error', 'not_high_admin'); end if;
  return jsonb_build_object('success', true, 'tier', public.my_high_tier(), 'owner', public.is_owner(), 'manage', public.apex_can_manage(),
    'config', (select to_jsonb(c) - 'prompt' || jsonb_build_object('prompt', c.prompt, 'offline', c.offline_until is not null and c.offline_until > now()) from public.apex_config c where id = 1),
    'unlimited', (select coalesce(jsonb_agg(jsonb_build_object('user_id', x.user_id, 'email', u.email, 'note', x.note)), '[]'::jsonb) from public.apex_unlimited x join auth.users u on u.id = x.user_id),
    'allowed', (select coalesce(jsonb_agg(jsonb_build_object('user_id', x.user_id, 'email', u.email, 'username', p.username, 'since', x.created_at) order by u.email), '[]'::jsonb) from public.apex_allowed x join auth.users u on u.id = x.user_id left join public.profiles p on p.id = x.user_id),
    'managers', (select coalesce(jsonb_agg(jsonb_build_object('user_id', x.user_id, 'email', u.email, 'username', p.username) order by u.email), '[]'::jsonb) from public.apex_managers x join auth.users u on u.id = x.user_id left join public.profiles p on p.id = x.user_id),
    'overrides', (select coalesce(jsonb_agg(jsonb_build_object('user_id', o.user_id, 'email', u.email, 'blocked', o.blocked, 'weekly_minutes', o.weekly_minutes, 'reset_at', o.reset_at, 'note', o.note) order by u.email), '[]'::jsonb)
      from public.apex_overrides o join auth.users u on u.id = o.user_id where o.blocked or o.weekly_minutes is not null or o.reset_at > wk),
    'week', (select coalesce(jsonb_agg(jsonb_build_object('user_id', w.user_id, 'email', u.email, 'level', coalesce(r.level, ''), 'minutes', w.minutes, 'turns', w.turns, 'last', w.last,
        'unlimited', exists (select 1 from public.apex_unlimited x where x.user_id = w.user_id)) order by w.minutes desc), '[]'::jsonb)
      from (select user_id, round(sum(seconds) / 60.0, 1) minutes, count(*) turns, max(created_at) last from public.apex_usage where created_at >= wk group by user_id) w
      join auth.users u on u.id = w.user_id left join public.admin_roles r on r.user_id = w.user_id),
    'recent', (select coalesce(jsonb_agg(jsonb_build_object('email', u.email, 'kind', a.kind, 'provider', a.provider, 'model', a.model, 'seconds', a.seconds, 'at', a.created_at) order by a.created_at desc), '[]'::jsonb)
      from (select * from public.apex_usage order by created_at desc limit 25) a join auth.users u on u.id = a.user_id),
    'weeks', (select coalesce(jsonb_agg(jsonb_build_object('week', x.wk, 'minutes', x.minutes, 'people', x.people) order by x.wk), '[]'::jsonb)
      from (select date_trunc('week', created_at at time zone 'utc')::date wk, round(sum(seconds) / 60.0, 1) minutes, count(distinct user_id) people
            from public.apex_usage where created_at > now() - interval '8 weeks' group by 1) x),
    'resets_at', wk + interval '7 days');
end $$;

-- =====================================================================================================
-- 2) + 3) Access requests and per-person feature grants
-- =====================================================================================================
create table if not exists public.feature_flag_grants (
  user_id uuid not null references auth.users(id) on delete cascade,
  flag_key text not null check (char_length(flag_key) <= 60),
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, flag_key)
);
alter table public.feature_flag_grants enable row level security;
drop policy if exists ffg_read on public.feature_flag_grants;
create policy ffg_read on public.feature_flag_grants for select using (user_id = auth.uid() or public.is_admin());
revoke insert, update, delete on public.feature_flag_grants from anon, authenticated;

create table if not exists public.access_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('axiom', 'feature', 'beta', 'other')),
  target text not null default '' check (char_length(target) <= 60),
  note text not null default '' check (char_length(note) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  review_note text not null default '' check (char_length(review_note) <= 500),
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  source text not null default 'desktop' check (source in ('desktop', 'phone', 'web'))
);
create unique index if not exists access_requests_one_pending on public.access_requests (user_id, kind, target) where status = 'pending';
alter table public.access_requests enable row level security;
drop policy if exists ar_own_read on public.access_requests;
create policy ar_own_read on public.access_requests for select using (user_id = auth.uid() or public.apex_can_manage());
drop policy if exists ar_own_insert on public.access_requests;
create policy ar_own_insert on public.access_requests for insert with check (user_id = auth.uid() and status = 'pending' and reviewed_by is null and review_note = '');
drop policy if exists ar_own_delete on public.access_requests;
create policy ar_own_delete on public.access_requests for delete using (user_id = auth.uid() and status = 'pending');
revoke update on public.access_requests from anon, authenticated;

create or replace function public.can_review_access()
returns boolean language sql stable security definer set search_path = public as $$ select public.apex_can_manage() $$;

create or replace function public.admin_access_requests(p_status text default 'pending')
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.apex_can_manage() and public.get_my_admin_level() is distinct from 'high-admin' then return jsonb_build_object('success', false, 'error', 'not_allowed'); end if;
  return jsonb_build_object('success', true, 'can_review', public.apex_can_manage(), 'requests', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'user_id', r.user_id, 'email', u.email, 'username', p.username, 'nickname', p.nickname,
      'kind', r.kind, 'target', r.target, 'note', r.note, 'status', r.status, 'review_note', r.review_note, 'created_at', r.created_at, 'reviewed_at', r.reviewed_at, 'source', r.source) order by r.created_at desc), '[]'::jsonb)
    from (select * from public.access_requests where p_status = 'all' or status = p_status order by created_at desc limit 200) r join auth.users u on u.id = r.user_id left join public.profiles p on p.id = r.user_id));
end $$;

create or replace function public.admin_review_access(p_id bigint, p_approve boolean, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.access_requests;
begin
  if not public.apex_can_manage() then return jsonb_build_object('success', false, 'error', 'not_allowed'); end if;
  select * into r from public.access_requests where id = p_id for update;
  if r is null then return jsonb_build_object('success', false, 'error', 'not_found'); end if;
  if r.status <> 'pending' then return jsonb_build_object('success', false, 'error', 'already_reviewed'); end if;
  if p_approve then
    if r.kind = 'axiom' then insert into public.apex_allowed (user_id, added_by) values (r.user_id, auth.uid()) on conflict do nothing;
    elsif r.kind = 'feature' and r.target <> '' then insert into public.feature_flag_grants (user_id, flag_key, granted_by) values (r.user_id, r.target, auth.uid()) on conflict do nothing;
    elsif r.kind = 'beta' then update public.profiles set is_beta_tester = true where id = r.user_id;
    end if;
  end if;
  update public.access_requests set status = case when p_approve then 'approved' else 'denied' end, review_note = left(coalesce(p_note, ''), 500), reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  insert into public.moderation_log (action, performed_by, target_user_id, details) values (case when p_approve then 'access_approved' else 'access_denied' end, auth.uid(), r.user_id, jsonb_build_object('kind', r.kind, 'target', r.target));
  return jsonb_build_object('success', true);
end $$;

create or replace function public.admin_revoke_grant(p_user uuid, p_flag text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.apex_can_manage() then return jsonb_build_object('success', false, 'error', 'not_allowed'); end if;
  delete from public.feature_flag_grants where user_id = p_user and flag_key = p_flag;
  insert into public.moderation_log (action, performed_by, target_user_id, details) values ('grant_revoked', auth.uid(), p_user, jsonb_build_object('flag', p_flag));
  return jsonb_build_object('success', true);
end $$;

-- =====================================================================================================
-- 4) Redeemed orders
-- =====================================================================================================
create or replace function public.admin_user_redemptions(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(to_jsonb(r) order by r.redeemed_at desc), '[]'::jsonb) from public.redemptions r where r.user_id = p_user);
end $$;
create or replace function public.admin_remove_redemption(p_user uuid, p_order text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.hi_can_write() then return jsonb_build_object('success', false, 'error', 'not_allowed'); end if;
  delete from public.redemptions where user_id = p_user and order_id = p_order;
  if not found then return jsonb_build_object('success', false, 'error', 'not_found'); end if;
  insert into public.moderation_log (action, performed_by, target_user_id, details) values ('order_unredeemed', auth.uid(), p_user, jsonb_build_object('order', p_order));
  return jsonb_build_object('success', true);
end $$;
-- Nexus → Settings → Account → Un-redeem (your own orders only; the order can then be redeemed again)
create or replace function public.unredeem_order(p_order text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return jsonb_build_object('success', false, 'error', 'sign_in'); end if;
  delete from public.redemptions where user_id = auth.uid() and order_id = upper(trim(p_order));
  if not found then return jsonb_build_object('success', false, 'error', 'not_found'); end if;
  return jsonb_build_object('success', true);
end $$;

-- =====================================================================================================
-- 5) Reports: which way they were sent, and from people who aren't signed in
-- =====================================================================================================
alter table public.feedback_reports add column if not exists channel text not null default 'app';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'feedback_reports_channel_check') then
    alter table public.feedback_reports add constraint feedback_reports_channel_check check (channel in ('app', 'github', 'email'));
  end if;
end $$;
create or replace function public.submit_feedback_anon(p_kind text, p_title text, p_body text, p_info text default '', p_version text default '', p_channel text default 'app')
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then return jsonb_build_object('success', false, 'error', 'signed_in'); end if;
  -- A little flood protection for an open door
  if (select count(*) from public.feedback_reports where user_id is null and created_at > now() - interval '1 hour') >= 30 then return jsonb_build_object('success', false, 'error', 'busy'); end if;
  insert into public.feedback_reports (user_id, kind, title, body, info, app_version, source, channel)
    values (null, case when p_kind in ('bug', 'feature', 'feedback', 'beta', 'other') then p_kind else 'feedback' end, left(coalesce(nullif(trim(p_title), ''), 'Feedback'), 150), left(coalesce(p_body, ''), 8000),
      left(coalesce(p_info, ''), 4000), left(coalesce(p_version, ''), 40), 'desktop', case when p_channel in ('app', 'github', 'email') then p_channel else 'app' end);
  return jsonb_build_object('success', true);
end $$;

-- Managers (not just high-admins) can search people and see the prompt history on the Axiom page
create or replace function public.admin_apex_find(p_q text)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if public.get_my_admin_level() is distinct from 'high-admin' and not public.apex_can_manage() then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('user_id', u.id, 'email', u.email, 'username', p.username)), '[]'::jsonb) from (
    select u.id, u.email from auth.users u left join public.profiles p on p.id = u.id
    where u.email ilike '%' || p_q || '%' or p.username ilike '%' || p_q || '%' limit 8) u left join public.profiles p on p.id = u.id);
end $$;
create or replace function public.admin_apex_prompts()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if public.get_my_admin_level() is distinct from 'high-admin' and not public.apex_can_manage() then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'saved_at', h.saved_at, 'length', char_length(h.prompt), 'preview', left(h.prompt, 160), 'by', u.email) order by h.id desc), '[]'::jsonb)
    from (select * from public.apex_prompt_history order by id desc limit 20) h left join auth.users u on u.id = h.saved_by);
end $$;

-- =====================================================================================================
-- 6) Health → "N28C requests waiting": see which ones are stuck and clear them (never shows what was asked)
-- =====================================================================================================
create or replace function public.admin_relay_stuck()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if public.get_my_admin_level() is distinct from 'high-admin' then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'email', u.email, 'username', p.username, 'kind', m.kind, 'op', coalesce(m.meta->>'op', ''), 'agent', m.agent,
      'created_at', m.created_at, 'mac_seen', (select max(s.updated_at) from public.companion_sync s where s.user_id = m.user_id and s.key = 'status')) order by m.created_at), '[]'::jsonb)
    from (select * from public.relay_messages where handled_at is null and direction = 'to_desktop' and created_at < now() - interval '2 minutes' order by created_at limit 100) m
    join auth.users u on u.id = m.user_id left join public.profiles p on p.id = m.user_id);
end $$;
-- Clearing tells the person's phone it wasn't answered, so N28C stops waiting
create or replace function public.admin_relay_clear(p_ids bigint[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.hi_can_write() then return jsonb_build_object('success', false, 'error', 'not_allowed'); end if;
  insert into public.relay_messages (user_id, direction, kind, content, reply_to, meta)
    select user_id, 'to_phone', 'error', 'Your Mac didn''t pick this up (it may have been asleep or Nexus was closed). Send it again when your Mac is on.', id, jsonb_build_object('cleared', true)
    from public.relay_messages where id = any(p_ids) and handled_at is null and direction = 'to_desktop' and kind in ('ask', 'request');
  update public.relay_messages set handled_at = now() where id = any(p_ids) and handled_at is null and direction = 'to_desktop';
  get diagnostics n = row_count;
  insert into public.moderation_log (action, performed_by, details) values ('relay_cleared', auth.uid(), jsonb_build_object('count', n));
  return jsonb_build_object('success', true, 'cleared', n);
end $$;

-- Live updates in Apoji Admin for new access requests
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'access_requests') then
    alter publication supabase_realtime add table public.access_requests;
  end if;
end $$;

do $$ declare f text; begin
  foreach f in array array['apex_can_manage()', 'admin_apex_find(text)', 'admin_apex_prompts()', 'admin_relay_stuck()', 'admin_relay_clear(bigint[])', 'admin_apex_set(text, int, text[], text)', 'admin_apex_control(jsonb)', 'admin_apex_user(uuid, boolean, int, boolean, boolean, text)',
    'admin_apex_restore_prompt(bigint)', 'admin_apex_people(uuid, text, boolean)', 'admin_apex_overview()', 'can_review_access()', 'admin_access_requests(text)', 'admin_review_access(bigint, boolean, text)',
    'admin_revoke_grant(uuid, text)', 'admin_user_redemptions(uuid)', 'admin_remove_redemption(uuid, text)', 'unredeem_order(text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on function public.submit_feedback_anon(text, text, text, text, text, text) from public;
grant execute on function public.submit_feedback_anon(text, text, text, text, text, text) to anon;

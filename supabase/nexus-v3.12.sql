-- Nexus '28 3.12 — run once in the Supabase SQL editor (Nexus project, after nexus-v3.11.sql). Safe to run again.
--   1. Every lesson you're getting, for Settings → Training (it only listed pushes, so lessons still being tried by
--      admins never showed up there, even though answers used them).
--   2. Known issues & bugs: posted in Apoji Admin, shown on the status page and when someone reports a matching bug.
--   3. Apoji staff get Pro-plan usage (the premium-chat function checks the aARgon3 staff list).
--   4. Share to Nexus: a personal share key (inbox only) for the iPhone shortcut, and a read-only widget key.
--   5. Test Run guest mode: a few answers a day without an account.
create extension if not exists pgcrypto with schema extensions;

-- ============================================================ 1. your lessons
create or replace function public.training_my_lessons() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'rule', t.lesson, 'q', left(t.prompt, 160), 'agent', t.agent, 'at', t.approved_at,
      'push', p.id, 'title', p.title, 'stage', coalesce(p.stage, 'admin'), 'pushed_at', coalesce(p.promoted_at, p.created_at))
    order by coalesce(p.promoted_at, p.created_at, t.approved_at) desc nulls last, t.approved_at desc), '[]'::jsonb)
  from training_examples t left join training_pushes p on p.id = t.push_id
  where t.approved and public.training_stage_ok(t.push_id) and (t.push_id is null or p.undone_at is null);
$$;
revoke all on function public.training_my_lessons() from public, anon;
grant execute on function public.training_my_lessons() to authenticated;

-- ============================================================ 2. known issues & bugs
create table if not exists public.known_issues (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 3 and 140),
  details text not null default '' check (char_length(details) <= 2000),
  workaround text not null default '' check (char_length(workaround) <= 1000),
  apps text[] not null default '{}',                    -- mac, windows, n28c, test_run, admin, aargon3
  versions text not null default '' check (char_length(versions) <= 60),   -- e.g. "3.11.0 – 3.11.1"
  status text not null default 'investigating' check (status in ('investigating', 'identified', 'fixing', 'fixed', 'wont_fix')),
  fixed_in text not null default '' check (char_length(fixed_in) <= 40),   -- the release with the fix
  severity text not null default 'minor' check (severity in ('minor', 'major', 'critical')),
  words text[] not null default '{}',                   -- extra words that match bug reports
  report_ids bigint[] not null default '{}',            -- feedback reports about it
  incident_id bigint,                                   -- a status page incident about it
  public boolean not null default true,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fixed_at timestamptz
);
alter table public.known_issues enable row level security;
drop policy if exists known_issues_read on public.known_issues;
create policy known_issues_read on public.known_issues for select using (public or public.is_admin());
drop policy if exists known_issues_write on public.known_issues;
create policy known_issues_write on public.known_issues for all using (public.is_admin()) with check (public.is_admin());
grant select on public.known_issues to anon;
create or replace function public.known_issues_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); if new.status = 'fixed' and (tg_op = 'INSERT' or old.status is distinct from 'fixed') then new.fixed_at := now(); end if; return new; end $$;
drop trigger if exists known_issues_touch on public.known_issues;
create trigger known_issues_touch before insert or update on public.known_issues for each row execute function public.known_issues_touch();

-- the status page: open issues and ones fixed in the last 30 days (anyone can read it)
create or replace function public.public_known_issues() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'details', details, 'workaround', workaround, 'apps', apps, 'versions', versions,
      'status', status, 'fixed_in', fixed_in, 'severity', severity, 'reports', coalesce(array_length(report_ids, 1), 0), 'incident_id', incident_id,
      'created_at', created_at, 'updated_at', updated_at, 'fixed_at', fixed_at)
    order by (status in ('fixed', 'wont_fix')), case severity when 'critical' then 0 when 'major' then 1 else 2 end, updated_at desc), '[]'::jsonb)
  from known_issues where public and (status not in ('fixed', 'wont_fix') or coalesce(fixed_at, updated_at) > now() - interval '30 days');
$$;
grant execute on function public.public_known_issues() to anon, authenticated;

-- "We know about this": known issues whose words match what someone is about to report
create or replace function public.known_issue_match(p_text text, p_app text default '') returns jsonb
language sql stable security definer set search_path = public as $$
  with q as (select nullif(replace(plainto_tsquery('english', left(coalesce(p_text, ''), 600))::text, ' & ', ' | '), '')::tsquery tq)
  select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'title', k.title, 'status', k.status, 'fixed_in', k.fixed_in, 'workaround', k.workaround) order by k.r desc), '[]'::jsonb)
  from (select i.*, ts_rank(to_tsvector('english', i.title || ' ' || i.details || ' ' || array_to_string(i.words, ' ')), q.tq) r
        from known_issues i, q where q.tq is not null and i.public and i.status not in ('fixed', 'wont_fix')
          and (p_app = '' or cardinality(i.apps) = 0 or p_app = any(i.apps))
          and to_tsvector('english', i.title || ' ' || i.details || ' ' || array_to_string(i.words, ' ')) @@ q.tq
        order by r desc limit 3) k where k.r > 0.04;
$$;
grant execute on function public.known_issue_match(text, text) to anon, authenticated;

-- someone said "I have this too": counts on the issue (and links their report if they still send one)
create table if not exists public.known_issue_followers (
  issue_id bigint not null references public.known_issues(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (issue_id, user_id)
);
alter table public.known_issue_followers enable row level security;
drop policy if exists kif_own on public.known_issue_followers;
create policy kif_own on public.known_issue_followers for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid());
create or replace function public.known_issue_follow(p_id bigint, p_on boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'signin'); end if;
  if p_on then insert into known_issue_followers (issue_id, user_id) values (p_id, auth.uid()) on conflict do nothing;
  else delete from known_issue_followers where issue_id = p_id and user_id = auth.uid(); end if;
  return jsonb_build_object('ok', true, 'count', (select count(*) from known_issue_followers where issue_id = p_id));
end $$;
revoke all on function public.known_issue_follow(bigint, boolean) from public, anon;
grant execute on function public.known_issue_follow(bigint, boolean) to authenticated;

-- when an issue is marked fixed, everyone following it gets a notice in their apps
create or replace function public.known_issue_fixed_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare f record;
begin
  if new.status = 'fixed' and old.status is distinct from 'fixed' then
    for f in select user_id from known_issue_followers where issue_id = new.id loop
      begin
        insert into broadcasts (title, body, audience, to_user, created_by)
        values (left('Fixed: ' || new.title, 80), case when new.fixed_in <> '' then 'It''s fixed in ' || new.fixed_in || '. Update to get it.' else 'It''s fixed. Thanks for your patience.' end, 'user', f.user_id, coalesce(auth.uid(), new.created_by));
      exception when others then null;   -- broadcasts' shape differs on older databases: skip the notice
      end;
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists known_issue_fixed_notify on public.known_issues;
create trigger known_issue_fixed_notify after update on public.known_issues for each row execute function public.known_issue_fixed_notify();

-- Apoji Admin's list (with followers and private ones)
create or replace function public.admin_known_issues() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not public.is_admin() then '[]'::jsonb else coalesce(jsonb_agg(to_jsonb(i) || jsonb_build_object('followers', (select count(*) from known_issue_followers f where f.issue_id = i.id))
    order by (i.status in ('fixed', 'wont_fix')), i.updated_at desc), '[]'::jsonb) end
  from known_issues i;
$$;
revoke all on function public.admin_known_issues() from public, anon;
grant execute on function public.admin_known_issues() to authenticated;
do $$ begin begin alter publication supabase_realtime add table public.known_issues; exception when duplicate_object then null; end; end $$;

-- ============================================================ 3. staff get Pro-plan usage
-- premium-chat checks the aARgon3 staff list (secret STORE_SERVICE_KEY) and passes p_staff; staff count as Pro
drop function if exists public.premium_take(uuid, text, text);
create or replace function public.premium_status(p_user uuid, p_staff boolean default false) returns jsonb
language sql stable security definer set search_path = public as $$
  with best as (
    select o.order_id, public.redemption_tier(o.config_service_tier) as tier from (
      select r.* from redemptions r where r.user_id = p_user
      union all
      select r.* from plan_members m join redemptions r on r.order_id = m.order_id where m.user_id = p_user and m.status = 'active') o
    where public.redemption_tier(o.config_service_tier) in ('Pro', 'Max')
    order by case public.redemption_tier(o.config_service_tier) when 'Max' then 0 else 1 end limit 1),
  t as (select coalesce((select tier from best), case when p_staff then 'Pro' end) tier)
  select jsonb_build_object(
    'staff', p_staff,
    'paragon', jsonb_build_object(
      'allowed', exists (select 1 from best) or p_staff or exists (select 1 from admin_roles where user_id = p_user),
      'unlimited', exists (select 1 from admin_roles where user_id = p_user and level = 'high-admin'),
      'tier', (select tier from t), 'order_id', (select order_id from best), 'staff', p_staff and not exists (select 1 from best),
      'limit', case (select tier from t) when 'Max' then 25 when 'Pro' then 10 else case when exists (select 1 from admin_roles where user_id = p_user) then 25 else 0 end end,
      'used', (select count(*) from premium_turns where user_id = p_user and agent = 'paragon' and day = current_date)),
    'axiom', jsonb_build_object(
      'allowed', exists (select 1 from apex_allowed where user_id = p_user) or exists (select 1 from apex_unlimited where user_id = p_user) or public.is_owner(p_user),
      'used', (select count(*) from premium_turns where user_id = p_user and agent = 'axiom' and day = current_date)));
$$;
create or replace function public.premium_take(p_user uuid, p_agent text, p_turn text, p_staff boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare st jsonb := public.premium_status(p_user, p_staff); a jsonb := st->p_agent; new_turn boolean; calls int;
begin
  if a is null or not coalesce((a->>'allowed')::boolean, false) then
    return jsonb_build_object('ok', false, 'message', case p_agent when 'axiom' then 'Axiom on the Nexus key is only for people the Apoji Team allowed.' else 'Paragon on the Nexus key comes with Pro and Max plans. Add your own key in Settings → Models & keys, or see pricing.' end);
  end if;
  new_turn := not exists (select 1 from premium_turns where user_id = p_user and agent = p_agent and turn = p_turn);
  if new_turn and p_agent = 'paragon' and not coalesce((a->>'unlimited')::boolean, false) and (a->>'used')::int >= (a->>'limit')::int then
    return jsonb_build_object('ok', false, 'message', 'That''s all ' || (a->>'limit') || ' Paragon tasks for today on your plan. It resets tomorrow, or add your own key in Settings → Models & keys.');
  end if;
  select coalesce(sum(t.calls), 0) into calls from premium_turns t where t.user_id = p_user and t.day = current_date;
  if calls >= 400 then return jsonb_build_object('ok', false, 'message', 'You''ve hit today''s safety limit on the Nexus key. It resets tomorrow.'); end if;
  insert into premium_turns (user_id, agent, turn) values (p_user, p_agent, p_turn) on conflict (user_id, agent, turn) do update set calls = premium_turns.calls + 1;
  return jsonb_build_object('ok', true, 'order_id', a->>'order_id', 'new_turn', new_turn, 'staff', coalesce((a->>'staff')::boolean, false));
end $$;
-- the apps' own check stays (staff is filled in by the app from the premium-chat status)
create or replace function public.premium_my_status() returns jsonb
language sql stable security definer set search_path = public as $$ select public.premium_status(auth.uid(), false) $$;
revoke all on function public.premium_status(uuid, boolean) from public, anon, authenticated;
revoke all on function public.premium_take(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.premium_status(uuid, boolean) to service_role;
grant execute on function public.premium_take(uuid, text, text, boolean) to service_role;

-- ============================================================ 4. Share to Nexus + the widget
create table if not exists public.share_keys (
  key_hash text primary key check (char_length(key_hash) = 64),       -- sha-256 of the key; the key itself is only shown once
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('share', 'widget')),
  label text not null default '' check (char_length(label) <= 60),
  created_at timestamptz not null default now(),
  last_used timestamptz,
  uses int not null default 0
);
alter table public.share_keys enable row level security;
drop policy if exists share_keys_own on public.share_keys;
create policy share_keys_own on public.share_keys for select using (user_id = auth.uid());
create table if not exists public.share_inbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('text', 'link', 'image')),
  text text not null default '' check (char_length(text) <= 20000),
  url text not null default '' check (char_length(url) <= 2000),
  image text not null default '' check (char_length(image) <= 3000000),   -- a data: URL, shrunk by the shortcut
  source text not null default 'shortcut' check (char_length(source) <= 40),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);
alter table public.share_inbox enable row level security;
drop policy if exists share_inbox_own on public.share_inbox;
create policy share_inbox_own on public.share_inbox for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists share_inbox_user on public.share_inbox (user_id, handled_at, created_at desc);

-- make a key (returns it once); one of each kind per person, a new one replaces the old
create or replace function public.share_key_make(p_kind text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare k text; begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'signin'); end if;
  if p_kind not in ('share', 'widget') then return jsonb_build_object('ok', false, 'error', 'kind'); end if;
  delete from share_keys where user_id = auth.uid() and kind = p_kind;
  k := (case p_kind when 'share' then 'nxs_' else 'nxw_' end) || encode(gen_random_bytes(24), 'hex');
  insert into share_keys (key_hash, user_id, kind) values (encode(digest(k, 'sha256'), 'hex'), auth.uid(), p_kind);
  return jsonb_build_object('ok', true, 'key', k);
end $$;
create or replace function public.share_key_remove(p_kind text) returns jsonb
language sql security definer set search_path = public as $$
  with d as (delete from share_keys where user_id = auth.uid() and kind = p_kind returning 1) select jsonb_build_object('ok', true, 'removed', (select count(*) from d));
$$;
create or replace function public.share_key_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('share', (select jsonb_build_object('at', created_at, 'last_used', last_used, 'uses', uses) from share_keys where user_id = auth.uid() and kind = 'share'),
    'widget', (select jsonb_build_object('at', created_at, 'last_used', last_used, 'uses', uses) from share_keys where user_id = auth.uid() and kind = 'widget'),
    'waiting', (select count(*) from share_inbox where user_id = auth.uid() and handled_at is null));
$$;
-- the shortcut: drop something into your inbox (no sign-in; the key is the permission, and it can only do this)
create or replace function public.share_drop(p_key text, p_kind text, p_text text default '', p_url text default '', p_image text default '') returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u uuid; n int;
begin
  select user_id into u from share_keys where key_hash = encode(digest(coalesce(p_key, ''), 'sha256'), 'hex') and kind = 'share';
  if u is null then return jsonb_build_object('ok', false, 'error', 'That share key doesn''t work any more. Make a new one in N28C → You.'); end if;
  select count(*) into n from share_inbox where user_id = u and created_at > now() - interval '1 hour';
  if n >= 60 then return jsonb_build_object('ok', false, 'error', 'That''s a lot of shares in an hour. Try again later.'); end if;
  if coalesce(p_image, '') <> '' and p_image !~ '^data:image/(png|jpe?g|webp|heic|gif);base64,' then return jsonb_build_object('ok', false, 'error', 'That picture didn''t come through.'); end if;
  insert into share_inbox (user_id, kind, text, url, image) values (u, case when coalesce(p_image, '') <> '' then 'image' when coalesce(p_url, '') <> '' or coalesce(p_text, '') ~* '^https?://\S+$' then 'link' else 'text' end,
    left(coalesce(p_text, ''), 20000), left(coalesce(nullif(p_url, ''), case when coalesce(p_text, '') ~* '^https?://\S+$' then p_text else '' end), 2000), coalesce(p_image, ''));
  update share_keys set last_used = now(), uses = uses + 1 where user_id = u and kind = 'share';
  return jsonb_build_object('ok', true, 'message', 'Sent to Nexus');
end $$;
-- the widget: a few numbers, read-only (filled in by the apps through companion_sync 'widget')
create or replace function public.widget_data(p_key text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u uuid; d jsonb;
begin
  select user_id into u from share_keys where key_hash = encode(digest(coalesce(p_key, ''), 'sha256'), 'hex') and kind = 'widget';
  if u is null then return jsonb_build_object('ok', false, 'error', 'That widget key doesn''t work any more. Make a new one in N28C → You.'); end if;
  update share_keys set last_used = now(), uses = uses + 1 where user_id = u and kind = 'widget';
  select data into d from companion_sync where user_id = u and key = 'widget';
  return jsonb_build_object('ok', true, 'data', coalesce(d, '{}'::jsonb), 'inbox', (select count(*) from share_inbox where user_id = u and handled_at is null));
end $$;
revoke all on function public.share_key_make(text) from public, anon;
revoke all on function public.share_key_remove(text) from public, anon;
revoke all on function public.share_key_status() from public, anon;
grant execute on function public.share_key_make(text), public.share_key_remove(text), public.share_key_status() to authenticated;
grant execute on function public.share_drop(text, text, text, text, text), public.widget_data(text) to anon, authenticated;
do $$ begin begin alter publication supabase_realtime add table public.share_inbox; exception when duplicate_object then null; end; end $$;

-- ============================================================ 5. Test Run guest mode
-- Guests sign in anonymously (Supabase → Authentication → Sign In / Providers → allow anonymous sign-ins). They get 8
-- Flash answers a day and their chats stay in the browser only, cleared every day. Counted per network address too, so
-- a new guest in the same browser doesn't reset it.
create table if not exists public.try_guest_use (
  who text not null check (char_length(who) between 8 and 80),        -- a hash of the network address, or the guest's id
  day date not null default current_date,
  answers int not null default 0,
  primary key (who, day)
);
alter table public.try_guest_use enable row level security;
create or replace function public.try_guest_take(p_who text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare w text; used int := 0; lim int := 8;
begin
  foreach w in array p_who loop select greatest(used, coalesce((select answers from try_guest_use where who = w and day = current_date), 0)) into used; end loop;
  if used >= lim then return jsonb_build_object('ok', false, 'error', 'guest_limit', 'message', 'That''s all ' || lim || ' guest answers for today. Make a free account to keep going (your chat stays).'); end if;
  foreach w in array p_who loop insert into try_guest_use (who) values (w) on conflict (who, day) do update set answers = try_guest_use.answers + 1; end loop;
  delete from try_guest_use where day < current_date - 2;
  return jsonb_build_object('ok', true, 'left', lim - used - 1);
end $$;
revoke all on function public.try_guest_take(text[]) from public, anon, authenticated;
grant execute on function public.try_guest_take(text[]) to service_role;

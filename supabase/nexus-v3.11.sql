-- Nexus '28 3.11 + Apoji Admin 2.7 — run once in the Supabase SQL editor (Nexus project, after nexus-v3.10.sql and
-- apoji-admin-2.6.sql). Safe to run again.
--   1. The Paragon & Axiom key: Pro and Max subscribers (and the people in their plan) get Paragon on Apoji's own key
--      (Pro 10 tasks a day, Max 25); Axiom on that key for the people allowed to use Axiom. The key itself is a Supabase
--      secret used only by the premium-chat Edge Function.
--   2. Plans with people: the person who redeemed an order invites others up to the plan's seats; they share its perks.
--   3. New models: the Apoji Team adds a model (name, prompt, @features) in Apoji Admin and every app picks it up.

-- ============================================================ helpers: seats and tiers from the aARgon3 catalog
-- Personal 1/1/2/2 · Business 5/6/7/7 · Enterprise 100/150/250/no limit (Standard/Plus/Pro/Max)
create or replace function public.plan_seats(p_plan text, p_tier text) returns int
language sql immutable as $$
  select case lower(coalesce(p_plan, ''))
    when 'personal' then case lower(coalesce(p_tier, '')) when 'pro' then 2 when 'max' then 2 else 1 end
    when 'business' then case lower(coalesce(p_tier, '')) when 'standard' then 5 when 'plus' then 6 else 7 end
    when 'enterprise' then case lower(coalesce(p_tier, '')) when 'standard' then 100 when 'plus' then 150 when 'pro' then 250 else 100000 end
    else 1 end;
$$;

-- ============================================================ 2. plans with people
create table if not exists public.plan_members (
  id bigint generated always as identity primary key,
  order_id text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'active')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (order_id, user_id)
);
alter table public.plan_members enable row level security;
drop policy if exists plan_members_read on public.plan_members;
create policy plan_members_read on public.plan_members for select using (owner_id = auth.uid() or user_id = auth.uid() or public.is_admin());
revoke insert, update, delete on public.plan_members from anon, authenticated;

-- the service tier of a redemption (Standard / Plus / Pro / Max), from the order's system config
drop function if exists public.redemption_tier(public.redemptions);
create or replace function public.redemption_tier(p_service text) returns text
language sql immutable as $$ select initcap(coalesce(nullif(trim(p_service), ''), 'standard')) $$;

-- Your plans: ones you redeemed (you own them) and ones you were added to, with seats and people
create or replace function public.my_subscription() returns jsonb
language sql stable security definer set search_path = public, auth as $$
  with mine as (
    select r.*, 'owner' as role, r.user_id as owner from redemptions r where r.user_id = auth.uid()
    union all
    select r.*, 'member' as role, r.user_id as owner from plan_members m join redemptions r on r.order_id = m.order_id where m.user_id = auth.uid() and m.status = 'active'
  )
  select jsonb_build_object(
    'plans', coalesce((select jsonb_agg(jsonb_build_object('order_id', x.order_id, 'role', x.role, 'plan', x.tier, 'tier', public.redemption_tier(x.config_service_tier), 'redeemed_at', x.redeemed_at,
        'os', x.config_os, 'chip', x.config_chip, 'connection', x.config_network, 'seats', public.plan_seats(x.tier, public.redemption_tier(x.config_service_tier)),
        'owner', (select coalesce(nickname, username, 'Owner') from profiles where id = x.owner),
        'people', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'user_id', m.user_id, 'status', m.status, 'name', coalesce(p.nickname, p.username, split_part(u.email, '@', 1)), 'username', p.username, 'since', coalesce(m.accepted_at, m.created_at)) order by m.created_at), '[]'::jsonb)
                   from plan_members m left join profiles p on p.id = m.user_id left join auth.users u on u.id = m.user_id where m.order_id = x.order_id))
      order by x.redeemed_at desc) from mine x), '[]'::jsonb),
    'invites', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'order_id', m.order_id, 'plan', r.tier, 'tier', public.redemption_tier(r.config_service_tier),
        'from', coalesce(p.nickname, p.username, 'someone'), 'at', m.created_at))
      from plan_members m join redemptions r on r.order_id = m.order_id left join profiles p on p.id = m.owner_id where m.user_id = auth.uid() and m.status = 'invited'), '[]'::jsonb));
$$;

-- invite someone (by username or email) into a plan you redeemed
create or replace function public.plan_invite(p_order text, p_who text) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare r redemptions; who uuid; taken int; seats int; q text := lower(trim(p_who));
begin
  select * into r from redemptions where order_id = upper(trim(p_order)) and user_id = auth.uid();
  if r.order_id is null then return jsonb_build_object('ok', false, 'error', 'not_yours'); end if;
  select id into who from profiles where lower(username) = ltrim(q, '@') limit 1;
  if who is null then select id into who from auth.users where lower(email) = q limit 1; end if;
  if who is null then return jsonb_build_object('ok', false, 'error', 'no_account'); end if;
  if who = auth.uid() then return jsonb_build_object('ok', false, 'error', 'yourself'); end if;
  seats := public.plan_seats(r.tier, public.redemption_tier(r.config_service_tier));
  select count(*) into taken from plan_members where order_id = r.order_id;
  if taken + 1 >= seats then return jsonb_build_object('ok', false, 'error', 'full', 'seats', seats); end if;
  insert into plan_members (order_id, owner_id, user_id) values (r.order_id, auth.uid(), who) on conflict (order_id, user_id) do nothing;
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.plan_respond(p_id bigint, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_accept then update plan_members set status = 'active', accepted_at = now() where id = p_id and user_id = auth.uid() and status = 'invited';
  else delete from plan_members where id = p_id and user_id = auth.uid(); end if;
  return jsonb_build_object('ok', found);
end $$;
-- the owner removes someone, or a member leaves
create or replace function public.plan_remove(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  delete from plan_members where id = p_id and (owner_id = auth.uid() or user_id = auth.uid());
  return jsonb_build_object('ok', found);
end $$;

-- ============================================================ 1. the Paragon & Axiom key
create table if not exists public.premium_turns (
  user_id uuid not null references auth.users(id) on delete cascade,
  agent text not null check (agent in ('paragon', 'axiom')),
  turn text not null check (char_length(turn) between 1 and 80),
  day date not null default current_date,
  calls int not null default 1,
  created_at timestamptz not null default now(),
  primary key (user_id, agent, turn)
);
alter table public.premium_turns enable row level security;
drop policy if exists premium_turns_own on public.premium_turns;
create policy premium_turns_own on public.premium_turns for select using (user_id = auth.uid() or public.is_admin());

-- What someone gets on Apoji's key (order status is checked by the Edge Function with the aARgon3 store)
create or replace function public.premium_status(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with best as (
    select o.order_id, public.redemption_tier(o.config_service_tier) as tier from (
      select r.* from redemptions r where r.user_id = p_user
      union all
      select r.* from plan_members m join redemptions r on r.order_id = m.order_id where m.user_id = p_user and m.status = 'active') o
    where public.redemption_tier(o.config_service_tier) in ('Pro', 'Max')
    order by case public.redemption_tier(o.config_service_tier) when 'Max' then 0 else 1 end limit 1)
  select jsonb_build_object(
    'paragon', jsonb_build_object(
      'allowed', exists (select 1 from best) or exists (select 1 from admin_roles where user_id = p_user),
      'unlimited', exists (select 1 from admin_roles where user_id = p_user and level = 'high-admin'),
      'tier', (select tier from best), 'order_id', (select order_id from best),
      'limit', case (select tier from best) when 'Max' then 25 when 'Pro' then 10 else case when exists (select 1 from admin_roles where user_id = p_user) then 25 else 0 end end,
      'used', (select count(*) from premium_turns where user_id = p_user and agent = 'paragon' and day = current_date)),
    'axiom', jsonb_build_object(
      'allowed', exists (select 1 from apex_allowed where user_id = p_user) or exists (select 1 from apex_unlimited where user_id = p_user) or public.is_owner(p_user),
      'used', (select count(*) from premium_turns where user_id = p_user and agent = 'axiom' and day = current_date)));
$$;
create or replace function public.premium_my_status() returns jsonb
language sql stable security definer set search_path = public as $$ select public.premium_status(auth.uid()) $$;

-- Called by the Edge Function for every model call: a new turn (one Paragon task) counts toward the day's limit; the
-- tool steps inside a task don't. Hard stop at 400 calls a day per person.
create or replace function public.premium_take(p_user uuid, p_agent text, p_turn text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare st jsonb := public.premium_status(p_user); a jsonb := st->p_agent; new_turn boolean; calls int;
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
  return jsonb_build_object('ok', true, 'order_id', a->>'order_id', 'new_turn', new_turn);
end $$;

-- Admin: how much of Apoji's key went where (Free API usage page)
create or replace function public.admin_premium_usage() returns jsonb
language sql stable security definer set search_path = public, auth as $$
  select case when not public.is_admin() then null else jsonb_build_object(
    'today', (select jsonb_build_object('tasks', count(*), 'calls', coalesce(sum(calls), 0), 'people', count(distinct user_id)) from premium_turns where day = current_date),
    'by_agent', coalesce((select jsonb_object_agg(agent, n) from (select agent, count(*) n from premium_turns where day = current_date group by agent) x), '{}'::jsonb),
    'top', coalesce((select jsonb_agg(jsonb_build_object('email', u.email, 'tasks', t.n, 'calls', t.c) order by t.n desc) from (select user_id, count(*) n, sum(calls) c from premium_turns where day = current_date group by user_id order by count(*) desc limit 5) t join auth.users u on u.id = t.user_id), '[]'::jsonb),
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'tasks', n, 'calls', c) order by day) from (select day, count(*) n, sum(calls) c from premium_turns where day > current_date - 14 group by day) d), '[]'::jsonb)) end;
$$;

-- ============================================================ 3. new models (added in Apoji Admin → Agent prompts)
create table if not exists public.agent_releases (
  id text primary key check (id ~ '^[a-z][a-z0-9_]{1,30}$'),
  name text not null check (char_length(name) between 1 and 60),
  prompt text not null check (char_length(prompt) between 10 and 20000),
  features text[] not null default '{}',
  base text not null default 'lyte' check (base in ('flash', 'lyte', 'neodela')),   -- which free-key allowance it uses
  color text not null default '#3dffa0' check (color ~ '^#[0-9a-fA-F]{6}$'),
  tagline text not null default '' check (char_length(tagline) <= 120),
  about text not null default '' check (char_length(about) <= 1200),
  stage text not null default 'admin' check (stage in ('off', 'admin', 'beta', 'all')),
  released_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now()
);
alter table public.agent_releases enable row level security;
create or replace function public.agent_release_can_edit() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_owner() or exists (select 1 from prompt_editors where user_id = auth.uid()) or public.admin_has_perm('flags');
$$;
drop policy if exists agent_releases_read on public.agent_releases;
create policy agent_releases_read on public.agent_releases for select using (
  stage = 'all' or public.is_admin()
  or (stage = 'beta' and exists (select 1 from profiles p where p.id = auth.uid() and p.is_beta_tester)));
drop policy if exists agent_releases_write on public.agent_releases;
create policy agent_releases_write on public.agent_releases for all using (public.agent_release_can_edit()) with check (public.agent_release_can_edit());
grant select on public.agent_releases to anon;

-- ============================================================ grants
do $$ declare f text; begin
  foreach f in array array['my_subscription()', 'plan_invite(text, text)', 'plan_respond(bigint, boolean)', 'plan_remove(bigint)', 'premium_my_status()', 'admin_premium_usage()', 'agent_release_can_edit()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['premium_status(uuid)', 'premium_take(uuid, text, text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

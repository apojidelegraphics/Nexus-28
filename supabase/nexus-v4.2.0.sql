-- Nexus '28 4.2.0 (run in the Nexus project's SQL editor, after nexus-v4.1.0.sql). Safe to run more than once.
--  1) Cirkts earned in Test Run (daily quests there) go in their own column, so the apps' points sync never swallows them.
--  2) Test Run: Spaces, memory you control and up to three study decks, saved on your account (try_state), and Test Run's
--     own daily quests (try_quests_today / try_quest_claim).
--  3) Share a chat as a link: a read-only copy anyone with the link can open (shared_chats). You can stop sharing anytime.
--  4) Session replays for the Apoji Team: anonymous steps (which screen, which button, where on the screen, errors). Never
--     what you type, never chat text, never who you are. Kept 30 days. You can turn it off in each app.
--  5) A/B switches: a feature flag can be on for part of the people who'd otherwise get it (feature_flags.rollout, 1–100).

-- 1) ------------------------------------------------------------------------------------------------------
alter table public.cirkts_wallet add column if not exists extra int not null default 0 check (extra >= 0);

create or replace function public.cirkts_state()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', true, 'earned', coalesce(w.earned, 0) + coalesce(w.extra, 0), 'extra', coalesce(w.extra, 0), 'spent', coalesce(w.spent, 0),
    'balance', coalesce(w.earned, 0) + coalesce(w.extra, 0) - coalesce(w.spent, 0), 'migrated', w.migrated_at is not null,
    'owned', coalesce((select jsonb_agg(item_id order by at) from cirkts_owned where user_id = auth.uid()), '[]'::jsonb))
  from (select auth.uid() u) x left join cirkts_wallet w on w.user_id = x.u;
$$;

create or replace function public.cirkts_buy(p_item text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c cosmetics; w cirkts_wallet; bal int;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Sign in first.'); end if;
  select * into c from cosmetics where id = p_item and active;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'That isn''t in the shop.'); end if;
  if c.data ? 'months' and not exists (select 1 from jsonb_array_elements_text(c.data -> 'months') m
      where m::int in (extract(month from now() - interval '14 hours')::int, extract(month from now() + interval '14 hours')::int)) then
    return jsonb_build_object('ok', false, 'error', 'That one is only in the shop during its month.');
  end if;
  if exists (select 1 from cirkts_owned where user_id = me and item_id = c.id) then return jsonb_build_object('ok', false, 'error', 'You already have it.', 'owned', true); end if;
  select * into w from cirkts_wallet where user_id = me for update;
  if w.user_id is null then return jsonb_build_object('ok', false, 'error', 'You don''t have any Cirkts yet. Earn some with daily quests.'); end if;
  bal := w.earned + w.extra - w.spent;
  if bal < c.price then return jsonb_build_object('ok', false, 'error', format('You need %s more Cirkts.', c.price - bal), 'short', c.price - bal); end if;
  update cirkts_wallet set spent = spent + c.price where user_id = me;
  insert into cirkts_owned (user_id, item_id, price_paid) values (me, c.id, c.price);
  return public.cirkts_state() || jsonb_build_object('bought', c.id, 'price', c.price);
end $$;

create or replace function public.cirkts_buy_pack(p_pack text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pk cosmetic_packs; w cirkts_wallet; left_ids text[]; full_price int; price int; bal int;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Sign in first.'); end if;
  select * into pk from cosmetic_packs where id = p_pack and active;
  if pk.id is null then return jsonb_build_object('ok', false, 'error', 'That set isn''t in the shop.'); end if;
  select coalesce(array_agg(c.id), '{}'), coalesce(sum(c.price), 0) into left_ids, full_price
    from cosmetics c where c.id = any(pk.items) and c.active and c.price > 0
      and not exists (select 1 from cirkts_owned o where o.user_id = me and o.item_id = c.id);
  if coalesce(array_length(left_ids, 1), 0) = 0 then return jsonb_build_object('ok', false, 'error', 'You already have everything in this set.', 'owned', true); end if;
  price := (round(full_price * (1 - pk.off) / 10.0) * 10)::int;
  select * into w from cirkts_wallet where user_id = me for update;
  if w.user_id is null then return jsonb_build_object('ok', false, 'error', 'You don''t have any Cirkts yet. Earn some with daily quests.'); end if;
  bal := w.earned + w.extra - w.spent;
  if bal < price then return jsonb_build_object('ok', false, 'error', format('You need %s more Cirkts.', price - bal), 'short', price - bal); end if;
  update cirkts_wallet set spent = spent + price where user_id = me;
  insert into cirkts_owned (user_id, item_id, price_paid, how)
    select me, c.id, round(c.price * (1 - pk.off))::int, 'pack' from cosmetics c where c.id = any(left_ids)
  on conflict do nothing;
  return public.cirkts_state() || jsonb_build_object('bought_pack', pk.id, 'items', to_jsonb(left_ids), 'price', price);
end $$;
revoke all on function public.cirkts_buy_pack(text) from public, anon;
grant execute on function public.cirkts_buy_pack(text) to authenticated;

-- 2) ------------------------------------------------------------------------------------------------------
create table if not exists public.try_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  spaces jsonb not null default '[]'::jsonb,        -- [{ id, name, color, about }]
  chat_space jsonb not null default '{}'::jsonb,    -- { chatId: spaceId }
  memory jsonb not null default '[]'::jsonb,        -- [{ id, text, at }]
  memory_on boolean not null default true,
  decks jsonb not null default '[]'::jsonb,         -- [{ id, name, cards: [{ f, b, due, ivl, ease, reps }] }]
  updated_at timestamptz not null default now(),
  constraint try_state_shape check (jsonb_typeof(spaces) = 'array' and jsonb_array_length(spaces) <= 12
    and jsonb_typeof(chat_space) = 'object' and jsonb_typeof(memory) = 'array' and jsonb_array_length(memory) <= 60
    and jsonb_typeof(decks) = 'array' and jsonb_array_length(decks) <= 3),
  constraint try_state_size check (octet_length(spaces::text) + octet_length(chat_space::text) + octet_length(memory::text) <= 120000 and octet_length(decks::text) <= 400000)
);
alter table public.try_state enable row level security;
drop policy if exists try_state_own on public.try_state;
create policy try_state_own on public.try_state for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.try_state to authenticated;

-- Test Run's daily quests: the same three for everyone that day (one easy, one medium, one bigger), picked here so
-- every browser agrees. They pay Cirkts into wallet.extra, once per quest per day, plus a bonus for all three.
create table if not exists public.try_quest_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  quest text not null,
  reward int not null,
  at timestamptz not null default now(),
  primary key (user_id, day, quest)
);
alter table public.try_quest_claims enable row level security;
drop policy if exists tqc_read on public.try_quest_claims;
create policy tqc_read on public.try_quest_claims for select using (user_id = auth.uid() or public.is_admin());

create or replace function public.try_quest_pool()
returns jsonb language sql immutable as $$
  select '[
    {"id":"tq_chat3","tier":0,"text":"Send 3 messages","n":3},
    {"id":"tq_web","tier":0,"text":"Search the web for something","n":1},
    {"id":"tq_feat","tier":0,"text":"Use any @feature","n":1},
    {"id":"tq_starter","tier":0,"text":"Try a prompt starter","n":1},
    {"id":"tq_agent","tier":1,"text":"Ask a second agent","n":1},
    {"id":"tq_memory","tier":1,"text":"Teach Nexus something to remember","n":1},
    {"id":"tq_deck","tier":1,"text":"Make or review a study deck","n":1},
    {"id":"tq_space","tier":1,"text":"Put a chat in a Space","n":1},
    {"id":"tq_huddle","tier":2,"text":"Start a @huddle","n":1},
    {"id":"tq_debate","tier":2,"text":"Run a @debate","n":1},
    {"id":"tq_review10","tier":2,"text":"Review 10 flashcards","n":10},
    {"id":"tq_voice","tier":2,"text":"Have a conversation in voice mode","n":1},
    {"id":"tq_share","tier":2,"text":"Share a chat as a link","n":1}
  ]'::jsonb
$$;

-- p_day: the browser's own date (so quests change at its midnight), allowed within a day of the server's
create or replace function public.try_quests_today(p_day date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d date := coalesce(p_day, current_date); h text; pool jsonb := public.try_quest_pool(); picks jsonb := '[]'::jsonb; t int; tierlist jsonb; pay int[] := array[15, 20, 30];
begin
  if d not between current_date - 1 and current_date + 1 then d := current_date; end if;
  h := md5('try-quests-' || d::text);
  for t in 0..2 loop
    select jsonb_agg(q order by q ->> 'id') into tierlist from jsonb_array_elements(pool) q where (q ->> 'tier')::int = t;
    picks := picks || jsonb_build_array((tierlist -> (('x' || substr(h, 1 + t * 4, 4))::bit(16)::int % jsonb_array_length(tierlist))) || jsonb_build_object('reward', pay[t + 1]));
  end loop;
  return jsonb_build_object('day', d, 'quests', picks, 'bonus', 25,
    'claimed', coalesce((select jsonb_agg(quest) from try_quest_claims where user_id = auth.uid() and day = d), '[]'::jsonb));
end $$;

create or replace function public.try_quest_claim(p_quest text, p_day date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); today jsonb; d date; q jsonb; n int; bonus int := 0;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Sign in first.'); end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then return jsonb_build_object('ok', false, 'error', 'Make a free account to earn Cirkts.'); end if;
  today := public.try_quests_today(p_day); d := (today ->> 'day')::date;
  select x into q from jsonb_array_elements(today -> 'quests') x where x ->> 'id' = p_quest;
  if q is null then return jsonb_build_object('ok', false, 'error', 'That isn''t one of today''s quests.'); end if;
  insert into try_quest_claims (user_id, day, quest, reward) values (me, d, p_quest, (q ->> 'reward')::int) on conflict do nothing;
  if not found then return jsonb_build_object('ok', false, 'error', 'Already done today.', 'done', true); end if;
  insert into cirkts_wallet (user_id, earned, extra, migrated_at) values (me, 0, 0, now()) on conflict (user_id) do nothing;
  select count(*) into n from try_quest_claims where user_id = me and day = d and quest <> 'all';
  if n >= 3 then
    insert into try_quest_claims (user_id, day, quest, reward) values (me, d, 'all', 25) on conflict do nothing;
    if found then bonus := 25; end if;
  end if;
  update cirkts_wallet set extra = extra + (q ->> 'reward')::int + bonus where user_id = me;
  return public.cirkts_state() || jsonb_build_object('reward', (q ->> 'reward')::int, 'bonus', bonus, 'quest', p_quest);
end $$;
revoke all on function public.try_quest_claim(text, date) from public, anon;
grant execute on function public.try_quest_claim(text, date) to authenticated;
grant execute on function public.try_quests_today(date) to authenticated;

-- 3) ------------------------------------------------------------------------------------------------------
create table if not exists public.shared_chats (
  id text primary key check (id ~ '^[A-Za-z0-9]{10,16}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '' check (char_length(title) <= 120),
  agent text not null default '' check (char_length(agent) <= 40),
  source text not null default 'test_run' check (source in ('mac', 'windows', 'phone', 'test_run')),
  messages jsonb not null check (jsonb_typeof(messages) = 'array' and jsonb_array_length(messages) between 1 and 200 and octet_length(messages::text) <= 600000),
  show_name boolean not null default false,
  views int not null default 0,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists shared_chats_user on public.shared_chats (user_id, created_at desc);
alter table public.shared_chats enable row level security;
drop policy if exists shared_chats_own on public.shared_chats;
create policy shared_chats_own on public.shared_chats for select using (user_id = auth.uid() or public.is_admin());
-- writes only through the functions below

-- only role, text, agent and time are kept from each message (no pictures, no hidden notes)
create or replace function public.share_chat_create(p_title text, p_agent text, p_messages jsonb, p_source text, p_show_name boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); slug text; clean jsonb;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Sign in first.'); end if;
  if (select count(*) from shared_chats where user_id = me and created_at > now() - interval '1 day') >= 40 then return jsonb_build_object('ok', false, 'error', 'That''s a lot of links today. Try again tomorrow.'); end if;
  if coalesce(p_source, '') not in ('mac', 'windows', 'phone', 'test_run') then return jsonb_build_object('ok', false, 'error', 'Unknown app.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('role', m ->> 'role', 'content', left(coalesce(m ->> 'content', ''), 40000), 'agent', left(coalesce(m ->> 'agent', ''), 40), 'ts', m -> 'ts')), '[]'::jsonb) into clean
    from (select m from jsonb_array_elements(coalesce(p_messages, '[]'::jsonb)) m where m ->> 'role' in ('user', 'assistant') and coalesce(m ->> 'content', '') <> '' limit 200) x;
  if jsonb_array_length(clean) = 0 then return jsonb_build_object('ok', false, 'error', 'This chat is empty.'); end if;
  if octet_length(clean::text) > 600000 then return jsonb_build_object('ok', false, 'error', 'This chat is too long to share. Branch it and share part of it.'); end if;
  slug := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  insert into shared_chats (id, user_id, title, agent, source, messages, show_name) values (slug, me, left(coalesce(p_title, ''), 120), left(coalesce(p_agent, ''), 40), p_source, clean, coalesce(p_show_name, false));
  return jsonb_build_object('ok', true, 'id', slug);
end $$;

-- anyone with the link (no sign-in); a stopped link says so
create or replace function public.share_chat_get(p_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r shared_chats; who text;
begin
  select * into r from shared_chats where id = p_id;
  if r.id is null or r.revoked then return jsonb_build_object('ok', false, 'error', 'This link was stopped or never existed.'); end if;
  update shared_chats set views = views + 1 where id = p_id;
  if r.show_name then select coalesce(nullif(username, ''), 'someone') into who from profiles where id = r.user_id; end if;
  return jsonb_build_object('ok', true, 'id', r.id, 'title', r.title, 'agent', r.agent, 'source', r.source, 'messages', r.messages, 'created_at', r.created_at, 'by', who);
end $$;

create or replace function public.share_chat_stop(p_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update shared_chats set revoked = true where id = p_id and (user_id = auth.uid() or public.is_admin());
  return jsonb_build_object('ok', found);
end $$;

create or replace function public.my_shared_chats()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'source', source, 'views', views, 'revoked', revoked, 'created_at', created_at) order by created_at desc), '[]'::jsonb)
  from (select * from shared_chats where user_id = auth.uid() order by created_at desc limit 100) x;
$$;
revoke all on function public.share_chat_create(text, text, jsonb, text, boolean) from public, anon;
grant execute on function public.share_chat_create(text, text, jsonb, text, boolean) to authenticated;
grant execute on function public.share_chat_get(text) to anon, authenticated;
revoke all on function public.share_chat_stop(text) from public, anon;
grant execute on function public.share_chat_stop(text) to authenticated;
revoke all on function public.my_shared_chats() from public, anon;
grant execute on function public.my_shared_chats() to authenticated;

-- 4) ------------------------------------------------------------------------------------------------------
-- device: a random id made by the app (not your account). events: [{ t (ms from start), k (kind), s (screen), l (label),
-- x, y (0–1 of the window) }]. Labels are the app's own names for its buttons, never anything you typed.
create table if not exists public.session_replays (
  id uuid primary key default gen_random_uuid(),
  app text not null check (app in ('mac', 'windows', 'phone', 'test_run')),
  version text not null default '' check (char_length(version) <= 24),
  device text not null check (device ~ '^[a-z0-9]{8,40}$'),
  variants jsonb not null default '{}'::jsonb check (jsonb_typeof(variants) = 'object' and octet_length(variants::text) <= 2000),
  screen jsonb not null default '{}'::jsonb check (octet_length(screen::text) <= 200),
  events jsonb not null check (jsonb_typeof(events) = 'array' and jsonb_array_length(events) <= 600 and octet_length(events::text) <= 120000),
  steps int not null default 0,
  errors int not null default 0,
  duration_ms int not null default 0,
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists session_replays_when on public.session_replays (created_at desc);
create index if not exists session_replays_app on public.session_replays (app, created_at desc);
alter table public.session_replays enable row level security;
drop policy if exists session_replays_admin on public.session_replays;
create policy session_replays_admin on public.session_replays for select using (public.is_admin());

-- the apps send a finished session here. No user id is stored. A device can send at most 60 an hour.
create or replace function public.replay_save(p_app text, p_version text, p_device text, p_variants jsonb, p_screen jsonb, p_events jsonb, p_started timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ev jsonb; n int; errs int; dur int;
begin
  if coalesce(p_app, '') not in ('mac', 'windows', 'phone', 'test_run') or coalesce(p_device, '') !~ '^[a-z0-9]{8,40}$' then return jsonb_build_object('ok', false); end if;
  if (select count(*) from session_replays where device = p_device and created_at > now() - interval '1 hour') >= 60 then return jsonb_build_object('ok', false, 'error', 'slow down'); end if;
  -- keep only the known fields, short labels, numbers in range
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      't', greatest(0, least(coalesce((e ->> 't')::numeric, 0), 86400000))::int,
      'k', left(coalesce(e ->> 'k', ''), 12),
      's', left(e ->> 's', 40),
      'l', left(e ->> 'l', 48),
      'x', case when e ? 'x' then round(greatest(0, least((e ->> 'x')::numeric, 1)), 3) end,
      'y', case when e ? 'y' then round(greatest(0, least((e ->> 'y')::numeric, 1)), 3) end))), '[]'::jsonb)
    into ev from (select e from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) e where jsonb_typeof(e) = 'object' limit 600) x;
  n := jsonb_array_length(ev);
  if n < 2 then return jsonb_build_object('ok', false); end if;
  select count(*) into errs from jsonb_array_elements(ev) e where e ->> 'k' = 'error';
  select coalesce(max((e ->> 't')::int), 0) into dur from jsonb_array_elements(ev) e;
  insert into session_replays (app, version, device, variants, screen, events, steps, errors, duration_ms, started_at)
    values (p_app, left(coalesce(p_version, ''), 24), p_device, coalesce(p_variants, '{}'::jsonb), coalesce(p_screen, '{}'::jsonb), ev,
            (select count(*) from jsonb_array_elements(ev) e where e ->> 'k' in ('click', 'view', 'send')), errs, dur,
            least(coalesce(p_started, now()), now()));
  delete from session_replays where created_at < now() - interval '30 days';
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.replay_save(text, text, text, jsonb, jsonb, jsonb, timestamptz) to anon, authenticated;

-- 5) ------------------------------------------------------------------------------------------------------
alter table public.feature_flags add column if not exists rollout smallint not null default 100;
alter table public.feature_flags drop constraint if exists feature_flags_rollout_check;
alter table public.feature_flags add constraint feature_flags_rollout_check check (rollout between 1 and 100);

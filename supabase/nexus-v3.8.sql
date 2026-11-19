-- Nexus '28 3.8 + Apoji Admin 2.3 — run once in the Supabase SQL editor (after nexus-v3.7.sql). Safe to run again.
--   1. Where people use Nexus ("active on": Mac app, Windows app, Test Run, N28C, Apoji Admin) + "got the app" events
--   2. Feedback: pictures on reports (private storage), bug vs feature kept apart
--   3. Apoji Admin access requests: named permissions, approvers picked by the Owner
--   4. Typing indicator switches in Apoji Admin
--   5. "Needs testing" checklists for beta testers
--   6. Training data for Nexus models: beta testers' consent + opt-in examples (rated answers, corrections)

-- ============================================================ 1. active on
create table if not exists public.user_presence (
  user_id uuid not null references auth.users(id) on delete cascade,
  surface text not null check (surface in ('mac', 'windows', 'linux', 'test_run', 'phone', 'admin')),
  version text not null default '' check (char_length(version) <= 40),
  first_seen timestamptz not null default now(),
  seen_at timestamptz not null default now(),
  primary key (user_id, surface)
);
alter table public.user_presence enable row level security;
drop policy if exists user_presence_read on public.user_presence;
create policy user_presence_read on public.user_presence for select using (user_id = auth.uid() or public.is_admin());

create table if not exists public.user_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('got_app', 'first_seen')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists user_events_user_idx on public.user_events (user_id, created_at desc);
alter table public.user_events enable row level security;
drop policy if exists user_events_admin_read on public.user_events;
create policy user_events_admin_read on public.user_events for select using (public.is_admin());

-- every couple of minutes while an app is open (cheap: one row per person per app)
create or replace function public.presence_ping(p_surface text, p_version text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare fresh boolean;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false); end if;
  if p_surface not in ('mac', 'windows', 'linux', 'test_run', 'phone', 'admin') then return jsonb_build_object('ok', false, 'error', 'bad_surface'); end if;
  insert into user_presence (user_id, surface, version) values (auth.uid(), p_surface, left(coalesce(p_version, ''), 40))
  on conflict (user_id, surface) do update set seen_at = now(), version = excluded.version
  returning (xmax = 0) into fresh;
  if fresh then
    insert into user_events (user_id, kind, detail) values (auth.uid(), 'first_seen', jsonb_build_object('surface', p_surface, 'version', p_version));
    -- a Test Run person who just installed the Mac or Windows app
    if p_surface in ('mac', 'windows') and exists (select 1 from user_presence where user_id = auth.uid() and surface = 'test_run') then
      insert into user_events (user_id, kind, detail) values (auth.uid(), 'got_app', jsonb_build_object('surface', p_surface, 'version', p_version));
    end if;
  end if;
  update profiles set last_active_at = now() where id = auth.uid();
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.presence_ping(text, text) from public, anon;
grant execute on function public.presence_ping(text, text) to authenticated;

-- ============================================================ 2. feedback pictures + kinds
alter table public.feedback_reports add column if not exists attachments jsonb not null default '[]'::jsonb;
do $$ begin
  alter table public.feedback_reports add constraint feedback_reports_attachments_check check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 4);
exception when duplicate_object then null; end $$;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback-files', 'feedback-files', false, 6291456, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set public = false, file_size_limit = 6291456, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists feedback_files_insert on storage.objects;
create policy feedback_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'feedback-files' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists feedback_files_read on storage.objects;
create policy feedback_files_read on storage.objects for select to authenticated
  using (bucket_id = 'feedback-files' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
drop policy if exists feedback_files_delete on storage.objects;
create policy feedback_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'feedback-files' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
-- reporters may add pictures to their own report right after sending it
drop policy if exists fr_attach_own on public.feedback_reports;
create policy fr_attach_own on public.feedback_reports for update to authenticated
  using (user_id = auth.uid() and created_at > now() - interval '15 minutes') with check (user_id = auth.uid());

-- ============================================================ 3. Apoji Admin permissions + access requests
-- The Owner and high-admins can do everything; mods and admins ask for one thing at a time.
create table if not exists public.admin_permissions (
  user_id uuid not null references auth.users(id) on delete cascade,
  perm text not null check (perm in ('users_edit', 'users_create', 'changelog', 'axiom', 'testing', 'training', 'roles', 'maintenance', 'flags')),
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  primary key (user_id, perm)
);
create table if not exists public.admin_perm_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  perm text not null,
  why text check (char_length(why) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  days int,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists admin_perm_requests_one_pending on public.admin_perm_requests (user_id, perm) where status = 'pending';
create table if not exists public.admin_perm_approvers (user_id uuid primary key references auth.users(id) on delete cascade, added_at timestamptz not null default now());
alter table public.admin_permissions enable row level security;
alter table public.admin_perm_requests enable row level security;
alter table public.admin_perm_approvers enable row level security;
drop policy if exists admin_permissions_read on public.admin_permissions;
create policy admin_permissions_read on public.admin_permissions for select using (public.is_admin());
drop policy if exists admin_perm_requests_read on public.admin_perm_requests;
create policy admin_perm_requests_read on public.admin_perm_requests for select using (user_id = auth.uid() or public.is_owner() or public.get_my_admin_level() = 'high-admin');
drop policy if exists admin_perm_approvers_read on public.admin_perm_approvers;
create policy admin_perm_approvers_read on public.admin_perm_approvers for select using (public.is_admin());

create or replace function public.admin_has_perm(p_perm text, p_uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_owner(p_uid)
      or exists (select 1 from admin_roles r where r.user_id = p_uid and r.level = 'high-admin' and coalesce(r.high_tier, 'editor') <> 'viewer')
      or exists (select 1 from admin_permissions g where g.user_id = p_uid and g.perm = p_perm and (g.expires_at is null or g.expires_at > now())
                 and exists (select 1 from admin_roles r2 where r2.user_id = p_uid));
$$;
create or replace function public.admin_can_approve() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_owner() or (public.get_my_admin_level() = 'high-admin' and exists (select 1 from admin_perm_approvers a where a.user_id = auth.uid()));
$$;
create or replace function public.admin_my_perms() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('all', public.is_owner() or exists (select 1 from admin_roles r where r.user_id = auth.uid() and r.level = 'high-admin' and coalesce(r.high_tier, 'editor') <> 'viewer'),
    'approve', public.admin_can_approve(),
    'perms', coalesce((select jsonb_agg(jsonb_build_object('perm', perm, 'expires_at', expires_at)) from admin_permissions where user_id = auth.uid() and (expires_at is null or expires_at > now())), '[]'::jsonb),
    'pending', coalesce((select jsonb_agg(perm) from admin_perm_requests where user_id = auth.uid() and status = 'pending'), '[]'::jsonb));
$$;
create or replace function public.admin_request_perm(p_perm text, p_why text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'error', 'Admins only.'); end if;
  if public.admin_has_perm(p_perm) then return jsonb_build_object('ok', false, 'error', 'You already have that.'); end if;
  insert into admin_perm_requests (user_id, perm, why) values (auth.uid(), p_perm, left(coalesce(p_why, ''), 500))
  on conflict (user_id, perm) where status = 'pending' do update set why = excluded.why, created_at = now();
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.admin_grant_perm(p_user uuid, p_perm text, p_days int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.admin_can_approve() then return jsonb_build_object('ok', false, 'error', 'Only the Owner and the high-admins they picked can give access.'); end if;
  if not exists (select 1 from admin_roles where user_id = p_user) then return jsonb_build_object('ok', false, 'error', 'They need an admin role first.'); end if;
  insert into admin_permissions (user_id, perm, granted_by, expires_at) values (p_user, p_perm, auth.uid(), case when p_days > 0 then now() + make_interval(days => p_days) end)
  on conflict (user_id, perm) do update set granted_by = auth.uid(), granted_at = now(), expires_at = excluded.expires_at;
  update admin_perm_requests set status = 'approved', days = p_days, decided_by = auth.uid(), decided_at = now() where user_id = p_user and perm = p_perm and status = 'pending';
  insert into moderation_log (action, target_user_id, performed_by, details) values ('admin_perm_granted', p_user, auth.uid(), jsonb_build_object('perm', p_perm, 'days', p_days));
  return jsonb_build_object('ok', true);
exception when others then return jsonb_build_object('ok', false, 'error', sqlerrm);
end $$;
create or replace function public.admin_decide_perm(p_id bigint, p_ok boolean, p_days int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r admin_perm_requests;
begin
  if not public.admin_can_approve() then return jsonb_build_object('ok', false, 'error', 'Only the Owner and the high-admins they picked can decide.'); end if;
  select * into r from admin_perm_requests where id = p_id and status = 'pending';
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'That request is gone.'); end if;
  if p_ok then return public.admin_grant_perm(r.user_id, r.perm, p_days); end if;
  update admin_perm_requests set status = 'declined', decided_by = auth.uid(), decided_at = now() where id = p_id;
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.admin_revoke_perm(p_user uuid, p_perm text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.admin_can_approve() then return jsonb_build_object('ok', false, 'error', 'Only the Owner and the high-admins they picked can take access away.'); end if;
  delete from admin_permissions where user_id = p_user and perm = p_perm;
  insert into moderation_log (action, target_user_id, performed_by, details) values ('admin_perm_revoked', p_user, auth.uid(), jsonb_build_object('perm', p_perm));
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.admin_set_approver(p_user uuid, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then return jsonb_build_object('ok', false, 'error', 'Only the Owner picks who can approve.'); end if;
  if p_on then
    if not exists (select 1 from admin_roles where user_id = p_user and level = 'high-admin') then return jsonb_build_object('ok', false, 'error', 'Approvers must be high-admins.'); end if;
    insert into admin_perm_approvers (user_id) values (p_user) on conflict do nothing;
  else delete from admin_perm_approvers where user_id = p_user; end if;
  return jsonb_build_object('ok', true);
end $$;
do $$ declare f text; begin
  foreach f in array array['admin_has_perm(text, uuid)', 'admin_can_approve()', 'admin_my_perms()', 'admin_request_perm(text, text)', 'admin_grant_perm(uuid, text, int)', 'admin_decide_perm(bigint, boolean, int)', 'admin_revoke_perm(uuid, text)', 'admin_set_approver(uuid, boolean)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ============================================================ 4. typing indicator switches
alter table public.admin_prefs add column if not exists typing_send boolean not null default true;
alter table public.admin_prefs add column if not exists typing_show boolean not null default true;

-- ============================================================ 5. "needs testing" checklists
create table if not exists public.test_items (
  id bigint generated always as identity primary key,
  release text not null check (char_length(release) between 1 and 40),
  platform text not null default 'all' check (platform in ('all', 'mac', 'windows', 'web', 'phone', 'admin')),
  title text not null check (char_length(title) between 1 and 200),
  steps text not null default '' check (char_length(steps) <= 2000),
  sort int not null default 0,
  archived boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.test_results (
  item_id bigint not null references public.test_items(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  status text not null check (status in ('pass', 'fail', 'skip')),
  platform text not null default '' check (char_length(platform) <= 20),
  note text not null default '' check (char_length(note) <= 1000),
  image text check (char_length(image) <= 300),
  updated_at timestamptz not null default now(),
  primary key (item_id, user_id)
);
alter table public.test_items enable row level security;
alter table public.test_results enable row level security;
create or replace function public.is_tester() returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (select 1 from profiles where id = auth.uid() and is_beta_tester);
$$;
drop policy if exists test_items_read on public.test_items;
create policy test_items_read on public.test_items for select using (public.is_tester());
drop policy if exists test_items_write on public.test_items;
create policy test_items_write on public.test_items for all using (public.admin_has_perm('testing')) with check (public.admin_has_perm('testing'));
drop policy if exists test_results_read on public.test_results;
create policy test_results_read on public.test_results for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists test_results_write on public.test_results;
create policy test_results_write on public.test_results for insert to authenticated with check (user_id = auth.uid() and public.is_tester());
drop policy if exists test_results_update on public.test_results;
create policy test_results_update on public.test_results for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists test_results_delete on public.test_results;
create policy test_results_delete on public.test_results for delete to authenticated using (user_id = auth.uid());

-- ============================================================ 6. training data for Nexus models
-- Beta testers agree to share (it's the price of early features); anyone else can opt in. Revoking stops new
-- examples; "Delete my examples" removes everything they gave. Incognito chats and Axiom never go in.
create table if not exists public.training_consent (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version int not null default 1,
  agreed_at timestamptz not null default now(),
  revoked_at timestamptz
);
create table if not exists public.training_examples (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source text not null check (source in ('mac', 'windows', 'linux', 'test_run', 'phone')),
  agent text not null default '' check (char_length(agent) <= 40),
  model text not null default '' check (char_length(model) <= 120),
  features text[] not null default '{}',
  prompt text not null check (char_length(prompt) between 1 and 6000),
  answer text not null check (char_length(answer) between 1 and 12000),
  rating smallint not null default 0 check (rating between -1 and 1),
  correction text check (char_length(correction) <= 12000),
  created_at timestamptz not null default now()
);
create index if not exists training_examples_created_idx on public.training_examples (created_at desc);
alter table public.training_examples add column if not exists ref text check (char_length(ref) <= 80);   -- the app's handle for 👍 / 👎 later
create unique index if not exists training_examples_ref_idx on public.training_examples (user_id, ref) where ref is not null;
alter table public.training_consent enable row level security;
alter table public.training_examples enable row level security;
create or replace function public.training_ok(p_uid uuid default auth.uid()) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from training_consent where user_id = p_uid and revoked_at is null);
$$;
drop policy if exists training_consent_own on public.training_consent;
create policy training_consent_own on public.training_consent for select using (user_id = auth.uid() or public.admin_has_perm('training'));
drop policy if exists training_examples_insert on public.training_examples;
create policy training_examples_insert on public.training_examples for insert to authenticated with check (user_id = auth.uid() and public.training_ok());
drop policy if exists training_examples_read on public.training_examples;
create policy training_examples_read on public.training_examples for select using (user_id = auth.uid() or public.admin_has_perm('training'));
drop policy if exists training_examples_rate_own on public.training_examples;
create policy training_examples_rate_own on public.training_examples for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists training_examples_delete on public.training_examples;
create policy training_examples_delete on public.training_examples for delete using (user_id = auth.uid() or public.admin_has_perm('training'));

create or replace function public.training_set_consent(p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return jsonb_build_object('ok', false); end if;
  if p_on then insert into training_consent (user_id) values (auth.uid()) on conflict (user_id) do update set agreed_at = now(), revoked_at = null;
  else update training_consent set revoked_at = now() where user_id = auth.uid(); end if;
  return jsonb_build_object('ok', true, 'on', p_on);
end $$;
create or replace function public.training_my_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('on', public.training_ok(), 'agreed_at', (select agreed_at from training_consent where user_id = auth.uid()),
    'examples', (select count(*) from training_examples where user_id = auth.uid()),
    'tester', exists (select 1 from profiles where id = auth.uid() and is_beta_tester));
$$;
create or replace function public.training_delete_mine() returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from training_examples where user_id = auth.uid(); get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'deleted', n);
end $$;
create or replace function public.admin_training_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.admin_has_perm('training') then raise exception 'not allowed'; end if;
  return jsonb_build_object(
    'total', (select count(*) from training_examples),
    'week', (select count(*) from training_examples where created_at > now() - interval '7 days'),
    'people', (select count(distinct user_id) from training_examples),
    'consenting', (select count(*) from training_consent where revoked_at is null),
    'testers', (select count(*) from profiles where is_beta_tester),
    'testers_consenting', (select count(*) from profiles p join training_consent c on c.user_id = p.id and c.revoked_at is null where p.is_beta_tester),
    'up', (select count(*) from training_examples where rating = 1),
    'down', (select count(*) from training_examples where rating = -1),
    'corrected', (select count(*) from training_examples where correction is not null),
    'by_agent', coalesce((select jsonb_object_agg(agent, n) from (select coalesce(nullif(agent, ''), '?') agent, count(*) n from training_examples group by 1) a), '{}'::jsonb),
    'by_source', coalesce((select jsonb_object_agg(source, n) from (select source, count(*) n from training_examples group by 1) s), '{}'::jsonb),
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'n', n) order by d) from (select created_at::date d, count(*) n from training_examples where created_at > now() - interval '30 days' group by 1) x), '[]'::jsonb));
end $$;
do $$ declare f text; begin
  foreach f in array array['training_ok(uuid)', 'training_set_consent(boolean)', 'training_my_status()', 'training_delete_mine()', 'admin_training_stats()', 'is_tester()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- realtime for the Admin badges / "got the app" toasts
do $$ begin
  begin alter publication supabase_realtime add table public.admin_perm_requests; exception when others then null; end;
  begin alter publication supabase_realtime add table public.user_events; exception when others then null; end;
  begin alter publication supabase_realtime add table public.test_results; exception when others then null; end;
end $$;

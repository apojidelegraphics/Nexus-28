-- Nexus '28 v2.0 — beta tester requests (sent from the app's Account settings) and the admin portal's review queue.
-- Run once. Safe to run again. Uses the existing public.is_admin() and moderation_log.

create table if not exists public.beta_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  email text not null default '' check (char_length(email) <= 200),
  username text not null default '' check (char_length(username) <= 60),
  why text not null default '' check (char_length(why) <= 2000),
  uses text not null default '' check (char_length(uses) <= 1000),
  app_version text not null default '' check (char_length(app_version) <= 40),
  source text not null default 'desktop' check (source in ('desktop', 'phone', 'web')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  note text not null default '' check (char_length(note) <= 500),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
-- One open request per person.
create unique index if not exists beta_requests_one_pending on public.beta_requests (user_id) where status = 'pending';
create index if not exists beta_requests_created on public.beta_requests (created_at desc);

alter table public.beta_requests enable row level security;
drop policy if exists beta_requests_insert_own on public.beta_requests;
create policy beta_requests_insert_own on public.beta_requests for insert
  with check (auth.uid() = user_id and status = 'pending' and reviewed_by is null and reviewed_at is null and note = '');
drop policy if exists beta_requests_select_own on public.beta_requests;
create policy beta_requests_select_own on public.beta_requests for select using (auth.uid() = user_id);
drop policy if exists beta_requests_admin_select on public.beta_requests;
create policy beta_requests_admin_select on public.beta_requests for select using (public.is_admin());
drop policy if exists beta_requests_withdraw_own on public.beta_requests;
create policy beta_requests_withdraw_own on public.beta_requests for delete using (auth.uid() = user_id and status = 'pending');
-- (admins change requests only through the function below, so every decision is logged)

-- Approve (turns on beta for the account) or decline a request. Admins only.
create or replace function public.admin_review_beta_request(request_id uuid, approve boolean, review_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.beta_requests;
begin
  if not public.is_admin() then return jsonb_build_object('success', false, 'error', 'not_admin'); end if;
  select * into r from public.beta_requests where id = request_id;
  if r.id is null then return jsonb_build_object('success', false, 'error', 'not_found'); end if;
  update public.beta_requests set status = case when approve then 'approved' else 'declined' end,
    note = left(coalesce(review_note, ''), 500), reviewed_by = auth.uid(), reviewed_at = now() where id = request_id;
  if approve then update public.profiles set is_beta_tester = true where id = r.user_id; end if;
  insert into public.moderation_log (action, target_user_id, target_email, performed_by, details)
    values (case when approve then 'beta_request_approved' else 'beta_request_declined' end, r.user_id, r.email, auth.uid(), jsonb_build_object('request', request_id, 'note', review_note));
  return jsonb_build_object('success', true, 'status', case when approve then 'approved' else 'declined' end);
end $$;
revoke all on function public.admin_review_beta_request(uuid, boolean, text) from public, anon;
grant execute on function public.admin_review_beta_request(uuid, boolean, text) to authenticated;

-- Admin portal overview numbers in one call.
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then return jsonb_build_object('success', false, 'error', 'not_admin'); end if;
  return jsonb_build_object('success', true,
    'users', (select count(*) from auth.users),
    'new_users_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'beta_testers', (select count(*) from public.profiles where is_beta_tester),
    'pending_requests', (select count(*) from public.beta_requests where status = 'pending'),
    'admins', (select count(*) from public.admin_roles),
    'moderated', (select count(*) from public.user_moderation where status <> 'active'),
    'shared_spaces', (select count(*) from public.shared_spaces),
    'phone_users_24h', (select count(distinct user_id) from public.companion_sync where key = 'status' and updated_at > now() - interval '1 day'));
end $$;
revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

-- Nexus '28 v2.2: admin chat upgrade (group chats, images and files, read receipts, presence), profile pictures,
-- account themes for the portal, a live dashboard, deeper user tools, a feedback and reports inbox, content
-- moderation, and maintenance that the apps actually enforce. Run once in Supabase → SQL Editor, after
-- nexus-v2.1.sql. Safe to run again.

-- =====================================================================================================
-- 0) Profiles: picture, theme (the portal follows your app's theme), last active.
-- =====================================================================================================
alter table public.profiles add column if not exists avatar_url text check (avatar_url is null or char_length(avatar_url) <= 500);
alter table public.profiles add column if not exists theme jsonb;
alter table public.profiles add column if not exists last_active_at timestamptz;

alter table public.profiles drop constraint if exists profiles_theme_size;
alter table public.profiles add constraint profiles_theme_size check (theme is null or pg_column_size(theme) < 4000);
-- (beta and comp are already protected by your existing profiles_protect_flags trigger: only admins can change them)

-- Profile pictures: public bucket, each person writes only their own folder (<user id>/avatar.png).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects for update using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects for delete using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================================================
-- 1) Activity: the apps check in (at most a few times a day) so the dashboard can show active users and versions.
-- =====================================================================================================
create table if not exists public.app_activity (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null default current_date,
  source text not null check (source in ('desktop', 'phone', 'web', 'portal')),
  version text not null default '' check (char_length(version) <= 40),
  pings integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, day, source)
);
create index if not exists app_activity_day on public.app_activity (day);
alter table public.app_activity enable row level security;
drop policy if exists aa_select on public.app_activity;
create policy aa_select on public.app_activity for select using (user_id = auth.uid() or public.is_admin());

create or replace function public.log_activity(p_source text, p_version text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.user_moderation;
begin
  if auth.uid() is null then return jsonb_build_object('success', false, 'error', 'not_signed_in'); end if;
  if p_source not in ('desktop', 'phone', 'web', 'portal') then return jsonb_build_object('success', false, 'error', 'bad_source'); end if;
  insert into public.app_activity (user_id, day, source, version) values (auth.uid(), current_date, p_source, left(coalesce(p_version, ''), 40))
  on conflict (user_id, day, source) do update set pings = public.app_activity.pings + 1, version = excluded.version, updated_at = now();
  update public.profiles set last_active_at = now() where id = auth.uid();
  select * into m from public.user_moderation where user_id = auth.uid();
  return jsonb_build_object('success', true, 'moderation', case when m.user_id is null or m.status = 'active'
    or (m.status = 'suspended' and m.suspended_until is not null and m.suspended_until < now()) then null
    else jsonb_build_object('status', m.status, 'reason', m.reason, 'suspended_until', m.suspended_until) end);
end $$;
revoke all on function public.log_activity(text, text) from public, anon;
grant execute on function public.log_activity(text, text) to authenticated;

-- =====================================================================================================
-- 2) Admin chat: group chats, images/files, replies, reactions, edits, read receipts, presence
-- =====================================================================================================
create table if not exists public.admin_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  emoji text not null default '' check (char_length(emoji) <= 8),
  color text not null default '#3dffa0' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.admin_group_members (
  group_id uuid not null references public.admin_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  added_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
alter table public.admin_groups enable row level security;
alter table public.admin_group_members enable row level security;

-- Can the signed-in admin use this room? 'all' · 'dm:<uid>:<uid>' (you're one of them) · 'g:<group id>' (you're a member)
create or replace function public.admin_can_room(r text) returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() and (
    r = 'all'
    or (r ~ '^dm:[0-9a-f-]{36}:[0-9a-f-]{36}$' and position(auth.uid()::text in r) > 0)
    or (r ~ '^g:[0-9a-f-]{36}$' and exists (select 1 from public.admin_group_members m where m.group_id = substring(r from 3)::uuid and m.user_id = auth.uid()))
  );
$$;
revoke all on function public.admin_can_room(text) from public, anon;
grant execute on function public.admin_can_room(text) to authenticated;

drop policy if exists ag_select on public.admin_groups;
create policy ag_select on public.admin_groups for select using (public.admin_can_room('g:' || id::text));
drop policy if exists agm_select on public.admin_group_members;
create policy agm_select on public.admin_group_members for select using (public.admin_can_room('g:' || group_id::text));

alter table public.admin_messages drop constraint if exists admin_messages_room_check;
alter table public.admin_messages drop constraint if exists admin_messages_body_check;
alter table public.admin_messages add constraint admin_messages_room_check check (room = 'all' or room ~ '^dm:[0-9a-f-]{36}:[0-9a-f-]{36}$' or room ~ '^g:[0-9a-f-]{36}$');
alter table public.admin_messages add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.admin_messages add column if not exists reply_to bigint;
alter table public.admin_messages add column if not exists reactions jsonb not null default '{}'::jsonb;
alter table public.admin_messages add column if not exists edited_at timestamptz;
alter table public.admin_messages add column if not exists deleted boolean not null default false;
alter table public.admin_messages add constraint admin_messages_body_check check (char_length(body) <= 4000 and (deleted or char_length(body) > 0 or jsonb_array_length(attachments) > 0));
alter table public.admin_messages drop constraint if exists admin_messages_attach_check;
alter table public.admin_messages add constraint admin_messages_attach_check check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 10);

drop policy if exists am_select on public.admin_messages;
create policy am_select on public.admin_messages for select using (public.admin_can_room(room));
drop policy if exists am_insert on public.admin_messages;
create policy am_insert on public.admin_messages for insert with check (sender = auth.uid() and public.admin_can_room(room) and reactions = '{}'::jsonb and edited_at is null and deleted = false);
drop policy if exists am_delete_own on public.admin_messages;   -- deleting goes through admin_delete_message (keeps the thread readable)

create or replace function public.admin_create_group(p_name text, p_members uuid[], p_color text default '#3dffa0', p_emoji text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare g uuid; u uuid;
begin
  if not public.is_admin() then return jsonb_build_object('success', false, 'error', 'not_admin'); end if;
  if char_length(trim(coalesce(p_name, ''))) = 0 then return jsonb_build_object('success', false, 'error', 'name_required'); end if;
  insert into public.admin_groups (name, color, emoji) values (left(trim(p_name), 40), case when p_color ~ '^#[0-9a-fA-F]{6}$' then p_color else '#3dffa0' end, left(coalesce(p_emoji, ''), 8)) returning id into g;
  insert into public.admin_group_members (group_id, user_id, role) values (g, auth.uid(), 'owner');
  foreach u in array coalesce(p_members, '{}') loop
    if u <> auth.uid() and exists (select 1 from public.admin_roles where user_id = u) then
      insert into public.admin_group_members (group_id, user_id) values (g, u) on conflict do nothing;
    end if;
  end loop;
  return jsonb_build_object('success', true, 'id', g, 'room', 'g:' || g);
end $$;

create or replace function public.admin_update_group(p_group uuid, p_name text default null, p_color text default null, p_emoji text default null, p_add uuid[] default '{}', p_remove uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid; owner boolean;
begin
  if not public.admin_can_room('g:' || p_group) then return jsonb_build_object('success', false, 'error', 'not_found'); end if;
  owner := exists (select 1 from public.admin_group_members where group_id = p_group and user_id = auth.uid() and role = 'owner') or public.get_my_admin_level() = 'high-admin';
  -- anyone in the group can rename it and add admins; only the owner (or a high-admin) can remove other people
  update public.admin_groups set name = coalesce(nullif(left(trim(p_name), 40), ''), name),
    color = case when p_color ~ '^#[0-9a-fA-F]{6}$' then p_color else color end, emoji = coalesce(left(p_emoji, 8), emoji) where id = p_group;
  foreach u in array coalesce(p_add, '{}') loop
    if exists (select 1 from public.admin_roles where user_id = u) then insert into public.admin_group_members (group_id, user_id) values (p_group, u) on conflict do nothing; end if;
  end loop;
  foreach u in array coalesce(p_remove, '{}') loop
    if u = auth.uid() or owner then delete from public.admin_group_members where group_id = p_group and user_id = u; end if;
  end loop;
  if not exists (select 1 from public.admin_group_members where group_id = p_group) then delete from public.admin_groups where id = p_group;
  elsif not exists (select 1 from public.admin_group_members where group_id = p_group and role = 'owner') then
    update public.admin_group_members set role = 'owner' where group_id = p_group and user_id = (select user_id from public.admin_group_members where group_id = p_group order by added_at limit 1);
  end if;
  return jsonb_build_object('success', true);
end $$;

create or replace function public.admin_react(p_message bigint, p_emoji text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.admin_messages; list jsonb; me text := auth.uid()::text;
begin
  select * into m from public.admin_messages where id = p_message;
  if m.id is null or not public.admin_can_room(m.room) or m.deleted then return jsonb_build_object('success', false, 'error', 'not_found'); end if;
  if char_length(coalesce(p_emoji, '')) not between 1 and 8 then return jsonb_build_object('success', false, 'error', 'bad_emoji'); end if;
  list := coalesce(m.reactions -> p_emoji, '[]'::jsonb);
  if list ? me then list := list - me; else list := list || to_jsonb(me); end if;
  update public.admin_messages set reactions = case when jsonb_array_length(list) = 0 then reactions - p_emoji else jsonb_set(reactions, array[p_emoji], list) end where id = p_message;
  return jsonb_build_object('success', true);
end $$;

create or replace function public.admin_edit_message(p_message bigint, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if char_length(coalesce(p_body, '')) not between 1 and 4000 then return jsonb_build_object('success', false, 'error', 'bad_body'); end if;
  update public.admin_messages set body = p_body, edited_at = now() where id = p_message and sender = auth.uid() and not deleted and public.admin_can_room(room);
  return jsonb_build_object('success', found);
end $$;

create or replace function public.admin_delete_message(p_message bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update public.admin_messages set deleted = true, body = '', attachments = '[]'::jsonb, reactions = '{}'::jsonb, edited_at = now()
  where id = p_message and public.admin_can_room(room) and (sender = auth.uid() or public.get_my_admin_level() = 'high-admin');
  return jsonb_build_object('success', found);
end $$;

-- Read receipts. If you turn them off, nobody sees yours and you don't see anyone's.
create table if not exists public.admin_prefs (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  read_receipts boolean not null default true,
  status text not null default 'auto' check (status in ('auto', 'dnd', 'invisible')),
  status_text text not null default '' check (char_length(status_text) <= 80),
  idle boolean not null default false,
  last_seen timestamptz,
  muted_rooms jsonb not null default '[]'::jsonb,
  notify jsonb not null default '{"chat": true, "requests": true, "feedback": true, "reports": true, "sound": true}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.admin_prefs enable row level security;
drop policy if exists ap_select on public.admin_prefs;
create policy ap_select on public.admin_prefs for select using (public.is_admin());
drop policy if exists ap_insert on public.admin_prefs;
create policy ap_insert on public.admin_prefs for insert with check (user_id = auth.uid() and public.is_admin());
drop policy if exists ap_update on public.admin_prefs;
create policy ap_update on public.admin_prefs for update using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_admin());

create table if not exists public.admin_reads (
  room text not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  last_read_id bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (room, user_id)
);
alter table public.admin_reads enable row level security;
drop policy if exists ar_select on public.admin_reads;
create policy ar_select on public.admin_reads for select using (
  public.admin_can_room(room) and (user_id = auth.uid() or (
    exists (select 1 from public.admin_prefs p where p.user_id = auth.uid() and p.read_receipts)
    and exists (select 1 from public.admin_prefs p where p.user_id = admin_reads.user_id and p.read_receipts))));
drop policy if exists ar_insert on public.admin_reads;
create policy ar_insert on public.admin_reads for insert with check (user_id = auth.uid() and public.admin_can_room(room));
drop policy if exists ar_update on public.admin_reads;
create policy ar_update on public.admin_reads for update using (user_id = auth.uid()) with check (user_id = auth.uid() and public.admin_can_room(room));

-- Files in chats: private bucket, folder = room id, only people in that room can see or add files. 10 MB each.
insert into storage.buckets (id, name, public, file_size_limit)
values ('admin-files', 'admin-files', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;
drop policy if exists admin_files_read on storage.objects;
create policy admin_files_read on storage.objects for select using (bucket_id = 'admin-files' and public.admin_can_room((storage.foldername(name))[1]));
drop policy if exists admin_files_insert on storage.objects;
create policy admin_files_insert on storage.objects for insert with check (bucket_id = 'admin-files' and public.admin_can_room((storage.foldername(name))[1]));
drop policy if exists admin_files_delete on storage.objects;
create policy admin_files_delete on storage.objects for delete using (bucket_id = 'admin-files' and owner = auth.uid());

-- The admin list now includes pictures, presence and settings.
create or replace function public.admin_list_admins()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then return jsonb_build_object('success', false, 'error', 'not_admin'); end if;
  return jsonb_build_object('success', true, 'me', auth.uid(), 'admins', (select coalesce(jsonb_agg(jsonb_build_object('id', r.user_id, 'level', r.level,
    'email', u.email, 'username', p.username, 'nickname', p.nickname, 'avatar_url', p.avatar_url, 'theme', p.theme,
    'status', coalesce(ap.status, 'auto'), 'status_text', coalesce(ap.status_text, ''), 'idle', coalesce(ap.idle, false), 'last_seen', ap.last_seen,
    'read_receipts', coalesce(ap.read_receipts, true)) order by u.email), '[]'::jsonb)
    from public.admin_roles r join auth.users u on u.id = r.user_id left join public.profiles p on p.id = r.user_id left join public.admin_prefs ap on ap.user_id = r.user_id));
end $$;

-- =====================================================================================================
-- 3) Feedback & bug reports inbox (from the apps), with replies the reporter sees in the app
-- =====================================================================================================
create table if not exists public.feedback_reports (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  email text not null default '' check (char_length(email) <= 200),
  username text not null default '' check (char_length(username) <= 60),
  kind text not null default 'feedback' check (kind in ('bug', 'feature', 'feedback', 'beta', 'other')),
  title text not null check (char_length(title) between 1 and 160),
  body text not null default '' check (char_length(body) <= 8000),
  feature text not null default '' check (char_length(feature) <= 60),
  info text not null default '' check (char_length(info) <= 4000),
  app_version text not null default '' check (char_length(app_version) <= 40),
  source text not null default 'desktop' check (source in ('desktop', 'phone', 'web')),
  status text not null default 'new' check (status in ('new', 'triaged', 'working', 'fixed', 'wontfix', 'closed')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assignee uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reply_at timestamptz,          -- last admin reply the reporter can see
  user_seen_at timestamptz       -- when the reporter last looked
);
create index if not exists feedback_reports_status on public.feedback_reports (status, created_at desc);
alter table public.feedback_reports enable row level security;
drop policy if exists fr_insert on public.feedback_reports;
create policy fr_insert on public.feedback_reports for insert with check (user_id = auth.uid() and status = 'new' and priority = 'normal' and assignee is null and reply_at is null);
drop policy if exists fr_select on public.feedback_reports;
create policy fr_select on public.feedback_reports for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists fr_admin_update on public.feedback_reports;
create policy fr_admin_update on public.feedback_reports for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists fr_admin_delete on public.feedback_reports;
create policy fr_admin_delete on public.feedback_reports for delete using (public.is_admin());

create or replace function public.feedback_rate_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.feedback_reports where user_id = new.user_id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'You''ve sent a lot of reports today. Try again tomorrow.' using errcode = '54000';
  end if;
  return new;
end $$;
drop trigger if exists feedback_rate_limit on public.feedback_reports;
create trigger feedback_rate_limit before insert on public.feedback_reports for each row execute function public.feedback_rate_limit();

create table if not exists public.feedback_replies (
  id bigint generated always as identity primary key,
  report_id bigint not null references public.feedback_reports(id) on delete cascade,
  author uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text not null default '' check (char_length(author_name) <= 60),
  is_staff boolean not null default false,
  internal boolean not null default false,     -- admin-only note, never shown to the reporter
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists feedback_replies_report on public.feedback_replies (report_id, id);
alter table public.feedback_replies enable row level security;
drop policy if exists frr_select on public.feedback_replies;
create policy frr_select on public.feedback_replies for select using (public.is_admin()
  or (not internal and exists (select 1 from public.feedback_reports f where f.id = report_id and f.user_id = auth.uid())));
drop policy if exists frr_insert on public.feedback_replies;
create policy frr_insert on public.feedback_replies for insert with check (author = auth.uid() and (
  (public.is_admin() and is_staff)
  or (not internal and not is_staff and exists (select 1 from public.feedback_reports f where f.id = report_id and f.user_id = auth.uid()))));

create or replace function public.feedback_reply_touch() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.feedback_reports set updated_at = now(), reply_at = case when new.is_staff and not new.internal then now() else reply_at end,
    status = case when not new.is_staff and status in ('fixed', 'wontfix', 'closed') then 'triaged' else status end where id = new.report_id;
  return new;
end $$;
drop trigger if exists feedback_reply_touch on public.feedback_replies;
create trigger feedback_reply_touch after insert on public.feedback_replies for each row execute function public.feedback_reply_touch();

-- The reporter marks replies as seen (only that column).
create or replace function public.feedback_mark_seen(p_report bigint) returns void language sql security definer set search_path = public as $$
  update public.feedback_reports set user_seen_at = now() where id = p_report and user_id = auth.uid();
$$;
revoke all on function public.feedback_mark_seen(bigint) from public, anon;
grant execute on function public.feedback_mark_seen(bigint) to authenticated;

-- =====================================================================================================
-- 4) Content reports + moderation tools (Shared Spaces, posts, shared agents)
-- =====================================================================================================
create table if not exists public.content_reports (
  id bigint generated always as identity primary key,
  reporter uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('space', 'post', 'agent', 'session')),
  target_id text not null check (char_length(target_id) <= 80),
  target_label text not null default '' check (char_length(target_label) <= 200),
  reason text not null default 'other' check (reason in ('spam', 'harassment', 'inappropriate', 'cheating', 'other')),
  details text not null default '' check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  action_note text not null default '' check (char_length(action_note) <= 500),
  handled_by uuid references auth.users(id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists content_reports_once on public.content_reports (reporter, kind, target_id) where status = 'open';
alter table public.content_reports enable row level security;
drop policy if exists cr_insert on public.content_reports;
create policy cr_insert on public.content_reports for insert with check (reporter = auth.uid() and status = 'open' and handled_by is null and action_note = '');
drop policy if exists cr_select on public.content_reports;
create policy cr_select on public.content_reports for select using (reporter = auth.uid() or public.is_admin());
drop policy if exists cr_admin_update on public.content_reports;
create policy cr_admin_update on public.content_reports for update using (public.is_admin()) with check (public.is_admin());

create or replace function public.admin_list_spaces(p_search text default '')
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then return jsonb_build_object('success', false, 'error', 'not_admin'); end if;
  return jsonb_build_object('success', true, 'spaces', (select coalesce(jsonb_agg(x order by x.reports desc, x.last_post desc nulls last), '[]'::jsonb) from (
    select s.id, s.name, s.code, s.color, s.created_at, u.email as owner_email,
      (select count(*) from public.shared_space_members m where m.space_id = s.id) as members,
      (select count(*) from public.shared_space_posts p where p.space_id = s.id) as posts,
      (select max(created_at) from public.shared_space_posts p where p.space_id = s.id) as last_post,
      (select count(*) from public.content_reports r where r.status = 'open' and ((r.kind = 'space' and r.target_id = s.id::text)
        or (r.kind = 'post' and r.target_id in (select p.id::text from public.shared_space_posts p where p.space_id = s.id)))) as reports
    from public.shared_spaces s left join auth.users u on u.id = s.owner
    where coalesce(p_search, '') = '' or s.name ilike '%' || p_search || '%' or s.code ilike p_search or u.email ilike '%' || p_search || '%'
    limit 200) x));
end $$;

create or replace function public.admin_space_detail(p_space uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then return jsonb_build_object('success', false, 'error', 'not_admin'); end if;
  return jsonb_build_object('success', true,
    'members', (select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'nickname', m.nickname, 'email', u.email, 'streak', m.streak, 'joined_at', m.joined_at)), '[]'::jsonb)
      from public.shared_space_members m left join auth.users u on u.id = m.user_id where m.space_id = p_space),
    'posts', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nickname', p.nickname, 'email', u.email, 'kind', p.kind, 'content', left(p.content, 1500), 'created_at', p.created_at,
      'reports', (select count(*) from public.content_reports r where r.kind = 'post' and r.target_id = p.id::text and r.status = 'open')) order by p.created_at desc), '[]'::jsonb)
      from (select * from public.shared_space_posts where space_id = p_space order by created_at desc limit 150) p left join auth.users u on u.id = p.user_id));
end $$;

create or replace function public.admin_list_shared_agents(p_search text default '')
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then return jsonb_build_object('success', false, 'error', 'not_admin'); end if;
  return jsonb_build_object('success', true, 'agents', (select coalesce(jsonb_agg(x order by x.reports desc, x.created_at desc), '[]'::jsonb) from (
    select a.code, a.name, a.imports, a.created_at, u.email as owner_email, a.agent ->> 'prompt' as prompt, a.agent ->> 'handle' as handle, a.agent ->> 'color' as color,
      (select count(*) from public.content_reports r where r.kind = 'agent' and r.target_id = a.code and r.status = 'open') as reports
    from public.shared_agents a left join auth.users u on u.id = a.owner
    where coalesce(p_search, '') = '' or a.name ilike '%' || p_search || '%' or a.code ilike p_search or u.email ilike '%' || p_search || '%'
    limit 200) x));
end $$;

-- Which space a post is in (for opening a reported post)
create or replace function public.admin_post_space(p_post uuid) returns uuid language sql stable security definer set search_path = public as $$
  select space_id from public.shared_space_posts where id = p_post and public.is_admin();
$$;

-- Remove a space, post or shared agent. Logged; open reports about it are marked actioned.
create or replace function public.admin_remove_content(p_kind text, p_id text, p_reason text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare owner_id uuid; label text;
begin
  if not public.is_admin() then return jsonb_build_object('success', false, 'error', 'not_admin'); end if;
  if p_kind = 'space' then
    select owner, name into owner_id, label from public.shared_spaces where id = p_id::uuid; delete from public.shared_spaces where id = p_id::uuid;
  elsif p_kind = 'post' then
    select user_id, left(content, 120) into owner_id, label from public.shared_space_posts where id = p_id::uuid; delete from public.shared_space_posts where id = p_id::uuid;
  elsif p_kind = 'agent' then
    select owner, name into owner_id, label from public.shared_agents where code = p_id; delete from public.shared_agents where code = p_id;
  else return jsonb_build_object('success', false, 'error', 'bad_kind'); end if;
  if not found then return jsonb_build_object('success', false, 'error', 'not_found'); end if;
  update public.content_reports set status = 'actioned', handled_by = auth.uid(), handled_at = now(), action_note = left(coalesce(p_reason, 'Removed'), 500)
    where kind = p_kind and target_id = p_id and status = 'open';
  insert into public.moderation_log (action, target_user_id, target_email, performed_by, details)
    values ('removed_' || p_kind, owner_id, (select email from auth.users where id = owner_id), auth.uid(), jsonb_build_object('id', p_id, 'label', label, 'reason', p_reason));
  return jsonb_build_object('success', true);
end $$;

-- =====================================================================================================
-- 5) Users: list/search everyone, private admin notes, bulk perks, full profile
-- =====================================================================================================
create table if not exists public.admin_user_notes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  author uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
alter table public.admin_user_notes enable row level security;
drop policy if exists aun_select on public.admin_user_notes;
create policy aun_select on public.admin_user_notes for select using (public.is_admin());
drop policy if exists aun_insert on public.admin_user_notes;
create policy aun_insert on public.admin_user_notes for insert with check (public.is_admin() and author = auth.uid());
drop policy if exists aun_delete on public.admin_user_notes;
create policy aun_delete on public.admin_user_notes for delete using (author = auth.uid() or public.get_my_admin_level() = 'high-admin');

create or replace function public.admin_list_users(p_search text default '', p_filter text default 'all', p_limit int default 50, p_offset int default 0, p_sort text default 'new')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare total int; rows jsonb;
begin
  if not public.is_admin() then return jsonb_build_object('success', false, 'error', 'not_admin'); end if;
  with base as (
    select u.id, u.email, u.created_at, u.last_sign_in_at, p.username, p.nickname, p.avatar_url, coalesce(p.is_beta_tester, false) beta, coalesce(p.is_comped, false) comped,
      p.last_active_at, r.level admin_level, case when m.status = 'suspended' and m.suspended_until < now() then 'active' else coalesce(m.status, 'active') end status,
      (select count(*) from public.feedback_reports f where f.user_id = u.id) reports_sent,
      (select count(*) from public.admin_user_notes n where n.user_id = u.id) notes
    from auth.users u left join public.profiles p on p.id = u.id left join public.admin_roles r on r.user_id = u.id left join public.user_moderation m on m.user_id = u.id
    where (coalesce(p_search, '') = '' or u.email ilike '%' || p_search || '%' or p.username ilike '%' || p_search || '%' or p.nickname ilike '%' || p_search || '%')
  ), filtered as (
    select * from base where case p_filter when 'beta' then beta when 'comped' then comped when 'admins' then admin_level is not null
      when 'moderated' then status <> 'active' when 'active7' then last_active_at > now() - interval '7 days' when 'new7' then created_at > now() - interval '7 days' else true end
  )
  select (select count(*) from filtered), coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) into total, rows from (
    select * from filtered order by case when p_sort = 'active' then last_active_at end desc nulls last, case when p_sort = 'email' then email end asc, created_at desc
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)) f;
  return jsonb_build_object('success', true, 'total', total, 'users', rows);
end $$;

create or replace function public.admin_user_detail(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then return jsonb_build_object('success', false, 'error', 'not_admin'); end if;
  return jsonb_build_object('success', true,
    'user', (select jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
      'username', p.username, 'nickname', p.nickname, 'avatar_url', p.avatar_url, 'last_active_at', p.last_active_at) from auth.users u left join public.profiles p on p.id = u.id where u.id = p_user),
    'activity', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'source', source, 'version', version, 'pings', pings) order by day desc), '[]'::jsonb) from public.app_activity where user_id = p_user and day > current_date - 60),
    'notes', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'created_at', n.created_at, 'author_email', u.email, 'mine', n.author = auth.uid()) order by n.created_at desc), '[]'::jsonb)
      from public.admin_user_notes n left join auth.users u on u.id = n.author where n.user_id = p_user),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('action', l.action, 'details', l.details, 'created_at', l.created_at, 'by', u.email) order by l.created_at desc), '[]'::jsonb)
      from (select * from public.moderation_log where target_user_id = p_user order by created_at desc limit 50) l left join auth.users u on u.id = l.performed_by),
    'feedback', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'title', title, 'status', status, 'created_at', created_at) order by created_at desc), '[]'::jsonb) from public.feedback_reports where user_id = p_user),
    'beta_requests', (select coalesce(jsonb_agg(jsonb_build_object('status', status, 'created_at', created_at, 'why', left(why, 300)) order by created_at desc), '[]'::jsonb) from public.beta_requests where user_id = p_user),
    'spaces', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'owner', s.owner = p_user)), '[]'::jsonb) from public.shared_space_members m join public.shared_spaces s on s.id = m.space_id where m.user_id = p_user),
    'reports_against', (select count(*) from public.content_reports r where r.status = 'open' and (
      (r.kind = 'post' and r.target_id in (select id::text from public.shared_space_posts where user_id = p_user))
      or (r.kind = 'agent' and r.target_id in (select code from public.shared_agents where owner = p_user))
      or (r.kind = 'space' and r.target_id in (select id::text from public.shared_spaces where owner = p_user)))));
end $$;

create or replace function public.admin_bulk(p_users uuid[], p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then return jsonb_build_object('success', false, 'error', 'not_admin'); end if;
  if coalesce(array_length(p_users, 1), 0) > 500 then return jsonb_build_object('success', false, 'error', 'too_many'); end if;
  if p_action in ('beta_on', 'beta_off') then update public.profiles set is_beta_tester = (p_action = 'beta_on') where id = any(p_users);
  elsif p_action in ('comp_on', 'comp_off') then
    if public.get_my_admin_level() not in ('admin', 'high-admin') then return jsonb_build_object('success', false, 'error', 'not_high_admin'); end if;
    update public.profiles set is_comped = (p_action = 'comp_on') where id = any(p_users);
  else return jsonb_build_object('success', false, 'error', 'bad_action'); end if;
  get diagnostics n = row_count;
  insert into public.moderation_log (action, target_user_id, target_email, performed_by, details)
    select 'bulk_' || p_action, u.id, u.email, auth.uid(), jsonb_build_object('count', n) from auth.users u where u.id = any(p_users);
  return jsonb_build_object('success', true, 'updated', n);
end $$;

-- =====================================================================================================
-- 6) Dashboard
-- =====================================================================================================
create or replace function public.admin_dashboard(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d int := least(greatest(coalesce(p_days, 30), 7), 180);
begin
  if not public.is_admin() then return jsonb_build_object('success', false, 'error', 'not_admin'); end if;
  return jsonb_build_object('success', true, 'days', d,
    'series', (select jsonb_agg(jsonb_build_object('day', g.day,
        'signups', (select count(*) from auth.users u where u.created_at::date = g.day),
        'active_desktop', (select count(distinct user_id) from public.app_activity a where a.day = g.day and a.source = 'desktop'),
        'active_phone', (select count(distinct user_id) from public.app_activity a where a.day = g.day and a.source = 'phone'),
        'active', (select count(distinct user_id) from public.app_activity a where a.day = g.day and a.source <> 'portal'),
        'beta_requests', (select count(*) from public.beta_requests b where b.created_at::date = g.day),
        'feedback', (select count(*) from public.feedback_reports f where f.created_at::date = g.day),
        'space_posts', (select count(*) from public.shared_space_posts p where p.created_at::date = g.day)) order by g.day)
      from (select generate_series(current_date - (d - 1), current_date, interval '1 day')::date as day) g),
    'totals', jsonb_build_object(
      'users', (select count(*) from auth.users),
      'new_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
      'active_today', (select count(distinct user_id) from public.app_activity where day = current_date and source <> 'portal'),
      'active_7d', (select count(distinct user_id) from public.app_activity where day > current_date - 7 and source <> 'portal'),
      'online_now', (select count(*) from public.profiles where last_active_at > now() - interval '10 minutes'),
      'beta_testers', (select count(*) from public.profiles where is_beta_tester),
      'pending_requests', (select count(*) from public.beta_requests where status = 'pending'),
      'open_feedback', (select count(*) from public.feedback_reports where status in ('new', 'triaged', 'working')),
      'new_feedback', (select count(*) from public.feedback_reports where status = 'new'),
      'open_reports', (select count(*) from public.content_reports where status = 'open'),
      'moderated', (select count(*) from public.user_moderation where status <> 'active' and (suspended_until is null or suspended_until > now())),
      'spaces', (select count(*) from public.shared_spaces),
      'shared_agents', (select count(*) from public.shared_agents),
      'maintenance_on', (select count(*) from public.maintenance_config where enabled = 'true'::jsonb or enabled -> 'enabled' = 'true'::jsonb)),
    'versions', (select coalesce(jsonb_agg(jsonb_build_object('source', source, 'version', version, 'users', n) order by n desc), '[]'::jsonb) from (
      select source, version, count(*) n from (select distinct on (user_id, source) user_id, source, version from public.app_activity
        where day > current_date - 14 and source in ('desktop', 'phone') order by user_id, source, day desc) v group by source, version) x),
    'agents', (select coalesce(jsonb_agg(jsonb_build_object('name', assistant_name, 'chats', n, 'people', p) order by n desc), '[]'::jsonb) from (
      select assistant_name, sum(count) n, count(distinct user_id) p from public.chat_usage group by assistant_name order by 2 desc limit 10) a),
    'feed', (select coalesce(jsonb_agg(e order by e.at desc), '[]'::jsonb) from (
      (select 'signup' as kind, u.created_at as at, u.email as who, '' as what, u.id::text as ref from auth.users u order by u.created_at desc limit 10)
      union all (select 'beta_request', b.created_at, b.email, left(b.why, 120), b.id::text from public.beta_requests b order by b.created_at desc limit 10)
      union all (select 'feedback', f.created_at, f.email, f.kind || ': ' || f.title, f.id::text from public.feedback_reports f order by f.created_at desc limit 10)
      union all (select 'report', r.created_at, '', r.kind || ' · ' || r.reason || coalesce(' · ' || nullif(r.target_label, ''), ''), r.id::text from public.content_reports r order by r.created_at desc limit 10)
      union all (select 'admin', l.created_at, coalesce(l.target_email, ''), l.action, l.id::text from public.moderation_log l order by l.created_at desc limit 10)
      union all (select 'space', s.created_at, '', s.name, s.id::text from public.shared_spaces s order by s.created_at desc limit 5)
      order by at desc limit 30) e));
end $$;

-- =====================================================================================================
-- 7) Maintenance: an end time for the countdown and whether admins can keep using it. The apps now enforce it.
--    Scopes the apps understand: global · desktop · phone · spaces · an agent id (flash, lyte, neodela, paragon)
--    · a feature name (seek, magyk, …)
-- =====================================================================================================
alter table public.maintenance_config add column if not exists ends_at timestamptz;
alter table public.maintenance_config add column if not exists admin_bypass boolean not null default true;

-- =====================================================================================================
-- 8) Grants + realtime (the portal updates live and sends notifications; N28C sees maintenance instantly)
-- =====================================================================================================
do $$ declare f text; begin
  foreach f in array array['admin_create_group(text, uuid[], text, text)', 'admin_update_group(uuid, text, text, text, uuid[], uuid[])', 'admin_react(bigint, text)',
    'admin_edit_message(bigint, text)', 'admin_delete_message(bigint)', 'admin_list_admins()', 'admin_list_spaces(text)', 'admin_space_detail(uuid)',
    'admin_list_shared_agents(text)', 'admin_remove_content(text, text, text)', 'admin_list_users(text, text, int, int, text)', 'admin_user_detail(uuid)',
    'admin_bulk(uuid[], text)', 'admin_dashboard(int)', 'admin_post_space(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

do $$ declare t text; begin
  foreach t in array array['admin_messages', 'admin_reads', 'admin_prefs', 'admin_groups', 'admin_group_members', 'beta_requests', 'feedback_reports',
    'feedback_replies', 'content_reports', 'maintenance_config', 'announcements'] loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
-- Edits, reactions and deletes need the full row in realtime updates.
alter table public.admin_messages replica identity full;

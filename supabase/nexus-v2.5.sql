-- Nexus '28 v2.5: the public status page (apojidelegraphics.github.io/Nexus-28/status/). Run once in Supabase →
-- SQL Editor, after nexus-v2.4.sql. Safe to run again.
--   • status_components: the parts of Nexus people care about, with an optional manual override.
--   • status_incidents: what admins post from Apoji Admin → Status page (with updates until it's resolved).
--   • public_status(): the only thing the public page reads. It never shows who posted or any account data.
-- Maintenance switches (maintenance_config) show on the page automatically.

create table if not exists public.status_components (
  key text primary key check (key ~ '^[a-z0-9_]{2,24}$'),
  label text not null check (char_length(label) between 1 and 60),
  description text not null default '' check (char_length(description) <= 160),
  position int not null default 0,
  override text check (override in ('operational', 'degraded', 'partial', 'outage', 'maintenance')),
  note text not null default '' check (char_length(note) <= 200),
  updated_at timestamptz not null default now()
);
insert into public.status_components (key, label, description, position) values
  ('accounts', 'Accounts & sync', 'Signing in, your profile, syncing between devices', 1),
  ('agents', 'AI agents', 'Flash, Lyte, Neodela, Paragon and the free Nexus key', 2),
  ('desktop', 'Nexus for Mac', 'The Mac app', 3),
  ('phone', 'N28C', 'Nexus on your phone', 4),
  ('spaces', 'Shared Spaces', 'Studying with friends, live sessions', 5),
  ('website', 'Website & downloads', 'This site, What''s new and the download links', 6)
on conflict (key) do nothing;
alter table public.status_components enable row level security;
drop policy if exists sc_read on public.status_components;
create policy sc_read on public.status_components for select using (public.is_admin());
drop policy if exists sc_write on public.status_components;
create policy sc_write on public.status_components for update using (public.is_admin()) with check (public.is_admin());

create table if not exists public.status_incidents (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 3 and 120),
  severity text not null default 'minor' check (severity in ('minor', 'major', 'critical', 'maintenance')),
  status text not null default 'investigating' check (status in ('investigating', 'identified', 'monitoring', 'resolved', 'scheduled')),
  components text[] not null default '{}',
  updates jsonb not null default '[]'::jsonb,       -- [{ "at": "...", "status": "...", "body": "..." }] newest first
  started_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists status_incidents_started on public.status_incidents (started_at desc);
alter table public.status_incidents enable row level security;
drop policy if exists si_read on public.status_incidents;
create policy si_read on public.status_incidents for select using (public.is_admin());
drop policy if exists si_insert on public.status_incidents;
create policy si_insert on public.status_incidents for insert with check (public.is_admin());
drop policy if exists si_update on public.status_incidents;
create policy si_update on public.status_incidents for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists si_delete on public.status_incidents;
create policy si_delete on public.status_incidents for delete using (public.get_my_admin_level() = 'high-admin');

-- Post an update on an incident (keeps the timeline; "resolved" sets resolved_at)
create or replace function public.admin_status_update(p_id bigint, p_status text, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then return jsonb_build_object('success', false, 'error', 'not_admin'); end if;
  if p_status not in ('investigating', 'identified', 'monitoring', 'resolved', 'scheduled') then return jsonb_build_object('success', false, 'error', 'bad_status'); end if;
  update public.status_incidents set status = p_status,
    updates = jsonb_build_array(jsonb_build_object('at', now(), 'status', p_status, 'body', left(coalesce(p_body, ''), 1000))) || updates,
    resolved_at = case when p_status = 'resolved' then now() else null end
  where id = p_id;
  if not found then return jsonb_build_object('success', false, 'error', 'not_found'); end if;
  return jsonb_build_object('success', true);
end $$;

-- What the public page shows
create or replace function public.public_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare comps jsonb; maint jsonb;
begin
  -- maintenance switches that are on → which components they touch
  select coalesce(jsonb_agg(jsonb_build_object('scope', m.scope, 'message', coalesce(m.message, ''), 'ends_at', to_jsonb(m)->'ends_at')), '[]'::jsonb) into maint
  from public.maintenance_config m where m.enabled = 'true'::jsonb or m.enabled -> 'enabled' = 'true'::jsonb;

  select coalesce(jsonb_agg(x order by x.position), '[]'::jsonb) into comps from (
    select c.key, c.label, c.description, c.position,
      coalesce(c.override,
        (select case max(case i.severity when 'critical' then 3 when 'major' then 2 when 'minor' then 1 else 0 end) when 3 then 'outage' when 2 then 'partial' when 1 then 'degraded' else null end
           from public.status_incidents i where i.resolved_at is null and i.status <> 'scheduled' and i.severity <> 'maintenance' and c.key = any(i.components)),
        (select 'maintenance' from public.status_incidents i where i.resolved_at is null and i.severity = 'maintenance' and i.status <> 'scheduled' and c.key = any(i.components) limit 1),
        (select 'maintenance' from jsonb_array_elements(maint) e where
            lower(e->>'scope') in ('global', 'all', 'app', 'everything')
            or (c.key = 'desktop' and lower(e->>'scope') in ('desktop', 'mac'))
            or (c.key = 'phone' and lower(e->>'scope') in ('phone', 'n28c', 'companion', 'mobile', 'desktop', 'mac'))
            or (c.key = 'spaces' and lower(e->>'scope') in ('spaces', 'shared_spaces', 'sharedspaces'))
            or (c.key = 'agents' and lower(e->>'scope') in ('flash', 'lyte', 'neodela', 'paragon'))
          limit 1),
        'operational') as status,
      case when c.override is not null then c.note else '' end as note
    from public.status_components c) x;

  return jsonb_build_object(
    'components', comps,
    'maintenance', (select coalesce(jsonb_agg(jsonb_build_object('what', e->>'scope', 'message', e->>'message', 'ends_at', e->'ends_at')), '[]'::jsonb) from jsonb_array_elements(maint) e
                    where lower(e->>'scope') in ('global', 'all', 'app', 'everything', 'desktop', 'mac', 'phone', 'n28c', 'spaces', 'flash', 'lyte', 'neodela', 'paragon')),
    'active', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'severity', severity, 'status', status, 'components', components, 'updates', updates, 'started_at', started_at) order by started_at desc), '[]'::jsonb)
               from public.status_incidents where resolved_at is null),
    'recent', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'severity', severity, 'components', components, 'updates', updates, 'started_at', started_at, 'resolved_at', resolved_at) order by started_at desc), '[]'::jsonb)
               from (select * from public.status_incidents where resolved_at is not null and resolved_at > now() - interval '30 days' order by started_at desc limit 20) r),
    'days', (select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'worst', coalesce(w.worst, 0)) order by d), '[]'::jsonb)
             from generate_series(current_date - 89, current_date, interval '1 day') d
             left join lateral (select max(case i.severity when 'critical' then 3 when 'major' then 2 when 'minor' then 1 else 0 end) worst from public.status_incidents i
                                where i.severity <> 'maintenance' and i.started_at < d + interval '1 day' and coalesce(i.resolved_at, now()) >= d) w on true),
    'checked_at', now());
end $$;
revoke all on function public.public_status() from public;
grant execute on function public.public_status() to anon, authenticated;
revoke all on function public.admin_status_update(bigint, text, text) from public, anon;
grant execute on function public.admin_status_update(bigint, text, text) to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'status_incidents') then
    alter publication supabase_realtime add table public.status_incidents;
  end if;
end $$;

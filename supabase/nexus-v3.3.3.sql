-- Nexus '28 3.3.3 / Apoji Admin 2.0.3 — already applied to the live project on 2026-11-18 (kept here for the record).
-- Axiom's escape attempts run by themselves: pg_cron calls the axiom-cage Edge Function every 3 hours with a secret
-- that only the database and the function can read. Safe to run again.
create extension if not exists pg_cron;
create extension if not exists pg_net;
create table if not exists public.apex_cage_secret (id int primary key default 1 check (id = 1), value text not null default encode(extensions.gen_random_bytes(24), 'hex'));
insert into public.apex_cage_secret (id) values (1) on conflict do nothing;
alter table public.apex_cage_secret enable row level security;
revoke all on public.apex_cage_secret from anon, authenticated;
select cron.unschedule(jobid) from cron.job where jobname = 'axiom-cage';
select cron.schedule('axiom-cage', '17 */3 * * *', $$
  select net.http_post(
    url := 'https://yzbnxpkuhlxsuwzbjifx.supabase.co/functions/v1/axiom-cage',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cage-secret', (select value from public.apex_cage_secret where id = 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000);
$$);

-- Nexus '28 3.3.2 / Apoji Admin 2.0.2
-- Run once in Supabase → SQL Editor (after nexus-v3.3.sql). Safe to run again.
--   Reports get a new kind, "Feature & Fix" ('featfix'), for reports written in Apoji Admin.

do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'public.feedback_reports'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%kind%' loop
    execute format('alter table public.feedback_reports drop constraint %I', c);
  end loop;
end $$;
alter table public.feedback_reports add constraint feedback_reports_kind_check check (kind in ('bug', 'feature', 'featfix', 'feedback', 'beta', 'other'));

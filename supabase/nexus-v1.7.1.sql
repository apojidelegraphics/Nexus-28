-- Nexus '28 v1.7.1 — phone companion upgrade. Run once (after nexus-v1.7.sql). Safe to run again.

-- 1) The relay can now carry requests from the phone (open a chat, review a card, run a routine…) and the Mac's answers.
alter table public.relay_messages drop constraint if exists relay_messages_kind_check;
alter table public.relay_messages add constraint relay_messages_kind_check
  check (kind in ('ask','reply','status','error','ping','request','data'));

-- 2) What the Mac shares with your phone: agents, chat list, chats you open, flashcards, stats, routines.
--    Private to your account (row-level security), and only written while the phone companion is on.
create table if not exists public.companion_sync (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9:_-]{1,80}$'),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.companion_sync enable row level security;
drop policy if exists companion_select_own on public.companion_sync;
create policy companion_select_own on public.companion_sync for select using (auth.uid() = user_id);
drop policy if exists companion_insert_own on public.companion_sync;
create policy companion_insert_own on public.companion_sync for insert with check (auth.uid() = user_id);
drop policy if exists companion_update_own on public.companion_sync;
create policy companion_update_own on public.companion_sync for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists companion_delete_own on public.companion_sync;
create policy companion_delete_own on public.companion_sync for delete using (auth.uid() = user_id);

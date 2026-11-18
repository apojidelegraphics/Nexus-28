-- Nexus '28 3.6: "Move to another computer". One private file per account in Storage: nexus-transfers/<your id>/…
-- Only you can read, write or delete your own folder. Run after nexus-v3.4.1.sql.
insert into storage.buckets (id, name, public, file_size_limit)
values ('nexus-transfers', 'nexus-transfers', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists "transfers_own_select" on storage.objects;
drop policy if exists "transfers_own_insert" on storage.objects;
drop policy if exists "transfers_own_update" on storage.objects;
drop policy if exists "transfers_own_delete" on storage.objects;
create policy "transfers_own_select" on storage.objects for select to authenticated using (bucket_id = 'nexus-transfers' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "transfers_own_insert" on storage.objects for insert to authenticated with check (bucket_id = 'nexus-transfers' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "transfers_own_update" on storage.objects for update to authenticated using (bucket_id = 'nexus-transfers' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "transfers_own_delete" on storage.objects for delete to authenticated using (bucket_id = 'nexus-transfers' and (storage.foldername(name))[1] = auth.uid()::text);

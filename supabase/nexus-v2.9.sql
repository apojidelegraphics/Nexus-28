-- Nexus '28 v2.9: delete your own account (from N28C → You → Edit account). Run once in Supabase → SQL Editor. Safe to run again.
-- Deletes the auth user; everything that references it with "on delete cascade" (profile, Shared Space membership and
-- posts, relay messages, feedback, challenges…) goes with it. N28C removes the profile picture files first
-- through the Storage API (Supabase doesn't allow deleting storage rows from SQL). Admin accounts can't delete themselves this way.
create or replace function public.delete_my_account(p_confirm text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare me uuid := auth.uid();
begin
  if me is null then return jsonb_build_object('success', false, 'error', 'sign_in'); end if;
  if p_confirm is distinct from 'DELETE' then return jsonb_build_object('success', false, 'error', 'confirm'); end if;
  if public.get_my_admin_level() is not null then return jsonb_build_object('success', false, 'error', 'admin'); end if;
  if exists (select 1 from public.apex_unlimited where user_id = me) then return jsonb_build_object('success', false, 'error', 'admin'); end if;
  begin
    delete from auth.users where id = me;
  exception when foreign_key_violation then
    return jsonb_build_object('success', false, 'error', 'in_use', 'detail', sqlerrm);
  end;
  return jsonb_build_object('success', true);
end $$;
revoke all on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;

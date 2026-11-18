-- Nexus '28 3.4.1: Test Run gets 200 free answers a day (was 100). Run after nexus-v3.4.sql.

-- One call from the function: is this person allowed right now, and count it. kind: main | extra | search
create or replace function public.try_take(p_user uuid, p_kind text, p_agent text default 'flash')
returns jsonb language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'utc')::date; u public.try_usage; lim int; used int; name text; life int; m record;
begin
  select status, suspended_until into m from public.user_moderation where user_id = p_user;
  if found and (m.status = 'banned' or (m.status = 'suspended' and (m.suspended_until is null or m.suspended_until > now()))) then
    return jsonb_build_object('ok', false, 'error', 'account', 'message', 'Your account can''t use Nexus right now.');
  end if;
  insert into public.try_usage (user_id, day) values (p_user, d) on conflict do nothing;
  select * into u from public.try_usage where user_id = p_user and day = d for update;
  if p_kind = 'search' then
    if u.searches >= 60 then return jsonb_build_object('ok', false, 'error', 'daily', 'message', 'That''s 60 web searches today. More tomorrow!'); end if;
    update public.try_usage set searches = searches + 1 where user_id = p_user and day = d;
    return jsonb_build_object('ok', true);
  end if;
  if p_kind = 'extra' then
    if u.extra >= 120 then return jsonb_build_object('ok', false, 'error', 'daily', 'message', 'Thinking features are done for today. Plain answers still work.'); end if;
    update public.try_usage set extra = extra + 1 where user_id = p_user and day = d;
    return jsonb_build_object('ok', true);
  end if;
  -- main answers: 200 a day on the free key, plus the same lifetime allowances as the Mac app (Lyte 95, Neodela 28)
  if u.main >= 200 then return jsonb_build_object('ok', false, 'error', 'daily', 'message', 'That''s 200 free answers today. Come back tomorrow, or add your own key in Settings.'); end if;
  name := case p_agent when 'lyte' then 'Nexus 28 Lyte' when 'neodela' then 'Nexus 28 Neodela' else 'Nexus 28 Flash' end;
  lim := case p_agent when 'lyte' then 95 when 'neodela' then 28 else null end;
  select count into used from public.chat_usage where user_id = p_user and assistant_name = name;
  used := coalesce(used, 0);
  if lim is not null and used >= lim then
    return jsonb_build_object('ok', false, 'error', 'agent', 'message', format('You''ve used your %s free %s chats. Flash is unlimited, or add your own key in Settings.', lim, initcap(p_agent)));
  end if;
  update public.try_usage set main = main + 1 where user_id = p_user and day = d;
  insert into public.chat_usage (user_id, assistant_name, count, updated_at) values (p_user, name, 1, now())
    on conflict (user_id, assistant_name) do update set count = public.chat_usage.count + 1, updated_at = now();
  return jsonb_build_object('ok', true, 'today', u.main + 1, 'left_today', 200 - u.main - 1, 'left_agent', case when lim is null then null else lim - used - 1 end);
end $$;
revoke all on function public.try_take(uuid, text, text) from public, anon, authenticated;
grant execute on function public.try_take(uuid, text, text) to service_role;

-- What the Test Run shows you: today's counts and the agent allowances
create or replace function public.try_my_usage()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'today', coalesce((select main from public.try_usage where user_id = auth.uid() and day = (now() at time zone 'utc')::date), 0), 'daily', 200,
    'lyte', coalesce((select count from public.chat_usage where user_id = auth.uid() and assistant_name = 'Nexus 28 Lyte'), 0), 'lyte_limit', 95,
    'neodela', coalesce((select count from public.chat_usage where user_id = auth.uid() and assistant_name = 'Nexus 28 Neodela'), 0), 'neodela_limit', 28)
$$;
revoke all on function public.try_my_usage() from public, anon;
grant execute on function public.try_my_usage() to authenticated;


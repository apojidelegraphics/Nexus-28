-- Nexus '28 v2.7.1 (stability): small hardening on top of nexus-v2.7.sql. Run once in Supabase → SQL Editor. Safe to run again.

-- 1) Group challenges: a "study day" must be a real recent day, so nobody can fill a challenge with made-up dates.
create or replace function public.challenge_report(p_kind text, p_amount int default 1, p_day date default current_date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c record; n int := 0; nick text;
begin
  -- a study day can only be yesterday, today or tomorrow (time zones), never a made-up date
  if p_day is null or p_day < current_date - 1 or p_day > current_date + 1 then p_day := current_date; end if;
  if auth.uid() is null or p_kind not in ('cards', 'days', 'focus') then return jsonb_build_object('success', false, 'error', 'bad_request'); end if;
  for c in select ch.id, ch.kind, m.nickname from public.space_challenges ch join public.shared_space_members m on m.space_id = ch.space_id and m.user_id = auth.uid()
           where ch.kind = p_kind and now() between ch.starts_at and ch.ends_at loop
    if p_kind = 'days' then
      insert into public.space_challenge_progress (challenge_id, user_id, nickname, amount, days) values (c.id, auth.uid(), c.nickname, 1, array[coalesce(p_day, current_date)])
      on conflict (challenge_id, user_id) do update set nickname = excluded.nickname, updated_at = now(),
        days = case when coalesce(p_day, current_date) = any(space_challenge_progress.days) then space_challenge_progress.days else space_challenge_progress.days || coalesce(p_day, current_date) end,
        amount = cardinality(case when coalesce(p_day, current_date) = any(space_challenge_progress.days) then space_challenge_progress.days else space_challenge_progress.days || coalesce(p_day, current_date) end);
    else
      insert into public.space_challenge_progress (challenge_id, user_id, nickname, amount) values (c.id, auth.uid(), c.nickname, least(greatest(coalesce(p_amount, 1), 1), case when p_kind = 'focus' then 240 else 500 end))
      on conflict (challenge_id, user_id) do update set nickname = excluded.nickname, updated_at = now(),
        amount = least(space_challenge_progress.amount + least(greatest(coalesce(p_amount, 1), 1), case when p_kind = 'focus' then 240 else 500 end), 1000000);
    end if;
    n := n + 1;
  end loop;
  return jsonb_build_object('success', true, 'challenges', n);
end $$;

revoke all on function public.challenge_report(text, int, date) from public, anon;
grant execute on function public.challenge_report(text, int, date) to authenticated;

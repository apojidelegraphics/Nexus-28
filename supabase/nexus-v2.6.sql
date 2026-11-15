-- Nexus '28 v2.6: Axiom can be limited to the new providers too (Groq, Mistral, xAI, Together, Fireworks, Cerebras,
-- Perplexity, Cohere). Run once in Supabase → SQL Editor, after nexus-v2.5.sql. Safe to run again.
create or replace function public.admin_apex_set(p_stage text default null, p_weekly_minutes int default null, p_providers text[] default null, p_prompt text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if public.get_my_admin_level() is distinct from 'high-admin' then return jsonb_build_object('success', false, 'error', 'not_high_admin'); end if;
  if p_providers is not null and not (p_providers <@ array['anthropic', 'openrouter', 'openai', 'gemini', 'deepseek', 'groq', 'mistral', 'xai', 'together', 'fireworks', 'cerebras', 'perplexity', 'cohere', 'ollama', 'lmstudio']) then
    return jsonb_build_object('success', false, 'error', 'bad_provider'); end if;
  update public.apex_config set
    stage = coalesce(p_stage, stage), weekly_minutes = coalesce(p_weekly_minutes, weekly_minutes),
    public_providers = coalesce(p_providers, public_providers), prompt = coalesce(p_prompt, prompt),
    updated_by = auth.uid(), updated_at = now() where id = 1;
  insert into public.moderation_log (action, performed_by, details)
    values ('apex_settings_changed', auth.uid(), jsonb_strip_nulls(jsonb_build_object('stage', p_stage, 'weekly_minutes', p_weekly_minutes, 'providers', p_providers, 'prompt_changed', p_prompt is not null)));
  return jsonb_build_object('success', true);
end $$;
revoke all on function public.admin_apex_set(text, int, text[], text) from public, anon;
grant execute on function public.admin_apex_set(text, int, text[], text) to authenticated;

-- The Axiom prompt learns about Operations, Sentinel and Rollback (only if it still has the stock wording)
update public.apex_config set prompt = replace(prompt, '@ProofMode: every claim you make is checked, scored and sourced after you answer.',
  '@ProofMode: every claim you make is checked, scored and sourced after you answer.
@Swarm: Flash, Lyte and Neodela work in parallel under your command; you grade and merge their work.
Operations (start_operation): long jobs you run in budgeted steps over hours or days. Sentinel (set_sentinel): standing orders that watch something and act only when it matters. Rollback (undo_recent_actions): undo what Nexus changed on the Mac.'),
  updated_at = now()
where id = 1 and prompt like '%@ProofMode: every claim you make is checked, scored and sourced after you answer.%' and prompt not like '%start_operation%';

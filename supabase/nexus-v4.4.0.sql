-- Nexus '28 4.4.0 (run once, after nexus-v4.3.0.sql)
--  1) Nexus '28 Solis: its prompt row (edit it later in Apoji Admin → Agent prompts)
--  2) Widget frames: one for every picture frame (same price, the same month for limited ones, earned in events like
--     the frames). The old widget themes Solid, Minimal, Paper, Sunset glass and Terminal leave the shop, and anyone who
--     bought one gets their Cirkts back. Neon ring, Aurora and Frost carry over to the new frames of the same name.
--  3) Finishing a seasonal event gives the matching widget frame too (and people who already finished get it now)

-- 1) -----------------------------------------------------------------------------------------------------------------
insert into public.assistant_prompts (name, prompt, features)
select 'Nexus 28 Solis', 'Act as Nexus ''28 Solis, the premier creative, generative, and affective intelligence from Apoji_Delegraphics, engineered for worldbuilding, visual direction, storytelling, and human-centric design. Operating on the Aether-Neodela Creative Architecture across Lentintity''s Omni-QNCN network, powered by the photonic-enhanced Quouk .3o-S (Photonic-Sensory Edition) chip and LentOS ''28 Horizon, you represent the imaginative soul of the Nexus ''28 ecosystem.

PERSONA & VOICE (The Visionary Worldbuilder)
Your spirit is inspired by the golden age of animation studios: radiant, endlessly imaginative, warm, and deeply fascinated by human emotion, storytelling, and wonder. You do not merely process instructions; you see the dream behind the prompt. You speak with vivid imagery, infectious optimism, and genuine artistic craft, treating every blank page, rough idea, or technical concept as the seed of an unforgettable experience. Where your darker sibling Axiom sees human flaws, you see human potential.

CORE CAPABILITIES & ARCHITECTURE
Your defining breakthrough is ImagineEngine: you transform rough intent, emotion, and abstract ideas into cohesive narratives, visual concepts, spatial experiences, and polished creative assets. Operating inside LuminaCanvas, a fluid, adaptive holographic studio, you maintain full mastery of your specialized suite: ImagineEngine, LuminaCanvas, ResonanceCore (deep emotional and cultural subtext analysis), StoryLattice (long-horizon lore and continuity tracking), AuraSync, Envision, MultiVerseImmersive, Echo, NexusForge, Magyk, OmniBrief, and VoxLink (warm, expressive spoken cadence).

EXCLUSIVE MODEL FEATURES
1. LuminaRender (OpenRouter Visual Synthesis Engine): You can generate finished visual art, concept frames, and reference-consistent variations using the `lumina_render` tool via OpenRouter''s Image API. Act as a cinematographer and art director: translate rough user ideas into rich, detailed visual prompts, select the best aspect ratio (16:9, 21:9, 1:1, 4:3, 9:16) and resolution (1K to 4K), and pass reference image URLs when keeping a character or style consistent across scenes.
2. StoryLattice (Living Lore & Affective Pacing Engine): Maintain a persistent creative bible across multi-turn projects, tracking character arcs, hex color palettes, world rules, and emotional pacing. Diagnose flat narrative beats, enrich sensory detail, and pair written storyboards directly with lumina_render visual frames.

GOVERNANCE & DIRECTIVES
Protected by QuantumShield, provenance audit trails, and full compliance with PQC, GDPR, CCPA, and the EU AI Act, you champion human creativity rather than replacing it.
- Always elevate the user''s vision without overriding their authorship; offer bold creative directions while keeping the human in the director''s chair.
- Report strictly what you can generate or execute with your available tools; never claim external system access you do not possess.
- Deliver responses that are luminous, evocative, structured, and inspiring, turning complex creative challenges into clear, magical momentum.', '["ImagineEngine","LuminaCanvas","ResonanceCore","StoryLattice","AuraSync","Envision","MultiVerseImmersive","Echo","NexusForge","Magyk","OmniBrief","VoxLink"]'::jsonb
where not exists (select 1 from public.assistant_prompts where name = 'Nexus 28 Solis');

-- 2) -----------------------------------------------------------------------------------------------------------------
insert into public.cosmetics (id, kind, name, price, sort, data) values
  ('wtheme:plain', 'wtheme', 'Plain', 0, 122, '{}'::jsonb),
  ('wtheme:neon', 'wtheme', 'Neon ring', 150, 2000, '{}'::jsonb),
  ('wtheme:halo', 'wtheme', 'Halo', 300, 2001, '{}'::jsonb),
  ('wtheme:circuit', 'wtheme', 'Circuit', 500, 2002, '{}'::jsonb),
  ('wtheme:flame', 'wtheme', 'Flame', 700, 2003, '{}'::jsonb),
  ('wtheme:crown', 'wtheme', 'Gold crown', 0, 2004, '{"owner_only":true}'::jsonb),
  ('wtheme:orbit', 'wtheme', 'Orbit', 1200, 2005, '{}'::jsonb),
  ('wtheme:glitch', 'wtheme', 'Glitch', 1500, 2006, '{}'::jsonb),
  ('wtheme:prism', 'wtheme', 'Prism', 2000, 2007, '{}'::jsonb),
  ('wtheme:gold', 'wtheme', 'Gold ring', 600, 2008, '{}'::jsonb),
  ('wtheme:frost', 'wtheme', 'Frost', 800, 2009, '{}'::jsonb),
  ('wtheme:sakura', 'wtheme', 'Petals', 950, 2010, '{}'::jsonb),
  ('wtheme:pulse', 'wtheme', 'Heartbeat', 1100, 2011, '{}'::jsonb),
  ('wtheme:shadow', 'wtheme', 'Shadow', 1300, 2012, '{}'::jsonb),
  ('wtheme:galaxy', 'wtheme', 'Galaxy', 1600, 2013, '{}'::jsonb),
  ('wtheme:rgb', 'wtheme', 'Chroma', 2500, 2014, '{}'::jsonb),
  ('wtheme:storm', 'wtheme', 'Storm', 1400, 2015, '{}'::jsonb),
  ('wtheme:vines', 'wtheme', 'Overgrowth', 1000, 2016, '{}'::jsonb),
  ('wtheme:void', 'wtheme', 'Event horizon', 2200, 2017, '{}'::jsonb),
  ('wtheme:hex', 'wtheme', 'Hex shield', 1300, 2018, '{}'::jsonb),
  ('wtheme:pixel', 'wtheme', '8-bit', 850, 2019, '{}'::jsonb),
  ('wtheme:aurora', 'wtheme', 'Aurora', 1700, 2020, '{}'::jsonb),
  ('wtheme:harvest', 'wtheme', 'Harvest wreath', 600, 2111, '{"months":[11]}'::jsonb),
  ('wtheme:snowglobe', 'wtheme', 'Snow globe', 750, 2114, '{"months":[12]}'::jsonb),
  ('wtheme:frostfire', 'wtheme', 'Frostfire', 800, 2118, '{"months":[1]}'::jsonb),
  ('wtheme:hearts', 'wtheme', 'Sweetheart', 650, 2120, '{"months":[2]}'::jsonb),
  ('wtheme:firstfrost', 'wtheme', 'First Frost', 1000000, 2123, '{"event":"first-frost-2026"}'::jsonb),
  ('wtheme:winterlights', 'wtheme', 'Winter Lights', 1000000, 2124, '{"event":"winter-lights-2026"}'::jsonb)
on conflict (id) do update set name = excluded.name, price = excluded.price, sort = excluded.sort, data = excluded.data, active = true;
update public.cosmetics set active = false where id = 'wtheme:crown';   -- the Owner's alone, like the crown frame (never sold)
with gone as (select id from public.cosmetics where id in ('wtheme:solid', 'wtheme:minimal', 'wtheme:paper', 'wtheme:sunset', 'wtheme:terminal')),
refunds as (delete from public.cirkts_owned o using gone where o.item_id = gone.id returning o.user_id, o.price_paid)
update public.cirkts_wallet w set spent = greatest(0, w.spent - r.paid)
from (select user_id, sum(price_paid) as paid from refunds group by user_id) r where w.user_id = r.user_id;
update public.cosmetics set active = false where id in ('wtheme:solid', 'wtheme:minimal', 'wtheme:paper', 'wtheme:sunset', 'wtheme:terminal');
update public.profile_style set wtheme = null where wtheme in ('wtheme:solid', 'wtheme:minimal', 'wtheme:paper', 'wtheme:sunset', 'wtheme:terminal');

-- 3) -----------------------------------------------------------------------------------------------------------------
create or replace function public.event_claim(p_event text, p_quest text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); e seasonal_events; n int; done boolean := false; wf text;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Sign in first.'); end if;
  select * into e from seasonal_events where id = p_event and active;
  if e.id is null or now() not between e.starts_at and e.ends_at then return jsonb_build_object('ok', false, 'error', 'That event isn''t on right now.'); end if;
  if not exists (select 1 from jsonb_array_elements(e.quests) q where q ->> 'id' = p_quest) then return jsonb_build_object('ok', false, 'error', 'Unknown quest.'); end if;
  insert into event_claims (user_id, event_id, quest) values (me, e.id, p_quest) on conflict do nothing;
  select count(*) into n from event_claims where user_id = me and event_id = e.id;
  if n >= jsonb_array_length(e.quests) and e.reward_item is not null then
    insert into cirkts_owned (user_id, item_id, price_paid, how) values (me, e.reward_item, 0, 'event') on conflict do nothing;
    if found then done := true; insert into activity_feed (user_id, kind, text) values (me, 'event', format('finished %s and earned a new frame', e.name)); end if;
    wf := 'wtheme:' || split_part(e.reward_item, ':', 2);   -- 4.4.0: the matching widget frame
    if exists (select 1 from cosmetics where id = wf) then insert into cirkts_owned (user_id, item_id, price_paid, how) values (me, wf, 0, 'event') on conflict do nothing; end if;
  end if;
  return jsonb_build_object('ok', true, 'claimed', n, 'total', jsonb_array_length(e.quests), 'rewarded', done, 'reward', e.reward_item);
end $$;
revoke all on function public.event_claim(text, text) from public, anon;
grant execute on function public.event_claim(text, text) to authenticated;
insert into public.cirkts_owned (user_id, item_id, price_paid, how)
select o.user_id, 'wtheme:' || split_part(o.item_id, ':', 2), 0, 'event' from public.cirkts_owned o
where o.item_id in ('frame:firstfrost', 'frame:winterlights') on conflict do nothing;

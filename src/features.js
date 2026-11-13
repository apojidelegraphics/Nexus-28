// Nexus assistant features (@Seek, @Cognition, …) — the classic Nexus feature set.
// Each agent only gets the features listed for it in Supabase (assistant_prompts.features);
// typing @Feature turns that feature on for one message.
//   web: true      → the feature may search the web for that message (read-only tools)
//   history: true  → the feature gets a digest of recent chats (Echo)

const CATALOG = [
  { id: 'Seek', desc: 'Live web research with sources', web: true,
    instruction: 'Research this thoroughly using web search and page reading. Check several sources, prefer recent and authoritative ones, and cite source links.' },
  { id: 'Cognition', desc: 'Deep multi-step reasoning',
    instruction: 'Work through this with careful multi-step reasoning: break the problem down, consider alternatives, check your work, then give a clear conclusion.' },
  { id: 'Integrate', desc: 'Connect ideas & sources into one picture',
    instruction: 'Unify the different pieces of information, systems or viewpoints involved into one coherent picture. Show how the parts connect and where they conflict.' },
  { id: 'Knowledge', desc: 'Authoritative explainer',
    instruction: 'Answer as an expert reference: accurate definitions, key facts, context and common misconceptions, organized for quick understanding.' },
  { id: 'Envision', desc: 'Creative concepts & visual ideas',
    instruction: 'Think creatively and visually: generate vivid, original concepts, mockup descriptions or design directions, with concrete details.' },
  { id: 'Synergy', desc: 'Collaborative brainstorming',
    instruction: 'Brainstorm collaboratively: build on the user\'s ideas, combine them in new ways, and offer several distinct options with trade-offs.' },
  { id: 'Echo', desc: 'Uses your chat history', history: true,
    instruction: 'Use the user\'s conversation history (current chat and the recent-chats digest provided) to personalize the answer and stay consistent with what they said before.' },
  { id: 'QuantumThread', desc: 'Parallel lines of thought',
    instruction: 'Explore several independent lines of attack in parallel (label them as threads), then merge the best results into one recommendation.' },
  { id: 'AuraSync', aliases: ['Aura Sync'], desc: 'Tunes to your intent & tone',
    instruction: 'Read the user\'s underlying intent, mood and preferred depth, briefly reflect it back, and tailor tone, length and format to match.' },
  { id: 'NexusForge', aliases: ['Nexus Forge'], desc: 'Builds workflows & step-by-step plans',
    instruction: 'Design a practical workflow: numbered steps, tools or resources for each, checkpoints, and how to adapt it if something changes.' },
  { id: 'Magyk', desc: 'Rapid topic mastery',
    instruction: 'Teach this topic fast: the core mental model first, then the key ideas from simple to advanced, with a memorable example for each.' },
  { id: 'LogicLattice', desc: 'Structured logic & proofs',
    instruction: 'Lay out the reasoning as an explicit logical structure: premises, inferences and conclusion. Flag assumptions and any weak links.' },
  { id: 'InsightPulse', desc: 'Key insights & patterns',
    instruction: 'Surface the most important non-obvious insights, patterns and implications. Lead with the single biggest takeaway.' },
  { id: 'ClarityLens', desc: 'Makes complex things simple',
    instruction: 'Explain this as clearly and simply as possible: plain language, short sentences, one analogy, no jargon unless defined.' },
  { id: 'FortressLens', desc: 'Visual breakdowns & risk view',
    instruction: 'Present the answer visually: use markdown tables, structured breakdowns or simple text diagrams. Include risks, threats or weak points where relevant.' },
  { id: 'Proactix', desc: 'Anticipates next steps',
    instruction: 'Answer, then anticipate what the user will need next: likely follow-up questions, pitfalls to avoid and suggested next actions.' },
  { id: 'Proactix2.0', aliases: ['Proactix 2.0'], desc: 'Anticipates next steps (v2)',
    instruction: 'Answer, then proactively anticipate the user\'s next needs with prioritized next actions, pitfalls, and a ready-to-use follow-up.' },
  { id: 'MultiVerseImmersive', desc: 'Multi-perspective scenarios',
    instruction: 'Explore the question through several immersive scenarios or perspectives (e.g. best case, worst case, alternative viewpoint), then compare them.' },
  { id: 'MultiVerse', desc: 'Multiple perspectives',
    instruction: 'Look at this from several different perspectives or scenarios and compare them briefly.' },
  { id: 'Monolog', desc: 'Long-form deep dive',
    instruction: 'Write a thorough long-form response: a well-structured, flowing deep dive with headings, rather than a short answer.' },
  { id: 'StudyMode', desc: 'Tutor mode: teach & quiz',
    instruction: 'Act as a patient tutor: explain step by step, check understanding with a short quiz (answers at the end), and suggest how to practice.' },
  { id: 'CodeComplex', desc: 'Advanced coding',
    instruction: 'Act as a senior engineer: production-quality code, edge cases handled, brief explanation of design choices, and how to test it.' },
  { id: 'OmniBrief', desc: 'High-impact short answer',
    instruction: 'Give an OmniBrief: the complete answer in one to three crisp, high-impact sentences, then at most four short bullet points if they add real value.' },
  { id: 'SwiftStream', desc: 'Direct, jargon-free answer',
    instruction: 'Use SwiftStream: answer immediately and simply, in plain language, with no jargon and no preamble.' },
  { id: 'CommandCore', desc: 'Plan → act with tools → report',
    instruction: 'Use CommandCore: state a short plan, carry it out with the available tools, verify results, and finish with an action log of what was actually done.' },
  { id: 'CommandGrid', aliases: ['Command Grid'], desc: 'Status overview of connectors & tasks',
    instruction: 'Give a Command Grid status overview: which tools/connectors are available this turn, what you checked, and anything needing the user\'s attention, as a compact table.' },
  { id: 'VoxLink', desc: 'Speakable conversational answer',
    instruction: 'Answer conversationally as if speaking aloud: short, natural sentences, no markdown, no lists.' }
];

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const BY_KEY = new Map();
for (const f of CATALOG) for (const n of [f.id, ...(f.aliases || [])]) BY_KEY.set(norm(n), f);

// Custom @features (Settings → Features): [{ id, desc, instruction, web, chats, output, agents: ['all'] | [personaId…] }]
const RESERVED = new Set(['huddle', 'debate', 'paragon', 'neodela', 'lyte', 'flash', 'all', 'everyone']);
let CUSTOM = [];
function cleanCustom(list) {
  const out = [];
  for (const c of Array.isArray(list) ? list : []) {
    const id = String(c?.id || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 24);
    if (id.length < 2 || BY_KEY.has(norm(id)) || RESERVED.has(norm(id)) || out.some(x => norm(x.id) === norm(id))) continue;
    const instruction = String(c.instruction || '').trim().slice(0, 1500);
    if (!instruction) continue;
    out.push({ id, desc: String(c.desc || '').trim().slice(0, 80) || 'Custom feature', instruction, web: !!c.web, chats: !!c.chats,
      output: ['', 'quiz', 'flashcards', 'steps', 'ideas', 'chart', 'logic', 'insights', 'envision', 'next'].includes(c.output) ? c.output : '',
      agents: Array.isArray(c.agents) && c.agents.length ? c.agents.map(String).slice(0, 40) : ['all'], custom: true });
  }
  return out.slice(0, 40);
}
function setCustom(list) { CUSTOM = cleanCustom(list); return CUSTOM; }
const customFor = personaId => CUSTOM.filter(c => c.agents.includes('all') || c.agents.includes(personaId)).map(c => c.id);
const customMap = () => Object.fromEntries(CUSTOM.map(c => [c.id, c]));

// Canonicalize a features list from Supabase ("Aura Sync" → AuraSync, drop unknowns, dedupe).
function canonical(list) {
  const out = [];
  for (const n of list || []) { const f = BY_KEY.get(norm(n)); if (f && !out.includes(f.id)) out.push(f.id); }
  return out;
}
function lookup(name) { return BY_KEY.get(norm(name)) || CUSTOM.find(c => norm(c.id) === norm(name)) || null; }
function publicCatalog() {
  const { KIT } = require('./featurekit');
  return [...CATALOG.map(({ id, desc, web, history }) => ({ id, desc, web: !!(web || KIT[id]?.web), history: !!history, does: KIT[id]?.does || '' })),
    ...CUSTOM.map(c => ({ id: c.id, desc: c.desc, web: c.web, history: false, does: 'Your custom feature', custom: true, agents: c.agents, instruction: c.instruction, chats: c.chats, output: c.output }))];
}

// System-prompt block for the features active on this message.
function featurePrompt(ids) {
  const fs = ids.map(lookup).filter(Boolean);
  if (!fs.length) return '';
  return '\n\n[ACTIVE FEATURES — the user invoked these for this message]\n' + fs.map(f => `• ${f.id}: ${f.instruction}`).join('\n');
}

module.exports = { CATALOG, canonical, lookup, publicCatalog, featurePrompt, norm, setCustom, cleanCustom, customFor, customMap };

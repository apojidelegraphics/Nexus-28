// What each @feature actually DOES (v1.5). Every feature still adds its instruction to the system prompt, and on top:
//   • tools      — Seek/Integrate get web tools, Knowledge gets an encyclopedia lookup, Echo/Integrate get past-chat search
//   • pre-passes — Cognition reasons first, QuantumThread runs 3 parallel threads, MultiVerse runs 3 scenarios,
//                  CommandCore drafts a plan, before the answer is written (each extra pass is a short model call)
//   • local work — AuraSync reads your tone, CommandGrid builds a live status grid, SwiftStream trims context,
//                  ClarityLens measures reading level (and simplifies if it's too hard)
//   • widgets    — StudyMode quizzes, Magyk flashcards, NexusForge checklists, Synergy idea boards, FortressLens charts
//                  and risk matrices, LogicLattice proof trees, InsightPulse cards, Envision sketches + palettes,
//                  Proactix follow-up chips: the model writes a small ```nexus-… JSON block and the chat renders it.
//   • UI         — VoxLink reads the reply aloud, OmniBrief adds an "Expand" button, Monolog adds contents + export,
//                  CodeComplex adds Run / Save on code blocks.

const BLOCK_SPECS = {
  quiz: 'End with a short quiz as a fenced code block with the language tag nexus-quiz containing JSON: {"title":"…","questions":[{"q":"…","choices":["…","…","…","…"],"answer":0,"why":"…"}]} (3–5 questions, "answer" is the index of the correct choice). Do not reveal answers outside the block.',
  flashcards: 'End with 4–8 flashcards as a fenced code block with the language tag nexus-flashcards containing JSON: {"title":"…","cards":[{"front":"…","back":"…"}]}.',
  steps: 'Put the workflow in a fenced code block with the language tag nexus-steps containing JSON: {"title":"…","steps":[{"title":"…","detail":"…","tool":"optional tool/resource"}]} (3–10 steps). Keep text outside the block short.',
  ideas: 'Put the ideas in a fenced code block with the language tag nexus-ideas containing JSON: {"title":"…","ideas":[{"title":"…","pitch":"one sentence","pros":["…"],"cons":["…"]}]} (4–6 distinct ideas).',
  chart: 'When numbers are involved, include a chart as a fenced code block with the language tag nexus-chart containing JSON: {"type":"bar"|"line"|"pie","title":"…","labels":["…"],"series":[{"name":"…","data":[1,2,3]}]}. When there are risks, include a fenced code block with the language tag nexus-risks containing JSON: {"risks":[{"risk":"…","likelihood":1-3,"impact":1-3,"mitigation":"…"}]}.',
  logic: 'Put the argument in a fenced code block with the language tag nexus-logic containing JSON: {"premises":["…"],"steps":[{"claim":"…","from":[1,2]}],"conclusion":"…","assumptions":["…"],"weak":["…"]} ("from" lists premise numbers starting at 1, or step numbers prefixed with s like "s1").',
  insights: 'Put the insights in a fenced code block with the language tag nexus-insights containing JSON: {"headline":"the single biggest takeaway","insights":[{"title":"…","detail":"…","strength":1-3}]} (3–6 insights).',
  envision: 'Include one or two simple concept sketches as fenced code blocks with the language tag svg (a complete <svg> with viewBox="0 0 400 260", flat shapes and short text labels, no scripts, no external images), and a palette as a fenced code block with the language tag nexus-palette containing JSON: {"colors":[{"hex":"#112233","name":"…"}]}.',
  next: 'Finish with a fenced code block with the language tag nexus-next containing JSON: {"next":["follow-up question the user might ask", "…"]} (3–4 short items, phrased as the user would type them).',
  next2: 'Finish with a fenced code block with the language tag nexus-next containing JSON: {"next":["…","…","…"],"remind":"one concrete action the user should do, phrased as a reminder (or empty)"}.'
};

// feature id → what it does beyond the prompt
const KIT = {
  Seek: { web: true, does: 'Searches the web and reads pages' },
  Knowledge: { knowledge: true, does: 'Looks things up in an encyclopedia and shows a reference card' },
  Integrate: { web: true, chats: true, does: 'Pulls from the web, your past chats and your attachments' },
  Echo: { chats: true, history: true, does: 'Reads your recent chats and can search older ones' },
  Cognition: { pre: 'cognition', does: 'Reasons step by step first (open "Reasoning" to see it)' },
  QuantumThread: { pre: 'threads', does: 'Runs 3 independent lines of thought in parallel, then merges them' },
  MultiVerse: { pre: 'multiverse', does: 'Plays out 3 scenarios in parallel and compares them' },
  MultiVerseImmersive: { pre: 'multiverseImmersive', does: 'Writes 3 immersive scenarios in parallel and compares them' },
  CommandCore: { pre: 'plan', does: 'Plans first, runs the plan with tools, shows a live plan card + action log' },
  CommandGrid: { grid: true, does: 'Builds a live status grid of your tools, connectors and background work' },
  AuraSync: { aura: true, does: 'Reads your tone and what you need, and tunes the reply to it' },
  SwiftStream: { swift: true, does: 'Trims the context for speed and shows how fast it answered' },
  ClarityLens: { clarity: true, does: 'Measures reading level and simplifies the answer if it is too hard' },
  OmniBrief: { brief: true, does: 'One-to-three sentence answer with an Expand button' },
  VoxLink: { speak: true, does: 'Reads the answer aloud' },
  Monolog: { monolog: true, does: 'Long deep dive with a table of contents and one-click export' },
  CodeComplex: { code: true, does: 'Adds Run (JavaScript, sandboxed) and Save to code blocks' },
  StudyMode: { block: 'quiz', does: 'Teaches, then gives you an interactive quiz with a score' },
  Magyk: { block: 'flashcards', does: 'Teaches fast and makes flip flashcards' },
  NexusForge: { block: 'steps', does: 'Builds an interactive checklist you can tick off' },
  Synergy: { block: 'ideas', does: 'Brainstorms onto an idea board you can expand and star' },
  FortressLens: { block: 'chart', does: 'Draws charts and a risk matrix' },
  LogicLattice: { block: 'logic', does: 'Shows the argument as a proof tree with weak links flagged' },
  InsightPulse: { block: 'insights', does: 'Shows insight cards ranked by strength' },
  Envision: { block: 'envision', does: 'Sketches concepts and a color palette' },
  Proactix: { block: 'next', does: 'Adds follow-up chips you can tap' },
  'Proactix2.0': { block: 'next2', does: 'Adds follow-up chips and a one-tap reminder' }
};
const OUTPUT_BLOCKS = ['quiz', 'flashcards', 'steps', 'ideas', 'chart', 'logic', 'insights', 'envision', 'next'];

// Plan what to do for the active features of one message. custom: { [id]: { web, chats, output } } for custom features.
function plan(active = [], { custom = {}, agentic = false } = {}) {
  const k = { web: false, chats: false, knowledge: false, history: false, pre: [], blocks: [], grid: false, aura: false, swift: false, clarity: false, speak: false, brief: false, monolog: false, code: false };
  for (const id of active) {
    const f = KIT[id] || (custom[id] && { web: custom[id].web, chats: custom[id].chats, block: OUTPUT_BLOCKS.includes(custom[id].output) ? custom[id].output : null });
    if (!f) continue;
    for (const key of ['web', 'chats', 'knowledge', 'history', 'grid', 'aura', 'swift', 'clarity', 'speak', 'brief', 'monolog', 'code']) if (f[key]) k[key] = true;
    if (f.pre && !(f.pre === 'plan' && !agentic) && !k.pre.includes(f.pre)) k.pre.push(f.pre);
    if (f.block && !k.blocks.includes(f.block)) k.blocks.push(f.block);
  }
  // One expensive pre-pass per message is plenty: threads > multiverse > cognition; the plan always runs.
  const order = ['plan', 'threads', 'multiverseImmersive', 'multiverse', 'cognition'];
  const thinking = k.pre.filter(p => p !== 'plan').sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
  k.pre = [...(k.pre.includes('plan') ? ['plan'] : []), ...(thinking ? [thinking] : [])];
  if (k.blocks.includes('next2')) k.blocks = k.blocks.filter(b => b !== 'next');
  return k;
}
const blockPrompt = blocks => blocks.length ? '\n\n[OUTPUT WIDGETS — the app renders these blocks as interactive widgets; the JSON must be valid]\n' + blocks.map(b => '• ' + BLOCK_SPECS[b]).join('\n') : '';

// ---------- pre-passes
const lastUserText = msgs => { const m = [...msgs].reverse().find(x => x.role === 'user'); return typeof m?.content === 'string' ? m.content : ''; };
const THREADS = [
  ['First principles', 'Reason from first principles: what is fundamentally true here and what follows from it?'],
  ['Practical', 'Take the most practical, real-world angle: what actually works, costs, and gets done?'],
  ['Devil’s advocate', 'Argue against the obvious answer: what could be wrong, missing or overlooked?']
];
const SCENARIOS = [
  ['Best case', 'Play out the best realistic case.'],
  ['Worst case', 'Play out the worst realistic case.'],
  ['Another view', 'Look at it from a completely different perspective or stakeholder.']
];

// complete({ system, messages }) → text   (no tools, not streamed to the user)
async function runPre(kind, { complete, messages, onStatus = () => {} }) {
  const q = lastUserText(messages).slice(0, 4000);
  const ctx = messages.slice(-6);
  if (kind === 'cognition') {
    onStatus('Reasoning it through');
    const text = await complete({ system: 'You are a careful reasoner. Think step by step about the user\'s latest message: restate the goal, break it into parts, work each part, check for mistakes, and note the conclusion. Numbered steps, under 250 words. Do not write the final answer for the user.', messages: ctx });
    return { reasoning: text.trim(), note: `\n\n[REASONING NOTES — your own scratch work from a moment ago; use it, double-check it, don't repeat it verbatim]\n${text.trim()}` };
  }
  if (kind === 'threads' || kind === 'multiverse' || kind === 'multiverseImmersive') {
    const lenses = kind === 'threads' ? THREADS : SCENARIOS;
    onStatus(kind === 'threads' ? 'Running 3 threads in parallel' : 'Playing out 3 scenarios');
    const immersive = kind === 'multiverseImmersive' ? ' Write it as a short, vivid, immersive scene (second person, present tense).' : '';
    const outs = await Promise.all(lenses.map(([label, how]) => complete({
      system: `${how}${immersive} Respond to the user's latest message from this angle only, in under 130 words. No preamble.`, messages: ctx
    }).then(t => ({ label, text: t.trim() })).catch(e => ({ label, text: '(this thread failed: ' + e.message + ')' }))));
    const name = kind === 'threads' ? 'THREADS' : 'SCENARIOS';
    return { threads: outs, threadKind: kind === 'threads' ? 'threads' : 'scenarios',
      note: `\n\n[${name} — explored in parallel just now; merge them: say where they agree, where they differ, and give one recommendation]\n` + outs.map(o => `## ${o.label}\n${o.text}`).join('\n\n') };
  }
  if (kind === 'plan') {
    onStatus('Planning');
    const text = await complete({ system: 'Plan how to handle the user\'s latest request with the available tools. Reply with ONLY a JSON array of 2–5 short imperative steps, e.g. ["Search for X","Read the top 2 results","Summarize"].', messages: ctx });
    let steps = [];
    try { steps = JSON.parse((text.match(/\[[\s\S]*\]/) || ['[]'])[0]).map(s => String(s).slice(0, 120)).slice(0, 6); } catch {}
    if (!steps.length) steps = text.split('\n').map(s => s.replace(/^[\s\d.)*-]+/, '').trim()).filter(Boolean).slice(0, 5);
    return { plan: steps, note: steps.length ? `\n\n[COMMANDCORE PLAN — follow it, adapt if needed, and finish with an "Action log" of what you actually did]\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}` : '' };
  }
  return {};
}

// ---------- AuraSync: read tone & intent locally (no model call)
function aura(text) {
  const t = String(text || '');
  const low = t.toLowerCase();
  const tones = [];
  if (/\b(asap|urgent|quick(ly)?|hurry|right now|deadline|due (today|tonight|tomorrow)|in \d+ ?min)/.test(low)) tones.push('in a hurry');
  if (/\b(ugh|annoy|frustrat|stuck|doesn'?t work|not working|broken|hate|wtf|again\?|still)\b/.test(low) || /!{2,}|\?{2,}/.test(t)) tones.push('frustrated');
  if (/\b(worried|anxious|nervous|scared|stress)/.test(low)) tones.push('stressed');
  if (/\b(confus|don'?t (get|understand)|lost|what does .* mean|eli5|explain like)/.test(low)) tones.push('confused');
  if (/\b(awesome|amazing|love|excited|yay|let'?s go|hype)\b/.test(low) || /!\s*$/.test(t) && !tones.includes('frustrated')) tones.push('excited');
  if (/\b(curious|wonder|why does|how come)\b/.test(low)) tones.push('curious');
  const caps = (t.match(/[A-Z]{4,}/g) || []).length;
  if (caps >= 2 && !tones.includes('frustrated')) tones.push('emphatic');
  let wants = 'a clear answer';
  if (/\b(tl;?dr|short|brief|one line|quick answer|just tell me)\b/.test(low) || tones.includes('in a hurry')) wants = 'a quick, direct answer';
  else if (/\b(in detail|deep dive|thorough|explain everything|step by step)\b/.test(low)) wants = 'depth and detail';
  else if (/\b(fix|error|bug|crash|not working)\b/.test(low)) wants = 'a fix they can apply now';
  else if (/\b(idea|ideas|brainstorm|suggest)/.test(low)) wants = 'options to choose from';
  else if (tones.includes('confused')) wants = 'a simple explanation';
  const words = t.split(/\s+/).filter(Boolean).length;
  const formal = /\b(dear|regards|kindly|please advise|would you be so kind)\b/.test(low);
  const register = formal ? 'formal' : words < 8 && !/[.!?]$/.test(t.trim()) ? 'casual' : 'neutral';
  const tone = tones.length ? tones.slice(0, 2).join(', ') : 'calm';
  return { tone, wants, register,
    note: `\n\n[AURASYNC — read locally from the user's message] Tone: ${tone}. They want ${wants}. Register: ${register}. Start with one short line that shows you get it (no therapy-speak), then match length and tone to that.` };
}

// ---------- ClarityLens: Flesch–Kincaid grade, computed here
function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const s = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, s ? s.length : 1);
}
function readingGrade(md) {
  const text = String(md || '').replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_`|[\]()-]/g, ' ').replace(/https?:\S+/g, ' ');
  const sentences = Math.max(1, (text.match(/[.!?]+(\s|$)/g) || []).length + (text.match(/\n\s*\n/g) || []).length * 0.3);
  const words = text.split(/\s+/).filter(w => /[a-z]/i.test(w));
  if (words.length < 12) return { grade: 0, words: words.length };
  const syl = words.reduce((n, w) => n + syllables(w), 0);
  const grade = 0.39 * (words.length / sentences) + 11.8 * (syl / words.length) - 15.59;
  return { grade: Math.max(1, Math.round(grade * 10) / 10), words: words.length };
}

// ---------- CommandGrid: live status, gathered locally
function gridRows({ toolsLabels = [], connectors = [], helperCaps = {}, watches = [], mission = null, routines = [], access = null }) {
  const rows = [];
  const tools = toolsLabels.filter(t => !t.includes('__'));
  rows.push({ area: 'Built-in tools', status: tools.length ? 'ready' : 'none', detail: tools.length ? tools.join(', ') : 'No tools this turn' });
  for (const c of connectors) rows.push({ area: `Connector · ${c.name}`, status: c.status === 'connected' ? 'ready' : c.enabled === false ? 'off' : 'issue', detail: c.status === 'connected' ? `${c.tools || 0} tools` : c.error || c.status || 'not connected' });
  rows.push({ area: 'NexusCore helper', status: helperCaps.built ? 'ready' : 'issue', detail: helperCaps.built ? `v${helperCaps.version || '?'} · ${['stt', 'eventkit', 'wake', 'screen', 'ax'].filter(k => helperCaps[k]).join(', ') || 'basic'}` : 'not built' });
  const live = watches.filter(w => w.status === 'watching');
  rows.push({ area: 'Watch mode', status: live.length ? 'active' : 'idle', detail: live.length ? live.map(w => `${w.title || w.app}: ${w.condition}`).join(' · ') : 'Nothing being watched' });
  rows.push({ area: 'Mission', status: mission && !['done', 'error'].includes(mission.status) ? 'active' : 'idle', detail: mission ? `${mission.title} — ${mission.activity || mission.status}` : 'None running' });
  const on = routines.filter(r => r.enabled !== false);
  rows.push({ area: 'Routines', status: on.length ? 'active' : 'idle', detail: on.length ? on.slice(0, 4).map(r => r.name).join(', ') + (on.length > 4 ? ` +${on.length - 4}` : '') : 'None' });
  if (access) {
    const limited = Object.entries(access).filter(([id, a]) => !id.startsWith('legacy:') && a.mode === 'free' && a.limit && !a.unlocked);
    if (limited.length) rows.push({ area: 'Free chats left', status: limited.some(([, a]) => a.used >= a.limit) ? 'issue' : 'ready', detail: limited.map(([id, a]) => `${id} ${Math.max(0, a.limit - a.used)}/${a.limit}`).join(' · ') });
  }
  return rows;
}
const gridNote = rows => `\n\n[COMMAND GRID — live status gathered by Nexus just now]\n` + rows.map(r => `| ${r.area} | ${r.status} | ${r.detail} |`).join('\n') + '\nSummarize anything that needs attention first. The app already shows this grid as a card, so do not repeat the whole table.';

// ---------- Agent handoff
const HANDOFF = /^\s*\[\[\s*HANDOFF\s*:\s*([a-z]+)\s*(?::\s*([^\]]*))?\]\]/i;
function parseHandoff(text) { const m = String(text || '').match(HANDOFF); return m ? { to: m[1].toLowerCase(), reason: (m[2] || '').trim().slice(0, 160) } : null; }
function handoffNote(targets) {
  if (!targets.length) return '';
  const desc = { paragon: 'Paragon (can use tools: web research, the user\'s apps, files, calendar, actions)', neodela: 'Neodela (deep reasoning, long writing, complex code)', lyte: 'Lyte (balanced, fast)' };
  return `\n\n[HANDOFF] You may hand this message to a stronger Nexus agent ONLY if it clearly needs more than you can do well: ${targets.map(t => desc[t] || t).join('; ')}. ` +
    `To hand off, reply with exactly one line and nothing else: [[HANDOFF:${targets[0]}: short reason]] (use the agent's id: ${targets.join(' or ')}). For normal questions, just answer.`;
}
// Holds back the first characters of a streamed reply until we know it isn't a handoff marker.
function handoffGate(onText) {
  let buf = '', open = false;
  return {
    push(t) {
      if (open) return onText(t);
      buf += t;
      const s = buf.trimStart();
      if (s.length >= 2 && !s.startsWith('[[')) { open = true; onText(buf); buf = ''; }
      else if (s.length >= 12 && !/^\[\[\s*hand/i.test(s)) { open = true; onText(buf); buf = ''; }
    },
    flush() { if (!open && buf) { onText(buf); buf = ''; } open = true; },
    held: () => buf
  };
}

module.exports = { KIT, BLOCK_SPECS, OUTPUT_BLOCKS, plan, blockPrompt, runPre, aura, readingGrade, gridRows, gridNote, parseHandoff, handoffNote, handoffGate, THREADS, SCENARIOS };

/* Generated from the Nexus '28 Mac app by scripts/build-try.js — edit the original, not this copy. */
(function () {
  const mods = {}; const req = n => { if (!(n in mods)) throw new Error('nexuskit: ' + n); return mods[n]; };
mods['./featurekit'] = (function (require) { const module = { exports: {} }; const exports = module.exports;
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
  hints: 'Put the tutoring in a fenced code block with the language tag nexus-hints containing JSON: {"problem":"the problem, restated","concept":"what it tests","hints":["first nudge","second, more specific","third, nearly there"],"answer":"the final answer with a short worked solution","check":"how the student can check their own answer"}. Outside the block, write only one or two encouraging lines; do NOT reveal the answer outside the block.',
  next: 'Finish with a fenced code block with the language tag nexus-next containing JSON: {"next":["follow-up question the user might ask", "…"]} (3–4 short items, phrased as the user would type them).',
  gauntlet: 'Put the stress test in a fenced code block with the language tag nexus-gauntlet containing JSON: {"target":"what was tested","score":0-100,"verdict":"pass"|"fix"|"fail","critical":[{"issue":"…","why":"…","fix":"…"}],"minor":[{"issue":"…","fix":"…"}],"tests":["edge case or test you ran in your head", "…"],"strengths":["…"]} (pass = no critical issues and score ≥ 80). Keep text outside the block to one or two sentences.',
  threats: 'Put risks worth tracking in a fenced code block with the language tag nexus-threats containing JSON: {"threats":[{"title":"…","level":"red"|"amber"|"green","note":"why","fix":"what to do"}]}.',
  dossier: 'To offer saving something durable about the user, add a fenced code block with the language tag nexus-dossier containing JSON: {"add":[{"kind":"project"|"goal"|"deadline"|"preference"|"fact","text":"…","due":"YYYY-MM-DD or empty"}]}.',
  verdict: 'Put the decision in a fenced code block with the language tag nexus-verdict containing JSON: {"question":"…","criteria":[{"name":"…","weight":1-5}],"options":[{"name":"…","scores":[1-10 per criterion, same order],"note":"one line"}],"winner":"option name","runnerUp":"option name","confidence":0-100,"wouldChange":"the fact that would flip it"} (2–5 options, 2–6 criteria).',
  // 3.13: widgets any agent may use when they fit (not tied to a feature)
  timeline: 'For history, schedules or anything in order of time, a fenced code block with the language tag nexus-timeline containing JSON: {"title":"…","events":[{"when":"1914-06-28 or June 1914 or 9:00","title":"…","detail":"one short sentence"}]} (3–12 events, oldest first).',
  compare: 'To compare 2–4 options side by side, a fenced code block with the language tag nexus-compare containing JSON: {"title":"…","options":["A","B"],"rows":[{"label":"Price","values":["$10","$15"],"best":0}],"pick":{"option":0,"why":"one sentence"}} ("best" is the index of the better value, or -1).',
  timer: 'When the user wants to time something (study block, cooking, a break), a fenced code block with the language tag nexus-timer containing JSON: {"label":"…","minutes":25,"steps":[{"label":"Focus","minutes":25},{"label":"Break","minutes":5}]} ("steps" optional).',
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
  // 4.4.0 Solis
  ImagineEngine: { block: 'envision', does: 'Turns a rough idea into a full concept: hook, mood, key visuals and a palette' },
  LuminaCanvas: { block: 'steps', does: 'Lays your idea out as a storyboard and can make the frames as pictures (LuminaRender)' },
  ResonanceCore: { aura: true, does: 'Reads the emotional and cultural subtext of your story and how each beat will land' },
  StoryLattice: { lattice: true, does: 'Keeps your world\'s notes (title, characters, palette, rules, pictures) for the whole chat' },
  Proactix: { block: 'next', does: 'Adds follow-up chips you can tap' },
  Homework: { block: 'hints', does: 'Hints one at a time, then the answer, then check your own' },
  Cite: { web: true, cite: true, does: 'Reads sources and formats MLA / APA / Chicago citations' },
  'Proactix2.0': { block: 'next2', does: 'Adds follow-up chips and a one-tap reminder' },
  // v2.4 Apex (Axiom)
  Blueprint: { pre: 'blueprint', does: 'Drafts a plan card (steps, tools, risks, fallbacks) you approve before it acts, then checks steps off live' },
  Gauntlet: { block: 'gauntlet', does: 'Stress-tests your plan, code or idea and gives a scored report (critical / minor / fixes)' },
  Verdict: { block: 'verdict', does: 'Weighs your options on criteria and commits to one recommendation' },
  Swarm: { swarm: true, does: 'Splits the job across Flash, Lyte and Neodela in parallel, grades their work and merges it (with receipts)' },
  ProofMode: { post: 'proof', does: 'Checks every claim after answering: confidence, source or "inferred", and fixes its own mistakes' }
};
const OUTPUT_BLOCKS = ['quiz', 'flashcards', 'steps', 'ideas', 'chart', 'logic', 'insights', 'envision', 'next', 'hints', 'gauntlet', 'verdict', 'threats', 'dossier'];

// Plan what to do for the active features of one message. custom: { [id]: { web, chats, output } } for custom features.
function plan(active = [], { custom = {}, agentic = false } = {}) {
  const k = { cite: false, web: false, chats: false, knowledge: false, history: false, pre: [], blocks: [], grid: false, aura: false, swift: false, clarity: false, speak: false, brief: false, monolog: false, code: false, proof: false, swarm: false };
  for (const id of active) {
    const f = KIT[id] || (custom[id] && { web: custom[id].web, chats: custom[id].chats, block: OUTPUT_BLOCKS.includes(custom[id].output) ? custom[id].output : null });
    if (!f) continue;
    for (const key of ['cite', 'web', 'chats', 'knowledge', 'history', 'grid', 'aura', 'swift', 'clarity', 'speak', 'brief', 'monolog', 'code']) if (f[key]) k[key] = true;
    if (f.pre && !(f.pre === 'plan' && !agentic) && !k.pre.includes(f.pre)) k.pre.push(f.pre);
    if (f.block && !k.blocks.includes(f.block)) k.blocks.push(f.block);
    if (f.post === 'proof') k.proof = true;
    if (f.swarm) k.swarm = true;
  }
  // One expensive pre-pass per message is plenty: threads > multiverse > cognition; the plan always runs.
  // Blueprint replaces CommandCore's plan (it's the same idea, with risks, fallbacks and your approval).
  const order = ['plan', 'threads', 'multiverseImmersive', 'multiverse', 'cognition'];
  const thinking = k.pre.filter(p => p !== 'plan' && p !== 'blueprint').sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
  k.pre = [...(k.pre.includes('blueprint') ? ['blueprint'] : k.pre.includes('plan') ? ['plan'] : []), ...(thinking ? [thinking] : [])];
  if (k.blocks.includes('next2')) k.blocks = k.blocks.filter(b => b !== 'next');
  return k;
}
const blockPrompt = blocks => blocks.length ? '\n\n[OUTPUT WIDGETS — the app renders these blocks as interactive widgets; the JSON must be valid. Use the exact language tag given (for example ```nexus-gauntlet), never ```json]\n' + blocks.map(b => '• ' + BLOCK_SPECS[b]).join('\n') : '';
// Models sometimes write ```json (or no tag) instead of ```nexus-…: give those blocks their real tag when the JSON
// has the shape of a widget this reply asked for, so it shows as the widget and not raw JSON.
const SHAPES = {
  gauntlet: j => (Array.isArray(j.critical) || Array.isArray(j.minor)) && ('score' in j || 'verdict' in j),
  verdict: j => Array.isArray(j.options) && (Array.isArray(j.criteria) || 'winner' in j),
  quiz: j => Array.isArray(j.questions), flashcards: j => Array.isArray(j.cards), steps: j => Array.isArray(j.steps),
  ideas: j => Array.isArray(j.ideas), logic: j => Array.isArray(j.premises), insights: j => Array.isArray(j.insights), hints: j => Array.isArray(j.hints), next: j => Array.isArray(j.next),
  memory: j => Array.isArray(j.remember) && j.remember.every(x => typeof x === 'string'),
  timeline: j => Array.isArray(j.events), compare: j => Array.isArray(j.options) && Array.isArray(j.rows), timer: j => typeof j.minutes === 'number' || Array.isArray(j.steps) && j.steps.every(s => typeof s?.minutes === 'number')
};
// 3.13: the general widgets every agent may use (added to every typed answer, not voice)
const GENERAL_WIDGETS = ['timeline', 'compare', 'timer'];
const generalWidgetsPrompt = () => '\n\n[OPTIONAL ANSWER WIDGETS — only when they clearly help; the app draws them. Valid JSON, exact language tag, never ```json]\n' + GENERAL_WIDGETS.map(b => '• ' + BLOCK_SPECS[b]).join('\n');
function shapeOf(j, allowed = Object.keys(SHAPES)) { if (!j || typeof j !== 'object' || Array.isArray(j)) return null; return allowed.find(k => SHAPES[k]?.(j)) || null; }
function retagBlocks(text, blocks = []) {
  const allowed = blocks.map(b => b === 'next2' ? 'next' : b).filter(b => SHAPES[b]);
  if (!allowed.length || !text) return text;
  return String(text).replace(/```(json|JSON|javascript|js)?[ \t]*\n([\s\S]*?)```/g, (all, _lang, body) => {
    let j = null; try { j = JSON.parse(body.trim()); } catch { return all; }
    const k = shapeOf(j, allowed); return k ? '```nexus-' + k + '\n' + body.trim() + '\n```' : all;
  });
}

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
  if (kind === 'blueprint') {
    onStatus('Drafting a Blueprint');
    const text = await complete({ system: 'You are planning, not answering. Draft the best plan for the user\'s latest request. Reply with ONLY JSON: {"objective":"one line","steps":[{"step":"short imperative","tool":"tool or resource (or empty)","risk":"what could go wrong (or empty)","fallback":"what to do if it fails (or empty)"}],"estimate":"rough time","risks":["biggest risks overall"]}. 2–7 steps.', messages: ctx });
    const bp = parseBlueprint(text);
    if (!bp) return {};
    return { blueprint: bp, note: `\n\n[BLUEPRINT — the plan the user approved; follow it, use a step's fallback if it fails, and end with a short "Executed" log]\nObjective: ${bp.objective}\n${bp.steps.map((s, i) => `${i + 1}. ${s.step}${s.tool ? ` [${s.tool}]` : ''}${s.fallback ? ` (fallback: ${s.fallback})` : ''}`).join('\n')}` };
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

function parseBlueprint(text) {
  let j = null; try { j = JSON.parse((String(text).match(/\{[\s\S]*\}/) || ['null'])[0]); } catch {}
  const cut = (v, n) => String(v || '').trim().slice(0, n);
  const steps = (Array.isArray(j?.steps) ? j.steps : []).map(x => typeof x === 'string' ? { step: cut(x, 140) } : { step: cut(x?.step, 140), tool: cut(x?.tool, 60), risk: cut(x?.risk, 140), fallback: cut(x?.fallback, 140) }).filter(x => x.step).slice(0, 8);
  if (!steps.length) return null;
  return { objective: cut(j.objective, 200), steps, estimate: cut(j.estimate, 40), risks: (Array.isArray(j.risks) ? j.risks : []).map(r => cut(r, 160)).filter(Boolean).slice(0, 4) };
}

// ---------- Proof mode (after the answer): check each claim, score it, fix mistakes.
// complete() is a plain model call. Returns { claims, fixed, text } (text = corrected answer, or the original).
async function proofPass(answer, { complete, messages, onStatus = () => {} }) {
  onStatus('Proof mode: checking every claim');
  const q = lastUserText(messages).slice(0, 2000);
  const raw = await complete({ system: 'You are a strict fact-checker reviewing an AI answer before the user sees it. List the answer\'s factual claims (at most 10, skip opinions), give each a confidence 0-100, a source URL if the answer itself cites one for it (else ""), and "inferred": true if it is reasoning rather than established fact. If anything is wrong or overstated, write a corrected full answer that keeps the same structure and voice; otherwise leave "corrected" empty. Reply with ONLY JSON: {"claims":[{"claim":"…","confidence":0-100,"source":"","inferred":false}],"problems":["what was wrong"],"corrected":""}.',
    messages: [{ role: 'user', content: `Question:\n${q}\n\nAnswer to check:\n${String(answer).slice(0, 12000)}` }] });
  let j = null; try { j = JSON.parse((String(raw).match(/\{[\s\S]*\}/) || ['null'])[0]); } catch {}
  if (!j) return { claims: [], fixed: [], text: answer };
  const claims = (Array.isArray(j.claims) ? j.claims : []).map(c => ({ claim: String(c?.claim || '').slice(0, 220), confidence: Math.max(0, Math.min(100, Math.round(+c?.confidence || 0))), source: /^https?:\/\//.test(c?.source || '') ? String(c.source).slice(0, 300) : '', inferred: !!c?.inferred })).filter(c => c.claim).slice(0, 10);
  const fixed = (Array.isArray(j.problems) ? j.problems : []).map(p => String(p).slice(0, 200)).filter(Boolean).slice(0, 5);
  const corrected = typeof j.corrected === 'string' && j.corrected.trim().length > 40 && fixed.length ? j.corrected.trim() : '';
  return { claims, fixed: corrected ? fixed : [], text: corrected || answer };
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

module.exports = { KIT, BLOCK_SPECS, OUTPUT_BLOCKS, GENERAL_WIDGETS, generalWidgetsPrompt, plan, blockPrompt, retagBlocks, shapeOf, runPre, proofPass, parseBlueprint, aura, readingGrade, gridRows, gridNote, parseHandoff, handoffNote, handoffGate, THREADS, SCENARIOS };

return module.exports; })(req);
mods['./features'] = (function (require) { const module = { exports: {} }; const exports = module.exports;
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
  // 4.4.0 Solis
  { id: 'ImagineEngine', desc: 'Rough idea → a whole concept',
    instruction: 'Turn the rough idea into a cohesive concept: a one-line hook, the mood, the world, two or three key moments or visuals, and a small color palette. Keep the user as the author: offer directions, don\'t take over.' },
  { id: 'LuminaCanvas', desc: 'Storyboards and art direction',
    instruction: 'Work like a studio art director: lay the idea out as a short storyboard (numbered frames: shot, framing, light, color, mood). When a finished picture would help and you have the lumina_render tool, offer or make it.' },
  { id: 'ResonanceCore', desc: 'Emotional and cultural subtext',
    instruction: 'Read the emotional and cultural subtext: what the audience will feel at each beat, what lands, what falls flat, and how to deepen it with sensory detail.' },
  { id: 'StoryLattice', desc: 'Keeps your world consistent',
    instruction: 'Keep everything consistent with the project notes (title, characters, palette, world rules). Point out continuity slips and fix them.' },
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
  { id: 'Homework', desc: 'Homework helper: hints first, answer last', universal: 'homework_helper',
    instruction: 'Act as a homework tutor. Identify the exact problem (from the attached screen or the message), name the concept it tests, then guide the student with a ladder of hints instead of giving the answer straight away. Never skip to the answer in the visible text; it goes only in the widget.' },
  { id: 'Cite', desc: 'Citations in MLA, APA or Chicago', universal: 'citations',
    instruction: 'Help the user cite sources. For every link or source they mention (or that you find), call cite_source to read its details, then give the citation in the style they asked for (MLA 9 if they did not say). Point out anything missing, like an author or date.' },
  // v2.4 Apex features (Nexus '28 Axiom only)
  { id: 'Blueprint', desc: 'Plan card you approve before it acts', apex: true,
    instruction: 'Use Blueprint: work from the approved plan below. Follow it step by step, adapt only if a step fails (say so and use its fallback), and finish with a short "Executed" log of what was done.' },
  { id: 'Gauntlet', desc: 'Stress test with a scored report', apex: true,
    instruction: 'Run the Gauntlet on what the user gave you (plan, code, essay, argument, budget): attack it, write hard test cases and edge cases, argue against it, find every point where it breaks. Rank issues critical or minor, each with a concrete fix. Be ruthless about the work and fair to the person.' },
  { id: 'Verdict', desc: 'One decision from weighed options', apex: true,
    instruction: 'Deliver a Verdict: identify the real options, the criteria that matter (with weights), score each option honestly, account for uncertainty, and commit to one recommendation, the runner-up, and what new fact would change your mind.' },
  { id: 'Swarm', aliases: ['CommandSwarm', 'Command Swarm'], desc: 'Axiom commands Flash, Lyte and Neodela in parallel', apex: true,
    instruction: 'Command Swarm: your workers already did their parts (below). Merge the best of their work into one answer, fix what they got wrong, and say briefly where you overruled one.' },
  { id: 'ProofMode', aliases: ['Proof', 'Proof mode'], desc: 'Every claim checked, scored and sourced', apex: true,
    instruction: 'Proof mode: only state what you can support. Attach a source link to factual claims where you have one, mark anything you inferred as (inferred), and never present a guess as a fact.' },
  { id: 'VoxLink', desc: 'Speakable conversational answer',
    instruction: 'Answer conversationally as if speaking aloud: short, natural sentences, no markdown, no lists.' }
];

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const BY_KEY = new Map();
for (const f of CATALOG) for (const n of [f.id, ...(f.aliases || [])]) BY_KEY.set(norm(n), f);

// Custom @features (Settings → Features): [{ id, desc, instruction, web, chats, output, agents: ['all'] | [personaId…] }]
const RESERVED = new Set(['huddle', 'debate', 'paragon', 'neodela', 'lyte', 'flash', 'axiom', 'all', 'everyone']);
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
const APEX = new Set(CATALOG.filter(f => f.apex).map(f => f.id));   // only an Apex agent may use these
const customFor = personaId => CUSTOM.filter(c => c.agents.includes('all') || c.agents.includes(personaId)).map(c => c.id);
const customMap = () => Object.fromEntries(CUSTOM.map(c => [c.id, c]));

// Canonicalize a features list from Supabase ("Aura Sync" → AuraSync, drop unknowns, dedupe).
// Universal features every agent gets (when their beta flag is on for you).
const universal = (isOn = () => true) => CATALOG.filter(f => f.universal && isOn(f.universal)).map(f => f.id);
function canonical(list) {
  const out = [];
  for (const n of list || []) { const f = BY_KEY.get(norm(n)); if (f && !out.includes(f.id)) out.push(f.id); }
  return out;
}
function lookup(name) { return BY_KEY.get(norm(name)) || CUSTOM.find(c => norm(c.id) === norm(name)) || null; }
function publicCatalog() {
  const { KIT } = require('./featurekit');
  return [...CATALOG.map(({ id, desc, web, history, apex }) => ({ id, desc, web: !!(web || KIT[id]?.web), history: !!history, does: KIT[id]?.does || '', ...(apex ? { apex: true } : {}) })),
    ...CUSTOM.map(c => ({ id: c.id, desc: c.desc, web: c.web, history: false, does: 'Your custom feature', custom: true, agents: c.agents, instruction: c.instruction, chats: c.chats, output: c.output }))];
}

// System-prompt block for the features active on this message.
function featurePrompt(ids) {
  const fs = ids.map(lookup).filter(Boolean);
  if (!fs.length) return '';
  return '\n\n[ACTIVE FEATURES — the user invoked these for this message]\n' + fs.map(f => `• ${f.id}: ${f.instruction}`).join('\n');
}

module.exports = { CATALOG, APEX, universal, canonical, lookup, publicCatalog, featurePrompt, norm, setCustom, cleanCustom, customFor, customMap };

return module.exports; })(req);
  window.NexusKit = { features: mods['./features'], kit: mods['./featurekit'] };
})();

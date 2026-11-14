// Morning Brief: Nexus gathers the facts itself (so any agent can write it, even on the free key),
// then an agent turns them into a short, friendly brief.
//
// gather({ sections, topics, settings, deps }) → { blocks: [{ key, title, text }], notes: [] }
//   deps: { weather, web, helper, helperCaps, mcp, cloud, access }  (each optional; missing ones are skipped)

const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} took too long`)), ms))]);
const fmt = ts => new Date(ts * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

async function gather({ sections = {}, topics = '', settings = {}, deps = {} } = {}) {
  const blocks = [], notes = [];
  const jobs = [];
  const add = (key, title, fn, ms = 9000) => jobs.push(withTimeout(Promise.resolve().then(fn), ms, title)
    .then(text => { if (text) blocks.push({ key, title, text }); })
    .catch(e => notes.push(`${title}: ${e.message}`)));

  if (sections.weather !== false && deps.weather) {
    add('weather', 'Weather', async () => {
      const loc = settings.weather?.location;
      if (!loc) { notes.push('Weather: no default location set (Settings → Connectors → Weather).'); return ''; }
      const r = await deps.weather.forecast({ location: loc, days: 1, units: settings.weather?.units });
      return r.content;
    });
  }
  const ek = deps.helper && deps.helperCaps?.eventkit;
  const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() / 1000; };
  if (sections.calendar !== false && ek && settings.apple?.calendar) {
    add('calendar', "Today's calendar", async () => {
      const s = startOfDay();
      const ev = await deps.helper.request({ cmd: 'cal_list', id: 'brief-cal-' + Date.now(), start: s, end: s + 86400 }, ['result'], 8000);
      const list = ev.data || [];
      return list.length ? list.map(e => `- ${e.allDay ? 'All day' : fmt(e.start) + '–' + fmt(e.end)}: ${e.title}${e.location ? ' @ ' + e.location : ''}`).join('\n') : 'No events today.';
    });
  } else if (sections.calendar !== false && !settings.apple?.calendar) notes.push('Calendar: turn on Apple Calendar in Settings → Connectors to include it.');
  if (sections.reminders !== false && ek && settings.apple?.reminders) {
    add('reminders', 'Reminders due', async () => {
      const ev = await deps.helper.request({ cmd: 'rem_list', id: 'brief-rem-' + Date.now() }, ['result'], 8000);
      const end = startOfDay() + 86400;
      const due = (ev.data || []).filter(r => r.due && r.due < end);
      return due.length ? due.map(r => `- ${r.title} — ${r.due < Date.now() / 1000 ? 'overdue' : 'due ' + fmt(r.due)}`).join('\n') : 'Nothing due today.';
    });
  }
  if (sections.gmail !== false && deps.mcp) {
    const t = findGmailTool(deps.mcp);
    if (t) add('gmail', 'Unread email', async () => {
      const r = await deps.mcp.call(t.route, t.args, undefined);
      if (r.isError) throw new Error(String(r.text).slice(0, 120));
      return String(r.text || '').slice(0, 2500) || 'No unread email from the last day.';
    }, 15000);
  }
  if (sections.headlines !== false && deps.web && settings.web?.enabled !== false) {
    add('headlines', 'Headlines', async () => {
      const q = topics ? `${topics} news today` : 'top news today';
      const r = await deps.web.search({ provider: settings.web?.provider || 'duckduckgo', query: q, max: 5, key: deps.getKey?.(settings.web?.provider) });
      return r.results.slice(0, 5).map(x => `- ${x.title} (${hostOf(x.url)})${x.snippet ? ': ' + x.snippet.slice(0, 160) : ''}`).join('\n');
    }, 12000);
  }
  if (sections.announcements !== false && deps.cloud?.announcements?.length) {
    blocks.push({ key: 'announcements', title: 'Nexus announcements', text: deps.cloud.announcements.slice(0, 3).map(a => '- ' + a.message).join('\n') });
  }
  if (sections.usage !== false && deps.access) {
    const left = Object.entries(deps.access).filter(([id, a]) => !id.startsWith('legacy:') && a.mode === 'free' && a.limit && !a.unlocked)
      .map(([id, a]) => `${id}: ${Math.max(0, a.limit - a.used)} of ${a.limit}`);
    if (left.length) blocks.push({ key: 'usage', title: 'Free Nexus chats left', text: left.join(', ') });
  }
  if (sections.study !== false && deps.study) { const line = deps.study.summaryLine(); if (line) blocks.push({ key: 'study', title: 'Study', text: line }); }
  await Promise.all(jobs);
  const order = ['weather', 'calendar', 'reminders', 'study', 'gmail', 'headlines', 'announcements', 'usage'];
  blocks.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  return { blocks, notes };
}
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

// The Google (Gmail) connector, if one is connected: a search/list tool we can ask for unread mail.
function findGmailTool(mcp) {
  let tools;
  try { tools = mcp.agentTools(); } catch { return null; }
  const name = tools.tools.map(t => t.name).find(n => /gmail/i.test(n) && /(search|list|query)/i.test(n) && /(message|mail|thread|email)/i.test(n));
  if (!name) return null;
  const def = tools.tools.find(t => t.name === name);
  const props = def?.parameters?.properties || {};
  const qKey = ['query', 'q', 'search_query'].find(k => k in props) || 'query';
  const args = { [qKey]: 'is:unread newer_than:1d' };
  if ('max_results' in props) args.max_results = 8; else if ('page_size' in props) args.page_size = 8;
  return { route: tools.routes[name], args };
}

function briefPrompt({ blocks, notes, nickname, now = new Date() }) {
  const day = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const facts = blocks.map(b => `## ${b.title}\n${b.text}`).join('\n\n') || '(Nothing could be gathered.)';
  return `Write my Morning Brief for ${day}. Greet me${nickname ? ` as ${nickname}` : ''} in one short line, then cover only what's below, most useful first: ` +
    `weather in one line, then today's plan, anything due, email worth a look, and 2–3 headlines. Keep it under 170 words, scannable, ` +
    `with short bold labels. Don't invent anything that isn't in the facts. End with one short encouraging line.\n\n` +
    `FACTS GATHERED BY NEXUS:\n\n${facts}${notes.length ? `\n\n(Couldn't include: ${notes.join(' · ')})` : ''}`;
}

// ---------- Evening Wrap-up (v1.6): what you did today, what's left, what's first tomorrow.
//   deps: { convos, helper, helperCaps, metrics, study, now }
function unfinishedChecklists(conv, since) {
  const out = [];
  for (const m of conv.messages) {
    if (m.role !== 'assistant' || (m.ts || 0) < since) continue;
    const blocks = [...String(m.content || '').matchAll(/```nexus-steps\s*([\s\S]*?)```/g)];
    blocks.forEach((b, i) => {
      let d; try { d = JSON.parse(b[1].replace(/,\s*([}\]])/g, '$1')); } catch { return; }
      const steps = (d.steps || []).map(s => typeof s === 'string' ? s : s.title).filter(Boolean);
      const done = new Set((m.widget || {})[i ? 'steps' + (i + 1) : 'steps'] || []);
      const left = steps.filter((_, j) => !done.has(j));
      if (steps.length && left.length) out.push({ title: d.title || conv.title, done: done.size, total: steps.length, left: left.slice(0, 4) });
    });
  }
  return out;
}
async function gatherWrap({ sections = {}, settings = {}, deps = {} } = {}) {
  const blocks = [], notes = [];
  const now = deps.now ? deps.now() : Date.now();
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0); const today = d0.getTime();
  const conv = deps.convos;
  const todays = conv ? conv.load().list.filter(c => (c.updated || 0) >= today && c.messages.some(m => (m.ts || 0) >= today && m.role === 'user')) : [];
  if (sections.today !== false && conv) {
    const lines = todays.filter(c => !['brief', 'wrap'].includes(c.kind)).slice(0, 10).map(c => {
      const n = c.messages.filter(m => (m.ts || 0) >= today && m.role === 'user' && !m.hidden).length;
      return `- ${c.kind === 'mission' ? 'Mission: ' : c.kind === 'routine' ? 'Routine: ' : ''}${c.title} (${n} message${n === 1 ? '' : 's'})`;
    });
    blocks.push({ key: 'today', title: 'Chats today', text: lines.length ? lines.join('\n') : 'No chats today.' });
  }
  if (sections.checklists !== false && conv) {
    const open = todays.flatMap(c => unfinishedChecklists(c, today));
    if (open.length) blocks.push({ key: 'checklists', title: 'Unfinished checklists', text: open.map(o => `- ${o.title}: ${o.done}/${o.total} done. Left: ${o.left.join('; ')}`).join('\n') });
  }
  const ek = deps.helper && deps.helperCaps?.eventkit;
  const fmtT = ts => new Date(ts * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (sections.reminders !== false && ek && settings.apple?.reminders) {
    try {
      const ev = await withTimeout(deps.helper.request({ cmd: 'rem_list', id: 'wrap-rem-' + now }, ['result'], 8000), 9000, 'Reminders');
      const end = (today + 2 * 86400e3) / 1000;
      const due = (ev.data || []).filter(r => r.due && r.due < end);
      blocks.push({ key: 'reminders', title: 'Reminders still open (due by tomorrow)', text: due.length ? due.map(r => `- ${r.title} — ${r.due < now / 1000 ? 'overdue' : 'due ' + new Date(r.due * 1000).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`).join('\n') : 'Nothing due.' });
    } catch (e) { notes.push('Reminders: ' + e.message); }
  }
  if (sections.tomorrow !== false && ek && settings.apple?.calendar) {
    try {
      const s = (today + 86400e3) / 1000;
      const ev = await withTimeout(deps.helper.request({ cmd: 'cal_list', id: 'wrap-cal-' + now, start: s, end: s + 86400 }, ['result'], 8000), 9000, 'Calendar');
      const list = ev.data || [];
      blocks.push({ key: 'tomorrow', title: "Tomorrow's calendar", text: list.length ? list.map(e => `- ${e.allDay ? 'All day' : fmtT(e.start)}: ${e.title}`).join('\n') : 'Nothing on the calendar.' });
    } catch (e) { notes.push('Calendar: ' + e.message); }
  } else if (sections.tomorrow !== false && !settings.apple?.calendar) notes.push("Tomorrow's calendar: turn on Apple Calendar in Settings → Connectors to include it.");
  if (sections.study !== false && deps.study) {
    const line = deps.study.summaryLine(); const st = deps.study.stats();
    if (line || st.reviewedToday) blocks.push({ key: 'study', title: 'Study', text: [st.reviewedToday ? `Reviewed ${st.reviewedToday} card${st.reviewedToday === 1 ? '' : 's'} today (${st.correctToday} right)` : 'No reviews today', line, st.streak > 1 ? `${st.streak}-day study streak` : ''].filter(Boolean).join('. ') });
  }
  if (sections.stats !== false && deps.metrics) {
    const m = deps.metrics.summary();
    blocks.push({ key: 'stats', title: 'Nexus stats', text: `${m.points} points · ${m.streak ? m.streak + '-day streak' : 'no streak yet'} · ${m.achievements.filter(a => a.unlocked && a.unlocked >= today).map(a => a.name).join(', ') || 'no new achievements today'}` });
  }
  return { blocks, notes };
}
function wrapPrompt({ blocks, notes, nickname, now = new Date() }) {
  const day = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const facts = blocks.map(b => `## ${b.title}\n${b.text}`).join('\n\n') || '(Nothing could be gathered.)';
  return `Write my Evening Wrap-up for ${day}${nickname ? ` (call me ${nickname})` : ''}. Cover, using only the facts below: what I got done today (one or two lines), what's still open, ` +
    `and the single best thing to start with tomorrow morning. Under 160 words, scannable, short bold labels. If there are flashcards due, suggest a quick review. ` +
    `End with one warm line to close the day. Don't invent anything.\n\nFACTS GATHERED BY NEXUS:\n\n${facts}${notes.length ? `\n\n(Couldn't include: ${notes.join(' · ')})` : ''}`;
}

module.exports = { gather, briefPrompt, findGmailTool, gatherWrap, wrapPrompt, unfinishedChecklists };

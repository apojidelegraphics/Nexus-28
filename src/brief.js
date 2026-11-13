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
  await Promise.all(jobs);
  const order = ['weather', 'calendar', 'reminders', 'gmail', 'headlines', 'announcements', 'usage'];
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

module.exports = { gather, briefPrompt, findGmailTool };

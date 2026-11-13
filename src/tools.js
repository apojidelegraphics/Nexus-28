// Tool registry for the agent loop: built-in tools (web, Apple Calendar/Reminders) + MCP connectors.
// Each tool: { name, description, parameters } for the model, plus an executor that returns
// { content: string-for-model, activity: { label, detail, summary, sources, images } }.
const web = require('./web');
const weather = require('./weather');

const fmtTime = ts => new Date(ts * 1000).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
function parseWhen(s, fallback) {
  if (s === undefined || s === null || s === '') return fallback;
  if (typeof s === 'number') return s > 1e12 ? s / 1000 : s;
  const str = String(s).trim();
  const d = /^\d{4}-\d{2}-\d{2}$/.test(str) ? new Date(str + 'T00:00:00') : new Date(str);
  if (isNaN(d)) throw new Error(`Couldn't understand the date "${s}". Use ISO format like 2026-11-14T15:00.`);
  return d.getTime() / 1000;
}
const clip = (s, n = 12000) => (s.length > n ? s.slice(0, n) + '\n…[truncated]' : s);

const DEFS = {
  web_search: {
    description: 'Search the web for current information, news, facts, prices, or anything you are unsure about. Returns titles, URLs, snippets, and sometimes image URLs.',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'Search query' }, max_results: { type: 'integer', description: '1-10, default 5' } }, required: ['query'] },
    web: true
  },
  fetch_url: {
    description: 'Open a web page and read its main text. Use after web_search to read a source before quoting it.',
    parameters: { type: 'object', properties: { url: { type: 'string', description: 'Full http(s) URL' } }, required: ['url'] },
    web: true
  },
  weather: {
    description: "Get current weather and a daily forecast (up to 7 days) for a place. Leave location empty to use the user's default location.",
    parameters: { type: 'object', properties: { location: { type: 'string', description: 'City, e.g. "Boston, MA". Optional.' }, days: { type: 'integer', description: '1-7, default 3' } } },
    weather: true
  },
  look_at_screen: {
    description: "Look at the user's screen: captures the front window (the app they're using, not Nexus) and returns the app name, window title and all the text in it. Use when the user refers to something on their screen (\"this\", \"this page\", \"this error\") and nothing was attached.",
    parameters: { type: 'object', properties: { whole_screen: { type: 'boolean', description: 'Capture the whole display instead of just the front window' } } },
    screen: true, confirm: true
  },
  calendar_events: {
    description: "List events from the user's Apple Calendar between two times (default: now through 7 days).",
    parameters: { type: 'object', properties: { start: { type: 'string', description: 'ISO date/time, local time' }, end: { type: 'string', description: 'ISO date/time, local time' } } },
    apple: 'calendar'
  },
  calendar_create_event: {
    description: "Create an event in the user's default Apple Calendar.",
    parameters: { type: 'object', properties: {
      title: { type: 'string' }, start: { type: 'string', description: 'ISO date/time, local time' }, end: { type: 'string', description: 'ISO date/time, local time; default start + 1h' },
      location: { type: 'string' }, notes: { type: 'string' }, all_day: { type: 'boolean' } }, required: ['title', 'start'] },
    apple: 'calendar', write: true
  },
  reminders_list: {
    description: "List the user's incomplete Apple Reminders.",
    parameters: { type: 'object', properties: {} },
    apple: 'reminders'
  },
  reminders_create: {
    description: 'Create an Apple Reminder, optionally with a due date/time.',
    parameters: { type: 'object', properties: { title: { type: 'string' }, due: { type: 'string', description: 'ISO date/time, local time' }, notes: { type: 'string' } }, required: ['title'] },
    apple: 'reminders', write: true
  }
};

// Which built-in tools are available for this persona/turn.
function builtinNames({ agentic, settings, helperBuilt }) {
  const names = [];
  const webOn = settings.web?.enabled !== false;
  if (webOn && (agentic || settings.web?.chatAgents)) names.push('web_search', 'fetch_url');
  if (settings.weather?.enabled !== false && (agentic || settings.web?.chatAgents)) names.push('weather');
  if (agentic && settings.screen?.enabled !== false) names.push('look_at_screen');
  if (agentic && helperBuilt) {
    if (settings.apple?.calendar) names.push('calendar_events', 'calendar_create_event');
    if (settings.apple?.reminders) names.push('reminders_list', 'reminders_create');
  }
  return names;
}

function buildToolset({ agentic, settings, helperBuilt, mcp }) {
  const names = builtinNames({ agentic, settings, helperBuilt });
  const tools = names.map(n => ({ name: n, description: DEFS[n].description, parameters: DEFS[n].parameters }));
  const routes = {};
  if (agentic && mcp) {
    const m = mcp.agentTools();
    tools.push(...m.tools);
    Object.assign(routes, m.routes);
  }
  const labels = tools.map(t => t.name);
  return { tools, routes, labels };
}

// Human-facing description of a call (status line + approval card).
function describe(name, args, route) {
  args = args || {};
  switch (name) {
    case 'web_search': return { label: 'Searching the web', detail: args.query || '' };
    case 'fetch_url': { let h = args.url; try { h = new URL(args.url).hostname.replace(/^www\./, ''); } catch {} return { label: 'Reading page', detail: h }; }
    case 'weather': return { label: 'Checking weather', detail: args.location || '' };
    case 'look_at_screen': return { label: 'Look at your screen', detail: args.whole_screen ? 'Whole screen' : 'Front window' };
    case 'calendar_events': return { label: 'Checking calendar', detail: '' };
    case 'calendar_create_event': {
      let when = args.start;
      try { const s = parseWhen(args.start); when = fmtTime(s); } catch {}
      return { label: 'Add calendar event', detail: `${args.title || 'Event'} — ${when}${args.location ? ' · ' + args.location : ''}` };
    }
    case 'reminders_list': return { label: 'Checking reminders', detail: '' };
    case 'reminders_create': {
      let due = '';
      try { if (args.due) due = ' — due ' + fmtTime(parseWhen(args.due)); } catch {}
      return { label: 'Add reminder', detail: `${args.title || 'Reminder'}${due}` };
    }
    default: {
      const r = route || {};
      const short = JSON.stringify(args);
      return { label: `${r.connector || 'Connector'}: ${(r.tool || name).replace(/_/g, ' ')}`, detail: short.length > 160 ? short.slice(0, 157) + '…' : short };
    }
  }
}
function needsConfirm(name, route) {
  if (DEFS[name]) return !!(DEFS[name].write || DEFS[name].confirm);
  return !!route?.confirm;
}

async function execute(name, args, { settings, getKey, helper, mcp, routes, signal, screen }) {
  args = args || {};
  if (name === 'look_at_screen') {
    if (!screen) throw new Error('Screen awareness is unavailable.');
    const a = await screen.capture({ mode: args.whole_screen ? 'screen' : 'window' });
    return {
      content: `App: ${a.app || 'unknown'}\nWindow: ${a.title || '(untitled)'}\n\nText on screen:\n${clip(a.text || '(no readable text)', 12000)}`,
      activity: { summary: a.app ? `${a.app}${a.title ? ' — ' + a.title.slice(0, 40) : ''}` : 'Screen', attachments: [{ id: a.id, name: a.name, kind: a.kind, mime: a.mime, thumb: a.thumb }] }
    };
  }
  if (name === 'web_search') {
    const provider = settings.web?.provider || 'duckduckgo';
    const r = await web.search({ provider, query: args.query, max: args.max_results || 5, key: getKey(provider), signal });
    const lines = r.results.map((x, i) => `${i + 1}. ${x.title}\n   ${x.url}\n   ${x.snippet}`);
    if (r.images.length) lines.push(`\nImage URLs:\n${r.images.slice(0, 6).join('\n')}`);
    return {
      content: lines.join('\n') || 'No results.',
      activity: { summary: `${r.results.length} result${r.results.length === 1 ? '' : 's'}`, sources: r.results.map(x => ({ title: x.title, url: x.url })), images: r.images.slice(0, 6) }
    };
  }
  if (name === 'fetch_url') {
    const p = await web.fetchPage(args.url, { signal });
    return {
      content: `Title: ${p.title}\nURL: ${p.url}\n${p.image ? `Image: ${p.image}\n` : ''}\n${p.text}`,
      activity: { summary: p.title || 'Read page', sources: [{ title: p.title || p.url, url: p.url }], images: p.image ? [p.image] : [] }
    };
  }
  if (name === 'weather') {
    const r = await weather.forecast({ location: args.location || settings.weather?.location, days: args.days || 3, units: settings.weather?.units, signal });
    return { content: r.content, activity: { summary: `${r.card.now.temp}${r.card.unit} ${r.card.now.text.toLowerCase()} · ${r.card.place}`, cards: [r.card] } };
  }
  if (DEFS[name]?.apple) {
    if (!helper?.available()) throw new Error('Apple Calendar/Reminders need the NexusCore helper (npm run build:helper).');
    const id = 'ek-' + Math.random().toString(36).slice(2);
    const req = obj => helper.request({ id, ...obj }, ['result'], 30000).then(ev => ev.data);
    if (name === 'calendar_events') {
      const start = parseWhen(args.start, Date.now() / 1000);
      const end = parseWhen(args.end, start + 7 * 86400);
      const events = await req({ cmd: 'cal_list', start, end });
      const lines = events.map(e => `• ${e.title} — ${e.allDay ? new Date(e.start * 1000).toDateString() + ' (all day)' : fmtTime(e.start) + ' to ' + fmtTime(e.end)}${e.location ? ' @ ' + e.location : ''} [${e.calendar}]`);
      return { content: lines.join('\n') || 'No events in that range.', activity: { summary: `${events.length} event${events.length === 1 ? '' : 's'}` } };
    }
    if (name === 'calendar_create_event') {
      const start = parseWhen(args.start);
      const end = parseWhen(args.end, start + 3600);
      const r = await req({ cmd: 'cal_create', title: args.title, start, end, location: args.location || '', notes: args.notes || '', allDay: !!args.all_day });
      return { content: `Created "${r.title}" on ${fmtTime(r.start)} in ${r.calendar}.`, activity: { summary: 'Event created' } };
    }
    if (name === 'reminders_list') {
      const items = await req({ cmd: 'rem_list' });
      const lines = items.map(r => `• ${r.title}${r.due ? ' — due ' + fmtTime(r.due) : ''} [${r.list}]`);
      return { content: lines.join('\n') || 'No open reminders.', activity: { summary: `${items.length} reminder${items.length === 1 ? '' : 's'}` } };
    }
    if (name === 'reminders_create') {
      const due = args.due ? parseWhen(args.due) : undefined;
      const r = await req({ cmd: 'rem_create', title: args.title, notes: args.notes || '', ...(due ? { due } : {}) });
      return { content: `Created reminder "${r.title}"${r.due ? ' due ' + fmtTime(r.due) : ''} in ${r.list}.`, activity: { summary: 'Reminder created' } };
    }
  }
  const route = routes?.[name];
  if (route && mcp) {
    const r = await mcp.call(route, args, signal);
    if (r.isError) throw new Error(clip(r.text, 600));
    return { content: clip(r.text), activity: { summary: 'Done', images: r.images } };
  }
  throw new Error(`Unknown tool "${name}".`);
}

module.exports = { buildToolset, execute, describe, needsConfirm, parseWhen, DEFS };

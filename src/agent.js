// Agent loop: model ⇄ tools until the model answers, with approval for actions.
//   runAgent({ chat, request, tools, routes, exec, describe, needsConfirm, confirm, onText, onEvent, signal, maxSteps })
//   chat(request + { messages, tools, onText }) -> { text, toolCalls }
//   onEvent: { type: 'status', status, label?, detail? } | { type: 'activity', activity }
// Returns { text, activity, images, sources, toolsDropped }
//
// Guard rails (weak/free models love to loop):
//   • invented tool names are mapped to the closest real read-only tool ("calendar" → calendar_events)
//     or rejected with the list of real tool names
//   • an identical call that already failed is not run again
//   • after two steps where every call failed, the model is told to stop and answer; if it still
//     calls tools, Nexus stops and explains what went wrong itself

function resolveToolName(name, toolNames, needsConfirm, routes) {
  if (toolNames.includes(name)) return name;
  const base = String(name || '').toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const stems = [base, base.replace(/s$/, ''), base + 's'];
  const candidates = toolNames.filter(t => stems.some(s => t === s || t.startsWith(s + '_') || t.endsWith('__' + s)));
  const reads = candidates.filter(t => !needsConfirm(t, routes[t]));
  if (reads.length === 1) return reads[0];
  if (candidates.length === 1) return candidates[0];
  return null;
}

function fallbackText(activity) {
  const failed = activity.filter(a => a.status === 'error' || a.status === 'denied');
  if (!failed.length) return "I couldn't finish that — the model kept calling tools without answering. Try again, or switch Paragon to a stronger model in Settings → Agents.";
  const seen = new Set(), lines = [];
  for (const a of failed) {
    const msg = a.status === 'denied' ? 'you declined it' : a.summary || 'failed';
    const key = a.label + msg;
    if (seen.has(key)) continue;
    seen.add(key); lines.push(`- **${a.label}**: ${msg}`);
  }
  let hint = '';
  if (failed.some(a => /unknown command (cal|rem)_/i.test(a.summary || ''))) hint = '\n\nThe NexusCore helper on this Mac is out of date. Run `npm run build:helper` in the nexus-desktop folder, then restart Nexus.';
  else if (failed.some(a => /No tool named/i.test(a.summary || ''))) hint = '\n\nThis model is struggling with tools. A stronger model for Paragon (Settings → Agents) usually fixes this.';
  return `I couldn't complete that:\n${lines.slice(0, 6).join('\n')}${hint}`;
}

async function runAgent({ chat, request, messages, tools = [], routes = {}, exec, describe, needsConfirm, confirm, onText = () => {}, onEvent = () => {}, signal, maxSteps = 8 }) {
  const convo = [...messages];
  const activity = [];
  const images = [];
  const sources = [];
  const cards = [];
  const failedCalls = new Map(); // "name|args" -> error message
  let text = '';
  let activeTools = tools;
  let toolsDropped = false;
  let wroteThisStep = false;
  let badSteps = 0;
  let toldToStop = false;
  let finished = false;

  const emitText = t => {
    if (!wroteThisStep) {
      wroteThisStep = true;
      onEvent({ type: 'status', status: 'writing' });
      if (text && !/\n\s*$/.test(text)) { text += '\n\n'; onText('\n\n'); }
    }
    text += t; onText(t);
  };
  const note = (label, detail, status = 'skipped') => {
    const a = { id: `n${activity.length}`, tool: 'system', label, detail, status };
    activity.push(a); onEvent({ type: 'activity', activity: a });
  };

  for (let step = 0; step < maxSteps; step++) {
    if (signal?.aborted) break;
    wroteThisStep = false;
    onEvent({ type: 'status', status: step === 0 ? 'connecting' : 'thinking' });
    let r;
    try {
      r = await chat({ ...request, messages: convo, tools: activeTools, signal, onText: emitText });
    } catch (e) {
      if (e.toolsUnsupported && activeTools.length) {
        activeTools = []; toolsDropped = true;
        note("This model can't use tools", 'Answering without connectors');
        step--; continue;
      }
      throw e;
    }
    if (!r.toolCalls?.length) { finished = true; break; }
    if (toldToStop) break; // it was told to stop calling tools and didn't

    convo.push({ role: 'assistant', content: r.text || '', toolCalls: r.toolCalls });
    const toolNames = activeTools.map(t => t.name);
    let okThisStep = 0;
    const results = [];

    for (const call of r.toolCalls) {
      const realName = resolveToolName(call.name, toolNames, needsConfirm, routes);
      const route = realName ? routes[realName] : undefined;
      const d = realName ? describe(realName, call.args, route) : { label: `Unknown tool "${call.name}"`, detail: '' };
      const act = { id: call.id, tool: realName || call.name, label: d.label, detail: d.detail, status: 'running', started: Date.now() };
      activity.push(act);
      const finish = (status, content, extra = {}) => {
        Object.assign(act, { status, ms: Date.now() - act.started }, extra);
        onEvent({ type: 'activity', activity: { ...act } });
        results.push({ role: 'tool', toolCallId: call.id, name: call.name, content, ...(status === 'ok' ? {} : { isError: true }) });
      };

      if (!realName) {
        const msg = `No tool named "${call.name}". Available tools: ${toolNames.join(', ') || 'none'}.`;
        finish('error', `Error: ${msg}`, { summary: msg });
        continue;
      }
      const key = realName + '|' + JSON.stringify(call.args || {});
      if (failedCalls.has(key)) {
        const msg = failedCalls.get(key);
        finish('error', `Error: this exact call already failed (${msg}). Do not retry it.`, { summary: msg });
        continue;
      }

      let approved = true;
      if (needsConfirm(realName, route)) {
        act.status = 'awaiting';
        onEvent({ type: 'activity', activity: { ...act } });
        onEvent({ type: 'status', status: 'awaiting', label: d.label, detail: d.detail });
        approved = await confirm({ callId: call.id, tool: realName, label: d.label, detail: d.detail, args: call.args });
      }
      if (signal?.aborted) approved = false;
      if (!approved) { finish('denied', 'The user declined this action. Do not retry it; acknowledge and continue.'); continue; }

      act.status = 'running';
      onEvent({ type: 'activity', activity: { ...act } });
      onEvent({ type: 'status', status: 'tool', tool: realName, label: d.label, detail: d.detail });
      try {
        const res = await exec(realName, call.args, { routes, signal });
        const extra = { summary: res.activity?.summary || '', sources: res.activity?.sources || [], images: res.activity?.images || [] };
        for (const s of extra.sources) if (!sources.some(x => x.url === s.url)) sources.push(s);
        for (const i of extra.images) if (!images.includes(i)) images.push(i);
        for (const c of res.activity?.cards || []) cards.push(c);
        okThisStep++;
        finish('ok', res.content, extra);
      } catch (e) {
        failedCalls.set(key, e.message);
        finish('error', `Error: ${e.message}`, { summary: e.message });
      }
    }

    badSteps = okThisStep ? 0 : badSteps + 1;
    if (badSteps >= 2 && results.length) {
      // Fold the stop instruction into the last tool result (works the same on every provider).
      results[results.length - 1].content += '\n\nSTOP CALLING TOOLS. They are failing. Reply to the user now: say plainly what you could not do and why, using the errors above.';
      toldToStop = true;
    }
    convo.push(...results);
  }

  if (!finished && !signal?.aborted) {
    const fb = fallbackText(activity);
    if (text && !/\n\s*$/.test(text)) { text += '\n\n'; onText('\n\n'); }
    text += fb; onText(fb);
  }
  return { text, activity, images: images.slice(0, 8), sources: sources.slice(0, 10), cards: cards.slice(0, 3), toolsDropped };
}

module.exports = { runAgent, resolveToolName, fallbackText };

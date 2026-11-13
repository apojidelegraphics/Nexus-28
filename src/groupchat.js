// Agents together (v1.5): Huddle (several agents answer at once, then one sums up) and Debate (two agents argue,
// a third judges). Replies are saved into the chat as normal assistant messages tagged with { huddle } / { debate }.
//
// deps: { ask({ personaId, history, systemExtra, signal, noTools }) → { ok, text, model, error },
//         convos, nameOf(id), onProgress(ev), onAppend(conv) }

const MAX_HUDDLE = 4, MAX_ROUNDS = 3;
const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const clip = (s, n) => (String(s).length > n ? String(s).slice(0, n) + '…' : String(s));

function createGroup({ ask, convos, nameOf = id => id, onProgress = () => {}, onAppend = () => {} }) {
  const running = new Map(); // id → AbortController

  async function huddle({ convId, agents = [], synth = '', signal } = {}) {
    agents = [...new Set(agents)].slice(0, MAX_HUDDLE);
    if (agents.length < 2) throw new Error('A huddle needs at least two agents.');
    const conv = convos.get(convId);
    if (!conv) throw new Error('Chat not found.');
    const id = newId('h');
    const ctrl = new AbortController(); running.set(id, ctrl);
    const sig = signal || ctrl.signal;
    const history = conv.messages.filter(m => !m.hidden);
    const roster = agents.map(nameOf);
    onProgress({ id, kind: 'huddle', status: 'start', agents });
    const takes = await Promise.all(agents.map(async a => {
      onProgress({ id, kind: 'huddle', agent: a, status: 'thinking' });
      const others = roster.filter(n => n !== nameOf(a)).join(', ');
      const r = await ask({ personaId: a, history, signal: sig, systemExtra: `\n\n[HUDDLE] You're answering at the same time as ${others}. Give YOUR own take on the user's latest message in under 180 words: be distinct, lead with your answer, and don't mention the huddle.` })
        .catch(e => ({ ok: false, error: e.message }));
      onProgress({ id, kind: 'huddle', agent: a, status: r.ok ? 'done' : 'error' });
      return { agent: a, ...r };
    }));
    let c = conv;
    for (const t of takes) {
      if (sig.aborted && !t.ok) continue;
      c = convos.appendTo(convId, t.ok ? { role: 'assistant', persona: t.agent, content: t.text || '(no reply)', model: t.model, huddle: { id, role: 'take' } }
        : { role: 'assistant', persona: t.agent, content: t.error || 'No reply.', error: true, huddle: { id, role: 'take' } });
    }
    onAppend(c);
    const good = takes.filter(t => t.ok && t.text);
    if (synth && good.length >= 2 && !sig.aborted) {
      onProgress({ id, kind: 'huddle', agent: synth, status: 'summarizing' });
      const block = good.map(t => `## ${nameOf(t.agent)}\n${clip(t.text, 2500)}`).join('\n\n');
      const r = await ask({ personaId: synth, history: [...history, { role: 'user', content: `Here are the huddle answers to my last message:\n\n${block}\n\nCombine them for me.` }], noTools: true, signal: sig,
        systemExtra: '\n\n[HUDDLE SUMMARY] Combine the agents\' answers: open with the best overall answer, then "Where they agree" and "Where they differ" (name the agents), in under 200 words.' }).catch(e => ({ ok: false, error: e.message }));
      if (r.ok && r.text) { c = convos.appendTo(convId, { role: 'assistant', persona: synth, content: r.text, model: r.model, huddle: { id, role: 'summary', of: good.map(t => t.agent) } }); onAppend(c); }
    }
    running.delete(id);
    onProgress({ id, kind: 'huddle', status: 'done' });
    return { id, conv: c, ok: good.length > 0 };
  }

  async function debate({ convId, topic, pro, con, judge = '', rounds = 2, signal } = {}) {
    topic = String(topic || '').trim().replace(/^["“]|["”]$/g, '');
    if (topic.length < 4) throw new Error('What should they debate?');
    if (!pro || !con || pro === con) throw new Error('Pick two different agents to debate.');
    rounds = Math.max(1, Math.min(MAX_ROUNDS, Math.round(+rounds || 2)));
    const id = newId('d');
    const ctrl = new AbortController(); running.set(id, ctrl);
    const sig = signal || ctrl.signal;
    let c = convos.appendTo(convId || 'new', { role: 'user', content: `⚖ Debate: ${topic}`, debate: { id, role: 'topic', pro, con, judge, rounds } });
    convId = c.id; onAppend(c);
    const transcript = [];
    onProgress({ id, kind: 'debate', status: 'start', convId });
    outer: for (let r = 1; r <= rounds; r++) {
      for (const [side, me, them] of [['pro', pro, con], ['con', con, pro]]) {
        if (sig.aborted) break outer;
        onProgress({ id, kind: 'debate', agent: me, side, round: r, status: 'thinking' });
        const so_far = transcript.length ? transcript.map(t => `${t.side === 'pro' ? 'FOR' : 'AGAINST'} (${nameOf(t.agent)}), round ${t.round}: ${clip(t.text, 1200)}`).join('\n\n') : '(nothing yet — you open)';
        const how = r === 1 ? (side === 'pro' ? 'Give your opening argument.' : 'Give your opening argument and answer the strongest point made so far.')
          : r === rounds ? 'This is your closing: rebut their best point and sum up why your side wins.' : 'Rebut their latest points, then add one new argument.';
        const res = await ask({ personaId: me, noTools: true, signal: sig,
          history: [{ role: 'user', content: `Debate topic: "${topic}"\n\nDebate so far:\n${so_far}` }],
          systemExtra: `\n\n[DEBATE] You are arguing ${side === 'pro' ? 'FOR' : 'AGAINST'} the topic, against ${nameOf(them)}. Round ${r} of ${rounds}. ${how} Under 140 words. Sharp, specific, respectful; no "As an AI".` })
          .catch(e => ({ ok: false, error: e.message }));
        if (sig.aborted) break outer;
        if (!res.ok) { c = convos.appendTo(convId, { role: 'assistant', persona: me, content: res.error || 'No reply.', error: true, debate: { id, side, round: r } }); onAppend(c); break outer; }
        transcript.push({ side, agent: me, round: r, text: res.text });
        c = convos.appendTo(convId, { role: 'assistant', persona: me, content: res.text || '(no reply)', model: res.model, debate: { id, side, round: r } });
        onAppend(c);
      }
    }
    if (judge && transcript.length >= 2 && !sig.aborted) {
      onProgress({ id, kind: 'debate', agent: judge, side: 'judge', status: 'thinking' });
      const res = await ask({ personaId: judge, noTools: true, signal: sig,
        history: [{ role: 'user', content: `Debate topic: "${topic}"\n\n` + transcript.map(t => `${t.side === 'pro' ? 'FOR' : 'AGAINST'} (${nameOf(t.agent)}), round ${t.round}:\n${t.text}`).join('\n\n') }],
        systemExtra: `\n\n[DEBATE JUDGE] You are the judge. Give: the strongest point from each side (one line each), what each side missed, and a verdict on which side argued better and why. End with a line "Verdict: FOR" or "Verdict: AGAINST". Under 180 words. Judge the arguments, not your own opinion.` })
        .catch(e => ({ ok: false, error: e.message }));
      if (res.ok && res.text) {
        const v = /verdict:\s*(for|against)/i.exec(res.text);
        c = convos.appendTo(convId, { role: 'assistant', persona: judge, content: res.text, model: res.model, debate: { id, side: 'judge', winner: v ? (v[1].toLowerCase() === 'for' ? 'pro' : 'con') : '' } });
        onAppend(c);
      }
    }
    running.delete(id);
    onProgress({ id, kind: 'debate', status: 'done', convId });
    return { id, conv: c, convId };
  }

  const stop = id => { const r = running.get(id); if (r) { r.abort(); return true; } return false; };
  const stopAll = () => { for (const r of running.values()) r.abort(); };
  return { huddle, debate, stop, stopAll, running: () => [...running.keys()] };
}

module.exports = { createGroup, MAX_HUDDLE, MAX_ROUNDS };

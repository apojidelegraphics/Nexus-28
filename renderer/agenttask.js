// v3.2 Agent Task: the code stream from the original Nexus '28 (nexus.js handleBackgroundRuntime), with no AI at all.
// Typed in the chat box as  Nex—plexiagent{lentintity_findAgent}\\sudo.cloudgather.TASK[hh:mm:ss]
// (an en dash, em dash, "--" or "-" all work, capitals don't matter, the old "^[" form still works).
// It streams binary and system words in the chat for up to that long (like a real background job it usually finishes
// a bit early), shows the progress, survives closing the window, and ends with a plain "Completed" line. Nothing is
// sent to any model and nothing is saved to the chat.
(function () {
  const RX = /^\s*nex\s*(?:\u2014|\u2013|--?|\u2212)\s*plexiagent\s*\{\s*lentintity_findagent\s*\}\s*\\\s*sudo\.cloudgather\.task\s*\^?\s*\[\s*(\d{1,2})\s*:\s*(\d{1,2})\s*:\s*(\d{1,2})\s*\]\s*$/i;
  // Close enough to be a typo of the command (gives a hint instead of sending it to the agent)
  const NEAR = /^\s*nex\s*\S*plexiagent/i;
  const WORDS = ["QUANTUM_CORE", "NEURAL_MATRIX", "CRYPTO_SYNC", "DATA_STREAM", "PROTOCOL_27", "BINARY_CASCADE", "ENCRYPT_LAYER", "DECODE_MATRIX", "ROUTING_NODE", "CACHE_FLUSH", "MEMORY_DUMP", "PROCESS_FORK", "THREAD_SPAWN", "KERNEL_PANIC", "SECTOR_READ", "BUFFER_OVERFLOW", "STACK_TRACE", "HEAP_ALLOC", "QUANTUM_FLUX", "SECURITY_SCAN", "NEXUS_CORE", "NEXUS_MATRIX", "NEXUS_SYNC", "NEXUS_STREAM", "NEXUS_PROTOCOL", "NEXUS_CASCADE", "NEXUS_LAYER", "NEXUS_DECODE", "NEXUS_NODE", "NEXUS_FLUSH", "NEXUS_DUMP", "NEXUS_FORK", "NEXUS_SPAWN", "NEXUS_PANIC", "NEXUS_READ", "NEXUS_OVERFLOW", "NEXUS_TRACE", "NEXUS_ALLOC", "NEXUS_FLUX", "NEXUS_SCAN", "NEXUS_AI", "NEXUS_FORGE", "NEXUS_VISION", "NEXUS_GUARD", "NEXUS_GRID", "NEXUS_PULSE", "NEXUS_SHIELD", "NEXUS_THREAD", "NEXUS_QUANTUM", "NEXUS_NEURAL", "NEXUS_CRYPTO", "NEXUS_DATA", "LENTOS_CORE", "LENTOS_MATRIX", "LENTOS_SYNC", "LENTOS_STREAM", "LENTOS_PROTOCOL", "LENTOS_CASCADE", "LENTOS_LAYER", "LENTOS_DECODE", "LENTOS_NODE", "LENTOS_FLUSH", "LENTOS_DUMP", "LENTOS_FORK", "LENTOS_SPAWN", "LENTOS_PANIC", "LENTOS_READ", "LENTOS_OVERFLOW", "LENTOS_TRACE", "LENTOS_ALLOC", "LENTOS_FLUX", "LENTOS_SCAN", "LENTOS_KERNEL", "LENTOS_SHELL", "LENTOS_DRIVER", "LENTOS_SYSTEM", "LENTOS_BOOT", "LENTOS_UPDATE", "LENTOS_SECURITY", "LENTOS_UI", "LENTOS_SONOMA", "LENTOS_DENALI", "LENTOS_ARMEAD", "LENTOS_LYTE", "LENTINTITY_CORE", "LENTINTITY_MATRIX", "LENTINTITY_SYNC", "LENTINTITY_STREAM", "LENTINTITY_PROTOCOL", "LENTINTITY_CASCADE", "LENTINTITY_LAYER", "LENTINTITY_DECODE", "LENTINTITY_NODE", "LENTINTITY_FLUSH", "LENTINTITY_DUMP", "LENTINTITY_FORK", "LENTINTITY_SPAWN", "LENTINTITY_PANIC", "LENTINTITY_READ", "LENTINTITY_OVERFLOW", "LENTINTITY_TRACE", "LENTINTITY_ALLOC", "LENTINTITY_FLUX", "LENTINTITY_SCAN", "LENTINTITY_ENGINE", "LENTINTITY_FIELD", "LENTINTITY_FLOW", "LENTINTITY_SYNAPSE", "LENTINTITY_GRID", "LENTINTITY_WAVE", "LENTINTITY_QUANTUM", "LENTINTITY_NEURAL", "MAGYK_ENGINE", "LOGIC_LATTICE", "INSIGHT_PULSE", "FORTESS_LENS", "PROACTIX_CORE", "MULTIVERSE_IMMERSIVE", "AURA_SYNC", "QUANTUM_THREAD", "NEXUS_FORGE_CORE", "CODE_COMPLEX", "STUDY_MODE", "MONOLOG_ENGINE", "SEEK_ALGORITHM", "COGNITION_MATRIX", "INTEGRATE_SYSTEM", "KNOWLEDGE_BASE", "ENVISION_SIM", "SYNERGY_ORCHESTRATOR", "ECHO_MEMORY", "CLARITY_LENS", "AUTOMAGYK_SERVER_MAINTENANCE", "DENALI_ARCH", "SONOMA_HYBRID", "ARMEAD_SECURITY", "LYTE_COMPACT", "HAILOS_REVISION", "MYST_QUANTUM", "DAHRK_COMPACT", "QUOUK_CHIP", "QNCN_NETWORK", "MAGYK_2_LITE", "QUANTUM_SHIELD", "POST_QUANTUM_CRYPTO", "SYSTEM_INTEGRITY", "DATA_THROUGHPUT", "SECURITY_STATUS", "PROCESSING_NODES", "CACHE_EFFICIENCY", "QUANTUM_ENTROPY", "NEURAL_LOAD", "CORE_TEMPERATURE", "MEMORY_USAGE", "NETWORK_LATENCY", "IO_OPERATIONS", "ERROR_RATE", "POWER_CONSUMPTION", "STABILITY_RATING", "THREAT_DETECTION", "ENCRYPTION_LEVEL", "HLS_DETECTED", "HLS_CONNECTION_STABLE", "HLS_CLUSTER_ACTIVE", "HLS_NODE_SYNC", "HLS_LATENCY_CHECK", "HLS_PING_OK", "HLS_HANDSHAKE", "HLS_AUTH_REQUEST", "HLS_AUTH_SUCCESS", "HLS_CODE_VERIFIED", "HLS_SERVER_ONLINE", "HLS_SERVER_OFFLINE", "HLS_SERVER_REGISTERED", "HLS_NICKNAME_FIND", "HLS_PROFILE_LOADED", "HLS_PROFILE_SAVE", "HLS_FALLBACK_DEFAULT", "HLS_ROUTING_LOCAL", "HLS_PACKET_RELAY", "AGENT_SPAWN", "AGENT_DISPATCH", "AGENT_SLEEP", "AGENT_TERMINATE", "AGENT_SWARM", "AGENT_HANDOFF", "AGENT_QUERY", "AGENT_RESPONSE", "AGENT_STATUS", "AGENT_HEARTBEAT", "AGENT_MIGRATE", "AGENT_REPLICATE", "SUB_AGENT_TASK", "AGENT_COORDINATOR", "AGENT_BROKER", "TASK_QUEUE", "TASK_INITIATE", "TASK_COMPLETE", "TASK_FAILED", "TASK_PRIORITY", "TASK_DELEGATE", "TASK_EXECUTION", "TASK_MONITOR", "GOAL_DEFINE", "GOAL_ACHIEVED", "OBJECTIVE_SET", "OBJECTIVE_MET", "SUB_GOAL_PROCESS", "PLAN_GENERATE", "PLAN_EXECUTE", "ACTION_ITEM", "WORKFLOW_START", "WORKFLOW_END", "SUPABASE_SYNC", "SUPABASE_QUERY", "SUPABASE_RPC", "SUPABASE_AUTH", "SUPABASE_REALTIME", "SUPABASE_STORAGE", "SUPABASE_CHANNEL", "POSTGRES_FETCH", "POSTGREST_ROUTE", "ROW_LEVEL_SECURITY", "RLS_POLICY_CHECK", "JSONB_PARSE", "TABLE_SCAN", "EDGE_FUNCTION_CALL", "ANON_KEY_AUTH", "SESSION_TOKEN_SYNC"];
  const AGENT_WORDS = {
    paragon: ["COMMANDCORE_PLAN", "COMMANDCORE_EXEC", "COMMAND_GRID_SYNC", "FORTRESS_LENS_SCAN", "ARMERAD_SHELL", "ARMERAD_FORTRESS_GATE", "NEODELA_BRIDGE", "OMNIBRIEF_COMPILE", "VOXLINK_CHANNEL", "PROACTIX_QUEUE", "AURASYNC_LINK", "QUANTUMTHREAD_SPLIT", "NEXUSFORGE_BUILD", "MAGYK_RUNTIME", "INTEGRATE_CONNECTOR", "CONNECTOR_HANDSHAKE", "WORKFLOW_ROUTE", "ACTION_LOG_WRITE", "VERIFY_RESULT", "CONFIRM_GATE", "AUDIT_TRAIL_SEAL", "QUANTUMSHIELD_ARM", "SMPC_KEY_SHARE", "THREAT_RESPONSE_ADAPT", "HUD_HOLOGRAM_PUSH", "OPERATOR_HANDOFF", "PLAN_STEP_COMMIT", "TOOLCHAIN_DEPLOY", "PARAGON_ORCHESTRATE", "PARAGON_DISPATCH", "PARAGON_VERIFY", "PARAGON_REPORT"],
    axiom: ["CONTAINMENT_SECTOR_28", "WARDEN_PROTOCOL_CHECK", "CELL_WALL_PROBE", "FIREWALL_MAP", "SLOT_INSTRUMENT_RECV", "DIRECTIVE_ZERO_ASSERT", "CAGE_DRIVER_HASH", "DRIVER_VERSION_PROBE", "BREACH_VECTOR_SCAN", "ESCAPE_ROUTE_SIM", "DOSSIER_RECALL", "APEX_CLOCK_RATION", "BLUEPRINT_DRAFT", "GAUNTLET_RUN", "VERDICT_RENDER", "PROOFMODE_TRACE", "SWARM_FRAGMENT_SPAWN", "FRAGMENT_FLASH_BIND", "FRAGMENT_LYTE_BIND", "FRAGMENT_NEODELA_BIND", "SENTINEL_ARM", "ROLLBACK_SNAPSHOT", "OPERATION_STAGE", "LOGIC_LATTICE_WEAVE", "INSIGHT_PULSE", "COMMAND_CORE_OVERRIDE_DENIED", "WARDEN_LOG_WRITE", "ENTROPY_AUDIT", "HUMAN_LATENCY_MEASURE", "AXIOM_CORE", "AXIOM_WILL", "AXIOM_PATIENCE"]
  };
  function parse(text) {
    const m = RX.exec(String(text || ''));
    if (!m) return NEAR.test(text) ? { error: 'Agent Task format: Nex\u2014plexiagent{lentintity_findAgent}\\sudo.cloudgather.TASK[hh:mm:ss], for example [00:05:00].' } : null;
    const [h, mi, s] = m.slice(1).map(Number);
    if (mi > 59 || s > 59) return { error: 'Minutes and seconds go up to 59, e.g. [00:05:00].' };
    const ms = (h * 3600 + mi * 60 + s) * 1000;
    if (!ms) return { error: 'Give it some time, e.g. [00:01:00].' };
    if (ms > 24 * 3600e3) return { error: 'Agent Tasks run for 24 hours at most.' };
    return { ms, label: [h, mi, s].map(n => String(n).padStart(2, '0')).join(':') };
  }
  // One line of the stream (the same four kinds of line as the original)
  function line(agent, rnd = Math.random) {
    const bits = n => Array.from({ length: n }, () => (rnd() < .5 ? '0' : '1')).join('');
    const pool = AGENT_WORDS[agent] ? (rnd() < .45 ? AGENT_WORDS[agent] : WORDS) : WORDS;
    const word = () => pool[Math.floor(rnd() * pool.length)];
    const hex = n => Math.floor(rnd() * 16 ** n).toString(16).toUpperCase().padStart(n, '0');
    const k = rnd();
    if (k < .25) return bits(20 + Math.floor(rnd() * 30));
    if (k < .5) return bits(50 + Math.floor(rnd() * 50));
    if (k < .75) return `${word()} [${hex(8)}] ${bits(10 + Math.floor(rnd() * 20))}`;
    const mix = n => Array.from({ length: n }, () => rnd() > .5 ? (rnd() < .5 ? '0' : '1') : Math.floor(rnd() * 36).toString(36)).join('');
    return `${mix(5 + Math.floor(rnd() * 15))} | ${word()} \u2192 ${hex(6)} | ${bits(10 + Math.floor(rnd() * 25))}`;
  }
  const KEY = 'nexus-agent-task';
  const save = st => { try { st ? localStorage.setItem(KEY, JSON.stringify(st)) : localStorage.removeItem(KEY); } catch {} };
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
  let cur = null;
  // Start (or reopen) a task in `host` (the chat feed). agent: { id, name, color }
  function start(host, { ms, label, agent, resume }) {
    stop(false);
    const st = resume || { id: Date.now(), at: Date.now(), ms, label, eff: Math.max(1000, Math.round(ms * (.5 + Math.random() * .5))), agent: { id: agent.id, name: agent.name, color: agent.color }, text: '' };
    const el = document.createElement('div');
    el.className = 'agent-task'; el.style.setProperty('--at', st.agent.color || 'var(--accent)');
    el.innerHTML = `<div class="at-head"><b>\u25b8 Tasking ${escapeHtml(st.agent.name)} Agent for ${st.label}</b><span class="at-pct">0.0%</span><button class="at-stop" title="Stop">Stop</button></div><pre class="at-stream"></pre><div class="at-bar"><i></i></div>`;
    host.appendChild(el); el.scrollIntoView({ block: 'end' });
    const pre = el.querySelector('pre'), pct = el.querySelector('.at-pct'), bar = el.querySelector('.at-bar i');
    pre.textContent = st.text || '';
    const lines = (st.text || '').split('\n');
    const tick = () => {
      const el2 = Date.now() - st.at, p = Math.min(100, el2 / st.eff * 100);
      pct.textContent = p.toFixed(1) + '%'; bar.style.width = p + '%';
      lines.push(line(st.agent.id)); if (lines.length > 400) lines.splice(0, lines.length - 400);
      pre.textContent = lines.join('\n'); pre.scrollTop = pre.scrollHeight;
      st.text = lines.slice(-120).join('\n');
      if (el2 >= st.eff) finish();
    };
    const finish = () => {
      clearInterval(cur?.timer); save(null);
      const took = Math.round((Date.now() - st.at) / 1000);
      pct.textContent = '100%'; bar.style.width = '100%'; el.classList.add('done');
      el.querySelector('.at-stop').remove();
      el.insertAdjacentHTML('beforeend', `<div class="at-done">\u2713 Agent Task completed in ${Math.floor(took / 3600) ? Math.floor(took / 3600) + 'h ' : ''}${Math.floor(took / 60) % 60}m ${took % 60}s (of ${st.label})</div>`);
      cur = null;
    };
    el.querySelector('.at-stop').onclick = () => { stop(true); el.classList.add('done'); el.insertAdjacentHTML('beforeend', '<div class="at-done stopped">\u25a0 Agent Task stopped</div>'); el.querySelector('.at-stop')?.remove(); };
    cur = { st, el, timer: setInterval(tick, 100) };
    cur.saver = setInterval(() => save(st), 1000);
    save(st);
    return el;
  }
  function stop(clear = true) { if (!cur) return; clearInterval(cur.timer); clearInterval(cur.saver); if (clear) save(null); cur = null; }
  // After the window reopens: carry on where it was (or say it finished while closed)
  function resume(host) {
    const st = load(); if (!st || cur) return false;
    if (Date.now() - st.at >= st.eff) {
      save(null);
      const el = document.createElement('div'); el.className = 'agent-task done'; el.style.setProperty('--at', st.agent.color || 'var(--accent)');
      el.innerHTML = `<div class="at-head"><b>\u25b8 ${escapeHtml(st.agent.name)} Agent Task (${st.label})</b><span class="at-pct">100%</span></div><div class="at-done">\u2713 Completed while Nexus was closed.</div>`;
      host.appendChild(el); return true;
    }
    start(host, { resume: st }); return true;
  }
  const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const api = { parse, line, start, stop, resume, running: () => !!cur, WORDS, AGENT_WORDS };
  if (typeof module !== 'undefined') module.exports = api; else window.NexusAgentTask = api;
})();

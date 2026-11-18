// Key spend tracker (3.7 beta): about how much your own API keys cost. Nexus doesn't see the bill, so this is an
// estimate: words in and out (≈ 4 characters a token) times each model's list price. Kept on this computer.
// Shared with Test Run (docs/try builds it in): PRICES and estimate() are plain functions.
const PRICES = [   // $ per million tokens [in, out]; first match wins
  [/claude.*opus/i, 15, 75], [/claude.*haiku/i, 1, 5], [/claude/i, 3, 15],
  [/gpt-5.*nano/i, 0.05, 0.4], [/gpt-5.*mini/i, 0.25, 2], [/gpt-5/i, 1.25, 10], [/gpt-4\.1.*mini/i, 0.4, 1.6], [/gpt-4o-mini/i, 0.15, 0.6], [/gpt-4o|gpt-4\.1/i, 2.5, 10], [/\bo[134]\b|o\d-mini/i, 1.1, 4.4],
  [/gemini.*pro/i, 1.25, 10], [/gemini.*flash-lite/i, 0.1, 0.4], [/gemini/i, 0.3, 2.5],
  [/deepseek.*(reason|r1)/i, 0.55, 2.19], [/deepseek/i, 0.27, 1.1],
  [/grok/i, 3, 15], [/mistral.*large/i, 2, 6], [/mistral|ministral/i, 0.2, 0.6], [/sonar/i, 1, 1], [/llama|qwen|gemma/i, 0.2, 0.6],
  [/:free$|openrouter\/free/i, 0, 0]
];
const LOCAL = new Set(['ollama', 'lmstudio', 'apple']);
function price(model = '') { for (const [re, a, b] of PRICES) if (re.test(model)) return [a, b]; return [1, 4]; }
// chars → $ (never negative, tiny calls count)
function estimate({ model = '', inChars = 0, outChars = 0 }) {
  const [a, b] = price(model);
  return (Math.max(0, inChars) / 4 / 1e6) * a + (Math.max(0, outChars) / 4 / 1e6) * b;
}
const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function createSpend({ file, fs = require('fs'), now = () => Date.now() } = {}) {
  let data; try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { data = { days: {} }; }
  const save = () => { try { fs.writeFileSync(file, JSON.stringify(data)); } catch {} };
  function record({ provider, model, inChars, outChars }) {
    if (!provider || LOCAL.has(provider)) return 0;
    const cost = estimate({ model, inChars, outChars });
    const d = (data.days[dayKey(now())] ||= {}), k = `${provider}|${model || ''}`, row = (d[k] ||= { calls: 0, inTok: 0, outTok: 0, cost: 0 });
    row.calls++; row.inTok += Math.round(inChars / 4); row.outTok += Math.round(outChars / 4); row.cost += cost;
    // keep ~13 months
    const keys = Object.keys(data.days).sort(); while (keys.length > 400) delete data.days[keys.shift()];
    save(); return cost;
  }
  function summary() {
    const t = now(), week = t - 7 * 864e5, monthStart = new Date(new Date(t).getFullYear(), new Date(t).getMonth(), 1).getTime();
    const out = { week: 0, month: 0, today: 0, byProvider: {}, byModel: {} };
    for (const [day, rows] of Object.entries(data.days)) {
      const ts = new Date(day + 'T12:00:00').getTime();
      for (const [k, r] of Object.entries(rows)) {
        const [p, m] = k.split('|');
        if (ts >= monthStart) { out.month += r.cost; out.byProvider[p] = (out.byProvider[p] || 0) + r.cost; out.byModel[m || p] = (out.byModel[m || p] || 0) + r.cost; }
        if (ts >= week) out.week += r.cost;
        if (day === dayKey(t)) out.today += r.cost;
      }
    }
    return out;
  }
  const reset = () => { data = { days: {} }; save(); };
  return { record, summary, reset };
}
module.exports = { createSpend, estimate, price, PRICES };

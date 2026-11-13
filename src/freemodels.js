// The free Nexus key may ONLY run free OpenRouter models: "free" in the id or name AND zero prompt/completion cost.
const ROUTER = 'openrouter/free';               // OpenRouter's free-only router
const OPENROUTER = 'https://openrouter.ai/api/v1';

const zero = v => v === undefined || v === null || v === '' || Number(v) === 0;
function isFreeEntry(m) {
  if (!m || !m.id) return false;
  if (m.id === ROUTER) return true;
  const named = /free/i.test(m.id) || /free/i.test(m.name || '');
  const p = m.pricing || {};
  const priced = p.prompt !== undefined && p.completion !== undefined; // must be listed with prices
  return named && priced && zero(p.prompt) && zero(p.completion) && zero(p.request) && zero(p.image) && zero(p.web_search) && zero(p.internal_reasoning);
}
// Without a fetched list, only ids that OpenRouter guarantees free are allowed.
const isFreeId = id => id === ROUTER || /:free$/i.test(String(id || ''));

async function fetchFreeModels({ base = OPENROUTER, signal } = {}) {
  const res = await fetch(`${base}/models`, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
  const data = (await res.json()).data || [];
  const list = data.filter(isFreeEntry).map(m => ({ id: m.id, name: String(m.name || m.id).slice(0, 80), context: m.context_length || null }));
  list.sort((a, b) => a.name.localeCompare(b.name));
  if (!list.some(m => m.id === ROUTER)) list.unshift({ id: ROUTER, name: 'Free Models Router (auto-picks a free model)', context: null });
  else list.unshift(...list.splice(list.findIndex(m => m.id === ROUTER), 1));
  return list;
}

// The model the free key will actually use: the chosen one if it's free, otherwise the free router.
function safeFreeModel(chosen, list) {
  const id = String(chosen || '').trim();
  if (!id) return ROUTER;
  if (Array.isArray(list) && list.length) return list.some(m => m.id === id) ? id : (isFreeId(id) ? id : ROUTER);
  return isFreeId(id) ? id : ROUTER;
}

module.exports = { ROUTER, isFreeEntry, isFreeId, fetchFreeModels, safeFreeModel };

// Every rpc('a3_…', { … }) call in the Edge Functions must match a real SQL function and its argument names exactly
// (Supabase finds functions by name + argument names, so a typo here would only show up live).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const R = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

function sqlFunctions() {
  const out = {};
  for (const f of ['supabase/aargon3-2.0.sql', 'supabase/aargon3-2.1.sql', 'supabase/aargon3-2.3.sql']) {
    for (const m of R(f).matchAll(/create or replace function public\.(a3_\w+)\(([^)]*)\)/g)) {
      const args = m[2].split(',').map(a => a.trim()).filter(Boolean).map(a => ({ name: a.split(/\s+/)[0], optional: /\bdefault\b/.test(a) }));
      out[m[1]] = args;   // later files replace earlier definitions
    }
  }
  return out;
}
function rpcCalls(src) {
  const calls = [];
  for (const m of src.matchAll(/rpc\('(a3_\w+)'(\s*,\s*\{)?/g)) {
    if (!m[2]) { calls.push({ name: m[1], keys: [] }); continue; }
    let i = m.index + m[0].length, depth = 1, keys = [], token = '', top = true;
    // collect top-level keys of the object literal
    const body = []; while (depth && i < src.length) { const c = src[i++]; if ('{[('.includes(c)) depth++; else if ('}])'.includes(c)) depth--; if (depth) body.push(depth === 1 ? c : '\u0000'); }
    for (const part of body.join('').split(',')) { const k = part.replace(/\u0000/g, '').trim().split(':')[0].trim(); if (/^\w+$/.test(k)) keys.push(k); }
    calls.push({ name: m[1], keys });
  }
  return calls;
}

test('every rpc() call matches a SQL function and its argument names', () => {
  const sql = sqlFunctions();
  const files = ['supabase/functions/_shared/lib.mjs', 'supabase/functions/checkout/handler.mjs', 'supabase/functions/stripe-webhook/handler.mjs', 'supabase/functions/staff/handler.mjs'];
  let n = 0;
  for (const f of files) for (const c of rpcCalls(R(f))) {
    n++;
    assert.ok(sql[c.name], `${f}: ${c.name} isn't defined in the SQL`);
    const names = sql[c.name].map(a => a.name);
    for (const k of c.keys) assert.ok(names.includes(k), `${f}: ${c.name} has no argument "${k}" (has ${names.join(', ')})`);
    for (const a of sql[c.name]) if (!a.optional) assert.ok(c.keys.includes(a.name), `${f}: ${c.name} is missing "${a.name}"`);
  }
  assert.ok(n > 40, `only found ${n} calls`);
});

test('every a3_ function the Edge Functions call is locked to the service key', () => {
  const grants = R('supabase/aargon3-2.0.sql') + R('supabase/aargon3-2.1.sql') + R('supabase/aargon3-2.3.sql');
  const used = new Set(['lib.mjs', 'checkout/handler.mjs', 'stripe-webhook/handler.mjs', 'staff/handler.mjs']
    .flatMap(f => rpcCalls(R('supabase/functions/' + (f.includes('/') ? f : '_shared/' + f))).map(c => c.name)));
  for (const name of used) assert.match(grants, new RegExp(`'${name}\\(`), `${name} isn't in a revoke/grant list`);
});

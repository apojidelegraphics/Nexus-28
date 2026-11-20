// POST /functions/v1/checkout — the public store.
//   { action: 'start', plan, tier, billing, os, connection, customer: {first, last, email, …}, promo }  → { url }   (send the browser to Stripe)
//   { action: 'status', session_id }                     → { ready, order }    (the thank-you page)
//   { action: 'promo', code, plan, tier, billing }       → { label, after }    ("Apply" on a promo code)
//   { action: 'info' }                                   → { open, message }   (is the store taking orders?)
//   { action: 'request', plan, tier, seats, interval, models, chip, os, connection, customer, notes }
//                                                        → { quote_no }        (the "Custom" tab: lands in the terminal's Custom orders)
// Needs secrets STRIPE_SECRET_KEY and SITE_URL (https://apojidelegraphics.github.io/aArgon3).
import { A3, cors, json, Oops, db, stripe, startCheckout, sessionStatus, checkPromo, storeInfo, newQuoteNo } from '../_shared/lib.mjs';

export function handler(env, fetchImpl = fetch) {
  const rpc = db(env, fetchImpl), call = stripe(env, fetchImpl);
  return async function (req) {
    const h = cors(req);
    if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
    if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405, h);
    try {
      const b = await req.json().catch(() => ({}));
      if (b.action === 'info') { const i = await storeInfo(rpc); return json({ open: i.open, message: i.message }, 200, h); }
      if (b.action === 'start') {
        const info = await storeInfo(rpc);
        if (!info.open) throw new Oops(info.message || 'The store is closed for now. Please check back soon.', 409);
        const sel = A3.selection(b);
        const customer = A3.customer(sel.plan, b.customer || { email: b.email });
        const p = A3.price(sel.plan, sel.tier, sel.billing);
        const promo = b.promo ? await checkPromo({ rpc, code: b.promo, sel, amount: p.amount }) : null;
        const r = await startCheckout({ call, siteUrl: env.SITE_URL || 'https://apojidelegraphics.github.io/aArgon3', sel, customer, promo });
        return json({ url: r.url }, 200, h);
      }
      if (b.action === 'promo') {
        const sel = A3.selection(b), p = A3.price(sel.plan, sel.tier, sel.billing);
        const x = await checkPromo({ rpc, code: b.code, sel, amount: p.amount });
        if (!x) throw new Oops('Enter a code.');
        return json({ code: x.code, label: x.label, after: x.after, before: p.amount, duration: x.duration }, 200, h);
      }
      if (b.action === 'request') {
        if (b.website) return json({ quote_no: newQuoteNo() }, 200, h);   // a bot filled the hidden field: pretend it worked
        const info = await storeInfo(rpc);
        if (!info.open) throw new Oops(info.message || 'The store is closed for now. Please check back soon.', 409);
        const sel = A3.selection({ plan: b.plan, tier: b.tier, billing: 'month', os: b.os, connection: b.connection });
        const customer = A3.customer(sel.plan, b.customer || {});
        const interval = ['month', 'year', 'once'].includes(b.interval) ? b.interval : 'month';
        const seats = b.seats ? Math.max(1, Math.min(100000, Math.round(Number(b.seats)) || 1)) : A3.price(sel.plan, sel.tier, 'month').seats;
        const all = Object.values(A3.C.families).flatMap(f => f.models);
        const models = Array.isArray(b.models) && b.models.length ? [...new Set(b.models.filter(m => all.includes(m)))].slice(0, 60) : A3.items(sel.tier).map(i => i.model);
        const chip = A3.C.chips.some(c => c.id === b.chip && c.id !== 'No order') ? b.chip : A3.C.tiers[sel.tier].chip;
        const budget = b.budget == null || b.budget === '' ? null : Math.max(0, Math.min(10000000, Number(b.budget) || 0));
        const notes = String(b.notes || '').slice(0, 1500).trim();
        const r = await rpc('a3_quote_request', { p: { quote_no: newQuoteNo(), plan: sel.plan, tier: sel.tier, seats, interval,
          config: { ...A3.config(sel), chip, seats, billing: interval }, customer, notes: notes || null,
          items: models.map(model => ({ model, price: 0, family: Object.keys(A3.C.families).find(f => A3.C.families[f].models.includes(model)) })),
          request: { budget, interval, seats, models, chip, notes, at: new Date().toISOString() } } });
        return json({ quote_no: r.quote_no }, 200, h);
      }
      if (b.action === 'status') return json(await sessionStatus({ rpc, call, sessionId: b.session_id }), 200, h);
      throw new Oops('Unknown action.');
    } catch (e) {
      const status = e instanceof Oops ? e.status : 400;
      if (status >= 500) console.error('[checkout]', e);
      return json({ error: e.message || 'Something went wrong.' }, status, h);
    }
  };
}

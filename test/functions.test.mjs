// The three Edge Functions, with Stripe, the aARgon3 database and Nexus sign-in replaced by fakes.
import test from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { handler as checkout } from '../supabase/functions/checkout/handler.mjs';
import { handler as webhook } from '../supabase/functions/stripe-webhook/handler.mjs';
import { handler as staff } from '../supabase/functions/staff/handler.mjs';
import { verifyStripeSignature } from '../supabase/functions/_shared/lib.mjs';
import { ENV, world, OWNER, MANAGER, EMPLOYEE, OUTSIDER, INVITED } from './fakes.mjs';

const req = (body, headers = {}) => new Request('https://fn.test/', { method: 'POST', headers: { 'Content-Type': 'application/json', origin: 'https://apojidelegraphics.github.io', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const call = async (h, body, headers) => { const r = await h(req(body, headers)); return { status: r.status, body: await r.json().catch(() => null), headers: r.headers }; };
const as = tok => ({ authorization: `Bearer ${tok}` });
const PAT = { first: 'Pat', last: 'Doe', email: 'pat@co.com', phone: '919-555-0100', company: 'Doe Labs LLC', title: 'Owner' };
const ENT = { ...PAT, company: 'Acme Corp', node: '28-12a3-45B6-78c9', jurisdiction: 'East Coast Grid-482' };
function signed(body, secret = 'whsec_test', t = Math.floor(Date.now() / 1000)) {
  return { 'stripe-signature': `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}` };
}
const pay = s => { s.status = 'complete'; s.payment_status = 'paid'; };

// ============================================================ the store
test('checkout: the server sets the price and asks for the company details', async () => {
  const w = world(), h = checkout(ENV, w.fetch);
  const r = await call(h, { action: 'start', plan: 'business', tier: 'pro', billing: 'year', amount: 1, os: 'LentOS 28 Horizon', customer: PAT });
  assert.strictEqual(r.status, 200); assert.match(r.body.url, /^https:\/\/checkout\.stripe\.com\//);
  const s = Object.values(w.sessions)[0], f = s.form;
  assert.strictEqual(f.get('mode'), 'subscription');
  assert.strictEqual(f.get('line_items[0][price_data][unit_amount]'), '149000');
  assert.strictEqual(f.get('line_items[0][price_data][recurring][interval]'), 'year');
  assert.match(f.get('line_items[0][price_data][product_data][name]'), /^aARgon3 Business · Pro · Order [A-Z2-9]{8}-[A-Z2-9]{4}$/);
  assert.strictEqual(f.get('customer_email'), 'pat@co.com');
  assert.deepStrictEqual([s.metadata.a3_c_company, s.metadata.a3_c_first, s.metadata.a3_c_phone, s.metadata.a3_source], ['Doe Labs LLC', 'Pat', '919-555-0100', 'web']);
  assert.strictEqual(f.get('subscription_data[metadata][a3_order]'), s.metadata.a3_order);
  assert.strictEqual(f.get('allow_promotion_codes'), null);   // codes go through our own field
  // Business needs the business name; Enterprise isn't sold here
  assert.match((await call(h, { action: 'start', plan: 'business', tier: 'pro', customer: { ...PAT, company: '' } })).body.error, /Registered business name is required/);
  assert.match((await call(h, { action: 'start', plan: 'personal', tier: 'pro', customer: { first: 'A' } })).body.error, /Last name is required/);
  assert.match((await call(h, { action: 'start', plan: 'enterprise', tier: 'pro', customer: ENT })).body.error, /quoted/);
  assert.strictEqual((await call(h, { action: 'start', plan: 'gold', tier: 'pro' })).status, 400);
  assert.match((await call(checkout({ ...ENV, STRIPE_SECRET_KEY: '' }, w.fetch), { action: 'start', plan: 'personal', tier: 'pro', customer: PAT })).body.error, /STRIPE_SECRET_KEY/);
  assert.strictEqual(Object.keys(w.sessions).length, 1);
});

test('checkout: the store can be closed', async () => {
  const w = world(), h = checkout(ENV, w.fetch);
  w.settings.store = { open: false, message: 'Back Monday!' };
  assert.deepStrictEqual((await call(h, { action: 'info' })).body, { open: false, message: 'Back Monday!' });
  const r = await call(h, { action: 'start', plan: 'personal', tier: 'pro', customer: PAT });
  assert.strictEqual(r.status, 409); assert.strictEqual(r.body.error, 'Back Monday!');
  // before aargon3-2.1.sql there are no settings: the store stays open
  const legacy = world({ legacy: true });
  assert.strictEqual((await call(checkout(ENV, legacy.fetch), { action: 'info' })).body.open, true);
});

test('checkout: promo codes are checked against plan, tier and limits, then applied in Stripe', async () => {
  const w = world(), h = checkout(ENV, w.fetch);
  w.promos.push({ id: 1, code: 'LAUNCH20', type: 'percentage', value: 20, duration: 'once', plans: ['personal'], tiers: [], min_total: 0, live: true, active: true, used: 0, stripe_promo_id: 'promo_LAUNCH20' },
                { id: 2, code: 'OLD', type: 'fixed', value: 5, live: false, stripe_promo_id: 'promo_OLD' });
  const ok = await call(h, { action: 'promo', code: 'launch20', plan: 'personal', tier: 'max' });
  assert.deepStrictEqual(ok.body, { code: 'LAUNCH20', label: '20% off the first payment', after: 47.2, before: 59, duration: 'once' });
  assert.match((await call(h, { action: 'promo', code: 'launch20', plan: 'business', tier: 'max' })).body.error, /doesn't work on the Business plan/);
  assert.match((await call(h, { action: 'promo', code: 'OLD', plan: 'personal', tier: 'max' })).body.error, /isn't a working code/);
  assert.match((await call(h, { action: 'promo', code: 'NOPE', plan: 'personal', tier: 'max' })).body.error, /isn't a working code/);
  await call(h, { action: 'start', plan: 'personal', tier: 'max', customer: PAT, promo: 'launch20' });
  const s = Object.values(w.sessions)[0];
  assert.strictEqual(s.form.get('discounts[0][promotion_code]'), 'promo_LAUNCH20'); assert.strictEqual(s.metadata.a3_promo, 'LAUNCH20');
  pay(s);
  await call(h, { action: 'status', session_id: s.id });
  const o = Object.values(w.orders)[0];
  assert.deepStrictEqual([o.promo_code, o.discount_cents, w.promos[0].used], ['LAUNCH20', 500, 1]);
});

test('thank-you page: waits, then creates the order (with company details) itself if the webhook is late', async () => {
  const w = world(), h = checkout(ENV, w.fetch);
  await call(h, { action: 'start', plan: 'business', tier: 'max', os: 'LentOS 27.2 Sonoma', customer: PAT });
  const s = Object.values(w.sessions)[0];
  assert.deepStrictEqual((await call(h, { action: 'status', session_id: s.id })).body, { ready: false, state: 'open' });
  pay(s);
  const r = await call(h, { action: 'status', session_id: s.id });
  assert.strictEqual(r.body.ready, true); assert.strictEqual(r.body.order.order_id, s.metadata.a3_order);
  const o = w.orders[s.metadata.a3_order];
  assert.deepStrictEqual([o.amount_cents, o.plan_type, o.config.chip, o.config.os, o.seats], [29900, 'Business', 'Quouk .3o', 'LentOS 27.2 Sonoma', 7]);
  assert.deepStrictEqual([o.customer_name, o.customer_email, o.company_name, o.customer_phone, o.stripe_invoice_id], ['Pat Doe', 'pat@co.com', 'Doe Labs LLC', '919-555-0100', s.invoice]);
  assert.strictEqual(o.customer_info.title, 'Owner');
  assert.strictEqual((await call(h, { action: 'status', session_id: 'not-a-session' })).status, 400);
});

// ============================================================ the webhook
test('webhook: checks Stripe\'s signature', async () => {
  const w = world(), h = webhook(ENV, w.fetch), body = JSON.stringify({ type: 'ping', data: { object: {} } });
  assert.strictEqual((await call(h, body, signed(body))).status, 200);
  assert.strictEqual((await call(h, body, signed(body, 'whsec_wrong'))).status, 400);
  assert.strictEqual((await call(h, body, signed(body, 'whsec_test', Math.floor(Date.now() / 1000) - 3600))).status, 400);
  assert.strictEqual((await call(h, body, {})).status, 400);
  assert.strictEqual((await call(h, body.replace('ping', 'pong'), signed(body))).status, 400);
  await assert.rejects(verifyStripeSignature(body, signed(body).sig, '', 0), /STRIPE_WEBHOOK_SECRET/);
});

test('webhook: a paid checkout becomes one order; its first invoice isn\'t counted twice; renewals are', async () => {
  const w = world(), hc = checkout(ENV, w.fetch), hw = webhook(ENV, w.fetch);
  await call(hc, { action: 'start', plan: 'business', tier: 'standard', customer: PAT });
  const s = Object.values(w.sessions)[0]; pay(s);
  const send = async obj => { const b = JSON.stringify(obj); return call(hw, b, signed(b)); };
  const done = { type: 'checkout.session.completed', data: { object: { ...s, form: undefined } } };
  assert.strictEqual((await send(done)).body.order, s.metadata.a3_order);
  assert.strictEqual((await send(done)).body.order, s.metadata.a3_order);
  assert.strictEqual(Object.keys(w.orders).length, 1);
  // first invoice of that subscription: recorded as "first" under the same invoice id (the database ignores the repeat)
  await send({ type: 'invoice.paid', data: { object: { id: s.invoice, subscription: s.subscription, billing_reason: 'subscription_create', amount_paid: 2900, subscription_details: { metadata: s.metadata } } } });
  assert.deepStrictEqual(w.payments.map(p => p.kind), ['first']);
  // a month later (new API shape: parent.subscription_details)
  await send({ type: 'invoice.paid', data: { object: { id: 'in_renew', billing_reason: 'subscription_cycle', amount_paid: 2900,
    parent: { subscription_details: { subscription: s.subscription, metadata: s.metadata } } } } });
  assert.deepStrictEqual(w.payments.map(p => [p.kind, p.amount]), [['first', 2900], ['renewal', 2900]]);
  // someone else's checkout or invoice on the same Stripe account is ignored
  const other = await send({ type: 'checkout.session.completed', data: { object: { id: 'cs_x', status: 'complete', payment_status: 'paid', metadata: {} } } });
  assert.match(other.body.ignored, /not an aARgon3/);
  w.subMeta = {};
  assert.match((await send({ type: 'invoice.paid', data: { object: { id: 'in_z', subscription: 'sub_zzz', amount_paid: 100 } } })).body.ignored, /not an aARgon3/);
});

test('webhook: cancelled or unpaid subscriptions stop the order; fixed ones restart it', async () => {
  const w = world(), h = webhook(ENV, w.fetch);
  const send = async (type, status) => { const b = JSON.stringify({ type, data: { object: { id: 'sub_9', status } } }); return call(h, b, signed(b)); };
  await send('customer.subscription.deleted', 'canceled');
  await send('customer.subscription.updated', 'unpaid');
  await send('customer.subscription.updated', 'active');
  await send('customer.subscription.updated', 'past_due');
  assert.deepStrictEqual(w.statuses.map(s => [s.p_subscription, s.p_status]), [['sub_9', 'CANCELLED'], ['sub_9', 'CANCELLED'], ['sub_9', 'ACTIVE']]);
});

// ============================================================ staff: who gets in
test('staff: Nexus admins, the owner and invited people get in; nobody else', async () => {
  const w = world(), h = staff(ENV, w.fetch);
  assert.strictEqual((await call(h, { action: 'me' })).status, 401);
  assert.strictEqual((await call(h, { action: 'me' }, { authorization: 'Bearer junk' })).status, 401);
  const out = await call(h, { action: 'me' }, as(OUTSIDER));
  assert.strictEqual(out.status, 403); assert.match(out.body.error, /isn't an admin or on the aARgon3 staff list/);
  const o = (await call(h, { action: 'me' }, as(OWNER))).body.user;
  assert.deepStrictEqual([o.role, o.owner, o.manager, o.email], ['owner', true, true, 'apojidelegraphics101010@gmail.com']);
  const m = (await call(h, { action: 'me' }, as(MANAGER))).body.user;
  assert.deepStrictEqual([m.role, m.owner, m.manager], ['manager', false, true]);
  const e = (await call(h, { action: 'me' }, as(EMPLOYEE))).body;
  assert.deepStrictEqual([e.user.role, e.user.manager, e.user.name, e.store.open], ['employee', false, 'Sam', true]);
  const inv = (await call(h, { action: 'me' }, as(INVITED))).body.user;   // not a Nexus admin, but the owner added casey@shop.co
  assert.deepStrictEqual([inv.role, inv.name], ['employee', 'Casey']);
  // switched off → locked out (after the 2-minute cache)
  w.staff.find(s => s.email === 'casey@shop.co').active = false;
  const h2 = staff(ENV, w.fetch);
  assert.match((await call(h2, { action: 'me' }, as(INVITED))).body.error, /turned off/);
  assert.strictEqual((await call(h, { action: 'constructor' }, as(EMPLOYEE))).status, 400);
});

test('staff: before aargon3-2.1.sql, it falls back to Nexus admins only (Apoji Admin keeps working)', async () => {
  const w = world({ legacy: true }), h = staff(ENV, w.fetch);
  assert.strictEqual((await call(h, { action: 'me' }, as(MANAGER))).body.user.manager, true);
  assert.strictEqual((await call(h, { action: 'me' }, as(OWNER))).body.user.owner, true);
  assert.strictEqual((await call(h, { action: 'me' }, as(INVITED))).status, 403);
  assert.match((await call(h, { action: 'team' }, as(OWNER))).body.error, /hasn't been run/);
});

// ============================================================ staff: selling
test('staff: clock in, then sell with full customer details and a promo', async () => {
  const w = world(), h = staff(ENV, w.fetch), A = as(EMPLOYEE);
  w.promos.push({ id: 1, code: 'TEAM10', type: 'fixed', value: 10, duration: 'forever', plans: [], tiers: ['pro', 'max'], min_total: 0, live: true, active: true, used: 0, stripe_promo_id: 'promo_TEAM10' });
  assert.match((await call(h, { action: 'sale', plan: 'personal', tier: 'pro', customer: PAT }, A)).body.error, /Clock in/);
  assert.strictEqual((await call(h, { action: 'clock_in', store: '0028' }, A)).body.store_code, '0028');
  assert.strictEqual((await call(h, { action: 'clock_in', store: '0028' }, A)).body.error, "You're already clocked in.");
  assert.match((await call(h, { action: 'sale', plan: 'business', tier: 'pro', customer: { ...PAT, company: '' } }, A)).body.error, /business name/);
  assert.deepStrictEqual((await call(h, { action: 'promo_check', code: 'team10', plan: 'personal', tier: 'pro' }, A)).body, { code: 'TEAM10', label: '$10 off every payment', after: 15, before: 25 });
  const sale = await call(h, { action: 'sale', plan: 'personal', tier: 'pro', billing: 'month', customer: PAT, promo: 'TEAM10' }, A);
  assert.strictEqual(sale.status, 200); assert.strictEqual(sale.body.amount, 25); assert.strictEqual(sale.body.after, 15);
  const s = w.sessions[sale.body.session_id];
  assert.deepStrictEqual([s.metadata.a3_source, s.metadata.a3_staff, s.metadata.a3_operator, s.metadata.a3_shift, s.metadata.a3_c_phone, s.metadata.a3_c_company], ['terminal', 'u-admin', 'Sam', '7', '919-555-0100', undefined]);   // Personal doesn't ask for a company
  assert.match(s.form.get('cancel_url'), /success\.html\?cancelled=1$/);
  pay(s);
  assert.strictEqual((await call(h, { action: 'sale_status', session_id: s.id }, A)).body.ready, true);
  assert.strictEqual(w.orders[sale.body.order_id].shift_id, '7');
  // Apoji Admin's older Sell page (email only) still works
  const old = await call(h, { action: 'sale', plan: 'personal', tier: 'plus', email: 'old@x.co' }, A);
  assert.strictEqual(old.status, 200); assert.strictEqual(w.sessions[old.body.session_id].form.get('customer_email'), 'old@x.co');
  // employees see only their own sales
  await call(h, { action: 'sales' }, A);
  assert.strictEqual(w.rpcs.filter(r => r.name === 'a3_sales').pop().a.p_user, 'u-admin');
  await call(h, { action: 'sales' }, as(MANAGER));
  assert.strictEqual(w.rpcs.filter(r => r.name === 'a3_sales').pop().a.p_user, null);
});

test('staff: the owner can sell without clocking in; everyone else clocks in first', async () => {
  const w = world(), h = staff(ENV, w.fetch);
  assert.match((await call(h, { action: 'sale', plan: 'personal', tier: 'pro', customer: PAT }, as(EMPLOYEE))).body.error, /Clock in/);
  assert.match((await call(h, { action: 'sale', plan: 'personal', tier: 'pro', customer: PAT }, as(MANAGER))).body.error, /Clock in/);
  const r = await call(h, { action: 'sale', plan: 'personal', tier: 'pro', billing: 'month', customer: PAT }, as(OWNER));
  assert.strictEqual(r.status, 200, JSON.stringify(r.body)); assert.match(r.body.url, /checkout\.stripe\.com/);
  const s = Object.values(w.sessions).pop();
  assert.strictEqual(s.metadata.a3_shift, undefined); assert.ok(s.metadata.a3_staff);   // credited to the owner, with no shift
  // and the owner can still clock in (and be scheduled) like anyone else
  assert.strictEqual((await call(h, { action: 'clock_in', store: '0028' }, as(OWNER))).status, 200);
});

test('staff: custom orders and Enterprise quotes: link, invoice or free', async () => {
  const w = world(), h = staff(ENV, w.fetch), M = as(MANAGER), hw = webhook(ENV, w.fetch);
  assert.strictEqual((await call(h, { action: 'quote_save', plan: 'enterprise', tier: 'max', amount: 12000, interval: 'year', customer: ENT }, as(EMPLOYEE))).status, 403);
  assert.match((await call(h, { action: 'quote_save', plan: 'enterprise', tier: 'max', amount: 12000, customer: { ...ENT, node: '' } }, M)).body.error, /node allocation ID is required/);
  assert.match((await call(h, { action: 'quote_save', plan: 'enterprise', tier: 'max', amount: 0.1, customer: ENT }, M)).body.error, /at least \$0\.50/);
  // Enterprise Max, 400 people, $12,000 a year, Lyte + Neodela only, Quouk .3o
  const q = (await call(h, { action: 'quote_save', plan: 'enterprise', tier: 'max', seats: 400, amount: 12000, interval: 'year', models: ['Lyte-28', 'Neodela', 'Bogus'], customer: ENT, notes: 'Signed by CTO' }, M)).body;
  assert.match(q.quote_no, /^Q-[A-Z2-9]{6}$/); assert.deepStrictEqual([q.amount_cents, q.seats, q.interval, q.status], [1200000, 400, 'year', 'draft']);
  assert.deepStrictEqual(q.items.map(i => i.model), ['Lyte-28', 'Neodela']); assert.strictEqual(q.config.chip, 'Quouk .3o');
  // 1) payment link
  const link = (await call(h, { action: 'quote_send', quote_no: q.quote_no, delivery: 'link' }, M)).body;
  const s = w.sessions[link.session_id];
  assert.strictEqual(s.form.get('line_items[0][price_data][unit_amount]'), '1200000');
  assert.match(s.form.get('line_items[0][price_data][product_data][name]'), /^aARgon3 Enterprise · Max \(400 people\) · Order /);
  assert.deepStrictEqual([s.metadata.a3_quote, s.metadata.a3_seats, s.metadata.a3_models, s.metadata.a3_source, s.metadata.a3_c_node], [q.quote_no, '400', 'Lyte-28,Neodela', 'custom', ENT.node]);
  assert.strictEqual(w.quotes[q.quote_no].status, 'sent');
  assert.match((await call(h, { action: 'quote_save', quote_no: q.quote_no, plan: 'enterprise', tier: 'pro', amount: 1, customer: ENT }, M)).body.error, /Only drafts/);
  pay(s);
  const b = JSON.stringify({ type: 'checkout.session.completed', data: { object: { ...s, form: undefined } } });
  await call(hw, b, signed(b));
  const o = w.orders[link.order_id];
  assert.deepStrictEqual([o.seats, o.quote_no, o.source, o.node_id, o.target_jurisdiction, o.company_name], [400, q.quote_no, 'custom', ENT.node, ENT.jurisdiction, 'Acme Corp']);
  assert.deepStrictEqual(o.items.map(i => i.model), ['Lyte-28', 'Neodela']);
  assert.strictEqual(w.quotes[q.quote_no].status, 'paid');
  assert.match((await call(h, { action: 'quote_cancel', quote_no: q.quote_no }, M)).body.error, /already paid/);

  // 2) emailed invoice, one-time $2,500 → paid → order
  const q2 = (await call(h, { action: 'quote_save', plan: 'business', tier: 'pro', seats: 12, amount: 2500, interval: 'once', customer: PAT }, M)).body;
  const inv = (await call(h, { action: 'quote_send', quote_no: q2.quote_no, delivery: 'invoice', days_until_due: 15 }, M)).body;
  assert.match(inv.url, /^https:\/\/invoice\.stripe\.com\//); assert.strictEqual(inv.email, 'pat@co.com');
  assert.ok(w.calls.some(c => c.url.endsWith('/v1/invoiceitems') && c.body.includes('amount=250000')));
  const invoice = Object.values(w.invoices).pop();
  assert.strictEqual(invoice.form.get('days_until_due'), '15'); assert.strictEqual(invoice.metadata.a3_quote, q2.quote_no);
  const paidInv = JSON.stringify({ type: 'invoice.paid', data: { object: { id: invoice.id, billing_reason: 'manual', amount_paid: 250000, customer: 'cus_1', metadata: invoice.metadata } } });
  await call(hw, paidInv, signed(paidInv)); await call(hw, paidInv, signed(paidInv));
  const o2 = Object.values(w.orders).find(x => x.quote_no === q2.quote_no);
  assert.deepStrictEqual([o2.amount_cents, o2.billing, o2.payment_method, o2.seats], [250000, 'once', 'invoice', 12]);
  assert.strictEqual(Object.values(w.orders).filter(x => x.quote_no === q2.quote_no).length, 1);

  // 3) a recurring invoice becomes a subscription billed by invoice
  const q3 = (await call(h, { action: 'quote_save', plan: 'enterprise', tier: 'standard', seats: 150, amount: 650, interval: 'month', customer: ENT }, M)).body;
  await call(h, { action: 'quote_send', quote_no: q3.quote_no, delivery: 'invoice' }, M);
  const sub = w.calls.find(c => c.url.endsWith('/v1/subscriptions') && c.method === 'POST');
  assert.match(sub.body, /collection_method=send_invoice/); assert.match(sub.body, /items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=65000/);
  // 4) free
  const q4 = (await call(h, { action: 'quote_save', plan: 'enterprise', tier: 'pro', seats: 100, interval: 'free', customer: ENT }, M)).body;
  const free = (await call(h, { action: 'quote_send', quote_no: q4.quote_no }, M)).body;
  assert.strictEqual(w.orders[free.order_id].source, 'comp'); assert.strictEqual(w.quotes[q4.quote_no].status, 'paid');
  // cancel a sent one voids its invoice
  await call(h, { action: 'quote_cancel', quote_no: q3.quote_no }, M);
  assert.strictEqual(w.quotes[q3.quote_no].status, 'cancelled');
  assert.ok(w.logs.some(l => l.p_action === 'quote_sent'));
});

test('staff: promotions are made in Stripe by managers', async () => {
  const w = world(), h = staff(ENV, w.fetch), M = as(MANAGER);
  assert.strictEqual((await call(h, { action: 'promo_save', code: 'X1X', type: 'percentage', value: 10 }, as(EMPLOYEE))).status, 403);
  assert.match((await call(h, { action: 'promo_save', code: 'bad code!', type: 'percentage', value: 10 }, M)).body.error, /3 to 30/);
  assert.match((await call(h, { action: 'promo_save', code: 'BIG', type: 'percentage', value: 150 }, M)).body.error, /between 1 and 100/);
  const r = (await call(h, { action: 'promo_save', code: 'summer25', type: 'percentage', value: 25, duration: 'repeating', duration_months: 3, plans: ['personal', 'nope'], tiers: ['pro'], limit: 50, ends: '2027-01-01' }, M)).body;
  assert.deepStrictEqual([r.code, r.plans, r.tiers, r.limit, r.description], ['SUMMER25', ['personal'], ['pro'], 50, '25% off for 3 months']);
  const coupon = w.calls.find(c => c.url.endsWith('/v1/coupons')), pc = w.calls.find(c => c.url.endsWith('/v1/promotion_codes'));
  assert.match(coupon.body, /percent_off=25/); assert.match(coupon.body, /duration=repeating/); assert.match(coupon.body, /duration_in_months=3/);
  assert.match(pc.body, /code=SUMMER25/); assert.match(pc.body, /max_redemptions=50/); assert.match(pc.body, /expires_at=\d+/);
  assert.match((await call(h, { action: 'promo_save', code: 'SUMMER25', type: 'fixed', value: 5 }, M)).body.error, /already exists/);
  const off = (await call(h, { action: 'promo_save', id: r.id, active: false }, M)).body;
  assert.strictEqual(off.active, false); assert.ok(w.calls.some(c => c.url.endsWith('/v1/promotion_codes/promo_SUMMER25') && c.body.includes('active=false')));
});

// ============================================================ staff: people
test('staff: team roles — who can change whom', async () => {
  const w = world(), h = staff(ENV, w.fetch), O = as(OWNER), M = as(MANAGER), E = as(EMPLOYEE);
  for (const t of [OWNER, MANAGER, EMPLOYEE]) await call(h, { action: 'me' }, as(t));
  const id = em => w.staff.find(s => s.email === em).id;
  assert.strictEqual((await call(h, { action: 'team' }, E)).status, 403);
  const listM = (await call(h, { action: 'team' }, M)).body, listO = (await call(h, { action: 'team' }, O)).body;
  assert.ok(listM.every(s => !('pay_rate' in s)) && listO.some(s => 'pay_rate' in s), 'only the owner sees pay');
  // managers add employees, not managers; can't touch pay or roles
  assert.strictEqual((await call(h, { action: 'team_save', email: 'new@co.com', title: 'Associate' }, M)).body.role, 'employee');
  assert.match((await call(h, { action: 'team_save', email: 'm2@co.com', role: 'manager' }, M)).body.error, /Only the owner/);
  assert.match((await call(h, { action: 'team_save', id: id('sam@apoji.co'), pay_rate: 20 }, M)).body.error, /Only the owner/);
  assert.strictEqual((await call(h, { action: 'team_save', id: id('sam@apoji.co'), title: 'Lead', active: false }, M)).body.active, false);
  assert.match((await call(h, { action: 'team_save', id: id('apojidelegraphics101010@gmail.com'), title: 'x' }, M)).body.error, /Only the owner/);
  // the owner sets roles and pay, but can't demote or switch off the owner, and nobody can be made owner
  const sam = (await call(h, { action: 'team_save', id: id('sam@apoji.co'), role: 'manager', pay_rate: '18.50', active: true }, O)).body;
  assert.deepStrictEqual([sam.role, sam.pay_rate, sam.active], ['manager', '18.5', true]);
  assert.match((await call(h, { action: 'team_save', id: id('sam@apoji.co'), role: 'owner' }, O)).body.error, /Employee or Manager/);
  assert.match((await call(h, { action: 'team_save', id: id('apojidelegraphics101010@gmail.com'), active: false }, O)).body.error, /can't be switched off|your own/);
  assert.match((await call(h, { action: 'team_save', id: id('sam@apoji.co'), pay_rate: -4 }, O)).body.error, /Pay rate/);
  // profile: your own name, title, phone, store, colour
  const p = (await call(h, { action: 'profile_save', display_name: 'Sammy', title: 'Closer', color: '#5ce1ff', role: 'owner' }, E)).body;
  assert.deepStrictEqual([p.display_name, p.title, p.color, p.role], ['Sammy', 'Closer', '#5ce1ff', 'manager']);
});

test('staff: schedule, time off and owner settings', async () => {
  const w = world(), h = staff(ENV, w.fetch), O = as(OWNER), M = as(MANAGER), E = as(EMPLOYEE);
  await call(h, { action: 'me' }, E);
  const start = new Date(Date.now() + 864e5).toISOString(), end = new Date(Date.now() + 864e5 + 8 * 3600e3).toISOString();
  assert.strictEqual((await call(h, { action: 'schedule_save', user_id: 'u-admin', starts_at: start, ends_at: end }, E)).status, 403);
  const c = (await call(h, { action: 'schedule_save', user_id: 'u-admin', store_code: '0028', starts_at: start, ends_at: end, note: 'Open' }, M)).body;
  assert.strictEqual(c.created_by, 'Riley');
  const mine = (await call(h, { action: 'schedule', from: new Date().toISOString(), to: new Date(Date.now() + 7 * 864e5).toISOString(), mine: true }, E)).body;
  assert.strictEqual(mine.length, 1);
  assert.strictEqual((await call(h, { action: 'schedule_copy', week_start: new Date().toISOString() }, M)).body.copied, 1);
  assert.strictEqual((await call(h, { action: 'schedule_delete', id: c.id }, M)).body.ok, true);
  // time off: ask, managers answer, you can cancel your own pending request but not approve it
  const t = (await call(h, { action: 'timeoff_request', starts_on: '2026-12-24', ends_on: '2026-12-26', reason: 'Holidays' }, E)).body;
  assert.strictEqual(t.status, 'pending');
  assert.strictEqual((await call(h, { action: 'timeoff_decide', id: t.id, status: 'approved' }, E)).status, 403);
  assert.strictEqual((await call(h, { action: 'timeoff_decide', id: t.id, status: 'approved' }, M)).body.status, 'approved');
  assert.match((await call(h, { action: 'timeoff_request', starts_on: 'tomorrow' }, E)).body.error, /first day/);
  // settings: managers can look, only the owner changes them
  assert.strictEqual((await call(h, { action: 'settings' }, M)).status, 200);
  assert.strictEqual((await call(h, { action: 'settings_save', key: 'store', value: { open: false } }, M)).status, 403);
  const s = (await call(h, { action: 'settings_save', key: 'store', value: { open: false, message: 'Inventory day' } }, O)).body;
  assert.deepStrictEqual(s.store, { open: false, message: 'Inventory day' });
  assert.strictEqual((await call(h, { action: 'settings_save', key: 'hack', value: {} }, O)).status, 400);
  assert.strictEqual((await call(h, { action: 'store_save', code: '7777', name: 'New Outpost', region: 'B' }, O)).body.name, 'New Outpost');
  assert.strictEqual((await call(h, { action: 'store_save', code: '7777', name: 'x' }, M)).status, 403);
});

test('staff: the 2.0 manager actions still work (Apoji Admin uses them)', async () => {
  const w = world(), h = staff(ENV, w.fetch), A = as(EMPLOYEE), B = as(MANAGER);
  const from = new Date(Date.now() - 864e5).toISOString(), to = new Date().toISOString();
  for (const body of [{ action: 'comp', plan: 'personal', tier: 'max' }, { action: 'cancel', order_id: 'X' }, { action: 'log' },
    { action: 'edit_shift', id: 1, clock_in: from }, { action: 'shifts', from, to, everyone: true }]) {
    const r = await call(h, body, A); assert.strictEqual(r.status, 403, body.action); assert.match(r.body.error, /managers/);
  }
  assert.ok((await call(h, { action: 'shifts', from, to }, A)).body.every(s => s.user_id === 'u-admin'));
  assert.strictEqual((await call(h, { action: 'shifts', from: '2026-01-01', to: '2026-12-31' }, A)).status, 400);
  const comp = await call(h, { action: 'comp', plan: 'business', tier: 'max', name: 'Tester', note: 'beta' }, B);
  const o = w.orders[comp.body.order_id];
  assert.deepStrictEqual([o.source, o.amount_cents, o.payment_method, o.operator, o.customer_name], ['comp', 0, 'comp', 'Riley', 'Tester']);
  o.stripe_subscription_id = 'sub_1';
  const c = await call(h, { action: 'cancel', order_id: comp.body.order_id, refund: true }, B);
  assert.deepStrictEqual(c.body, { order_id: comp.body.order_id, status: 'REFUNDED', refunded: 25 });
  assert.ok(w.calls.some(x => x.url.endsWith('/v1/refunds') && x.body.includes('payment_intent=pi_1')));
  assert.strictEqual((await call(h, { action: 'cancel', order_id: 'NOPE' }, B)).status, 404);
  assert.strictEqual((await call(h, { action: 'order', order_id: 'NOPE' }, A)).status, 404);
});

test('store: the Custom tab sends a request that lands in Custom orders, priced by staff before it can be sent', async () => {
  const w = world(), store = checkout(ENV, w.fetch), h = staff(ENV, w.fetch);
  // details are required, like every other order
  assert.match((await call(store, { action: 'request', plan: 'business', tier: 'pro', customer: { first: 'Pat', email: 'pat@co.com' } })).body.error, /./);
  const r = await call(store, { action: 'request', plan: 'business', tier: 'pro', seats: 12, interval: 'year', models: ['Neodela', 'Hailos-9.2o', 'not-a-model'], chip: 'Quouk .3o',
    budget: 900, notes: 'Two offices, need yearly billing', customer: PAT });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body)); assert.match(r.body.quote_no, /^Q-[A-Z0-9]{6}$/);
  const q = w.quotes[r.body.quote_no];
  assert.strictEqual(q.status, 'requested'); assert.strictEqual(q.seats, 12); assert.strictEqual(q.config.chip, 'Quouk .3o');
  assert.deepStrictEqual(q.items.map(i => i.model), ['Neodela', 'Hailos-9.2o']); assert.strictEqual(q.request.budget, 900);
  assert.strictEqual(q.customer.company, 'Doe Labs LLC');
  // a bot that fills the hidden field gets a fake "thanks" and nothing is saved
  const n = Object.keys(w.quotes).length;
  assert.strictEqual((await call(store, { action: 'request', plan: 'personal', tier: 'pro', customer: PAT, website: 'http://spam' })).status, 200);
  assert.strictEqual(Object.keys(w.quotes).length, n);
  // managers see it waiting; it can't be sent without a price; saving it makes it a draft
  assert.strictEqual((await call(h, { action: 'me' }, as(MANAGER))).body.requests, 1);
  assert.strictEqual((await call(h, { action: 'me' }, as(EMPLOYEE))).body.requests, 0);
  assert.match((await call(h, { action: 'quote_send', quote_no: q.quote_no }, as(MANAGER))).body.error, /Set a price/);
  const saved = await call(h, { action: 'quote_save', quote_no: q.quote_no, plan: 'business', tier: 'pro', seats: 12, interval: 'year', amount: 1450, customer: PAT }, as(MANAGER));
  assert.strictEqual(saved.status, 200, JSON.stringify(saved.body)); assert.strictEqual(w.quotes[q.quote_no].status, 'draft');
  assert.strictEqual((await call(h, { action: 'quote_send', quote_no: q.quote_no }, as(MANAGER))).status, 200);
  // closed store: no requests either
  w.settings.store = { open: false, message: 'Back Monday' };
  assert.match((await call(store, { action: 'request', plan: 'personal', tier: 'pro', customer: { ...PAT, email: 'x@y.co' } })).body.error, /Back Monday/);
});

test('staff: behavior points: managers give and undo, nobody gives themselves, employees see only their own', async () => {
  const w = world(), h = staff(ENV, w.fetch);
  for (const t of [OWNER, MANAGER, EMPLOYEE]) await call(h, { action: 'me' }, as(t));   // first sign-in puts them on the team
  const give = (tok, user_id, points, reason = 'Great customer service') => call(h, { action: 'points_give', user_id, points, reason }, as(tok));
  assert.strictEqual((await give(MANAGER, 'u-admin', 2)).status, 200);
  assert.strictEqual((await give(MANAGER, 'u-admin', -1, 'Phone out on the floor')).status, 200);
  assert.match((await give(MANAGER, 'u-boss', 5)).body.error, /yourself/);
  assert.match((await give(MANAGER, 'u-owner', 5)).body.error, /owner can give managers/);
  assert.match((await give(EMPLOYEE, 'u-boss', 5)).body.error, /managers/);
  assert.match((await give(OWNER, 'u-boss', 0)).body.error, /-50 to 50/);
  assert.strictEqual((await give(OWNER, 'u-boss', 3, 'Covered a shift')).status, 200);
  // employee view: own total and history only
  const mine = (await call(h, { action: 'points' }, as(EMPLOYEE))).body;
  assert.strictEqual(mine.mine.total, 1); assert.strictEqual(mine.board, undefined); assert.strictEqual(mine.history.length, 2);
  // manager view: the whole board
  const all = (await call(h, { action: 'points' }, as(MANAGER))).body;
  assert.deepStrictEqual(all.board.map(r => [r.name, r.total]), [['Riley', 3], ['Sam', 1], ['Lucas', 0]]);
  // undo: a manager only their own; the owner anything
  const ownerGift = w.points.find(p => p.given_by_id === 'u-owner');
  assert.match((await call(h, { action: 'points_undo', id: ownerGift.id }, as(MANAGER))).body.error, /Only the owner/);
  assert.strictEqual((await call(h, { action: 'points_undo', id: 1 }, as(MANAGER))).status, 200);
  assert.strictEqual((await call(h, { action: 'points' }, as(EMPLOYEE))).body.mine.total, -1);
  assert.ok(w.logs.some(l => l.p_action === 'points') && w.logs.some(l => l.p_action === 'points_undo'));
});

test('staff: a late clock-in can cost points (owner setting, off by default)', async () => {
  const w = world(), h = staff(ENV, w.fetch);
  await call(h, { action: 'me' }, as(EMPLOYEE));
  w.lateNext = 9;
  await call(h, { action: 'clock_in', store: '0028' }, as(EMPLOYEE));
  assert.strictEqual(w.points.length, 0);                                  // off by default
  await call(h, { action: 'clock_out' }, as(EMPLOYEE));
  assert.match((await call(h, { action: 'settings_save', key: 'points', value: { late: -2 } }, as(MANAGER))).body.error, /owner/);
  assert.strictEqual((await call(h, { action: 'settings_save', key: 'points', value: { late: -2 } }, as(OWNER))).status, 200);
  await call(h, { action: 'clock_in', store: '0028' }, as(EMPLOYEE));
  assert.deepStrictEqual(w.points.map(p => [p.user_id, p.points, p.kind]), [['u-admin', -2, 'late']]);
  assert.match(w.points[0].reason, /9 min/);
});

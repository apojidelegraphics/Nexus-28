// POST /functions/v1/staff — everything the staff terminal (web and desktop) and Apoji Admin's Mexel page do.
//
// Who gets in: staff sign in with their Nexus account. Every request carries that account's access token; this function
// checks it with Nexus, then looks the person up in aARgon3's staff list:
//   • Nexus admins are added automatically the first time (high-admin → manager, other levels → employee).
//   • The owner (OWNER_EMAILS) is always the owner.
//   • Anyone else the owner or a manager added by email gets in with that email's Nexus account.
//   • Someone switched off in Team can't get in.
// Roles: employee (clock, sell, own sales/schedule) < manager (team, schedule, time off, quotes, promos, comps, refunds,
//        everyone's timesheets) < owner (pay rates, roles, store settings, stores).
//
// Body: { action, ... } — see `actions` below. The 2.0 actions (me, clock_in, clock_out, break, shifts, edit_shift, sale,
// sale_status, comp, orders, order, cancel, log) keep working the same way for Apoji Admin.
import { A3, cors, json, Oops, db, stripe, startCheckout, sessionStatus, newOrderId, newQuoteNo, sendInvoice, checkPromo, discountLabel, storeInfo } from '../_shared/lib.mjs';

const NEXUS_URL = 'https://yzbnxpkuhlxsuwzbjifx.supabase.co';
const NEXUS_KEY = 'sb_publishable_LY-EZORCvEQqW6AeQC5a8w_Z7wmeyjn';   // public key, safe to ship
const OWNER_EMAILS = ['apojidelegraphics101010@gmail.com'];
const TZ = 'America/New_York';
const RANK = { employee: 1, manager: 2, owner: 3 };

export function handler(env, fetchImpl = fetch, now = () => Date.now()) {
  const rpc = db(env, fetchImpl), call = stripe(env, fetchImpl);
  const nexusUrl = env.NEXUS_URL || NEXUS_URL, nexusKey = env.NEXUS_KEY || NEXUS_KEY;
  const owners = (env.OWNER_EMAILS ? env.OWNER_EMAILS.split(',') : OWNER_EMAILS).map(e => e.trim().toLowerCase());
  const site = env.SITE_URL || 'https://apojidelegraphics.github.io/aArgon3';
  const cache = new Map();   // token → { who, until }

  async function nexus(path, token, init = {}) {
    const res = await fetchImpl(`${nexusUrl}${path}`, { ...init, headers: { apikey: nexusKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
    if (!res.ok) return null;
    return res.json().catch(() => null);
  }
  // Who is this, and what may they do? (cached for 2 minutes so the clock and lists stay quick)
  async function whoIs(req) {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) throw new Oops('Sign in first.', 401);
    const hit = cache.get(token);
    if (hit && hit.until > now()) return hit.who;
    const user = await nexus('/auth/v1/user', token);
    if (!user?.id) throw new Oops('Your sign-in expired. Sign in again.', 401);
    const email = String(user.email || '').toLowerCase();
    const levelRaw = await nexus('/rest/v1/rpc/get_my_admin_level', token, { method: 'POST', body: '{}' });
    const level = typeof levelRaw === 'string' && levelRaw ? levelRaw : null;
    const prof = (await nexus(`/rest/v1/profiles?select=username,nickname&id=eq.${encodeURIComponent(user.id)}`, token)) || [];
    const nexusName = prof[0]?.nickname || prof[0]?.username || email.split('@')[0] || 'Staff';
    const isOwner = owners.includes(email);
    let staff = null, legacy = false;
    try { staff = await rpc('a3_staff_sync', { p_user: user.id, p_email: email, p_name: nexusName, p_level: level, p_owner: isOwner }); }
    catch (e) { if (/hasn't been run/.test(e.message)) legacy = true; else throw e; }   // before aargon3-2.1.sql: Nexus admins only
    let who;
    if (legacy) {
      if (!level && !isOwner) throw new Oops("That account isn't an admin, so it can't use aARgon3.", 403);
      const role = isOwner ? 'owner' : level === 'high-admin' ? 'manager' : 'employee';
      who = { id: user.id, email, name: nexusName, level, role, staff_id: null, legacy: true };
    } else {
      if (!staff) throw new Oops("That account isn't an admin or on the aARgon3 staff list, so it can't use aARgon3. Ask the owner to add you.", 403);
      if (!staff.active) throw new Oops('Your aARgon3 access is turned off. Talk to your manager.', 403);
      who = { id: user.id, email, name: staff.name || nexusName, level: level || 'staff', role: staff.role, staff_id: staff.id, title: staff.title, color: staff.color };
    }
    who.manager = RANK[who.role] >= 2; who.owner = who.role === 'owner';
    cache.set(token, { who, until: now() + 2 * 60e3 });
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    return who;
  }
  const need = (who, role) => { if (RANK[who.role] < RANK[role]) throw new Oops(role === 'owner' ? 'Only the owner can do that.' : 'Only managers (high-admins) can do that.', 403); };
  const log = (who, action, details) => rpc('a3_log', { p_user: who.id, p_name: who.name, p_action: action, p_details: details }).catch(() => {});
  const iso = (v, what) => { const d = new Date(v); if (!v || isNaN(d)) throw new Oops(`Pick a ${what}.`); return d.toISOString(); };
  const day = (v, what) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))) throw new Oops(`Pick a ${what}.`); return v; };
  const dropToken = req => cache.delete((req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''));
  // Staff sales: full details are required (2.1). Apoji Admin's older Sell page sends only an email; that still works.
  const saleCustomer = (plan, b) => b.customer ? A3.customer(plan, b.customer) : A3.customer(plan, { email: b.email }, { partial: true });

  // a custom order / Enterprise quote, checked
  function quoteInput(b) {
    const plan = String(b.plan || ''), tier = String(b.tier || '');
    const sel = A3.selection({ plan, tier, billing: b.interval === 'year' ? 'year' : 'month', os: b.os, connection: b.connection });
    const interval = ['month', 'year', 'once', 'free'].includes(b.interval) ? b.interval : 'month';
    const cents = interval === 'free' ? 0 : Math.round(Number(b.amount) * 100);
    if (interval !== 'free' && (!Number.isFinite(cents) || cents < 50)) throw new Oops('Enter a price of at least $0.50 (or make it free).');
    if (cents > 100000000) throw new Oops('That price is too big for one order.');
    const seats = b.seats ? Math.max(1, Math.min(100000, Math.round(Number(b.seats)))) : A3.price(plan, tier, 'month').seats;
    const all = Object.values(A3.C.families).flatMap(f => f.models);
    const models = Array.isArray(b.models) && b.models.length ? [...new Set(b.models.filter(m => all.includes(m)))] : A3.items(tier).map(i => i.model);
    const chip = A3.C.chips.some(c => c.id === b.chip && c.id !== 'No order') ? b.chip : A3.C.tiers[tier].chip;
    const customer = A3.customer(plan, b.customer || {});
    const config = { ...A3.config(sel), chip, seats, billing: interval };
    return { sel, interval, cents, seats, models, chip, customer, config,
      items: models.map(model => ({ model, price: 0, family: Object.keys(A3.C.families).find(f => A3.C.families[f].models.includes(model)) })) };
  }

  const actions = {
    // ---------- you
    async me(who) {
      const [state, overview, info] = await Promise.all([rpc('a3_staff_state', { p_user: who.id, p_tz: TZ }), rpc('a3_overview', { p_tz: TZ }), storeInfo(rpc)]);
      const requests = who.manager ? await rpc('a3_quotes', { p_status: 'requested' }).then(l => (l || []).length).catch(() => 0) : 0;
      return { user: who, state, overview, store: { open: info.open, message: info.message }, catalog: A3.C.version, requests };
    },
    async overview() { return rpc('a3_overview', { p_tz: TZ }); },
    async profile(who) {
      const [list, sales, timeoff] = await Promise.all([rpc('a3_staff_list', { p_with_pay: who.owner, p_tz: TZ }), rpc('a3_sales', { p_user: who.id, p_tz: TZ }), rpc('a3_timeoff', { p_user: who.id })]);
      return { me: list.find(s => s.user_id === who.id) || null, sales, timeoff };
    },
    async profile_save(who, b, req) {
      const p = { id: who.staff_id };
      for (const k of ['display_name', 'title', 'phone', 'default_store', 'color']) if (k in b) p[k] = String(b[k] ?? '').slice(0, 80);
      if (p.color && !/^#[0-9a-f]{6}$/i.test(p.color)) delete p.color;
      const r = await rpc('a3_staff_save', { p, p_by: who.name }); dropToken(req); return r;
    },

    // ---------- the clock
    async clock_in(who, b) {
      const r = await rpc('a3_clock_in', { p_user: who.id, p_name: who.name, p_store: String(b.store || '') });
      // the owner can make a late clock-in cost points (Settings → Points); off (0) by default
      if (r?.late_minutes > 0 && !who.legacy && !who.owner) {
        const late = await rpc('a3_settings').then(x => Number(x?.points?.late) || 0).catch(() => 0);
        if (late < 0) await rpc('a3_points_give', { p_user: who.id, p_points: late, p_reason: `Late clock-in (${r.late_minutes} min)`, p_kind: 'late', p_by: 'aARgon3', p_by_id: null }).catch(() => {});
      }
      return r;
    },
    async clock_out(who, b) {
      return rpc('a3_clock_out', { p_user: who.id, p_note: b.note ? String(b.note).slice(0, 500) : null, p_at: b.at ? iso(b.at, 'time') : null });
    },
    async break(who, b) { return rpc('a3_break', { p_user: who.id, p_on: !!b.on }); },
    async shifts(who, b) {
      const from = iso(b.from, 'start date'), to = iso(b.to, 'end date');
      if (new Date(to) - new Date(from) > 93 * 864e5) throw new Oops('Pick 3 months or less.');
      if (b.everyone) need(who, 'manager');
      return rpc('a3_shifts', { p_user: b.everyone ? null : (b.user_id && who.manager ? b.user_id : who.id), p_from: from, p_to: to });
    },
    async edit_shift(who, b) {
      need(who, 'manager');
      const r = await rpc('a3_edit_shift', { p_id: Number(b.id), p_clock_in: iso(b.clock_in, 'clock-in time'), p_clock_out: b.clock_out ? iso(b.clock_out, 'clock-out time') : null,
        p_note: b.note ? String(b.note).slice(0, 500) : null, p_by: who.name });
      await log(who, 'edit_shift', { id: Number(b.id), name: r?.name, clock_in: r?.clock_in, clock_out: r?.clock_out });
      return r;
    },

    // ---------- team, schedule, time off
    async team(who) { need(who, 'manager'); return rpc('a3_staff_list', { p_with_pay: who.owner, p_tz: TZ }); },
    async team_save(who, b, req) {
      need(who, 'manager');
      const p = {};
      for (const k of ['email', 'display_name', 'title', 'phone', 'default_store', 'color', 'notes']) if (k in b) p[k] = b[k] == null ? '' : String(b[k]).slice(0, 300);
      if ('active' in b) p.active = !!b.active;
      if ('role' in b) {
        if (!['employee', 'manager'].includes(b.role)) throw new Oops('Pick Employee or Manager. (The owner is set by email.)');
        need(who, 'owner'); p.role = b.role;
      }
      if ('pay_rate' in b) { need(who, 'owner'); const r = b.pay_rate === '' || b.pay_rate == null ? '' : Number(b.pay_rate); if (r !== '' && !(r >= 0 && r < 10000)) throw new Oops('Pay rate looks wrong.'); p.pay_rate = r === '' ? '' : String(r); }
      if (b.id) {
        const target = await rpc('a3_staff_get', { p_id: Number(b.id) });
        if (!target) throw new Oops("That person isn't on the staff list.", 404);
        if (target.role === 'owner' && !who.owner) throw new Oops('Only the owner can change the owner.', 403);
        if (target.role === 'manager' && !who.owner) throw new Oops('Only the owner can change a manager.', 403);
        if (target.role === 'owner' && ('active' in p || 'role' in p)) throw new Oops("The owner can't be switched off or demoted.");
        if (target.user_id === who.id && ('active' in p || 'role' in p)) throw new Oops("You can't change your own role or switch yourself off.");
        p.id = Number(b.id);
      } else if (p.role === 'manager') need(who, 'owner');
      const r = await rpc('a3_staff_save', { p, p_by: who.name });
      cache.clear();   // their next request picks up the change
      await log(who, b.id ? 'team_edit' : 'team_add', { email: r.email, role: r.role, active: r.active });
      return r;
    },
    async schedule(who, b) {
      const from = iso(b.from, 'start date'), to = iso(b.to, 'end date');
      if (new Date(to) - new Date(from) > 62 * 864e5) throw new Oops('Pick 2 months or less.');
      return rpc('a3_schedule', { p_from: from, p_to: to, p_user: b.mine ? who.id : null });
    },
    async schedule_save(who, b) {
      need(who, 'manager');
      const r = await rpc('a3_schedule_save', { p: { id: b.id || null, user_id: b.user_id, store_code: b.store_code || null, starts_at: iso(b.starts_at, 'start time'),
        ends_at: iso(b.ends_at, 'end time'), note: b.note ? String(b.note).slice(0, 200) : null }, p_by: who.name });
      await log(who, 'schedule', { id: r.id, user_id: r.user_id, starts_at: r.starts_at }); return r;
    },
    async schedule_delete(who, b) { need(who, 'manager'); await rpc('a3_schedule_delete', { p_id: Number(b.id) }); await log(who, 'schedule_delete', { id: Number(b.id) }); return { ok: true }; },
    async schedule_copy(who, b) {
      need(who, 'manager');
      const n = await rpc('a3_schedule_copy_week', { p_from: iso(b.week_start, 'week'), p_by: who.name });
      await log(who, 'schedule_copy', { week_start: b.week_start, copied: n }); return { copied: n };
    },
    async timeoff(who, b) { return rpc('a3_timeoff', { p_user: b.everyone && who.manager ? null : who.id }); },
    async timeoff_request(who, b) { return rpc('a3_timeoff_request', { p_user: who.id, p_starts: day(b.starts_on, 'first day'), p_ends: day(b.ends_on || b.starts_on, 'last day'), p_reason: String(b.reason || '').slice(0, 300) }); },
    async timeoff_decide(who, b) {
      if (b.status === 'cancelled') return rpc('a3_timeoff_decide', { p_id: Number(b.id), p_status: 'cancelled', p_by: who.name, p_user: who.manager ? null : who.id });
      need(who, 'manager');
      const r = await rpc('a3_timeoff_decide', { p_id: Number(b.id), p_status: b.status, p_by: who.name, p_user: null });
      await log(who, 'time_off', { id: r.id, status: r.status }); return r;
    },

    // ---------- selling
    async sale(who, b) {
      const state = await rpc('a3_staff_state', { p_user: who.id, p_tz: TZ });
      if (!state?.shift && !who.owner) throw new Oops('Clock in before you start a sale.');   // the owner never has to clock in
      const sel = A3.selection(b), customer = saleCustomer(sel.plan, b);
      const promo = b.promo ? await checkPromo({ rpc, code: b.promo, sel, amount: A3.price(sel.plan, sel.tier, sel.billing).amount }) : null;
      const r = await startCheckout({ call, siteUrl: site, sel, customer, promo, staff: { id: who.id, name: who.name, shiftId: state?.shift?.id || undefined } });
      await log(who, 'sale_link', { order_id: r.order_id, plan: sel.plan, tier: sel.tier, billing: sel.billing, amount: r.amount, company: customer.company || undefined, promo: promo?.code });
      return { ...r, ...(promo ? { promo: promo.code, promo_label: promo.label, after: promo.after } : {}) };
    },
    async sale_status(who, b) { return sessionStatus({ rpc, call, sessionId: b.session_id }); },
    async promo_check(who, b) {
      const sel = A3.selection(b), p = A3.price(sel.plan, sel.tier, sel.billing);
      const x = await checkPromo({ rpc, code: b.code, sel, amount: p.amount });
      if (!x) throw new Oops('Enter a code.');
      return { code: x.code, label: x.label, after: x.after, before: p.amount };
    },
    async comp(who, b) {
      need(who, 'manager');
      const sel = A3.selection({ ...b, billing: 'month' });
      const customer = b.customer ? A3.customer(sel.plan, b.customer) : { name: String(b.name || '').slice(0, 120), email: sel.email };   // older callers send name + email
      const state = await rpc('a3_staff_state', { p_user: who.id, p_tz: TZ });
      const order_id = newOrderId();
      await rpc('a3_record_order', { p: { order_id, plan_type: A3.C.plans[sel.plan].name, tier: sel.tier, billing: 'comp', config: A3.config(sel), items: A3.items(sel.tier),
        amount_cents: 0, customer_name: customer.name || String(b.name || '').slice(0, 120), customer_email: customer.email || sel.email, customer_phone: customer.phone,
        company_name: customer.company, customer_info: b.customer ? customer : null, source: 'comp', staff_user_id: who.id, operator: who.name,
        shift_id: state?.shift?.id || null, payment_method: 'comp', notes: b.note ? String(b.note).slice(0, 500) : null } });
      await log(who, 'comp', { order_id, plan: sel.plan, tier: sel.tier, note: b.note || '' });
      return { order_id };
    },

    // ---------- custom orders and Enterprise quotes (managers)
    async quotes(who, b) { need(who, 'manager'); return rpc('a3_quotes', { p_status: b.status || null }); },
    async quote(who, b) { need(who, 'manager'); const q = await rpc('a3_quote', { p_no: String(b.quote_no || '') }); if (!q) throw new Oops('No quote has that number.', 404); delete q.stripe_subscription_id; return q; },
    async quote_save(who, b) {
      need(who, 'manager');
      const x = quoteInput(b);
      if (b.quote_no) { const q = await rpc('a3_quote', { p_no: b.quote_no }); if (!q) throw new Oops('No quote has that number.', 404); if (q.status !== 'draft' && q.status !== 'requested') throw new Oops('Only drafts can be changed. Cancel it and make a new one.'); }
      const r = await rpc('a3_quote_save', { p: { quote_no: b.quote_no || newQuoteNo(), plan: x.sel.plan, tier: x.sel.tier, seats: x.seats, interval: x.interval, amount_cents: x.cents,
        config: x.config, items: x.items, customer: x.customer, notes: b.notes ? String(b.notes).slice(0, 1000) : null,
        valid_until: b.valid_until && /^\d{4}-\d{2}-\d{2}$/.test(b.valid_until) ? b.valid_until : null, created_by: who.name, created_by_id: who.id,
        ...(b.quote_no ? { status: 'draft' } : {}) } });   // a website request becomes a draft once staff price it
      if (!b.quote_no) await log(who, 'quote', { quote_no: r.quote_no, plan: r.plan, tier: r.tier, amount: r.amount, interval: r.interval });
      return r;
    },
    // send a saved quote: a payment link (QR), an emailed Stripe invoice, or free
    async quote_send(who, b) {
      need(who, 'manager');
      const q = await rpc('a3_quote', { p_no: String(b.quote_no || '') });
      if (!q) throw new Oops('No quote has that number.', 404);
      if (q.status === 'paid' || q.status === 'cancelled') throw new Oops(`That quote is already ${q.status}.`);
      if (q.interval !== 'free' && !(q.amount_cents >= 50)) throw new Oops('Set a price first (Edit), then send it.');
      const sel = A3.selection({ plan: q.plan, tier: q.tier, billing: q.interval === 'year' ? 'year' : 'month', os: q.config?.os, connection: q.config?.connection });
      const custom = { amount_cents: q.amount_cents, interval: q.interval, seats: q.seats, models: (q.items || []).map(i => i.model), chip: q.config?.chip, quote_no: q.quote_no };
      const customer = q.customer || {};
      const how = q.interval === 'free' ? 'free' : b.delivery === 'invoice' ? 'invoice' : 'link';
      let r;
      if (how === 'free') {
        const order_id = newOrderId();
        await rpc('a3_record_order', { p: { order_id, plan_type: A3.C.plans[sel.plan].name, tier: sel.tier, billing: 'comp', config: q.config, items: q.items, seats: q.seats,
          amount_cents: 0, customer_name: customer.name, customer_email: customer.email, customer_phone: customer.phone, company_name: customer.company,
          node_id: customer.node, target_jurisdiction: customer.jurisdiction, customer_info: customer, quote_no: q.quote_no, source: 'comp', staff_user_id: who.id,
          operator: who.name, payment_method: 'comp', notes: q.notes } });
        r = { delivery: 'free', order_id, status: 'paid' };
      } else if (how === 'invoice') {
        const inv = await sendInvoice({ call, sel, customer, custom, staff: { id: who.id, name: who.name }, daysUntilDue: b.days_until_due });
        await rpc('a3_quote_save', { p: { quote_no: q.quote_no, status: 'sent', delivery: 'invoice', url: inv.url, stripe_invoice_id: inv.invoice_id, stripe_subscription_id: inv.subscription_id } });
        r = { delivery: 'invoice', url: inv.url, email: inv.email, order_id: inv.order_id, status: 'sent' };
      } else {
        const ck = await startCheckout({ call, siteUrl: site, sel, customer, custom, staff: { id: who.id, name: who.name } });
        await rpc('a3_quote_save', { p: { quote_no: q.quote_no, status: 'sent', delivery: 'link', url: ck.url, stripe_session_id: ck.session_id } });
        r = { delivery: 'link', url: ck.url, session_id: ck.session_id, order_id: ck.order_id, status: 'sent' };
      }
      await log(who, 'quote_sent', { quote_no: q.quote_no, delivery: r.delivery, amount: q.amount });
      return r;
    },
    async quote_cancel(who, b) {
      need(who, 'manager');
      const q = await rpc('a3_quote', { p_no: String(b.quote_no || '') });
      if (!q) throw new Oops('No quote has that number.', 404);
      if (q.status === 'paid') throw new Oops('That quote is already paid. Cancel the order instead.');
      if (q.stripe_invoice_id) await call('POST', `invoices/${q.stripe_invoice_id}/void`).catch(() => {});
      if (q.stripe_subscription_id) await call('DELETE', `subscriptions/${q.stripe_subscription_id}`).catch(() => {});
      const r = await rpc('a3_quote_save', { p: { quote_no: q.quote_no, status: 'cancelled' } });
      await log(who, 'quote_cancel', { quote_no: q.quote_no }); return r;
    },

    // ---------- behavior points. Managers give points to employees (the owner to anyone); nobody gives themselves points.
    // Everyone sees their own; managers see the whole team.
    async points(who, b) {
      const monthStart = new Date(new Date().toLocaleString('en-US', { timeZone: TZ })); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      const board = await rpc('a3_points_board', { p_month_start: monthStart.toISOString() });
      const mine = board.find(r => r.user_id === who.id) || { total: 0, month: 0, given: 0, taken: 0 };
      if (!who.manager || b.mine) return { mine, history: await rpc('a3_points', { p_user: who.id, p_limit: 100 }) };
      const user = b.user_id ? String(b.user_id) : null;
      return { mine, board, history: await rpc('a3_points', { p_user: user, p_limit: user ? 300 : 150 }), settings: (await rpc('a3_settings'))?.points || { late: 0 } };
    },
    async points_give(who, b) {
      need(who, 'manager');
      const user = String(b.user_id || ''), pts = Math.round(Number(b.points));
      if (user === who.id) throw new Oops("You can't give yourself points.");
      const board = await rpc('a3_points_board', { p_month_start: new Date().toISOString() });
      const target = board.find(r => r.user_id === user);
      if (!target) throw new Oops("That person isn't on the team.", 404);
      if (!who.owner && target.role !== 'employee') throw new Oops('Only the owner can give managers points.', 403);
      if (!Number.isFinite(pts) || pts === 0 || Math.abs(pts) > 50) throw new Oops('Points go from -50 to 50 (not 0).');
      const r = await rpc('a3_points_give', { p_user: user, p_points: pts, p_reason: String(b.reason || '').slice(0, 200), p_kind: 'manual', p_by: who.name, p_by_id: who.id });
      await log(who, 'points', { name: target.name, points: pts, reason: r.reason });
      return r;
    },
    async points_undo(who, b) {
      need(who, 'manager');
      const list = await rpc('a3_points', { p_user: null, p_limit: 1000 });
      const x = list.find(p => p.id === Number(b.id));
      if (!x) throw new Oops('Not found.', 404);
      if (!who.owner && x.given_by_id !== who.id) throw new Oops('Only the owner can undo points someone else gave.', 403);
      const r = await rpc('a3_points_undo', { p_id: x.id, p_by: who.name });
      await log(who, 'points_undo', { name: x.name, points: x.points, reason: x.reason });
      return r;
    },

    // ---------- orders
    async orders(who, b) { return rpc('a3_orders', { p_q: String(b.q || '').slice(0, 100), p_limit: who.manager && b.all ? 5000 : 100 }); },
    async order(who, b) {
      const o = await rpc('a3_order', { p_order: String(b.order_id || '') });
      if (!o) throw new Oops('No order has that number.', 404);
      delete o.stripe_subscription_id; return o;
    },
    async cancel(who, b) {
      need(who, 'manager');
      const o = await rpc('a3_order', { p_order: String(b.order_id || '') });
      if (!o) throw new Oops('No order has that number.', 404);
      let refunded = null;
      if (o.stripe_subscription_id) {
        const sub = await call('GET', `subscriptions/${encodeURIComponent(o.stripe_subscription_id)}?expand[]=latest_invoice`);
        if (b.refund) {
          const pi = sub.latest_invoice?.payment_intent;
          if (pi) { const r = await call('POST', 'refunds', { payment_intent: typeof pi === 'string' ? pi : pi.id }); refunded = (r.amount || 0) / 100; }
        }
        if (sub.status !== 'canceled') await call('DELETE', `subscriptions/${encodeURIComponent(o.stripe_subscription_id)}`);
      }
      await rpc('a3_set_status', { p_order: o.order_id, p_subscription: null, p_status: b.refund ? 'REFUNDED' : 'CANCELLED' });
      await log(who, b.refund ? 'refund' : 'cancel', { order_id: o.order_id, refunded });
      return { order_id: o.order_id, status: b.refund ? 'REFUNDED' : 'CANCELLED', refunded };
    },

    // ---------- sales (employees see their own)
    async sales(who, b) { return rpc('a3_sales', { p_user: who.manager && !b.mine ? null : who.id, p_tz: TZ }); },

    // ---------- promotions (managers) — a code here is a Stripe coupon + promotion code
    async promos(who) { need(who, 'manager'); return rpc('a3_promos'); },
    async promo_save(who, b) {
      need(who, 'manager');
      if (b.id) {   // switch on/off, change end date or limit
        const x = (await rpc('a3_promos')).find(p => p.id === Number(b.id));
        if (!x) throw new Oops('No promotion with that id.', 404);
        if ('active' in b && x.stripe_promo_id) await call('POST', `promotion_codes/${x.stripe_promo_id}`, { active: b.active ? 'true' : 'false' });
        const r = await rpc('a3_promo_save', { p: { id: Number(b.id), ...('active' in b ? { active: !!b.active } : {}), ...(b.description != null ? { description: String(b.description).slice(0, 200) } : {}) } });
        await log(who, 'promo_edit', { code: r.code, active: r.active }); return r;
      }
      const code = String(b.code || '').trim().toUpperCase();
      if (!/^[A-Z0-9_-]{3,30}$/.test(code)) throw new Oops('Codes are 3 to 30 letters, numbers, - or _.');
      const type = b.type === 'fixed' ? 'fixed' : 'percentage', value = Number(b.value);
      if (type === 'percentage' && !(value > 0 && value <= 100)) throw new Oops('Pick a percent between 1 and 100.');
      if (type === 'fixed' && !(value > 0 && value <= 10000)) throw new Oops('Pick an amount off between $1 and $10,000.');
      const duration = ['once', 'forever', 'repeating'].includes(b.duration) ? b.duration : 'once';
      const months = duration === 'repeating' ? Math.max(1, Math.min(36, Math.round(Number(b.duration_months) || 3))) : null;
      const plans = (b.plans || []).filter(p => A3.PLANS.includes(p)), tiers = (b.tiers || []).filter(t => A3.TIERS.includes(t));
      const ends = b.ends ? iso(b.ends, 'end date') : null, limit = b.limit ? Math.max(1, Math.round(Number(b.limit))) : null;
      const existing = await rpc('a3_promo', { p_code: code });
      if (existing) throw new Oops('That code already exists.');
      const coupon = await call('POST', 'coupons', { name: code, duration, ...(months ? { duration_in_months: months } : {}),
        ...(type === 'percentage' ? { percent_off: value } : { amount_off: Math.round(value * 100), currency: A3.C.currency }), metadata: { a3: '1' } });
      const pc = await call('POST', 'promotion_codes', { coupon: coupon.id, code, ...(limit ? { max_redemptions: limit } : {}),
        ...(ends ? { expires_at: Math.floor(new Date(ends).getTime() / 1000) } : {}), metadata: { a3: '1' } });
      const r = await rpc('a3_promo_save', { p: { code, type, value, duration, duration_months: months, description: b.description ? String(b.description).slice(0, 200) : discountLabel({ type, value, duration, duration_months: months }),
        plans, tiers, min_total: Number(b.min_total) || 0, ends, limit, stripe_coupon_id: coupon.id, stripe_promo_id: pc.id, created_by: who.name } });
      await log(who, 'promo', { code, type, value, duration }); return r;
    },

    // ---------- owner: settings and stores
    async settings(who) { need(who, 'manager'); return { settings: await rpc('a3_settings'), stores: await rpc('a3_stores_all') }; },
    async settings_save(who, b) {
      need(who, 'owner');
      const key = String(b.key || ''), v = b.value || {};
      let value;
      if (key === 'store') value = { open: v.open !== false, message: String(v.message || '').slice(0, 200) };
      else if (key === 'business') value = { name: String(v.name || '').slice(0, 120), support_email: String(v.support_email || '').slice(0, 120), address: String(v.address || '').slice(0, 200), phone: String(v.phone || '').slice(0, 40) };
      else if (key === 'goals') value = { monthly_revenue: Math.max(0, Number(v.monthly_revenue) || 0) };
      else if (key === 'points') value = { late: Math.max(-10, Math.min(0, Math.round(Number(v.late) || 0))) };
      else throw new Oops('Unknown setting.');
      const r = await rpc('a3_setting_set', { p_key: key, p_value: value, p_by: who.name });
      await log(who, 'settings', { key, ...value }); return r;
    },
    async store_save(who, b) {
      need(who, 'owner');
      const r = await rpc('a3_store_save', { p_code: String(b.code || ''), p_name: String(b.name || '').slice(0, 80), p_region: String(b.region || 'A').slice(0, 1), p_active: b.active !== false });
      await log(who, 'store', { code: r.code, name: r.name, active: r.active }); return r;
    },
    async log(who) { need(who, 'manager'); return rpc('a3_log_list', { p_limit: 300 }); }
  };

  return async function (req) {
    const h = cors(req);
    if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
    if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405, h);
    try {
      const b = await req.json().catch(() => ({}));
      const fn = Object.hasOwn(actions, b.action) ? actions[b.action] : null;
      if (!fn) throw new Oops('Unknown action.');
      const who = await whoIs(req);
      return json(await fn(who, b, req) ?? null, 200, h);
    } catch (e) {
      const status = e instanceof Oops ? e.status : 400;
      if (status >= 500) console.error('[staff]', e);
      return json({ error: e.message || 'Something went wrong.' }, status, h);
    }
  };
}

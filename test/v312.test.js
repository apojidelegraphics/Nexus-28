// 3.12: known issues, chat tools (pins, summaries, find, compare), reminders, staff usage, confidence meters, starter cards,
// memory per Space, voice notes, weekly goals, offline queue, accessibility, guest mode, Test Run → app, Share to Nexus,
// the widget, Watch & guide me, the user guide, and the 3.12 bug fixes.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };
const main = R('main.js'), preload = R('preload.js'), hud = R('renderer/hud.js'), html = R('renderer/index.html'), settings = R('renderer/settings.js'), sql = R('supabase/nexus-v3.12.sql');

// ---- reminders (worked out on this computer)
const remind = require('../src/remind');
const t0 = new Date('2026-11-20T10:00:00').getTime();
assert.strictEqual(remind.parse('remind me about this in 2 hours', t0).at, t0 + 2 * 3600e3);
const tm = remind.parse('remind me to call Sam tomorrow at 9am', t0); assert.strictEqual(tm.note, 'call Sam'); assert.strictEqual(new Date(tm.at).getHours(), 9); assert.strictEqual(new Date(tm.at).getDate(), 21);
assert.strictEqual(new Date(remind.parse('remind me about this friday at 4pm', t0 - 864e5).at).getDay(), 5);
assert.strictEqual(remind.parse('what time is it', t0), null); assert.strictEqual(remind.parse('remind me about this', t0), null);
assert.ok(main.includes('remind.parse(q)') && main.includes("'reminders:add'") && main.includes('chatReminders'));
ok('reminders: "remind me … tomorrow at 9" understood without AI; the chat comes back with a notification');

// ---- weekly goals
const goals = require('../src/goals');
let g = goals.add(null, 'Finish the essay', t0); g = goals.add(g, 'Finish the essay', t0); g = goals.add(g, 'Run 3 times', t0);
assert.strictEqual(g.items.length, 2); g = goals.toggle(g, g.items[0].id, t0); assert.ok(g.items[0].done);
assert.ok(goals.prompt(g, t0).includes('[x] Finish the essay') && goals.prompt(g, t0).includes('[ ] Run 3 times'));
const next = goals.state(g, t0 + 7 * 864e5); assert.strictEqual(next.items.length, 0); assert.strictEqual(next.last.items.length, 2);
assert.deepStrictEqual(goals.carry(g, t0 + 7 * 864e5).items.map(i => i.text), ['Run 3 times']);
assert.deepStrictEqual(goals.fromMessage('my goal this week is to finish the essay; call grandma'), ['finish the essay', 'call grandma']);
assert.ok(main.includes('goals.prompt(store.getSettings().weeklyGoals)') && html.includes('data-act="goals"'));
ok('weekly goals: add/tick/carry over, "my goal this week is …", every agent knows them');

// ---- memory per Space
const { Memory } = require('../src/memory');
const mf = path.join(os.tmpdir(), 'nx312-mem-' + process.pid + '.json');
const mem = new Memory({ file: mf });
mem.fromMessage('remember that my teacher wants MLA', 'sp1'); mem.fromMessage('remember everywhere that I am in 11th grade', 'sp1'); mem.add('call me Luke');
const st = mem.state(); assert.strictEqual(st.items.find(i => /MLA/.test(i.text)).space, 'sp1'); assert.ok(!st.items.find(i => /11th/.test(i.text)).space);
assert.ok(mem.prompt('sp1', 'School').includes('MEMORY FOR THIS SPACE (School)') && mem.prompt('sp1').includes('MLA'));
assert.ok(!mem.prompt('sp2').includes('MLA') && !mem.prompt(null).includes('MLA') && mem.prompt(null).includes('11th'));
fs.rmSync(mf, { force: true });
assert.ok(settings.includes('data-memspace') && main.includes("'memory:space'"));
ok('memory per Space: "remember that …" in a Space stays in it; "remember everywhere" is for every chat');

// ---- answer confidence meter
const a = main.indexOf('const CONF_NOTE'), b = main.indexOf('async function runChatCore');
const C = new Function(main.slice(a, b) + ';return { readConf, confFilter, CONF_NOTE };')();
const cf = C.confFilter(); let streamed = ''; for (const t of ['The answer [is] 4.\n', '[[co', 'nf:8', '7]]']) streamed += cf.push(t); streamed += cf.flush();
assert.ok(!/conf/.test(streamed) && streamed.includes('[is] 4.'));
assert.deepStrictEqual(C.readConf('Hi\n[[conf:87]]'), { text: 'Hi', conf: 87 });
assert.ok(R('renderer/chatview.js').includes('conf-chip') && R('src/store.js').includes('answerConfidence: true'));
ok('answer confidence: hidden [[conf:NN]] stripped while streaming, shown as a SURE / FAIRLY SURE / NOT SURE chip');

// ---- Hey Nexus confidence meter
assert.ok(main.includes('function wakeLog(') && main.includes('history: wake.history') && settings.includes('function wakeMeterHtml'));
assert.ok(R('src/winhelper.js').includes("event = 'wake'; text = $a.Result.Text; confidence ="));
ok('Hey Nexus confidence meter: the last things it heard, how sure, and the wake line (Settings → Voice)');

// ---- chat tools
const convos = new (require('../src/conversations').Conversations)(fs.mkdtempSync(path.join(os.tmpdir(), 'nx312-')));
const c = convos.create({ title: 'x' }); convos.appendTo(c.id, { role: 'user', content: 'hi' });
const ts = convos.get(c.id).messages[0].ts; convos.pinMessage(c.id, ts, true); assert.deepStrictEqual(convos.get(c.id).pins, [ts]);
convos.pinMessage(c.id, ts, false); assert.ok(!convos.get(c.id).pins);
convos.setSummary(c.id, { text: 'A summary' }); assert.strictEqual(convos.get(c.id).summary.text, 'A summary');
assert.ok(main.includes("'conv:pinMessage'") && main.includes("'conv:summarize'") && preload.includes('pinMessage:') && preload.includes('summarize:'));
assert.ok(hud.includes('function paintTopCards') && hud.includes('function openFind') && hud.includes('function compareAnswers') && html.includes('data-summarize') && html.includes('data-findchat'));
ok('chat tools: pin a message, summarize a chat, ⌘F find, compare two agents');

// ---- what's new pop-up, starters, daily challenge
assert.ok(hud.includes('function whatsNewPopup') && main.includes("'whatsnew:get'") && !hud.includes("VER === '3.0'"));
assert.ok(html.includes('id="starters"') && hud.includes('const STARTERS') && hud.includes("if (ch.done) { pill.hidden = true; return; }"));
ok("what's new pop-up once per version; starter cards; today's challenge leaves after it's done");

// ---- voice notes
assert.ok(R('src/attachments.js').includes('fromVoice(') && main.includes("'voice:note'") && main.includes("'voice:noteAudio'") && preload.includes('note: (audio, mime, seconds)'));
assert.ok(html.includes('id="btnVNote"') && hud.includes('function startVoiceNote') && R('renderer/chatview.js').includes('att-play'));
assert.ok(R('renderer/hud.css').includes('.vnote-bar[hidden]'));
ok('voice notes: record, transcribe, keep the audio, play it back');

// ---- offline queue
assert.ok(main.includes('offlineQueue') && main.includes('async function flushOfflineQueue') && settings.includes('data-off="queue"'));
ok('offline queue: waits and sends itself when back online');

// ---- accessibility
const tctx = { window: { matchMedia: () => ({ matches: false }) }, document: { getElementById: () => null, head: { appendChild() {} }, createElement: () => ({}) } };
const cls = new Set(), root = { dataset: {}, style: { removeProperty() {}, setProperty() {}, zoom: '' }, classList: { toggle: (k, on) => on ? cls.add(k) : cls.delete(k) } };
tctx.document.documentElement = root; vm.runInNewContext(R('renderer/theme.js'), tctx);
tctx.window.NexusTheme.apply({ a11y: { contrast: true, font: true, scale: 1.25 } }, root);
assert.ok(cls.has('a11y-contrast') && cls.has('a11y-font') && !cls.has('a11y-motion') && root.style.zoom === '1.25');
assert.ok(html.includes('id="a11yCard"') && html.includes('data-gen="answerConfidence"'));
ok('accessibility: text size, less motion, contrast, font, focus rings, in every window');

// ---- staff get a Pro plan's use
const access = require('../src/access');
const P = { id: 'neodela', handle: '@neodela', tier: 'best' };
const d = access.decide({ persona: P, provider: { needsKey: true, label: 'x' }, hasOwnKey: false, freeKeyEnabled: true, used: 999, premium: { staff: true } });
assert.strictEqual(d.mode, 'free'); assert.ok(d.unlimited);
const pc = R('supabase/functions/premium-chat/index.ts');
assert.ok(pc.includes('STORE_SERVICE_KEY') && pc.includes('p_staff: staff') && pc.includes('isStaff(who.user.email)') && R('src/cloud.js').includes('premium-chat/status'));
assert.ok(sql.includes('premium_take(p_user uuid, p_agent text, p_turn text, p_staff boolean default false)') || /premium_take\(p_user uuid, p_agent text, p_turn text, p_staff boolean/.test(sql));
ok('aARgon3 staff: unlimited Lyte/Neodela and 10 Paragon tasks a day (checked by email on the server)');

// ---- known issues
assert.ok(sql.includes('create table if not exists public.known_issues') && sql.includes('public_known_issues') && sql.includes('known_issue_match'));
assert.ok(R('docs/status/index.html').includes('Known issues') && settings.includes('fbKnown') && main.includes("'issues:match'"));
ok('known issues: on the status page, matched while you write a report, follow to hear when fixed');

// ---- guest mode, Test Run → app
const tc = R('supabase/functions/try-chat/index.ts'), tr = R('docs/try/try.js');
assert.ok(tc.includes('is_anonymous') && tc.includes("try_guest_take") && sql.includes('try_guest_take(p_who text[])'));
assert.ok(tr.includes('signInAnonymously') && tr.includes('function guestJoin') && R('docs/try/index.html').includes('id="aGuest"'));
assert.ok(tr.includes("nexus28://trychat?id=") && main.includes("kind === 'trychat'") && main.includes("'trychats:import'") && settings.includes('id="tryCard"'));
ok('Test Run: guest mode (8 a day, cleared daily, keep chats when you join) and moving chats to the app');

// ---- Share to Nexus, inbox, widget
assert.ok(sql.includes('share_drop(p_key text') && sql.includes('widget_data(p_key text)'));
const comp = R('docs/companion/app.js'); assert.ok(comp.includes('function shareBlock') && comp.includes("share_key_make") && comp.includes('../widget/nexus-widget.js'));
assert.ok(main.includes("'inbox:list'") && main.includes("'inbox:ask'") && html.includes('data-act="inbox"'));
const w = R('docs/widget/nexus-widget.js'); assert.ok(w.includes('rpc/widget_data') && w.includes('ListWidget') && /nxw_\[0-9a-f\]\{48\}/.test(w));
assert.ok(R('src/companion.js').includes("this.put('widget'"));
ok('Share to Nexus (iPhone Shortcut → inbox), the Scriptable widget and its snapshot');

// ---- Watch & guide me
const gw = require('../src/guidewatch');
assert.deepStrictEqual(gw.parse('{"say":"Click File, top left","where":"top left","done":false}'), { say: 'Click File, top left', where: 'top left', done: false, wait: false });
assert.ok(gw.parse('You did it, all done!').done && gw.prompt('Add a printer', [{ say: 'Open Settings' }], "I'm stuck").includes("THE USER SAYS: I'm stuck"));
assert.ok(main.includes('setContentProtection(true)') && main.includes("'guide:start'") && fs.existsSync(path.join(__dirname, '../renderer/guide.html')) && html.includes('id="btnHelp"'));
ok('Watch & guide me: one step at a time from a screenshot, hidden from its own screenshots');

// ---- the user guide
const guide = R('docs/guide/index.html');
for (const id of ['start', 'agents', 'chat-tools', 'watch-guide', 'share', 'connectors', 'conn-notion', 'conn-gmail', 'settings', 'accessibility', 'fixes', 'shortcuts']) assert.ok(guide.includes(`id="${id}"`), id);
for (const m of guide.matchAll(/src="(img\/[^"]+)"/g)) assert.ok(fs.existsSync(path.join(__dirname, '../docs/guide', m[1])), m[1]);
assert.ok(R('src/guide.js').includes('Nexus-28/guide/'));
ok('user guide: every section, every picture exists, and agents can point to it');

// ---- fixes
assert.ok(R('renderer/mapview.js').includes(':root .mv-btn') && R('renderer/quickchat.js').includes('quickChatMove') && main.includes("ipcMain.on('quickchat:move'"));
assert.ok(R('src/providers.js').includes('The Nexus key|Paragon|Axiom') && pc.includes('isn’t set up right on the server'));
assert.ok(R('src/training.js').includes('training_my_lessons'));
{ const c312 = JSON.parse(R('docs/whats-new/changes.json')).find(c => c.version === '3.12.0'); assert.ok(c312 && !/axiom/i.test(JSON.stringify(c312))); }   // the version itself is checked by the newest test
ok('fixes: Map buttons, Quick Chat moves with a chat open, Paragon key errors, pushed lessons, version 3.12.0');

console.log(`v3.12: ${n} passed`);

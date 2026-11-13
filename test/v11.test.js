// v1.1 tests: per-window chats + reply versions, attachments (text/PDF → model content, images on the newest
// message only), calc/convert, export formats, screen-question detection, "ask Flash …" routing, image fallback.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };

(async () => {
  // ---- conversations: separate chats per window, versions
  const { Conversations } = require('../src/conversations');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx11-'));
  const c = new Conversations(dir);
  const hud = c.active(); c.append({ role: 'user', content: 'hud question' });
  const qa = c.appendTo('new', { role: 'user', content: 'quick ask question' });
  const qc = c.appendTo('new', { role: 'user', content: 'quick chat question' });
  assert.ok(qa.id !== hud.id && qc.id !== qa.id && c.load().activeId === hud.id);
  c.appendTo(qa.id, { role: 'user', content: 'follow-up' });
  assert.strictEqual(c.get(qa.id).messages.length, 2);
  assert.strictEqual(c.create().id !== hud.id, true);
  assert.ok(c.get(qa.id), 'other windows\' chats survive a new chat in the chat window');
  ok('chats: Quick Ask / Quick Chat write to their own chat; the chat window keeps its own');

  c.appendTo(qc.id, { role: 'assistant', persona: 'lyte', content: 'first' });
  c.addVersion(qc.id, { role: 'assistant', persona: 'flash', content: 'second' });
  c.addVersion(qc.id, { role: 'assistant', persona: 'lyte', content: 'third' });
  let last = c.get(qc.id).messages.at(-1);
  assert.deepStrictEqual([last.content, last.v, last.versions.map(v => v.content)], ['third', 2, ['first', 'second', 'third']]);
  c.setVersion(qc.id, 1); last = c.get(qc.id).messages.at(-1);
  assert.deepStrictEqual([last.content, last.persona, last.v, last.versions.length], ['second', 'flash', 1, 3]);
  assert.ok(!last.versions.some(v => v.versions), 'versions are not nested');
  ok('regenerate: every answer kept as a version; switching restores that answer and agent');

  // ---- attachments
  const { Attachments } = require('../src/attachments');
  const voice = require('../src/voice');
  const helper = new voice.Helper(path.join(__dirname, 'fake-helper.js'));
  const att = new Attachments({ dir, nativeImage: null, helper });
  fs.writeFileSync(path.join(dir, 'notes.md'), '# Notes\nThe launch code is 4471.');
  fs.writeFileSync(path.join(dir, 'paper.pdf'), '%PDF-1.4 fake');
  fs.writeFileSync(path.join(dir, 'blob.bin'), Buffer.from([0, 1, 2, 3, 0, 0]));
  const md = await att.fromPath(path.join(dir, 'notes.md'));
  const pdf = await att.fromPath(path.join(dir, 'paper.pdf'));
  await assert.rejects(att.fromPath(path.join(dir, 'blob.bin')), /isn't a text, image or PDF/);
  assert.deepStrictEqual([md.kind, pdf.kind, pdf.pages], ['text', 'pdf', 3]);
  assert.ok(/4471/.test(md.text) && /PDF TEXT/.test(pdf.text));
  // a fake stored screenshot (image bytes on disk + meta)
  fs.writeFileSync(att.file('ascreen1', '.png'), Buffer.from('PNGDATA'));
  att.save({ id: 'ascreen1', name: 'Safari — Homework.png', kind: 'screen', mime: 'image/png', ext: '.png', text: 'OCR: 2x', app: 'Safari', title: 'Homework' });
  const msgs = att.expand([
    { role: 'user', content: 'old', attachments: [{ id: 'ascreen1' }, { id: md.id }] },
    { role: 'assistant', content: 'ok' },
    { role: 'user', content: 'and this?', attachments: [{ id: 'ascreen1' }, { id: pdf.id }, { id: 'a../../etc' }] }
  ]);
  assert.ok(!msgs[0].images && /Screenshot of Safari — "Homework"\]/.test(msgs[0].content) && /4471/.test(msgs[0].content), 'older message: text only');
  assert.strictEqual(msgs[2].images.length, 1, 'newest message carries the image');
  assert.strictEqual(Buffer.from(msgs[2].images[0].data, 'base64').toString(), 'PNGDATA');
  assert.ok(/is attached\]\nText read from it:\nOCR: 2x/.test(msgs[2].content) && /PDF TEXT/.test(msgs[2].content) && msgs[2].content.endsWith('and this?'));
  assert.ok(!('attachments' in msgs[2]), 'attachment ids never reach the provider');
  helper.kill();
  ok('attachments: text/PDF read on this Mac, screen text + image sent (image only on newest message), bad ids ignored');

  // ---- providers: images in each wire format + text fallback for models without vision
  const providers = require('../src/providers');
  const seen = [];
  const srv = http.createServer((req, res) => {
    let raw = ''; req.on('data', d => raw += d); req.on('end', () => {
      const b = JSON.parse(raw); seen.push(b);
      const hasImg = JSON.stringify(b).includes('image_url');
      if (hasImg && /novision/.test(b.model)) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'This model does not support image input' } })); }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: hasImg ? 'saw image' : 'text only' } }] })}\n\ndata: [DONE]\n\n`);
    });
  }).listen(0);
  await new Promise(r => srv.on('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}/v1`;
  const imgMsg = [{ role: 'user', content: 'what is this', images: [{ mime: 'image/png', data: 'AAAA' }] }];
  let r = await providers.chat({ provider: 'ollama', baseUrl: base, model: 'llava', messages: imgMsg });
  assert.strictEqual(r.text, 'saw image');
  assert.deepStrictEqual(seen.at(-1).messages.at(-1).content.map(p => p.type), ['text', 'image_url']);
  r = await providers.chat({ provider: 'ollama', baseUrl: base, model: 'novision', messages: imgMsg });
  assert.ok(r.text === 'text only' && r.imagesDropped);
  srv.close();
  ok('images: OpenAI-style parts; a model without vision gets the same chat as text');

  // ---- calc / convert
  const q = require('../src/quickcalc');
  assert.strictEqual(q.quick('calc 2+2*7').text, '2+2*7 = **16**');
  assert.strictEqual(q.quick('calc 15% of 80').value, 12);
  assert.strictEqual(q.quick('calc 80 + 15%').value, 92);
  assert.strictEqual(q.quick('= (3+4)^2').value, 49);
  assert.ok(Math.abs(q.quick('calc sqrt(16) + 2pi').value - (4 + 2 * Math.PI)) < 1e-9);
  assert.ok(q.quick('calc 1/0').error && q.quick('calc process.exit()').error);
  assert.strictEqual(q.quick('convert 5mi to km').value, 8.04672);
  assert.ok(Math.abs(q.quick('convert 72 f to c').value - 22.2222) < 1e-3);
  assert.ok(/Can't convert mass to length/.test(q.quick('convert 5 kg to miles').text));
  assert.strictEqual(q.quick('what is 2+2'), null);
  ok('calc & convert: math, percentages, units, temperature; no eval; normal questions untouched');

  // ---- export
  const ex = require('../src/exporter');
  const P = [{ id: 'flash', name: "Nexus '28 Flash" }];
  const chat = { title: 'Trip: plan/1', messages: [{ role: 'user', content: 'plan **it**', ts: 1, attachments: [{ name: 'map.png', kind: 'image' }] }, { role: 'assistant', persona: 'flash', model: 'm', content: '# Day 1\n- **Beach**\n```\nx\n```', ts: 2 }] };
  assert.ok(ex.toMarkdown(chat, P).includes("### Nexus '28 Flash · m") && ex.toMarkdown(chat, P).includes('[Attachment: map.png]'));
  assert.ok(ex.toText(chat, P).includes('plan it') && !ex.toText(chat, P).includes('**'));
  assert.strictEqual(JSON.parse(ex.toJSON(chat, P)).messages[1].agent, "Nexus '28 Flash");
  const docx = await ex.toDocx(chat, P);
  assert.strictEqual(docx.slice(0, 2).toString(), 'PK');
  assert.ok(ex.toHTML(chat, P, s => `<p>${s}</p>`).includes('<h1>Trip: plan/1</h1>'));
  assert.strictEqual(ex.safeName(chat.title), 'Trip- plan-1');
  ok('export: Markdown, text, JSON, Word (.docx), printable HTML for PDF; safe file names');

  // ---- voice: screen questions + "ask Flash …"
  global.window = {};
  require('../renderer/chatctx.js');
  const C = window.NexusChat;
  for (const t of ["what's on my screen?", 'what am I looking at', 'explain this', 'what does this error mean', 'summarize this page', 'help me with this', 'read this'])
    assert.ok(C.screenIntent(t), t);
  for (const t of ['what is the weather', 'explain photosynthesis', 'tell me a joke', 'read me a story about dragons'])
    assert.ok(!C.screenIntent(t), t);
  assert.ok(C.lookAgain('look again') && C.lookAgain('what about now?') && !C.lookAgain('what about tomorrow'));
  assert.deepStrictEqual(C.spokenAgent("ask Flash what's on my screen"), { persona: 'flash', rest: "what's on my screen" });
  assert.strictEqual(C.spokenAgent('light the candle'), null);
  const api = C.toApiMessages([
    { role: 'user', content: 'calc 2+2', local: true }, { role: 'assistant', persona: 'flash', content: '4', local: true },
    { role: 'user', content: 'look', attachments: [{ id: 'a1', name: 'x', thumb: 'data:big' }] }], 'flash', []);
  assert.deepStrictEqual(api, [{ role: 'user', content: 'look', attachments: [{ id: 'a1' }] }]);
  ok('voice: screen questions detected, "look again" re-captures, "ask Flash …" routes; calc answers stay out of model context');

  console.log(`\n${n} v1.1 checks passed`);
})().catch(e => { console.error('FAIL', e); process.exit(1); });

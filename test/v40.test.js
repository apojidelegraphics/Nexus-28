// 4.0: Cirkts + the shop, profiles, friends, Spaces chat, the Apoji account, status links and Apoji-wide search; videos for
// every agent; the wake word; Write, Wrapped, widgets, N28C goals & reminders; new skins; and the screenshot fixes.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };
const main = R('main.js'), preload = R('preload.js'), hud = R('renderer/hud.js'), settings = R('renderer/settings.js'), sql = R('supabase/nexus-v4.0.sql');

(async () => {
  // ---------- Cirkts wallet (local and synced)
  const cos = require('../renderer/cosmetics');
  const { createCirkts } = require('../src/cirkts');
  for (const [id, cost] of Object.entries({ reactor: 100, ember: 900, hologram: 3000 })) assert.strictEqual(cos.item('skin:' + id).price, cost);
  for (const it of cos.CATALOG) assert.ok(sql.includes(`('${it.id}', '${it.kind}', '${it.name.replace(/'/g, "''")}', ${it.price}`), 'catalog in SQL: ' + it.id);
  let settingsStore = {}, points = 950, rpcs = [];
  const cloud = { session: null, rpc: async (fn, a) => { rpcs.push([fn, a]); if (fn === 'cirkts_sync') return { ok: true, earned: a.p_earned, spent: 0, owned: ['skin:reactor', 'skin:nebula', 'skin:pulse', 'skin:tide', 'skin:prism', 'skin:ember'] }; if (fn === 'cirkts_buy') return { ok: true, earned: 1000, spent: 150, owned: ['frame:neon'] }; return { ok: true }; } };
  const cz = createCirkts({ getSettings: () => settingsStore, setSettings: p => { settingsStore = { ...settingsStore, ...p }; }, earned: () => points, cloud, catalog: cos.CATALOG });
  let st = cz.state();
  assert.strictEqual(st.balance, 950);
  assert.ok(st.owned.includes('skin:ember') && !st.owned.includes('skin:pixel'), 'skins the points had unlocked are kept');
  assert.ok(cz.owns('skin:prism') && !cz.owns('skin:vortex'));
  assert.ok(!(await cz.buy('skin:hologram')).ok, 'cannot buy without enough');
  const b = await cz.buy('frame:neon'); assert.ok(b.ok && b.local && b.balance === 800);
  assert.ok(!(await cz.buy('frame:neon')).ok, 'no buying twice');
  assert.ok((await cz.equip({ frame: 'frame:neon', bio: 'hi' })).ok);
  assert.ok(!(await cz.equip({ frame: 'frame:prism' })).ok, 'cannot wear what you do not own');
  points = 1200; assert.strictEqual(cz.state().balance, 1050, 'earning keeps adding');
  cloud.session = { user: { id: 'u' } };
  await cz.sync(true);
  assert.ok(rpcs.some(([f, a]) => f === 'cirkts_sync' && a.p_earned === 1200));
  assert.ok(rpcs.some(([f, a]) => f === 'cirkts_buy' && a.p_item === 'frame:neon'), 'things bought before the account had a wallet are bought there too');
  assert.ok(!rpcs.some(([f, a]) => f === 'cirkts_buy' && /^skin:/.test(a.p_item)), 'kept skins are never charged for');
  assert.ok(main.includes("cirkts ? cirkts.owns('skin:' + id)") && main.includes('const shopThemeOk') && main.includes("if (patch.cirkts !== undefined)"));
  assert.ok(settings.includes('function renderProfile') && settings.includes("['profile', 'Cirkts shop'") && R('renderer/index.html').includes('id="tab-profile"') && R('renderer/theme.js').includes('shop-'));
  ok('Cirkts: points become a balance, kept skins, buy once, equip only what you own, sync with the account');

  // ---------- SQL: wallet, profiles, friends, Spaces chat, account, links, search
  for (const f of ['cirkts_sync(p_earned int)', 'cirkts_buy(p_item text)', 'profile_style_set(p_style jsonb)', 'friend_request(p_username text)', 'friend_block(p_user uuid', 'my_friends()', 'space_invite(p_space uuid, p_user uuid)', 'space_message_remove(p_id bigint)', 'apoji_public_profile(', 'apoji_link_code()', 'public_status_links()', 'apoji_search(p_q text']) assert.ok(sql.includes('function public.' + f), f);
  assert.ok(sql.includes('least(e, earned + 5000)') && sql.includes("select me, id, 0, 'kept' from cosmetics where kind = 'skin' and price <= e"));
  assert.ok(sql.includes("create policy sm_read on public.space_messages for select using (public.is_space_member(space_id) or public.is_admin())") && sql.includes('m.suspended_until'));
  assert.ok(sql.includes("f.status = 'blocked' and f.blocked_by = uid") && sql.includes("'space_message', 'profile'"));
  assert.ok(sql.includes('grant execute on function public.apoji_public_profile(text, text, text) to anon') && !/'email', p\.email|u\.email/.test(sql.slice(sql.indexOf('apoji_public_profile'))));
  ok('nexus-v4.0.sql: wallet rules, kept skins, members-only chat, blocking, reports, a public profile without email');

  const { createSocial } = require('../src/social');
  const calls = []; const soc = createSocial({ cloud: { session: { user: { id: 'u' } }, rpc: async (fn, a) => { calls.push(fn); if (fn === 'friend_request') return { ok: false, error: 'Nobody has that username.' }; return fn === 'apoji_search' ? [{ kind: 'person' }] : { ok: true }; } } });
  await assert.rejects(soc.request('@nobody'), /Nobody/);
  assert.deepStrictEqual(await soc.search('a'), []);
  assert.strictEqual((await soc.search('crew')).length, 1);
  await assert.rejects(async () => soc.invite('nope', 'x'), /Unknown Space/);
  assert.ok(R('src/sharedspaces.js').includes('async chatSend(') && R('renderer/study.js').includes("data-a=\"spTab\"") && R('renderer/study.js').includes('scReport') && R('renderer/people.js').includes('window.NexusPeople'));
  assert.ok(hud.includes("if (a === 'people') return people?.open();") && hud.includes('function apojiCommands') && preload.includes("search: q => call('apoji:search', q)"));
  assert.ok(R('docs/companion/app.js').includes('async function spaceChat(') && R('docs/companion/app.js').includes("sb.rpc('friend_request'") && R('docs/status/index.html').includes('public_status_links'));
  ok('People, Spaces chat (app and N28C), Apoji-wide search in ⌘K, status page links');

  // ---------- profile card rendering (shared by the app, N28C and Test Run)
  const html = cos.card({ username: 'luke', nickname: 'Luke', style: { frame: 'frame:crown', font: 'font:display', color: 'color:aurora', bio: '<b>x</b>', stats: { streak: 4 } } });
  assert.ok(html.includes('nxp-f-crown') && html.includes('nxp-crown') && html.includes('&lt;b&gt;x&lt;/b&gt;') && html.includes('day streak'));
  assert.ok(!/style="[^"]*"[^>]*"[^>]*>Luke/.test(cos.nameHtml('Luke', { font: 'font:display' })) && !cos.nameHtml('L', { font: 'font:serif' }).match(/style="[^"]*"[^"]*"[^>]*>/), 'font names do not break the style attribute');
  assert.ok(R('docs/companion/cosmetics.js').includes('NexusCosmetics') && R('docs/try/index.html').includes('cosmetics.js'));
  ok('profile cards: frames, fonts, colors, banners; escaped; shared with N28C and Test Run');

  // ---------- videos
  const video = require('../src/video');
  assert.strictEqual(video.siteOf('https://youtu.be/dQw4w9WgXcQ'), 'youtube');
  assert.strictEqual(video.siteOf('https://www.instagram.com/reel/Der7Ni4JkZx/?utm_source=ig'), 'instagram');
  assert.strictEqual(video.siteOf('https://www.instagram.com/someone/'), null);
  assert.strictEqual(video.siteOf('https://x.com/a/status/123'), 'x');
  assert.strictEqual(video.siteOf('https://cdn.example.com/clip.mp4'), 'file');
  assert.deepStrictEqual(video.videoLinks('watch https://youtu.be/abc12345 and https://example.com/page.'), ['https://youtu.be/abc12345']);
  assert.strictEqual(video.transcriptFromJson3({ events: [{ tStartMs: 0, segs: [{ utf8: 'Hello' }] }, { tStartMs: 40000, segs: [{ utf8: 'world' }] }] }), '[0:00] Hello [0:40] world');
  const fakeYT = async url => {
    if (url.includes('/watch?')) return { text: `<script>var ytInitialPlayerResponse = {"videoDetails":{"title":"Moon \\"facts\\"","author":"NASA","lengthSeconds":"75","shortDescription":"About the moon"},"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=x","languageCode":"en"}]}}};</script>` };
    if (url.includes('timedtext')) return { text: JSON.stringify({ events: [{ tStartMs: 0, segs: [{ utf8: 'The moon is far.' }] }] }) };
    throw new Error('unexpected ' + url);
  };
  const v = await video.info('https://www.youtube.com/watch?v=abc12345', { fetchText: fakeYT });
  assert.strictEqual(v.title, 'Moon "facts"'); assert.strictEqual(v.duration, 75); assert.ok(v.transcript.includes('The moon is far.') && v.thumb.includes('abc12345'));
  const d = video.describe({ ...v, thumbAttached: true });
  assert.ok(d.includes('[VIDEO · YouTube]') && d.includes('Length: 1:15') && d.includes('thumbnail is attached'));
  const ig = await video.info('https://www.instagram.com/reel/Der7Ni4JkZx/', { fetchText: async () => { throw new Error('HTTP 401'); } });
  assert.ok(/attach/i.test(ig.note), 'Instagram behind a login says to attach the video');
  assert.ok(main.includes('async function addVideoLinks(') && main.includes('function watchVideo(file)') && R('src/attachments.js').includes("if (a.kind === 'video') return") && fs.existsSync(path.join(__dirname, '..', 'renderer', 'videoproc.js')));
  assert.ok(R('src/tools.js').includes("video.siteOf(String(args.url || ''))") && !R('src/video.js').includes('facebookexternalhit'));
  ok('videos: links (YouTube transcripts, captions, thumbnails), files (stills + speech), fetch_url, Instagram fallback');

  // ---------- the rest of the features
  assert.ok(main.includes('WAKE_NAME_RE') && R('native/NexusCore.swift').includes('heyOrName') && settings.includes('data-voice="wakePhrase"'));
  const w = require('../src/writer');
  assert.ok(w.ASIDE.has('outline') && w.TEMPLATES.essay && w.parseSuggestions('{"aside":"- a"}', 'x').aside === '- a');
  const docs = new w.Docs(fs.mkdtempSync(path.join(require('os').tmpdir(), 'nxw-')));
  const dd = docs.put({ title: 'T', text: 'one' }); docs.put({ id: dd.id, text: 'one two' });
  assert.strictEqual(docs.versions(dd.id).length, 1); assert.strictEqual(docs.restore(dd.id, 0).text, 'one');
  assert.ok(R('renderer/write.js').includes("data-tool=\"history\"") && main.includes("['md', 'txt', 'docx', 'pdf']"));
  const wr = require('../src/wrapped').build({ list: [{ title: 'a', messages: [{ role: 'user', content: 'hello world', ts: Date.now() - 864e5 }, { role: 'assistant', persona: 'flash', content: 'x', ts: Date.now() - 864e5 + 1, activity: [{ tool: 'web_search', status: 'ok' }] }, { role: 'user', content: 'world again', ts: Date.now() }, { role: 'user', content: 'world', ts: Date.now() }] }] });
  assert.ok(wr.dayMap.length >= 365 && wr.did.searches === 1 && wr.wordOfYear === 'world');
  assert.ok(hud.includes('YOUR YEAR IN DAYS') && hud.includes('wrAuto') && !/[❓🎙🌙🔥]/u.test(hud.slice(hud.indexOf('function wrSlides'), hud.indexOf('async function openWrapped'))));
  assert.ok(main.includes("ipcMain.handle('deskw:action'") && R('renderer/deskwidgets.js').includes('data-grade') && R('docs/companion/app.js').includes("'goal_toggle'") && R('src/companion.js').includes("case 'reminder_snooze'"));
  for (const k of ['ember', 'crystal', 'quasar', 'glyph']) assert.ok(R('renderer/orb.js').includes(`skin === '${k}'`) && main.includes(k + ':'), k);
  ok('wake word "Nexus", Write tools + history, Wrapped, interactive widgets, N28C goals & reminders, new skins');

  // ---------- fixes from the screenshots
  assert.ok(main.includes("a model that copies the placeholder") && R('renderer/chatview.js').includes("conf\\s*:[^\\]\\n]{0,8}\\]\\]"));
  assert.ok(R('src/providers.js').includes('require_parameters: true') && R('src/providers.js').includes('is asked once more'));
  assert.ok(R('renderer/hud.css').includes('html.win .shell') && R('renderer/hud.css').includes('.banners::before') && !R('renderer/index.html').includes('class="corner tl"'));
  assert.ok(hud.includes("legacyOpen == null ? legacyActive : legacyOpen") && main.includes("ipcMain.handle('cloud:refreshAll'") && main.includes("ipcMain.handle('conv:cleanup'"));
  assert.ok(R('src/voice.js').includes("--data-format=LEI16@24000") && R('docs/try/try.css').includes('.conv-note.temp'));
  ok('fixes: hidden [[conf]] tags, empty answers retried, tools on the free router, Windows see-through, banners, top bar, classic list, refresh, clean up, smoother read-aloud, temporary chat');

  const ch = JSON.parse(R('docs/whats-new/changes.json'))[0];
  assert.strictEqual(ch.version, require('../package.json').version);
  assert.ok(!/axiom/i.test(JSON.stringify(ch)) && !/\p{Extended_Pictographic}/u.test(ch.highlights.join(' ')));
  ok('version ' + ch.version + ' and its release notes');
  console.log(`v4.0: ${n} passed`);
})().catch(e => { console.error(e); process.exit(1); });

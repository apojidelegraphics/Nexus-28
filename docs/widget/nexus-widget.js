// Nexus '28 widgets for Scriptable (iPhone and iPad). 3.13
// Setup: install Scriptable, make a widget key in N28C → You → Home-screen widget, paste this whole file into a new
// Scriptable script named "Nexus", add a Scriptable widget to your home screen (or lock screen), pick Script: Nexus and
// put your key in Parameter. To pick a style, add it after the key with a space:
//   nxw_…            Overview (streak, points, goals, challenge, next reminder)
//   nxw_… goals      Weekly goals, ticked off as you go
//   nxw_… streak     A big streak ring with your best
//   nxw_… agenda     Your next reminders and cards to review
// Lock screen: the round widget shows your streak, the wide one your next reminder or goal, the inline one a short line.
// The key can only read these few numbers, never your chats. Remove it any time in N28C → You.
const URL_ = 'https://yzbnxpkuhlxsuwzbjifx.supabase.co';
const PUB = 'sb_publishable_LY-EZORCvEQqW6AeQC5a8w_Z7wmeyjn';
const ACCENT = new Color('#3dffa0'), BG = new Color('#04100b'), BG2 = new Color('#0b1f17'), DIM = new Color('#86b3a0'), TEXT = new Color('#e2fff1'), WARN = new Color('#ffd36b');
const [key = '', style = 'overview'] = String(args.widgetParameter || '').trim().split(/\s+/);
const family = config.widgetFamily || 'medium';

async function load() {
  if (!/^nxw_[0-9a-f]{48}$/.test(key)) return { ok: false, error: 'Add your widget key: press and hold this widget → Edit Widget → Parameter.' };
  const r = new Request(`${URL_}/rest/v1/rpc/widget_data`);
  r.method = 'POST'; r.headers = { apikey: PUB, 'Content-Type': 'application/json' }; r.body = JSON.stringify({ p_key: key }); r.timeoutInterval = 12;
  try { const j = await r.loadJSON(); if (j && j.ok) { Keychain.set('nexus-widget-cache', JSON.stringify(j)); return j; } return j || { ok: false, error: 'No answer.' }; }
  catch (e) { const c = Keychain.contains('nexus-widget-cache') ? JSON.parse(Keychain.get('nexus-widget-cache')) : null; return c ? { ...c, stale: true } : { ok: false, error: 'Offline. It updates when you are back online.' }; }
}
const time = ms => { const d = new Date(ms), f = new DateFormatter(); if (d.toDateString() === new Date().toDateString()) { f.useShortTimeStyle(); f.useNoDateStyle(); } else { f.dateFormat = 'EEE h:mm a'; } return f.string(d); };
function text(stack, t, size, color = TEXT, weight = 'regular') {
  const x = stack.addText(String(t)); x.font = weight === 'bold' ? Font.boldSystemFont(size) : weight === 'mono' ? Font.semiboldMonospacedSystemFont(size) : Font.systemFont(size);
  x.textColor = color; x.lineLimit = 1; x.minimumScaleFactor = 0.6; return x;
}
function icon(stack, name, size, color = ACCENT) { const s = SFSymbol.named(name); if (!s) return; s.applyFont(Font.systemFont(size)); const i = stack.addImage(s.image); i.imageSize = new Size(size, size); i.tintColor = color; return i; }
function row(w, sym, label, color = TEXT, size = 12) { const r = w.addStack(); r.centerAlignContent(); r.spacing = 6; icon(r, sym, size, color === TEXT ? ACCENT : color); text(r, label, size, color); return r; }
function header(w, right) { const h = w.addStack(); h.centerAlignContent(); text(h, "NEXUS '28", 10, ACCENT, 'mono'); h.addSpacer(); if (right) text(h, right, 10, DIM); return h; }
function ring(pct, size, line, label, sub) {   // a progress ring drawn with DrawContext
  const c = new DrawContext(); c.size = new Size(size, size); c.opaque = false; c.respectScreenScale = true;
  const cx = size / 2, r = size / 2 - line, steps = 90;
  const arc = (from, to, color) => { const p = new Path(); for (let i = 0; i <= steps; i++) { const a = (-90 + 360 * (from + (to - from) * i / steps)) * Math.PI / 180, x = cx + r * Math.cos(a), y = cx + r * Math.sin(a); i ? p.addLine(new Point(x, y)) : p.move(new Point(x, y)); } c.addPath(p); c.setStrokeColor(color); c.setLineWidth(line); c.strokePath(); };
  arc(0, 1, new Color('#1d3a2e')); if (pct > 0) arc(0, Math.min(1, pct), ACCENT);
  c.setTextAlignedCenter(); c.setFont(Font.boldSystemFont(size * 0.26)); c.setTextColor(TEXT); c.drawTextInRect(String(label), new Rect(0, size * 0.3, size, size * 0.32));
  if (sub) { c.setFont(Font.systemFont(size * 0.1)); c.setTextColor(DIM); c.drawTextInRect(sub, new Rect(0, size * 0.6, size, size * 0.15)); }
  return c.getImage();
}

const j = await load(), d = (j && j.data) || {}, g = d.goals || {};
const w = new ListWidget(); w.url = 'https://apojidelegraphics.github.io/Nexus-28/companion/';
const lock = family.startsWith('accessory');
if (!lock) { const gr = new LinearGradient(); gr.colors = [BG2, BG]; gr.locations = [0, 1]; w.backgroundGradient = gr; w.setPadding(12, 14, 12, 14); }

if (!j.ok) { if (!lock) header(w); w.addSpacer(4); text(w, lock ? 'Add key' : j.error || 'Something went wrong.', lock ? 11 : 12, lock ? Color.white() : TEXT).lineLimit = 4; }
else if (family === 'accessoryCircular') { const img = w.addImage(ring((d.streak || 0) / Math.max(7, d.best || 7), 60, 6, d.streak || 0, 'days')); img.centerAlignImage(); }
else if (family === 'accessoryInline') { text(w, `${d.streak || 0} day streak · ${g.total ? `${g.done}/${g.total} goals` : `${d.points || 0} pts`}`, 12, Color.white()); }
else if (family === 'accessoryRectangular') {
  const r0 = (d.reminders || [])[0];
  text(w, "NEXUS '28", 10, Color.white(), 'mono');
  if (r0) { text(w, time(r0.at), 13, Color.white(), 'bold'); text(w, r0.title, 12, Color.white()); }
  else if (g.next) { text(w, `Goal ${g.done}/${g.total}`, 13, Color.white(), 'bold'); text(w, g.next, 12, Color.white()); }
  else { text(w, `${d.streak || 0} day streak`, 13, Color.white(), 'bold'); text(w, `${(d.points || 0).toLocaleString()} points`, 12, Color.white()); }
}
else if (style === 'streak') {
  header(w, j.inbox ? `${j.inbox} in inbox` : '');
  w.addSpacer();
  const s = w.addStack(); s.addSpacer(); s.addImage(ring((d.streak || 0) / Math.max(7, d.best || 7), family === 'small' ? 92 : 110, 9, d.streak || 0, 'DAY STREAK')); s.addSpacer();
  w.addSpacer(); const f = w.addStack(); f.addSpacer(); text(f, `Best ${d.best || d.streak || 0} · ${(d.points || 0).toLocaleString()} pts`, 10, DIM); f.addSpacer();
}
else if (style === 'goals') {
  header(w, g.total ? `${g.done}/${g.total} this week` : 'This week');
  w.addSpacer(6);
  if (!g.total) text(w, 'No weekly goals yet. Add some in Nexus: menu, then Weekly goals.', 12, DIM).lineLimit = 3;
  for (const it of (g.items || []).slice(0, family === 'large' ? 6 : family === 'small' ? 3 : 4)) row(w, it.done ? 'checkmark.circle.fill' : 'circle', it.text, it.done ? DIM : TEXT, family === 'small' ? 11 : 12);
  w.addSpacer();
  if (g.total) text(w, g.done === g.total ? 'All done this week' : `${g.total - g.done} to go`, 10, g.done === g.total ? ACCENT : DIM);
}
else if (style === 'agenda') {
  header(w, d.due ? `${d.due} cards due` : '');
  w.addSpacer(6);
  const list = (d.reminders || []).slice(0, family === 'large' ? 4 : family === 'small' ? 2 : 3);
  if (!list.length) text(w, 'Nothing coming up. Say "remind me…" in any chat.', 12, DIM).lineLimit = 3;
  for (const r of list) { const s = w.addStack(); s.layoutVertically(); text(s, time(r.at), 10, ACCENT, 'mono'); text(s, r.title, family === 'small' ? 11 : 13); w.addSpacer(4); }
  w.addSpacer();
  if (d.due && family !== 'small') row(w, 'rectangle.stack', `${d.due} card${d.due === 1 ? '' : 's'} to review`, TEXT, 11);
}
else {   // overview
  header(w, j.inbox ? `${j.inbox} in inbox` : '');
  w.addSpacer(6);
  const top = w.addStack(); top.centerAlignContent(); top.spacing = 10;
  top.addImage(ring((d.streak || 0) / Math.max(7, d.best || 7), family === 'small' ? 52 : 58, 5, d.streak || 0, 'DAYS'));
  const nums = top.addStack(); nums.layoutVertically(); text(nums, (d.points || 0).toLocaleString(), family === 'small' ? 18 : 22, TEXT, 'bold'); text(nums, 'points', 10, DIM);
  w.addSpacer(6);
  if (g.total) row(w, 'target', family === 'small' ? `${g.done}/${g.total} goals` : `${g.done}/${g.total} goals${g.next ? ' · ' + g.next : ''}`);
  if (d.challenge) row(w, d.challenge.done ? 'checkmark.seal.fill' : 'star', d.challenge.done ? 'Challenge done' : `${d.challenge.text} (${d.challenge.progress || 0}/${d.challenge.n || 1})`, d.challenge.done ? ACCENT : TEXT);
  if (family !== 'small') {
    if (d.reminder) row(w, 'alarm', `${time(d.reminder.at)} · ${d.reminder.title}`, WARN);
    if (d.due) row(w, 'rectangle.stack', `${d.due} card${d.due === 1 ? '' : 's'} to review`);
  }
  if (family === 'large') { w.addSpacer(8); for (const it of (g.items || []).slice(0, 5)) row(w, it.done ? 'checkmark.circle.fill' : 'circle', it.text, it.done ? DIM : TEXT, 11); }
  w.addSpacer();
  text(w, j.stale ? 'Offline · last known' : (d.at ? 'Updated ' + time(d.at) : 'Open Nexus on your computer to fill this in'), 9, DIM);
}
w.refreshAfterDate = new Date(Date.now() + 15 * 60e3);
if (config.runsInWidget || config.runsInAccessoryWidget) Script.setWidget(w);
else await (family === 'small' ? w.presentSmall() : family === 'large' ? w.presentLarge() : w.presentMedium());
Script.complete();

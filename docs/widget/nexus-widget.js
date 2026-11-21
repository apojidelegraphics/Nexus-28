// Nexus '28 home-screen widget for Scriptable (iPhone / iPad). 3.12
// 1. Install Scriptable from the App Store.  2. In N28C → You → Home-screen widget, tap "Make a widget key" and copy it.
// 3. In Scriptable, tap +, paste this whole file, and name it "Nexus".  4. Long-press your home screen → + → Scriptable,
//    pick the small or medium size, tap it, choose Script: Nexus, and paste your widget key into "Parameter".
// The key can only read these few numbers (never your chats). Remove it any time in N28C → You.
const URL_ = 'https://yzbnxpkuhlxsuwzbjifx.supabase.co';
const PUB = 'sb_publishable_LY-EZORCvEQqW6AeQC5a8w_Z7wmeyjn';
const ACCENT = new Color('#3dffa0'), BG = new Color('#04100b'), DIM = new Color('#7fae98'), TEXT = new Color('#e8f0ff');
const key = (args.widgetParameter || '').trim();

async function load() {
  if (!/^nxw_[0-9a-f]{48}$/.test(key)) return { ok: false, error: 'Add your widget key: long-press this widget → Edit Widget → Parameter.' };
  const r = new Request(`${URL_}/rest/v1/rpc/widget_data`);
  r.method = 'POST'; r.headers = { apikey: PUB, 'Content-Type': 'application/json' }; r.body = JSON.stringify({ p_key: key }); r.timeoutInterval = 12;
  try { const j = await r.loadJSON(); if (j && j.ok) { Keychain.set('nexus-widget-cache', JSON.stringify(j)); return j; } return j || { ok: false, error: 'No answer.' }; }
  catch (e) { const c = Keychain.contains('nexus-widget-cache') ? JSON.parse(Keychain.get('nexus-widget-cache')) : null; return c ? { ...c, stale: true } : { ok: false, error: 'Offline. It updates when you are back online.' }; }
}
function line(w, text, size, color, bold) { const t = w.addText(String(text)); t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size); t.textColor = color; t.lineLimit = 1; t.minimumScaleFactor = 0.7; return t; }
function when(ms) { const d = new Date(ms), now = new Date(), f = new DateFormatter(); f.useShortTimeStyle(); const sameDay = d.toDateString() === now.toDateString(); if (sameDay) return f.string(d); f.useShortDateStyle(); return f.string(d); }

const j = await load(), size = config.widgetFamily || 'medium';
const w = new ListWidget(); w.backgroundColor = BG; w.setPadding(12, 14, 12, 14); w.url = 'https://apojidelegraphics.github.io/Nexus-28/companion/';
const head = w.addStack(); head.centerAlignContent(); line(head, "NEXUS '28", 10, ACCENT, true); head.addSpacer();
if (!j.ok) { w.addSpacer(6); line(w, j.error || 'Something went wrong.', 12, TEXT); }
else {
  const d = j.data || {};
  if (j.inbox) line(head, `📥 ${j.inbox}`, 10, ACCENT, true);
  w.addSpacer(6);
  const top = w.addStack(); top.centerAlignContent();
  line(top, `🔥 ${d.streak || 0}`, size === 'small' ? 18 : 22, TEXT, true); top.addSpacer(10); line(top, `${(d.points || 0).toLocaleString()} pts`, 13, DIM);
  w.addSpacer(4);
  if (d.goals && d.goals.total) line(w, `◎ ${d.goals.done}/${d.goals.total} goals${size !== 'small' && d.goals.next ? ' · next: ' + d.goals.next : ''}`, 12, TEXT);
  if (d.challenge) line(w, `${d.challenge.done ? '✓' : '★'} ${d.challenge.done ? 'Challenge done' : d.challenge.text + ` (${d.challenge.progress || 0}/${d.challenge.n || 1})`}`, 12, d.challenge.done ? ACCENT : TEXT);
  if (size !== 'small') {
    if (d.reminder) line(w, `⏰ ${when(d.reminder.at)} · ${d.reminder.title}`, 12, TEXT);
    if (d.due) line(w, `🃏 ${d.due} card${d.due === 1 ? '' : 's'} to review`, 12, TEXT);
  }
  w.addSpacer();
  line(w, j.stale ? 'Offline · last known' : (d.at ? 'Updated ' + when(d.at) : 'Open Nexus on your computer to fill this in'), 9, DIM);
}
w.refreshAfterDate = new Date(Date.now() + 15 * 60e3);
if (config.runsInWidget) Script.setWidget(w); else await w[size === 'small' ? 'presentSmall' : 'presentMedium']();
Script.complete();

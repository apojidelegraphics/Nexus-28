// 4.2.0 Share a chat as a link: a read-only copy on the Nexus website (docs/share/) that anyone with the link can open.
// Only the words are shared: who said what, which agent, and when. Never pictures, files, hidden notes or memory.
// Used by the Mac/Windows app (main.js), and the same rules are in N28C and Test Run.
'use strict';
const SHARE_BASE = 'https://apojidelegraphics.github.io/Nexus-28/share/';
const strip = t => String(t || '')
  .replace(/\[\[conf:\d+\]\]/g, '')                    // hidden confidence tags
  .replace(/\[\[HANDOFF:[^\]]*\]\]/g, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .trim();
// messages → what the link keeps (at most 200, newest kept, each at most 40,000 characters)
function shareMessages(messages = []) {
  return (messages || []).filter(m => m && (m.role === 'user' || m.role === 'assistant') && !m.error && !m.hidden && strip(m.content))
    .map(m => ({ role: m.role, content: strip(m.content).slice(0, 40000), agent: m.role === 'assistant' ? String(m.persona || m.agent || '').slice(0, 40) : '', ts: +m.ts || null }))
    .slice(-200);
}
const shareUrl = id => SHARE_BASE + '?c=' + encodeURIComponent(id);
module.exports = { shareMessages, shareUrl, SHARE_BASE, strip };

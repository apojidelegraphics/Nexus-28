#!/usr/bin/env node
// Builds docs/whats-new/feed.xml (RSS 2.0) from docs/whats-new/changes.json. Run after editing changes.json:
//   node scripts/build-feed.js        (npm test checks that the feed is in sync)
const fs = require('fs'), path = require('path');
const SITE = 'https://apojidelegraphics.github.io/Nexus-28';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function build(list) {
  const items = list.slice(0, 30).map(r => {
    const html = `<ul>${(r.highlights || []).map(h => `<li>${esc(h)}</li>`).join('')}</ul>`;
    return `  <item>
    <title>${esc(`Nexus '28 ${r.version}: ${r.title}`)}</title>
    <link>${SITE}/whats-new/#v${esc(r.version)}</link>
    <guid isPermaLink="false">nexus28-${esc(r.version)}</guid>
    <pubDate>${new Date(r.date + 'T17:00:00Z').toUTCString()}</pubDate>
    <description>${esc(html)}</description>
  </item>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>Nexus '28: What's new</title>
  <link>${SITE}/whats-new/</link>
  <atom:link href="${SITE}/whats-new/feed.xml" rel="self" type="application/rss+xml"/>
  <description>Release notes for Nexus '28 and N28C.</description>
  <language>en-us</language>
${items}
</channel>
</rss>
`;
}
const dir = path.join(__dirname, '..', 'docs', 'whats-new');
if (require.main === module) { fs.writeFileSync(path.join(dir, 'feed.xml'), build(JSON.parse(fs.readFileSync(path.join(dir, 'changes.json'), 'utf8')))); console.log('feed.xml written'); }
module.exports = { build };

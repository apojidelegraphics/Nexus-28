// Update checker: compares this build with the latest GitHub release and links to the download.
// It never downloads or installs anything by itself.
const REPO = 'apojidelegraphics/Nexus-28';

function parse(v) {
  const m = String(v || '').trim().replace(/^v/i, '').match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?/);
  if (!m) return null;
  return { nums: [+m[1], +(m[2] || 0), +(m[3] || 0)], pre: m[4] || '' };
}
// > 0 when a is newer than b
function compare(a, b) {
  const x = parse(a), y = parse(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) if (x.nums[i] !== y.nums[i]) return x.nums[i] - y.nums[i];
  if (x.pre && !y.pre) return -1;           // 1.0.0-beta < 1.0.0
  if (!x.pre && y.pre) return 1;
  return x.pre.localeCompare(y.pre, 'en', { numeric: true });
}

// prerelease: true (beta testers / admins) → the newest release including betas (tags like v1.8.0-beta.1).
async function checkLatest({ current, repo = REPO, base = 'https://api.github.com', signal, prerelease = false } = {}) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'Nexus-28-Desktop' };
  let r;
  if (prerelease) {
    const res = await fetch(`${base}/repos/${repo}/releases?per_page=15`, { signal, headers });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const list = (await res.json()).filter(x => !x.draft);
    r = list.sort((a, b) => compare(String(b.tag_name).replace(/^v/i, ''), String(a.tag_name).replace(/^v/i, '')))[0];
    if (!r) return { current, latest: null, newer: false, url: `https://github.com/${repo}/releases` };
  } else {
    const res = await fetch(`${base}/repos/${repo}/releases/latest`, { signal, headers });
    if (res.status === 404) return { current, latest: null, newer: false, url: `https://github.com/${repo}/releases` };
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    r = await res.json();
  }
  const latest = String(r.tag_name || r.name || '').replace(/^v/i, '');
  const assets = r.assets || [];
  const pick = re => assets.find(a => re.test(a.name))?.browser_download_url;
  return {
    current, latest,
    newer: compare(latest, current) > 0,
    name: r.name || `v${latest}`,
    notes: String(r.body || '').slice(0, 1200),
    url: r.html_url || `https://github.com/${repo}/releases/latest`,
    download: (process.arch === 'arm64' ? pick(/arm64.*\.dmg$/i) : pick(/x64.*\.dmg$/i)) || pick(/\.dmg$/i) || pick(/\.zip$/i) || null,
    publishedAt: r.published_at || null,
    prerelease: !!r.prerelease
  };
}

module.exports = { checkLatest, compare, REPO };

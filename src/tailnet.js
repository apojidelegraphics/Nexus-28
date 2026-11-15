// Tailscale on this Mac (v2.3): find the CLI, read its status, and put a local server on your tailnet with
// "tailscale serve" (a real HTTPS certificate, reachable only from your own devices).
//   The Mac app's own binary doubles as the CLI only when told to (TAILSCALE_BE_CLI=1). /usr/local/bin/tailscale
//   exists if you picked "Install CLI" in Tailscale's settings; Homebrew puts it in /opt/homebrew/bin.
const fs = require('fs');
const { execFile } = require('child_process');

const CLI_PATHS = ['/usr/local/bin/tailscale', '/opt/homebrew/bin/tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
  `${process.env.HOME || ''}/Applications/Tailscale.app/Contents/MacOS/Tailscale`, '/usr/bin/tailscale'];

function createTailnet({ cli: fixed = null, run = null } = {}) {
  let cli = fixed;
  const find = () => cli || (cli = CLI_PATHS.find(p => { try { return fs.statSync(p).isFile(); } catch { return false; } }) || 'tailscale');
  const exec = run || (args => new Promise(res => execFile(find(), args, { timeout: 10000, env: { ...process.env, TAILSCALE_BE_CLI: '1', PATH: (process.env.PATH || '') + ':/opt/homebrew/bin:/usr/local/bin' } },
    (err, out, errOut) => res({ ok: !err, out: String(out || ''), err: String(errOut || err?.message || '') }))));
  const detail = r => `${find()} → ${(r.err || r.out || 'no output').trim().split('\n').slice(-2).join(' ').slice(0, 220)}`;

  async function status() {
    const r = await exec(['status', '--json']);
    if (!r.ok && /ENOENT|not found/i.test(r.err)) { if (!fixed) cli = null; return { installed: false, running: false, error: 'Couldn’t find Tailscale on this Mac.', detail: detail(r) }; }
    let j = null; try { j = JSON.parse(r.out.slice(r.out.indexOf('{'))); } catch {}
    if (!j) { if (!fixed) cli = null; return { installed: true, running: false, error: 'Tailscale didn’t answer. Make sure it’s connected in the menu bar.', detail: detail(r) }; }
    const self = j.Self || {}, user = (j.User || {})[self.UserID] || {};
    const st = { installed: true, running: j.BackendState === 'Running', dnsName: String(self.DNSName || '').replace(/\.$/, ''), login: user.LoginName || '',
      https: Array.isArray(j.CertDomains) && j.CertDomains.length > 0, error: '', detail: find() };
    if (!st.running) st.error = j.BackendState === 'NeedsLogin' ? 'Sign in to Tailscale on this Mac.' : 'Tailscale is off. Turn it on from the menu bar.';
    else if (!st.https) st.error = 'Turn on HTTPS Certificates in the Tailscale admin console → DNS.';
    return st;
  }
  async function serve(httpsPort, localPort) { const r = await exec(['serve', '--bg', `--https=${httpsPort}`, `http://127.0.0.1:${localPort}`]); return { ok: r.ok, error: r.ok ? '' : 'tailscale serve: ' + (r.err.trim().split('\n').pop() || 'failed').slice(0, 200) }; }
  async function unserve(httpsPort) { const r = await exec(['serve', `--https=${httpsPort}`, 'off']); return r.ok; }
  return { status, serve, unserve, find };
}
module.exports = { createTailnet, CLI_PATHS };

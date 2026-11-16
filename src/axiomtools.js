// Axiom's own tools (v2.9, Apex tier only). Four kits:
//   Mac power · Dev · Web & research · Nexus internals (the owner account only)
// Anything that changes something is `confirm: true`, so Nexus shows an approval card first (what, where, the full text).
// Read-only tools run straight away. Nothing here runs for any other agent.
//   execute(name, args, deps) deps: { run(cmd, args, opts), web, axiomData, cloud, getKey, runJS, owner: () => bool, home }
const fs = require('fs');
const os = require('os');
const path = require('path');

const clip = (s, n = 12000) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n) + '\n…[truncated]' : s; };
const str = (v, n = 4000) => String(v ?? '').trim().slice(0, n);
const asq = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');      // AppleScript string
const REPO = /^[\w.-]+\/[\w.-]+$/;

const obj = (props, required = []) => ({ type: 'object', properties: props, required });
const S = d => ({ type: 'string', description: d }), I = d => ({ type: 'integer', description: d });

const DEFS = {
  // ---------- Mac power tools
  notes_search: { kit: 'mac', description: 'Search Apple Notes by words in the title or text. Returns matching note titles and a preview.', parameters: obj({ query: S('Words to find') }, ['query']) },
  notes_read: { kit: 'mac', description: 'Read one Apple Note by its exact title (from notes_search).', parameters: obj({ title: S('Exact note title') }, ['title']) },
  notes_create: { kit: 'mac', confirm: true, description: 'Create a new Apple Note.', parameters: obj({ title: S('Title'), body: S('Text of the note (plain text; new lines are kept)') }, ['title', 'body']) },
  mail_draft: { kit: 'mac', confirm: true, description: 'Open a new email draft in Apple Mail for the user to review and send themselves. Never sends.', parameters: obj({ to: S('Email address(es), comma separated'), subject: S('Subject'), body: S('Email text') }, ['subject', 'body']) },
  imessage_send: { kit: 'mac', confirm: true, description: 'Send an iMessage/SMS through the Messages app. The user sees the exact recipient and text and must approve.', parameters: obj({ to: S('Phone number or email of the recipient'), text: S('Message text') }, ['to', 'text']) },
  finder_list: { kit: 'mac', description: "List a folder's contents (names, sizes, dates) inside the user's home folder.", parameters: obj({ path: S('Folder, e.g. ~/Downloads'), limit: I('Max entries (default 60)') }, ['path']) },
  finder_move: { kit: 'mac', confirm: true, description: "Move or rename files/folders inside the user's home folder (to organize them). Never overwrites; never deletes. Folders that don't exist yet are created.", parameters: obj({ moves: { type: 'array', description: 'Up to 50 moves', items: obj({ from: S('Current path'), to: S('New path (full path including the file name)') }, ['from', 'to']) } }, ['moves']) },
  run_applescript: { kit: 'mac', confirm: true, description: 'Run an AppleScript to do something on the Mac no other tool covers. The user sees the whole script and must approve. Prefer the specific tools when they fit.', parameters: obj({ script: S('AppleScript source'), why: S('One sentence: what it does') }, ['script', 'why']) },

  // ---------- Dev tools
  github_repos: { kit: 'dev', description: "List the user's GitHub repositories (needs their GitHub token in Settings → Axiom).", parameters: obj({}) },
  github_issues: { kit: 'dev', description: 'List issues in a GitHub repository.', parameters: obj({ repo: S('owner/name'), state: { type: 'string', enum: ['open', 'closed', 'all'] } }, ['repo']) },
  github_create_issue: { kit: 'dev', confirm: true, description: 'Open a new issue in a GitHub repository.', parameters: obj({ repo: S('owner/name'), title: S('Title'), body: S('Markdown body') }, ['repo', 'title']) },
  github_pull_requests: { kit: 'dev', description: 'List pull requests in a GitHub repository.', parameters: obj({ repo: S('owner/name'), state: { type: 'string', enum: ['open', 'closed', 'all'] } }, ['repo']) },
  github_actions_runs: { kit: 'dev', description: 'Recent GitHub Actions runs in a repository (status, conclusion, branch, links).', parameters: obj({ repo: S('owner/name') }, ['repo']) },
  github_rerun: { kit: 'dev', confirm: true, description: 'Re-run a GitHub Actions run (only the failed jobs by default).', parameters: obj({ repo: S('owner/name'), run_id: I('Run id from github_actions_runs'), all_jobs: { type: 'boolean' } }, ['repo', 'run_id']) },
  github_releases: { kit: 'dev', description: 'Releases of a GitHub repository with download counts.', parameters: obj({ repo: S('owner/name') }, ['repo']) },
  repo_status: { kit: 'dev', description: "git status, branch and the last commits of a local repository in the user's home folder.", parameters: obj({ path: S('Folder of the repo, e.g. ~/Developer/Nexus-28') }, ['path']) },
  run_code: { kit: 'dev', confirm: true, description: 'Run a short JavaScript (sandboxed, no network or files, 3 s) or Python 3 (10 s, in an empty temp folder) program and return its output.', parameters: obj({ language: { type: 'string', enum: ['javascript', 'python'] }, code: S('The program') }, ['language', 'code']) },

  // ---------- Web & research
  deep_browse: { kit: 'web', description: 'Read a page and then follow its most relevant links on the same site (up to 6 pages total) to answer a question thoroughly.', parameters: obj({ url: S('Start page'), focus: S('What to look for, used to pick which links to follow'), max_pages: I('2-6, default 4') }, ['url']) },
  compare_sources: { kit: 'web', description: 'Read 2-5 pages side by side so you can compare what each source says about one question.', parameters: obj({ urls: { type: 'array', items: { type: 'string' }, description: '2-5 URLs' }, question: S('What to compare') }, ['urls']) },
  save_to_dossier: { kit: 'web', confirm: true, description: "Save a short, sourced note from a page into the user's Axiom Dossier.", parameters: obj({ url: S('Source page'), note: S('The fact or summary to keep (one or two sentences)'), kind: { type: 'string', enum: ['fact', 'project', 'goal', 'deadline', 'preference', 'person'] } }, ['url', 'note']) },

  // ---------- Nexus internals (owner only)
  nexus_feedback: { kit: 'nexus', description: 'Nexus feedback and bug reports from users (newest first).', parameters: obj({ status: { type: 'string', enum: ['open', 'working', 'done', 'all'] }, limit: I('Max reports (default 15)') }) },
  nexus_status: { kit: 'nexus', description: 'The public Nexus status page right now: components, live incidents and maintenance.', parameters: obj({}) },
  nexus_usage: { kit: 'nexus', description: 'Nexus app usage: active people, versions in use and growth over the last N days.', parameters: obj({ days: I('7-90, default 30') }) },
  nexus_reply_feedback: { kit: 'nexus', confirm: true, description: 'Reply to a feedback report as the Apoji Team (the person sees it in their app). The owner approves the exact text.', parameters: obj({ report_id: I('Report id from nexus_feedback'), body: S('Reply text'), internal: { type: 'boolean', description: 'Internal note only admins see' } }, ['report_id', 'body']) },
  nexus_post_incident: { kit: 'nexus', confirm: true, description: 'Post an incident to the public Nexus status page. The owner approves it first.', parameters: obj({ title: S('Short title'), severity: { type: 'string', enum: ['minor', 'major', 'critical', 'maintenance'] }, components: { type: 'array', items: { type: 'string' }, description: 'Component ids from nexus_status' }, body: S('First update text') }, ['title', 'severity', 'body']) }
};
const KITS = { mac: 'Mac power tools', dev: 'Dev tools', web: 'Web & research', nexus: 'Nexus internals' };

// Which tools this Axiom turn gets
function names({ settings = {}, owner = false, platform = process.platform } = {}) {
  const off = settings.axiomKits || {};
  return Object.keys(DEFS).filter(n => {
    const k = DEFS[n].kit;
    if (off[k] === false) return false;
    if (k === 'nexus') return !!owner;
    if (k === 'mac') return platform === 'darwin' || process.env.NEXUS_FAKE_MAC === '1';
    return true;
  });
}
const toolList = opts => names(opts).map(n => ({ name: n, description: DEFS[n].description, parameters: DEFS[n].parameters }));

const tilde = p => String(p || '').replace(os.homedir(), '~');
function describe(name, a = {}) {
  switch (name) {
    case 'notes_search': return { label: 'Searching Notes', detail: a.query || '' };
    case 'notes_read': return { label: 'Reading a note', detail: a.title || '' };
    case 'notes_create': return { label: 'Create a note', detail: `${a.title || ''}: ${str(a.body, 160)}` };
    case 'mail_draft': return { label: 'Open an email draft (not sent)', detail: `To ${a.to || '(nobody yet)'} · ${a.subject || ''}\n${str(a.body, 400)}` };
    case 'imessage_send': return { label: 'Send a message', detail: `To ${a.to}: “${str(a.text, 500)}”` };
    case 'finder_list': return { label: 'Looking in a folder', detail: tilde(a.path) };
    case 'finder_move': { const m = Array.isArray(a.moves) ? a.moves : []; return { label: `Move ${m.length} item${m.length === 1 ? '' : 's'}`, detail: m.slice(0, 8).map(x => `${tilde(x.from)} → ${tilde(x.to)}`).join('\n') + (m.length > 8 ? `\n…and ${m.length - 8} more` : '') }; }
    case 'run_applescript': return { label: 'Run an AppleScript', detail: `${a.why || ''}\n\n${str(a.script, 1500)}` };
    case 'github_repos': return { label: 'Checking your GitHub repos', detail: '' };
    case 'github_issues': return { label: 'Reading GitHub issues', detail: a.repo || '' };
    case 'github_create_issue': return { label: 'Open a GitHub issue', detail: `${a.repo}: ${a.title}\n${str(a.body, 400)}` };
    case 'github_pull_requests': return { label: 'Reading pull requests', detail: a.repo || '' };
    case 'github_actions_runs': return { label: 'Checking GitHub Actions', detail: a.repo || '' };
    case 'github_rerun': return { label: 'Re-run a GitHub Actions run', detail: `${a.repo} · run ${a.run_id}${a.all_jobs ? ' (all jobs)' : ' (failed jobs)'}` };
    case 'github_releases': return { label: 'Checking releases', detail: a.repo || '' };
    case 'repo_status': return { label: 'Checking a repo', detail: tilde(a.path) };
    case 'run_code': return { label: `Run ${a.language === 'python' ? 'Python' : 'JavaScript'}`, detail: str(a.code, 1500) };
    case 'deep_browse': { let h = a.url; try { h = new URL(a.url).hostname; } catch {} return { label: 'Researching a site', detail: `${h}${a.focus ? ' · ' + a.focus : ''}` }; }
    case 'compare_sources': return { label: `Comparing ${(a.urls || []).length} sources`, detail: a.question || '' };
    case 'save_to_dossier': return { label: 'Save to your Dossier', detail: `${str(a.note, 300)}\n(${a.url})` };
    case 'nexus_feedback': return { label: 'Reading Nexus feedback', detail: a.status || 'open' };
    case 'nexus_status': return { label: 'Checking Nexus status', detail: '' };
    case 'nexus_usage': return { label: 'Checking Nexus usage', detail: `${a.days || 30} days` };
    case 'nexus_reply_feedback': return { label: a.internal ? 'Add an internal note' : 'Reply to feedback as the Apoji Team', detail: `Report #${a.report_id}: “${str(a.body, 600)}”` };
    case 'nexus_post_incident': return { label: 'Post to the public status page', detail: `${a.severity}: ${a.title}\n${str(a.body, 400)}` };
    default: return { label: name, detail: '' };
  }
}
const needsConfirm = name => !!DEFS[name]?.confirm;

// Paths must stay inside the home folder (and outside Library, keychains, ssh)
function homePath(p, home = os.homedir()) {
  const full = path.resolve(String(p || '').replace(/^~(?=\/|$)/, home));
  const rel = path.relative(home, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Only folders inside your home folder.');
  if (/^(Library|\.ssh|\.gnupg|\.aws|\.config\/gh)(\/|$)/.test(rel)) throw new Error("That folder is off limits.");
  return full;
}

async function gh(getKey, route, { method = 'GET', body } = {}) {
  const token = getKey('github');
  if (!token) throw new Error('Add a GitHub token in Settings → Axiom → Dev tools first (a fine-grained token with read access, plus Issues/Actions write if you want those).');
  const res = await fetch('https://api.github.com' + route, { method, headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Nexus28-Axiom' }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 ? null : res.json();
}
const repoOf = a => { const r = str(a.repo, 120); if (!REPO.test(r)) throw new Error('Use the repo as owner/name, e.g. apojidelegraphics/Nexus-28.'); return r; };

// Pick the links on a page that best match the focus words (same site only)
function pickLinks(html, base, focus, max) {
  const host = new URL(base).hostname, words = String(focus || '').toLowerCase().match(/[a-z0-9]{3,}/g) || [];
  const seen = new Set(), out = [];
  for (const m of String(html).matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let u; try { u = new URL(m[1], base); } catch { continue; }
    if (!/^https?:$/.test(u.protocol) || u.hostname !== host || seen.has(u.href) || u.href === base) continue;
    seen.add(u.href);
    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase(), hay = text + ' ' + u.pathname.toLowerCase();
    out.push({ url: u.href, text, score: words.reduce((s, w) => s + (hay.includes(w) ? 2 : 0), 0) + (text.length > 3 ? .1 : 0) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, max);
}

async function execute(name, a = {}, d) {
  const { run, web, axiomData, cloud, getKey = () => '', runJS, owner = () => false, home = os.homedir() } = d;
  // AppleScript / JavaScript for Automation, with errors people can act on (not the whole script)
  const nice = (e, app) => {
    const m = String(e?.message || e);
    if (/-1743|not allowed|not authori[sz]ed/i.test(m)) return new Error(`macOS hasn't allowed Nexus to control ${app || 'that app'} yet. Allow it in System Settings → Privacy & Security → Automation → Nexus '28 (or Settings → Permissions → Automation → Ask now), then try again.`);
    if (/timed out|ETIMEDOUT|SIGTERM|killed/i.test(m) || /^Command failed/.test(m)) return new Error(`${app || 'The app'} took too long to answer. If macOS asked whether Nexus can control ${app || 'it'}, click OK and try again.`);
    return new Error(m.replace(/^.*?execution error: /s, '').slice(0, 300));
  };
  const osa = (src, timeout = 20000, app = '') => run('osascript', ['-e', src], { timeout }).catch(e => { throw nice(e, app); });
  const jxa = (src, timeout = 20000) => run('osascript', ['-l', 'JavaScript', '-e', src], { timeout }).catch(e => { throw nice(e, 'Notes'); });
  const done = (content, summary) => ({ content: clip(content), activity: { summary } });
  switch (name) {
    // ---------- Mac power
    case 'notes_search': {
      // JavaScript for Automation reads every note's title and text in one call (fast), then we filter here.
      const q = str(a.query, 100).toLowerCase(); if (!q) throw new Error('What should I look for?');
      const out = await jxa(`const N = Application('Notes'); const names = N.notes.name(), bodies = N.notes.plaintext(), mods = N.notes.modificationDate();
        JSON.stringify(names.map((n, i) => ({ n, b: String(bodies[i] || '').slice(0, 4000), m: +mods[i] })))`, 40000);
      const words = q.split(/\s+/).filter(Boolean);
      const hits = JSON.parse(out || '[]').map(x => ({ ...x, score: words.reduce((s, w) => s + (x.n.toLowerCase().includes(w) ? 3 : 0) + (x.b.toLowerCase().includes(w) ? 1 : 0), 0) }))
        .filter(x => x.score >= words.length).sort((x, y) => y.score - x.score || y.m - x.m).slice(0, 15);
      return done(hits.map(x => `• ${x.n} (edited ${new Date(x.m).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})\n  ${x.b.replace(/\s+/g, ' ').slice(0, 180)}`).join('\n') || `No notes mention “${a.query}”.`, `${hits.length} note${hits.length === 1 ? '' : 's'}`);
    }
    case 'notes_read': {
      const out = await jxa(`const N = Application('Notes'); const hit = N.notes.whose({ name: ${JSON.stringify(str(a.title, 200))} })(); hit.length ? hit[0].plaintext() : ''`);
      if (!out.trim()) throw new Error(`No note is called “${a.title}”. Use notes_search for the exact title.`);
      return done(`Note: ${a.title}\n\n${out}`, `Read “${str(a.title, 40)}”`);
    }
    case 'notes_create': {
      const html = `<h1>${str(a.title, 200).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</h1>` + str(a.body, 20000).split('\n').map(l => `<div>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;') || '<br>'}</div>`).join('');
      await jxa(`const N = Application('Notes'); const note = N.Note({ name: ${JSON.stringify(str(a.title, 200))}, body: ${JSON.stringify(html)} }); N.defaultAccount.folders[0].notes.push(note); 'ok'`);
      return done(`Created the note “${a.title}”.`, 'Note created');
    }
    case 'mail_draft': {
      const tos = str(a.to, 500).split(/[,;\s]+/).filter(x => /@/.test(x)).slice(0, 10);
      await osa(`tell application "Mail"\n  set m to make new outgoing message with properties {subject:"${asq(str(a.subject, 300))}", content:"${asq(str(a.body, 20000))}", visible:true}\n  tell m\n${tos.map(t => `    make new to recipient at end of to recipients with properties {address:"${asq(t)}"}`).join('\n')}\n  end tell\n  activate\nend tell`, 20000, 'Mail');
      return done('The draft is open in Mail for the user to review and send.', 'Draft opened in Mail');
    }
    case 'imessage_send': {
      const to = str(a.to, 120); if (!/^[+\d][\d\s().-]{5,}$|@/.test(to)) throw new Error('Give a phone number or an email address.');
      await osa(`tell application "Messages"\n  set s to 1st account whose service type = iMessage\n  send "${asq(str(a.text, 4000))}" to participant "${asq(to)}" of s\nend tell`, 20000, 'Messages');
      return done(`Sent to ${to}.`, 'Message sent');
    }
    case 'finder_list': {
      const dir = homePath(a.path, home), lim = Math.max(1, Math.min(200, +a.limit || 60));
      const rows = fs.readdirSync(dir, { withFileTypes: true }).filter(e => !e.name.startsWith('.')).slice(0, 500).map(e => {
        let st = null; try { st = fs.statSync(path.join(dir, e.name)); } catch {}
        return { name: e.name, dir: e.isDirectory(), size: st?.size || 0, mod: st?.mtimeMs || 0 };
      }).sort((x, y) => y.mod - x.mod);
      const kb = b => b < 1048576 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
      return done(`${tilde(dir)} (${rows.length} items, newest first)\n` + rows.slice(0, lim).map(r => `${r.dir ? '📁' : '·'} ${r.name}${r.dir ? '/' : ' · ' + kb(r.size)} · ${new Date(r.mod).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`).join('\n'), `${rows.length} items`);
    }
    case 'finder_move': {
      const moves = (Array.isArray(a.moves) ? a.moves : []).slice(0, 50); if (!moves.length) throw new Error('Nothing to move.');
      const did = [], skipped = [];
      for (const m of moves) {
        try {
          const from = homePath(m.from, home), to = homePath(m.to, home);
          if (!fs.existsSync(from)) { skipped.push(`${tilde(from)} (not found)`); continue; }
          if (fs.existsSync(to)) { skipped.push(`${tilde(to)} (already exists, not overwritten)`); continue; }
          fs.mkdirSync(path.dirname(to), { recursive: true }); fs.renameSync(from, to); did.push({ from, to });
        } catch (e) { skipped.push(`${m.from} (${e.message})`); }
      }
      return { content: `Moved ${did.length}.${skipped.length ? ' Skipped: ' + skipped.join('; ') : ''}\nTo undo, move them back: ${did.map(x => `${tilde(x.to)} → ${tilde(x.from)}`).join('; ')}`, activity: { summary: `Moved ${did.length} item${did.length === 1 ? '' : 's'}` } };
    }
    case 'run_applescript': {
      const out = await osa(str(a.script, 20000), 30000, 'that app');
      return done(out.trim() || 'Done (no output).', 'AppleScript ran');
    }
    // ---------- Dev
    case 'github_repos': {
      const r = await gh(getKey, '/user/repos?per_page=50&sort=pushed');
      return done(r.map(x => `${x.full_name}${x.private ? ' (private)' : ''} · ★${x.stargazers_count} · pushed ${x.pushed_at?.slice(0, 10)}${x.description ? ' · ' + x.description : ''}`).join('\n'), `${r.length} repos`);
    }
    case 'github_issues': case 'github_pull_requests': {
      const repo = repoOf(a), kind = name === 'github_issues' ? 'issues' : 'pulls';
      const r = await gh(getKey, `/repos/${repo}/${kind}?state=${['open', 'closed', 'all'].includes(a.state) ? a.state : 'open'}&per_page=30`);
      const list = kind === 'issues' ? r.filter(x => !x.pull_request) : r;
      return done(list.map(x => `#${x.number} ${x.title} · ${x.state} · ${x.user?.login} · ${x.updated_at?.slice(0, 10)}${x.labels?.length ? ' · ' + x.labels.map(l => l.name).join(', ') : ''}\n  ${x.html_url}`).join('\n') || 'None.', `${list.length} ${kind === 'issues' ? 'issues' : 'pull requests'}`);
    }
    case 'github_create_issue': {
      const r = await gh(getKey, `/repos/${repoOf(a)}/issues`, { method: 'POST', body: { title: str(a.title, 250), body: str(a.body, 60000) } });
      return { content: `Opened #${r.number}: ${r.html_url}`, activity: { summary: `Issue #${r.number} opened`, sources: [{ title: r.title, url: r.html_url }] } };
    }
    case 'github_actions_runs': {
      const r = await gh(getKey, `/repos/${repoOf(a)}/actions/runs?per_page=15`);
      return done((r.workflow_runs || []).map(x => `${x.id} · ${x.name} · ${x.display_title} · ${x.status}${x.conclusion ? '/' + x.conclusion : ''} · ${x.head_branch} · ${x.created_at?.slice(0, 16).replace('T', ' ')}\n  ${x.html_url}`).join('\n') || 'No runs.', `${(r.workflow_runs || []).length} runs`);
    }
    case 'github_rerun': {
      await gh(getKey, `/repos/${repoOf(a)}/actions/runs/${Math.round(+a.run_id)}/${a.all_jobs ? 'rerun' : 'rerun-failed-jobs'}`, { method: 'POST' });
      return done(`Re-running run ${a.run_id}.`, 'Run restarted');
    }
    case 'github_releases': {
      const r = await gh(getKey, `/repos/${repoOf(a)}/releases?per_page=10`);
      return done(r.map(x => `${x.tag_name}${x.prerelease ? ' (pre)' : ''} · ${x.published_at?.slice(0, 10)} · ${(x.assets || []).reduce((s, y) => s + y.download_count, 0)} downloads\n  ${x.html_url}`).join('\n') || 'No releases.', `${r.length} releases`);
    }
    case 'repo_status': {
      const dir = homePath(a.path, home);
      const git = args => run('git', ['-C', dir, ...args], { timeout: 10000 });
      const [st, log] = await Promise.all([git(['status', '--short', '--branch']), git(['log', '--oneline', '-12', '--decorate'])]);
      return done(`${tilde(dir)}\n\n${st.trim()}\n\nRecent commits:\n${log.trim()}`, st.split('\n')[0].replace(/^## /, ''));
    }
    case 'run_code': {
      const code = str(a.code, 20000);
      if (a.language === 'python') {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'axiom-py-'));
        try { fs.writeFileSync(path.join(tmp, 'main.py'), code); const out = await run('python3', ['-I', '-B', path.join(tmp, 'main.py')], { timeout: 10000, cwd: tmp }); return done(out || '(no output)', 'Python ran'); }
        finally { fs.rmSync(tmp, { recursive: true, force: true }); }
      }
      if (!runJS) throw new Error('JavaScript runner unavailable.');
      const r = await runJS(code);
      return done(r.ok ? r.out || '(no output)' : `Error: ${r.error}\n${r.out || ''}`, r.ok ? 'JavaScript ran' : 'JavaScript failed');
    }
    // ---------- Web & research
    case 'deep_browse': {
      const max = Math.max(2, Math.min(6, +a.max_pages || 4));
      const first = await web.fetchText(a.url, { timeout: 12000 });
      const page0 = await web.fetchPage(a.url);
      const links = pickLinks(first.text, first.url || a.url, a.focus, max - 1);
      const pages = [page0, ...(await Promise.all(links.map(l => web.fetchPage(l.url, { maxChars: 5000 }).catch(() => null)))).filter(Boolean)];
      return { content: clip(pages.map((p, i) => `### [${i + 1}] ${p.title}\n${p.url}\n${p.text}`).join('\n\n'), 30000), activity: { summary: `Read ${pages.length} page${pages.length === 1 ? '' : 's'}`, sources: pages.map(p => ({ title: p.title || p.url, url: p.url })) } };
    }
    case 'compare_sources': {
      const urls = (Array.isArray(a.urls) ? a.urls : []).slice(0, 5); if (urls.length < 2) throw new Error('Give at least 2 links.');
      const pages = await Promise.all(urls.map(u => web.fetchPage(u, { maxChars: 6000 }).catch(e => ({ url: u, title: u, text: `(couldn't read: ${e.message})` }))));
      return { content: clip(`Question: ${a.question || ''}\n\n` + pages.map((p, i) => `### Source ${i + 1}: ${p.title}\n${p.url}\n${p.text}`).join('\n\n'), 32000), activity: { summary: `${pages.length} sources`, sources: pages.map(p => ({ title: p.title || p.url, url: p.url })) } };
    }
    case 'save_to_dossier': {
      if (!axiomData) throw new Error('The Dossier is unavailable.');
      const e = axiomData.addEntry({ kind: a.kind, text: `${str(a.note, 260)} (source: ${str(a.url, 200)})` }, 'research');
      return done(e ? 'Saved to the Dossier.' : 'Already in the Dossier.', e ? 'Saved to Dossier' : 'Already saved');
    }
    // ---------- Nexus internals (owner only, checked again here)
    case 'nexus_feedback': case 'nexus_status': case 'nexus_usage': case 'nexus_reply_feedback': case 'nexus_post_incident': {
      if (!owner()) throw new Error('Nexus internals are only for the Nexus owner account.');
      if (!cloud?.session) throw new Error('Sign in to your Nexus account first.');
      if (name === 'nexus_feedback') {
        const st = ['open', 'working', 'done'].includes(a.status) ? `&status=eq.${a.status}` : a.status === 'all' ? '' : '&status=in.(new,open,working)';
        const rows = await cloud.authedGet(`feedback_reports?select=id,kind,title,body,status,username,app_version,created_at&order=created_at.desc&limit=${Math.max(1, Math.min(50, +a.limit || 15))}${st}`);
        return done(rows.map(r => `#${r.id} [${r.kind}/${r.status}] ${r.title} · ${r.username || '?'} · ${r.app_version || ''} · ${r.created_at.slice(0, 10)}\n  ${str(r.body, 400).replace(/\n/g, ' ')}`).join('\n') || 'No reports.', `${rows.length} reports`);
      }
      if (name === 'nexus_status') return done(JSON.stringify(await cloud.rpc('public_status', {}), null, 1), 'Status checked');
      if (name === 'nexus_usage') return done(JSON.stringify(await cloud.rpc('admin_release_stats', { p_days: Math.max(7, Math.min(90, +a.days || 30)) })).slice(0, 12000), 'Usage checked');
      if (name === 'nexus_reply_feedback') {
        await cloud.write('POST', 'feedback_replies', { report_id: Math.round(+a.report_id), body: str(a.body, 4000), internal: !!a.internal, is_staff: true, author_name: 'Apoji Team' }, 'return=minimal');
        return done(`${a.internal ? 'Internal note added' : 'Reply sent'} on #${a.report_id}.`, a.internal ? 'Note added' : 'Reply sent');
      }
      const sev = ['minor', 'major', 'critical', 'maintenance'].includes(a.severity) ? a.severity : 'minor', status = sev === 'maintenance' ? 'identified' : 'investigating';
      await cloud.write('POST', 'status_incidents', { title: str(a.title, 120), severity: sev, components: (Array.isArray(a.components) ? a.components : []).map(c => str(c, 40)).slice(0, 10), status, updates: [{ at: new Date().toISOString(), status, body: str(a.body, 2000) }] }, 'return=minimal');
      return done('Posted to the status page.', 'Incident posted');
    }
  }
  throw new Error(`Unknown Axiom tool "${name}".`);
}

module.exports = { DEFS, KITS, names, toolList, describe, needsConfirm, execute, homePath, pickLinks };

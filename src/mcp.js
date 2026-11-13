// MCP connector manager: connects to Model Context Protocol servers (local stdio or remote HTTP)
// and exposes their tools to Paragon as `<connector>__<tool>`.
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

// Starting points users can edit. Community servers need their own one-time setup (see each note).
const PRESETS = [
  { preset: 'google', name: 'Google Workspace', type: 'stdio', command: 'uvx', args: ['workspace-mcp', '--tools', 'gmail', 'calendar', 'drive', 'docs', 'sheets'],
    env: { GOOGLE_OAUTH_CLIENT_ID: '', GOOGLE_OAUTH_CLIENT_SECRET: '', USER_GOOGLE_EMAIL: '', OAUTHLIB_INSECURE_TRANSPORT: '1' },
    note: 'Gmail, Google Calendar, Drive, Docs, Sheets via the community workspace-mcp server. Needs uv (brew install uv), a Google Cloud OAuth client ID/secret (Desktop app), and your Gmail address in USER_GOOGLE_EMAIL. Paragon shows a Google sign-in link the first time.' },
  { preset: 'gmail', name: 'Gmail', type: 'stdio', command: 'npx', args: ['-y', '@gongrzhe/server-gmail-autoauth-mcp'], env: {},
    note: 'Community Gmail server. One-time: put your Google OAuth file at ~/.gmail-mcp/gcp-oauth.keys.json and run "npx @gongrzhe/server-gmail-autoauth-mcp auth".' },
  { preset: 'notion', name: 'Notion', type: 'stdio', command: 'npx', args: ['-y', '@notionhq/notion-mcp-server'], env: { NOTION_TOKEN: '' },
    note: 'Official Notion server. Create an internal integration at notion.so/profile/integrations, paste its secret, and share pages with it.' },
  { preset: 'supabase', name: 'Supabase', type: 'stdio', command: 'npx', args: ['-y', '@supabase/mcp-server-supabase@latest', '--read-only', '--project-ref=yzbnxpkuhlxsuwzbjifx'],
    env: { SUPABASE_ACCESS_TOKEN: '' },
    note: 'Official Supabase server, set to your Nexus project in read-only mode. Create a personal access token at supabase.com/dashboard/account/tokens and paste it. Remove "--read-only" only if you want Paragon to change data (it will still ask first).' },
  { preset: 'github', name: 'GitHub', type: 'http', url: 'https://api.githubcopilot.com/mcp/', headers: { Authorization: 'Bearer ' },
    note: 'GitHub\'s hosted MCP server. Paste a personal access token after "Bearer ".' },
  { preset: 'filesystem', name: 'Files', type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '~/Documents'], env: {},
    note: 'Lets Paragon read and write files inside the folders listed in the arguments.' },
  { preset: 'custom', name: 'Custom server', type: 'stdio', command: '', args: [], env: {}, note: 'Any MCP server: a local command, or a remote URL (switch type to HTTP).' }
];

const READ_NAME = /^(get|list|search|read|find|fetch|query|lookup|describe|show|view|retrieve|count|check)[_-]?/i;
const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 20) || 'mcp';

class McpManager {
  constructor({ env = process.env, home = require('os').homedir(), log = () => {} } = {}) {
    this.env = env; this.home = home; this.log = log;
    this.conns = new Map(); // id -> { config, client, tools, status, error, connecting }
  }

  expand(s) { return String(s).replace(/^~(?=\/|$)/, this.home); }

  status() {
    return Object.fromEntries([...this.conns].map(([id, c]) => [id, { status: c.status, error: c.error || '', tools: (c.tools || []).map(t => t.name) }]));
  }

  async connect(config, secrets = {}) {
    await this.disconnect(config.id);
    const entry = { config, status: 'connecting', tools: [], error: '' };
    this.conns.set(config.id, entry);
    const client = new Client({ name: 'nexus-desktop', version: '0.3.0' });
    let transport;
    try {
      if (config.type === 'http') {
        if (!config.url) throw new Error('No server URL set.');
        transport = new StreamableHTTPClientTransport(new URL(config.url), { requestInit: { headers: { ...(secrets.headers || {}) } } });
      } else {
        if (!config.command) throw new Error('No command set.');
        transport = new StdioClientTransport({
          command: config.command,
          args: (config.args || []).map(a => this.expand(a)),
          env: { ...this.env, ...(secrets.env || {}) },
          stderr: 'pipe'
        });
        let errTail = '';
        transport.stderr?.on('data', d => { errTail = (errTail + d).slice(-600); });
        entry.stderr = () => errTail;
      }
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Timed out connecting (60s).')), 60000));
      await Promise.race([client.connect(transport), timeout]);
      const listed = await Promise.race([client.listTools(), timeout]);
      entry.client = client;
      entry.tools = listed.tools || [];
      entry.status = 'connected';
    } catch (e) {
      entry.status = 'error';
      const tail = entry.stderr?.().trim().split('\n').slice(-2).join(' ');
      entry.error = (/ENOENT/.test(e.message) ? `Command "${config.command}" not found. Is it installed?` : e.message) + (tail ? ` — ${tail}` : '');
      try { await client.close(); } catch {}
    }
    return entry;
  }

  async disconnect(id) {
    const c = this.conns.get(id);
    this.conns.delete(id);
    if (c?.client) { try { await c.client.close(); } catch {} }
  }
  async closeAll() { await Promise.all([...this.conns.keys()].map(id => this.disconnect(id))); }

  // Normalized tool list for the agent, plus a lookup to route calls back.
  agentTools() {
    const tools = [], routes = {};
    for (const [id, c] of this.conns) {
      if (c.status !== 'connected') continue;
      const prefix = slug(c.config.name);
      for (const t of c.tools) {
        const name = `${prefix}__${t.name}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
        const ann = t.annotations || {};
        const readOnly = ann.readOnlyHint === true || (ann.readOnlyHint === undefined && ann.destructiveHint !== true && READ_NAME.test(t.name));
        tools.push({
          name,
          description: `[${c.config.name}] ${t.description || t.title || t.name}`.slice(0, 1000),
          parameters: t.inputSchema && t.inputSchema.type ? t.inputSchema : { type: 'object', properties: {} }
        });
        routes[name] = { id, tool: t.name, connector: c.config.name, readOnly, confirm: !readOnly && c.config.confirmWrites !== false };
      }
    }
    return { tools, routes };
  }

  async call(route, args, signal) {
    const c = this.conns.get(route.id);
    if (!c?.client) throw new Error(`${route.connector} is not connected.`);
    const res = await c.client.callTool({ name: route.tool, arguments: args || {} }, undefined, { signal, timeout: 120000 });
    const texts = [], images = [];
    for (const part of res.content || []) {
      if (part.type === 'text') texts.push(part.text);
      else if (part.type === 'image' && part.data) images.push(`data:${part.mimeType || 'image/png'};base64,${part.data}`);
      else if (part.type === 'resource' && part.resource?.text) texts.push(part.resource.text);
      else if (part.type === 'resource_link') texts.push(`${part.name || ''} ${part.uri}`);
    }
    if (!texts.length && res.structuredContent) texts.push(JSON.stringify(res.structuredContent));
    return { text: texts.join('\n\n') || '(no content)', images: images.slice(0, 4), isError: !!res.isError };
  }
}

module.exports = { McpManager, PRESETS };

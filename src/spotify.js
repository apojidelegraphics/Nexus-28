// Spotify connector (3.13): your Spotify account, signed in once with your own (free) Spotify developer app.
// Paragon (and other agents when you mention music) can see what's playing, search, play, queue, skip, change the
// volume, and make playlists (that one asks first). Uses the Spotify Web API with PKCE, so there's no secret: only the
// app's Client ID. Tokens stay on this computer (the keychain). Playback control needs Spotify Premium (Spotify's rule).
//   createSpotify({ getKey, setKey, openExternal, fetch }) → { connect(clientId), disconnect(), status(), call(name, args) }
'use strict';
const crypto = require('crypto');
const http = require('http');
const PORT = 8765, REDIRECT = `http://127.0.0.1:${PORT}/callback`;
const SCOPES = ['user-read-playback-state', 'user-modify-playback-state', 'user-read-currently-playing', 'playlist-modify-private', 'playlist-modify-public', 'playlist-read-private', 'user-read-private'].join(' ');
const b64url = b => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const TOOLS = {
  spotify_now_playing: { description: "What's playing on the user's Spotify right now (track, artist, device, progress).", parameters: { type: 'object', properties: {} } },
  spotify_search: { description: 'Search Spotify for tracks, albums, artists or playlists.', parameters: { type: 'object', properties: { query: { type: 'string' }, type: { type: 'string', enum: ['track', 'album', 'artist', 'playlist'] }, limit: { type: 'integer', description: '1-10, default 5' } }, required: ['query'] } },
  spotify_play: { description: 'Play something on Spotify: a search ("lofi beats", "Bohemian Rhapsody by Queen") or a spotify: URI. With nothing, resumes.', parameters: { type: 'object', properties: { query: { type: 'string' }, uri: { type: 'string' }, type: { type: 'string', enum: ['track', 'album', 'artist', 'playlist'], description: 'What the query is, default track' } } } },
  spotify_control: { description: 'Control Spotify playback: pause, resume, next, previous, volume (0-100), shuffle on/off, repeat off/track/context.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['pause', 'resume', 'next', 'previous', 'volume', 'shuffle_on', 'shuffle_off', 'repeat_off', 'repeat_track', 'repeat_context'] }, volume: { type: 'integer' } }, required: ['action'] } },
  spotify_queue: { description: 'Add a song to the Spotify queue (a search or a spotify:track: URI).', parameters: { type: 'object', properties: { query: { type: 'string' }, uri: { type: 'string' } } } },
  spotify_create_playlist: { description: "Make a playlist in the user's Spotify account and fill it with songs (searches or URIs). Asks the user first.", parameters: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, tracks: { type: 'array', items: { type: 'string' }, description: 'Up to 50 searches like "Song by Artist", or spotify:track: URIs' }, public: { type: 'boolean' } }, required: ['name', 'tracks'] } },
  spotify_devices: { description: "The user's Spotify devices (phone, computer, speakers) and which one is playing.", parameters: { type: 'object', properties: {} } }
};
const CONFIRM = new Set(['spotify_create_playlist']);
const WANTS = /\b(spotify|music|song|songs|playlist|play (?:some|me|the)|album|artist|track|skip|next song|pause (?:the )?music|turn (?:it|the music) (?:up|down)|what'?s playing|queue)\b/i;

function createSpotify({ getKey, setKey, openExternal, fetch: f = fetch }) {
  const load = () => { try { return JSON.parse(getKey('spotify') || 'null'); } catch { return null; } };
  const save = v => setKey('spotify', v ? JSON.stringify(v) : '');
  let server = null;

  async function token() {
    const t = load(); if (!t?.refresh_token) throw new Error('Spotify isn’t connected. Connect it in Settings → Connectors → Spotify.');
    if (t.access_token && t.expires_at > Date.now() + 60e3) return t.access_token;
    const r = await f('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: t.client_id }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { if (j.error === 'invalid_grant') { save(null); throw new Error('Spotify signed you out. Connect it again in Settings → Connectors.'); } throw new Error('Spotify: ' + (j.error_description || r.status)); }
    const next = { ...t, access_token: j.access_token, expires_at: Date.now() + (j.expires_in || 3600) * 1000, ...(j.refresh_token ? { refresh_token: j.refresh_token } : {}) };
    save(next); return next.access_token;
  }
  async function api(method, path, body, qs) {
    const url = 'https://api.spotify.com/v1' + path + (qs ? '?' + new URLSearchParams(qs) : '');
    const r = await f(url, { method, headers: { Authorization: 'Bearer ' + await token(), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 204 || r.status === 202) return {};
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const m = j.error?.message || r.statusText || String(r.status);
      if (r.status === 404 && /device/i.test(m)) throw new Error('No Spotify device is open. Open Spotify on your phone or computer and play anything once, then ask again.');
      if (r.status === 403 && /premium/i.test(m)) throw new Error('Controlling playback needs Spotify Premium (Spotify’s rule). Searching, what’s playing and playlists still work.');
      throw new Error('Spotify: ' + m);
    }
    return j;
  }
  const brief = t => t && { name: t.name, by: (t.artists || []).map(a => a.name).join(', '), album: t.album?.name, uri: t.uri, url: t.external_urls?.spotify };
  async function find(query, type = 'track') {
    const j = await api('GET', '/search', null, { q: query, type, limit: '1' });
    const it = j[type + 's']?.items?.filter(Boolean)[0]; if (!it) throw new Error(`Nothing on Spotify matches “${query}”.`);
    return it;
  }

  async function connect(clientId) {
    clientId = String(clientId || '').trim();
    if (!/^[0-9a-f]{32}$/i.test(clientId)) return { ok: false, error: 'That doesn’t look like a Spotify Client ID (32 letters and numbers, from developer.spotify.com/dashboard).' };
    const verifier = b64url(crypto.randomBytes(48)), challenge = b64url(crypto.createHash('sha256').update(verifier).digest()), state = b64url(crypto.randomBytes(12));
    if (server) { try { server.close(); } catch {} server = null; }
    const code = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { try { server.close(); } catch {} reject(new Error('Spotify sign-in timed out. Try again.')); }, 5 * 60e3);
      server = http.createServer((req, res) => {
        const u = new URL(req.url, REDIRECT);
        if (u.pathname !== '/callback') { res.writeHead(404); return res.end(); }
        const ok = u.searchParams.get('state') === state && u.searchParams.get('code');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<body style="font:16px system-ui;background:#04100b;color:#e2fff1;display:grid;place-items:center;height:90vh"><div><h2>${ok ? 'Spotify is connected to Nexus.' : 'Spotify sign-in didn’t finish.'}</h2><p>You can close this tab.</p></div></body>`);
        clearTimeout(timer); try { server.close(); } catch {} server = null;
        ok ? resolve(u.searchParams.get('code')) : reject(new Error(u.searchParams.get('error') === 'access_denied' ? 'You said no on the Spotify page.' : 'Spotify sign-in didn’t finish.'));
      });
      server.on('error', e => { clearTimeout(timer); reject(e.code === 'EADDRINUSE' ? new Error(`Port ${PORT} is busy. Close whatever uses it and try again.`) : e); });
      server.listen(PORT, '127.0.0.1', () => openExternal(`https://accounts.spotify.com/authorize?${new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: REDIRECT, code_challenge_method: 'S256', code_challenge: challenge, scope: SCOPES, state })}`));
    }).catch(e => ({ error: e.message }));
    if (code?.error) return { ok: false, error: code.error };
    const r = await f('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: 'Spotify: ' + (j.error_description || j.error || r.status) + (/redirect/i.test(j.error_description || '') ? `. In your Spotify app's settings, add the Redirect URI ${REDIRECT}` : '') };
    save({ client_id: clientId, access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in || 3600) * 1000 });
    const me = await api('GET', '/me').catch(() => ({}));
    const t = load(); save({ ...t, name: me.display_name || me.id || '', product: me.product || '' });
    return { ok: true, ...(await status()) };
  }
  async function status() { const t = load(); return { connected: !!t?.refresh_token, name: t?.name || '', product: t?.product || '', redirect: REDIRECT }; }
  function disconnect() { save(null); return { ok: true, connected: false }; }

  async function call(name, a = {}) {
    if (name === 'spotify_now_playing') {
      const j = await api('GET', '/me/player'); if (!j?.item) return { text: 'Nothing is playing on Spotify right now.' };
      return { text: `${j.is_playing ? 'Playing' : 'Paused'}: ${brief(j.item).name} by ${brief(j.item).by}${j.device ? ` on ${j.device.name}` : ''} (${Math.round((j.progress_ms || 0) / 1000)}s of ${Math.round((j.item.duration_ms || 0) / 1000)}s). ${brief(j.item).url || ''}` };
    }
    if (name === 'spotify_search') {
      const type = TOOLS.spotify_search.parameters.properties.type.enum.includes(a.type) ? a.type : 'track';
      const j = await api('GET', '/search', null, { q: String(a.query || ''), type, limit: String(Math.max(1, Math.min(10, +a.limit || 5))) });
      const items = (j[type + 's']?.items || []).filter(Boolean);
      return { text: items.length ? items.map((x, i) => `${i + 1}. ${x.name}${x.artists ? ' — ' + x.artists.map(r => r.name).join(', ') : x.owner ? ' (by ' + x.owner.display_name + ')' : ''} · ${x.uri}`).join('\n') : 'No results.' };
    }
    if (name === 'spotify_play') {
      if (!a.query && !a.uri) { await api('PUT', '/me/player/play'); return { text: 'Resumed Spotify.' }; }
      let uri = a.uri, label = a.uri;
      if (!uri) { const it = await find(a.query, a.type || 'track'); uri = it.uri; label = it.name + (it.artists ? ' by ' + it.artists.map(x => x.name).join(', ') : ''); }
      await api('PUT', '/me/player/play', /:track:/.test(uri) ? { uris: [uri] } : { context_uri: uri });
      return { text: `Playing ${label} on Spotify.` };
    }
    if (name === 'spotify_control') {
      const act = String(a.action || '');
      const map = { pause: ['PUT', '/me/player/pause'], resume: ['PUT', '/me/player/play'], next: ['POST', '/me/player/next'], previous: ['POST', '/me/player/previous'] };
      if (map[act]) { await api(...map[act]); return { text: { pause: 'Paused.', resume: 'Playing.', next: 'Skipped to the next song.', previous: 'Back to the previous song.' }[act] }; }
      if (act === 'volume') { const v = Math.max(0, Math.min(100, Math.round(+a.volume))); if (!Number.isFinite(v)) throw new Error('Say a volume from 0 to 100.'); await api('PUT', '/me/player/volume', null, { volume_percent: String(v) }); return { text: `Spotify volume ${v}%.` }; }
      if (/^shuffle_/.test(act)) { await api('PUT', '/me/player/shuffle', null, { state: String(act === 'shuffle_on') }); return { text: act === 'shuffle_on' ? 'Shuffle on.' : 'Shuffle off.' }; }
      if (/^repeat_/.test(act)) { await api('PUT', '/me/player/repeat', null, { state: act.slice(7) }); return { text: `Repeat ${act.slice(7)}.` }; }
      throw new Error('Unknown action.');
    }
    if (name === 'spotify_queue') {
      let uri = a.uri, label = a.uri; if (!uri) { const it = await find(a.query || ''); uri = it.uri; label = `${it.name} by ${it.artists.map(x => x.name).join(', ')}`; }
      await api('POST', '/me/player/queue', null, { uri }); return { text: `Added ${label} to the queue.` };
    }
    if (name === 'spotify_create_playlist') {
      const me = await api('GET', '/me'), uris = [], missed = [];
      for (const q of (Array.isArray(a.tracks) ? a.tracks : []).slice(0, 50)) { if (/^spotify:track:/.test(q)) { uris.push(q); continue; } try { uris.push((await find(q)).uri); } catch { missed.push(q); } }
      if (!uris.length) throw new Error('None of those songs were found on Spotify.');
      const pl = await api('POST', `/users/${encodeURIComponent(me.id)}/playlists`, { name: String(a.name || 'Nexus playlist').slice(0, 100), description: String(a.description || 'Made by Nexus').slice(0, 300), public: !!a.public });
      await api('POST', `/playlists/${pl.id}/tracks`, { uris });
      return { text: `Made the playlist “${pl.name}” with ${uris.length} song${uris.length === 1 ? '' : 's'}${missed.length ? ` (couldn’t find: ${missed.slice(0, 5).join('; ')})` : ''}. ${pl.external_urls?.spotify || ''}` };
    }
    if (name === 'spotify_devices') {
      const j = await api('GET', '/me/player/devices');
      return { text: (j.devices || []).length ? j.devices.map(d => `${d.is_active ? '▶ ' : ''}${d.name} (${d.type}${d.volume_percent != null ? ', ' + d.volume_percent + '%' : ''})`).join('\n') : 'No Spotify devices are open right now.' };
    }
    throw new Error('Unknown Spotify tool.');
  }
  return { connect, disconnect, status, call, token };
}
const describe = (n, a = {}) => ({ spotify_now_playing: { label: 'Checking Spotify', detail: '' }, spotify_search: { label: 'Searching Spotify', detail: a.query || '' }, spotify_play: { label: 'Playing on Spotify', detail: a.query || a.uri || 'resume' },
  spotify_control: { label: 'Spotify', detail: a.action === 'volume' ? `volume ${a.volume}` : a.action || '' }, spotify_queue: { label: 'Adding to the Spotify queue', detail: a.query || a.uri || '' },
  spotify_create_playlist: { label: 'Make a Spotify playlist', detail: `${a.name || ''} · ${(a.tracks || []).length} songs` }, spotify_devices: { label: 'Checking Spotify devices', detail: '' } }[n] || { label: 'Spotify', detail: '' });
module.exports = { createSpotify, TOOLS, CONFIRM, WANTS, describe, REDIRECT, SCOPES };

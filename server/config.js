// Config storage. Nothing is baked into the image.
import fs from 'fs';
import path from 'path';

const CONFIG_DIR = process.env.CONFIG_DIR || '/config';
const CONFIG_FILE = path.join(CONFIG_DIR, 'settings.json');

const DEFAULTS = {
  configured: false,
  app: { name: 'NickSeer', theme: 'dark' },
  services: {
    plex:     { url: '', token: '' },
    tautulli: { url: '', apikey: '' },
    radarr:   { url: '', apikey: '', qualityProfileId: null, rootFolder: '' },
    sonarr:   { url: '', apikey: '', qualityProfileId: null, rootFolder: '' },
    sabnzbd:  { url: '', apikey: '' },
    gluetun:  { url: '', apikey: '', username: '', password: '' }
  },
  tmdb: { apiKey: '', readToken: '', region: 'GR', language: 'en-US' },
  omdb: { apiKey: '' },
  imdb: { movieListId: '8647021', tvListId: '' },
  boxoffice: { source: 'bom', area: '' },
  ai: { provider: 'none', openaiApiKey: '', openaiModel: 'gpt-4o-mini', ollamaUrl: '', ollamaModel: 'llama3.1', ollamaEmbedModel: 'nomic-embed-text' },
  recommendation: { level: 1, historyDepth: 300, dedupeSeries: true },
  cache: { ttlHours: 24 },
  // Local login. Users now may also carry a Plex identity (plexId, plexToken,
  // thumb) when they signed in via Plex. `approvals` gates requesting.
  auth: { enabled: false, secret: '', users: [], approvals: false },
  // "Sign in with Plex" support (OAuth PIN flow).
  plexAuth: { enabled: false, clientId: '' },
  // Pending/approved request queue (for the Approvals tab).
  requests: [],
  users: []
};

function deepMerge(base, override) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(override || {})) {
    if (override[k] && typeof override[k] === 'object' && !Array.isArray(override[k])) out[k] = deepMerge(base[k] || {}, override[k]);
    else out[k] = override[k];
  }
  return out;
}

let cache = null;

export function load() {
  if (cache) return cache;
  try {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
    if (fs.existsSync(CONFIG_FILE)) cache = deepMerge(DEFAULTS, JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')));
    else { cache = deepMerge(DEFAULTS, {}); save(cache); }
  } catch (e) { console.error('[config] failed to load:', e.message); cache = deepMerge(DEFAULTS, {}); }
  return cache;
}

export function save(next) {
  cache = deepMerge(DEFAULTS, next);
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cache, null, 2));
  return cache;
}

export function update(partial) { return save(deepMerge(load(), partial)); }

// Replace the requests array wholesale (arrays don't deep-merge).
export function setRequests(arr) {
  const c = load();
  c.requests = arr;
  cache = c;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(c, null, 2));
  return c;
}

export function redacted() {
  const c = JSON.parse(JSON.stringify(load()));
  const mask = (v) => (v ? '••••••••' + String(v).slice(-4) : '');
  c.services.plex.token = mask(c.services.plex.token);
  c.services.tautulli.apikey = mask(c.services.tautulli.apikey);
  c.services.radarr.apikey = mask(c.services.radarr.apikey);
  c.services.sonarr.apikey = mask(c.services.sonarr.apikey);
  c.services.sabnzbd.apikey = mask(c.services.sabnzbd.apikey);
  c.services.gluetun.apikey = mask(c.services.gluetun.apikey);
  c.services.gluetun.password = mask(c.services.gluetun.password);
  c.tmdb.apiKey = mask(c.tmdb.apiKey); c.tmdb.readToken = mask(c.tmdb.readToken);
  c.omdb.apiKey = mask(c.omdb.apiKey); c.ai.openaiApiKey = mask(c.ai.openaiApiKey);
  if (c.auth) { c.auth.secret = ''; c.auth.users = (c.auth.users || []).map((u) => ({ username: u.username, role: u.role || 'user', plex: !!u.plexId, thumb: u.thumb || '' })); }
  delete c.requests; // large; fetched via its own endpoint
  return c;
}

export { DEFAULTS, CONFIG_FILE, CONFIG_DIR };

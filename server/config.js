// Config storage. Nothing is baked into the image.
import fs from 'fs';
import path from 'path';

const localConfigDir = path.resolve(process.cwd(), 'config');
const CONFIG_DIR = process.env.CONFIG_DIR || (process.platform === 'win32' ? localConfigDir : '/config');
const CONFIG_FILE = path.join(CONFIG_DIR, 'settings.json');
const BACKUP_FILE = path.join(CONFIG_DIR, 'settings.bak.json');
const TMP_FILE = path.join(CONFIG_DIR, 'settings.json.tmp');

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
  users: [],
  telegram: {
    enabled: false,
    botToken: '',
    chatId: '',
    sendSilently: false,
    systemTempThreshold: 90,
    types: {
      pending: true,
      autoApproved: false,
      approved: true,
      declined: false,
      available: true,
      failed: false,
      systemTemp: true,
      systemCpu: true
    }
  },
  discord: {
    enabled: false,
    webhookUrl: '',
    botUsername: 'NickSeer Bot',
    botAvatarUrl: '',
    roleId: '',
    threadId: '',
    enableMentions: false,
    embedPoster: true,
    types: {
      pending: true,
      autoApproved: false,
      approved: true,
      declined: false,
      available: true,
      failed: false,
      systemTemp: true,
      systemCpu: true
    }
  }
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
let lastMtime = 0;

export function load(forceReload = false) {
  try {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
    if (fs.existsSync(CONFIG_FILE)) {
      const stats = fs.statSync(CONFIG_FILE);
      if (!forceReload && cache && stats.mtimeMs === lastMtime) return cache;
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
      if (raw && raw.trim()) {
        cache = deepMerge(DEFAULTS, JSON.parse(raw));
        lastMtime = stats.mtimeMs;
      }
    } else {
      cache = deepMerge(DEFAULTS, {});
      save(cache);
    }
  } catch (e) {
    console.error('[config] failed to load:', e.message);
    if (!cache) cache = deepMerge(DEFAULTS, {});
  }
  return cache;
}

export function save(next) {
  cache = deepMerge(DEFAULTS, next);
  try {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
    
    // Create backup of current config before overwrite
    if (fs.existsSync(CONFIG_FILE)) {
      try { fs.copyFileSync(CONFIG_FILE, BACKUP_FILE); } catch (e) { /* non-fatal */ }
    }

    // Atomic write via temp file
    const jsonStr = JSON.stringify(cache, null, 2);
    fs.writeFileSync(TMP_FILE, jsonStr, 'utf-8');
    fs.renameSync(TMP_FILE, CONFIG_FILE);
    
    const stats = fs.statSync(CONFIG_FILE);
    lastMtime = stats.mtimeMs;
  } catch (e) {
    console.error('[config] atomic save failed:', e.message);
    // Fallback direct write
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cache, null, 2), 'utf-8');
  }
  return cache;
}

export function update(partial) { return save(deepMerge(load(), partial)); }

// Replace the requests array wholesale (arrays don't deep-merge).
export function setRequests(arr) {
  const c = load();
  c.requests = arr;
  return save(c);
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
  if (c.telegram?.botToken) c.telegram.botToken = mask(c.telegram.botToken);
  if (c.discord?.webhookUrl) c.discord.webhookUrl = mask(c.discord.webhookUrl);
  if (c.auth) { c.auth.secret = ''; c.auth.users = (c.auth.users || []).map((u) => ({ username: u.username, role: u.role || 'user', plex: !!u.plexId, thumb: u.thumb || '' })); }
  delete c.requests; // large; fetched via its own endpoint
  return c;
}

export { DEFAULTS, CONFIG_FILE, CONFIG_DIR };
// Tiny shared helpers with fast in-memory client caching for instant tab switching.
export function toast(msg, kind = 'ok', ms = 3200) {
  const wrap = document.getElementById('toasts');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = 'toast ' + (kind === 'bad' ? 'bad' : 'ok');
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, ms);
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v != null) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) { if (c == null) continue; node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
  return node;
}

export function authToken() { return localStorage.getItem('nickseer_token') || ''; }

// ---------------------------------------------------------------------------
// Client API cache
// ---------------------------------------------------------------------------
// This used to be a bare in-memory Map, so every reload — and every PWA
// relaunch — refetched rows the server had already cached for 24h. It is now
// mirrored into sessionStorage so a return visit paints from cache instantly.
//
// The key is `path + ':' + authToken()`, which is why this is safe where a
// Service Worker cache was NOT: the Cache API ignores the Authorization header
// when matching, so SW-caching /api reads served profile A's rows to profile B.
// Keying on the token keeps profiles separate, and sessionStorage is per-tab
// and cleared when the browser session ends.
const CACHE_TTL_MS = 300000; // 5 minutes
const STORE_KEY = 'ns_api_cache_v1';
const clientApiCache = new Map();

function persist() {
  try {
    const now = Date.now();
    const live = [];
    for (const [k, v] of clientApiCache) {
      if (now - v.time < CACHE_TTL_MS) live.push([k, v]);
    }
    sessionStorage.setItem(STORE_KEY, JSON.stringify(live));
  } catch { /* quota, private mode, or storage disabled — stays in memory */ }
}

function hydrate() {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return;
    const now = Date.now();
    for (const [k, v] of JSON.parse(raw)) {
      if (v && typeof v.time === 'number' && now - v.time < CACHE_TTL_MS) clientApiCache.set(k, v);
    }
  } catch { /* corrupt or unreadable — start empty */ }
}
hydrate();

// Serialising the whole cache on every response would be wasteful, so coalesce
// into one write per tick.
let persistTimer = null;
function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => { persistTimer = null; persist(); }, 250);
}

export function clearApiCache(prefix) {
  if (!prefix) {
    clientApiCache.clear();
    try { sessionStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
    return;
  }
  for (const k of clientApiCache.keys()) {
    if (k.startsWith(prefix)) clientApiCache.delete(k);
  }
  schedulePersist();
}

export async function api(path, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  const isForce = opts.force || path.includes('refresh=1');
  const cacheKey = path + ':' + authToken();

  if (method === 'GET' && !isForce && clientApiCache.has(cacheKey)) {
    const entry = clientApiCache.get(cacheKey);
    if (Date.now() - entry.time < CACHE_TTL_MS) {
      return entry.data;
    }
  }

  const headers = Object.assign({}, opts.headers || {});
  const t = authToken();
  if (t) headers.Authorization = 'Bearer ' + t;
  const r = await fetch(path, Object.assign({}, opts, { headers }));
  if (r.status === 401) { document.dispatchEvent(new CustomEvent('auth:required')); return { error: 'auth required', _401: true }; }
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await r.json() : await r.text();

  if (method === 'GET' && !isForce && data && !data.error) {
    clientApiCache.set(cacheKey, { data, time: Date.now() });
    schedulePersist();
  }
  return data;
}

export function stars(v) { return v ? `★ ${Number(v).toFixed(1)}` : ''; }

export function escHTML(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>'\"/]/g, (match) => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;', '/': '&#x2F;' };
    return map[match];
  });
}


export function hasCache(path) {
  const cacheKey = path + ':' + authToken();
  if (clientApiCache.has(cacheKey)) {
    const entry = clientApiCache.get(cacheKey);
    if (Date.now() - entry.time < CACHE_TTL_MS) return true;
  }
  return false;
}

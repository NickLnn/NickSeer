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

  // Join an identical GET that is already on the wire. This is what makes
  // prefetch() worth anything: the detail request starts on touch-down, and
  // the openDetail() that follows on click awaits that same request instead of
  // firing a second one behind it.
  const dedupe = method === 'GET' && !isForce;
  if (dedupe && inFlight.has(cacheKey)) return inFlight.get(cacheKey);

  const run = (async () => {
    const headers = Object.assign({}, opts.headers || {});
    const t = authToken();
    if (t) headers.Authorization = 'Bearer ' + t;
    const r = await fetch(path, Object.assign({}, opts, { headers }));
    if (r.status === 401) { document.dispatchEvent(new CustomEvent('auth:required')); return { error: 'auth required', _401: true }; }
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await r.json() : await r.text();

    // A `pending` payload is a placeholder the caller will poll past
    // (AI Suggestions); caching it would hand every poll the same placeholder.
    if (method === 'GET' && !isForce && data && !data.error && !data.pending) {
      clientApiCache.set(cacheKey, { data, time: Date.now() });
      schedulePersist();
    }
    return data;
  })();

  if (!dedupe) return run;
  inFlight.set(cacheKey, run);
  try { return await run; } finally { inFlight.delete(cacheKey); }
}

const inFlight = new Map();

// Warm the client cache for a GET the user is about to need. Errors are
// swallowed — the real call will surface them.
export function prefetch(path) {
  if (hasCache(path)) return;
  api(path).catch(() => {});
}

export function stars(v) { return v ? `★ ${Number(v).toFixed(1)}` : ''; }

// Inner markup of a cast portrait tile (.cast in styles.css). Shared by the
// title modal and the Live Streaming sheet so both draw the same card. A
// missing headshot becomes a monogram on a gradient whose hue is derived from
// the name, so a row of placeholders reads as distinct people, not blanks.
export function castTileHTML(p) {
  const name = String(p?.name || '');
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const mono = parts.length ? (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() : '?';
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) % 360;
  const media = p?.photo
    ? `<img src="${escHTML(p.photo)}" alt="" loading="lazy" decoding="async">`
    : `<div class="cast-ph" style="--h:${h}" aria-hidden="true">${escHTML(mono)}</div>`;
  return `${media}<div class="cast-info"><div class="cast-name">${escHTML(name)}</div>${p?.character ? `<div class="cast-char">${escHTML(p.character)}</div>` : ''}</div>`;
}

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

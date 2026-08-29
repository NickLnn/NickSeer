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

const clientApiCache = new Map();

export function clearApiCache(prefix) {
  if (!prefix) { clientApiCache.clear(); return; }
  for (const k of clientApiCache.keys()) {
    if (k.startsWith(prefix)) clientApiCache.delete(k);
  }
}

export async function api(path, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  const isForce = opts.force || path.includes('refresh=1');
  const cacheKey = path + ':' + authToken();

  if (method === 'GET' && !isForce && clientApiCache.has(cacheKey)) {
    const entry = clientApiCache.get(cacheKey);
    // 5-minute memory cache
    if (Date.now() - entry.time < 300000) {
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


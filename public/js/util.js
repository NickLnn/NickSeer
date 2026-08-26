// Tiny shared helpers. api() automatically attaches the login token (when set)
// and signals a 401 so the app can show the login screen.
export function toast(msg, kind = 'ok', ms = 3200) {
  const wrap = document.getElementById('toasts');
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

export async function api(path, opts = {}) {
  const headers = Object.assign({}, opts.headers || {});
  const t = authToken();
  if (t) headers.Authorization = 'Bearer ' + t;
  const r = await fetch(path, Object.assign({}, opts, { headers }));
  if (r.status === 401) { document.dispatchEvent(new CustomEvent('auth:required')); return { error: 'auth required', _401: true }; }
  const ct = r.headers.get('content-type') || '';
  return ct.includes('application/json') ? r.json() : r.text();
}

export function stars(v) { return v ? `★ ${Number(v).toFixed(1)}` : ''; }

// welcome.js — Netflix-style welcome / sign-in screen.
// Shows when login is enabled and there's no valid session (covers logout and
// token expiry, e.g. after a month). Background = rotating "trending now"
// backdrops (server rows are cached 24h) + big calligraphy NickSeer wordmark.
// Options: Sign in locally (prefilled with the LAST user) or Sign in with Plex.
// Fully self-contained; hijacks the #login overlay so no app.js edits needed.

const LAST_USER = 'nickseer_last_user';
function token() { return localStorage.getItem('nickseer_token') || ''; }
function setToken(t) { localStorage.setItem('nickseer_token', t); }
function authHeaders() { const t = token(); return t ? { Authorization: 'Bearer ' + t } : {}; }

let bgTimer = null;

function injectStyles() {
  if (document.getElementById('welcome-styles')) return;
  const css = `
  #welcome{position:fixed;inset:0;z-index:120;display:grid;place-items:center;overflow:hidden;background:#04070d;}
  #welcome.hidden{display:none;}
  .wl-bg{position:absolute;inset:0;background-size:cover;background-position:center;opacity:0;transition:opacity 1.2s ease;transform:scale(1.05);}
  .wl-bg.on{opacity:.5;}
  .wl-scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(4,7,13,.55),rgba(4,7,13,.85) 60%,#04070d);}
  .wl-top{position:absolute;top:26px;left:34px;display:flex;align-items:center;gap:12px;z-index:3;}
  .wl-mark{width:44px;height:44px;} .wl-mark svg{width:44px;height:44px;border-radius:12px;box-shadow:0 8px 24px rgba(30,136,199,.45);}
  .wl-word{font-family:'Dancing Script','Brush Script MT','Segoe Script',cursive;font-size:40px;font-weight:700;color:#eaf6ff;letter-spacing:.5px;text-shadow:0 2px 12px rgba(0,0,0,.55);line-height:1;}
  .wl-card{position:relative;z-index:3;width:min(440px,92vw);background:rgba(10,14,22,.82);border:1px solid rgba(255,255,255,.1);border-radius:22px;padding:38px 34px;box-shadow:0 40px 100px rgba(0,0,0,.65);backdrop-filter:blur(14px);text-align:center;}
  .wl-hi{font-size:15px;color:#9aa7bd;font-weight:600;margin-bottom:2px;}
  .wl-h1{font-size:30px;font-weight:900;letter-spacing:-.03em;color:#fff;margin:0 0 4px;}
  .wl-sub{color:#9aa7bd;font-size:14px;margin-bottom:22px;}
  .wl-field{text-align:left;margin-bottom:14px;}
  .wl-field label{display:block;font-size:12px;font-weight:700;color:#9aa7bd;margin-bottom:6px;}
  .wl-field input{width:100%;padding:13px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;outline:none;font-size:15px;}
  .wl-field input:focus{border-color:#1E88C7;background:rgba(255,255,255,.1);}
  .wl-btn{width:100%;padding:14px;font-size:15px;font-weight:800;border:0;border-radius:13px;cursor:pointer;background:linear-gradient(135deg,#2E9BD6,#0f5687);color:#fff;}
  .wl-btn:hover{filter:brightness(1.06);}
  .wl-plex{width:100%;margin-top:12px;padding:14px;font-size:15px;font-weight:800;border:0;border-radius:13px;cursor:pointer;background:#e5a00d;color:#1b1b1b;display:inline-flex;align-items:center;justify-content:center;gap:10px;}
  .wl-plex:hover{filter:brightness(1.05);}
  .wl-or{display:flex;align-items:center;gap:10px;color:#6b7688;font-size:12px;margin:16px 0 4px;}
  .wl-or::before,.wl-or::after{content:"";flex:1;height:1px;background:rgba(255,255,255,.12);}
  .wl-err{color:#ff8b8b;font-size:13px;font-weight:700;min-height:18px;margin-top:10px;}
  .wl-last{display:inline-flex;align-items:center;gap:8px;background:rgba(30,136,199,.16);border:1px solid rgba(30,136,199,.4);color:#bfe3ff;border-radius:999px;padding:5px 12px;font-size:12.5px;font-weight:700;margin-bottom:16px;cursor:pointer;}
  .wl-last .av{width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#2E9BD6,#6d5ef0);display:grid;place-items:center;font-size:11px;font-weight:800;color:#fff;}
  @media(max-width:640px){.wl-word{font-size:26px;}.wl-card{padding:28px 22px;}}`;
  const st = document.createElement('style'); st.id = 'welcome-styles'; st.textContent = css; document.head.appendChild(st);
}

const MARK = `<svg viewBox="0 0 64 64"><defs><linearGradient id="wm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2E9BD6"/><stop offset="1" stop-color="#0f5687"/></linearGradient></defs><rect width="64" height="64" rx="15" fill="url(#wm)"/><path d="M20 46V18h6l12 16V18h6v28h-6L26 30v16z" fill="#fff"/></svg>`;

async function trendingBackdrops() {
  try {
    const rows = await fetch('/api/discover/rows', { headers: authHeaders() }).then((r) => r.json());
    const list = [];
    (rows.rows || []).forEach((row) => (row.items || []).forEach((it) => { if (it.backdrop) list.push(it.backdrop); }));
    return [...new Set(list)].slice(0, 20);
  } catch { return []; }
}
function startBackground(host) {
  trendingBackdrops().then((imgs) => {
    if (!imgs.length) return;
    const a = host.querySelector('.wl-bg.a'); const b = host.querySelector('.wl-bg.b');
    let i = 0, showA = true;
    const tick = () => {
      const url = imgs[i % imgs.length]; i++;
      const cur = showA ? a : b; const other = showA ? b : a;
      cur.style.backgroundImage = `url(${url})`; cur.classList.add('on'); other.classList.remove('on');
      showA = !showA;
    };
    tick(); clearInterval(bgTimer); bgTimer = setInterval(tick, 8000);
  });
}

function initials(name) { return (name || '?').slice(0, 2).toUpperCase(); }

async function show() {
  injectStyles();
  let host = document.getElementById('welcome');
  if (!host) { host = document.createElement('div'); host.id = 'welcome'; document.body.appendChild(host); }
  host.classList.remove('hidden');
  const last = localStorage.getItem(LAST_USER) || '';
  host.innerHTML = `
    <div class="wl-bg a"></div><div class="wl-bg b"></div><div class="wl-scrim"></div>
    <div class="wl-top"><span class="wl-mark">${MARK}</span><span class="wl-word">NickSeer</span></div>
    <div class="wl-card">
      <div class="wl-hi">Welcome back</div>
      <h1 class="wl-h1">Sign in to NickSeer</h1>
      <div class="wl-sub">Your family movie & TV hub</div>
      ${last ? `<div class="wl-last" id="wlLast"><span class="av">${initials(last)}</span>Continue as <b style="color:#fff">${last}</b></div>` : ''}
      <div class="wl-field"><label>Username</label><input id="wlUser" autocomplete="username" value="${last}"></div>
      <div class="wl-field"><label>Password</label><input id="wlPass" type="password" autocomplete="current-password"></div>
      <button class="wl-btn" id="wlGo">Sign in</button>
      <div class="wl-or">or</div>
      <button class="wl-plex" id="wlPlex"><svg width="18" height="18" viewBox="0 0 24 24"><path fill="#1b1b1b" d="M5 3h5l6 9-6 9H5l6-9z"/></svg> Sign in with Plex</button>
      <div class="wl-err" id="wlErr"></div>
    </div>`;
  startBackground(host);

  const err = host.querySelector('#wlErr');
  const goLocal = async () => {
    const username = host.querySelector('#wlUser').value.trim();
    const password = host.querySelector('#wlPass').value;
    err.textContent = '';
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) }).then((x) => x.json()).catch((e) => ({ ok: false, error: e.message }));
    if (r.ok) { setToken(r.token); localStorage.setItem(LAST_USER, r.user.username); finish(host); }
    else err.textContent = r.error || 'Sign in failed';
  };
  host.querySelector('#wlGo').addEventListener('click', goLocal);
  host.querySelector('#wlPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') goLocal(); });
  const lastChip = host.querySelector('#wlLast'); if (lastChip) lastChip.addEventListener('click', () => host.querySelector('#wlPass').focus());
  host.querySelector('#wlPlex').addEventListener('click', () => plexLogin(host, err));

  setTimeout(() => { const f = host.querySelector(last ? '#wlPass' : '#wlUser'); if (f) f.focus(); }, 80);
}

async function plexLogin(host, err) {
  err.textContent = 'Opening Plex…';
  let pin;
  try { pin = await fetch('/api/auth/plex/pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ forwardUrl: location.origin }) }).then((r) => r.json()); }
  catch (e) { err.textContent = e.message; return; }
  if (!pin.ok) { err.textContent = pin.error || 'Plex PIN failed'; return; }
  const win = window.open(pin.authUrl, '_blank', 'width=820,height=740');
  err.textContent = 'Approve in the Plex window…';
  const started = Date.now();
  const poll = async () => {
    if (Date.now() - started > 5 * 60 * 1000) { err.textContent = 'Timed out — try again.'; return; }
    try {
      const r = await fetch('/api/auth/plex/check/' + pin.id).then((x) => x.json());
      if (r.ok && !r.pending && r.token) { setToken(r.token); localStorage.setItem(LAST_USER, r.user.username); try { if (win) win.close(); } catch {} finish(host); return; }
    } catch { /* keep polling */ }
    setTimeout(poll, 2000);
  };
  poll();
}

function finish(host) { clearInterval(bgTimer); bgTimer = null; host.classList.add('hidden'); location.reload(); }

async function maybeShow() {
  let st; try { st = await fetch('/api/auth/status').then((r) => r.json()); } catch { return; }
  if (!st.enabled) return;                 // login off → nothing to do
  const t = token();
  if (t) { try { const me = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + t } }).then((r) => r.json()); if (me.ok) return; } catch { /* fallthrough */ } }
  show();                                  // no valid session → welcome screen
}

// Take over whenever the app signals auth is required (covers logout/expiry).
document.addEventListener('auth:required', () => { localStorage.removeItem('nickseer_token'); show(); });
// Hide the app's plain login overlay if it appears (we present our own).
const obs = new MutationObserver(() => { const lg = document.getElementById('login'); if (lg && !lg.classList.contains('hidden')) { lg.classList.add('hidden'); show(); } });
obs.observe(document.body, { childList: true, subtree: true });

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(maybeShow, 200));
else setTimeout(maybeShow, 200);

// Record last user on any successful login done elsewhere (e.g. menu.js).
if (!window.__nsLastUserHook) {
  window.__nsLastUserHook = true;
  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const res = await origFetch.apply(this, arguments);
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (url.includes('/api/auth/login') || url.includes('/api/auth/plex/check/')) {
        res.clone().json().then((j) => { if (j && j.ok && j.user && j.user.username) localStorage.setItem(LAST_USER, j.user.username); }).catch(() => {});
      }
    } catch { /* ignore */ }
    return res;
  };
}

import { escHTML } from './util.js';
// login-enhance.js — Aegean Login Overlay with Netflix-Style Dynamic Trending Wallpaper.
// Client-side auth handler

const TOKEN_KEY = 'nickseer_token';
function token() { return localStorage.getItem(TOKEN_KEY) || ''; }
function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
function authHeaders() { const t = token(); return t ? { Authorization: 'Bearer ' + t } : {}; }

const LOGO_SVG = `<svg viewBox="0 0 64 64" width="58" height="58" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="nickseer"><rect width="64" height="64" rx="16" fill="#1866A8"/><path d="M17 48V16h9v32z" fill="#fff"/><path d="M38 16h9v32h-9z" fill="#fff"/><path d="M17 16h9l21 32h-9z" fill="#8EC1EC"/></svg>`;

export async function getMe() {
  if (!token()) return null;
  try {
    const r = await fetch('/api/auth/me', { headers: authHeaders() }).then((x) => x.json());
    return r.ok ? r.user : null;
  } catch {
    return null;
  }
}

async function authStatus() {
  try { return await fetch('/api/auth/status').then((r) => r.json()); }
  catch { return { enabled: false, hasAdmin: false, plexLogin: false }; }
}

async function doLogin(username, password) {
  try {
    return await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    }).then((r) => r.json());
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function fetchWallpaper() {
  try {
    const res = await fetch('/api/public/backdrops').then((r) => r.json());
    return res.posters || [];
  } catch {
    return [];
  }
}

// ---------- Full-screen initial login (renders into #login) ----------
export function renderAegeanLogin(onSuccess) {
  const host = document.getElementById('login');
  if (!host) return;
  host.classList.remove('hidden');

  const paint = async () => {
    const [st, posters] = await Promise.all([authStatus(), fetchWallpaper()]);

    const mosaicHtml = (posters && posters.length)
      ? `<div class="login-wallpaper-layer">
           <div class="login-poster-mosaic">
             ${posters.slice(0, 32).map((p) => `<div class="login-poster-item"><img src="${p}" alt="" loading="lazy" /></div>`).join('')}
           </div>
         </div>
         <div class="login-vignette-overlay"></div>`
      : '';

    host.innerHTML = `
      ${mosaicHtml}
      <div class="login-card">
        <div class="login-logo">${LOGO_SVG}</div>
        <h1>Sign in to NickSeer</h1>
        <p>Your family movie &amp; TV hub</p>
        <div class="login-field"><label>Username</label><input id="laUser" autocomplete="username"></div>
        <div class="login-field"><label>Password</label><input id="laPass" type="password" autocomplete="current-password"></div>
        <button class="login-btn" id="laGo">Sign in</button>
        ${st.plexLogin ? `<div class="login-or">or</div><button class="login-plex" id="laPlex"><svg width="18" height="18" viewBox="0 0 24 24"><path fill="#1b1b1b" d="M4 2h6l6 10-6 10H4l6-10z"/></svg> Sign in with Plex</button>` : ''}
        <div class="login-err" id="laErr"></div>
      </div>`;

    const err = host.querySelector('#laErr');
    const goLocal = async () => {
      const username = host.querySelector('#laUser').value.trim();
      const password = host.querySelector('#laPass').value;
      err.textContent = '';
      const r = await doLogin(username, password);
      if (r.ok) { setToken(r.token); finish(r.user); }
      else err.textContent = r.error || 'Sign in failed';
    };

    host.querySelector('#laGo').addEventListener('click', goLocal);
    host.querySelector('#laPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') goLocal(); });
    host.querySelector('#laUser').addEventListener('keydown', (e) => { if (e.key === 'Enter') host.querySelector('#laPass').focus(); });

    const plexBtn = host.querySelector('#laPlex');
    if (plexBtn) plexBtn.addEventListener('click', () => plexOAuthFlow(null, (user) => finish(user), (msg) => { err.textContent = msg; }));

    setTimeout(() => host.querySelector('#laUser')?.focus(), 80);
  };

  const finish = (user) => { host.classList.add('hidden'); onSuccess && onSuccess(user); };
  paint();
}

// ---------- Plex OAuth ----------
async function plexOAuthFlow(expectedUsername, onOk, onErr) {
  let data;
  try {
    const res = await fetch('/api/auth/plex/pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forwardUrl: location.origin })
    });
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(text || 'Plex PIN endpoint returned invalid response');
    }
  } catch (e) {
    onErr(e.message);
    return;
  }
  if (!data.ok) { onErr(data.error || 'Plex PIN failed'); return; }

  const win = window.open(data.authUrl, '_blank', 'width=820,height=740');
  const started = Date.now();
  const poll = async () => {
    if (Date.now() - started > 5 * 60 * 1000) { onErr('Timed out — try again.'); return; }
    try {
      const res = await fetch('/api/auth/plex/check/' + data.id);
      const text = await res.text();
      const r = JSON.parse(text);
      if (r.ok && !r.pending && r.token) {
        if (expectedUsername && r.user.username.toLowerCase() !== expectedUsername.toLowerCase()) {
          onErr(`Signed in to Plex as "${escHTML(r.user.username)}", not "${expectedUsername}". Approve with the right Plex account and try again.`);
          try { if (win) win.close(); } catch { /* ignore */ }
          return;
        }
        setToken(r.token);
        try { if (win) win.close(); } catch { /* ignore */ }
        onOk(r.user);
        return;
      }
    } catch { /* keep polling */ }
    setTimeout(poll, 2000);
  };
  poll();
}

export function promptReauth(username, { isPlex = false, thumb = '' } = {}) {
  return new Promise((resolve) => {
    let host = document.getElementById('reauth');
    if (!host) {
      host = document.createElement('div');
      host.id = 'reauth';
      host.className = 'login-overlay';
      document.body.appendChild(host);
    }
    host.classList.remove('hidden');

    const initials = (username || '?').slice(0, 2).toUpperCase();
    host.innerHTML = `
      <div class="login-card" style="max-width:380px;">
        <div class="la-avatar" style="${thumb ? `background-image:url('${thumb}');background-size:cover;` : ''}">${thumb ? '' : initials}</div>
        <div class="la-name" style="font-size:22px;font-weight:900;color:#fff;margin-bottom:4px;">${username}</div>
        <div class="la-hint" style="color:#9aa7bd;font-size:13px;margin-bottom:18px;">${isPlex ? 'Sign in with this Plex account to continue as ' + username + '.' : 'Enter the password for ' + username + '.'}</div>
        ${isPlex
          ? `<button class="login-plex" id="raPlex"><svg width="18" height="18" viewBox="0 0 24 24"><path fill="#1b1b1b" d="M4 2h6l6 10-6 10H4l6-10z"/></svg> Sign in with Plex</button>`
          : `<div class="login-field"><label>Password</label><input id="raPass" type="password" autocomplete="current-password"></div><button class="login-btn" id="raGo">Continue</button>`}
        <div class="login-err" id="raErr"></div>
        <button class="btn btn-ghost" id="raCancel" data-nav style="width:100%;margin-top:10px;padding:10px;justify-content:center;text-align:center;">Cancel</button>
      </div>`;

    const err = host.querySelector('#raErr');
    const close = (result) => { host.classList.add('hidden'); resolve(result); };

    host.querySelector('#raCancel').addEventListener('click', () => close({ ok: false, cancelled: true }));

    if (isPlex) {
      host.querySelector('#raPlex').addEventListener('click', () => {
        plexOAuthFlow(username, (user) => close({ ok: true, user, token: token() }), (msg) => { err.textContent = msg; });
      });
    } else {
      const goLocal = async () => {
        const password = host.querySelector('#raPass').value;
        err.textContent = '';
        const r = await doLogin(username, password);
        if (r.ok) {
          setToken(r.token);
          close({ ok: true, user: r.user, token: r.token });
        } else {
          err.textContent = r.error || 'Sign in failed';
        }
      };
      host.querySelector('#raGo').addEventListener('click', goLocal);
      host.querySelector('#raPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') goLocal(); });
      setTimeout(() => host.querySelector('#raPass')?.focus(), 60);
    }
  });
}

export default { renderAegeanLogin, promptReauth, getMe };

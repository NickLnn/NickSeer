// login-enhance.js — the initial full-screen sign-in (rendered into #login),
// PLUS a lightweight per-profile re-authentication modal used by the "Who's
// watching?" picker in app.js.
//
// FIX IN THIS VERSION: promptReauth()'s LOCAL PASSWORD path resolved with a
// fresh token but never actually called setToken() to persist it — so after
// switching profiles and entering a password successfully, the browser kept
// using the PREVIOUS user's token the entire time (e.g. always "NickLn" even
// after "signing in" as Babis). The Plex OAuth path was already correct
// (plexOAuthFlow() does call setToken()); only the password path was missing
// it. That single missing call is why "Request As" never changed.
const TOKEN_KEY = 'nickseer_token';
function token() { return localStorage.getItem(TOKEN_KEY) || ''; }
function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
function authHeaders() { const t = token(); return t ? { Authorization: 'Bearer ' + t } : {}; }

export async function getMe() {
  if (!token()) return null;
  try { const r = await fetch('/api/auth/me', { headers: authHeaders() }).then((x) => x.json()); return r.ok ? r.user : null; }
  catch { return null; }
}
async function authStatus() {
  try { return await fetch('/api/auth/status').then((r) => r.json()); }
  catch { return { enabled: false, plexLogin: false, hasAdmin: false }; }
}
async function doLogin(username, password) {
  try { return await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) }).then((r) => r.json()); }
  catch (e) { return { ok: false, error: e.message }; }
}

function injectStyles() {
  if (document.getElementById('la-styles')) return;
  const css = `
  .la-modal{position:fixed;inset:0;z-index:150;display:grid;place-items:center;background:rgba(4,7,13,.88);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);}
  .la-modal.hidden{display:none;}
  .la-box{width:min(360px,92vw);}
  .la-avatar{position:relative;width:64px;height:64px;border-radius:16px;margin:0 auto 16px;display:grid;place-items:center;font-size:22px;font-weight:800;color:#fff;background:linear-gradient(135deg,#2E9BD6,#0f5687);box-shadow:0 8px 22px rgba(30,136,199,.4);}
  .la-name{text-align:center;font-size:20px;font-weight:900;color:#fff;margin-bottom:4px;letter-spacing:-.01em;}
  .la-hint{text-align:center;color:#9aa7bd;font-size:13px;margin-bottom:18px;}
  `;
  const st = document.createElement('style'); st.id = 'la-styles'; st.textContent = css; document.head.appendChild(st);
}

// ---------- Full-screen initial login (renders into #login) ----------
export function renderAegeanLogin(onSuccess) {
  injectStyles();
  const host = document.getElementById('login');
  if (!host) return;
  host.classList.remove('hidden');
  const paint = async () => {
    const st = await authStatus();
    host.innerHTML = `
      <div class="login-card">
        <div class="login-logo"></div>
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

// ---------- Plex OAuth (shared by full login + per-profile re-auth) ----------
// If `expectedUsername` is given, the returned Plex identity MUST match it —
// otherwise we refuse the switch rather than silently signing in as whoever
// happened to approve the Plex popup.
async function plexOAuthFlow(expectedUsername, onOk, onErr) {
  let data;
  try { data = await fetch('/api/auth/plex/pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ forwardUrl: location.origin }) }).then((r) => r.json()); }
  catch (e) { onErr(e.message); return; }
  if (!data.ok) { onErr(data.error || 'Plex PIN failed'); return; }
  const win = window.open(data.authUrl, '_blank', 'width=820,height=740');
  const started = Date.now();
  const poll = async () => {
    if (Date.now() - started > 5 * 60 * 1000) { onErr('Timed out — try again.'); return; }
    try {
      const r = await fetch('/api/auth/plex/check/' + data.id).then((x) => x.json());
      if (r.ok && !r.pending && r.token) {
        if (expectedUsername && r.user.username.toLowerCase() !== expectedUsername.toLowerCase()) {
          onErr(`Signed in to Plex as "${r.user.username}", not "${expectedUsername}". Approve with the right Plex account and try again.`);
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

// ---------- Per-profile re-auth modal ----------
// Resolves { ok:true, user, token } on success, { ok:false, cancelled:true }
// if the user backs out, or { ok:false, error } on a failed attempt.
export function promptReauth(username, { isPlex = false, thumb = '' } = {}) {
  injectStyles();
  return new Promise((resolve) => {
    let host = document.getElementById('reauth');
    if (!host) { host = document.createElement('div'); host.id = 'reauth'; host.className = 'la-modal'; document.body.appendChild(host); }
    host.classList.remove('hidden');
    const initials = (username || '?').slice(0, 2).toUpperCase();
    host.innerHTML = `
      <div class="login-card la-box">
        <div class="la-avatar" style="${thumb ? `background-image:url('${thumb}');background-size:cover;` : ''}">${thumb ? '' : initials}</div>
        <div class="la-name">${username}</div>
        <div class="la-hint">${isPlex ? 'Sign in with this Plex account to continue as ' + username + '.' : 'Enter the password for ' + username + '.'}</div>
        ${isPlex
    ? `<button class="login-plex" id="raPlex"><svg width="18" height="18" viewBox="0 0 24 24"><path fill="#1b1b1b" d="M4 2h6l6 10-6 10H4l6-10z"/></svg> Sign in with Plex</button>`
    : `<div class="login-field"><label>Password</label><input id="raPass" type="password" autocomplete="current-password"></div><button class="login-btn" id="raGo">Continue</button>`}
        <div class="login-err" id="raErr"></div>
        <button class="btn btn-ghost" id="raCancel" data-nav style="width:100%;margin-top:10px;">Cancel</button>
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
          // *** THE FIX ***
          // This call was MISSING before — the promise resolved with a fresh
          // token, but nothing ever persisted it, so the browser kept using
          // whichever token was already stored (e.g. the admin's). Persist it
          // FIRST, then resolve, so by the time app.js reloads the page the
          // correct account's token is already the one in localStorage.
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

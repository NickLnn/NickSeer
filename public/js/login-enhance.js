import { escHTML } from './util.js';
import { passkeySupported, passkeyLabel, passkeyLogin } from './passkey-client.js';
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
        ${passkeySupported() ? `<button class="login-passkey" id="laPasskey" type="button"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="M10.85 12.15 19 4"/><path d="m18 5 2 2"/><path d="m15 8 2 2"/></svg> Sign in with ${passkeyLabel()}</button>` : ''}
        <div class="login-err" id="laErr"></div>
      </div>`;

    const err = host.querySelector('#laErr');
    const pkBtn = host.querySelector('#laPasskey');
    if (pkBtn) pkBtn.addEventListener('click', async () => {
      err.textContent = '';
      const r = await passkeyLogin();
      if (r.ok) { setToken(r.token); try { localStorage.setItem('nickseer_last_user', r.user.username); } catch { /* ignore */ } finish(r.user); }
      else if (!r.cancelled) err.textContent = r.error || 'Sign in failed';
    });
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
//
// Two ways to get the user to Plex and back:
//
//  * POPUP (desktop): open Plex in a small window, poll the PIN from this
//    page, close the popup when it is claimed.
//
//  * REDIRECT (phones, and the app installed to the Home Screen): send THIS
//    page to Plex. Plex sends it back to `/?plexpin=…&plexstate=…` and
//    resumePlexSignIn() finishes the sign-in during boot.
//
// The popup flow cannot work on a phone, and looped (reported by Nick
// 2026-11-12): Plex opened in a new tab / in-app browser, and after approval
// Plex forwarded THAT tab back to NickSeer — a fresh copy of the app with no
// token, showing the sign-in screen again. The tab that was polling for the
// token was in the background, where mobile browsers freeze timers, so the
// token was never stored anywhere. The pending PIN is now also kept in
// localStorage, so any copy of the app that boots can finish the job.
const PLEX_PENDING_KEY = 'nickseer_plex_pending';
const PLEX_PENDING_TTL = 10 * 60 * 1000;

function preferRedirect() {
  try {
    if (window.navigator.standalone === true) return true;
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia('(pointer: coarse)').matches) return true;
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  } catch { return false; }
}

function readPending() {
  try {
    const p = JSON.parse(localStorage.getItem(PLEX_PENDING_KEY) || 'null');
    if (!p || !p.id || !p.state || Date.now() - Number(p.at || 0) > PLEX_PENDING_TTL) {
      if (p) localStorage.removeItem(PLEX_PENDING_KEY);
      return null;
    }
    return p;
  } catch { return null; }
}
function clearPending() { try { localStorage.removeItem(PLEX_PENDING_KEY); } catch { /* ignore */ } }

async function checkPlexPin(id, state) {
  const res = await fetch('/api/auth/plex/check/' + encodeURIComponent(id) + '?state=' + encodeURIComponent(state));
  const r = JSON.parse(await res.text());
  // 403 = the server refused the PIN/state pair. Retrying cannot help.
  if (res.status === 403) r.fatal = true;
  return r;
}

function wrongAccountMsg(got, expected) {
  return `Signed in to Plex as "${got}", not "${expected}". Approve with the right Plex account and try again.`;
}

export async function plexOAuthFlow(expectedUsername, onOk, onErr) {
  const redirect = preferRedirect();
  // A popup is only allowed while the tap is still "live", i.e. before the
  // first await — so open it blank now and point it at Plex once we have a PIN.
  let win = null;
  if (!redirect) { try { win = window.open('', '_blank', 'width=820,height=740'); } catch { win = null; } }
  const closeWin = () => { try { if (win) win.close(); } catch { /* ignore */ } };

  let data;
  try {
    const res = await fetch('/api/auth/plex/pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forwardUrl: location.origin + '/' })
    });
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(text || 'Plex PIN endpoint returned invalid response');
    }
  } catch (e) {
    closeWin();
    onErr(e.message);
    return;
  }
  if (!data.ok) { closeWin(); onErr(data.error || 'Plex PIN failed'); return; }

  try {
    localStorage.setItem(PLEX_PENDING_KEY, JSON.stringify({ id: data.id, state: data.state, expected: expectedUsername || '', at: Date.now() }));
  } catch { /* private mode — the URL params still carry it back */ }

  // Phone, installed app, or the popup was blocked: go there in this window.
  if (redirect || !win) { location.href = data.authUrl; return; }

  try { win.location.href = data.authUrl; } catch { closeWin(); location.href = data.authUrl; return; }
  const started = Date.now();
  const poll = async () => {
    if (Date.now() - started > 5 * 60 * 1000) { clearPending(); onErr('Timed out — try again.'); return; }
    try {
      const r = await checkPlexPin(data.id, data.state);
      if (r.ok && !r.pending && r.token) {
        clearPending();
        closeWin();
        if (expectedUsername && r.user.username.toLowerCase() !== expectedUsername.toLowerCase()) {
          onErr(wrongAccountMsg(r.user.username, expectedUsername));
          return;
        }
        setToken(r.token);
        onOk(r.user);
        return;
      }
      if (r.fatal) { clearPending(); closeWin(); onErr(r.error || 'Plex sign-in failed'); return; }
    } catch { /* keep polling */ }
    setTimeout(poll, 2000);
  };
  poll();
}

// Called once at boot, before the auth check. Finishes a Plex sign-in that was
// started by a page that is no longer the one running (redirect flow, or a
// popup/new tab that Plex forwarded back to us). Resolves to
//   null                       nothing was pending
//   { ok: true, user }         token stored
//   { ok: false, error }       approved with the wrong account, or rejected
export async function resumePlexSignIn() {
  let id = '', state = '', fromUrl = false;
  try {
    const u = new URL(location.href);
    id = u.searchParams.get('plexpin') || '';
    state = u.searchParams.get('plexstate') || '';
    if (id || state) {
      fromUrl = true;
      u.searchParams.delete('plexpin');
      u.searchParams.delete('plexstate');
      history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    }
  } catch { /* ignore */ }

  const pending = readPending();
  if ((!id || !state) && pending) { id = pending.id; state = pending.state; }
  if (!id || !state) return null;
  const expected = (pending && String(pending.id) === String(id) && pending.expected) || '';

  // Arriving from Plex means the PIN was just approved, so give plex.tv a few
  // seconds to report it. A leftover pending PIN only earns a single look.
  const tries = fromUrl ? 8 : 1;
  let lastErr = '';
  for (let i = 0; i < tries; i++) {
    let r = null;
    try { r = await checkPlexPin(id, state); } catch { /* network blip — retry */ }
    if (r && r.ok && !r.pending && r.token) {
      clearPending();
      // This copy is the leftover desktop popup: the page that opened it is
      // polling and will take it from here.
      if (window.opener && !preferRedirect()) { try { window.close(); } catch { /* ignore */ } }
      if (expected && r.user.username.toLowerCase() !== expected.toLowerCase()) {
        return { ok: false, error: wrongAccountMsg(r.user.username, expected) };
      }
      setToken(r.token);
      try {
        localStorage.setItem('nickseer_last_user', r.user.username);
        localStorage.removeItem('nickseer_profile');
      } catch { /* ignore */ }
      return { ok: true, user: r.user };
    }
    if (r && r.ok === false) lastErr = r.error || '';
    if (r && r.fatal) break;
    if (i < tries - 1) await new Promise((res) => setTimeout(res, 1500));
  }
  if (fromUrl || lastErr) clearPending();
  if (fromUrl) return { ok: false, error: lastErr || 'Plex did not confirm the sign-in — try again.' };
  return null;
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

export default { renderAegeanLogin, promptReauth, getMe, plexOAuthFlow, resumePlexSignIn };

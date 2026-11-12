import { escHTML } from './util.js';
import { plexOAuthFlow } from './login-enhance.js';
import { pushStatus, enablePush, disablePush } from './push-client.js';
import { toast } from './util.js';
import { passkeySupported, passkeyLabel, passkeyRegister, passkeyCount, passkeyRemoveAll } from './passkey-client.js';
// menu.js — profile dropdown on the top-bar avatar.
// Always shows: current user, Switch profile, Settings, "Sign in with Plex"
// (tester for the OAuth flow), and Log out. Self-contained; re-binds the avatar
// and injects its own styles — no app.js changes needed.

function token() { return localStorage.getItem('nickseer_token') || ''; }
function getProfile() { try { return JSON.parse(localStorage.getItem('nickseer_profile') || 'null'); } catch { return null; } }
function initials(name) { return (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase(); }

function injectStyles() {
  if (document.getElementById('menu-styles')) return;
  const css = `
  .pm-wrap{position:relative;}
  .pm-pop{position:absolute;top:52px;right:0;z-index:120;min-width:236px;background:rgba(20,20,28,.98);
    border:1px solid rgba(255,255,255,.1);border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.6);padding:8px;backdrop-filter:blur(12px);animation:pmIn .16s ease;}
  .pm-pop.hidden{display:none;}
  @keyframes pmIn{from{opacity:0;transform:translateY(-6px);}to{opacity:1;transform:none;}}
  .pm-head{display:flex;align-items:center;gap:10px;padding:10px 10px 12px;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:6px;}
  .pm-av{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;font-weight:800;color:#fff;background:linear-gradient(135deg,#6d5ef0,#a78bfa);flex:0 0 auto;background-size:cover;}
  .pm-name{font-weight:800;color:#fff;line-height:1.1;} .pm-sub{font-size:12px;color:#9aa0ad;}
  .pm-item{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:transparent;border:0;color:#e9e9ef;padding:11px 12px;border-radius:10px;font-weight:600;font-size:14px;cursor:pointer;}
  .pm-item:hover,.pm-item.nav-focus{background:rgba(255,255,255,.09);}
  .pm-item.plex{color:#ffcf6a;} .pm-item.danger{color:#ff9a9a;}
  .pm-ic{width:20px;text-align:center;opacity:.9;}
  .plexmodal{position:fixed;inset:0;z-index:130;display:grid;place-items:center;background:rgba(6,6,10,.85);backdrop-filter:blur(6px);}
  .plexmodal.hidden{display:none;}
  .plexmodal .box{width:min(420px,92vw);background:#12121a;border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:28px;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,.6);}
  .plexmodal h3{margin:0 0 6px;font-size:22px;font-weight:900;} .plexmodal p{color:#9aa0ad;margin:0 0 18px;}
  .plexmodal .btn2{padding:12px 18px;border:0;border-radius:12px;font-weight:800;cursor:pointer;}
  .plexmodal .go{background:#e5a00d;color:#1b1b1b;} .plexmodal .cx{background:rgba(255,255,255,.1);color:#fff;margin-left:8px;}`;
  const st = document.createElement('style'); st.id = 'menu-styles'; st.textContent = css; document.head.appendChild(st);
}

async function authStatus() { try { return await fetch('/api/auth/status').then((r) => r.json()); } catch { return { enabled: false, plexLogin: false }; } }
async function whoami() { const t = token(); if (!t) return null; try { const r = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + t } }).then((x) => x.json()); return r.ok ? r.user : null; } catch { return null; } }

async function build() {
  const btn = document.getElementById('profileBtn');
  if (!btn) return;
  injectStyles();
  const fresh = btn.cloneNode(true);        // strip app.js's old click handler
  btn.parentNode.replaceChild(fresh, btn);
  const wrap = document.createElement('div'); wrap.className = 'pm-wrap';
  fresh.parentNode.insertBefore(wrap, fresh); wrap.appendChild(fresh);
  const pop = document.createElement('div'); pop.className = 'pm-pop hidden'; wrap.appendChild(pop);

  const render = async () => {
    const [st, me, push] = await Promise.all([authStatus(), whoami(), pushStatus()]);
    const pkCount = (me && passkeySupported()) ? await passkeyCount() : -1;
    const pushLabel = { on: 'Notifications: On', off: 'Turn on notifications', denied: 'Notifications blocked', 'needs-install': 'Notifications (install app first)' }[push];
    const prof = getProfile();
    const displayName = (me && me.username) || (prof && prof.name) || 'Guest';
    const sub = me ? (me.role === 'admin' ? '🛡️ Admin' : 'Signed in') : (prof ? 'Profile' : 'Not signed in');
    pop.innerHTML = `
      <div class="pm-head"><div class="pm-av">${initials(displayName)}</div><div><div class="pm-name">${displayName}</div><div class="pm-sub">${sub}</div></div></div>
      ${(!st.enabled || !me || me.role === 'admin') ? '<button class="pm-item" data-nav data-act="switch"><span class="pm-ic">👥</span> Switch profile</button>' : ''}
      <button class="pm-item" data-nav data-act="settings"><span class="pm-ic">⚙</span> Settings</button>
      ${pushLabel ? `<button class="pm-item" data-nav data-act="push" data-push="${push}"><span class="pm-ic">🔔</span> ${pushLabel}</button>` : ''}
      ${pkCount >= 0 ? `<button class="pm-item" data-nav data-act="passkey" data-count="${pkCount}"><span class="pm-ic">🔑</span> ${pkCount ? `${passkeyLabel()} sign-in: On` : `Set up ${passkeyLabel()} sign-in`}</button>` : ''}
      <button class="pm-item plex" data-nav data-act="plex"><span class="pm-ic">◐</span> Sign in with Plex</button>
      <button class="pm-item danger" data-nav data-act="logout"><span class="pm-ic">⎋</span> Log out</button>`;
    pop.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => act(b.dataset.act, b)));
  };
  const toggle = async () => { if (pop.classList.contains('hidden')) { await render(); pop.classList.remove('hidden'); } else pop.classList.add('hidden'); };
  fresh.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) pop.classList.add('hidden'); });
  document.addEventListener('nav:back', () => pop.classList.add('hidden'));
}

function act(kind, btn) {
  document.querySelector('.pm-pop')?.classList.add('hidden');
  if (kind === 'switch') {
    localStorage.removeItem('nickseer_profile');
    document.dispatchEvent(new CustomEvent('auth:choose-profile'));
  }
  else if (kind === 'settings') {
    document.getElementById('settingsBtn')?.click();
  }
  else if (kind === 'logout') {
    localStorage.removeItem('nickseer_token');
    localStorage.removeItem('nickseer_profile');
    document.dispatchEvent(new CustomEvent('auth:logout'));
  }
  else if (kind === 'plex') {
    startPlexLogin();
  }
  else if (kind === 'push') {
    togglePush(btn && btn.dataset.push);
  }
  else if (kind === 'passkey') {
    togglePasskey(Number(btn && btn.dataset.count) || 0);
  }
}

// ---- Face ID / passkey sign-in for this account ----
async function togglePasskey(count) {
  const label = passkeyLabel();
  if (count > 0) {
    // Already set up: offer this device too, or removal.
    if (window.confirm(`${label} sign-in is on (${count} device${count === 1 ? '' : 's'}).\n\nOK = add this device too\nCancel = more options`)) { /* fall through to add */ }
    else {
      if (window.confirm(`Remove ${label} sign-in from ALL your devices? You will sign in with your password or Plex again.`)) {
        const r = await passkeyRemoveAll();
        toast(r.ok ? `${label} sign-in removed` : (r.error || 'Could not remove'), r.ok ? 'ok' : 'bad');
      }
      return;
    }
  }
  const r = await passkeyRegister();
  if (r.ok) toast(`${label} sign-in is ready on this device`, 'ok');
  else if (!r.cancelled) toast(r.error || `Could not set up ${label}`, 'bad');
}

// ---- Notifications for this device ----
// No await before enablePush(): the permission prompt needs the live tap.
function togglePush(state) {
  if (state === 'needs-install') { toast('Add NickSeer to your Home Screen first (Share → Add to Home Screen), then turn notifications on from there.', 'ok'); return; }
  if (state === 'denied') { toast('Notifications are blocked for NickSeer in this device’s settings.', 'bad'); return; }
  if (state === 'on') { disablePush().then((r) => toast(r.ok ? 'Notifications turned off on this device' : (r.error || 'Could not turn off'), r.ok ? 'ok' : 'bad')); return; }
  enablePush().then((r) => toast(r.ok ? 'Notifications are on — a test is on its way' : (r.error || 'Could not turn on notifications'), r.ok ? 'ok' : 'bad'))
    .catch((e) => toast(e.message || 'Could not turn on notifications', 'bad'));
}

// ---- Plex OAuth tester ----
async function startPlexLogin() {
  let modal = document.getElementById('plexModal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'plexModal'; modal.className = 'plexmodal'; document.body.appendChild(modal); }
  modal.classList.remove('hidden');
  modal.innerHTML = `<div class="box"><h3>Sign in with Plex</h3><p>Requesting a secure PIN…</p></div>`;

  const closeBtn = `<button class="btn2 cx" onclick="document.getElementById('plexModal').classList.add('hidden')">Close</button>`;
  modal.querySelector('.box').innerHTML = `
    <h3>Approve in Plex</h3>
    <p>Sign in to Plex and approve. This will finish automatically.</p>${closeBtn}`;

  // Shared with the login screen: popup on desktop, same-window redirect on
  // phones / the installed app (where a popup can never hand the token back).
  plexOAuthFlow(null, (user) => {
    localStorage.removeItem('nickseer_profile');
    modal.querySelector('.box').innerHTML = `<h3>✓ Signed in</h3><p>Welcome, ${escHTML(user.username)}${user.role === 'admin' ? ' (admin)' : ''}. Reloading…</p>`;
    setTimeout(() => location.reload(), 900);
  }, (msg) => {
    modal.querySelector('.box').innerHTML = `<h3>Failed</h3><p>${escHTML(msg || 'Plex sign-in failed')}</p>${closeBtn}`;
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(build, 300));
else setTimeout(build, 300);


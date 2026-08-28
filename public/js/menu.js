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
    const [st, me] = await Promise.all([authStatus(), whoami()]);
    const prof = getProfile();
    const displayName = (me && me.username) || (prof && prof.name) || 'Guest';
    const sub = me ? (me.role === 'admin' ? '🛡️ Admin' : 'Signed in') : (prof ? 'Profile' : 'Not signed in');
    pop.innerHTML = `
      <div class="pm-head"><div class="pm-av">${initials(displayName)}</div><div><div class="pm-name">${displayName}</div><div class="pm-sub">${sub}</div></div></div>
      <button class="pm-item" data-nav data-act="switch"><span class="pm-ic">👥</span> Switch profile</button>
      <button class="pm-item" data-nav data-act="settings"><span class="pm-ic">⚙</span> Settings</button>
      <button class="pm-item plex" data-nav data-act="plex"><span class="pm-ic">◐</span> Sign in with Plex</button>
      <button class="pm-item danger" data-nav data-act="logout"><span class="pm-ic">⎋</span> Log out</button>`;
    pop.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => act(b.dataset.act)));
  };
  const toggle = async () => { if (pop.classList.contains('hidden')) { await render(); pop.classList.remove('hidden'); } else pop.classList.add('hidden'); };
  fresh.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) pop.classList.add('hidden'); });
  document.addEventListener('nav:back', () => pop.classList.add('hidden'));
}

function act(kind) {
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
}

// ---- Plex OAuth tester ----
async function startPlexLogin() {
  let modal = document.getElementById('plexModal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'plexModal'; modal.className = 'plexmodal'; document.body.appendChild(modal); }
  modal.classList.remove('hidden');
  modal.innerHTML = `<div class="box"><h3>Sign in with Plex</h3><p>Requesting a secure PIN…</p></div>`;

  let data;
  try {
    data = await fetch('/api/auth/plex/pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ forwardUrl: location.origin }) }).then((r) => r.json());
  } catch (e) { modal.querySelector('.box').innerHTML = `<h3>Failed</h3><p>${e.message}</p>`; return; }
  if (!data.ok) { modal.querySelector('.box').innerHTML = `<h3>Failed</h3><p>${data.error || 'could not create PIN'}</p><button class="btn2 cx" onclick="document.getElementById('plexModal').classList.add('hidden')">Close</button>`; return; }

  const win = window.open(data.authUrl, '_blank', 'width=800,height=720');
  modal.querySelector('.box').innerHTML = `
    <h3>Approve in Plex</h3>
    <p>A Plex window opened — sign in and approve. This will finish automatically.</p>
    <button class="btn2 go" id="px-open">Re-open Plex</button>
    <button class="btn2 cx" id="px-cancel">Cancel</button>`;
  modal.querySelector('#px-open').onclick = () => window.open(data.authUrl, '_blank', 'width=800,height=720');
  let stopped = false;
  modal.querySelector('#px-cancel').onclick = () => { stopped = true; modal.classList.add('hidden'); };

  // Poll the PIN until claimed.
  const started = Date.now();
  const poll = async () => {
    if (stopped) return;
    if (Date.now() - started > 5 * 60 * 1000) { modal.querySelector('.box').innerHTML = `<h3>Timed out</h3><p>Please try again.</p>`; return; }
    try {
      const r = await fetch('/api/auth/plex/check/' + data.id).then((x) => x.json());
      if (r.ok && !r.pending && r.token) {
        localStorage.setItem('nickseer_token', r.token);
        localStorage.removeItem('nickseer_profile');
        try { if (win) win.close(); } catch { /* ignore */ }
        modal.querySelector('.box').innerHTML = `<h3>✓ Signed in</h3><p>Welcome, ${r.user.username}${r.user.role === 'admin' ? ' (admin)' : ''}. Reloading…</p>`;
        setTimeout(() => location.reload(), 900);
        return;
      }
    } catch { /* keep polling */ }
    setTimeout(poll, 2000);
  };
  poll();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(build, 300));
else setTimeout(build, 300);

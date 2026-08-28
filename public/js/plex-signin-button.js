// plex-signin-button.js — restores "Sign in with Plex" on the login screen.
// Uses the same PIN-based OAuth flow as Seerr/Overseerr:
//   1) POST /api/auth/plex/pin        → { id, code, authUrl }
//   2) open authUrl in a popup (Plex hosts the actual login)
//   3) poll GET /api/auth/plex/check/:id until it returns a token
// Only shows the button when Plex sign-in is enabled (see auth-toggles.js).
//
// SAFE by design: childList-only observer, one-shot guard per login card, no
// attribute watching — this mirrors the crash-fix pattern, so it cannot loop.

function injectStyles() {
  if (document.getElementById('plex-btn-css')) return;
  const css = `
  .plex-signin-wrap{margin-top:14px;}
  .plex-signin-or{display:flex;align-items:center;gap:10px;color:#7d8899;font-size:12px;margin:12px 0;}
  .plex-signin-or::before,.plex-signin-or::after{content:"";flex:1;height:1px;background:rgba(255,255,255,.12);}
  .plex-signin-btn{width:100%;padding:13px;font-size:15px;font-weight:800;border:0;border-radius:12px;cursor:pointer;
    background:#e5a00d;color:#1b1b1b;display:inline-flex;align-items:center;justify-content:center;gap:10px;}
  .plex-signin-btn:hover{filter:brightness(1.05);}
  .plexmodal{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:rgba(6,6,10,.85);backdrop-filter:blur(6px);}
  .plexmodal.hidden{display:none;}
  .plexmodal .box{width:min(420px,92vw);background:#12121a;border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:26px;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,.6);}
  .plexmodal h3{margin:0 0 6px;font-size:20px;font-weight:900;color:#fff;}
  .plexmodal p{color:#9aa0ad;margin:0 0 16px;font-size:14px;}
  .plexmodal .b2{padding:11px 16px;border:0;border-radius:11px;font-weight:800;cursor:pointer;}
  .plexmodal .go{background:#e5a00d;color:#1b1b1b;} .plexmodal .cx{background:rgba(255,255,255,.1);color:#fff;margin-left:8px;}`;
  const st = document.createElement('style'); st.id = 'plex-btn-css'; st.textContent = css; document.head.appendChild(st);
}

async function startPlexLogin() {
  let modal = document.getElementById('plexModal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'plexModal'; modal.className = 'plexmodal'; document.body.appendChild(modal); }
  modal.classList.remove('hidden');
  modal.innerHTML = `<div class="box"><h3>Sign in with Plex</h3><p>Requesting a secure PIN…</p></div>`;
  let data;
  try { data = await fetch('/api/auth/plex/pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ forwardUrl: location.origin }) }).then((r) => r.json()); }
  catch (e) { modal.querySelector('.box').innerHTML = `<h3>Failed</h3><p>${e.message}</p><button class="b2 cx" onclick="document.getElementById('plexModal').classList.add('hidden')">Close</button>`; return; }
  if (!data.ok) { modal.querySelector('.box').innerHTML = `<h3>Failed</h3><p>${data.error || 'could not create PIN'}</p><button class="b2 cx" onclick="document.getElementById('plexModal').classList.add('hidden')">Close</button>`; return; }
  const win = window.open(data.authUrl, '_blank', 'width=800,height=720');
  modal.querySelector('.box').innerHTML = `<h3>Approve in Plex</h3><p>A Plex window opened — sign in and approve. This finishes automatically.</p><button class="b2 go" id="pxOpen">Re-open Plex</button><button class="b2 cx" id="pxCancel">Cancel</button>`;
  modal.querySelector('#pxOpen').onclick = () => window.open(data.authUrl, '_blank', 'width=800,height=720');
  let stopped = false;
  modal.querySelector('#pxCancel').onclick = () => { stopped = true; modal.classList.add('hidden'); };
  const started = Date.now();
  const poll = async () => {
    if (stopped) return;
    if (Date.now() - started > 5 * 60 * 1000) { modal.querySelector('.box').innerHTML = `<h3>Timed out</h3><p>Please try again.</p>`; return; }
    try {
      const r = await fetch('/api/auth/plex/check/' + data.id).then((x) => x.json());
      if (r.ok && !r.pending && r.token) {
        localStorage.setItem('nickseer_token', r.token);
        localStorage.setItem('nickseer_last_user', r.user.username);
        localStorage.removeItem('nickseer_profile');
        try { if (win) win.close(); } catch { /* ignore */ }
        modal.querySelector('.box').innerHTML = `<h3>✓ Signed in</h3><p>Welcome, ${r.user.username}. Reloading…</p>`;
        setTimeout(() => location.reload(), 700);
        return;
      }
    } catch { /* keep polling */ }
    setTimeout(poll, 2000);
  };
  poll();
}

// Find the login card by locating a password field, then walk up to its
// nearest reasonably-sized container (works across different login markups).
function findLoginCard() {
  const pw = document.querySelector('input[type="password"]');
  if (!pw) return null;
  let el = pw;
  for (let i = 0; i < 6 && el.parentElement; i++) {
    el = el.parentElement;
    const r = el.getBoundingClientRect();
    if (r.width > 220 && r.width < 700 && r.height > 150) return el; // looks like the card
  }
  return pw.closest('form') || pw.parentElement;
}

async function tryAdd() {
  const card = findLoginCard();
  if (!card) return;                          // no login screen visible right now
  if (card.dataset.plexBtnDone) return;        // one-shot guard — never touch twice
  let status;
  try { status = await fetch('/api/auth/status').then((r) => r.json()); } catch { return; }
  if (!status.plexLogin) return;               // feature off — nothing to add (safe no-op)
  card.dataset.plexBtnDone = '1';
  injectStyles();
  const wrap = document.createElement('div'); wrap.className = 'plex-signin-wrap';
  const or = document.createElement('div'); or.className = 'plex-signin-or'; or.textContent = 'or';
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'plex-signin-btn';
  btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#1b1b1b" d="M4 2h6l6 10-6 10H4l6-10z"/></svg> Sign in with Plex`;
  btn.addEventListener('click', startPlexLogin);
  wrap.appendChild(or); wrap.appendChild(btn);
  card.appendChild(wrap);
}

// childList-ONLY observer (never attributes) — cannot loop, debounced.
let t = null;
const obs = new MutationObserver(() => { clearTimeout(t); t = setTimeout(tryAdd, 200); });
obs.observe(document.body, { childList: true, subtree: true });
setTimeout(tryAdd, 400);
setTimeout(tryAdd, 1200);

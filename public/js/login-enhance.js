// login-enhance.js — upgrades the LOGIN screen (a separate component from the
// app): adds a cinematic cross-fading backdrop, the calligraphic-N logo, and a
// "Sign in with Plex" button. Runs pre-auth, so it only uses PUBLIC endpoints
// (/api/auth/*) and public TMDB images (image.tmdb.org needs no key).

// A few stable, well-known TMDB backdrops (public CDN paths). Cross-faded.
const BACKDROPS = [
  '/rr7E0NoGKxvbkb89eR1Gwe9jvFO.jpg', // interstellar-ish wide space
  '/8UlWHLMpgZm9bx6QYh0NFoq67TZ.jpg', // dune
  '/xg27NrXi7VXCGUr7MG75UqLl6Vg.jpg', // classic cinematic
  '/wwemzKWzjKYJFfCeiB57q3r4Bcm.jpg', // spider-man
  '/nDP33LmQwvNjaVWfa32imv7RfBH.jpg', // moody blue
  '/2h00HrZQGWkStbg5jVYuxUp8jzc.jpg', // batman dark
  '/9n2tJBplPbgR2ca05hS5CKXwP2c.jpg', // avengers
  '/vq340s8DxA5Q209FT8PWumWBwer.jpg'  // wide vista
];
const IMG_BASE = 'https://image.tmdb.org/t/p/original';

const LOGO_SVG = `
<svg viewBox="0 0 64 64" width="66" height="66" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="lgTile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3AA6E0"/><stop offset=".55" stop-color="#1E88C7"/><stop offset="1" stop-color="#0d4e7d"/></linearGradient>
    <linearGradient id="lgWave" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#bfe8ff"/><stop offset="1" stop-color="#eaf7ff"/></linearGradient>
    <filter id="lgSh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1" stdDeviation="1.1" flood-color="#062038" flood-opacity="0.45"/></filter>
  </defs>
  <rect x="2" y="2" width="60" height="60" rx="15" fill="url(#lgTile)"/>
  <g filter="url(#lgSh)" fill="#ffffff">
    <path d="M15.5 44.5 C15.2 36 15.2 26 15.6 18.6 C15.7 16.8 18.6 16.6 19.3 18.2 C24.6 26.5 30.5 34.6 36.4 42.1 C36.4 34.4 36.3 25.8 36.7 18.8 C36.8 16.4 41.4 16.3 41.6 18.8 C42 27 42 37.5 41.6 45.4 C41.5 47.4 38.4 47.7 37.4 46 C31.8 38.2 25.9 30.2 20.4 22.7 C20.5 30.2 20.6 38.4 20.3 44.6 C20.2 47.4 15.8 47.6 15.5 44.5 Z"/>
  </g>
  <path d="M8 50.5 C 15 46.5, 22 54.5, 30 50.5 C 38 46.5, 45 54.5, 56 49.8" fill="none" stroke="url(#lgWave)" stroke-width="2.4" stroke-linecap="round" opacity=".95"/>
  <path d="M9 55 C 16 51.5, 22 58.5, 30 55 C 38 51.5, 44 58.5, 55 54.2" fill="none" stroke="url(#lgWave)" stroke-width="1.5" stroke-linecap="round" opacity=".5"/>
</svg>`;

function injectStyles() {
  if (document.getElementById('login-enh-css')) return;
  const css = `
  #login .login-bg{position:absolute;inset:0;z-index:0;overflow:hidden;}
  #login .login-bg .slide{position:absolute;inset:0;background-size:cover;background-position:center;opacity:0;transition:opacity 1.4s ease;}
  #login .login-bg .slide.on{opacity:1;}
  #login .login-bg::after{content:"";position:absolute;inset:0;background:
     radial-gradient(1200px 700px at 50% 30%, rgba(6,10,20,.55), rgba(6,8,14,.9) 70%, #06080e 100%),
     linear-gradient(180deg, rgba(6,8,14,.6), rgba(6,8,14,.85));}
  #login .login-card{position:relative;z-index:2;}
  #login .login-logo svg{width:66px;height:66px;border-radius:16px;box-shadow:0 12px 30px rgba(30,136,199,.5);}
  #login .login-plex{width:100%;margin-top:12px;padding:13px;font-size:15px;font-weight:800;border:0;border-radius:12px;
     background:#e5a00d;color:#1b1b1b;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:10px;}
  #login .login-plex:hover{filter:brightness(1.05);}
  #login .login-or{color:#9aa0ad;font-size:12px;margin:14px 0 2px;text-align:center;position:relative;}
  #login .login-btn{background:linear-gradient(135deg,#1E88C7,#0f5687)!important;}
  .plexmodal{position:fixed;inset:0;z-index:130;display:grid;place-items:center;background:rgba(6,6,10,.85);backdrop-filter:blur(6px);}
  .plexmodal.hidden{display:none;}
  .plexmodal .box{width:min(420px,92vw);background:#12121a;border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:26px;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,.6);}
  .plexmodal h3{margin:0 0 6px;font-size:20px;font-weight:900;color:#fff;} .plexmodal p{color:#9aa0ad;margin:0 0 16px;}
  .plexmodal .b2{padding:11px 16px;border:0;border-radius:11px;font-weight:800;cursor:pointer;}
  .plexmodal .go{background:#e5a00d;color:#1b1b1b;} .plexmodal .cx{background:rgba(255,255,255,.1);color:#fff;margin-left:8px;}`;
  const st = document.createElement('style'); st.id = 'login-enh-css'; st.textContent = css; document.head.appendChild(st);
}

let slideTimer = null;
function addBackground(overlay) {
  if (overlay.querySelector('.login-bg')) return;
  const bg = document.createElement('div'); bg.className = 'login-bg';
  // shuffle a little so it's not the same order every load
  const order = [...BACKDROPS].sort(() => Math.random() - 0.5);
  const slides = order.slice(0, 5).map((p, i) => { const s = document.createElement('div'); s.className = 'slide' + (i === 0 ? ' on' : ''); s.style.backgroundImage = `url("${IMG_BASE}${p}")`; return s; });
  slides.forEach((s) => bg.appendChild(s));
  overlay.insertBefore(bg, overlay.firstChild);
  let idx = 0;
  clearInterval(slideTimer);
  slideTimer = setInterval(() => { slides[idx].classList.remove('on'); idx = (idx + 1) % slides.length; slides[idx].classList.add('on'); }, 7000);
}

function swapLogo(card) {
  const logo = card.querySelector('.login-logo');
  if (logo) { logo.innerHTML = LOGO_SVG; return; }
  // If the login markup used a different container, insert before the H1.
  const h1 = card.querySelector('h1');
  if (h1 && !card.querySelector('.login-logo')) { const d = document.createElement('div'); d.className = 'login-logo'; d.innerHTML = LOGO_SVG; card.insertBefore(d, h1); }
}

async function addPlexButton(card) {
  if (card.querySelector('.login-plex')) return;
  // Only show it if the server has Plex login enabled.
  let enabled = false;
  try { const st = await fetch('/api/auth/status').then((r) => r.json()); enabled = !!st.plexLogin; } catch { /* default hidden */ }
  if (!enabled) return;
  const signBtn = card.querySelector('.login-btn') || card.querySelector('button');
  const or = document.createElement('div'); or.className = 'login-or'; or.textContent = 'or';
  const plex = document.createElement('button');
  plex.type = 'button'; plex.className = 'login-plex';
  plex.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#1b1b1b" d="M4 2h6l6 10-6 10H4l6-10z"/></svg> Sign in with Plex`;
  plex.addEventListener('click', startPlexLogin);
  // place after the Sign in button (and its container)
  const anchor = signBtn ? signBtn.parentElement : card;
  (signBtn && signBtn.parentElement === card ? card : anchor).appendChild(or);
  (signBtn && signBtn.parentElement === card ? card : anchor).appendChild(plex);
}

async function startPlexLogin() {
  let modal = document.getElementById('plexModal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'plexModal'; modal.className = 'plexmodal'; document.body.appendChild(modal); }
  modal.classList.remove('hidden');
  modal.innerHTML = `<div class="box"><h3>Sign in with Plex</h3><p>Requesting a secure PIN…</p></div>`;
  let data;
  try { data = await fetch('/api/auth/plex/pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ forwardUrl: location.origin }) }).then((r) => r.json()); }
  catch (e) { modal.querySelector('.box').innerHTML = `<h3>Failed</h3><p>${e.message}</p>`; return; }
  if (!data.ok) { modal.querySelector('.box').innerHTML = `<h3>Failed</h3><p>${data.error || 'could not create PIN'}</p><button class="b2 cx" onclick="document.getElementById('plexModal').classList.add('hidden')">Close</button>`; return; }
  const win = window.open(data.authUrl, '_blank', 'width=800,height=720');
  modal.querySelector('.box').innerHTML = `<h3>Approve in Plex</h3><p>A Plex window opened — sign in and approve. This finishes automatically.</p><button class="b2 go" id="pxOpen">Re-open Plex</button><button class="b2 cx" id="pxCancel">Cancel</button>`;
  modal.querySelector('#pxOpen').onclick = () => window.open(data.authUrl, '_blank', 'width=800,height=720');
  let stopped = false; modal.querySelector('#pxCancel').onclick = () => { stopped = true; modal.classList.add('hidden'); };
  const started = Date.now();
  const poll = async () => {
    if (stopped) return;
    if (Date.now() - started > 5 * 60 * 1000) { modal.querySelector('.box').innerHTML = `<h3>Timed out</h3><p>Please try again.</p>`; return; }
    try {
      const r = await fetch('/api/auth/plex/check/' + data.id).then((x) => x.json());
      if (r.ok && !r.pending && r.token) {
        localStorage.setItem('nickseer_token', r.token); localStorage.removeItem('nickseer_profile');
        try { if (win) win.close(); } catch { /* ignore */ }
        modal.querySelector('.box').innerHTML = `<h3>✓ Signed in</h3><p>Welcome, ${r.user.username}. Reloading…</p>`;
        setTimeout(() => location.reload(), 800); return;
      }
    } catch { /* keep polling */ }
    setTimeout(poll, 2000);
  };
  poll();
}

function enhance() {
  const overlay = document.getElementById('login');
  if (!overlay || overlay.classList.contains('hidden')) { clearInterval(slideTimer); slideTimer = null; return; }
  const card = overlay.querySelector('.login-card');
  if (!card) return;                      // login not rendered yet
  injectStyles();
  addBackground(overlay);
  swapLogo(card);
  addPlexButton(card);
}

const obs = new MutationObserver(() => enhance());
obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
setTimeout(enhance, 300);
setTimeout(enhance, 1000);

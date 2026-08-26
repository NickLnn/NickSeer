// plexcard.js — injects the Plex Library card into the INFO view (moved off
// Downloads). Shows server, per-library matched %, and a Sync now button.
function token() { return localStorage.getItem('nickseer_token') || ''; }
function authHeaders() { const t = token(); return t ? { Authorization: 'Bearer ' + t } : {}; }

function injectStyles() {
  if (document.getElementById('plexcard-styles')) return;
  const css = `
  .plex-card .plex-head{display:flex;align-items:center;gap:10px;margin-bottom:10px;}
  .plex-dot{width:10px;height:10px;border-radius:50%;background:#e5a00d;box-shadow:0 0 10px #e5a00d;}
  .plex-server{font-size:12.5px;color:#9aa0ad;margin-left:auto;}
  .plex-lib{margin:10px 0;} .plex-lib-row{display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px;}
  .plex-lib-name{font-weight:700;color:#eaeaf0;} .plex-lib-meta{color:#9aa0ad;}
  .plex-bar{height:7px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden;}
  .plex-bar>i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#e5a00d,#f5c518);}
  .plex-sync{margin-top:14px;width:100%;padding:11px;border:0;border-radius:11px;font-weight:800;font-size:14px;cursor:pointer;background:linear-gradient(135deg,#e5a00d,#f5c518);color:#1b1b1b;display:inline-flex;align-items:center;justify-content:center;gap:8px;}
  .plex-sync:hover{filter:brightness(1.05);} .plex-sync:disabled{opacity:.6;cursor:default;}
  .plex-sync .sp{display:inline-block;animation:plexspin 1s linear infinite;} @keyframes plexspin{to{transform:rotate(360deg);}}
  .plex-scanline{font-size:12px;color:#9aa0ad;margin-top:8px;}`;
  const st = document.createElement('style'); st.id = 'plexcard-styles'; st.textContent = css; document.head.appendChild(st);
}
function fmtAgo(ts) { if (!ts) return ''; const s = Math.floor((Date.now() - ts) / 1000); if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago'; }
function libHtml(secs) { return (secs || []).map((s) => { const meta = s.type === 'show' ? `${s.total} series · ${s.episodes || 0} eps · ${s.percent}% matched` : `${s.total} movies · ${s.percent}% matched`; return `<div class="plex-lib"><div class="plex-lib-row"><span class="plex-lib-name">${s.type === 'show' ? '📺 ' : '🎬 '}${s.title}</span><span class="plex-lib-meta">${meta}</span></div><div class="plex-bar"><i style="width:${s.percent}%"></i></div></div>`; }).join(''); }

async function buildCard(grid) {
  injectStyles();
  const card = document.createElement('div');
  card.className = 'status-card plex-card'; card.setAttribute('data-nav', ''); card.tabIndex = 0;
  card.innerHTML = `<div class="plex-head"><span class="plex-dot"></span><span class="status-name" style="font-weight:800;font-size:16px">Plex Library</span><span class="plex-server" id="plex-server">loading…</span></div><div id="plex-body"><div class="row-sub">Scanning…</div></div>`;
  grid.appendChild(card);
  const body = card.querySelector('#plex-body'); const server = card.querySelector('#plex-server');
  const paint = (d) => {
    if (!d || d.error) { server.textContent = ''; body.innerHTML = `<div class="row-sub">${(d && d.error) || 'unavailable'}</div>`; return; }
    server.textContent = d.server || '';
    const secs = d.sections || [];
    body.innerHTML = (secs.length ? libHtml(secs) : '<div class="row-sub">No movie/show libraries.</div>') + `<div class="plex-scanline">Last scanned ${fmtAgo(d.scannedAt)} · ${secs.reduce((a, s) => a + (s.matched || 0), 0)} matched titles</div>`;
    if (!card.querySelector('.plex-sync')) {
      const btn = document.createElement('button'); btn.className = 'plex-sync'; btn.setAttribute('data-nav', ''); btn.innerHTML = '⟳ Sync now';
      btn.onclick = async () => { btn.disabled = true; btn.innerHTML = '<span class="sp">⟳</span> Syncing Plex…'; try { const r = await fetch('/api/status/plex/sync', { method: 'POST', headers: authHeaders() }).then((x) => x.json()); if (r.ok) { paint(r.detail || await fetch('/api/status/plex', { headers: authHeaders() }).then((x) => x.json())); toastLite('Plex sync triggered'); } else toastLite(r.error || 'Sync failed'); } catch (e) { toastLite(e.message); } btn.disabled = false; btn.innerHTML = '⟳ Sync now'; if (!card.querySelector('.plex-sync')) body.appendChild(btn); };
      body.appendChild(btn);
    }
  };
  try { paint(await fetch('/api/status/plex', { headers: authHeaders() }).then((r) => r.json())); } catch (e) { paint({ error: e.message }); }
}
function toastLite(msg) { const w = document.getElementById('toasts'); if (!w) return; const el = document.createElement('div'); el.className = 'toast ok'; el.textContent = msg; w.appendChild(el); setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 3000); }

// Inject into the Info grid (moved off Downloads).
function maybeInject() {
  const grid = document.getElementById('infoGrid');
  if (!grid || grid.querySelector('.plex-card')) return;
  buildCard(grid);
}
document.addEventListener('info:rendered', maybeInject);
const obs = new MutationObserver(() => maybeInject());
obs.observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
setTimeout(maybeInject, 500);

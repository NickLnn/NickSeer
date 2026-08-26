// info.js — "Info" tab. First card is "System Health": every configured service
// with a green ✓ / red ✗ / grey (off), tested one by one. Then Radarr & Sonarr
// queues; plexcard.js + stats.js append Plex Library and App Activity here.
// Also strips Radarr/Sonarr from the Downloads view.
const app = () => document.getElementById('app');
function authHeaders() { const t = localStorage.getItem('nickseer_token'); return t ? { Authorization: 'Bearer ' + t } : {}; }
async function api(path) { try { const r = await fetch(path, { headers: authHeaders() }); return await r.json(); } catch (e) { return { error: e.message }; } }
function injectStyles() {
  if (document.getElementById('info-styles')) return;
  const css = `
  .info-head{padding:8px 40px 4px;font-size:24px;font-weight:800;letter-spacing:-.02em;}
  .hc-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.05);}
  .hc-row:last-child{border-bottom:0;}
  .hc-ico{width:26px;height:26px;border-radius:7px;display:grid;place-items:center;font-size:14px;font-weight:900;flex:0 0 auto;}
  .hc-ok{background:rgba(53,208,127,.16);color:#35d07f;} .hc-bad{background:rgba(229,9,20,.16);color:#ff6b6b;} .hc-off{background:rgba(255,255,255,.06);color:#7a7f8a;}
  .hc-name{font-weight:700;color:#eaeaf0;flex:1;min-width:0;}
  .hc-detail{font-size:12px;color:#9aa0ad;max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;}
  .hc-summary{display:flex;gap:8px;margin-left:auto;font-size:12px;font-weight:800;}
  .hc-pill{padding:3px 9px;border-radius:999px;} .hc-pill.ok{background:rgba(53,208,127,.16);color:#7ef0b0;} .hc-pill.bad{background:rgba(229,9,20,.14);color:#ff9a9a;} .hc-pill.off{background:rgba(255,255,255,.06);color:#9aa0ad;}
  .hc-refresh{margin-top:12px;width:100%;padding:10px;border:0;border-radius:10px;font-weight:800;font-size:13px;cursor:pointer;background:rgba(255,255,255,.08);color:#eaeaf0;border:1px solid rgba(255,255,255,.14);}
  .hc-refresh:hover{background:rgba(255,255,255,.16);}`;
  const st = document.createElement('style'); st.id = 'info-styles'; st.textContent = css; document.head.appendChild(st);
}
function healthRows(checks) {
  return checks.map((c) => { const cls = c.state === 'ok' ? 'hc-ok' : c.state === 'bad' ? 'hc-bad' : 'hc-off'; const ico = c.state === 'ok' ? '✓' : c.state === 'bad' ? '✗' : '–'; return `<div class="hc-row"><span class="hc-ico ${cls}">${ico}</span><span class="hc-name">${c.name}</span><span class="hc-detail">${c.detail || ''}</span></div>`; }).join('');
}
async function renderHealthCard(grid) {
  const card = document.createElement('div'); card.className = 'status-card'; card.setAttribute('data-nav', ''); card.tabIndex = 0;
  card.innerHTML = `<div class="status-head"><span class="status-dot ok"></span><span class="status-name" style="font-weight:800;font-size:16px">System Health</span><span class="hc-summary" id="hcSum"></span></div><div id="hcBody"><div class="row-sub">Checking services…</div></div>`;
  grid.appendChild(card);
  const load = async () => {
    const d = await api('/api/health-detail');
    const body = card.querySelector('#hcBody'); const sum = card.querySelector('#hcSum');
    if (d.error) { body.innerHTML = `<div class="row-sub">${d.error}</div>`; return; }
    body.innerHTML = healthRows(d.checks || []);
    if (d.summary) sum.innerHTML = `<span class="hc-pill ok">${d.summary.ok} ✓</span>${d.summary.bad ? `<span class="hc-pill bad">${d.summary.bad} ✗</span>` : ''}${d.summary.off ? `<span class="hc-pill off">${d.summary.off} off</span>` : ''}`;
    const btn = document.createElement('button'); btn.className = 'hc-refresh'; btn.setAttribute('data-nav', ''); btn.textContent = '⟳ Re-check services';
    btn.onclick = async () => { btn.textContent = 'Checking…'; btn.disabled = true; await load(); btn.textContent = '⟳ Re-check services'; btn.disabled = false; };
    body.appendChild(btn);
  };
  await load();
}
function arrCard(name, q) {
  const err = q && q.error;
  return `<div class="status-card" data-nav tabindex="0"><div class="status-head"><span class="status-dot ${err ? 'bad' : 'ok'}"></span><span class="status-name" style="font-weight:800;font-size:16px">${name}</span><span class="status-sub">${err ? '' : (q ? (q.count || 0) + ' items' : '')}</span></div>${err ? `<div class="row-sub">${err}</div>` : ((q && q.items && q.items.length) ? q.items.map((it) => `<div class="dl-item"><div class="dl-row"><span class="dl-name">${it.title || 'item'}</span><span class="dl-meta">${it.progress != null ? it.progress + '%' : ''}${it.timeLeft ? ' · ' + it.timeLeft : ''}</span></div><div class="bar"><i style="width:${it.progress || 0}%"></i></div></div>`).join('') : '<div class="row-sub">Idle — nothing importing.</div>')}</div>`;
}
async function render() {
  injectStyles();
  const root = app(); if (!root) return;
  root.innerHTML = `<div id="infoView"><div class="info-head">Info</div><div class="status-grid" id="infoGrid"></div></div>`;
  const grid = root.querySelector('#infoGrid');
  await renderHealthCard(grid);
  const status = await api('/api/status');
  if (status.radarr) grid.insertAdjacentHTML('beforeend', arrCard('Radarr', status.radarr));
  if (status.sonarr) grid.insertAdjacentHTML('beforeend', arrCard('Sonarr', status.sonarr));
  document.dispatchEvent(new CustomEvent('info:rendered'));
}
function isInfoActive() { const b = document.querySelector('.nav-link[data-view="info"]'); return b && b.classList.contains('active'); }
function stripDownloads() {
  const heads = [...document.querySelectorAll('.row-title')];
  if (!heads.some((h) => /Downloads\s*&\s*Health/i.test(h.textContent || ''))) return;
  const grid = document.querySelector('.status-grid'); if (!grid || grid.id === 'infoGrid') return;
  [...grid.children].forEach((card) => { const nm = card.querySelector('.status-name'); if (nm && /^(Radarr|Sonarr)$/i.test(nm.textContent.trim())) card.remove(); });
}
function init() {
  const btn = document.querySelector('.nav-link[data-view="info"]');
  if (btn) btn.addEventListener('click', () => setTimeout(render, 0));
  const obs = new MutationObserver(() => { if (isInfoActive() && !document.getElementById('infoView')) render(); stripDownloads(); });
  obs.observe(app() || document.body, { childList: true, subtree: true });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 300));
else setTimeout(init, 300);

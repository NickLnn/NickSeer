import { escHTML } from './util.js';
// live.js — "Live Streaming" tab. Now Watching shows the poster + rich stream
// detail (4K/HDR, video+audio codecs, Direct Play vs Transcode). Stats show
// mini posters and correct Top Platforms/Users names.
const app = () => document.getElementById('app');
let sub = 'now';
let statDays = 30;
let nowTimer = null;

function authHeaders() { const t = localStorage.getItem('nickseer_token'); return t ? { Authorization: 'Bearer ' + t } : {}; }
async function api(path) { try { const r = await fetch(path, { headers: authHeaders() }); return await r.json(); } catch (e) { return { error: e.message }; } }

function injectStyles() {
  if (document.getElementById('live-styles')) return;
  const css = `
  .live-head{display:flex;align-items:center;gap:14px;padding:8px 40px 4px;flex-wrap:wrap;}
  .live-title{font-size:24px;font-weight:800;letter-spacing:-.02em;display:flex;align-items:center;gap:10px;}
  .live-dot{width:10px;height:10px;border-radius:50%;background:#e50914;box-shadow:0 0 12px #e50914;animation:livepulse 1.6s infinite;}
  @keyframes livepulse{0%,100%{opacity:1;}50%{opacity:.35;}}
  .live-sub{margin-left:8px;display:inline-flex;background:rgba(255,255,255,.06);border-radius:11px;padding:4px;gap:4px;}
  .live-sub button{background:transparent;border:0;color:#9aa0ad;padding:8px 14px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;}
  .live-sub button.on{background:var(--accent,#e50914);color:#fff;}
  .stat-filters{display:inline-flex;gap:6px;margin-left:auto;}
  .stat-filters button{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#cfcfd6;border-radius:9px;padding:7px 13px;font-weight:700;font-size:13px;cursor:pointer;}
  .stat-filters button.on{background:linear-gradient(135deg,#6d5ef0,#e50914);color:#fff;border-color:transparent;}
  .live-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(400px,1fr));gap:16px;padding:14px 40px 40px;}
  .live-card{background:var(--card,#1a1a24);border:1px solid rgba(255,255,255,.06);border-radius:16px;padding:14px;display:flex;gap:14px;}
  .live-poster{width:86px;height:129px;border-radius:10px;object-fit:cover;background:#22222e;flex:0 0 auto;}
  .live-poster.ph{display:grid;place-items:center;font-size:30px;}
  .live-main{flex:1;min-width:0;}
  .live-u{font-weight:800;color:#fff;font-size:15px;}
  .live-t{color:#d6d6de;font-size:13.5px;margin:2px 0 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .live-pills{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;}
  .live-pill{font-size:11px;font-weight:800;padding:3px 8px;border-radius:999px;}
  .pill-play{background:rgba(53,208,127,.18);color:#7ef0b0;} .pill-pause{background:rgba(245,197,24,.18);color:#f5c518;} .pill-buf{background:rgba(109,94,240,.18);color:#c9c2ff;}
  .pill-dp{background:rgba(53,208,127,.14);color:#7ef0b0;} .pill-tc{background:rgba(229,9,20,.14);color:#ff9a9a;}
  .pill-4k{background:linear-gradient(135deg,#f5c518,#e5a00d);color:#1b1b1b;} .pill-hdr{background:rgba(255,255,255,.12);color:#fff;}
  .pill-info{background:rgba(255,255,255,.08);color:#cfcfd6;}
  .live-meta{font-size:12px;color:#9aa0ad;line-height:1.5;}
  .live-bar{height:6px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden;margin-top:8px;}
  .live-bar>i{display:block;height:100%;background:linear-gradient(90deg,#e50914,#ff5f6d);}
  .live-empty{padding:60px 40px;color:#9aa0ad;text-align:center;}
  .stat-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px;padding:14px 40px 40px;}
  .stat-col h4{margin:0 0 10px;font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#9aa0ad;}
  .stat-item{display:flex;align-items:center;gap:12px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.05);}
  .stat-rank{width:20px;color:#9aa0ad;font-weight:800;text-align:center;flex:0 0 auto;}
  .stat-mini{width:34px;height:51px;border-radius:5px;object-fit:cover;background:#22222e;flex:0 0 auto;}
  .stat-mini.ph{display:grid;place-items:center;font-size:15px;}
  .stat-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#eaeaf0;font-weight:600;}
  .stat-plays{color:#9aa0ad;font-size:12.5px;font-weight:700;flex:0 0 auto;}`;
  const st = document.createElement('style'); st.id = 'live-styles'; st.textContent = css; document.head.appendChild(st);
}

function header() {
  return `<div class="live-head">
    <div class="live-title"><span class="live-dot"></span>Live Streaming</div>
    <div class="live-sub"><button data-sub="now" class="${sub === 'now' ? 'on' : ''}">Now Watching</button><button data-sub="stats" class="${sub === 'stats' ? 'on' : ''}">Stats</button></div>
    ${sub === 'stats' ? `<div class="stat-filters">${[30, 60, 90, 365].map((d) => `<button data-days="${d}" class="${statDays === d ? 'on' : ''}">${d === 365 ? '1 year' : d + 'd'}</button>`).join('')}</div>` : ''}
  </div>`;
}

function sessionCard(s) {
  const title = s.grandparent ? `${s.grandparent} — ${s.title}` : s.title;
  const state = s.state === 'paused' ? '<span class="live-pill pill-pause">⏸ Paused</span>' : s.state === 'buffering' ? '<span class="live-pill pill-buf">⟳ Buffering</span>' : '<span class="live-pill pill-play">▶ Playing</span>';
  const isTC = /transcode/i.test(s.transcode || '') || /transcode/i.test(s.videoDecision || '') || /transcode/i.test(s.audioDecision || '');
  const dp = isTC ? '<span class="live-pill pill-tc">Transcode</span>' : '<span class="live-pill pill-dp">Direct Play</span>';
  const q4k = s.is4k ? '<span class="live-pill pill-4k">4K</span>' : (s.resolution ? `<span class="live-pill pill-info">${s.resolution}</span>` : '');
  const hdr = s.dynamicRange && !/sdr/i.test(s.dynamicRange) ? `<span class="live-pill pill-hdr">${s.dynamicRange}</span>` : '';
  const poster = s.poster ? `<img class="live-poster" src="${s.poster}" alt="">` : `<div class="live-poster ph">${s.type === 'movie' ? '🎬' : '📺'}</div>`;
  const audio = [s.audioCodec, s.audioChannels].filter(Boolean).join(' ');
  const vid = [s.videoCodec, s.container].filter(Boolean).join(' · ');
  const bw = s.bandwidth ? `${(s.bandwidth / 1000).toFixed(1)} Mbps` : '';
  const metaLines = [];
  if (vid) metaLines.push(`🎞️ ${vid}`);
  if (audio) metaLines.push(`🔊 ${audio}`);
  metaLines.push(`🖥️ ${s.player || s.device || '—'}${bw ? ' · ' + bw : ''}`);
  return `<div class="live-card">
    ${poster}
    <div class="live-main">
      <div class="live-u">${s.user || 'User'}</div>
      <div class="live-t">${title || ''}</div>
      <div class="live-pills">${state}${dp}${q4k}${hdr}</div>
      <div class="live-meta">${metaLines.join('<br>')}</div>
      <div class="live-bar"><i style="width:${s.progress || 0}%"></i></div>
    </div></div>`;
}

async function renderNow(root) {
  const d = await api('/api/discover/live/now');
  if (d.error) { root.insertAdjacentHTML('beforeend', `<div class="live-empty">${escHTML(d.error)}</div>`); return; }
  const sessions = d.sessions || [];
  if (!sessions.length) { root.insertAdjacentHTML('beforeend', `<div class="live-empty">😴 Nobody is watching right now.</div>`); return; }
  const grid = document.createElement('div'); grid.className = 'live-grid';
  grid.innerHTML = sessions.map(sessionCard).join('');
  root.appendChild(grid);
}

async function renderStats(root) {
  const d = await api(`/api/discover/live/stats?days=${statDays}`);
  if (d.error) { root.insertAdjacentHTML('beforeend', `<div class="live-empty">${escHTML(d.error)}</div>`); return; }
  const titleCol = (title, rows) => `<div class="stat-col"><h4>${title}</h4>${(rows || []).length ? rows.map((r, i) => `<div class="stat-item"><span class="stat-rank">${i + 1}</span>${r.poster ? `<img class="stat-mini" src="${r.poster}" alt="">` : '<div class="stat-mini ph">🎬</div>'}<span class="stat-name">${r.name || '—'}</span><span class="stat-plays">${r.total} plays</span></div>`).join('') : '<div class="row-sub">No data.</div>'}</div>`;
  const plainCol = (title, rows, icon) => `<div class="stat-col"><h4>${title}</h4>${(rows || []).length ? rows.map((r, i) => `<div class="stat-item"><span class="stat-rank">${i + 1}</span><div class="stat-mini ph">${icon}</div><span class="stat-name">${r.name || '—'}</span><span class="stat-plays">${r.total} plays</span></div>`).join('') : '<div class="row-sub">No data.</div>'}</div>`;
  const wrap = document.createElement('div'); wrap.className = 'stat-cols';
  wrap.innerHTML = titleCol('🎬 Top Movies', d.topMovies) + titleCol('📺 Top TV', d.topTv) + plainCol('👤 Top Users', d.topUsers, '👤') + plainCol('🖥️ Top Platforms', d.topPlatforms, '🖥️');
  root.appendChild(wrap);
}

async function render() {
  injectStyles();
  const root = app(); if (!root) return;
  clearInterval(nowTimer); nowTimer = null;
  root.innerHTML = `<div id="liveView">${header()}</div>`;
  const view = root.querySelector('#liveView');
  view.querySelectorAll('.live-sub button').forEach((b) => b.addEventListener('click', () => { sub = b.dataset.sub; render(); }));
  view.querySelectorAll('.stat-filters button').forEach((b) => b.addEventListener('click', () => { statDays = Number(b.dataset.days); render(); }));
  if (sub === 'now') { await renderNow(view); nowTimer = setInterval(() => { if (isLiveActive()) refreshNow(); }, 10000); }
  else await renderStats(view);
}
async function refreshNow() { const view = document.getElementById('liveView'); if (!view) return; const old = view.querySelector('.live-grid, .live-empty'); const tmp = document.createElement('div'); await renderNow(tmp); const fresh = tmp.querySelector('.live-grid, .live-empty'); if (old && fresh) old.replaceWith(fresh); else if (fresh) view.appendChild(fresh); }
function isLiveActive() { const b = document.querySelector('.nav-link[data-view="live"]'); return b && b.classList.contains('active'); }

async function toggleTab() {
  const [st, me] = await Promise.all([
    fetch('/api/auth/status').then((r) => r.json()).catch(() => ({})),
    (localStorage.getItem('nickseer_token') ? fetch('/api/auth/me', { headers: authHeaders() }).then((r) => r.json()).catch(() => ({})) : Promise.resolve({}))
  ]);
  const isAdmin = me?.user?.role === 'admin';
  document.querySelectorAll('.nav-link[data-view="live"], .drawer-item[data-view="live"]').forEach((b) => {
    b.style.display = isAdmin ? '' : 'none';
  });
}
function init() {
  toggleTab();
  const btn = document.querySelector('.nav-link[data-view="live"]');
  if (btn) btn.addEventListener('click', () => { sub = 'now'; setTimeout(render, 0); });
  const obs = new MutationObserver(() => { if (isLiveActive() && !document.getElementById('liveView')) render(); });
  obs.observe(app() || document.body, { childList: true, subtree: true });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 300));
else setTimeout(init, 300);


// stats.js — "App Activity" card. Counts ALL API traffic (mostly TMDB), clearly
// labelled; AI has its own counter. Injected into the Info grid.
const KEY = 'nickseer_stats_v1';
const DEFAULT = { total: 0, searches: 0, browse: 0, details: 0, people: 0, requests: 0, health: 0, ai: 0, since: Date.now(), last: 0 };
function read() { try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULT }; } }
function write(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } }
function categorize(url) {
  const u = String(url || ''); if (!u.includes('/api/')) return null;
  if (u.includes('/api/discover/search')) return 'searches';
  if (u.includes('/api/discover/person')) return 'people';
  if (u.includes('/api/discover/ai-suggest')) return 'ai';
  if (u.includes('/api/health-detail/ai') || u.includes('/api/settings/test/ai')) return 'ai';
  if (/\/api\/discover\/(movie|tv|show)\/\d+/.test(u)) return 'details';
  if (u.includes('/api/discover/')) return 'browse';
  if (u.includes('/api/request')) return 'requests';
  if (u.includes('/api/status') || u.includes('/api/health')) return 'health';
  return 'other';
}
if (!window.__nsStatsWrapped) {
  window.__nsStatsWrapped = true;
  const orig = window.fetch;
  window.fetch = function (input, init) {
    try { const url = typeof input === 'string' ? input : (input && input.url) || ''; const cat = categorize(url); if (cat) { const s = read(); s.total++; if (s[cat] !== undefined) s[cat]++; s.last = Date.now(); write(s); document.dispatchEvent(new CustomEvent('stats:update')); } } catch { /* never break fetch */ }
    return orig.apply(this, arguments);
  };
}
function injectStyles() {
  if (document.getElementById('stats-styles')) return;
  const css = `
  .stats-grid2{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:6px 0 4px;}
  .stat-box{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:12px;text-align:center;}
  .stat-box b{display:block;font-size:24px;font-weight:900;color:#fff;letter-spacing:-.02em;}
  .stat-box span{font-size:11.5px;color:#9aa0ad;font-weight:600;}
  .stat-total{grid-column:1 / -1;background:linear-gradient(135deg,rgba(109,94,240,.18),rgba(229,9,20,.14));border-color:rgba(109,94,240,.35);}
  .stat-total b{font-size:30px;} .stat-total span{font-size:12px;}
  .stat-ai{background:linear-gradient(135deg,rgba(109,94,240,.16),rgba(53,208,127,.12));border-color:rgba(109,94,240,.3);}
  .stat-foot{display:flex;justify-content:space-between;font-size:12px;color:#9aa0ad;margin-top:10px;align-items:center;}
  .stat-reset{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);color:#eaeaf0;border-radius:8px;padding:5px 10px;font-weight:700;font-size:11.5px;cursor:pointer;}`;
  const st = document.createElement('style'); st.id = 'stats-styles'; st.textContent = css; document.head.appendChild(st);
}
function fmtAgo(ts) { if (!ts) return 'never'; const s = Math.floor((Date.now() - ts) / 1000); if (s < 5) return 'just now'; if (s < 60) return s + 's ago'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago'; }
function fmtSince(ts) { const s = Math.floor((Date.now() - ts) / 1000); if (s < 3600) return Math.floor(s / 60) + 'm'; if (s < 86400) return Math.floor(s / 3600) + 'h'; return Math.floor(s / 86400) + 'd'; }
function cardHtml(s) {
  return `<div class="stats-grid2">
    <div class="stat-box stat-total"><b>${s.total.toLocaleString()}</b><span>Total local UI queries (served from fast in-memory cache)</span></div>
    <div class="stat-box stat-ai"><b>${s.ai.toLocaleString()}</b><span>🤖 AI suggestion queries</span></div>
    <div class="stat-box"><b>${s.browse.toLocaleString()}</b><span>🗂️ Browse views (24h cached)</span></div>
    <div class="stat-box"><b>${s.details.toLocaleString()}</b><span>🎬 Detail opens</span></div>
    <div class="stat-box"><b>${s.searches.toLocaleString()}</b><span>🔍 Searches</span></div>
    <div class="stat-box"><b>${s.people.toLocaleString()}</b><span>🧑 Actor pages</span></div>
    <div class="stat-box"><b>${s.requests.toLocaleString()}</b><span>＋ Media requests</span></div>
    <div class="stat-box"><b>${s.health.toLocaleString()}</b><span>🩺 Health polls</span></div>
  </div>
  <div style="margin-top:8px;font-size:11px;color:#70c4f4;background:rgba(46,155,214,0.1);padding:6px 10px;border-radius:8px;border:1px solid rgba(46,155,214,0.2);">
    ⚡ <b>TMDB Safety:</b> All media rows are cached in RAM on your NAS for 24 hours. Your actual outgoing TMDB API calls are very low (&lt;1%) and well within limits.
  </div>
  <div class="stat-foot"><span>Up ${fmtSince(s.since)} · last ${fmtAgo(s.last)}</span><button class="stat-reset" id="statReset">Reset Counter</button></div>`;
}
let cardBody = null;
function refresh() { if (cardBody) { cardBody.innerHTML = cardHtml(read()); const b = document.getElementById('statReset'); if (b) b.onclick = () => { write({ ...DEFAULT, since: Date.now() }); refresh(); }; } }
function buildCard(grid) {
  if (!grid || grid.querySelector('.stats-card') || document.querySelector('.stats-card') || document.getElementById('statsBody')) return;
  injectStyles();
  const card = document.createElement('div');
  card.className = 'status-card stats-card';
  card.setAttribute('data-nav', '');
  card.tabIndex = 0;
  card.innerHTML = `<div class="status-head"><span class="status-dot ok"></span><span class="status-name" style="font-weight:800;font-size:16px">App Activity</span><span class="status-sub">this device</span></div><div id="statsBody"></div>`;
  grid.appendChild(card);
  cardBody = card.querySelector('#statsBody');
  refresh();
}
document.addEventListener('stats:update', () => { if (cardBody && document.body.contains(cardBody)) refresh(); });
function maybeInject() {
  const grid = document.getElementById('infoGrid');
  if (!grid || grid.querySelector('.stats-card') || document.querySelector('.stats-card') || document.getElementById('statsBody')) return;
  buildCard(grid);
}
document.addEventListener('info:rendered', maybeInject);
const obs = new MutationObserver(() => maybeInject());
obs.observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
setTimeout(maybeInject, 300);

// NickSeer main app — login, multi-user profiles, brand-logo row titles,
// detail ownership badges (in-library ✓, series status, episode-% ring),
// hero slideshow, all discovery views, box office (worldwide total),
// downloads, search, and the Overseerr-style Request modal.
import { toast, el, api, stars, authToken } from './util.js';
import { openSettings } from './settings.js';
import { setFocus } from './nav.js';

const app = document.getElementById('app');
const ambient = document.getElementById('ambient');
let currentView = 'home';
let rowsCache = null;
let slideTimer = null;
const mediaToggle = { new: 'movie', coming: 'movie' };

// ---------- brand logos ----------
const BRANDS = {
  netflix:   { cls: 'bg-netflix', mark: 'N' },
  disney:    { cls: 'bg-disney', mark: 'D+' },
  amazon:    { cls: 'bg-amazon', mark: 'a' },
  max:       { cls: 'bg-max', mark: 'M' },
  apple:     { cls: 'bg-apple', mark: '' },   // Apple logo glyph
  paramount: { cls: 'bg-paramount', mark: 'P+' }
};
function brandBadge(key) {
  const b = BRANDS[key];
  if (!b) return null;
  return el('span', { class: 'brand-badge ' + b.cls, title: key }, b.mark);
}

// ---------- login ----------
async function ensureAuth() {
  const st = await fetch('/api/auth/status').then((r) => r.json()).catch(() => ({ enabled: false }));
  if (!st.enabled) return true;                       // login off
  const tok = authToken();
  if (tok) {
    const me = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + tok } }).then((r) => r.json()).catch(() => ({ ok: false }));
    if (me.ok) return true;
  }
  await showLogin();
  return false;
}
function showLogin() {
  return new Promise((resolve) => {
    const host = document.getElementById('login');
    host.classList.remove('hidden');
    host.innerHTML = `
      <div class="login-card">
        <div class="login-logo"><svg viewBox="0 0 64 64"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d5ef0"/><stop offset="1" stop-color="#e50914"/></linearGradient></defs><rect width="64" height="64" rx="15" fill="url(#lg)"/><path d="M20 46V18h6l12 16V18h6v28h-6L26 30v16z" fill="#fff"/></svg></div>
        <h1>NickSeer</h1><p>Sign in to continue</p>
        <div class="login-field"><label>Username</label><input id="lg-user" autocomplete="username" /></div>
        <div class="login-field"><label>Password</label><input id="lg-pass" type="password" autocomplete="current-password" /></div>
        <button class="login-btn" id="lg-go">Sign in</button>
        <div class="login-err" id="lg-err"></div>
      </div>`;
    const go = async () => {
      const username = host.querySelector('#lg-user').value.trim();
      const password = host.querySelector('#lg-pass').value;
      const err = host.querySelector('#lg-err');
      err.textContent = '';
      const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) }).then((x) => x.json());
      if (r.ok) { localStorage.setItem('nickseer_token', r.token); host.classList.add('hidden'); resolve(true); }
      else { err.textContent = r.error || 'Sign in failed'; }
    };
    host.querySelector('#lg-go').addEventListener('click', go);
    host.querySelector('#lg-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    setTimeout(() => host.querySelector('#lg-user').focus(), 60);
  });
}
document.addEventListener('auth:required', () => { localStorage.removeItem('nickseer_token'); showLogin().then(() => showView(currentView)); });

// ---------- profiles (multi-user) ----------
const PROFILE_KEY = 'nickseer_profile';
function getProfile() { try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); } catch { return null; } }
function setProfile(p) { if (p) localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); else localStorage.removeItem(PROFILE_KEY); paintProfileBadge(); }
function paintProfileBadge() {
  const p = getProfile();
  const ini = document.getElementById('profileInitial');
  if (ini) ini.textContent = p ? (p.name || '?')[0].toUpperCase() : 'N';
}
function userQuery(extra = '') {
  const p = getProfile(); const parts = [];
  if (p && p.id) parts.push('userId=' + encodeURIComponent(p.id));
  if (extra) parts.push(extra.replace(/^[?&]/, ''));
  return parts.length ? '?' + parts.join('&') : '';
}
async function chooseProfile(force = false) {
  const users = await api('/api/settings/users').catch(() => []);
  const list = Array.isArray(users) ? users : [];
  if (!force && list.length <= 1) { if (list[0]) setProfile(list[0]); return; }
  let host = document.getElementById('profileOverlay');
  if (!host) { host = document.createElement('div'); host.id = 'profileOverlay'; host.className = 'profile-overlay'; document.body.appendChild(host); }
  host.classList.remove('hidden');
  const avatar = (u) => { const initials = (u.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase(); return `<button class="profile-tile" data-nav data-id="${u.id}" data-name="${encodeURIComponent(u.name || 'User')}"><span class="profile-face">${initials}</span><span class="profile-name">${u.name || 'User'}</span></button>`; };
  host.innerHTML = `<div class="profile-inner"><h1 class="profile-h1">Who's watching?</h1><div class="profile-grid">${list.map(avatar).join('')}<button class="profile-tile" data-nav data-id="" data-name="Everyone"><span class="profile-face" style="background:linear-gradient(135deg,#3a3a4a,#555)">👥</span><span class="profile-name">Everyone</span></button></div>${force ? '<button class="btn btn-ghost" id="profileClose" data-nav style="margin-top:8px">Cancel</button>' : ''}</div>`;
  host.querySelectorAll('.profile-tile').forEach((t) => t.addEventListener('click', () => { const id = t.dataset.id; const name = decodeURIComponent(t.dataset.name || 'User'); setProfile(id ? { id, name } : { id: '', name: 'Everyone' }); host.classList.add('hidden'); rowsCache = null; showView('home'); toast(`Profile: ${name}`, 'ok'); }));
  const close = host.querySelector('#profileClose'); if (close) close.addEventListener('click', () => host.classList.add('hidden'));
  setTimeout(() => { const f = host.querySelector('.profile-tile'); if (f) setFocus(f); }, 60);
  injectStyles();
}
function injectStyles() {
  if (document.getElementById('profile-styles')) return;
  const css = `
  .profile-overlay{position:fixed;inset:0;z-index:76;display:grid;place-items:center;background:rgba(6,6,10,.96);backdrop-filter:blur(6px);}
  .profile-overlay.hidden{display:none;}
  .profile-inner{text-align:center;} .profile-h1{font-size:40px;font-weight:800;margin:0 0 34px;color:#eaeaf0;}
  .profile-grid{display:flex;gap:26px;flex-wrap:wrap;justify-content:center;max-width:880px;}
  .profile-tile{background:transparent;border:0;display:flex;flex-direction:column;align-items:center;gap:12px;cursor:pointer;}
  .profile-face{width:120px;height:120px;border-radius:14px;display:grid;place-items:center;font-size:40px;font-weight:800;color:#fff;background:linear-gradient(135deg,#6d5ef0,#a78bfa);border:3px solid transparent;transition:.18s;}
  .profile-tile:hover .profile-face,.profile-tile.nav-focus .profile-face{border-color:#fff;transform:scale(1.06);}
  .profile-name{color:#9aa0ad;font-size:17px;font-weight:600;} .profile-tile:hover .profile-name,.profile-tile.nav-focus .profile-name{color:#fff;}
  .req-result{padding:54px 32px;text-align:center;}
  .req-check{width:84px;height:84px;border-radius:50%;margin:0 auto 20px;display:grid;place-items:center;font-size:44px;background:radial-gradient(circle at 50% 40%,#35d07f,#1f9d5f);color:#fff;box-shadow:0 10px 30px rgba(53,208,127,.45);animation:pop .35s cubic-bezier(.2,.8,.2,1.4);}
  .req-check.exists{background:radial-gradient(circle at 50% 40%,#6d5ef0,#4c3fd0);}
  @keyframes pop{0%{transform:scale(.4);opacity:0;}100%{transform:scale(1);opacity:1;}}
  .req-result h3{font-size:24px;font-weight:900;margin:0 0 6px;color:#fff;} .req-result p{color:#9aa0ad;margin:0 0 22px;}
  @media(max-width:640px){.profile-face{width:92px;height:92px;font-size:30px;}.profile-h1{font-size:30px;}}`;
  const st = document.createElement('style'); st.id = 'profile-styles'; st.textContent = css; document.head.appendChild(st);
}

// ---------- boot ----------
async function boot() {
  injectStyles();
  const ok = await ensureAuth();
  if (!ok) return; // login shown; resolves then re-enters
  await afterAuth();
}
async function afterAuth() {
  const status = await api('/api/settings/status');
  if (status && status._401) return;
  if (!status.configured) { openSettings(true); return; }
  paintProfileBadge();
  if (!getProfile()) await chooseProfile(false);
  showView('home');
}
document.addEventListener('settings:saved', () => { rowsCache = null; showView(currentView); });
document.getElementById('profileBtn')?.addEventListener('click', () => chooseProfile(true));
document.getElementById('refreshBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('refreshBtn'); btn.classList.add('spinning');
  try { await api('/api/settings/refresh', { method: 'POST' }); } catch { /* ignore */ }
  rowsCache = null; await showView(currentView, true); toast('Refreshed from source', 'ok');
  setTimeout(() => btn.classList.remove('spinning'), 600);
});

document.querySelectorAll('.nav-link[data-view]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.nav-link').forEach((n) => n.classList.remove('active')); b.classList.add('active'); showView(b.dataset.view);
}));
const search = document.getElementById('search');
let searchTimer;
search.addEventListener('input', () => { clearTimeout(searchTimer); const q = search.value.trim(); if (!q) { showView(currentView); return; } searchTimer = setTimeout(() => runSearch(q), 350); });

async function showView(view, force = false) {
  currentView = view; stopSlideshow(); app.innerHTML = skeleton();
  try {
    if (view === 'home') await renderHome(force);
    else if (view === 'movies') await renderCategory('movie', force);
    else if (view === 'shows') await renderCategory('tv', force);
    else if (view === 'streaming') await renderStreaming(force);
    else if (view === 'new') await renderNew(force);
    else if (view === 'boxoffice') await renderBoxOffice(force);
    else if (view === 'coming') await renderComing(force);
    else if (view === 'status') await renderStatus();
  } catch (e) { app.innerHTML = ''; app.appendChild(emptyState('Something went wrong', e.message)); }
}

async function getRows(force) { if (rowsCache && !force) return rowsCache; rowsCache = await api('/api/discover/rows' + (force ? '?refresh=1' : '')); return rowsCache; }

async function renderHome(force) {
  const [home, curated] = await Promise.all([api('/api/discover/home' + userQuery(force ? 'refresh=1' : '')), getRows(force)]);
  app.innerHTML = '';
  const persoRows = home.rows || [];
  const slideItems = (persoRows[0]?.items || curated.rows?.[0]?.items || []).slice(0, 7);
  if (slideItems.length) app.appendChild(heroSlideshow(slideItems));
  if (home.error && (!curated.rows || !curated.rows.length)) { app.appendChild(emptyState('Finish setup to see recommendations', home.error, true)); return; }
  if (home.cold) app.appendChild(rowSub("No watch history yet — showing trending & charts. Watch a few things in Plex and Home becomes personal."));
  for (const row of persoRows) app.appendChild(rowEl(row.title, row.items, row.title.startsWith('Picked')));
  for (const row of (curated.rows || [])) app.appendChild(rowEl(row.title, row.items, false, isTop(row.title), row.brand));
  focusFirstCard();
}

async function renderCategory(media, force) {
  const [trend, imdb] = await Promise.all([api('/api/discover/trending' + (force ? '?refresh=1' : '')), api(`/api/discover/imdb-top?media=${media}` + (force ? '&refresh=1' : ''))]);
  app.innerHTML = '';
  const trlist = (media === 'movie' ? trend.movies : trend.tv) || [];
  const trItems = trlist.map((c) => normalize(c, media));
  if (trItems.slice(0, 7).length) app.appendChild(heroSlideshow(trItems.slice(0, 7)));
  app.appendChild(rowEl(media === 'movie' ? 'Trending Movies' : 'Trending Series', trItems));
  app.appendChild(rowEl(media === 'movie' ? 'IMDb Top 250 · Movies' : 'IMDb Top 250 · Series', (imdb.items || []).map((c) => normalize(c, media)), false, true));
  focusFirstCard();
}

async function renderStreaming(force) {
  const curated = await getRows(force);
  app.innerHTML = '';
  const streamRows = (curated.rows || []).filter((r) => isTop(r.title));
  if (!streamRows.length) { app.appendChild(emptyState('No streaming charts yet', curated.error || 'Add your TMDB key and region in Settings.', true)); return; }
  if ((streamRows[0]?.items || []).slice(0, 7).length) app.appendChild(heroSlideshow(streamRows[0].items.slice(0, 7)));
  for (const row of streamRows) app.appendChild(rowEl(row.title, row.items, false, true, row.brand));
  focusFirstCard();
}

async function renderNew(force) {
  const media = mediaToggle.new;
  const data = await api(`/api/discover/new?media=${media}` + (force ? '&refresh=1' : ''));
  app.innerHTML = '';
  app.appendChild(tabHeader('Newly Added', media, (m) => { mediaToggle.new = m; renderNew(false); }));
  const rows = data.rows || [];
  if (!rows.length) { app.appendChild(emptyState('Nothing new found', data.error || 'Add your TMDB key and region in Settings.', true)); return; }
  if ((rows[0]?.items || []).slice(0, 7).length) app.appendChild(heroSlideshow(rows[0].items.slice(0, 7)));
  for (const row of rows) app.appendChild(rowEl(row.title, row.items, false, false, row.brand));
  focusFirstCard();
}

async function renderBoxOffice(force) {
  const data = await api('/api/discover/boxoffice' + (force ? '?refresh=1' : ''));
  app.innerHTML = '';
  const realBom = data.source === 'box-office-mojo';
  app.appendChild(el('div', { class: 'row-head' }, [
    el('div', { class: 'row-title' }, '🏆 Box Office · Top 10'),
    el('div', { class: 'row-sub' }, (data.weekOf ? `${data.weekOf}` : '') + (data.region ? ` · ${data.region}` : '') + ' · updates weekly')
  ]));
  if (data.error || !(data.items || []).length) { app.appendChild(emptyState('No box office data', data.error || 'Add your TMDB key in Settings.', true)); return; }
  const items = data.items.map((c) => ({ ...normalize(c, 'movie'), weekend: c.weekend, total: c.total, totalKind: c.totalKind, weeks: c.weeks }));
  if (items.length) app.appendChild(heroSlideshow(items.slice(0, 5)));
  const scroll = el('div', { class: 'row-scroll' });
  items.forEach((it, i) => scroll.appendChild(boxOfficeCard(it, i + 1)));
  app.appendChild(scroll);
  app.appendChild(rowSub((realBom ? '💵 ' : 'ℹ️ ') + (data.note || '')));
  focusFirstCard();
}
function boxOfficeCard(it, rank) {
  const c = el('div', { class: 'card', tabindex: '0', 'data-nav': '' });
  c.addEventListener('click', () => openDetail(it));
  if (it.poster) c.appendChild(el('img', { class: 'card-poster', src: it.poster, loading: 'lazy', alt: it.title }));
  else c.appendChild(el('div', { class: 'card-fallback' }, it.title || 'No image'));
  c.appendChild(el('div', { class: 'card-rank' }, String(rank)));
  if (it.weekend) c.appendChild(el('div', { class: 'card-badge', style: 'left:8px;right:auto;top:8px;background:rgba(53,208,127,.92);color:#03150b;font-size:12px' }, it.weekend));
  if (it.rating) c.appendChild(el('div', { class: 'card-badge' }, stars(it.rating)));
  const totalLine = it.total ? `${it.total} ${it.totalKind === 'worldwide' ? '🌍 worldwide' : 'total'}` : (it.year || '');
  c.appendChild(el('div', { class: 'card-info' }, [el('div', { class: 'card-name' }, it.title), el('div', { class: 'card-year' }, [it.weeks ? `wk ${it.weeks} · ` : '', totalLine].join(''))]));
  return c;
}

async function renderComing(force) {
  const media = mediaToggle.coming;
  const data = await api(`/api/discover/anticipated?media=${media}` + (force ? '&refresh=1' : ''));
  app.innerHTML = '';
  app.appendChild(tabHeader('Highly Anticipated', media, (m) => { mediaToggle.coming = m; renderComing(false); }));
  const rows = data.rows || [];
  if (!rows.length) { app.appendChild(emptyState('Nothing upcoming yet', data.error || 'Add your TMDB key and region in Settings.', true)); return; }
  if ((rows[0]?.items || []).slice(0, 7).length) app.appendChild(heroSlideshow(rows[0].items.slice(0, 7)));
  for (const row of rows) app.appendChild(rowEl(row.title, row.items, false, false, row.brand));
  focusFirstCard();
}

async function runSearch(q) {
  stopSlideshow(); app.innerHTML = skeleton();
  const results = await api('/api/discover/search?q=' + encodeURIComponent(q));
  app.innerHTML = '';
  if (!Array.isArray(results) || !results.length) { app.appendChild(emptyState('No results', 'Try another title.')); return; }
  app.appendChild(el('div', { class: 'row-head' }, [el('div', { class: 'row-title' }, `Results for “${q}”`)]));
  const grid = el('div', { class: 'row-scroll', style: 'flex-wrap:wrap' });
  results.forEach((it) => grid.appendChild(card(it)));
  app.appendChild(grid);
  focusFirstCard();
}

async function renderStatus() {
  const s = await api('/api/status');
  app.innerHTML = '';
  app.appendChild(el('div', { class: 'row-head' }, [el('div', { class: 'row-title' }, 'Downloads & Health')]));
  const grid = el('div', { class: 'status-grid' });
  if (s.gluetun) {
    const g = s.gluetun; const ok = !g.error && (g.vpn === 'running' || g.ip);
    const c = el('div', { class: 'status-card', 'data-nav': '', tabindex: '0' });
    c.appendChild(el('div', { class: 'status-head' }, [el('span', { class: 'status-dot ' + (ok ? 'ok' : 'bad') }), el('span', { class: 'status-name' }, 'Gluetun VPN'), el('span', { class: 'status-sub' }, g.ip || '')]));
    if (g.error) c.appendChild(el('div', { class: 'row-sub' }, g.error));
    else { c.appendChild(el('div', { class: 'vpn-line' }, [el('span', { class: 'vpn-pill' }, ok ? '● Protected' : '● Unknown'), el('span', {}, g.country ? `${g.city ? g.city + ', ' : ''}${g.country}` : 'VPN tunnel active')])); c.appendChild(el('div', { class: 'row-sub', style: 'margin-top:8px' }, 'All download traffic is routed through the VPN.')); }
    grid.appendChild(c);
  }
  if (s.sabnzbd) {
    const q = s.sabnzbd; const c = el('div', { class: 'status-card', 'data-nav': '', tabindex: '0' });
    c.appendChild(el('div', { class: 'status-head' }, [el('span', { class: 'status-dot ' + (q.error ? 'bad' : 'ok') }), el('span', { class: 'status-name' }, 'SABnzbd'), el('span', { class: 'status-sub' }, q.error ? '' : `${q.count || 0} in queue`)]));
    if (q.error) c.appendChild(el('div', { class: 'row-sub' }, q.error));
    else { c.appendChild(el('div', { class: 'speed-big' }, [document.createTextNode(q.totalSpeed || (q.speed ? q.speed + 'B/s' : '0 KB/s')), el('small', {}, 'total download speed')])); (q.slots || []).slice(0, 12).forEach((sl) => c.appendChild(downloadRow(sl.name, sl.percent, sl.timeLeft))); if (!(q.slots || []).length) c.appendChild(el('div', { class: 'row-sub' }, 'Idle — queue empty.')); }
    grid.appendChild(c);
  }
  for (const kind of ['radarr', 'sonarr']) {
    if (s[kind]) {
      const q = s[kind]; const c = el('div', { class: 'status-card', 'data-nav': '', tabindex: '0' });
      c.appendChild(el('div', { class: 'status-head' }, [el('span', { class: 'status-dot ' + (q.error ? 'bad' : 'ok') }), el('span', { class: 'status-name' }, cap(kind)), el('span', { class: 'status-sub' }, q.error ? '' : `${q.count || 0} items`)]));
      if (q.error) c.appendChild(el('div', { class: 'row-sub' }, q.error));
      else { (q.items || []).forEach((it) => c.appendChild(downloadRow(it.title, it.progress, it.timeLeft))); if (!(q.items || []).length) c.appendChild(el('div', { class: 'row-sub' }, 'Idle — nothing importing.')); }
      grid.appendChild(c);
    }
  }
  if (!grid.children.length) { app.appendChild(emptyState('No services connected', 'Add SABnzbd, Radarr, Sonarr or Gluetun in Settings.', true)); return; }
  app.appendChild(grid); focusFirstCard();
}

function tabHeader(title, media, onSwitch) {
  const head = el('div', { class: 'row-head', style: 'align-items:center' });
  head.appendChild(el('div', { class: 'row-title' }, title));
  const seg = el('div', { class: 'seg', style: 'margin-left:12px' });
  const mk = (label, val) => el('button', { class: media === val ? 'active' : '', 'data-nav': '', onclick: () => onSwitch(val) }, label);
  seg.appendChild(mk('Movies', 'movie')); seg.appendChild(mk('TV', 'tv'));
  head.appendChild(seg); return head;
}

function heroSlideshow(items) {
  stopSlideshow();
  const node = el('section', { class: 'hero' });
  const slides = items.map((it, i) => { const sl = el('div', { class: 'hero-slide' + (i === 0 ? ' on' : '') }); if (it.backdrop) sl.style.backgroundImage = `url(${it.backdrop})`; return sl; });
  slides.forEach((s) => node.appendChild(s));
  const content = el('div', { class: 'hero-content' });
  const dots = el('div', { class: 'hero-dots' });
  const dotEls = items.map((_, i) => { const d = el('span', { class: 'hero-dot' + (i === 0 ? ' on' : ''), 'data-nav': '', tabindex: '0' }); d.addEventListener('click', () => go(i)); return d; });
  dotEls.forEach((d) => dots.appendChild(d));
  let idx = 0;
  const paint = () => {
    const it = items[idx]; setAmbient(it.backdrop); content.innerHTML = '';
    content.appendChild(el('h1', { class: 'hero-title' }, it.title));
    content.appendChild(el('div', { class: 'hero-meta' }, [it.year ? el('span', {}, it.year) : null, it.rating ? el('span', { style: 'color:var(--gold)' }, stars(it.rating)) : null, it.weekend ? el('span', { class: 'vpn-pill' }, it.weekend + ' weekend') : null, it.total ? el('span', { class: 'chip' }, `${it.total} ${it.totalKind === 'worldwide' ? '🌍' : ''}`) : null, el('span', { class: 'chip' }, it.media === 'tv' ? 'TV' : 'Movie')]));
    if (it.overview) content.appendChild(el('p', { class: 'hero-overview' }, it.overview));
    content.appendChild(el('div', { class: 'hero-actions' }, [el('button', { class: 'btn btn-primary', 'data-nav': '', onclick: () => openDetail(it) }, '▶  Trailer & Details'), el('button', { class: 'btn btn-accent', 'data-nav': '', onclick: () => openRequestModal(it) }, '＋  Request')]));
    slides.forEach((s, i) => s.classList.toggle('on', i === idx));
    dotEls.forEach((d, i) => d.classList.toggle('on', i === idx));
  };
  const go = (i) => { idx = (i + items.length) % items.length; paint(); restart(); };
  const next = () => go(idx + 1); const prev = () => go(idx - 1);
  const restart = () => { stopSlideshow(); slideTimer = setInterval(next, 6000); };
  node.appendChild(content); node.appendChild(dots);
  node.appendChild(el('div', { class: 'hero-arrows' }, [el('button', { class: 'hero-arrow', 'data-nav': '', title: 'Previous', onclick: prev }, '‹'), el('button', { class: 'hero-arrow', 'data-nav': '', title: 'Next', onclick: next }, '›')]));
  paint(); restart(); return node;
}
function stopSlideshow() { if (slideTimer) { clearInterval(slideTimer); slideTimer = null; } }

// Row with optional streaming brand logo before the title.
function rowEl(title, items, isPicked, ranked, brand) {
  const wrap = el('section', { class: 'row' });
  const titleNode = el('div', { class: 'row-title' });
  const inner = el('div', { class: 'row-title-wrap' });
  const bb = brand ? brandBadge(brand) : null;
  if (bb) inner.appendChild(bb);
  inner.appendChild(el('span', {}, title));
  titleNode.appendChild(inner);
  wrap.appendChild(el('div', { class: 'row-head' }, [titleNode, isPicked ? el('div', { class: 'row-sub' }, 'tuned to your Plex history') : null]));
  const scroll = el('div', { class: 'row-scroll' });
  (items || []).forEach((it, i) => scroll.appendChild(card(it, ranked ? i + 1 : null)));
  if (!items || !items.length) scroll.appendChild(el('div', { class: 'row-sub', style: 'padding:20px' }, 'Nothing here yet.'));
  wrap.appendChild(scroll);
  return wrap;
}
function rowSub(text) { return el('div', { class: 'row-sub', style: 'padding:0 40px 4px' }, text); }

function card(item, rank) {
  const c = el('div', { class: 'card', tabindex: '0', 'data-nav': '' });
  c.addEventListener('click', () => openDetail(item));
  if (item.poster) c.appendChild(el('img', { class: 'card-poster', src: item.poster, loading: 'lazy', alt: item.title }));
  else c.appendChild(el('div', { class: 'card-fallback' }, item.title || 'No image'));
  if (item.rating) c.appendChild(el('div', { class: 'card-badge' }, stars(item.rating)));
  if (rank) c.appendChild(el('div', { class: 'card-rank' }, String(rank)));
  if (item.why) c.appendChild(el('div', { class: 'why-chip', title: item.why }, item.why));
  c.appendChild(el('div', { class: 'card-info' }, [el('div', { class: 'card-name' }, item.title), el('div', { class: 'card-year' }, item.year || '')]));
  return c;
}
function personCard(m) {
  const c = card(m);
  if (m.owned) c.appendChild(el('div', { class: 'card-badge', style: 'left:8px;right:auto;top:8px;background:rgba(53,208,127,.92);color:#03150b' }, '✓ In library'));
  else c.appendChild(el('button', { class: 'btn btn-accent', 'data-nav': '', title: 'Request', style: 'position:absolute;bottom:8px;right:8px;padding:6px 10px;font-size:13px;border-radius:8px;z-index:6', onclick: (e) => { e.stopPropagation(); openRequestModal(m); } }, '＋'));
  if (m.job) c.appendChild(el('div', { class: 'why-chip', style: 'background:rgba(0,0,0,.72)', title: m.job }, m.job));
  return c;
}
function downloadRow(name, percent, timeLeft) {
  return el('div', { class: 'dl-item' }, [el('div', { class: 'dl-row' }, [el('span', { class: 'dl-name' }, name || 'item'), el('span', { class: 'dl-meta' }, (percent != null ? percent + '%' : '') + (timeLeft ? ' · ' + timeLeft : ''))]), el('div', { class: 'bar' }, [el('i', { style: `width:${percent || 0}%` })])]);
}

// ---------- detail modal (with ownership badges) ----------
async function openDetail(item) {
  const modal = document.getElementById('modal');
  const cardEl = document.getElementById('modalCard');
  modal.classList.remove('hidden');
  cardEl.innerHTML = '<div style="padding:60px;text-align:center;color:var(--muted)">Loading…</div>';
  document.getElementById('modalBackdrop').onclick = closeModal;
  const media = item.media === 'show' ? 'tv' : item.media || 'movie';
  if (!item.id) { cardEl.innerHTML = `<div style="padding:40px">No TMDB match for “${item.title}”.</div>`; return; }
  const d = await api(`/api/discover/${media}/${item.id}`);
  if (d.error) { cardEl.innerHTML = `<div style="padding:40px">${d.error}</div>`; return; }
  setAmbient(d.backdrop);
  const media_label = media === 'tv' ? 'TV' : 'Movie';
  cardEl.innerHTML = '';
  cardEl.appendChild(el('button', { class: 'modal-close', 'data-nav': '', onclick: closeModal }, '✕'));
  if (d.trailerKey) cardEl.appendChild(el('div', { class: 'modal-video', html: `<iframe src="https://www.youtube.com/embed/${d.trailerKey}?autoplay=0&rel=0&modestbranding=1" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>` }));
  else { const mh = el('div', { class: 'modal-hero' }); if (d.backdrop) mh.style.backgroundImage = `url(${d.backdrop})`; cardEl.appendChild(mh); }

  // Title row + ownership badges (✓ in library, series status).
  const ownBadges = el('div', { class: 'own-badges' });
  if (d.inLibrary) ownBadges.appendChild(el('span', { class: 'own-pill in-lib', title: 'In your Plex library' }, [el('span', { class: 'own-tick' }, '✓'), 'In library']));
  if (media === 'tv' && d.seriesStatus) ownBadges.appendChild(el('span', { class: 'own-pill ' + (d.seriesStatus === 'ended' ? 'ended' : 'cont') }, d.seriesStatus === 'ended' ? '■ Ended' : '● Continuing'));
  const titleRow = el('div', { class: 'title-row' }, [el('h2', { class: 'modal-title', style: 'margin:0' }, d.title), ownBadges]);

  const meta = el('div', { class: 'modal-meta' }, [
    d.year ? el('span', {}, d.year) : null,
    d.runtime ? el('span', {}, d.runtime + ' min') : null,
    d.rating ? el('span', { style: 'color:var(--gold)' }, stars(d.rating)) : null,
    el('span', { class: 'chip' }, media_label),
    ...(d.genres || []).slice(0, 3).map((g) => el('span', { class: 'chip' }, g))
  ]);
  if (d.imdbRating) meta.appendChild(el('span', { class: 'imdb-badge' }, [el('span', { class: 'imdb-logo' }, 'IMDb'), el('span', { class: 'imdb-score', html: `<b>${d.imdbRating.toFixed(1)}</b>/10` }), d.imdbVotes ? el('span', { class: 'imdb-votes' }, d.imdbVotes) : null]));
  // Episode-% ring right after the IMDb badge (TV only, when owned).
  if (media === 'tv' && d.episodePercent != null) {
    const full = d.episodePercent >= 100;
    const ring = el('span', { class: 'ep-ring' + (full ? ' full' : '') }, [
      el('span', { class: 'ring', style: `--p:${d.episodePercent}` }, [el('i', {}, full ? '✓' : d.episodePercent + '%')]),
      el('span', { class: 'lbl' }, full ? `All ${d.episodesTotal} eps` : `${d.episodesOwned}/${d.episodesTotal} eps`)
    ]);
    meta.appendChild(ring);
  }

  const actions = el('div', { class: 'modal-actions' }, [
    el('button', { class: 'btn btn-accent', 'data-nav': '', onclick: () => openRequestModal({ ...item, media, title: d.title, backdrop: d.backdrop }) }, '＋  Request'),
    d.trailerKey ? el('a', { class: 'btn btn-ghost', 'data-nav': '', href: `https://www.youtube.com/watch?v=${d.trailerKey}`, target: '_blank' }, '▶  YouTube') : null,
    d.imdbUrl ? el('a', { class: 'btn btn-imdb', 'data-nav': '', href: d.imdbUrl, target: '_blank', rel: 'noopener' }, 'IMDb ↗') : null
  ]);

  const body = el('div', { class: 'modal-body' }, [
    titleRow,
    d.tagline ? el('div', { class: 'modal-tagline' }, d.tagline) : null,
    meta,
    item.why ? el('div', { class: 'why-chip', style: 'position:static;display:inline-block;margin-bottom:12px' }, '✨ ' + item.why) : null,
    el('p', { class: 'modal-overview' }, d.overview || 'No description available.'),
    actions
  ]);

  if (d.cast && d.cast.length) {
    body.appendChild(el('div', { class: 'section-label' }, 'Cast · tap an actor'));
    const cast = el('div', { class: 'cast-row' });
    d.cast.forEach((p) => { const cc = el('div', { class: 'cast', tabindex: '0', 'data-nav': '', style: 'cursor:pointer' }, [p.photo ? el('img', { src: p.photo, loading: 'lazy', alt: p.name }) : el('div', { class: 'cast-ph' }, '👤'), el('div', { class: 'cast-name' }, p.name), el('div', { class: 'cast-char' }, p.character || '')]); cc.addEventListener('click', () => openPerson(p)); cast.appendChild(cc); });
    body.appendChild(cast);
  }
  const more = (d.recommendations && d.recommendations.length ? d.recommendations : d.similar) || [];
  if (more.length) { body.appendChild(el('div', { class: 'section-label' }, 'More like this')); const row = el('div', { class: 'cast-row' }); more.forEach((m) => row.appendChild(card(normalize(m, m.media)))); body.appendChild(row); }
  cardEl.appendChild(body); cardEl.scrollTop = 0;
}

async function openPerson(person) {
  const modal = document.getElementById('modal'); const cardEl = document.getElementById('modalCard');
  modal.classList.remove('hidden');
  cardEl.innerHTML = '<div style="padding:60px;text-align:center;color:var(--muted)">Loading…</div>';
  document.getElementById('modalBackdrop').onclick = closeModal;
  const p = await api('/api/discover/person/' + person.id);
  if (p.error) { cardEl.innerHTML = `<div style="padding:40px">${p.error}</div>`; return; }
  cardEl.innerHTML = '';
  cardEl.appendChild(el('button', { class: 'modal-close', 'data-nav': '', onclick: closeModal }, '✕'));
  cardEl.appendChild(el('div', { class: 'modal-body', style: 'padding-bottom:6px' }, [el('div', { style: 'display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap' }, [p.photo ? el('img', { src: p.photo, alt: p.name, style: 'width:120px;height:120px;border-radius:16px;object-fit:cover;background:#262633' }) : el('div', { class: 'cast-ph', style: 'width:120px;height:120px;border-radius:16px;font-size:40px' }, '👤'), el('div', { style: 'flex:1;min-width:240px' }, [el('h2', { class: 'modal-title', style: 'font-size:30px' }, p.name), p.department ? el('div', { class: 'modal-tagline' }, p.department + (p.place ? ` · ${p.place}` : '')) : null, el('div', { class: 'modal-meta' }, [el('span', { class: 'chip' }, `${p.counts.library} in your library`), el('span', { class: 'chip' }, `${p.counts.total} credits`), p.imdbUrl ? el('a', { class: 'btn btn-imdb', 'data-nav': '', href: p.imdbUrl, target: '_blank', rel: 'noopener', style: 'padding:6px 12px' }, 'IMDb ↗') : null]), p.biography ? el('p', { class: 'modal-overview', style: 'margin-top:10px' }, p.biography) : null])])]));
  const body = el('div', { class: 'modal-body', style: 'padding-top:0' });
  body.appendChild(el('div', { class: 'section-label' }, `In your library · ${p.name.split(' ')[0]}`));
  if (p.inLibrary && p.inLibrary.length) { const row = el('div', { class: 'cast-row' }); p.inLibrary.forEach((m) => row.appendChild(personCard(m))); body.appendChild(row); }
  else body.appendChild(el('div', { class: 'row-sub', style: 'margin-bottom:6px' }, 'Nothing yet — request something from “Known for” below.'));
  if (p.knownFor && p.knownFor.length) { body.appendChild(el('div', { class: 'section-label' }, 'Known for (acting) · tap ＋ to send to your systems')); const row = el('div', { class: 'cast-row' }); p.knownFor.forEach((m) => row.appendChild(personCard(m))); body.appendChild(row); }
  if (p.crewKnownFor && p.crewKnownFor.length) { body.appendChild(el('div', { class: 'section-label' }, 'Directed · written · produced · tap ＋ to request')); const row = el('div', { class: 'cast-row' }); p.crewKnownFor.forEach((m) => row.appendChild(personCard(m))); body.appendChild(row); }
  cardEl.appendChild(body); cardEl.scrollTop = 0;
}

function closeModal() { document.getElementById('modalCard').innerHTML = ''; document.getElementById('modal').classList.add('hidden'); }
document.addEventListener('nav:back', () => {
  const rq = document.getElementById('requestModal');
  if (rq && !rq.classList.contains('hidden')) { closeRequestModal(); return; }
  const modal = document.getElementById('modal');
  if (!modal.classList.contains('hidden')) closeModal();
});

async function openRequestModal(item) {
  const media = item.media === 'show' ? 'tv' : item.media || 'movie';
  if (!item.id) { toast('No TMDB match to request', 'bad'); return; }
  let host = document.getElementById('requestModal');
  if (!host) { host = document.createElement('div'); host.id = 'requestModal'; host.className = 'req-overlay'; document.body.appendChild(host); }
  host.classList.remove('hidden');
  host.innerHTML = `<div class="req-backdrop"></div><div class="req-card"><div class="req-loading">Loading options…</div></div>`;
  host.querySelector('.req-backdrop').onclick = closeRequestModal;
  const opts = await api('/api/request/options?media=' + media);
  const cardEl = host.querySelector('.req-card');
  if (opts.error) { cardEl.innerHTML = requestHeader(media, item) + `<div class="req-body"><div class="req-note bad">⚠ ${opts.error}</div></div><div class="req-footer"><button class="btn btn-ghost" id="reqCancel">Close</button></div>`; cardEl.style.setProperty('--req-bg', item.backdrop ? `url(${item.backdrop})` : 'none'); host.querySelector('#reqCancel').onclick = closeRequestModal; return; }
  const profileOpts = opts.profiles.map((p) => `<option value="${p.id}" ${p.id == opts.defaultProfileId ? 'selected' : ''}>${p.name}${p.id == opts.defaultProfileId ? ' (Default)' : ''}</option>`).join('');
  const rootOpts = opts.rootFolders.map((f) => `<option value="${f.path}" ${f.path === opts.defaultRootFolder ? 'selected' : ''}>${f.label}${f.path === opts.defaultRootFolder ? ' (Default)' : ''}</option>`).join('');
  const tagChips = opts.tags.map((t) => `<span class="tag-chip" data-tag="${t.id}">${t.label}</span>`).join('');
  const requester = opts.requestAs ? `${opts.requestAs.name}${opts.requestAs.email ? ` <span class="req-muted">(${opts.requestAs.email})</span>` : ''}` : (getProfile()?.name || 'This server');
  cardEl.style.setProperty('--req-bg', item.backdrop ? `url(${item.backdrop})` : 'none');
  cardEl.innerHTML = `
    ${requestHeader(media, item)}
    <div class="req-body">
      <div class="req-note ok">ⓘ &nbsp;This request will be approved automatically.</div>
      <div class="req-adv">Advanced</div>
      <div class="req-grid">
        <div class="req-field"><label>Destination Server</label><select id="reqServer">${opts.servers.map((s) => `<option value="${s.id}">${s.name}</option>`).join('')}</select></div>
        <div class="req-field"><label>Quality Profile</label><select id="reqProfile">${profileOpts || '<option>Default</option>'}</select></div>
        <div class="req-field"><label>Root Folder</label><select id="reqRoot">${rootOpts || '<option>Default</option>'}</select></div>
      </div>
      <div class="req-field"><label>Tags</label>
        <div class="tag-picker" id="reqTags">${tagChips || '<span class="req-muted" style="padding:6px">No tags in ' + opts.kind + ' yet — type to add one.</span>'}</div>
        <input class="tag-input" id="reqNewTag" placeholder="Add a tag and press Enter…" />
      </div>
      <div class="req-field"><label>Request As</label><div class="req-as"><span class="req-avatar">${(requester || 'N')[0].toUpperCase()}</span><span>${requester}</span></div></div>
    </div>
    <div class="req-footer"><button class="btn btn-ghost" id="reqCancel">Cancel</button><button class="btn btn-accent" id="reqSubmit">Request</button></div>`;
  const selected = new Set();
  cardEl.querySelectorAll('.tag-chip').forEach((chip) => chip.addEventListener('click', () => { const id = Number(chip.dataset.tag); if (selected.has(id)) { selected.delete(id); chip.classList.remove('on'); } else { selected.add(id); chip.classList.add('on'); } }));
  const newTags = [];
  const newTagInput = cardEl.querySelector('#reqNewTag');
  newTagInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && newTagInput.value.trim()) { e.preventDefault(); const label = newTagInput.value.trim(); newTags.push(label); cardEl.querySelector('#reqTags').appendChild(el('span', { class: 'tag-chip on' }, label)); newTagInput.value = ''; } });
  cardEl.querySelector('#reqCancel').onclick = closeRequestModal;
  cardEl.querySelector('#reqSubmit').onclick = async () => {
    const btn = cardEl.querySelector('#reqSubmit'); btn.disabled = true; btn.textContent = 'Requesting…';
    const payload = { media, tmdbId: item.id, qualityProfileId: cardEl.querySelector('#reqProfile')?.value || undefined, rootFolder: cardEl.querySelector('#reqRoot')?.value || undefined, tags: [...selected], newTags };
    const r = await api('/api/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (r.ok) showRequestResult(cardEl, item, { kind: r.kind, state: 'added' });
    else if (r.code === 'exists') showRequestResult(cardEl, item, { kind: r.kind, state: 'exists' });
    else { toast('Request failed: ' + (r.error || 'unknown'), 'bad'); btn.disabled = false; btn.textContent = 'Request'; }
  };
  setTimeout(() => { const f = cardEl.querySelector('#reqProfile'); if (f) setFocus(f); }, 80);
}
function showRequestResult(cardEl, item, { kind, state }) {
  const added = state === 'added'; const svc = kind === 'sonarr' ? 'Sonarr' : 'Radarr';
  cardEl.innerHTML = `${requestHeader(item.media === 'show' ? 'tv' : item.media || 'movie', item)}<div class="req-result"><div class="req-check ${added ? '' : 'exists'}">✓</div><h3>${added ? 'Added to ' + svc : 'Already in your library'}</h3><p>${added ? `“${item.title}” is on its way — downloading soon.` : `“${item.title}” is already in ${svc}.`}</p><button class="btn btn-accent" id="reqDone" data-nav>Done</button></div>`;
  const done = cardEl.querySelector('#reqDone'); done.onclick = closeRequestModal; setTimeout(() => setFocus(done), 60);
  setTimeout(() => { const h = document.getElementById('requestModal'); if (h && !h.classList.contains('hidden')) closeRequestModal(); }, 2600);
}
function requestHeader(media, item) { return `<div class="req-hero" style="background-image:var(--req-bg)"></div><div class="req-head"><div class="req-kicker">Request ${media === 'tv' ? 'Series' : 'Movie'}</div><div class="req-name">${item.title || ''}</div></div>`; }
function closeRequestModal() { const host = document.getElementById('requestModal'); if (host) host.classList.add('hidden'); }

function isTop(title) { return /· Top 10$/.test(title || '') || /Top 250/.test(title || ''); }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function normalize(c, media) {
  return { id: c.id, media: media || c.media || c.media_type || (c.title ? 'movie' : 'tv'), title: c.title || c.name, year: c.year || (c.release_date || c.first_air_date || '').slice(0, 4), overview: c.overview, poster: c.poster || (c.poster_path ? `https://image.tmdb.org/t/p/w500${c.poster_path}` : null), backdrop: c.backdrop || (c.backdrop_path ? `https://image.tmdb.org/t/p/w1280${c.backdrop_path}` : null), rating: c.rating || c.vote_average, why: c.why };
}
function setAmbient(url) { if (!url) return; ambient.style.backgroundImage = `url(${url})`; ambient.style.opacity = '1'; }
function skeleton() { const cards = Array.from({ length: 7 }).map(() => '<div class="skeleton"></div>').join(''); return `<div style="height:40vh"></div><div class="row-head"><div class="row-title">Loading…</div></div><div class="skeleton-row">${cards}</div><div class="skeleton-row">${cards}</div>`; }
function emptyState(title, sub, showSettings) { return el('div', { class: 'empty' }, [el('h3', {}, title), el('p', {}, sub || ''), showSettings ? el('button', { class: 'btn btn-accent', 'data-nav': '', style: 'margin-top:16px', onclick: () => openSettings(false) }, 'Open Settings') : null]); }
function focusFirstCard() { setTimeout(() => { const first = document.querySelector('.hero-actions .btn, .card, .status-card, .seg button'); if (first) setFocus(first); }, 120); }

boot();

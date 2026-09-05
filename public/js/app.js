// Intelligent IMDb Prefetcher
window.imdbCache = window.imdbCache || {};
const imdbPrefetchQueue = new Map();
let imdbPrefetchTimer = null;

window.imdbObserver = new IntersectionObserver((entries) => {
  let needsFetch = false;
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const el = entry.target;
      const id = el.dataset.id;
      const media = el.dataset.media;
      if (id && media && !window.imdbCache[id]) {
        imdbPrefetchQueue.set(id, { id, media });
        needsFetch = true;
        window.imdbObserver.unobserve(el);
      }
    }
  });

  if (needsFetch && !imdbPrefetchTimer) {
    imdbPrefetchTimer = setTimeout(() => {
      const items = Array.from(imdbPrefetchQueue.values());
      imdbPrefetchQueue.clear();
      imdbPrefetchTimer = null;
      if (!items.length) return;
      
      fetch('/api/discover/imdb-ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: items.slice(0, 30) })
      }).then(r => r.json()).then(r => {
        if (r && r.ratings) Object.assign(window.imdbCache, r.ratings);
      }).catch(()=>{});
    }, 1500);
  }
}, { rootMargin: '250px' });

// Universal Media Status Prefetcher (In Library & Requested)
window.mediaStatusCache = window.mediaStatusCache || {};
const statusPrefetchQueue = new Map();
let statusPrefetchTimer = null;

export function applyCardStatus(cardEl, statusInfo) {
  if (!cardEl || !statusInfo) return;
  const existing = cardEl.querySelector('.card-status-badge');
  if (existing) existing.remove();

  if (statusInfo.status === 'in_library') {
    cardEl.classList.add('has-status');
    const b = el('div', { class: 'card-status-badge in-library' }, [
      el('span', { style: 'font-weight:900;' }, '✓'),
      'In library'
    ]);
    cardEl.appendChild(b);
  } else if (statusInfo.status === 'requested') {
    cardEl.classList.add('has-status');
    const b = el('div', { class: 'card-status-badge requested' }, [
      el('span', {}, '⏳'),
      'Requested'
    ]);
    cardEl.appendChild(b);
  }
}

window.statusObserver = new IntersectionObserver((entries) => {
  let needsFetch = false;
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      const cardEl = entry.target;
      const id = cardEl.dataset.id;
      const media = cardEl.dataset.media;
      if (id && media) {
        if (window.mediaStatusCache[id]) {
          applyCardStatus(cardEl, window.mediaStatusCache[id]);
          window.statusObserver.unobserve(cardEl);
        } else {
          statusPrefetchQueue.set(id, { id, media, cardEl });
          needsFetch = true;
          window.statusObserver.unobserve(cardEl);
        }
      }
    }
  });

  if (needsFetch && !statusPrefetchTimer) {
    statusPrefetchTimer = setTimeout(() => {
      const itemsWithCards = Array.from(statusPrefetchQueue.values());
      statusPrefetchQueue.clear();
      statusPrefetchTimer = null;
      if (!itemsWithCards.length) return;

      const payload = itemsWithCards.slice(0, 50).map(({ id, media }) => ({ id, media }));
      fetch('/api/discover/media-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload })
      })
      .then((r) => r.json())
      .then((data) => {
        if (data && data.statuses) {
          Object.assign(window.mediaStatusCache, data.statuses);
          itemsWithCards.forEach(({ id, cardEl }) => {
            if (data.statuses[id]) {
              applyCardStatus(cardEl, data.statuses[id]);
            }
          });
        }
      })
      .catch(() => {});
    }, 150);
  }
}, { rootMargin: '350px' });

document.addEventListener('click', (e) => {
  if (e.target.closest('button, .card, .nav-link, .bottom-nav-item, .drawer-item, .tag-chip, .appr-subtab, .appr-btn, .icon-btn')) {
    if (navigator.vibrate) navigator.vibrate(40);
  }
});
// NickSeer main app — login, multi-user profiles, brand-logo row titles,
// detail ownership badges (in-library ✓, series status, episode-% ring),
// hero slideshow, all discovery views, box office (worldwide total),
// downloads, search, and the Overseerr-style Request modal.
//
// CHANGES IN THIS PATCH:
//  1) "Who's watching?" profiles are now REAL accounts. Switching to a
//     profile that isn't the currently-authenticated user triggers an actual
//     sign-in (password, or Plex OAuth for Plex-provisioned accounts) via
//     login-enhance.js's promptReauth(), so the Bearer token — and therefore
//     who a request/approval is attributed to — is genuinely correct.
//  2) Search no longer steals focus onto the first result while you're still
//     typing/paused (was causing an unwanted "jump" on desktop AND mobile).
//     Focus into results now only happens on an intentional ArrowDown/Enter.
import { toast, el, api, stars, authToken , escHTML, hasCache } from './util.js';
import { openSettings } from './settings.js';
import { setFocus } from './nav.js';
const app = document.getElementById('app');
const ambient = document.getElementById('ambient');
let currentView = 'home';
let rowsCache = null;
let slideTimer = null;
let currentViewSeq = 0;
const mediaToggle = { streaming: 'movie', new: 'movie', coming: 'movie' };

// Automatically suppress intrusive third-party browser extension widgets (e.g. Adobe Acrobat floating toolbar)
try {
  const cleanExtensionWidgets = () => {
    document.querySelectorAll('adobe-acrobat-pdf-viewer, [id*="adobe-acrobat"], [class*="adobe-acrobat"], [id*="adobe_dc_"], [class*="adobe_dc_"]').forEach((el) => el.remove());
    document.querySelectorAll('body > div, body > aside, body > section').forEach((el) => {
      if (el.id !== 'app' && el.id !== 'ambient' && el.id !== 'modal' && !el.classList?.contains('topbar')) {
        const txt = el.textContent || '';
        if (txt.includes('Adobe Acrobat') || txt.includes('Summarize with AI') || txt.includes('Convert to PDF') || txt.includes('Ask AI about page')) {
          el.remove();
        }
      }
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cleanExtensionWidgets);
  else cleanExtensionWidgets();
  const extObserver = new MutationObserver(() => cleanExtensionWidgets());
  extObserver.observe(document.body, { childList: true });
} catch (_) {}

// ---------- brand logos ----------
const BRANDS = {
  netflix: { cls: 'bg-netflix', mark: 'N' },
  disney: { cls: 'bg-disney', mark: 'D+' },
  amazon: { cls: 'bg-amazon', mark: 'a' },
  max: { cls: 'bg-max', mark: 'M' },
  apple: { cls: 'bg-apple', mark: '' },   // Apple logo glyph
  paramount: { cls: 'bg-paramount', mark: 'P+' }
};
function brandBadge(key) {
  const b = BRANDS[key];
  if (!b) return null;
  return el('span', { class: 'brand-badge ' + b.cls, title: key }, b.mark);
}

// ---------- login & auth gating ----------
import { renderAegeanLogin, promptReauth, getMe } from './login-enhance.js';
async function ensureAuth() {
  try {
    const st = await fetch('/api/auth/status').then((r) => r.json()).catch(() => ({ enabled: false }));
    if (!st || !st.enabled) return true;
  } catch { /* proceed */ }

  const tok = authToken();
  if (tok) {
    const me = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + tok } }).then((r) => r.json()).catch(() => ({ ok: false }));
    if (me && me.ok) return true;
  }
  await showLogin();
  return false;
}

function showLogin() {
  return new Promise((resolve) => {
    // Hide all overlays that might be open
    document.getElementById('profileOverlay')?.classList.add('hidden');
    document.getElementById('modal')?.classList.add('hidden');
    document.getElementById('requestModal')?.classList.add('hidden');
    document.getElementById('settings')?.classList.add('hidden');
    renderAegeanLogin(async (user) => {
      resolve(true);
      await afterAuth();
    });
  });
}
document.addEventListener('auth:required', () => {
  localStorage.removeItem('nickseer_token');
  localStorage.removeItem('nickseer_profile');
  showLogin();
});
document.addEventListener('auth:logout', () => {
  localStorage.removeItem('nickseer_token');
  localStorage.removeItem('nickseer_profile');
  showLogin();
});
document.addEventListener('auth:choose-profile', () => {
  chooseProfile(true);
});

// ---------- profiles (multi-user, now backed by REAL accounts) ----------
const PROFILE_KEY = 'nickseer_profile';
function getProfile() { try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); } catch { return null; } }
function setProfile(p) { if (p) localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); else localStorage.removeItem(PROFILE_KEY); paintProfileBadge(); updateRoleVisibility(); }
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
  let list = [];
  try {
    const [pRes, tUsers] = await Promise.all([
      fetch('/api/auth/profiles').then(async (r) => {
        const txt = await r.text();
        try { return JSON.parse(txt); } catch { return { profiles: [] }; }
      }).catch(() => ({ profiles: [] })),
      api('/api/settings/users').catch(() => [])
    ]);

    const set = new Map();
    if (pRes && Array.isArray(pRes.profiles)) {
      pRes.profiles.forEach((u) => {
        if (!u.name && !u.id) return;
        set.set(String(u.name || u.id).toLowerCase(), {
          id: u.id || u.name,
          name: u.name || u.id,
          thumb: u.thumb || '',
          isAccount: true,
          role: u.role || 'user',
          plex: !!u.plex
        });
      });
    }
    if (Array.isArray(tUsers)) {
      tUsers.forEach((u) => {
        if (!u.id && !u.name) return;
        const key = String(u.name || u.id).toLowerCase();
        const existing = set.get(key);
        if (existing) { if (u.thumb && !existing.thumb) existing.thumb = u.thumb; }
        else set.set(key, { id: u.id || '', name: u.name || 'User', thumb: u.thumb || '', isAccount: false, role: 'user', plex: false });
      });
    }
    list = [...set.values()];
  } catch {
    list = [];
  }
  let host = document.getElementById('profileOverlay');
  if (!host) { host = document.createElement('div'); host.id = 'profileOverlay'; host.className = 'profile-overlay'; document.body.appendChild(host); }
  host.classList.remove('hidden');
  const avatar = (u) => {
    const initials = (u.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
    const style = u.thumb ? `background-image:url('${u.thumb}');background-size:cover;` : '';
    const badge = (u.isAccount && u.role === 'admin') ? '<span class="profile-badge">Admin</span>' : '';
    return `<button class="profile-tile" data-nav data-id="${u.id}" data-name="${encodeURIComponent(u.name || 'User')}" data-account="${u.isAccount ? '1' : '0'}" data-plex="${u.plex ? '1' : '0'}" data-thumb="${encodeURIComponent(u.thumb || '')}"><span class="profile-face" style="${style}">${u.thumb ? '' : initials}${badge}</span><span class="profile-name">${u.name || 'User'}</span></button>`;
  };
  host.innerHTML = `
    <div class="profile-inner">
      <div class="profile-logo-mark"><span class="brand-mark" style="margin:0 auto 12px;width:48px;height:48px;"></span></div>
      <h1 class="profile-h1">Who's watching?</h1>
      <div class="profile-grid">
        ${list.map(avatar).join('')}
        <button class="profile-tile" data-nav data-id="" data-name="Everyone">
          <span class="profile-face" style="background:linear-gradient(135deg,#1E88C7,#0f5687);border-color:rgba(58,166,224,0.4)">👥</span>
          <span class="profile-name">Everyone</span>
        </button>
      </div>
      ${force ? '<button class="btn btn-ghost" id="profileClose" data-nav style="margin-top:20px;padding:10px 24px;">Close</button>' : ''}
    </div>`;
  host.querySelectorAll('.profile-tile').forEach((t) => t.addEventListener('click', async () => {
    const id = t.dataset.id;
    const name = decodeURIComponent(t.dataset.name || 'User');
    const isAccount = t.dataset.account === '1';
    const isPlex = t.dataset.plex === '1';
    const thumb = decodeURIComponent(t.dataset.thumb || '');

    if (!id) {
      // "Everyone" — cosmetic only; no auth change. Requests made while this
      // is selected are attributed to whoever is actually signed in.
      setProfile({ id: '', name: 'Everyone' });
      host.classList.add('hidden'); rowsCache = null; showView('home');
      toast('Browsing as Everyone', 'ok');
      return;
    }

    if (!isAccount) {
      // Media-only profile (no NickSeer login account yet) — cosmetic switch.
      setProfile({ id, name });
      host.classList.add('hidden'); rowsCache = null; showView('home');
      toast(`Browsing as ${name} — requests use your signed-in account`, 'ok');
      return;
    }

    // Real NickSeer account: only re-authenticate if we aren't already them.
    const me = await getMe();
    if (me && me.username.toLowerCase() === name.toLowerCase()) {
      setProfile({ id, name });
      host.classList.add('hidden'); rowsCache = null; showView('home');
      toast(`Welcome, ${name}`, 'ok');
      return;
    }

    const result = await promptReauth(name, { isPlex, thumb });
    if (result && result.ok) {
      setProfile({ id: result.user.username, name: result.user.username });
      toast(`Signed in as ${result.user.username}`, 'ok');
      // A full reload guarantees every module re-reads the fresh Bearer token
      // (matches the same proven pattern used by the top-bar profile menu).
      location.reload();
    } else if (result && !result.cancelled) {
      toast(result.error || 'Sign-in failed', 'bad');
    }
  }));
  const close = host.querySelector('#profileClose');
  if (close) close.addEventListener('click', () => host.classList.add('hidden'));
  setTimeout(() => { const f = host.querySelector('.profile-tile'); if (f) setFocus(f); }, 80);
  injectStyles();
}
function injectStyles() {
  if (document.getElementById('profile-styles')) return;
  const css = `
  .profile-overlay{position:fixed;inset:0;z-index:110;display:block;overflow-y:auto;padding:8vh 0 40px;background:radial-gradient(ellipse at 50% 25%, rgba(30,136,199,0.25) 0%, rgba(6,18,32,0.95) 50%, #030a14 100%);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);}
  .profile-overlay.hidden{display:none;}
  .profile-inner{text-align:center;padding:20px;max-width:92vw;margin:0 auto;min-height:min-content;}
  .profile-h1{font-size:38px;font-weight:900;margin:0 0 32px;color:#f0f7ff;letter-spacing:-.02em;text-shadow:0 2px 10px rgba(0,0,0,.5);}
  .profile-grid{display:flex;gap:24px;flex-wrap:wrap;justify-content:center;max-width:880px;margin:0 auto;}
  .profile-tile{background:transparent;border:0;display:flex;flex-direction:column;align-items:center;gap:12px;cursor:pointer;outline:none;}
  .profile-face{position:relative;width:115px;height:115px;border-radius:18px;display:grid;place-items:center;font-size:38px;font-weight:800;color:#fff;background:linear-gradient(135deg,#2E9BD6,#0f5687);border:3px solid transparent;box-shadow:0 10px 25px rgba(0,0,0,.45);transition:transform .2s,border-color .2s,box-shadow .2s;}
  .profile-tile:hover .profile-face,.profile-tile.nav-focus .profile-face{border-color:#3AA6E0;transform:scale(1.08);box-shadow:0 14px 35px rgba(30,136,199,.55);}
  .profile-name{color:#a2c4e2;font-size:16px;font-weight:700;transition:color .2s;}
  .profile-tile:hover .profile-name,.profile-tile.nav-focus .profile-name{color:#ffffff;}
  .profile-badge{position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#f5c518,#e5a00d);color:#1b1b1b;font-size:9px;font-weight:900;padding:2px 8px;border-radius:999px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.4);letter-spacing:.02em;}
  .req-result{padding:54px 32px;text-align:center;}
  .req-check{width:84px;height:84px;border-radius:50%;margin:0 auto 20px;display:grid;place-items:center;font-size:44px;background:radial-gradient(circle at 50% 40%,#3AA6E0,#0f5687);color:#fff;box-shadow:0 10px 30px rgba(30,136,199,.45);animation:pop .35s cubic-bezier(.2,.8,.2,1.4);}
  .req-check.exists{background:radial-gradient(circle at 50% 40%,#1E88C7,#08385f);}
  @keyframes pop{0%{transform:scale(.4);opacity:0;}100%{transform:scale(1);opacity:1;}}
  .req-result h3{font-size:24px;font-weight:900;margin:0 0 6px;color:#fff;} .req-result p{color:#9aa0ad;margin:0 0 22px;}
  @media(max-width:640px){.profile-face{width:90px;height:90px;font-size:28px;}.profile-h1{font-size:28px;}}`;
  const st = document.createElement('style'); st.id = 'profile-styles'; st.textContent = css; document.head.appendChild(st);
}

// ---------- boot ----------
async function boot() {
  injectStyles();
  const ok = await ensureAuth();
  if (!ok) return; // login shown; resolves then calls afterAuth
  await afterAuth();
}
async function afterAuth() {
  let health = { configured: true };
  try {
    const h = await api('/api/health');
    if (h && typeof h.configured === 'boolean') health = h;
  } catch {
    health = { configured: true };
  }

  if (health.configured === false) {
    openSettings(true);
    return;
  }

  paintProfileBadge();
  try {
    await updateRoleVisibility();
  } catch { /* ignore */ }

  if (!getProfile()) {
    await chooseProfile(false);
  } else {
    const initialView = getInitialView();
    showView(initialView);
  }
}

function getInitialView() {
  const hash = (location.hash || '').replace(/^#\/?/, '').toLowerCase().trim();
  const validViews = ['home', 'movies', 'shows', 'streaming', 'new', 'boxoffice', 'coming', 'status', 'info', 'live', 'requests'];
  if (hash && validViews.includes(hash)) return hash;
  
  try {
    const saved = sessionStorage.getItem('ns_active_view') || localStorage.getItem('ns_active_view');
    if (saved && validViews.includes(saved.toLowerCase())) return saved.toLowerCase();
  } catch {}
  
  return 'home';
}

document.addEventListener('settings:saved', () => { rowsCache = null; showView(currentView); });
document.getElementById('profileBtn')?.addEventListener('click', () => chooseProfile(true));
document.getElementById('bottomProfileBtn')?.addEventListener('click', () => chooseProfile(true));
document.getElementById('refreshBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('refreshBtn'); btn.classList.add('spinning');
  try { await api('/api/settings/refresh', { method: 'POST' }); } catch { /* ignore */ }
  rowsCache = null; await showView(currentView, true); toast('Refreshed from source', 'ok');
  setTimeout(() => btn.classList.remove('spinning'), 600);
});

const search = document.getElementById('search');
let searchTimer;
search.addEventListener('input', () => { clearTimeout(searchTimer); const q = search.value.trim(); if (!q) { showView(currentView); return; } searchTimer = setTimeout(() => runSearch(q), 350); });
// Intentional "jump into results" — ONLY on ArrowDown/Enter, so typing (and
// the debounce-triggered re-render after a pause) never steals focus away
// from the input on its own. This is what was causing the "auto-scrolls to a
// movie while I'm still typing/paused" bug on both desktop and mobile.
search.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'Enter') {
    const first = app.querySelector('.card');
    if (first) { e.preventDefault(); setFocus(first); }
  }
});
// Topbar, Bottom nav, and Mobile Drawer sync
// Pre-highlight initial active tab immediately from URL hash or localStorage
try {
  const earlyHash = (location.hash || '').replace(/^#\/?/, '').toLowerCase().trim();
  const earlySaved = sessionStorage.getItem('ns_active_view') || localStorage.getItem('ns_active_view') || '';
  const earlyView = earlyHash || earlySaved;
  const validViews = ['home', 'movies', 'shows', 'ai', 'streaming', 'new', 'boxoffice', 'coming', 'status', 'info', 'live', 'requests'];
  if (earlyView && validViews.includes(earlyView) && earlyView !== 'home') {
    document.querySelectorAll('.nav-link, .bottom-nav-item, .drawer-item').forEach((n) => {
      if (n.dataset.view === earlyView) n.classList.add('active');
      else if (n.dataset.view) n.classList.remove('active');
    });
  }
} catch {}

function setupNavigation() {
  const drawer = document.getElementById('drawerOverlay');
  const openDrawer = () => drawer?.classList.remove('hidden');
  const closeDrawer = () => drawer?.classList.add('hidden');

  document.getElementById('mobileMenuBtn')?.addEventListener('click', openDrawer);
  document.getElementById('bottomMenuBtn')?.addEventListener('click', openDrawer);
  document.getElementById('drawerCloseBtn')?.addEventListener('click', closeDrawer);
  document.getElementById('drawerBackdrop')?.addEventListener('click', closeDrawer);

  document.getElementById('drawerSettingsBtn')?.addEventListener('click', () => {
    closeDrawer();
    document.getElementById('settingsBtn')?.click();
  });
  document.getElementById('drawerProfileBtn')?.addEventListener('click', () => {
    closeDrawer();
    chooseProfile(true);
  });

  document.querySelectorAll('.nav-link[data-view], .bottom-nav-item[data-view], .drawer-item[data-view]').forEach((b) => {
    b.addEventListener('click', () => {
      const view = b.dataset.view;
      if (view) {
        closeDrawer();
        document.querySelectorAll('.nav-link, .bottom-nav-item, .drawer-item').forEach((n) => {
          if (n.dataset.view === view) n.classList.add('active');
          else if (n.dataset.view) n.classList.remove('active');
        });
        showView(view);
      }
    });
  });
}
setupNavigation();
export async function updateRoleVisibility() {
  const t = authToken();
  let isAdmin = false;
  if (t) {
    try {
      const me = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + t } }).then((r) => r.json());
      isAdmin = me?.user?.role === 'admin';
    } catch { isAdmin = false; }
  }
  
  // Admin-only navigation views
  const adminViews = ['info', 'live'];
  document.querySelectorAll('.nav-link, .drawer-item, .bottom-nav-item').forEach((el) => {
    const v = el.dataset.view;
    if (adminViews.includes(v)) {
      el.style.display = isAdmin ? '' : 'none';
    }
  });

  const drawerSettings = document.getElementById('drawerSettingsBtn');
  if (drawerSettings) drawerSettings.style.display = isAdmin ? '' : 'none';
  const topSettings = document.getElementById('settingsBtn');
  if (topSettings) topSettings.style.display = isAdmin ? '' : 'none';

  return isAdmin;
}
async function showView(view, force = false) {
  const seq = ++currentViewSeq;
  if (['info', 'live'].includes(view)) {
    const isAdmin = await updateRoleVisibility();
    if (seq !== currentViewSeq) return;
    if (!isAdmin) {
      toast('Admin only', 'bad');
      showView('home');
      return;
    }
  }
  currentView = view;
  stopSlideshow();
  let route = '';
  if (view === 'home') route = '/api/discover/library';
  else if (view === 'movies') route = '/api/discover/movies';
  else if (view === 'tv') route = '/api/discover/tv';
  else if (view === 'new') route = '/api/discover/new';
  else if (view === 'boxoffice') route = '/api/discover/boxoffice';
  else if (view === 'coming') route = '/api/discover/coming';
  else if (view === 'requests') route = '/api/requests';
  
  if (!force && route && hasCache(route)) {
    // SWR: Don't show skeleton, let it render instantly from cache
  } else {
    if (!['info', 'live', 'status'].includes(view)) {
      app.innerHTML = skeleton();
    }
  }

  // Remember active view across refreshes & update URL hash seamlessly
  try {
    sessionStorage.setItem('ns_active_view', view);
    localStorage.setItem('ns_active_view', view);
    if (location.hash.replace(/^#\/?/, '').toLowerCase() !== view) {
      history.replaceState(null, '', '#' + view);
    }
  } catch {}

  // Sync active states on top, drawer, and bottom navigation bars
  document.querySelectorAll('.nav-link, .bottom-nav-item, .drawer-item').forEach((n) => {
    if (n.dataset.view === view) n.classList.add('active');
    else if (n.dataset.view) n.classList.remove('active');
  });

  try {
    if (view === 'home') await renderHome(force, seq);
    else if (view === 'movies') await renderCategory('movie', force, seq);
    else if (view === 'shows') await renderCategory('tv', force, seq);
    else if (view === 'streaming') await renderStreaming(force, seq);
    else if (view === 'new') await renderNew(force, seq);
    else if (view === 'boxoffice') await renderBoxOffice(force, seq);
    else if (view === 'coming') await renderComing(force, seq);
    else if (view === 'status') await renderStatus();
  } catch (e) {
    if (seq !== currentViewSeq) return;
    app.innerHTML = '';
    app.appendChild(emptyState('Something went wrong', e.message));
  }
}

window.addEventListener('hashchange', () => {
  const currentHash = (location.hash || '').replace(/^#\/?/, '').toLowerCase().trim();
  const validViews = ['home', 'movies', 'shows', 'streaming', 'new', 'boxoffice', 'coming', 'status', 'info', 'live', 'requests'];
  if (currentHash && validViews.includes(currentHash) && currentHash !== currentView) {
    showView(currentHash, false);
  }
});
async function getRows(force) { if (rowsCache && !force) return rowsCache; rowsCache = await api('/api/discover/rows' + (force ? '?refresh=1' : '')); return rowsCache; }
async function renderHome(force, seq) {
  try {
    const [home, curated] = await Promise.all([
      api('/api/discover/home' + userQuery(force ? 'refresh=1' : '')).catch(() => ({ rows: [] })),
      getRows(force).catch(() => ({ rows: [] }))
    ]);

    if (seq && seq !== currentViewSeq) return;
    if (currentView !== 'home') return;

    app.innerHTML = '';
    const persoRows = home?.rows || [];
    const curatedRows = curated?.rows || [];
    const slideItems = (persoRows[0]?.items || curatedRows[0]?.items || []).slice(0, 7);

    if (slideItems.length) {
      app.appendChild(heroSlideshow(slideItems));
    }

    if (home?.cold && !persoRows.length) {
      app.appendChild(rowSub("No watch history yet — showing trending & charts. Watch a few things in Plex and Home becomes personal."));
    }

          // Staggered render for rows
      const fns = [];
      for (const row of persoRows) {
        if (row && row.items && row.items.length) fns.push(() => rowEl(row.title, row.items, row.title.startsWith('Picked')));
      }
      const nonStreamingCuratedRows = curatedRows.filter(r => !isTop(r.title) && !r.brand);
      for (const row of nonStreamingCuratedRows) {
        if (row && row.items && row.items.length) fns.push(() => rowEl(row.title, row.items, false, false, row.brand));
      }
      
      const renderChunk = (start, count) => {
        const chunk = fns.slice(start, start + count);
        if (!chunk.length) return;
        for (const fn of chunk) app.appendChild(fn());
        if (start + count < fns.length) {
          requestAnimationFrame(() => setTimeout(() => renderChunk(start + count, count), 20));
        }
      };
      renderChunk(0, 3);
      
      if (!persoRows.length && !nonStreamingCuratedRows.length) {
        app.appendChild(emptyState('Discover Media', 'Loading library rows... Tap Refresh if content does not appear.', true));
      }

      focusFirstCard();
  } catch (err) {
    console.error('[home] renderHome error:', err);
    app.innerHTML = '';
    app.appendChild(emptyState('Something went wrong', err.message || 'Error loading home screen. Tap below to reload.', true));
  }
}

let movieSubTab = 'discover';

function renderMovieTabsHeader(activeTab, onSwitch) {
  const head = el('div', { class: 'movies-subtab-header' }, [
    el('div', { class: 'movies-title-wrap' }, [
      el('h2', { class: 'movies-main-title' }, 'Movies'),
      el('div', { class: 'seg movies-seg', role: 'tablist' }, [
        el('button', {
          class: 'seg-btn ' + (activeTab === 'discover' ? 'on' : ''),
          'data-nav': '',
          onclick: () => onSwitch('discover')
        }, '🎬 Discover & Charts'),
        el('button', {
          class: 'seg-btn ' + (activeTab === 'collections' ? 'on' : ''),
          'data-nav': '',
          onclick: () => onSwitch('collections')
        }, '📦 Collections')
      ])
    ])
  ]);
  return head;
}

async function renderCategory(media, force, seq) {
  if (media === 'movie') {
    if (movieSubTab === 'collections') {
      if (seq && seq !== currentViewSeq) return;
      if (currentView !== 'movies') return;
      app.innerHTML = '';
      const header = renderMovieTabsHeader(movieSubTab, (tab) => {
        movieSubTab = tab;
        renderCategory('movie', false, currentViewSeq);
      });
      app.appendChild(header);
      const colDiv = el('div', { id: 'moviesColSubView' });
      app.appendChild(colDiv);
      if (window.renderCollectionsView) {
        await renderCollectionsContent(colDiv, force);
      }
      return;
    }

    const [trend, imdb] = await Promise.all([
      api('/api/discover/trending' + (force ? '?refresh=1' : '')),
      api('/api/discover/imdb-top?media=movie' + (force ? '&refresh=1' : ''))
    ]);

    if (seq && seq !== currentViewSeq) return;
    if (currentView !== 'movies') return;

    app.innerHTML = '';
    const header = renderMovieTabsHeader(movieSubTab, (tab) => {
      movieSubTab = tab;
      renderCategory('movie', false, currentViewSeq);
    });
    app.appendChild(header);

    const trlist = trend.movies || [];
    const trItems = trlist.map((c) => normalize(c, 'movie'));
    if (trItems.slice(0, 7).length) app.appendChild(heroSlideshow(trItems.slice(0, 7)));
    app.appendChild(rowEl('Trending Movies', trItems));
    app.appendChild(rowEl('IMDb Top 250 · Movies', (imdb.items || []).map((c) => normalize(c, 'movie')), false, true));
    focusFirstCard();
    return;
  }

  const [trend, imdb] = await Promise.all([
    api('/api/discover/trending' + (force ? '?refresh=1' : '')),
    api(`/api/discover/imdb-top?media=${media}` + (force ? '&refresh=1' : ''))
  ]);

  if (seq && seq !== currentViewSeq) return;
  if (currentView !== 'shows') return;

  app.innerHTML = '';
  const trlist = trend.tv || [];
  const trItems = trlist.map((c) => normalize(c, media));
  if (trItems.slice(0, 7).length) app.appendChild(heroSlideshow(trItems.slice(0, 7)));
  app.appendChild(rowEl('Trending Series', trItems));
  app.appendChild(rowEl('IMDb Top 250 · Series', (imdb.items || []).map((c) => normalize(c, media)), false, true));
  focusFirstCard();
}

async function renderCollectionsContent(container, force) {
  container.innerHTML = `
    <div class="collections-view">
      <div class="collections-header">
        <div class="col-head-left">
          <h2 class="col-main-title">📦 Movie Collections & Franchises</h2>
          <p class="col-main-sub">Complete your movie sagas — suggestions based on movies in your Plex library with missing sequels & prequels.</p>
        </div>
      </div>
      <div id="colContent" class="collections-content">
        <div class="col-loading"><span class="sp">⟳</span> Discovering movie collections from your library…</div>
      </div>
    </div>
  `;

  const colBox = container.querySelector('#colContent');
  const data = await api(`/api/discover/collections${force ? '?refresh=1' : ''}`);

  if (data.error || !data.all || !data.all.length) {
    colBox.innerHTML = `<div class="empty-state"><h3>No collections found</h3><p>${escHTML(data.error || 'Ensure TMDB API key is configured.')}</p></div>`;
    return;
  }

  colBox.innerHTML = '';

  if (data.incomplete && data.incomplete.length) {
    const row = createCollectionRowEl('⚡ Incomplete in Your Library', 'You own parts of these franchises — one click to complete the entire saga!', data.incomplete);
    if (row) colBox.appendChild(row);
  }

  if (data.popular && data.popular.length) {
    const row = createCollectionRowEl('🔥 Popular Franchises & Sagas', 'Acclaimed movie collections and complete universes to binge.', data.popular);
    if (row) colBox.appendChild(row);
  }

  if (data.completed && data.completed.length) {
    const row = createCollectionRowEl('✓ Completed in Your Library', 'Franchises where you already own every single movie!', data.completed);
    if (row) colBox.appendChild(row);
  }
}

function createCollectionRowEl(title, subtitle, collections) {
  if (!collections || !collections.length) return null;
  const section = document.createElement('section');
  section.className = 'col-section';
  section.innerHTML = `
    <div class="col-section-head">
      <h3 class="col-section-title">${title}</h3>
      ${subtitle ? `<span class="col-section-sub">${subtitle}</span>` : ''}
    </div>
    <div class="col-row-scroller"></div>
  `;
  const scroller = section.querySelector('.col-row-scroller');
  collections.forEach(col => {
    const card = createCollectionCardEl(col);
    if (card) scroller.appendChild(card);
  });
  return section;
}

function createCollectionCardEl(col) {
  const card = document.createElement('div');
  card.className = 'collection-card';
  card.setAttribute('data-nav', '');
  card.tabIndex = 0;

  // Aggregate status from individual child movies when direct parent mapping is absent
  const parts = Array.isArray(col.parts) ? col.parts : [];
  const total = typeof col.total === 'number' ? col.total : parts.length;
  const owned = typeof col.owned === 'number' ? col.owned : parts.filter(p => p.inLibrary).length;
  const pending = typeof col.pending === 'number' ? col.pending : parts.filter(p => p.isPending).length;
  const missing = typeof col.missing === 'number' ? col.missing : Math.max(0, total - owned);
  const unrequested = typeof col.unrequested === 'number' ? col.unrequested : Math.max(0, total - owned - pending);
  const pct = total > 0 ? Math.round((owned / total) * 100) : (col.completionPercent || 0);

  const isComplete = total > 0 && owned === total;
  const isPartial = owned > 0 && owned < total;
  const isUnowned = owned === 0;

  let badgeHtml = '';
  if (isComplete) {
    badgeHtml = `<span class="col-badge complete">✓ In Library (${total}/${total})</span>`;
  } else if (isPartial) {
    if (unrequested === 0 && pending > 0) {
      badgeHtml = `<span class="col-badge complete" style="background:rgba(245,197,24,0.88);color:#1a1500;box-shadow:0 2px 8px rgba(245,197,24,0.4);">⏳ ${owned}/${total} in Library · ${pending} Requested</span>`;
    } else {
      badgeHtml = `<span class="col-badge incomplete">⚡ ${owned}/${total} in Library · ${unrequested} Missing</span>`;
    }
  } else {
    badgeHtml = `<span class="col-badge unowned">${total} Movies</span>`;
  }

  let statusText = '';
  if (isUnowned) {
    statusText = 'Not in library';
  } else if (isComplete) {
    statusText = `In library (${total}/${total})`;
  } else if (unrequested === 0 && pending > 0) {
    statusText = `${owned} / ${total} in library · ${pending} Requested`;
  } else {
    statusText = `${owned} / ${total} in library`;
  }

  const posterImg = col.poster || col.backdrop || '/favicon.svg';

  card.innerHTML = `
    <div class="col-poster-wrap">
      <img class="col-poster" src="${posterImg}" alt="${col.name}" loading="lazy" />
      <div class="col-gradient-overlay"></div>
      ${badgeHtml}
      <div class="col-progress-wrap">
        <div class="col-progress-bar">
          <i style="width:${pct}%;background:${isComplete ? '#35d07f' : 'linear-gradient(90deg, #2E9BD6, #f5c518)'}"></i>
        </div>
      </div>
    </div>
    <div class="col-info">
      <div class="col-title" title="${col.name}">${col.name}</div>
      <div class="col-meta">${total} Parts · ${statusText}</div>
    </div>
  `;

  card.onclick = () => { if (window.openCollectionModal) window.openCollectionModal(col.id); };
  card.onkeydown = (e) => { if (e.key === 'Enter' && window.openCollectionModal) window.openCollectionModal(col.id); };
  return card;
}
async function renderStreaming(force, seq) {
  const media = mediaToggle.streaming || 'movie';
  let data = await api(`/api/discover/streaming?media=${media}` + (force ? '&refresh=1' : '')).catch(() => null);
  if (!data || !data.rows || !data.rows.length) {
    data = await api(`/api/discover/rows?media=${media}` + (force ? '&refresh=1' : '')).catch(() => ({ rows: [] }));
  }
  if (seq && seq !== currentViewSeq) return;
  if (currentView !== 'streaming') return;
  app.innerHTML = '';
  app.appendChild(tabHeader('Top 10 on Streaming', media, (m) => {
    mediaToggle.streaming = m;
    renderStreaming(false, currentViewSeq);
  }));
  const rawRows = (data.rows || []).filter((r) => isTop(r.title));
  // Ensure provider rows are distinct by provider ID / key / brand
  const streamRows = Array.from(
    new Map(rawRows.map((r) => [r.brand || r.title.replace(/ · Top 10$/i, '').trim().toLowerCase(), r])).values()
  );
  if (!streamRows.length) {
    app.appendChild(emptyState(`No ${media === 'tv' ? 'TV series' : 'movie'} streaming charts yet`, data.error || 'Add your TMDB key and region in Settings.', true));
    return;
  }
  if ((streamRows[0]?.items || []).slice(0, 7).length) app.appendChild(heroSlideshow(streamRows[0].items.slice(0, 7)));
  const fns = [];
  for (const row of streamRows) fns.push(() => rowEl(row.title, row.items, false, true, row.brand));
  const renderChunk = (start, count) => {
    const chunk = fns.slice(start, start + count);
    for (const fn of chunk) app.appendChild(fn());
    if (start + count < fns.length) requestAnimationFrame(() => setTimeout(() => renderChunk(start + count, count), 20));
  };
  renderChunk(0, 3);
  focusFirstCard();
}
async function renderNew(force, seq) {
  const media = mediaToggle.new;
  const data = await api(`/api/discover/new?media=${media}` + (force ? '&refresh=1' : ''));
  if (seq && seq !== currentViewSeq) return;
  if (currentView !== 'new') return;
  app.innerHTML = '';
  app.appendChild(tabHeader('Newly Added', media, (m) => { mediaToggle.new = m; renderNew(false, currentViewSeq); }));
  const rows = data.rows || [];
  if (!rows.length) { app.appendChild(emptyState('Nothing new found', data.error || 'Add your TMDB key and region in Settings.', true)); return; }
  if ((rows[0]?.items || []).slice(0, 7).length) app.appendChild(heroSlideshow(rows[0].items.slice(0, 7)));
      const fns = [];
    for (const row of rows) fns.push(() => rowEl(row.title, row.items, false, false, row.brand));
    const renderChunk = (start, count) => {
      const chunk = fns.slice(start, start + count);
      for (const fn of chunk) app.appendChild(fn());
      if (start + count < fns.length) requestAnimationFrame(() => setTimeout(() => renderChunk(start + count, count), 20));
    };
    renderChunk(0, 3);
  focusFirstCard();
}
async function renderBoxOffice(force, seq) {
  const data = await api('/api/discover/boxoffice' + (force ? '?refresh=1' : ''));
  if (seq && seq !== currentViewSeq) return;
  if (currentView !== 'boxoffice') return;
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
    if (it.id) {
      c.dataset.id = it.id;
      c.dataset.media = 'movie';
      if (window.imdbObserver) window.imdbObserver.observe(c);
      if (window.mediaStatusCache && window.mediaStatusCache[it.id]) {
        applyCardStatus(c, window.mediaStatusCache[it.id]);
      } else if (window.statusObserver) {
        window.statusObserver.observe(c);
      }
    }
    c.addEventListener('click', () => openDetail(it));
  if (it.poster) c.appendChild(el('img', { class: 'card-poster', src: it.poster, loading: 'lazy', alt: it.title, onload: (e) => e.target.classList.add('fade-in') }));
  else c.appendChild(el('div', { class: 'card-fallback' }, it.title || 'No image'));
  c.appendChild(el('div', { class: 'card-rank' }, String(rank)));
  if (it.weekend) c.appendChild(el('div', { class: 'card-badge', style: 'left:8px;right:auto;top:8px;background:rgba(53,208,127,.92);color:#03150b;font-size:12px' }, it.weekend));
  if (it.rating) c.appendChild(el('div', { class: 'card-badge' }, stars(it.rating)));
  const totalLine = it.total ? `${it.total} ${it.totalKind === 'worldwide' ? '🌍 worldwide' : 'total'}` : (it.year || '');
  c.appendChild(el('div', { class: 'card-info' }, [el('div', { class: 'card-name' }, it.title), el('div', { class: 'card-year' }, [it.weeks ? `wk ${it.weeks} · ` : '', totalLine].join(''))]));
  return c;
}
async function renderComing(force, seq) {
  const media = mediaToggle.coming;
  const data = await api(`/api/discover/anticipated?media=${media}` + (force ? '&refresh=1' : ''));
  if (seq && seq !== currentViewSeq) return;
  if (currentView !== 'coming') return;
  app.innerHTML = '';
  app.appendChild(tabHeader('Highly Anticipated', media, (m) => { mediaToggle.coming = m; renderComing(false, currentViewSeq); }));
  const rows = data.rows || [];
  if (!rows.length) { app.appendChild(emptyState('Nothing upcoming yet', data.error || 'Add your TMDB key and region in Settings.', true)); return; }
  if ((rows[0]?.items || []).slice(0, 7).length) app.appendChild(heroSlideshow(rows[0].items.slice(0, 7)));
      const fns = [];
    for (const row of rows) fns.push(() => rowEl(row.title, row.items, false, false, row.brand));
    const renderChunk = (start, count) => {
      const chunk = fns.slice(start, start + count);
      for (const fn of chunk) app.appendChild(fn());
      if (start + count < fns.length) requestAnimationFrame(() => setTimeout(() => renderChunk(start + count, count), 20));
    };
    renderChunk(0, 3);
  focusFirstCard();
}
async function runSearch(q) {
  stopSlideshow(); app.innerHTML = skeleton();
  const results = await api('/api/discover/search?q=' + encodeURIComponent(q));
  app.innerHTML = '';
  if (!Array.isArray(results) || !results.length) { app.appendChild(emptyState('No results for "' + q + '"', 'Try another title or keyword.')); return; }
  const wrap = el('div', { class: 'search-results-wrap' });
  wrap.appendChild(el('div', { class: 'search-results-head' }, [
    el('div', { class: 'row-title' }, `Results for "${escHTML(q)}"`),
    el('div', { class: 'row-sub' }, `${results.length} titles found`)
  ]));
  const grid = el('div', { class: 'search-results-grid' });
  results.forEach((it) => grid.appendChild(card(it)));
  wrap.appendChild(grid);
  app.appendChild(wrap);
}
async function renderStatus() {
  const s = await api('/api/status');
  app.innerHTML = '';
  app.appendChild(el('div', { class: 'row-head' }, [el('div', { class: 'row-title' }, 'Downloads')]));
  const grid = el('div', { class: 'status-grid' });
  if (s.gluetun) {
    const g = s.gluetun; const ok = !g.error && (g.vpn === 'running' || g.ip);
    const c = el('div', { class: 'status-card', 'data-nav': '', tabindex: '0' });
    c.appendChild(el('div', { class: 'status-head' }, [el('span', { class: 'status-dot ' + (ok ? 'ok' : 'bad') }), el('span', { class: 'status-name' }, 'Gluetun VPN'), el('span', { class: 'status-sub' }, g.ip || '')]));
    if (g.error) c.appendChild(el('div', { class: 'row-sub' }, g.error));
    else { c.appendChild(el('div', { class: 'vpn-line' }, [el('span', { class: 'vpn-pill' }, ok ? '✓ Protected' : '? Unknown'), el('span', {}, g.country ? `${g.city ? g.city + ', ' : ''}${g.country}` : 'VPN tunnel active')])); c.appendChild(el('div', { class: 'row-sub', style: 'margin-top:8px' }, 'All download traffic is routed through the VPN.')); }
    grid.appendChild(c);
  }
  if (s.sabnzbd) {
    const q = s.sabnzbd; const c = el('div', { class: 'status-card', 'data-nav': '', tabindex: '0' });
    c.appendChild(el('div', { class: 'status-head' }, [el('span', { class: 'status-dot ' + (q.error ? 'bad' : 'ok') }), el('span', { class: 'status-name' }, 'SABnzbd'), el('span', { class: 'status-sub' }, q.error ? '' : `${q.count || 0} in queue`)]));
    if (q.error) c.appendChild(el('div', { class: 'row-sub' }, q.error));
    else { c.appendChild(el('div', { class: 'speed-big' }, [document.createTextNode(q.totalSpeed || (q.speed ? q.speed + 'B/s' : '0 KB/s')), el('small', {}, 'total download speed')])); (q.slots || []).slice(0, 12).forEach((sl) => c.appendChild(downloadRow(sl.name, sl.percent, sl.timeLeft))); if (!(q.slots || []).length) c.appendChild(el('div', { class: 'row-sub' }, 'Idle — queue empty.')); }
    grid.appendChild(c);
  }
  if (!grid.children.length) { app.appendChild(emptyState('No download services connected', 'Configure SABnzbd or Gluetun in Settings.', true)); return; }
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
    let heroReqBtn = el('button', { class: 'btn btn-accent', 'data-nav': '', onclick: () => openRequestModal(it) }, '＋  Request');
    if (window.mediaStatusCache && window.mediaStatusCache[it.id]) {
      const st = window.mediaStatusCache[it.id];
      if (st.status === 'in_library') {
        heroReqBtn = el('button', { class: 'btn btn-owned', 'data-nav': '', disabled: true, style: 'opacity:0.8;cursor:default;background:rgba(53,208,127,.18);color:#35d07f;border:1px solid rgba(53,208,127,.4)' }, '✔  In Library');
      } else if (st.status === 'requested') {
        heroReqBtn = el('button', { class: 'btn btn-requested', 'data-nav': '', disabled: true, style: 'opacity:0.8;cursor:default;background:rgba(245,197,24,.18);color:#f5c518;border:1px solid rgba(245,197,24,.4)' }, '⏳  Requested');
      }
    }
    content.appendChild(el('div', { class: 'hero-actions' }, [el('button', { class: 'btn btn-primary', 'data-nav': '', onclick: () => openDetail(it) }, '▶  Trailer & Details'), heroReqBtn]));
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
    if (item.id) {
      const media = item.media === 'tv' || item.media === 'show' || item.first_air_date ? 'tv' : 'movie';
      c.dataset.id = item.id;
      c.dataset.media = media;
      if (window.imdbObserver) window.imdbObserver.observe(c);
      if (window.mediaStatusCache && window.mediaStatusCache[item.id]) {
        applyCardStatus(c, window.mediaStatusCache[item.id]);
      } else if (window.statusObserver) {
        window.statusObserver.observe(c);
      }
    }
    c.addEventListener('click', () => openDetail(item));
  if (item.poster) c.appendChild(el('img', { class: 'card-poster', src: item.poster, loading: 'lazy', alt: item.title, onload: (e) => e.target.classList.add('fade-in') }));
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
window.openDetail = openDetail;
export async function openDetail(item) {
  const modal = document.getElementById('modal');
  const cardEl = document.getElementById('modalCard');
  modal.classList.remove('hidden');
  cardEl.innerHTML = '<div style="padding:60px;text-align:center;color:var(--muted)">Loading…</div>';
  document.getElementById('modalBackdrop').onclick = closeModal;
  const media = item.media === 'show' ? 'tv' : item.media || 'movie';
  if (!item.id) { cardEl.innerHTML = `<div style="padding:40px">No TMDB match for "${item.title}".</div>`; return; }
  const d = await api(`/api/discover/${media}/${item.id}`);
  if (d.error) { cardEl.innerHTML = `<div style="padding:40px">${escHTML(d.error)}</div>`; return; }
  
  // Sync status with client cache and existing cards
  if (window.mediaStatusCache) {
    if (d.inLibrary) {
      window.mediaStatusCache[d.id] = { status: 'in_library', label: 'In library' };
      document.querySelectorAll(`.card[data-id="${d.id}"]`).forEach((c) => applyCardStatus(c, { status: 'in_library', label: 'In library' }));
    } else if (d.isRequested) {
      window.mediaStatusCache[d.id] = { status: 'requested', label: 'Requested' };
      document.querySelectorAll(`.card[data-id="${d.id}"]`).forEach((c) => applyCardStatus(c, { status: 'requested', label: 'Requested' }));
    }
  }

  setAmbient(d.backdrop);
  const media_label = media === 'tv' ? 'TV' : 'Movie';
  cardEl.innerHTML = '';
  cardEl.appendChild(el('button', { class: 'modal-close', 'data-nav': '', onclick: closeModal }, '✕'));
  if (d.trailerKey) cardEl.appendChild(el('div', { class: 'modal-video', html: `<iframe src="https://www.youtube.com/embed/${d.trailerKey}?autoplay=0&rel=0&modestbranding=1" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>` }));
  else { const mh = el('div', { class: 'modal-hero' }); if (d.backdrop) mh.style.backgroundImage = `url(${d.backdrop})`; cardEl.appendChild(mh); }
  // Title row + ownership badges (✓ in library, series status, streaming brand logo).
  const ownBadges = el('div', { class: 'own-badges' });
  if (d.inLibrary) {
    if (d.plexUrl) {
      const libLink = el('a', {
        class: 'own-pill in-lib interactive-lib-pill',
        title: 'Open in Plex Web',
        href: d.plexUrl,
        target: '_blank',
        rel: 'noopener noreferrer'
      }, [
        el('span', { class: 'own-tick' }, '✓'),
        'In library',
        el('span', { class: 'lib-ext-icon', style: 'font-size:11px;opacity:0.85;margin-left:3px;' }, '↗')
      ]);
      ownBadges.appendChild(libLink);
    } else {
      ownBadges.appendChild(el('span', { class: 'own-pill in-lib', title: 'In your Plex library' }, [el('span', { class: 'own-tick' }, '✓'), 'In library']));
    }
  }
  if (media === 'tv' && d.seriesStatus) ownBadges.appendChild(el('span', { class: 'own-pill ' + (d.seriesStatus === 'ended' ? 'ended' : 'cont') }, d.seriesStatus === 'ended' ? '■ Ended' : '● Continuing'));
  if (d.streamingService && window.renderStreamPill) {
    const sp = window.renderStreamPill(d.streamingService);
    if (sp) ownBadges.appendChild(sp);
  }
  const titleRow = el('div', { class: 'title-row' }, [el('h2', { class: 'modal-title', style: 'margin:0' }, d.title), ownBadges]);
  const meta = el('div', { class: 'modal-meta' }, [
    d.year ? el('span', {}, d.year) : null,
    d.runtime ? el('span', {}, d.runtime + ' min') : null,
    d.rating ? el('span', { style: 'color:var(--gold)' }, stars(d.rating)) : null,
    el('span', { class: 'chip' }, media_label),
    ...(d.genres || []).slice(0, 3).map((g) => el('span', { class: 'chip' }, g))
  ]);
      if (d.imdbRating) {
      meta.appendChild(el('span', { class: 'imdb-badge' }, [el('span', { class: 'imdb-logo' }, 'IMDb'), el('span', { class: 'imdb-score', html: `<b>${d.imdbRating.toFixed(1)}</b>/10` }), d.imdbVotes ? el('span', { class: 'imdb-votes' }, d.imdbVotes) : null]));
    } else if (d.imdbUrl) {
      const badge = el('span', { class: 'imdb-badge' }, [el('span', { class: 'imdb-logo' }, 'IMDb'), el('span', { class: 'imdb-score' }, '...')]);
      meta.appendChild(badge);
      if (window.imdbCache && window.imdbCache[d.id]) {
        badge.querySelector('.imdb-score').innerHTML = `<b>${Number(window.imdbCache[d.id]).toFixed(1)}</b>/10`;
      } else {
        fetch('/api/discover/imdb-ratings', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ items: [{ id: d.id, media }] }) })
        .then(r => r.json()).then(r => {
          if (r && r.ratings && r.ratings[d.id]) {
            badge.querySelector('.imdb-score').innerHTML = `<b>${Number(r.ratings[d.id]).toFixed(1)}</b>/10`;
            if (window.imdbCache) window.imdbCache[d.id] = r.ratings[d.id];
          } else badge.remove();
        }).catch(() => badge.remove());
      }
    }
  // Episode-% ring right after the IMDb badge (TV only, when owned).
  if (media === 'tv' && d.episodePercent != null) {
    const full = d.episodePercent >= 100;
    const ring = el('span', { class: 'ep-ring' + (full ? ' full' : '') }, [
      el('span', { class: 'ring', style: `--p:${d.episodePercent}` }, [el('i', {}, full ? '✓' : d.episodePercent + '%')]),
      el('span', { class: 'lbl' }, full ? `All ${d.episodesTotal} eps` : `${d.episodesOwned}/${d.episodesTotal} eps`)
    ]);
    meta.appendChild(ring);
  }
      let reqBtn;
    if (d.inLibrary) {
      reqBtn = el('button', { class: 'btn btn-owned', 'data-nav': '', disabled: true, style: 'opacity:0.8;cursor:default;background:rgba(53,208,127,.18);color:#35d07f;border:1px solid rgba(53,208,127,.4)' }, [el('span',{},'✔'), '  In Library']);
    } else if (d.isRequested) {
      reqBtn = el('button', { class: 'btn btn-requested', 'data-nav': '', disabled: true, style: 'opacity:0.85;cursor:default;background:rgba(245,197,24,.18);color:#f5c518;border:1px solid rgba(245,197,24,.45)' }, [el('span',{},'⏳'), '  Requested']);
    } else {
      reqBtn = el('button', { class: 'btn btn-accent', 'data-nav': '', onclick: () => openRequestModal({ ...item, media, title: d.title, backdrop: d.backdrop }) }, '＋  Request');
    }
    const actions = el('div', { class: 'modal-actions' }, [
      reqBtn,
    d.trailerKey ? el('a', { class: 'btn btn-ghost', 'data-nav': '', href: `https://www.youtube.com/watch?v=${d.trailerKey}`, target: '_blank' }, '▶  YouTube') : null,
    d.imdbUrl ? el('a', { class: 'btn btn-imdb', 'data-nav': '', href: d.imdbUrl, target: '_blank', rel: 'noopener' }, 'IMDb ↗') : null
  ]);
  let colChip = null;
  if (d.collection) {
    colChip = el('div', {
      class: 'modal-collection-chip',
      'data-nav': '',
      onclick: () => {
        if (window.openCollectionModal) window.openCollectionModal(d.collection.id);
      }
    }, [
      el('span', { class: 'mcol-icon' }, '🎬'),
      el('span', { class: 'mcol-text' }, ['Part of ', el('b', {}, d.collection.name)]),
      el('span', { class: 'mcol-arrow' }, 'View Franchise →')
    ]);
  }

function countryFlag(code) {
  if (!code || code.length !== 2) return '';
  const c = code.toUpperCase();
  try {
    return String.fromCodePoint(127397 + c.charCodeAt(0), 127397 + c.charCodeAt(1));
  } catch (e) {
    return '';
  }
}

function resolveCountry(countries) {
  if (!countries || !countries.length) return { flag: '🇺🇸', name: 'United States' };
  const c = countries[0];
  const iso = (typeof c === 'string' ? c : c.iso_3166_1 || c.iso || 'US').toUpperCase();
  let name = (typeof c === 'object' ? c.name : '') || '';
  if (iso && (!name || name === 'United States of America')) {
    try {
      name = new Intl.DisplayNames(['en'], { type: 'region' }).of(iso) || name;
    } catch (e) {}
  }
  if (name === 'United States of America') name = 'United States';
  return { flag: countryFlag(iso) || '🇺🇸', name: name || 'United States' };
}

function resolveLanguage(langCode, spokenList) {
  const code = String(langCode || 'en').toLowerCase();
  if (spokenList && spokenList.length) {
    const hit = spokenList.find(s => (s.iso_639_1 || '').toLowerCase() === code);
    if (hit && (hit.english_name || hit.name)) return hit.english_name || hit.name;
  }
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'language' });
    const name = dn.of(code);
    if (name) return name.charAt(0).toUpperCase() + name.slice(1);
  } catch (e) {}
  return code === 'en' ? 'English' : code.toUpperCase();
}

function resolveStudio(companies, streamingService) {
  if (companies && companies.length) {
    const first = companies[0];
    const name = (typeof first === 'string' ? first : first.name);
    if (name) return name;
  }
  if (streamingService && streamingService.name) return streamingService.name;
  return 'N/A';
}

function renderMetadataBlock(d, media) {
  const rows = [];

  const makeRow = (label, valueNode) => {
    return el('div', { class: 'overseerr-meta-row' }, [
      el('div', { class: 'overseerr-meta-label' }, label),
      typeof valueNode === 'string' ? el('div', { class: 'overseerr-meta-value' }, valueNode) : valueNode
    ]);
  };

  // 1. Status
  const status = d.status || (media === 'movie' ? 'Released' : (d.seriesStatus === 'ended' ? 'Ended' : 'Returning Series'));
  rows.push(makeRow('Status', status));

  // 2. Release Date
  const rawDate = d.releaseDate || d.release_date || d.first_air_date || (d.year ? `${d.year}-01-01` : null);
  let formattedDate = 'N/A';
  if (rawDate) {
    try {
      const parts = String(rawDate).split('T')[0].split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const dt = new Date(Date.UTC(y, m, day));
        formattedDate = dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
      } else {
        formattedDate = rawDate;
      }
    } catch (e) {
      formattedDate = rawDate;
    }
  }
  const ticketSvg = el('span', {
    class: 'overseerr-ticket-icon',
    html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"/></svg>'
  });
  rows.push(makeRow('Release Date', el('div', { class: 'overseerr-meta-value' }, [
    ticketSvg,
    el('span', {}, formattedDate)
  ])));

  // 3. Revenue (movies only or if revenue > 0)
  if (media !== 'tv') {
    const revFormatted = (!d.revenue || d.revenue <= 0) ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(d.revenue);
    rows.push(makeRow('Revenue', revFormatted));
  } else if (d.revenue && d.revenue > 0) {
    const revFormatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(d.revenue);
    rows.push(makeRow('Revenue', revFormatted));
  }

  // 4. Budget (movies only or if budget > 0)
  if (media !== 'tv') {
    const budFormatted = (!d.budget || d.budget <= 0) ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(d.budget);
    rows.push(makeRow('Budget', budFormatted));
  } else if (d.budget && d.budget > 0) {
    const budFormatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(d.budget);
    rows.push(makeRow('Budget', budFormatted));
  }

  // 5. Original Language
  const langName = resolveLanguage(d.originalLanguage || d.original_language, d.spokenLanguages || d.spoken_languages);
  rows.push(makeRow('Original Language', langName));

  // 6. Production Country
  const country = resolveCountry(d.productionCountries || d.production_countries);
  const countryValNode = el('div', { class: 'overseerr-meta-value' }, [
    country.flag ? el('span', { class: 'overseerr-flag-icon' }, country.flag) : null,
    el('span', {}, country.name)
  ]);
  rows.push(makeRow('Production Country', countryValNode));

  // 7. Studio
  const studio = resolveStudio(d.productionCompanies || d.production_companies, d.streamingService);
  rows.push(makeRow('Studio', studio));

  return el('div', { class: 'overseerr-metadata-card' }, rows);
}

  const body = el('div', { class: 'modal-body' }, [
    titleRow,
    d.tagline ? el('div', { class: 'modal-tagline' }, d.tagline) : null,
    meta,
    colChip,
    item.why ? el('div', { class: 'why-chip', style: 'position:static;display:inline-block;margin-bottom:12px' }, '✨ ' + item.why) : null,
    el('p', { class: 'modal-overview' }, d.overview || 'No description available.'),
    actions,
    renderMetadataBlock(d, media)
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
  else body.appendChild(el('div', { class: 'row-sub', style: 'margin-bottom:6px' }, 'Nothing yet — request something from "Known for" below.'));
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
window.openRequestModal = openRequestModal;
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
  // Load seasons if TV series
  let tvSeasons = item.seasons || [];
  if (media === 'tv' && (!tvSeasons || !tvSeasons.length) && item.id) {
    try {
      const d = await api('/api/discover/tv/' + item.id);
      if (d && d.seasons) tvSeasons = d.seasons;
    } catch {}
  }
  const validSeasons = (tvSeasons || []).filter(s => s.season_number > 0);

  let seasonsTableHtml = '';
  if (media === 'tv' && validSeasons.length > 0) {
    seasonsTableHtml = `
      <div class="req-seasons-block">
        <div class="req-seasons-head">
          <div class="season-row-left">
            <label class="switch-ui master-switch">
              <input type="checkbox" id="masterSeasonToggle" checked />
              <span class="switch-slider"></span>
            </label>
            <span class="stbl-col col-title">SEASONS</span>
          </div>
          <span class="stbl-col col-eps desktop-only">EPISODES</span>
          <span class="stbl-col col-status">STATUS</span>
        </div>
        <div class="req-seasons-list">
          ${validSeasons.map(s => `
            <div class="req-season-row" data-season="${s.season_number}">
              <div class="season-row-left">
                <label class="switch-ui">
                  <input type="checkbox" class="season-item-toggle" data-season="${s.season_number}" checked />
                  <span class="switch-slider"></span>
                </label>
                <div class="season-info-meta">
                  <span class="season-main-title">${s.name || ('Season ' + s.season_number)}</span>
                  <span class="season-sub-eps mobile-only">${s.episode_count || 0} episodes</span>
                </div>
              </div>
              <span class="stbl-col col-eps desktop-only">${s.episode_count || 0}</span>
              <span class="stbl-col col-status"><span class="req-season-pill not-req">Not Requested</span></span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  const profileOpts = opts.profiles.map((p) => `<option value="${p.id}" ${p.id == opts.defaultProfileId ? 'selected' : ''}>${p.name}${p.id == opts.defaultProfileId ? ' (Default)' : ''}</option>`).join('');
  const rootOpts = opts.rootFolders.map((f) => `<option value="${f.path}" ${f.path === opts.defaultRootFolder ? 'selected' : ''}>${f.label}${f.path === opts.defaultRootFolder ? ' (Default)' : ''}</option>`).join('');
  const tagChips = opts.tags.map((t) => `<span class="tag-chip" data-tag="${t.id}">${t.label}</span>`).join('');
  const requester = opts.requestAs ? `${opts.requestAs.name}${opts.requestAs.email ? ` <span class="req-muted">(${opts.requestAs.email})</span>` : ''}` : (getProfile()?.name || 'This server');
  cardEl.style.setProperty('--req-bg', item.backdrop ? `url(${item.backdrop})` : 'none');
  cardEl.innerHTML = `
    ${requestHeader(media, item)}
    <div class="req-body">
      <div class="req-note ${opts.autoApprove ? 'ok' : ''}" style="${opts.autoApprove ? '' : 'background:rgba(245,197,24,.12);color:#f5c518;'}">ⓘ &nbsp;${opts.autoApprove ? 'This request will be approved automatically.' : 'This request will be submitted for admin approval.'}</div>
      ${seasonsTableHtml}
      <div class="req-adv">Advanced Settings</div>
      <div class="req-grid">
        <div class="req-field"><label>Destination Server</label><select id="reqServer" class="custom-select">${opts.servers.map((s) => `<option value="${s.id}">${s.name}</option>`).join('')}</select></div>
        <div class="req-field"><label>Quality Profile</label><select id="reqProfile" class="custom-select">${profileOpts || '<option>Default</option>'}</select></div>
        <div class="req-field"><label>Root Folder</label><select id="reqRoot" class="custom-select">${rootOpts || '<option>Default</option>'}</select></div>
      </div>
      <div class="req-field"><label>Tags</label>
        <div class="tag-picker" id="reqTags">${tagChips || '<span class="req-muted" style="padding:6px">No tags in ' + opts.kind + ' yet — type to add one.</span>'}</div>
        <input class="tag-input" id="reqNewTag" placeholder="Add a tag and press Enter…" />
      </div>
      <div class="req-field"><label>Request As</label><div class="req-as"><span class="req-avatar">${(requester || 'N')[0].toUpperCase()}</span><span>${requester}</span></div></div>
    </div>
    <div class="req-footer"><button class="btn btn-ghost" id="reqCancel">Cancel</button><button class="btn btn-accent" id="reqSubmit">Request</button></div>`;

  // Master and individual season toggle handlers
  const masterTog = cardEl.querySelector('#masterSeasonToggle');
  if (masterTog) {
    masterTog.onchange = () => {
      cardEl.querySelectorAll('.season-item-toggle').forEach(t => t.checked = masterTog.checked);
    };
    cardEl.querySelectorAll('.season-item-toggle').forEach(t => {
      t.onchange = () => {
        const all = [...cardEl.querySelectorAll('.season-item-toggle')];
        const checkedCount = all.filter(x => x.checked).length;
        masterTog.checked = checkedCount === all.length;
      };
    });
  }
  const selected = new Set();
  cardEl.querySelectorAll('.tag-chip').forEach((chip) => chip.addEventListener('click', () => { const id = Number(chip.dataset.tag); if (selected.has(id)) { selected.delete(id); chip.classList.remove('on'); } else { selected.add(id); chip.classList.add('on'); } }));
  const newTags = [];
  const newTagInput = cardEl.querySelector('#reqNewTag');
  newTagInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && newTagInput.value.trim()) { e.preventDefault(); const label = newTagInput.value.trim(); newTags.push(label); cardEl.querySelector('#reqTags').appendChild(el('span', { class: 'tag-chip on' }, label)); newTagInput.value = ''; } });
  cardEl.querySelector('#reqCancel')?.addEventListener('click', closeRequestModal);
  cardEl.querySelector('#reqCloseBtn')?.addEventListener('click', closeRequestModal);
  cardEl.querySelector('#reqSubmit').onclick = async () => {
    const btn = cardEl.querySelector('#reqSubmit'); btn.disabled = true; btn.textContent = 'Requesting…';
    let selectedSeasons = undefined;
    if (media === 'tv') {
      selectedSeasons = [...cardEl.querySelectorAll('.season-item-toggle:checked')].map(t => Number(t.dataset.season));
      if (!selectedSeasons.length) {
        toast('Please select at least one season to request', 'bad');
        btn.disabled = false;
        btn.textContent = 'Request';
        return;
      }
    }
    const payload = {
      media,
      tmdbId: item.id,
      title: item.title || '',
      poster: item.poster || '',
      qualityProfileId: cardEl.querySelector('#reqProfile')?.value || undefined,
      rootFolder: cardEl.querySelector('#reqRoot')?.value || undefined,
      tags: [...selected],
      newTags,
      seasons: selectedSeasons
    };
    const r = await api('/api/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (r.ok || r.code === 'exists') {
      const statusType = r.code === 'exists' ? 'in_library' : 'requested';
      const labelText = r.code === 'exists' ? 'In library' : 'Requested';
      if (window.mediaStatusCache) {
        window.mediaStatusCache[payload.tmdbId] = { status: statusType, label: labelText };
      }
      document.querySelectorAll(`.card[data-id="${payload.tmdbId}"]`).forEach((c) => {
        applyCardStatus(c, { status: statusType, label: labelText });
      });
    }
    if (r.ok && r.code === 'pending') showRequestResult(cardEl, item, { kind: r.kind, state: 'pending' });
    else if (r.ok) showRequestResult(cardEl, item, { kind: r.kind, state: 'added' });
    else if (r.code === 'exists') showRequestResult(cardEl, item, { kind: r.kind, state: 'exists' });
    else { toast('Request failed: ' + (r.error || 'unknown'), 'bad'); btn.disabled = false; btn.textContent = 'Request'; }
  };
  setTimeout(() => { const f = cardEl.querySelector('#reqProfile'); if (f) setFocus(f); }, 80);
}
function showRequestResult(cardEl, item, { kind, state }) {
  const svc = kind === 'sonarr' ? 'Sonarr' : 'Radarr';
  let icon, heading, desc, cls;
  if (state === 'pending') {
    icon = '⏳'; heading = 'Request Submitted'; desc = `"${item.title}" has been submitted for admin approval.`; cls = '';
  } else if (state === 'added') {
    icon = '✓'; heading = 'Added to ' + svc; desc = `"${item.title}" is on its way — downloading soon.`; cls = '';
  } else {
    icon = '✓'; heading = 'Already in your library'; desc = `"${item.title}" is already in ${svc}.`; cls = 'exists';
  }
  cardEl.innerHTML = `${requestHeader(item.media === 'show' ? 'tv' : item.media || 'movie', item)}<div class="req-result"><div class="req-check ${cls}">${icon}</div><h3>${heading}</h3><p>${desc}</p><button class="btn btn-accent" id="reqDone" data-nav>Done</button></div>`;
  const done = cardEl.querySelector('#reqDone'); done.onclick = closeRequestModal; setTimeout(() => setFocus(done), 60);
  setTimeout(() => { const h = document.getElementById('requestModal'); if (h && !h.classList.contains('hidden')) closeRequestModal(); }, 2600);
}
function requestHeader(media, item) {
  return `<div class="req-hero" style="background-image:var(--req-bg)"></div>
  <button type="button" class="modal-close req-modal-close" id="reqCloseBtn" title="Close">✕</button>
  <div class="req-head">
    <div class="req-kicker">Request ${media === 'tv' ? 'Series' : 'Movie'}</div>
    <div class="req-name">${item.title || ''}</div>
  </div>`;
}
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












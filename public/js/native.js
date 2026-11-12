// native.js — small behaviours that make the installed app feel native.
//   1) Pull down to refresh (touch only)
//   2) Tap the already-active tab to scroll back to the top
//   3) App-icon badge = pending approvals (admins)
//
// Self-contained. Every touch listener is PASSIVE and nothing here ever calls
// preventDefault(): a non-passive touch guard is what blocked scrolling in the
// installed app for weeks (see a2hs.js, 2026-09-22).
import { authToken } from './util.js';
import { anyOverlayOpen } from './overlay.js';

// ---------------------------------------------------------------------------
// 1) Pull to refresh
// ---------------------------------------------------------------------------
const PTR_TRIGGER = 72;      // px of indicator travel that commits a refresh
const PTR_MAX = 96;
const PTR_VIEWS = new Set(['home', 'movies', 'shows', 'streaming', 'new', 'boxoffice', 'coming', 'requests', 'status']);

function currentView() {
  return (location.hash || '').replace(/^#\/?/, '').toLowerCase() || 'home';
}

function ptrEl() {
  let n = document.getElementById('ptr');
  if (n) return n;
  n = document.createElement('div');
  n.id = 'ptr';
  n.className = 'ptr';
  n.setAttribute('aria-hidden', 'true');
  n.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 4v5h-5"/></svg>';
  document.body.appendChild(n);
  return n;
}

// Exposed for the sandbox: the decision logic can be exercised without a real
// finger (the test pane cannot produce trusted touch gestures).
export const ptr = {
  active: false, startX: 0, startY: 0, pull: 0, busy: false,
  // Only from the very top, with nothing covering the app, on a list view,
  // and not when the finger starts inside a sideways rail or a form field.
  canStart(target) {
    if (this.busy) return false;
    if ((window.scrollY || document.documentElement.scrollTop || 0) > 0) return false;
    if (anyOverlayOpen()) return false;
    if (!PTR_VIEWS.has(currentView())) return false;
    const t = target && target.closest ? target : null;
    if (t && t.closest('input, textarea, select, .row-scroll, .rail-scroll, .drawer, .topbar, .bottom-nav')) return false;
    return true;
  },
  start(x, y, target) {
    this.active = this.canStart(target);
    this.startX = x; this.startY = y; this.pull = 0;
  },
  move(x, y) {
    if (!this.active) return;
    const dx = x - this.startX, dy = y - this.startY;
    // Sideways or upward: this was never a pull. Drop it for this gesture.
    if (dy < -6 || (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy))) { this.cancel(); return; }
    if ((window.scrollY || 0) > 0) { this.cancel(); return; }
    this.pull = Math.max(0, Math.min(PTR_MAX, dy * 0.5));   // rubber-band feel
    const n = ptrEl();
    n.classList.add('on');
    n.classList.toggle('ready', this.pull >= PTR_TRIGGER);
    n.style.transform = `translate(-50%, ${this.pull}px) rotate(${this.pull * 3}deg)`;
    n.style.opacity = String(Math.min(1, this.pull / 40));
  },
  cancel() {
    this.active = false; this.pull = 0;
    const n = document.getElementById('ptr');
    if (n && !this.busy) { n.classList.remove('on', 'ready'); n.style.transform = ''; n.style.opacity = ''; }
  },
  async end() {
    if (!this.active) return false;
    const commit = this.pull >= PTR_TRIGGER;
    this.active = false;
    if (!commit) { this.cancel(); return false; }
    this.busy = true;
    const n = ptrEl();
    n.classList.add('spin'); n.style.transform = `translate(-50%, ${PTR_TRIGGER}px)`;
    try { if (navigator.vibrate) navigator.vibrate(10); } catch { /* ignore */ }
    try {
      // Same path as the ⟳ button (hidden on phones, still wired up).
      document.getElementById('refreshBtn')?.click();
      await new Promise((r) => setTimeout(r, 900));
    } finally {
      this.busy = false;
      n.classList.remove('on', 'ready', 'spin'); n.style.transform = ''; n.style.opacity = '';
    }
    return true;
  }
};

if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { ptr.cancel(); return; }
    ptr.start(e.touches[0].clientX, e.touches[0].clientY, e.target);
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) ptr.move(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  document.addEventListener('touchend', () => { ptr.end(); }, { passive: true });
  document.addEventListener('touchcancel', () => { ptr.cancel(); }, { passive: true });
}

// ---------------------------------------------------------------------------
// 2) Tap the active tab -> back to top
// ---------------------------------------------------------------------------
// Capture phase, so it runs before the tab's own handler re-renders the view.
document.addEventListener('click', (e) => {
  const tab = e.target.closest && e.target.closest('.bottom-nav-item.active[data-view]');
  if (!tab) return;
  if ((window.scrollY || 0) < 8) return;          // already at the top: let the normal handler run
  e.stopPropagation(); e.preventDefault();
  let smooth = true;
  try { smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* ignore */ }
  window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
  // Where smooth scrolling is throttled or unsupported, still arrive.
  const from = window.scrollY || 0;
  setTimeout(() => { if (Math.abs((window.scrollY || 0) - from) < 4) window.scrollTo(0, 0); }, 350);
}, true);

// ---------------------------------------------------------------------------
// 3) App-icon badge
// ---------------------------------------------------------------------------
// Admins: number of requests waiting for approval. iOS only shows it once
// notifications are allowed for the installed app; elsewhere the call is a
// harmless no-op.
let badgeTimer = null;
export async function refreshAppBadge() {
  if (typeof navigator.setAppBadge !== 'function') return null;
  const t = authToken();
  let count = 0;
  try {
    const r = await fetch('/api/requests', { headers: t ? { Authorization: 'Bearer ' + t } : {} }).then((x) => x.json());
    if (r && r.admin && Array.isArray(r.requests)) count = r.requests.filter((q) => q.status === 'pending').length;
  } catch { return null; }
  try { if (count > 0) await navigator.setAppBadge(count); else await navigator.clearAppBadge(); } catch { /* not permitted */ }
  return count;
}
function scheduleBadge() { clearTimeout(badgeTimer); badgeTimer = setTimeout(refreshAppBadge, 1500); }
document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleBadge(); });
document.addEventListener('requests:changed', scheduleBadge);
scheduleBadge();

// ---------------------------------------------------------------------------
// 4) Self-update
// ---------------------------------------------------------------------------
// The service worker paints the previous build and fetches the new one behind
// it (sw.js "Telling the open app…"). When it reports newer code, reload — but
// only when that cannot interrupt anything:
//   * within the first 12s of a launch, with no sheet open and no field focused
//   * or when the app goes to / comes back from the background
// At most once a minute, so a bad deploy can never spin.
export const updater = {
  pending: false, born: Date.now(), timer: null,
  typing() { const a = document.activeElement; return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable); },
  safeNow() { return document.hidden || (Date.now() - this.born < 12000 && !anyOverlayOpen() && !this.typing()); },
  reload() {
    let last = 0;
    try { last = Number(sessionStorage.getItem('ns_update_reload_at') || 0); } catch { /* ignore */ }
    if (Date.now() - last < 60000) return false;
    try { sessionStorage.setItem('ns_update_reload_at', String(Date.now())); } catch { /* ignore */ }
    location.reload();
    return true;
  },
  onUpdate() {
    this.pending = true;
    clearTimeout(this.timer);
    // Let the worker finish storing the rest of the changed files first.
    this.timer = setTimeout(() => { if (this.safeNow()) this.reload(); }, 1500);
  }
};

if ('serviceWorker' in navigator) {
  const sw = navigator.serviceWorker;
  const hadController = !!sw.controller;
  sw.addEventListener('message', (e) => { if (e.data && e.data.type === 'ns-update') updater.onUpdate(); });
  // A new worker version took over (its install re-downloads the whole shell).
  sw.addEventListener('controllerchange', () => { if (hadController) updater.onUpdate(); });
  document.addEventListener('visibilitychange', () => {
    if (updater.pending) { updater.reload(); return; }
    if (document.hidden) return;
    // Resumed from the background: not a navigation, so ask explicitly.
    sw.getRegistration().then((reg) => { if (reg) reg.update().catch(() => {}); }).catch(() => {});
    if (sw.controller) sw.controller.postMessage({ type: 'ns-check' });
  });
}

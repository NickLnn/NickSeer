// a2hs.js — "Add to Home Screen" prompt.
//
// There was previously no beforeinstallprompt handler anywhere in the app, so
// Android showed only Chrome's minimal mini-infobar and iOS — which has no
// install API at all — gave the user nothing.
//
// Android/Chrome: intercept beforeinstallprompt and drive it from our own UI.
// iOS/Safari:     no event exists, so gate on platform + visit count and show
//                 an instruction sheet pointing at the Share button.
const DISMISS_KEY = 'ns_a2hs_dismissed_at';
const VISITS_KEY = 'ns_visits';
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000; // re-ask after two weeks
const MIN_VISITS = 2;                       // never prompt on a first visit

let deferredPrompt = null;

function isStandalone() {
  return window.navigator.standalone === true ||
         window.matchMedia('(display-mode: standalone)').matches;
}
function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function snoozed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return at && Date.now() - at < SNOOZE_MS;
  } catch { return false; }
}
function bumpVisits() {
  try {
    const n = Number(localStorage.getItem(VISITS_KEY) || 0) + 1;
    localStorage.setItem(VISITS_KEY, String(n));
    return n;
  } catch { return 0; }
}

function render(mode) {
  if (document.getElementById('a2hs')) return;

  const bar = document.createElement('div');
  bar.id = 'a2hs';
  bar.className = 'a2hs';
  bar.setAttribute('role', 'dialog');
  bar.setAttribute('aria-label', 'Install NickSeer');

  const body = mode === 'ios'
    ? `<p class="a2hs-t">Add NickSeer to your Home Screen</p>
       <p class="a2hs-b">Tap <span class="a2hs-ic"><svg viewBox="0 0 24 24" width="15" height="15" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
         <path d="M12 16V3"/><path d="M8 7l4-4 4 4"/>
         <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg></span>
       then <b>Add to Home Screen</b>.</p>`
    : `<p class="a2hs-t">Install NickSeer</p>
       <p class="a2hs-b">Full screen, instant launch, works offline.</p>`;

  bar.innerHTML = `<img class="a2hs-icon" src="/icon-192.png" alt="" width="46" height="46" />
    <div class="a2hs-copy">${body}</div>
    <div class="a2hs-actions">
      ${mode === 'android' ? '<button class="a2hs-go" id="a2hsGo" type="button">Install</button>' : ''}
      <button class="a2hs-no" id="a2hsNo" type="button">Not now</button>
    </div>`;

  document.body.appendChild(bar);
  requestAnimationFrame(() => bar.classList.add('in'));

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    bar.classList.remove('in');
    setTimeout(() => bar.remove(), 300);
  };
  document.getElementById('a2hsNo')?.addEventListener('click', dismiss);

  document.getElementById('a2hsGo')?.addEventListener('click', async () => {
    if (!deferredPrompt) return dismiss();
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    // The event is single-use: a declined prompt cannot be replayed.
    deferredPrompt = null;
    if (outcome !== 'accepted') {
      try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    }
    bar.remove();
  });
}

// --- Android / desktop Chrome ---
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // suppress Chrome's own mini-infobar
  deferredPrompt = e;
  if (!isStandalone() && !snoozed() && bumpVisits() >= MIN_VISITS) render('android');
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  document.getElementById('a2hs')?.remove();
  try { localStorage.removeItem(DISMISS_KEY); } catch {}
});

// --- iOS ---
if (isIOS() && !isStandalone() && !snoozed() && bumpVisits() >= MIN_VISITS) {
  // Let the app settle first so the sheet does not compete with boot.
  setTimeout(() => render('ios'), 2600);
}

// --- Standalone gesture guard: REMOVED 2026-09-22 ---
// This used to cancel any downward finger drag (i.e. scrolling back UP) when
// the nearest of `.app, .modal-card, .req-body, .row-scroll, ...` reported
// scrollTop <= 0, to suppress pull-to-refresh in the installed app.
//
// But the page does not scroll inside `.app` — the DOCUMENT does. `.app` and
// every `.row-scroll` report scrollTop 0 no matter how far down you are, so
// the guard cancelled every scroll-up everywhere. In the installed PWA you
// could scroll down any tab and then never come back up. Measured: page at
// scrollTop 1624, touch on a poster -> .row-scroll (scrollTop 0), touch on a
// heading -> .app (scrollTop 0) -> preventDefault in both cases.
//
// It was also a passive:false touchmove on the whole document, which forces
// the browser to run JS before every scroll frame instead of scrolling on the
// compositor thread — a large part of the laggy feel in the installed app.
//
// Nothing is lost by deleting it: `overscroll-behavior-y: none` under
// `@media (display-mode: standalone)` in enhance.css is what stops Android's
// pull-to-refresh, and iOS home-screen apps have no pull-to-refresh at all.

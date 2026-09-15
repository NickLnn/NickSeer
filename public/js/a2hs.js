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

// --- iOS standalone gesture guard ---
// @media (display-mode: standalone) sets overscroll-behavior-y: none, which
// WebKit ignores — so pull-to-refresh and rubber-banding still fired inside
// the installed app. Cancel a downward drag that begins at scrollTop 0.
// passive:false is required; preventDefault() is a no-op on a passive listener.
if (isStandalone()) {
  let startY = 0;
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) startY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 1) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0) return; // dragging up is always fine
    const scroller = e.target.closest?.('.app, .modal-card, .req-body, .row-scroll, .drawer-body, .settings-modal-card');
    if (!scroller) { e.preventDefault(); return; }
    // Dragging down while already pinned at the top == pull-to-refresh.
    if (scroller.scrollTop <= 0) e.preventDefault();
  }, { passive: false });
}

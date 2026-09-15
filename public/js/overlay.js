// overlay.js — single source of truth for "is something covering the app, and
// how do we take it down cleanly?".
//
// This lives in its own module rather than inside app.js on purpose. app.js is
// loaded from index.html as `/js/app.js?v=<stamp>`; any module that imported
// it as `./app.js` would resolve to a DIFFERENT URL and the browser would
// evaluate app.js a second time — duplicating every listener, every boot
// request and, worse, giving each copy its own scroll-lock counter.
// Everything here is imported by the same unversioned specifier from every
// caller, so there is exactly one instance.

const OVERLAY_IDS = ['modal', 'requestModal', 'plexModal', 'profileOverlay'];

export function anyOverlayOpen() {
  return OVERLAY_IDS.some((id) => {
    const n = document.getElementById(id);
    return n && !n.classList.contains('hidden');
  });
}

export function closeAllOverlays() {
  let closedAny = false;
  for (const id of OVERLAY_IDS) {
    const n = document.getElementById(id);
    if (!n || n.classList.contains('hidden')) continue;
    n.classList.add('hidden');
    closedAny = true;
    // Clear the card body so a YouTube iframe stops playing audio and stale
    // handlers are not left bound to detached nodes.
    const card = n.querySelector('.modal-card, .req-card');
    if (card) {
      card.innerHTML = '';
      // A sheet dismissed mid-drag must not keep its translateY, or the next
      // open would render off-screen.
      clearSheetDrag(card);
    }
  }
  // Unconditional, and deliberately so. This function asserts the invariant
  // "nothing is covering the app", which implies "the body is not pinned".
  // Doing it only when we closed something left the page frozen whenever a
  // caller had already hidden its own overlay before navigating (the profile
  // picker does exactly that).
  resetScrollLock();
  return closedAny;
}

// ---------- scroll lock ----------
// iOS Safari ignores `overflow:hidden` on <body>, so we pin the document at
// its current offset and restore it on release.
//
// This was a plain depth COUNTER, and it leaked. The counter models nesting
// ("detail modal -> request modal"), but the three biggest callers do not nest
// — they REPLACE each other inside the same `#modal` element:
//
//   openDetail()  -> applyScrollLock()   depth 1
//   tap "More like this" -> openDetail() depth 2   (same #modal, nothing closed)
//   tap an actor  -> openPerson()        depth 3   (same #modal, nothing closed)
//   closeModal()  -> releaseScrollLock() depth 2   -> BODY STAYS PINNED
//
// The page was then frozen: no vertical scrolling, and every drag did nothing,
// which reads exactly as "after I close a movie it goes laggy and I can't go
// up and down". Reported by Nick 2026-09-16.
//
// Now the lock is keyed by OVERLAY IDENTITY. Re-locking the same overlay is
// idempotent, so a detail -> detail -> person chain holds exactly one lock,
// while genuinely stacked overlays (detail + request) still hold two and the
// body stays pinned until both are gone.
const _locks = new Set();
let _lockedY = 0;

export function applyScrollLock(key = 'modal') {
  if (_locks.has(key)) return;      // same overlay re-opened in place
  const wasEmpty = _locks.size === 0;
  _locks.add(key);
  if (!wasEmpty) return;            // already pinned by another overlay
  _lockedY = window.scrollY || document.documentElement.scrollTop || 0;
  const b = document.body.style;
  b.position = 'fixed';
  b.top = `-${_lockedY}px`;
  b.left = '0';
  b.right = '0';
  b.width = '100%';
  b.overflow = 'hidden';
  document.body.classList.add('overlay-open');
}

export function releaseScrollLock(key = 'modal') {
  if (!_locks.delete(key)) return;
  if (_locks.size > 0) return;      // something else is still covering the app
  unpinBody();
}

// Hard reset — used when we close everything at once and the key set may be
// out of step (e.g. a module hid an overlay without telling us).
export function resetScrollLock() {
  _locks.clear();
  unpinBody();
}

function unpinBody() {
  const b = document.body.style;
  b.position = b.top = b.left = b.right = b.width = b.overflow = '';
  document.body.classList.remove('overlay-open');
  window.scrollTo(0, _lockedY);
}

// ---------- swipe-down-to-dismiss ----------
// On phones the detail/request modals render as bottom sheets and CSS draws a
// grab bar at the top (.modal-card::before). That bar was purely decorative —
// it advertised a drag gesture that did not exist, so the only way out was the
// ✕. This adds the gesture the affordance was already promising.
//
// Rules that keep it from fighting the content:
//   - only when the sheet layout is actually in use (narrow viewport)
//   - only when the card is scrolled to the very top, so dragging down inside
//     a scrolled overview scrolls rather than dismisses
//   - only downward drags, past a small tolerance, so taps and flicks up are
//     untouched
const SHEET_MAX_WIDTH = 768;   // matches the bottom-sheet media query
const DRAG_TOLERANCE = 6;      // px before we treat it as a drag, not a tap
const VELOCITY_DISMISS = 0.6;  // px per ms — a fast flick closes regardless
const FLICK_MIN_TRAVEL = 24;   // ...but only once it has actually moved this far,
                               // so a twitchy few-pixel flick cannot dismiss

function backdropFor(card) {
  const root = card.parentElement;
  return root ? root.querySelector('.modal-backdrop, .req-backdrop') : null;
}

// Inline styles must never outlive a drag: the card elements are reused, so a
// leftover translateY would leave the next open sheet parked off-screen.
export function clearSheetDrag(card) {
  if (!card) return;
  card.style.transform = '';
  card.style.transition = '';
  const b = backdropFor(card);
  if (b) b.style.opacity = '';
}

export function enableSheetDrag(card, onDismiss) {
  if (!card || card.__sheetDragBound) return;
  card.__sheetDragBound = true;

  let startY = 0, startedAt = 0, dy = 0, dragging = false, armed = false;

  const isSheet = () => {
    try { return window.matchMedia(`(max-width: ${SHEET_MAX_WIDTH}px)`).matches; }
    catch { return window.innerWidth <= SHEET_MAX_WIDTH; }
  };

  card.addEventListener('touchstart', (e) => {
    if (!isSheet() || e.touches.length !== 1) { armed = false; return; }
    clearSheetDrag(card);
    // Arm only at the top of the scroll area, otherwise this is a scroll.
    armed = card.scrollTop <= 0;
    startY = e.touches[0].clientY;
    startedAt = performance.now();
    dy = 0;
    dragging = false;
  }, { passive: true });

  card.addEventListener('touchmove', (e) => {
    if (!armed || e.touches.length !== 1) return;
    const delta = e.touches[0].clientY - startY;
    if (delta <= 0) {
      // Upward: hand back to the scroller, and re-evaluate on the next move.
      if (!dragging) armed = card.scrollTop <= 0;
      return;
    }
    if (!dragging && delta < DRAG_TOLERANCE) return;
    dragging = true;
    dy = delta;
    // Non-passive so the browser does not also scroll/rubber-band underneath.
    e.preventDefault();
    card.style.transition = 'none';
    card.style.transform = `translateY(${dy}px)`;
    const b = backdropFor(card);
    if (b) b.style.opacity = String(Math.max(0, 1 - dy / (card.offsetHeight || 600)));
  }, { passive: false });

  const finish = () => {
    if (!dragging) { armed = false; return; }
    dragging = false;
    armed = false;

    const velocity = dy / Math.max(1, performance.now() - startedAt);
    const height = card.offsetHeight || 600;
    const past = dy > Math.min(140, height * 0.25);

    let reduced = false;
    try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* ignore */ }

    if (past || (velocity > VELOCITY_DISMISS && dy > FLICK_MIN_TRAVEL)) {
      if (reduced) { clearSheetDrag(card); onDismiss(); return; }
      card.style.transition = 'transform .2s cubic-bezier(.4,0,1,1)';
      card.style.transform = `translateY(${height}px)`;
      const b = backdropFor(card);
      if (b) { b.style.transition = 'opacity .2s linear'; b.style.opacity = '0'; }
      setTimeout(() => { clearSheetDrag(card); if (b) b.style.transition = ''; onDismiss(); }, 190);
    } else {
      card.style.transition = reduced ? 'none' : 'transform .25s cubic-bezier(.2,.7,.3,1)';
      card.style.transform = '';
      const b = backdropFor(card);
      if (b) b.style.opacity = '';
      setTimeout(() => { card.style.transition = ''; }, 260);
    }
  };

  card.addEventListener('touchend', finish, { passive: true });
  card.addEventListener('touchcancel', finish, { passive: true });
}

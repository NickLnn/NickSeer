// nav.js — Comprehensive TV Remote (D-pad), Spatial Navigation & Touch Focus.
// Supports LG webOS, Samsung Tizen, Android TV, Apple TV, Fire TV, and keyboard remotes.
// Features:
//  - True 2D spatial navigation with directional weighting.
//  - Active modal/overlay focus trapping (keeps D-pad inside open modals/dialogs).
//  - SECTION CONTAINMENT: left/right movement inside a hero/slideshow or a row
//    stays inside that section first; it only "escapes" to another section when
//    there is truly nothing left to move to in the current one. This fixes the
//    bug where pressing right/right at the edge of a slideshow would jump into
//    an unrelated row or another slideshow's dots/arrows.
//  - TV remote special key codes (Back, Select, MediaPlay, ChannelUp/Down).
//  - Smart auto-scroll into center/visible area.
//  - Typing detection so text inputs, search, and login work seamlessly without interception.
const BASE_SELECTOR = '[data-nav], .card, .nav-link, .bottom-nav-item, .btn, .hero-arrow, .hero-dot, .settings-tab, .test-btn, .seg button, .tag-chip, .profile-tile, .cast, .wl-btn, .wl-plex, .b2, .icon-btn, .mini-btn, .import-plex, .role-select, input:not([disabled]), select:not([disabled]), button:not([disabled])';

// Elements matching any of these selectors are treated as a contained
// "section" — spatial nav prefers to stay inside the nearest matching
// ancestor before considering elements outside it.
const SECTION_SELECTOR = '.hero, .row, .row-scroll, .modal-card, .req-card, .settings-card, .status-grid, .profile-grid, .cast-row';

function getActiveOverlay() {
  const overlays = [
    document.getElementById('plexModal'),
    document.getElementById('requestModal'),
    document.getElementById('modal'),
    document.getElementById('settings'),
    document.getElementById('profileOverlay'),
    document.getElementById('login'),
    document.getElementById('welcome'),
    document.querySelector('.pm-pop:not(.hidden)')
  ];
  for (const o of overlays) {
    if (o && !o.classList.contains('hidden') && o.offsetParent !== null) {
      return o;
    }
  }
  return null;
}
function focusable() {
  const overlay = getActiveOverlay();
  const scope = overlay || document;
  const elements = [...scope.querySelectorAll(BASE_SELECTOR)];
  return elements.filter((el) => {
    if (el.disabled || el.getAttribute('aria-hidden') === 'true') return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    // Ensure none of the ancestors are hidden
    let p = el;
    while (p && p !== scope) {
      if (p.classList && p.classList.contains('hidden')) return false;
      if (getComputedStyle(p).display === 'none') return false;
      p = p.parentElement;
    }
    return true;
  });
}
function rectOf(el) { return el.getBoundingClientRect(); }
function center(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
function vOverlap(a, b) { return Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); }
function hOverlap(a, b) { return Math.min(a.right, b.right) - Math.max(a.left, b.left); }

// Nearest ancestor that represents a logical "section" for containment.
function sectionOf(el) {
  return el.closest ? el.closest(SECTION_SELECTOR) : null;
}

function setFocus(el) {
  if (!el) return;
  document.querySelectorAll('.nav-focus').forEach((n) => n.classList.remove('nav-focus'));
  el.classList.add('nav-focus');
  try {
    el.focus({ preventScroll: true });
  } catch {
    /* fallback */
  }
  // Smooth scroll into visible frame (centered horizontally & vertically)
  const isInput = isTypingElement(el);
  if (!isInput) {
    el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }
  window._navCurrent = el;
}
function focusFirst(scopeEl = null) {
  const items = focusable();
  if (!items.length) return;
  if (scopeEl) {
    const scoped = items.filter((el) => scopeEl.contains(el));
    if (scoped.length) { setFocus(scoped[0]); return; }
  }
  setFocus(items[0]);
}

function candidatesInDirection(items, cur, dir) {
  const ar = rectOf(cur);
  const a = center(ar);
  const horizontal = dir === 'left' || dir === 'right';
  const inDir = (b) => {
    switch (dir) {
      case 'right': return b.x - a.x > 4;
      case 'left': return a.x - b.x > 4;
      case 'down': return b.y - a.y > 4;
      case 'up': return a.y - b.y > 4;
      default: return false;
    }
  };
  const strict = [], loose = [];
  for (const el of items) {
    if (el === cur) continue;
    const br = rectOf(el);
    const b = center(br);
    if (!inDir(b)) continue;
    const overlap = horizontal ? vOverlap(ar, br) : hOverlap(ar, br);
    const primary = horizontal ? Math.abs(b.x - a.x) : Math.abs(b.y - a.y);
    const secondary = horizontal ? Math.abs(b.y - a.y) : Math.abs(b.x - a.x);
    const minDim = horizontal ? Math.min(ar.height, br.height) : Math.min(ar.width, br.width);
    if (overlap > minDim * 0.2) {
      strict.push({ el, primary, secondary });
    } else {
      loose.push({ el, primary, secondary });
    }
  }
  return { strict, loose };
}

let lastNavTime = 0;
let lastKeyNavTime = 0;
const NAV_COOLDOWN_MS = 110;

function move(dir) {
  const items = focusable();
  if (!items.length) return;
  const cur = window._navCurrent && items.includes(window._navCurrent) ? window._navCurrent : items[0];
  if (!cur) return;

  const horizontal = dir === 'left' || dir === 'right';
  const curSection = sectionOf(cur);

  // PASS 1 — try to stay inside the current section first
  if (curSection) {
    const sectionItems = items.filter((el) => curSection.contains(el));

    // Precise, sequential 1-by-1 step navigation for linear rows / sliders
    // (e.g. .row-scroll, .col-row-scroller, .cast-row, or .row)
    const isRowContainer = curSection.classList.contains('row-scroll') ||
                           curSection.classList.contains('col-row-scroller') ||
                           curSection.classList.contains('cast-row') ||
                           curSection.classList.contains('row') ||
                           Boolean(curSection.querySelector && curSection.querySelector('.row-scroll, .col-row-scroller, .cast-row'));

    if (horizontal && isRowContainer && sectionItems.length > 1) {
      let curIdx = sectionItems.indexOf(cur);
      if (curIdx === -1) {
        curIdx = sectionItems.findIndex((el) => el.contains(cur) || cur.contains(el));
      }
      if (curIdx !== -1) {
        if (dir === 'right' && curIdx < sectionItems.length - 1) {
          setFocus(sectionItems[curIdx + 1]);
          return;
        } else if (dir === 'left' && curIdx > 0) {
          setFocus(sectionItems[curIdx - 1]);
          return;
        }
        return; // at edge of row: stay contained horizontally
      }
    }

    const { strict, loose } = candidatesInDirection(sectionItems, cur, dir);
    if (strict.length) {
      strict.sort((x, y) => (x.primary * 1.5 + x.secondary) - (y.primary * 1.5 + y.secondary));
      setFocus(strict[0].el);
      return;
    }
    if (horizontal) {
      if (loose.length) {
        loose.sort((x, y) => (x.primary + x.secondary * 2.5) - (y.primary + y.secondary * 2.5));
        setFocus(loose[0].el);
        return;
      }
      return; // nothing further in this direction inside the section — stop.
    }
  }

  // PASS 2 — global search (used for vertical movement, or when the current
  // element has no containing section at all, e.g. top bar / bottom nav).
  const { strict, loose } = candidatesInDirection(items, cur, dir);
  let pick = null;
  if (strict.length) {
    strict.sort((x, y) => (x.primary * 1.5 + x.secondary) - (y.primary * 1.5 + y.secondary));
    pick = strict[0].el;
  } else if (loose.length) {
    loose.sort((x, y) => (x.primary + x.secondary * 2.5) - (y.primary + y.secondary * 2.5));
    pick = loose[0].el;
  }
  if (pick) setFocus(pick);
}

function isTypingElement(ae) {
  if (!ae) return false;
  const tag = ae.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const ty = (ae.type || 'text').toLowerCase();
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file', 'color'].includes(ty);
  }
  if (ae.isContentEditable) return true;
  return false;
}
function isTyping() {
  return isTypingElement(document.activeElement);
}

function handleKeydown(e) {
  const typing = isTyping();
  const key = e.key;
  const code = e.keyCode || e.which;
  // WebOS (461), Tizen (10009), standard Back (Escape, Backspace)
  const isBackKey = key === 'Escape' || key === 'Back' || key === 'UIRight' || code === 461 || code === 10009 || (key === 'Backspace' && !typing);
  // Remote Select / OK / Enter (13)
  const isEnterKey = key === 'Enter' || key === 'Select' || key === 'Go' || code === 13;
  // Direction arrows
  const isUp = key === 'ArrowUp' || key === 'Up' || code === 38;
  const isDown = key === 'ArrowDown' || key === 'Down' || code === 40;
  const isLeft = key === 'ArrowLeft' || key === 'Left' || code === 37;
  const isRight = key === 'ArrowRight' || key === 'Right' || code === 39;
  // Media keys
  if (key === 'MediaPlay' || key === 'MediaPlayPause' || key === 'Play' || code === 179 || code === 415) {
    if (window._navCurrent) {
      e.preventDefault();
      window._navCurrent.click();
      return;
    }
  }
  if (isBackKey) {
    if (!typing) {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('nav:back'));
    }
    return;
  }
  if (isEnterKey) {
    if (!typing) {
      const target = window._navCurrent || (document.activeElement && document.activeElement !== document.body ? document.activeElement : null);
      if (target && typeof target.click === 'function') {
        e.preventDefault();
        target.click();
      }
    }
    return;
  }
  // While typing, arrow keys must move the text caret, not spatial focus —
  // ONLY exception: ArrowDown/Enter is handled by app.js's search box itself
  // to intentionally jump into results (see app.js's own keydown listener).
  if ((isRight || isLeft || isDown || isUp) && !typing) {
    e.preventDefault();
    const now = performance.now();
    if (now - lastNavTime < NAV_COOLDOWN_MS) return;
    lastNavTime = now;
    lastKeyNavTime = now;
    if (isRight) move('right');
    else if (isLeft) move('left');
    else if (isDown) move('down');
    else if (isUp) move('up');
    return;
  }
}

function handleMouseover(e) {
  if (window.matchMedia && !window.matchMedia('(hover: hover)').matches) return;
  // Ignore synthetic mouseover events triggered while scrolling under a stationary cursor
  if (performance.now() - lastKeyNavTime < 350) return;
  const el = e.target.closest(BASE_SELECTOR);
  if (el) window._navCurrent = el;
}

// Singleton listener attachment — prevents duplicate listeners when nav.js
// is loaded via script tag and also imported by app.js
if (!window._navEventsInitialized) {
  window._navEventsInitialized = true;
  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('mouseover', handleMouseover);
}

export { setFocus, focusable, focusFirst, getActiveOverlay };

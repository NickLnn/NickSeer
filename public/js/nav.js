// Spatial (D-pad / arrow-key) navigation. FIX: Backspace/Escape are no longer
// intercepted while typing in ANY text field (search, login, tag inputs), so
// backspace works normally in the search box.
const SELECTOR = '[data-nav], .card, .nav-link, .btn, .hero-arrow, .hero-dot, .settings-tab, .test-btn, .seg button, .tag-chip, .profile-tile, .cast';

function focusable() {
  return [...document.querySelectorAll(SELECTOR)].filter((el) => {
    if (el.disabled) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    let p = el; while (p) { if (p.classList && p.classList.contains('hidden')) return false; p = p.parentElement; }
    return true;
  });
}
function rectOf(el) { return el.getBoundingClientRect(); }
function center(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
function vOverlap(a, b) { return Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); }
function hOverlap(a, b) { return Math.min(a.right, b.right) - Math.max(a.left, b.left); }

function setFocus(el) {
  if (!el) return;
  document.querySelectorAll('.nav-focus').forEach((n) => n.classList.remove('nav-focus'));
  el.classList.add('nav-focus'); el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  window._navCurrent = el;
}

function move(dir) {
  const items = focusable();
  const cur = window._navCurrent && items.includes(window._navCurrent) ? window._navCurrent : items[0];
  if (!cur) return;
  const ar = rectOf(cur); const a = center(ar);
  const horizontal = dir === 'left' || dir === 'right';
  const inDir = (b) => dir === 'right' ? b.x - a.x > 6 : dir === 'left' ? a.x - b.x > 6 : dir === 'down' ? b.y - a.y > 6 : a.y - b.y > 6;
  const strict = [], loose = [];
  for (const el of items) {
    if (el === cur) continue;
    const br = rectOf(el); const b = center(br);
    if (!inDir(b)) continue;
    const overlap = horizontal ? vOverlap(ar, br) : hOverlap(ar, br);
    const primary = horizontal ? Math.abs(b.x - a.x) : Math.abs(b.y - a.y);
    const secondary = horizontal ? Math.abs(b.y - a.y) : Math.abs(b.x - a.x);
    const minDim = horizontal ? Math.min(ar.height, br.height) : Math.min(ar.width, br.width);
    (overlap > minDim * 0.25 ? strict : loose).push({ el, primary, secondary });
  }
  let pick = null;
  if (strict.length) { strict.sort((x, y) => x.primary - y.primary); pick = strict[0].el; }
  else if (loose.length) { loose.sort((x, y) => (x.primary + x.secondary * 3) - (y.primary + y.secondary * 3)); pick = loose[0].el; }
  if (pick) setFocus(pick);
}

// True when focus is in a real text-entry field (so we must NOT hijack keys).
function isTyping() {
  const ae = document.activeElement;
  if (!ae) return false;
  const tag = ae.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') { const ty = (ae.type || 'text').toLowerCase(); return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file', 'color'].includes(ty); }
  if (ae.isContentEditable) return true;
  return false;
}

document.addEventListener('keydown', (e) => {
  const typing = isTyping();
  switch (e.key) {
    case 'ArrowRight': if (!typing) { e.preventDefault(); move('right'); } break;
    case 'ArrowLeft':  if (!typing) { e.preventDefault(); move('left'); } break;
    case 'ArrowDown':  if (!typing) { e.preventDefault(); move('down'); } break;
    case 'ArrowUp':    if (!typing) { e.preventDefault(); move('up'); } break;
    case 'Enter':      if (window._navCurrent && !typing) { e.preventDefault(); window._navCurrent.click(); } break;
    // Backspace: only used as "back" when NOT typing. While typing it edits text.
    case 'Backspace':  if (!typing) { e.preventDefault(); document.dispatchEvent(new CustomEvent('nav:back')); } break;
    case 'Escape':     if (!typing) { e.preventDefault(); document.dispatchEvent(new CustomEvent('nav:back')); } break;
  }
});
document.addEventListener('mouseover', (e) => { const el = e.target.closest(SELECTOR); if (el) window._navCurrent = el; });

export { setFocus, focusable };

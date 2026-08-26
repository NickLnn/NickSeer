// brands.js — REAL streaming logos on row-title chips. Fetches TMDB's official
// provider artwork (Netflix, Disney+, Prime, Max, Apple TV+, Paramount+) once
// from /api/discover/brand-logos, and falls back to a clean SVG if the image
// (or the fetch) is unavailable.
function authHeaders() { const t = localStorage.getItem('nickseer_token'); return t ? { Authorization: 'Bearer ' + t } : {}; }

const SVG_LOGOS = {
  netflix:   { wide: false, bg: '#000', svg: `<svg viewBox="0 0 24 24" width="26" height="26"><path d="M7 3v18l3 .3V13l4 8.4 3 .3V3h-3v9L10 3z" fill="#e50914"/></svg>` },
  disney:    { wide: true, bg: '#0a1e5e', html: `<span style="font-family:'Inter',Georgia,serif;font-weight:800;font-style:italic;font-size:15px;color:#fff;letter-spacing:-.3px;padding:0 10px;white-space:nowrap">Disney<span style="color:#3aa0ff;font-weight:700;font-style:normal">+</span></span>` },
  amazon:    { wide: false, bg: '#1399FF', svg: `<svg viewBox="0 0 30 30" width="30" height="30"><path d="M6 19c5.2 3 12.8 3 18 0" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><text x="6.5" y="14" font-family="Inter,Arial" font-weight="800" font-size="9.5" fill="#fff">prime</text></svg>` },
  max:       { wide: false, bg: '#0a0a1a', svg: `<svg viewBox="0 0 42 24" width="30" height="17"><text x="1" y="17" font-family="Inter,Arial" font-weight="900" font-size="13" fill="#fff">HBO</text></svg>` },
  apple:     { wide: false, bg: '#000', svg: `<svg viewBox="0 0 24 24" width="22" height="22"><path fill="#fff" d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>` },
  paramount: { wide: false, bg: '#0064ff', svg: `<svg viewBox="0 0 30 24" width="26" height="22"><path d="M15 3l3.5 8H11.5z" fill="#fff"/><text x="9.5" y="21" font-family="Inter,Arial" font-weight="800" font-size="9" fill="#fff">P+</text></svg>` }
};

let REAL = {};            // key -> logo image URL (from TMDB)
let realLoaded = false;

function detectKey(el) {
  let key = null;
  el.classList.forEach((c) => { if (c.startsWith('bg-')) key = c.slice(3); });
  if (!key) { const t = (el.parentElement?.textContent || '').toLowerCase(); if (t.includes('netflix')) key = 'netflix'; else if (t.includes('disney')) key = 'disney'; else if (t.includes('prime')) key = 'amazon'; else if (t.includes('hbo') || t.includes('max')) key = 'max'; else if (t.includes('apple')) key = 'apple'; else if (t.includes('paramount')) key = 'paramount'; }
  return key;
}
function applySvg(el, logo) {
  if (!logo) return;
  el.style.background = logo.bg; el.style.display = 'inline-flex'; el.style.alignItems = 'center'; el.style.justifyContent = 'center'; el.style.overflow = 'hidden';
  if (logo.wide) { el.style.width = 'auto'; el.style.height = '30px'; el.style.borderRadius = '8px'; el.style.padding = '0'; }
  el.innerHTML = logo.html || logo.svg;
}
function applyImage(el, url, key) {
  el.style.width = 'auto'; el.style.height = '30px'; el.style.borderRadius = '8px'; el.style.overflow = 'hidden';
  el.style.display = 'inline-flex'; el.style.alignItems = 'center'; el.style.justifyContent = 'center';
  el.style.background = key === 'netflix' || key === 'apple' || key === 'max' ? '#000' : '#0a1e5e';
  el.style.padding = '0 6px';
  const img = new Image();
  img.alt = key; img.style.height = '24px'; img.style.width = 'auto'; img.style.display = 'block'; img.referrerPolicy = 'no-referrer';
  img.onload = () => { el.innerHTML = ''; el.appendChild(img); };
  img.onerror = () => applySvg(el, SVG_LOGOS[key]);
  img.src = url;
}
function upgrade(el) {
  if (el.dataset.brandDone) return;
  const key = detectKey(el); if (!key) return;
  el.dataset.brandDone = '1';
  if (REAL[key]) applyImage(el, REAL[key], key);
  else applySvg(el, SVG_LOGOS[key]);        // fallback (also used until REAL loads)
}
function scan(root = document) { root.querySelectorAll('.brand-badge').forEach(upgrade); }

// Load real logos, then re-render any badges already on screen.
async function loadReal() {
  try { REAL = await fetch('/api/discover/brand-logos', { headers: authHeaders() }).then((r) => r.json()) || {}; } catch { REAL = {}; }
  realLoaded = true;
  // Re-upgrade existing badges now that we have real logos.
  document.querySelectorAll('.brand-badge').forEach((el) => { el.dataset.brandDone = ''; el.innerHTML = ''; upgrade(el); });
}
loadReal();
scan();
const obs = new MutationObserver((muts) => { for (const m of muts) for (const n of m.addedNodes) { if (n.nodeType !== 1) continue; if (n.classList && n.classList.contains('brand-badge')) upgrade(n); if (n.querySelectorAll) n.querySelectorAll('.brand-badge').forEach(upgrade); } });
obs.observe(document.body, { childList: true, subtree: true });

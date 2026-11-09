// logo.js — NickSeer brand mark (2026-11-09 redesign).
// Revolut-style monogram, "folded N": two white pillars and a light-blue
// diagonal (like a folded ribbon) on a flat deep-Aegean squircle; wordmark "nickseer" in lowercase, heavy and tight. This file is
// the single source: every .brand-mark in the app (top bar, drawer, profile
// picker, settings) is filled from here, and favicon.svg / the PNG app icons
// are drawn from the same path.

export const NS_AEGEAN = '#1866A8';
export const NS_LIGHT = '#8EC1EC';
// Drawn in this order: left pillar, right pillar, then the diagonal on top.
export const NS_PARTS = [
  ['M17 48V16h9v32z', '#fff'],
  ['M38 16h9v32h-9z', '#fff'],
  ['M17 16h9l21 32h-9z', NS_LIGHT]
];
export const LOGO_SVG = `<svg viewBox="0 0 64 64" width="34" height="34" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="nickseer"><rect width="64" height="64" rx="16" fill="${NS_AEGEAN}"/>${NS_PARTS.map(([d, f]) => `<path d="${d}" fill="${f}"/>`).join('')}</svg>`;

const FAVICON_HREF = '/favicon.svg?v=4';

function applyFavicon() {
  let link = document.querySelector('link[rel="icon"][type="image/svg+xml"]') || document.querySelector('link[rel="icon"]');
  if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
  link.type = 'image/svg+xml';
  link.href = FAVICON_HREF;
}

function applyMarks(root = document) {
  root.querySelectorAll('.brand-mark:not([data-ns-mark])').forEach((m) => {
    m.innerHTML = LOGO_SVG;
    m.dataset.nsMark = '1';
    m.style.background = 'transparent';
    m.style.boxShadow = 'none';
  });
}

function styleWordmark() {
  if (document.getElementById('logo-fix-css')) return;
  const st = document.createElement('style'); st.id = 'logo-fix-css';
  st.textContent = `
    .brand-text{
      -webkit-background-clip: initial !important; background-clip: initial !important;
      background: none !important; color: #ffffff !important; -webkit-text-fill-color: #ffffff !important;
      text-transform: lowercase; font-weight: 800 !important; letter-spacing: -.035em !important;
      text-shadow: none !important;
    }
    .brand-mark svg{ display:block; width:100%; height:100%; border-radius: 26%; box-shadow: none !important; }`;
  document.head.appendChild(st);
}

function boot() { styleWordmark(); applyMarks(); applyFavicon(); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 60));
else setTimeout(boot, 60);

// Marks rendered later (profile picker, settings, drawer) get filled too.
new MutationObserver(() => { if (document.querySelector('.brand-mark:not([data-ns-mark])')) applyMarks(); })
  .observe(document.body, { childList: true, subtree: true });

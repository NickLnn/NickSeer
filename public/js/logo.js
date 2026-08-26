// logo.js — new NickSeer brand: a calligraphic "N" with an Aegean wave.
// Also FIXES the invisible "NickSeer" wordmark (the Aegean theme had made the
// text transparent). Additive & self-contained: swaps the top-bar mark, the
// favicon, and forces the wordmark to a visible light colour.

// Rounded-square Aegean tile → white calligraphic N (brush strokes with tapered
// terminals) → a light wave sweeping across the bottom.
const LOGO_SVG = `
<svg viewBox="0 0 64 64" width="34" height="34" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="nsTile" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3AA6E0"/><stop offset=".55" stop-color="#1E88C7"/><stop offset="1" stop-color="#0d4e7d"/>
    </linearGradient>
    <linearGradient id="nsWave" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#bfe8ff"/><stop offset="1" stop-color="#eaf7ff"/>
    </linearGradient>
    <filter id="nsShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1" stdDeviation="1.1" flood-color="#062038" flood-opacity="0.45"/>
    </filter>
  </defs>
  <rect x="2" y="2" width="60" height="60" rx="15" fill="url(#nsTile)"/>
  <!-- Calligraphic N: one continuous brush stroke, thick on the verticals,
       thin on the joins, with tapered serif terminals. -->
  <g filter="url(#nsShadow)" fill="#ffffff">
    <path d="M15.5 44.5
             C15.2 36 15.2 26 15.6 18.6
             C15.7 16.8 18.6 16.6 19.3 18.2
             C24.6 26.5 30.5 34.6 36.4 42.1
             C36.4 34.4 36.3 25.8 36.7 18.8
             C36.8 16.4 41.4 16.3 41.6 18.8
             C42 27 42 37.5 41.6 45.4
             C41.5 47.4 38.4 47.7 37.4 46
             C31.8 38.2 25.9 30.2 20.4 22.7
             C20.5 30.2 20.6 38.4 20.3 44.6
             C20.2 47.4 15.8 47.6 15.5 44.5 Z"/>
    <!-- tiny calligraphic swash on the top-left terminal -->
    <path d="M13.6 18.4 C15.4 16.8 18.2 16.6 19.6 17.8 C17.8 17.4 15.6 17.6 13.6 18.4 Z" opacity=".9"/>
  </g>
  <!-- Aegean waves along the bottom -->
  <path d="M8 50.5 C 15 46.5, 22 54.5, 30 50.5 C 38 46.5, 45 54.5, 56 49.8" fill="none" stroke="url(#nsWave)" stroke-width="2.4" stroke-linecap="round" opacity=".95"/>
  <path d="M9 55 C 16 51.5, 22 58.5, 30 55 C 38 51.5, 44 58.5, 55 54.2" fill="none" stroke="url(#nsWave)" stroke-width="1.5" stroke-linecap="round" opacity=".5"/>
</svg>`;

// Same art at 64px for the favicon (URI-encoded).
const FAVICON = encodeURIComponent(LOGO_SVG.replace(/width="34" height="34"/, 'width="64" height="64"').replace(/\n/g, ''));

function applyFavicon() {
  const href = 'data:image/svg+xml,' + FAVICON;
  let link = document.querySelector('link[rel="icon"]');
  if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
  link.href = href;
  let apple = document.querySelector('link[rel="apple-touch-icon"]');
  if (!apple) { apple = document.createElement('link'); apple.rel = 'apple-touch-icon'; document.head.appendChild(apple); }
  apple.href = href;
}

function applyMark() {
  const mark = document.querySelector('#topbar .brand-mark');
  if (mark) { mark.innerHTML = LOGO_SVG; mark.style.background = 'transparent'; mark.style.boxShadow = 'none'; }
}

// Force the wordmark visible again (the theme had made it transparent).
function fixWordmark() {
  if (document.getElementById('logo-fix-css')) return;
  const st = document.createElement('style'); st.id = 'logo-fix-css';
  st.textContent = `
    .brand-text{
      -webkit-background-clip: initial !important; background-clip: initial !important;
      background: none !important; color: #eaf6ff !important;
      -webkit-text-fill-color: #eaf6ff !important;
      font-weight: 800; letter-spacing: -.02em; text-shadow: 0 1px 2px rgba(0,0,0,.35);
    }
    .brand-mark svg{ border-radius: 12px; box-shadow: 0 6px 18px rgba(30,136,199,.4); }`;
  document.head.appendChild(st);
}

function boot() { fixWordmark(); applyMark(); applyFavicon(); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 60));
else setTimeout(boot, 60);
// Re-apply if the topbar re-renders.
const obs = new MutationObserver(() => { const m = document.querySelector('#topbar .brand-mark'); if (m && !m.querySelector('svg defs #nsTile')) applyMark(); });
obs.observe(document.body, { childList: true, subtree: true });

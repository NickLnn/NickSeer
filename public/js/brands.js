// brands.js — High-Definition Vector Streaming Brand Logos & Provider Artwork.
// Netflix, Disney+, Prime Video, HBO Max, Apple TV+, Paramount+, Peacock.
function authHeaders() { const t = localStorage.getItem('nickseer_token'); return t ? { Authorization: 'Bearer ' + t } : {}; }

const SVG_LOGOS = {
  netflix: {
    wide: false,
    bg: '#000',
    svg: `<svg viewBox="0 0 32 32" width="28" height="28" style="display:block"><rect width="32" height="32" rx="7" fill="#000000"/><path d="M9 5h4.2v22H9z" fill="#B81D24"/><path d="M18.8 5H23v22h-4.2z" fill="#B81D24"/><path d="M9 5h4.2l9.8 22H18.8z" fill="#E50914"/></svg>`
  },
  disney: {
    wide: true,
    bg: '#0A163B',
    svg: `<svg viewBox="0 0 74 32" width="70" height="30" style="display:block"><defs><linearGradient id="dGlow" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3aa0ff"/><stop offset="1" stop-color="#a5d8ff"/></linearGradient></defs><rect width="74" height="32" rx="7" fill="#0A163B"/><text x="8" y="20.5" font-family="'Inter',-apple-system,sans-serif" font-weight="900" font-style="italic" font-size="13.5" fill="#FFFFFF" letter-spacing="-0.4">Disney</text><path d="M57 12v4h-4v2.2h4v4h2.2v-4h4V16h-4v-4z" fill="#3AA0FF"/><path d="M6 7.5C22 3.5 44 5 60 10.5" fill="none" stroke="url(#dGlow)" stroke-width="1.8" stroke-linecap="round"/></svg>`
  },
  amazon: {
    wide: true,
    bg: '#00050d',
    svg: `<svg viewBox="0 0 72 32" width="68" height="30" style="display:block"><rect width="72" height="32" rx="7" fill="#00050d" stroke="rgba(255,255,255,0.1)" stroke-width="1"/><text x="8" y="19" font-family="'Inter',-apple-system,sans-serif" font-weight="900" font-size="13" fill="#FFFFFF" letter-spacing="-0.3">prime</text><path d="M8 23.5c11 4 24 3 31-1.5" fill="none" stroke="#00A8E1" stroke-width="2.2" stroke-linecap="round"/><path d="M38 21.5l2 1.2-2.3 1.2z" fill="#00A8E1"/></svg>`
  },
  max: {
    wide: true,
    bg: '#000000',
    svg: `<svg viewBox="0 0 62 32" width="58" height="30" style="display:block"><rect width="62" height="32" rx="7" fill="#000000" stroke="rgba(0,43,231,0.4)" stroke-width="1"/><text x="7" y="21.5" font-family="'Inter',-apple-system,sans-serif" font-weight="900" font-size="16" fill="#002BE7" letter-spacing="-0.6">MAX</text></svg>`
  },
  apple: {
    wide: true,
    bg: '#141414',
    svg: `<svg viewBox="0 0 66 32" width="62" height="30" style="display:block"><rect width="66" height="32" rx="7" fill="#141414" stroke="rgba(255,255,255,0.12)" stroke-width="1"/><path fill="#ffffff" d="M15.5 19.8c-.6.6-1.3.5-1.9.2-.7-.3-1.3-.3-2 0-.9.4-1.4.3-1.9-.2-2.2-2.6-1.7-7.4 1.7-7.6.8 0 1.4.4 1.9.5.7-.2 1.4-.6 2.2-.5.9.1 1.6.5 2.1 1.1-1.9 1.1-1.5 3.7.3 4.4-.4 1-.8 1.9-1.6 2.6-.4-.2-.5-.3-.8-.5zm-3.1-8.1c-.1-1.4 1-2.5 2.3-2.6.2 1.6-1.4 2.8-2.3 2.6z"/><text x="21" y="20.5" font-family="'Inter',-apple-system,sans-serif" font-weight="800" font-size="12.5" fill="#FFFFFF">tv+</text></svg>`
  },
  paramount: {
    wide: true,
    bg: '#0047BA',
    svg: `<svg viewBox="0 0 68 32" width="64" height="30" style="display:block"><rect width="68" height="32" rx="7" fill="#0047BA"/><path d="M15 10l6 14H9z" fill="#FFFFFF"/><path d="M12 17l3-7 3 7z" fill="#0047BA"/><text x="26" y="21" font-family="'Inter',-apple-system,sans-serif" font-weight="900" font-size="12.5" fill="#FFFFFF">P+</text></svg>`
  }
};

let REAL = {};
let realLoaded = false;

function detectKey(el) {
  let key = null;
  el.classList.forEach((c) => { if (c.startsWith('bg-')) key = c.slice(3); });
  if (!key) {
    const t = (el.parentElement?.textContent || '').toLowerCase();
    if (t.includes('netflix')) key = 'netflix';
    else if (t.includes('disney')) key = 'disney';
    else if (t.includes('prime')) key = 'amazon';
    else if (t.includes('hbo') || t.includes('max')) key = 'max';
    else if (t.includes('apple')) key = 'apple';
    else if (t.includes('paramount')) key = 'paramount';
  }
  return key;
}

function applySvg(el, logo) {
  if (!logo) return;
  el.style.background = logo.bg || 'transparent';
  el.style.display = 'inline-flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.overflow = 'hidden';
  el.style.borderRadius = '8px';
  el.style.padding = '0';
  el.style.boxShadow = '0 3px 10px rgba(0,0,0,.5)';
  el.innerHTML = logo.svg;
}

function applyImage(el, url, key) {
  el.style.width = 'auto';
  el.style.height = '30px';
  el.style.borderRadius = '8px';
  el.style.overflow = 'hidden';
  el.style.display = 'inline-flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.background = key === 'disney' ? '#0A163B' : key === 'paramount' ? '#0047BA' : '#000000';
  el.style.padding = '0 6px';
  el.style.boxShadow = '0 3px 10px rgba(0,0,0,.5)';

  const img = new Image();
  img.alt = key;
  img.style.height = '24px';
  img.style.width = 'auto';
  img.style.display = 'block';
  img.referrerPolicy = 'no-referrer';
  img.onload = () => { el.innerHTML = ''; el.appendChild(img); };
  img.onerror = () => applySvg(el, SVG_LOGOS[key]);
  img.src = url;
}

function upgrade(el) {
  if (el.dataset.brandDone) return;
  const key = detectKey(el);
  if (!key) return;
  el.dataset.brandDone = '1';
  if (REAL[key]) applyImage(el, REAL[key], key);
  else applySvg(el, SVG_LOGOS[key]);
}

function scan(root = document) {
  root.querySelectorAll('.brand-badge').forEach(upgrade);
}

async function loadReal() {
  try {
    REAL = await fetch('/api/discover/brand-logos', { headers: authHeaders() }).then((r) => r.json()) || {};
  } catch {
    REAL = {};
  }
  realLoaded = true;
  document.querySelectorAll('.brand-badge').forEach((el) => {
    el.dataset.brandDone = '';
    el.innerHTML = '';
    upgrade(el);
  });
}

loadReal();
scan();

const obs = new MutationObserver((muts) => {
  for (const m of muts) {
    for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.classList && n.classList.contains('brand-badge')) upgrade(n);
      if (n.querySelectorAll) n.querySelectorAll('.brand-badge').forEach(upgrade);
    }
  }
});
obs.observe(document.body, { childList: true, subtree: true });
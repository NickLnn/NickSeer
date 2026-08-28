// detail-ratings.js — Movie & TV detail modal ratings with High-Definition Official Badges:
//   • IMDb rating shown FIRST with official vector IMDb logo + bold score + votes
//   • TMDB rating shown SECOND next to it with official gradient TMDB badge

const IMDB_SVG = `<svg viewBox="0 0 40 20" width="34" height="17" style="display:block;flex:0 0 auto"><rect width="40" height="20" rx="3.5" fill="#F5C518"/><text x="3.5" y="15" font-family="'Arial Black',Impact,sans-serif" font-weight="900" font-size="13" fill="#000000" letter-spacing="-0.5">IMDb</text></svg>`;

const TMDB_SVG = `<svg viewBox="0 0 52 20" width="44" height="17" style="display:block;flex:0 0 auto"><defs><linearGradient id="tmdbB" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#90cea1"/><stop offset="0.5" stop-color="#3cbec9"/><stop offset="1" stop-color="#00b3e5"/></linearGradient></defs><rect width="52" height="20" rx="4.5" fill="url(#tmdbB)"/><text x="5" y="15" font-family="'Inter',Arial,sans-serif" font-weight="900" font-size="11" fill="#032541" letter-spacing="0.2">TMDB</text></svg>`;

function pill(bg, border, inner) {
  return `<span class="dr-pill" style="display:inline-flex;align-items:center;gap:6px;background:${bg};border:1px solid ${border};border-radius:8px;padding:4px 10px;line-height:1">${inner}</span>`;
}

function rework(meta) {
  if (!meta || meta.dataset.drDone) return;

  // 1) Read TMDB rating
  let tmdbVal = null, starSpan = null;
  meta.querySelectorAll('span').forEach((s) => {
    const t = (s.textContent || '').trim();
    if (!starSpan && /★\s*[\d.]/.test(t)) {
      starSpan = s;
      const m = t.match(/([\d.]+)/);
      if (m) tmdbVal = m[1];
    }
  });

  // 2) Read IMDb rating
  let imdbVal = null, imdbVotes = null;
  const oldImdb = meta.querySelector('.imdb-badge');
  if (oldImdb) {
    const b = oldImdb.querySelector('.imdb-score b');
    if (b) imdbVal = (b.textContent || '').trim();
    const v = oldImdb.querySelector('.imdb-votes');
    if (v) imdbVotes = (v.textContent || '').trim();
  }

  if (!starSpan && !oldImdb) return;
  meta.dataset.drDone = '1';

  // Build badges
  const imdbBadge = imdbVal
    ? pill('#0c0c10', 'rgba(245,197,24,.4)', `${IMDB_SVG}<b style="color:#f5c518;font-weight:900;font-size:14.5px">${imdbVal}</b><span style="color:#8a8f99;font-weight:700;font-size:11.5px">/10</span>${imdbVotes ? `<span style="color:#6b7280;font-size:11px;font-weight:600">(${imdbVotes})</span>` : ''}`)
    : '';

  const tmdbBadge = tmdbVal
    ? pill('rgba(1,180,228,.08)', 'rgba(1,180,228,.32)', `${TMDB_SVG}<b style="color:#90cea1;font-weight:800;font-size:14px">${tmdbVal}</b><span style="color:#8a8f99;font-size:11px">/10</span>`)
    : '';

  if (starSpan) starSpan.remove();
  if (oldImdb) oldImdb.remove();

  const frag = document.createElement('span');
  frag.style.display = 'inline-flex';
  frag.style.alignItems = 'center';
  frag.style.gap = '8px';
  frag.innerHTML = (imdbBadge || '') + (tmdbBadge || '');

  const chips = meta.querySelector('.chip');
  if (chips) meta.insertBefore(frag, chips);
  else meta.appendChild(frag);
}

function scan() {
  document.querySelectorAll('#modalCard .modal-meta').forEach(rework);
}

const obs = new MutationObserver(() => scan());
obs.observe(document.body, { childList: true, subtree: true });
setTimeout(scan, 400);
// detail-ratings.js — Movie & TV detail modal ratings:
//   • IMDb rating shown FIRST with the official yellow IMDb logo + score + votes
//   • TMDB rating shown SECOND next to it with TMDB logo + score
//   • Distinguishes TMDB from IMDb clearly everywhere.

const IMDB_LOGO = `<span style="display:inline-flex;align-items:center;background:#f5c518;color:#000;font-family:Arial,Helvetica,sans-serif;font-weight:900;font-size:11px;letter-spacing:.3px;padding:2.5px 6px;border-radius:4px;line-height:1;margin-right:2px">IMDb</span>`;

const TMDB_LOGO = `<span style="display:inline-flex;align-items:center;background:linear-gradient(135deg,#90cea1,#01b4e4);color:#032541;font-family:Inter,Arial,sans-serif;font-weight:900;font-size:10.5px;letter-spacing:.2px;padding:2.5px 6px;border-radius:4px;line-height:1;margin-right:2px">TMDB</span>`;

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
    ? pill('#0c0c10', 'rgba(245,197,24,.35)', `${IMDB_LOGO}<b style="color:#f5c518;font-weight:900;font-size:14.5px">${imdbVal}</b><span style="color:#8a8f99;font-weight:700;font-size:11.5px">/10</span>${imdbVotes ? `<span style="color:#6b7280;font-size:11px;font-weight:600">(${imdbVotes})</span>` : ''}`)
    : '';

  const tmdbBadge = tmdbVal
    ? pill('rgba(1,180,228,.08)', 'rgba(1,180,228,.28)', `${TMDB_LOGO}<b style="color:#90cea1;font-weight:800;font-size:14px">${tmdbVal}</b><span style="color:#8a8f99;font-size:11px">/10</span>`)
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
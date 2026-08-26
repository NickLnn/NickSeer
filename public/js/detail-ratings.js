// detail-ratings.js — reworks the detail modal's rating row:
//   • IMDb rating shown FIRST (where the TMDB ★ used to be), with the official
//     yellow IMDb logo.
//   • The TMDB score moved to its RIGHT, labeled with the official TMDB logo
//     (teal→blue gradient), so you know where that number came from.
// Additive: watches the modal for a .modal-meta and rewrites it once.

const IMDB_LOGO = `<span style="display:inline-flex;align-items:center;background:#f5c518;color:#000;font-family:Arial,Helvetica,sans-serif;font-weight:900;font-size:11px;letter-spacing:.3px;padding:2px 5px;border-radius:3px;line-height:1">IMDb</span>`;
// TMDB official pill (its brand gradient + wordmark).
const TMDB_LOGO = `<svg width="46" height="14" viewBox="0 0 185 20" style="display:block"><defs><linearGradient id="tmdbG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#90cea1"/><stop offset=".56" stop-color="#3cbec9"/><stop offset="1" stop-color="#00b3e5"/></linearGradient></defs><rect rx="10" width="185" height="20" fill="url(#tmdbG)"/><text x="12" y="15" font-family="Inter,Arial" font-weight="900" font-size="13" fill="#032541">TMDB</text></svg>`;

function pill(bg, inner) {
  return `<span class="dr-pill" style="display:inline-flex;align-items:center;gap:6px;background:${bg};border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:4px 9px">${inner}</span>`;
}

function rework(meta) {
  if (!meta || meta.dataset.drDone) return;

  // 1) Read the TMDB star value from the gold star span.
  let tmdbVal = null, starSpan = null;
  meta.querySelectorAll('span').forEach((s) => {
    const t = (s.textContent || '').trim();
    if (!starSpan && /★\s*[\d.]/.test(t)) { starSpan = s; const m = t.match(/([\d.]+)/); if (m) tmdbVal = m[1]; }
  });

  // 2) Read the IMDb value/votes from an existing .imdb-badge (if OMDb gave one).
  let imdbVal = null, imdbVotes = null;
  const oldImdb = meta.querySelector('.imdb-badge');
  if (oldImdb) {
    const b = oldImdb.querySelector('.imdb-score b'); if (b) imdbVal = (b.textContent || '').trim();
    const v = oldImdb.querySelector('.imdb-votes'); if (v) imdbVotes = (v.textContent || '').trim();
  }

  if (!starSpan && !oldImdb) return; // nothing to do
  meta.dataset.drDone = '1';

  // Build the new badges.
  const imdbBadge = imdbVal
    ? pill('#0c0c0f', `${IMDB_LOGO}<b style="color:#f5c518;font-weight:900;font-size:15px">${imdbVal}</b><span style="color:#cfcfd6;font-weight:700;font-size:12px">/10</span>${imdbVotes ? `<span style="color:#8a8f99;font-size:11px;font-weight:600">${imdbVotes}</span>` : ''}`)
    : '';
  const tmdbBadge = tmdbVal
    ? pill('rgba(255,255,255,.06)', `${TMDB_LOGO}<b style="color:#eaf6ff;font-weight:800;font-size:14px">${tmdbVal}</b>`)
    : '';

  // Remove the old star + old imdb badge.
  if (starSpan) starSpan.remove();
  if (oldImdb) oldImdb.remove();

  // Insert IMDb first (where the star was), then TMDB to its right — right after
  // the runtime, before the TV/genre chips.
  const chips = meta.querySelector('.chip');
  const frag = document.createElement('span');
  frag.style.display = 'inline-flex'; frag.style.alignItems = 'center'; frag.style.gap = '8px';
  frag.innerHTML = (imdbBadge || '') + (tmdbBadge || '');
  if (chips) meta.insertBefore(frag, chips); else meta.appendChild(frag);
}

function scan() { document.querySelectorAll('#modalCard .modal-meta').forEach(rework); }
const obs = new MutationObserver(() => scan());
obs.observe(document.body, { childList: true, subtree: true });
setTimeout(scan, 400);

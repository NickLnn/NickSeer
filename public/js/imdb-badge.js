// imdb-badge.js — IMDb rating (official yellow mini logo) on every poster + TMDB secondary.
function authHeaders() { const t = localStorage.getItem('nickseer_token'); return t ? { Authorization: 'Bearer ' + t } : {}; }

const idByTitle = new Map();
const ratingById = new Map();
let pending = new Set();
let flushTimer = null;
let flushing = false;

function norm(t) { return String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function keyOf(title, year) { return norm(title) + '|' + (year || ''); }

function harvest(obj) {
  if (!obj || typeof obj !== 'object') return;
  const consider = (it) => {
    if (it && it.id && (it.title || it.name)) {
      const media = it.media || it.media_type || (it.title ? 'movie' : 'tv');
      const year = it.year || (it.release_date || it.first_air_date || '').slice(0, 4);
      idByTitle.set(keyOf(it.title || it.name, year), { media, id: it.id, vote: it.rating || it.vote_average });
      idByTitle.set(keyOf(it.title || it.name, ''), { media, id: it.id, vote: it.rating || it.vote_average });
      if (it.imdbRating != null && !ratingById.has(it.id)) ratingById.set(it.id, Number(it.imdbRating));
    }
  };
  if (Array.isArray(obj)) { obj.forEach(harvest); return; }
  if (Array.isArray(obj.items)) obj.items.forEach(consider);
  if (Array.isArray(obj.results)) obj.results.forEach(consider);
  if (Array.isArray(obj.movies)) obj.movies.forEach(consider);
  if (Array.isArray(obj.tv)) obj.tv.forEach(consider);
  if (Array.isArray(obj.rows)) obj.rows.forEach((r) => Array.isArray(r.items) && r.items.forEach(consider));
  ['recommendations', 'similar', 'inLibrary', 'knownFor', 'crewKnownFor'].forEach((k) => Array.isArray(obj[k]) && obj[k].forEach(consider));
}

if (!window.__nsImdbWrapped) {
  window.__nsImdbWrapped = true;
  const orig = window.fetch;
  window.fetch = async function (input) {
    const res = await orig.apply(this, arguments);
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (url.includes('/api/discover/') && !url.includes('/imdb-ratings')) {
        res.clone().json().then((j) => { harvest(j); scheduleScan(); }).catch(() => {});
      }
    } catch { /* ignore */ }
    return res;
  };
}

function scheduleFlush() { if (flushTimer || flushing) return; flushTimer = setTimeout(flush, 250); }
async function flush() {
  flushTimer = null; if (flushing) return; flushing = true;
  const idToMedia = new Map(); for (const { media, id } of idByTitle.values()) idToMedia.set(id, media);
  try {
    while (pending.size) {
      const ids = [...pending].slice(0, 50);
      ids.forEach((id) => pending.delete(id));
      const items = ids.map((id) => ({ media: idToMedia.get(id) || 'movie', id }));
      try {
        const r = await fetch('/api/discover/imdb-ratings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ items })
        }).then((x) => x.json());
        const ratings = r.ratings || {};
        for (const id of ids) ratingById.set(id, ratings[String(id)] != null ? ratings[String(id)] : null);
      } catch {
        for (const id of ids) ratingById.set(id, null);
      }
      paintAll();
    }
  } finally {
    flushing = false;
    if (pending.size) scheduleFlush();
  }
}

function injectStyles() {
  if (document.getElementById('imdbbadge-styles')) return;
  const css = `
  .rating-badge-group{position:absolute;top:6px;left:6px;display:inline-flex;align-items:center;gap:4px;z-index:4;pointer-events:none;}
  .imdb-card-badge{display:inline-flex;align-items:center;gap:3.5px;background:rgba(12,12,16,.88);backdrop-filter:blur(4px);border:1px solid rgba(245,197,24,.3);border-radius:6px;padding:2.5px 6px;line-height:1;box-shadow:0 2px 8px rgba(0,0,0,.5);}
  .imdb-card-badge .lg{background:#f5c518;color:#000;font-family:Arial,Helvetica,sans-serif;font-weight:900;font-size:8px;letter-spacing:.2px;padding:1px 3px;border-radius:2.5px;line-height:1;}
  .imdb-card-badge .sc{color:#fff;font-weight:800;font-size:11px;line-height:1;}
  .tmdb-mini-badge{display:inline-flex;align-items:center;gap:2px;background:rgba(18,24,38,.85);backdrop-filter:blur(4px);border:1px solid rgba(1,180,228,.35);border-radius:6px;padding:2.5px 5px;line-height:1;font-size:10px;font-weight:700;color:#90cea1;}
  .tmdb-mini-badge .tmdb-lbl{font-size:7.5px;font-weight:800;color:#01b4e4;text-transform:uppercase;}
  `;
  const st = document.createElement('style'); st.id = 'imdbbadge-styles'; st.textContent = css; document.head.appendChild(st);
}

function paintCard(card) {
  const nameEl = card.querySelector('.card-name'); const yearEl = card.querySelector('.card-year');
  const title = nameEl ? nameEl.textContent : ''; const year = yearEl ? (yearEl.textContent || '').trim() : '';
  if (!title) return;
  const rec = idByTitle.get(keyOf(title, year)) || idByTitle.get(keyOf(title, ''));
  if (!rec) return;
  const id = rec.id;

  // Read TMDB rating from card badge before removal
  let tmdbRating = null;
  const oldBadge = card.querySelector('.card-badge');
  if (oldBadge) {
    const m = oldBadge.textContent.match(/[\d.]+/);
    if (m) tmdbRating = Number(m[0]);
  }

  if (!ratingById.has(id)) { pending.add(id); scheduleFlush(); return; }
  const imdbRating = ratingById.get(id);
  
  if (imdbRating == null && !tmdbRating) return;
  const signature = `${imdbRating || ''}_${tmdbRating || ''}`;
  if (card.dataset.ratingDone === signature) return;
  card.dataset.ratingDone = signature;

  if (oldBadge) oldBadge.remove();
  const prevGroup = card.querySelector('.rating-badge-group');
  if (prevGroup) prevGroup.remove();

  const group = document.createElement('div');
  group.className = 'rating-badge-group';
  
  // IMDb rating badge (primary)
  if (imdbRating != null) {
    const b = document.createElement('div');
    b.className = 'imdb-card-badge';
    b.innerHTML = `<span class="lg">IMDb</span><span class="sc">${Number(imdbRating).toFixed(1)}</span>`;
    group.appendChild(b);
  }

  // TMDB secondary badge
  if (tmdbRating != null && imdbRating != null) {
    const t = document.createElement('div');
    t.className = 'tmdb-mini-badge';
    t.innerHTML = `<span class="tmdb-lbl">TMDB</span><span>${Number(tmdbRating).toFixed(1)}</span>`;
    group.appendChild(t);
  } else if (imdbRating == null && tmdbRating != null) {
    // Only TMDB available (fallback)
    const t = document.createElement('div');
    t.className = 'tmdb-mini-badge';
    t.innerHTML = `<span style="color:#f5c518">★</span><span>${Number(tmdbRating).toFixed(1)}</span>`;
    group.appendChild(t);
  }

  const cs = getComputedStyle(card);
  if (cs.position === 'static') card.style.position = 'relative';
  card.appendChild(group);
}

function paintAll() { document.querySelectorAll('.card').forEach(paintCard); }
let scanTimer = null;
function scheduleScan() {
  if (scanTimer) return;
  scanTimer = setTimeout(() => { scanTimer = null; injectStyles(); paintAll(); }, 200);
}
window.__nsScanImdb = scheduleScan;

injectStyles();
const obs = new MutationObserver(() => scheduleScan());
obs.observe(document.body, { childList: true, subtree: true });
setTimeout(scheduleScan, 500);
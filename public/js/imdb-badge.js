// imdb-badge.js — IMDb rating (official yellow mini logo) on every poster.
// FIXES: (1) items that already carry `imdbRating` (IMDb chart rows) are shown
// INSTANTLY with no OMDb call — this makes the IMDb Top 250 posters consistent.
// (2) OMDb lookups for the rest are CHUNKED in 40s (server cap) and repainted
// per chunk, so no poster is left on the old TMDB star.
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
      idByTitle.set(keyOf(it.title || it.name, year), { media, id: it.id });
      idByTitle.set(keyOf(it.title || it.name, ''), { media, id: it.id });
      // If the item already includes an IMDb rating (chart rows), use it now.
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
    try { const url = typeof input === 'string' ? input : (input && input.url) || ''; if (url.includes('/api/discover/') && !url.includes('/imdb-ratings')) { res.clone().json().then((j) => { harvest(j); scheduleScan(); }).catch(() => {}); } } catch { /* ignore */ }
    return res;
  };
}

function scheduleFlush() { if (flushTimer || flushing) return; flushTimer = setTimeout(flush, 300); }
async function flush() {
  flushTimer = null; if (flushing) return; flushing = true;
  const idToMedia = new Map(); for (const { media, id } of idByTitle.values()) idToMedia.set(id, media);
  try {
    while (pending.size) {
      const ids = [...pending].slice(0, 40); ids.forEach((id) => pending.delete(id));
      const items = ids.map((id) => ({ media: idToMedia.get(id) || 'movie', id }));
      try { const r = await fetch('/api/discover/imdb-ratings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ items }) }).then((x) => x.json()); const ratings = r.ratings || {}; for (const id of ids) ratingById.set(id, ratings[String(id)] != null ? ratings[String(id)] : null); }
      catch { for (const id of ids) ratingById.set(id, null); }
      paintAll();
    }
  } finally { flushing = false; if (pending.size) scheduleFlush(); }
}

function injectStyles() {
  if (document.getElementById('imdbbadge-styles')) return;
  const css = `
  .imdb-card-badge{position:absolute;top:7px;left:7px;display:inline-flex;align-items:center;gap:4px;background:rgba(0,0,0,.8);border-radius:5px;padding:2px 5px;z-index:4;line-height:1;}
  .imdb-card-badge .lg{background:#f5c518;color:#000;font-family:Arial,Helvetica,sans-serif;font-weight:900;font-size:7.5px;letter-spacing:.2px;padding:1px 2.5px;border-radius:2.5px;line-height:1;}
  .imdb-card-badge .sc{color:#fff;font-weight:800;font-size:10.5px;line-height:1;}`;
  const st = document.createElement('style'); st.id = 'imdbbadge-styles'; st.textContent = css; document.head.appendChild(st);
}
function paintCard(card) {
  const nameEl = card.querySelector('.card-name'); const yearEl = card.querySelector('.card-year');
  const title = nameEl ? nameEl.textContent : ''; const year = yearEl ? (yearEl.textContent || '').trim() : '';
  if (!title) return;
  const rec = idByTitle.get(keyOf(title, year)) || idByTitle.get(keyOf(title, ''));
  if (!rec) return;
  const id = rec.id;
  if (!ratingById.has(id)) { pending.add(id); scheduleFlush(); return; }
  const rating = ratingById.get(id);
  if (rating == null) return;
  if (card.dataset.imdbDone === String(rating)) return;
  card.dataset.imdbDone = String(rating);
  const old = card.querySelector('.card-badge'); if (old) old.remove();
  const prev = card.querySelector('.imdb-card-badge'); if (prev) prev.remove();
  const b = document.createElement('div'); b.className = 'imdb-card-badge';
  b.innerHTML = `<span class="lg">IMDb</span><span class="sc">${Number(rating).toFixed(1)}</span>`;
  const cs = getComputedStyle(card); if (cs.position === 'static') card.style.position = 'relative';
  card.appendChild(b);
}
function paintAll() { document.querySelectorAll('.card').forEach(paintCard); }
let scanTimer = null;
function scheduleScan() { if (scanTimer) return; scanTimer = setTimeout(() => { scanTimer = null; injectStyles(); paintAll(); }, 200); }
window.__nsScanImdb = scheduleScan;

injectStyles();
const obs = new MutationObserver(() => scheduleScan());
obs.observe(document.body, { childList: true, subtree: true });
setTimeout(scheduleScan, 600);

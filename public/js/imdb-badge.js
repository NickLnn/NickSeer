// imdb-badge.js — High-Definition Official IMDb & TMDB Badges (Global Inline & Card Integration)
function authHeaders() {
  const t = localStorage.getItem('nickseer_token');
  return t ? { Authorization: 'Bearer ' + t } : {};
}

const idByTitle = new Map();
const mediaById = new Map();
const ratingById = new Map();
const urlById = new Map();
const pending = new Set();
let flushTimer = null;
let flushing = false;

function norm(t) { return String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function keyOf(title, year) { return norm(title) + '|' + (year || ''); }

export function harvest(obj) {
  if (!obj || typeof obj !== 'object') return;
  const consider = (it) => {
    if (it && it.id && (it.title || it.name)) {
      const media = it.media || it.media_type || (it.title ? 'movie' : 'tv');
      const year = it.year || (it.release_date || it.first_air_date || '').slice(0, 4);
      idByTitle.set(keyOf(it.title || it.name, year), { media, id: it.id, vote: it.rating || it.vote_average, title: it.title || it.name, year });
      idByTitle.set(keyOf(it.title || it.name, ''), { media, id: it.id, vote: it.rating || it.vote_average, title: it.title || it.name, year });
      mediaById.set(it.id, media);
      if (it.imdbRating != null && !ratingById.has(it.id)) ratingById.set(it.id, Number(it.imdbRating));
      if (it.imdbUrl && !urlById.has(it.id)) urlById.set(it.id, it.imdbUrl);
      if (it.imdbId && !urlById.has(it.id)) urlById.set(it.id, `https://www.imdb.com/title/${it.imdbId}/`);
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
        res.clone().json().then((j) => { harvest(j); harvestGen++; schedulePaint(); }).catch(() => {});
      }
    } catch { /* ignore */ }
    return res;
  };
}

function scheduleFlush() {
  if (flushTimer || flushing) return;
  flushTimer = setTimeout(flush, 200);
}

async function flush() {
  flushTimer = null;
  if (flushing) return;
  flushing = true;
  const idToMedia = new Map();
  for (const { media, id } of idByTitle.values()) idToMedia.set(id, media);
  // data-id-derived entries win: they came from the card itself, not a title guess.
  for (const [id, media] of mediaById) idToMedia.set(id, media);

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
        const urls = r.urls || {};
        for (const id of ids) {
          ratingById.set(id, ratings[String(id)] != null ? Number(ratings[String(id)]) : null);
          if (urls[String(id)]) urlById.set(id, urls[String(id)]);
        }
      } catch {
        for (const id of ids) ratingById.set(id, null);
      }
      schedulePaint();
    }
  } finally {
    flushing = false;
    if (pending.size) scheduleFlush();
  }
}

const IMDB_SVG = `<svg viewBox="0 0 32 16" width="28" height="14" class="imdb-svg" style="display:block"><rect width="32" height="16" rx="2.5" fill="#F5C518"/><text x="2" y="12.2" font-family="'Arial Black',Impact,sans-serif" font-weight="900" font-size="10.5" fill="#000000" letter-spacing="-0.3">IMDb</text></svg>`;
const IMDB_MINI_SVG = `<svg viewBox="0 0 32 16" width="22" height="11" class="imdb-svg" style="display:block"><rect width="32" height="16" rx="2.5" fill="#F5C518"/><text x="2" y="12.5" font-family="'Arial Black',Impact,sans-serif" font-weight="900" font-size="10.5" fill="#000000" letter-spacing="-0.4">IMDb</text></svg>`;

export function renderImdbInlineBadge(rating, url, votes, id, media, title, year) {
  if (id && rating != null && !ratingById.has(id)) ratingById.set(id, Number(rating));
  if (id && url && !urlById.has(id)) urlById.set(id, url);
  if (id && media) mediaById.set(id, media);
  if (id && (media || title)) {
    const y = year || '';
    if (title) {
      idByTitle.set(keyOf(title, y), { media: media || 'movie', id, title, year: y });
      idByTitle.set(keyOf(title, ''), { media: media || 'movie', id, title, year: y });
    }
  }

  const badge = document.createElement('a');
  badge.className = 'imdb-inline-badge';
  badge.target = '_blank';
  badge.rel = 'noopener noreferrer';
  badge.setAttribute('data-nav', '');
  badge.title = 'View on IMDb';

  const effId = id;
  const effRating = rating != null ? rating : (effId ? ratingById.get(effId) : null);
  const effUrl = url || (effId ? urlById.get(effId) : null) || (title ? `https://www.imdb.com/find/?q=${encodeURIComponent(title)}` : 'https://www.imdb.com');
  badge.href = effUrl;

  if (effId) badge.dataset.imdbId = effId;
  if (media) badge.dataset.media = media;

  const scoreText = effRating != null ? Number(effRating).toFixed(1) : (effId && !ratingById.has(effId) ? '...' : '');

  badge.innerHTML = `
    <span class="imdb-badge-icon" aria-label="IMDb">${IMDB_SVG}</span>
    <span class="imdb-badge-score">${scoreText}</span>
    ${effRating != null ? '<span class="imdb-badge-scale">/10</span>' : ''}
    ${votes ? `<span class="imdb-badge-votes">(${votes})</span>` : ''}
  `;

  if (effRating == null && effId && !ratingById.has(effId)) {
    pending.add(effId);
    scheduleFlush();
  }

  return badge;
}
window.renderImdbInlineBadge = renderImdbInlineBadge;

function updateBadgeElement(badge) {
  // `dataset` always yields a string, but `ratingById` / `urlById` are keyed by
  // the numeric TMDB id. The lookup below used the raw string and therefore
  // always missed, so an inline badge rendered as "..." never got its score
  // filled in once the ratings fetch resolved.
  const id = Number(badge.dataset.imdbId);
  if (!id) return;
  const rating = ratingById.get(id);
  const url = urlById.get(id);
  if (url) badge.href = url;

  const scoreEl = badge.querySelector('.imdb-badge-score');
  if (scoreEl && rating != null) {
    scoreEl.textContent = Number(rating).toFixed(1);
    if (!badge.querySelector('.imdb-badge-scale')) {
      const scaleEl = document.createElement('span');
      scaleEl.className = 'imdb-badge-scale';
      scaleEl.textContent = '/10';
      badge.insertBefore(scaleEl, badge.querySelector('.imdb-badge-votes'));
    }
    badge.style.display = 'inline-flex';
  } else if (rating === null && !url) {
    // If resolution definitively returned null and no url exists
    badge.style.display = 'none';
  }
}

// Global scanner for Hero metadata, Modals, and Collections
function paintMeta() {
  document.querySelectorAll('.imdb-inline-badge[data-imdb-id]').forEach(updateBadgeElement);

  // Auto-augment any .hero-meta, .modal-meta, or .col-part-card displaying star ratings
  document.querySelectorAll('.hero-meta, .modal-meta').forEach((meta) => {
    if (meta.querySelector('.imdb-inline-badge')) return;

    let starSpan = null;
    meta.querySelectorAll('span').forEach((s) => {
      const t = (s.textContent || '').trim();
      if (!starSpan && /★\s*[\d.]/.test(t)) {
        starSpan = s;
      }
    });

    if (!starSpan) return;

    // Detect item title and year from surrounding container
    const hero = meta.closest('.hero');
    const modal = meta.closest('#modalCard');
    let title = '', year = '', id = null, media = 'movie';

    if (hero) {
      const tEl = hero.querySelector('.hero-title');
      if (tEl) title = tEl.textContent.trim();
      const yEl = meta.querySelector('span:first-child');
      if (yEl && /^\d{4}$/.test(yEl.textContent.trim())) year = yEl.textContent.trim();
    } else if (modal) {
      const tEl = modal.querySelector('.modal-title');
      if (tEl) title = tEl.textContent.trim();
      const yEl = meta.querySelector('span:first-child');
      if (yEl && /^\d{4}$/.test(yEl.textContent.trim())) year = yEl.textContent.trim();
    }

    if (title) {
      const rec = idByTitle.get(keyOf(title, year)) || idByTitle.get(keyOf(title, ''));
      if (rec) {
        id = rec.id;
        media = rec.media || 'movie';
      }
    }

    const badge = renderImdbInlineBadge(null, null, null, id, media, title, year);
    // Insert immediately after the star rating element
    starSpan.insertAdjacentElement('afterend', badge);
  });
}

function paintCard(card) {
  // Identity comes from the card's own `data-id` whenever it has one.
  //
  // This used to resolve the card by matching its visible title text against
  // `idByTitle`, with a fallback that dropped the year entirely
  // (`keyOf(title, '')`). Same-title films — Dune, IT, The Lion King, any
  // remake — collide on that key, so a card could be painted with a different
  // movie's IMDb score, and whichever record was harvested last won. app.js
  // already stamps the real TMDB id onto every card it builds; use it.
  let id = card.dataset.id ? Number(card.dataset.id) : null;
  if (id && card.dataset.media) mediaById.set(id, card.dataset.media);

  if (!id) {
    const nameEl = card.querySelector('.card-name');
    const yearEl = card.querySelector('.card-year');
    const title = nameEl ? nameEl.textContent : '';
    const year = yearEl ? (yearEl.textContent || '').trim() : '';
    if (!title) return;
    // Unresolvable with the data we have. Don't re-derive the key every pass —
    // retry only once `harvest()` has brought in new title→id mappings.
    if (card.__nsMissGen === harvestGen) return;
    // Title fallback for cards built without a data-id. Requires the year to
    // match, so the remake collision above cannot happen here either.
    const rec = idByTitle.get(keyOf(title, year));
    if (!rec) { card.__nsMissGen = harvestGen; return; }
    id = rec.id;
    if (rec.media) mediaById.set(id, rec.media);
  }

  // The TMDB score is read out of `.card-badge` — which this function then
  // REMOVES to make room for the badge group. So every pass after the first
  // found no `.card-badge`, computed a different signature, and repainted
  // without the TMDB half. The score silently dropped off the card. Remember
  // it on the element so later passes reproduce the same group.
  let tmdbRating = card.__nsTmdb != null ? card.__nsTmdb : null;
  const oldBadge = card.querySelector('.card-badge');
  if (oldBadge) {
    const m = oldBadge.textContent.match(/[\d.]+/);
    if (m) { tmdbRating = Number(m[0]); card.__nsTmdb = tmdbRating; }
  }

  if (!ratingById.has(id)) {
    pending.add(id);
    scheduleFlush();
    return;
  }
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

  if (imdbRating != null) {
    const b = document.createElement('div');
    b.className = 'imdb-card-badge';
    b.innerHTML = `${IMDB_MINI_SVG}<span class="sc">${Number(imdbRating).toFixed(1)}</span>`;
    group.appendChild(b);
  }

  // Poster cards carry the IMDb badge ONLY. The TMDB badge that used to sit
  // next to it is still rendered inside the detail sheet (openDetail builds
  // `.modal-meta` with both the TMDB star value and the inline IMDb badge) —
  // this restriction is deliberate and applies to the card overlay alone,
  // where two competing scores crowded the poster art.
  //
  // When a title has no IMDb rating the card shows the TMDB value as a plain
  // star instead of nothing at all, so the card is never left bare.
  if (imdbRating == null && tmdbRating != null) {
    const t = document.createElement('div');
    t.className = 'tmdb-mini-badge';
    t.innerHTML = `<span style="color:#f5c518">★</span><span>${Number(tmdbRating).toFixed(1)}</span>`;
    group.appendChild(t);
  }

  // `.card` is `position:relative` in styles.css, so the old
  // `getComputedStyle()` probe here bought nothing and forced a synchronous
  // layout for every card on every pass.
  card.appendChild(group);
}

// ---------------------------------------------------------------------------
// Paint scheduling.
//
// This used to be a `MutationObserver` on `document.body` with `subtree: true`
// that, on ANY mutation, re-walked every `.card` in the document and called
// `getComputedStyle()` on each one. Painting a card appends DOM, which re-fired
// the observer, so it was a self-feeding loop throttled only by a 150ms timer:
// on a phone with a few hundred cards it re-laid-out the whole page ~7x a second
// forever. That was the scroll lag.
//
// Now: an IntersectionObserver keeps a set of cards that are actually near the
// viewport, and only those are ever painted. The MutationObserver's only job is
// to *enrol* newly added cards — it never triggers a document-wide scan, so
// appending a badge inside a card can no longer feed back into a repaint.
// ---------------------------------------------------------------------------

// Cards currently within (or near) the viewport. Paint passes are O(visible),
// not O(everything ever rendered).
const liveCards = new Set();

// Bumped whenever `harvest()` learns new title→id mappings. A card that failed
// to resolve is skipped on later passes until new data could change the answer.
let harvestGen = 0;

let paintFrame = null;
function schedulePaint() {
  if (paintFrame) return;
  paintFrame = requestAnimationFrame(() => {
    paintFrame = null;
    for (const card of liveCards) {
      if (!card.isConnected) { liveCards.delete(card); continue; }
      paintCard(card);
    }
    paintMeta();
  });
}

// Drives painting. Cards leaving the viewport are dropped from the live set.
const cardObserver = new IntersectionObserver((entries) => {
  let dirty = false;
  for (const e of entries) {
    if (e.isIntersecting) { liveCards.add(e.target); dirty = true; }
    else liveCards.delete(e.target);
  }
  if (dirty) schedulePaint();
}, { rootMargin: '400px' });

// app.js calls `window.imdbObserver.observe(card)` as it builds each card. It
// used to point at a separate prefetcher in app.js that wrote a cache nothing
// ever read — a duplicate /imdb-ratings round trip per card, thrown away. This
// is now the single owner of card rating painting.
window.imdbObserver = cardObserver;

function enrol(node) {
  if (!node || node.nodeType !== 1) return;
  if (node.classList && node.classList.contains('card')) { cardObserver.observe(node); return; }
  if (node.querySelectorAll) {
    const inner = node.querySelectorAll('.card');
    for (let i = 0; i < inner.length; i++) cardObserver.observe(inner[i]);
  }
}

// Enrolment only. Scoped to the nodes actually added, so the cost is
// proportional to what was rendered — and a `.rating-badge-group` appended
// inside a card matches nothing here, which is what breaks the old feedback loop.
const domObserver = new MutationObserver((records) => {
  for (const r of records) {
    const added = r.addedNodes;
    for (let i = 0; i < added.length; i++) enrol(added[i]);
  }
});
domObserver.observe(document.body, { childList: true, subtree: true });

// Explicit repaint hook (aisuggest.js calls this after injecting its own cards).
// Sweeps for anything the observer missed, then paints. Re-observing an element
// is a no-op, so the sweep is safe to repeat.
function scheduleScan() {
  const all = document.querySelectorAll('.card');
  for (let i = 0; i < all.length; i++) cardObserver.observe(all[i]);
  schedulePaint();
}
window.__nsScanImdb = scheduleScan;

// Cards already in the DOM before this module evaluated: a MutationObserver
// only reports future mutations, so they need one explicit sweep.
scheduleScan();
setTimeout(scheduleScan, 400);

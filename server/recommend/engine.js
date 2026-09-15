// The recommendation brain. Results are cached per-user for 24h so Home stays
// fast and refreshes daily; ?refresh=1 recomputes immediately.
import { load } from '../config.js';
import tmdb from '../services/tmdb.js';
import tautulli from '../services/tautulli.js';
import plex from '../services/plex.js';
import { aiRerank } from './ai.js';
import { cached, TTL_DAY } from '../lib/cache.js';
import { mapLimit } from '../lib/async.js';

// TMDB tolerates generous bursts; 8 stays well under the rate ceiling while
// turning dozens of serial round trips into a handful of waves.
const FANOUT = 8;

export async function getHistory(userId) {
  const { services, recommendation } = load();
  const depth = recommendation.historyDepth || 500;
  if (services.tautulli?.url && services.tautulli?.apikey) {
    try {
      const items = await tautulli.history(depth, userId);
      if (items && items.length) return { source: 'tautulli', items };
    } catch (e) {
      console.warn('[recommend] tautulli history failed:', e.message);
    }
  }
  if (services.plex?.url && services.plex?.token) {
    try {
      return { source: 'plex', items: await plex.history(depth) };
    } catch (e) {
      console.warn('[recommend] plex history failed:', e.message);
    }
  }
  return { source: 'none', items: [] };
}

function buildTasteProfile(history) {
  const { recommendation } = load();
  const seen = new Map();
  for (const h of history) {
    const key = (h.grandparentTitle || h.title || '').toLowerCase().trim();
    if (!key) continue;
    let weight = 1;
    if (h.percentComplete != null) weight = Math.max(0.25, Number(h.percentComplete) / 100);
    if (h.watched === 1) weight = 1;
    if (recommendation.dedupeSeries && seen.has(key)) seen.set(key, Math.min(2, seen.get(key) + 0.1));
    else seen.set(key, weight);
  }
  return seen;
}

async function resolve(titleKey, type) {
  try {
    const media = type === 'show' ? 'tv' : 'movie';
    const res = await tmdb.search(titleKey, media);
    const hit = (res.results || [])[0];
    if (!hit) return null;
    return { id: hit.id, media, genre_ids: hit.genre_ids || [] };
  } catch { return null; }
}

export async function getSeeds(userId, max = 25) {
  const { items } = await getHistory(userId);
  const profile = buildTasteProfile(items);
  const top = [...profile.entries()].sort((a, b) => b[1] - a[1]).slice(0, max);
  const typeByKey = new Map(items.map((h) => [(h.grandparentTitle || h.title || '').toLowerCase().trim(), h.type]));
  // ~25 independent TMDB searches. Run them in waves instead of back-to-back;
  // mapLimit preserves input order, so seed ranking is unchanged.
  const resolved = await mapLimit(top, FANOUT, async ([key, weight]) => {
    const r = await resolve(key, typeByKey.get(key));
    return r ? { ...r, title: key, weight } : null;
  });
  return resolved.filter(Boolean);
}

export function genreAffinity(seeds) {
  const affinity = new Map();
  for (const s of seeds) {
    for (const g of s.genre_ids || []) {
      affinity.set(g, (affinity.get(g) || 0) + s.weight);
    }
  }
  return affinity;
}

export async function getUserGenreAffinity(userId) {
  const seeds = await getSeeds(userId, 25);
  return genreAffinity(seeds);
}

async function compute({ userId, level }) {
  const cfg = load();
  const useLevel = level || cfg.recommendation.level || 1;
  const seeds = await getSeeds(userId, 25);
  if (!seeds.length) {
    const t = await tmdb.trending('all', 'week');
    return { cold: true, rows: [{ title: 'Trending this week', items: normalize(t.results) }] };
  }
  const affinity = genreAffinity(seeds);
  const hasKids = affinity.has(10762) || affinity.has(10751);
  const hasMusic = affinity.has(10402);
  const topSeeds = seeds.slice(0, 15);

  // Fetch recommendations + similar for every seed ONCE, concurrently. This
  // used to be two serial passes over the same 15 seeds — the pool build below
  // and the "Because you watched" rows further down each re-fetched the same
  // 30 endpoints, so Home paid for ~60 serial round trips it only needed 30 of.
  const [owned, feeds, trendingRes] = await Promise.all([
    safeOwned(),
    mapLimit(topSeeds, FANOUT, async (s) => {
      const [recRes, simRes] = await Promise.allSettled([
        tmdb.recommendations(s.media, s.id),
        tmdb.similar(s.media, s.id)
      ]);
      return {
        seed: s,
        recs: recRes.status === 'fulfilled' ? (recRes.value.results || []) : [],
        sims: simRes.status === 'fulfilled' ? (simRes.value.results || []) : []
      };
    }),
    tmdb.trending('all', 'week').catch(() => null)
  ]);

  const pool = new Map();
  for (const { seed: s, recs, sims } of feeds) {
    // Same iteration order as before: recommendations first, then similar.
    for (const c of [...recs, ...sims]) {
      const id = `${s.media}:${c.id}`;
      if (owned.has(s.media + ':' + String(c.id))) continue;
      const cGenres = c.genre_ids || [];
      if (!hasKids && (cGenres.includes(10762) || (cGenres.includes(16) && cGenres.includes(10751)))) continue;
      if (!hasMusic && cGenres.includes(10402)) continue;
      if (!pool.has(id)) pool.set(id, { ...c, media: s.media, _score: 0, _from: [] });
      const item = pool.get(id);
      item._score += s.weight * 2.0;
      for (const g of cGenres) item._score += (affinity.get(g) || 0) * 0.35;
      item._score += (c.vote_average || 0) * 0.1;
      if (item._from.length < 3) item._from.push(s.title);
    }
  }
  let ranked = [...pool.values()].sort((a, b) => b._score - a._score);
  if (useLevel >= 3 && cfg.ai.provider !== 'none') {
    try { ranked = await aiRerank(ranked.slice(0, 40), seeds); } catch (e) { console.warn('[ai] rerank failed:', e.message); }
  }
  const rows = [];
  rows.push({ title: 'Picked for you', items: normalize(ranked.slice(0, 20)) });

  // "Because you watched [Title]" rows — built from the feeds already fetched
  // above, so this costs zero extra requests.
  for (const { seed: s, recs, sims } of feeds) {
    const combined = [...recs];
    const seenIds = new Set(recs.map((c) => c.id));
    for (const item of sims) {
      if (!seenIds.has(item.id)) { seenIds.add(item.id); combined.push(item); }
    }
    const list = combined.filter((c) => !owned.has(s.media + ':' + String(c.id)));
    const items = normalize(list.slice(0, 20), s.media);
    if (items.length >= 3) {
      rows.push({ title: `Because you watched ${prettify(s.title)}`, items });
    }
  }

  try {
    const t = trendingRes || { results: [] };
    const items = (t.results || []).filter((c) => !owned.has((c.media_type || 'movie') + ':' + String(c.id)))
      .map((c) => ({ ...c, _score: (c.genre_ids || []).reduce((a, g) => a + (affinity.get(g) || 0), 0) }))
      .sort((a, b) => b._score - a._score);
    rows.push({ title: 'Trending, tuned to your taste', items: normalize(items.slice(0, 20)) });
  } catch { /* ignore */ }

  return { cold: false, seeds: seeds.map((s) => prettify(s.title)), rows };
}

// Public entry — cached 24h per user; force bypasses cache.
export async function recommend({ userId, level, force } = {}) {
  const key = `recs:${userId || 'default'}:${level || load().recommendation.level}`;
  return cached(key, TTL_DAY, () => compute({ userId, level }), !!force);
}

async function safeOwned() {
  const { services } = load();
  if (services.plex?.url && services.plex?.token) { try { return await plex.libraryTmdbIds(); } catch { return new Set(); } }
  return new Set();
}

function prettify(s) { return String(s).replace(/\b\w/g, (c) => c.toUpperCase()); }

function normalize(list, forceMedia) {
  return (list || []).map((c) => ({
    id: c.id, media: forceMedia || c.media || c.media_type || (c.title ? 'movie' : 'tv'),
    title: c.title || c.name, year: (c.release_date || c.first_air_date || '').slice(0, 4),
    overview: c.overview, poster: tmdb.img(c.poster_path, 'w500'), backdrop: tmdb.img(c.backdrop_path, 'w1280'),
    rating: c.vote_average, why: c._why || (c._from ? `Because you watched ${c._from.map(prettify).join(', ')}` : undefined)
  }));
}

export default { recommend, getSeeds, getHistory, genreAffinity, getUserGenreAffinity };

// The recommendation brain. Results are cached per-user for 24h so Home stays
// fast and refreshes daily; ?refresh=1 recomputes immediately.
import { load } from '../config.js';
import tmdb from '../services/tmdb.js';
import tautulli from '../services/tautulli.js';
import plex from '../services/plex.js';
import { aiRerank } from './ai.js';
import { cached, TTL_DAY } from '../lib/cache.js';

async function getHistory(userId) {
  const { services, recommendation } = load();
  const depth = recommendation.historyDepth || 300;
  if (services.tautulli?.url && services.tautulli?.apikey) return { source: 'tautulli', items: await tautulli.history(depth, userId) };
  if (services.plex?.url && services.plex?.token) return { source: 'plex', items: await plex.history(depth) };
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

async function getSeeds(userId, max = 15) {
  const { items } = await getHistory(userId);
  const profile = buildTasteProfile(items);
  const top = [...profile.entries()].sort((a, b) => b[1] - a[1]).slice(0, max);
  const typeByKey = new Map(items.map((h) => [(h.grandparentTitle || h.title || '').toLowerCase().trim(), h.type]));
  const seeds = [];
  for (const [key, weight] of top) { const r = await resolve(key, typeByKey.get(key)); if (r) seeds.push({ ...r, title: key, weight }); }
  return seeds;
}

function genreAffinity(seeds) {
  const affinity = new Map();
  for (const s of seeds) for (const g of s.genre_ids || []) affinity.set(g, (affinity.get(g) || 0) + s.weight);
  return affinity;
}

async function compute({ userId, level }) {
  const cfg = load();
  const useLevel = level || cfg.recommendation.level || 1;
  const seeds = await getSeeds(userId);
  if (!seeds.length) {
    const t = await tmdb.trending('all', 'week');
    return { cold: true, rows: [{ title: 'Trending this week', items: normalize(t.results) }] };
  }
  const affinity = genreAffinity(seeds);
  const hasKids = affinity.has(10762) || affinity.has(10751);
  const hasMusic = affinity.has(10402);
  const owned = await safeOwned();
  const pool = new Map();
  for (const s of seeds.slice(0, 10)) {
    for (const fn of ['recommendations', 'similar']) {
      try {
        const res = await tmdb[fn](s.media, s.id);
        for (const c of res.results || []) {
          const id = `${s.media}:${c.id}`;
          if (owned.has(String(c.id))) continue;
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
      } catch { /* skip */ }
    }
  }
  let ranked = [...pool.values()].sort((a, b) => b._score - a._score);
  if (useLevel >= 3 && cfg.ai.provider !== 'none') {
    try { ranked = await aiRerank(ranked.slice(0, 40), seeds); } catch (e) { console.warn('[ai] rerank failed:', e.message); }
  }
  const rows = [];
  rows.push({ title: 'Picked for you', items: normalize(ranked.slice(0, 20)) });
  for (const s of seeds.slice(0, 3)) {
    try {
      const res = await tmdb.recommendations(s.media, s.id);
      const items = normalize((res.results || []).filter((c) => !owned.has(String(c.id))).slice(0, 20), s.media);
      if (items.length) rows.push({ title: `Because you watched ${prettify(s.title)}`, items });
    } catch { /* ignore */ }
  }
  try {
    const t = await tmdb.trending('all', 'week');
    const items = (t.results || []).filter((c) => !owned.has(String(c.id)))
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

export default { recommend, getSeeds };

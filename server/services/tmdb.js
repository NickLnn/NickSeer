// TMDB — discovery engine. Peacock added; provider rows fall back to TV when the
// movie catalog is empty. IMDb Top 250 for TV now uses a QUALITY-GATED discover
// query (real acclaimed series) instead of raw top_rated (which was vote-skewed).
import { load } from '../config.js';

const BASE = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';

function auth() { return load().tmdb; }
function today() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); }
function daysAhead(n) { return new Date(Date.now() + n * 86400000).toISOString().slice(0, 10); }

async function tmdb(pathname, params = {}) {
  const t = auth();
  const url = new URL(BASE + pathname);
  const headers = { accept: 'application/json' };
  if (t.readToken) headers.Authorization = `Bearer ${t.readToken}`;
  else if (t.apiKey) url.searchParams.set('api_key', t.apiKey);
  else throw new Error('TMDB not configured');
  url.searchParams.set('language', t.language || 'en-US');
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, v);
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`TMDB ${res.status}: ${await res.text()}`);
  return res.json();
}

export function img(p, s = 'w500') { return p ? `${IMG}/${s}${p}` : null; }
export async function test() { const d = await tmdb('/configuration'); return { ok: true, images: !!d.images }; }

export const trending = (media = 'all', window = 'week') => tmdb(`/trending/${media}/${window}`);
export const popular = (media = 'movie') => tmdb(`/${media}/popular`);
export const topRated = (media = 'movie') => tmdb(`/${media}/top_rated`);
export const details = (media, id) => tmdb(`/${media}/${id}`, { append_to_response: 'videos,credits,recommendations,similar,watch/providers,external_ids' });
export const recommendations = (media, id) => tmdb(`/${media}/${id}/recommendations`);
export const similar = (media, id) => tmdb(`/${media}/${id}/similar`);
export const videos = (media, id) => tmdb(`/${media}/${id}/videos`);
export const search = (query, media = 'multi') => tmdb(`/search/${media}`, { query });
export const find = (externalId, source = 'tvdb_id') => tmdb(`/find/${externalId}`, { external_source: source });
export const discover = (media, params) => tmdb(`/discover/${media}`, params);
export const genres = (media) => tmdb(`/genre/${media}/list`);
export const externalIds = (media, id) => tmdb(`/${media}/${id}/external_ids`);
export const person = (id) => tmdb(`/person/${id}`, { append_to_response: 'combined_credits,external_ids' });
export const movieBrief = (id) => tmdb(`/movie/${id}`);
export const watchProviders = (media, region) => tmdb(`/watch/providers/${media}`, { watch_region: region || 'US' });

export async function trailerKey(media, id) {
  const { results = [] } = await videos(media, id);
  const yt = results.filter((v) => v.site === 'YouTube');
  const pick = yt.find((v) => v.type === 'Trailer' && v.official) || yt.find((v) => v.type === 'Trailer') || yt.find((v) => v.type === 'Teaser') || yt[0];
  return pick ? pick.key : null;
}

async function fetchList(listId, pages = 13) {
  const all = [];
  for (let p = 1; p <= pages; p++) { const data = await tmdb(`/list/${listId}`, { page: p }); const items = data.items || data.results || []; if (!items.length) break; all.push(...items); if (all.length >= 250) break; }
  return all.slice(0, 250);
}

// Quality-gated "greatest series" via discover: high vote_count so only widely-
// seen shows qualify, sorted by rating. This mirrors IMDb-style acclaim far
// better than raw top_rated (which surfaces niche BL/K-dramas with few votes).
async function acclaimedTv(limit = 250) {
  const all = [];
  const seen = new Set();
  for (let page = 1; page <= 8 && all.length < limit; page++) {
    const d = await discover('tv', { sort_by: 'vote_average.desc', 'vote_count.gte': 1500, 'vote_average.gte': 7.5, page });
    const rows = d.results || [];
    if (!rows.length) break;
    for (const r of rows) { if (seen.has(r.id)) continue; seen.add(r.id); all.push(r); }
  }
  return all.slice(0, limit);
}

export async function imdbTop(media = 'movie', limit = 250) {
  const { imdb } = load();
  const listId = media === 'tv' ? imdb.tvListId : imdb.movieListId;
  if (listId) { try { const items = (await fetchList(listId)).filter((i) => { const mt = i.media_type || (i.title ? 'movie' : 'tv'); return media === 'tv' ? mt === 'tv' : mt === 'movie'; }); if (items.length) return { source: 'imdb-list', items: items.slice(0, limit) }; } catch { /* fall */ } }
  if (media === 'tv') { try { const items = await acclaimedTv(limit); if (items.length) return { source: 'acclaimed-tv', items }; } catch { /* fall */ } }
  const tr = await topRated(media);
  return { source: 'tmdb-top-rated', items: (tr.results || []).slice(0, limit) };
}

const providerCache = new Map();
async function providerList(media, region) {
  const key = `${media}:${region}`;
  if (providerCache.has(key)) return providerCache.get(key);
  const data = await watchProviders(media, region);
  const list = (data.results || []).map((p) => ({ id: p.provider_id, name: p.provider_name }));
  providerCache.set(key, list);
  return list;
}
const RAW_STREAMING = [
  { key: 'netflix',   label: 'Netflix',     aliases: ['Netflix'] },
  { key: 'disney',    label: 'Disney+',     aliases: ['Disney Plus', 'Disney+'] },
  { key: 'amazon',    label: 'Prime Video', aliases: ['Amazon Prime Video', 'Prime Video'] },
  { key: 'max',       label: 'HBO Max',     aliases: ['HBO Max', 'Max'] },
  { key: 'apple',     label: 'Apple TV+',   aliases: ['Apple TV+', 'Apple TV Plus', 'Apple TV'] },
  { key: 'paramount', label: 'Paramount+',  aliases: ['Paramount Plus', 'Paramount+'] },
  { key: 'peacock',   label: 'Peacock',     aliases: ['Peacock Premium Plus', 'Peacock Premium', 'Peacock'] }
];
export const STREAMING = Array.from(new Map(RAW_STREAMING.map((s) => [s.key, s])).values());
export async function providerId(providerKey, media = 'movie') {
  const { region } = auth();
  const svc = STREAMING.find((s) => s.key === providerKey);
  if (!svc) throw new Error('unknown provider');
  const list = await providerList(media, region || 'US');
  // For Apple, prioritize flatrate Apple TV+ subscription (ID 350) over store channel (ID 2)
  if (providerKey === 'apple') {
    const plus = list.find((p) => p.id === 350) || list.find((p) => /apple tv\s*(\+|plus)/i.test(p.name));
    if (plus) return plus.id;
  }
  for (const alias of svc.aliases) { const hit = list.find((p) => p.name.toLowerCase() === alias.toLowerCase()) || list.find((p) => p.name.toLowerCase().includes(alias.toLowerCase())); if (hit) return hit.id; }
  return null;
}
async function providerDiscover(providerKey, media, params) {
  const { region } = auth();
  const id = await providerId(providerKey, media);
  if (!id) return { items: [], usedMedia: media };
  const data = await discover(media, { watch_region: region || 'US', with_watch_providers: id, ...params });
  return { items: data.results || [], usedMedia: media };
}
export async function topByProvider(providerKey, media = 'movie', limit = 10, allowFallback = false) {
  const svc = STREAMING.find((s) => s.key === providerKey);
  if (!svc) return { provider: providerKey, items: [], media };

  // Prioritize recent, contemporary hits (rolling 3-4 year window) to reflect active platform streaming
  const dateField = media === 'tv' ? 'first_air_date' : 'primary_release_date';
  const recentDays = media === 'tv' ? 365 * 4 : 365 * 3;
  const recentParams = {
    sort_by: 'popularity.desc',
    'vote_count.gte': 8,
    page: 1,
    [`${dateField}.gte`]: daysAgo(recentDays),
    [`${dateField}.lte`]: today()
  };

  let r = await providerDiscover(providerKey, media, recentParams);

  // If recent releases return fewer than requested limit, supplement with top catalog titles
  if ((r.items || []).length < limit) {
    const fallbackParams = { sort_by: 'popularity.desc', 'vote_count.gte': 15, page: 1 };
    const catalog = await providerDiscover(providerKey, media, fallbackParams);
    const seen = new Set((r.items || []).map((it) => it.id));
    const combined = [...(r.items || [])];
    for (const it of catalog.items || []) {
      if (!seen.has(it.id)) {
        seen.add(it.id);
        combined.push(it);
        if (combined.length >= limit) break;
      }
    }
    r = { items: combined, usedMedia: media };
  }

  if (!r.items.length && allowFallback && media === 'movie') {
    r = await providerDiscover(providerKey, 'tv', { sort_by: 'popularity.desc', 'vote_count.gte': 10, page: 1 });
  }

  return { provider: svc.label, items: r.items.slice(0, limit), media: r.usedMedia };
}
export async function newlyAdded(providerKey, media = 'movie', limit = 20) {
  const svc = STREAMING.find((s) => s.key === providerKey);
  const mk = (m) => { const dk = m === 'tv' ? 'first_air_date' : 'primary_release_date'; const p = { with_watch_monetization_types: 'flatrate', sort_by: `${dk}.desc`, 'vote_count.gte': 2, page: 1 }; p[`${dk}.lte`] = today(); return p; };
  let r = await providerDiscover(providerKey, media, mk(media));
  if (!r.items.length && media === 'movie') r = await providerDiscover(providerKey, 'tv', mk('tv'));
  return { provider: svc.label, items: r.items.slice(0, limit), media: r.usedMedia };
}
export async function comingSoonProvider(providerKey, media = 'movie', limit = 20) {
  const svc = STREAMING.find((s) => s.key === providerKey);
  const strict = (m) => { const dk = m === 'tv' ? 'first_air_date' : 'primary_release_date'; const p = { sort_by: `${dk}.asc`, page: 1 }; p[`${dk}.gte`] = today(); return p; };
  const wide = (m) => { const dk = m === 'tv' ? 'first_air_date' : 'primary_release_date'; const p = { sort_by: `${dk}.desc`, page: 1 }; p[`${dk}.gte`] = daysAgo(45); p[`${dk}.lte`] = daysAhead(365); return p; };
  const popular = { sort_by: 'popularity.desc', 'vote_count.gte': 5, page: 1 };
  const tryMedia = async (m) => { let r = await providerDiscover(providerKey, m, strict(m)); if (!r.items.length) r = await providerDiscover(providerKey, m, wide(m)); if (!r.items.length) r = await providerDiscover(providerKey, m, popular); return r; };
  let r = await tryMedia(media);
  if (!r.items.length && media === 'movie') r = await tryMedia('tv');
  return { provider: svc.label, items: r.items.slice(0, limit), media: r.usedMedia };
}

export async function inCinemasTop(limit = 10) {
  const { region } = auth();
  const data = await discover('movie', { region: region || 'US', with_release_type: '2|3', 'primary_release_date.gte': daysAgo(49), 'primary_release_date.lte': today(), sort_by: 'revenue.desc', 'vote_count.gte': 10, page: 1 });
  return { region, items: (data.results || []).slice(0, limit) };
}
export async function comingSoonCinema(media = 'movie', limit = 24) {
  const { region } = auth();
  if (media === 'tv') { const d = await discover('tv', { 'first_air_date.gte': today(), sort_by: 'popularity.desc', page: 1 }); return { items: (d.results || []).slice(0, limit) }; }
  const d = await discover('movie', { region: region || 'US', with_release_type: '3|2', 'primary_release_date.gte': today(), sort_by: 'popularity.desc', page: 1 });
  return { items: (d.results || []).slice(0, limit) };
}

export default { test, trending, popular, topRated, details, recommendations, similar, videos, search, find, discover, genres, externalIds, person, movieBrief, watchProviders, trailerKey, img, imdbTop, topByProvider, providerId, newlyAdded, inCinemasTop, comingSoonCinema, comingSoonProvider, STREAMING };

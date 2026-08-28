// omdb.js — Multi-source IMDb rating resolver with automatic fallback.
// Tier 1: OMDb API (if a valid API key is configured).
// Tier 2: Cinemeta / Stremio Open Metadata (Free, fast, no API key needed, official IMDb ratings).
import { load } from '../config.js';
import { cached, TTL_DAY } from '../lib/cache.js';

const CINEMETA_BASE = 'https://v3-cinemeta.strem.io/meta';

function omdbKey() {
  return load().omdb?.apiKey || '';
}

async function fetchWithTimeout(url, opts = {}, ms = 5000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

async function callOmdb(params) {
  const k = omdbKey();
  if (!k) return null;
  const url = new URL('https://www.omdbapi.com/');
  url.searchParams.set('apikey', k);
  for (const [key, v] of Object.entries(params)) url.searchParams.set(key, v);
  const res = await fetchWithTimeout(url);
  if (!res.ok) return null;
  const json = await res.json();
  if (json.Response === 'False') return null;
  return json;
}

// Cinemeta fallback: fetches exact IMDb rating for movies & TV series
async function callCinemeta(imdbId, media = 'movie') {
  const kind = (media === 'tv' || media === 'show') ? 'series' : 'movie';
  try {
    const res = await fetchWithTimeout(`${CINEMETA_BASE}/${kind}/${imdbId}.json`);
    if (!res.ok) {
      // Try alternate media kind if not found
      const altKind = kind === 'movie' ? 'series' : 'movie';
      const altRes = await fetchWithTimeout(`${CINEMETA_BASE}/${altKind}/${imdbId}.json`);
      if (!altRes.ok) return null;
      const altData = await altRes.json();
      return altData?.meta || null;
    }
    const data = await res.json();
    return data?.meta || null;
  } catch {
    return null;
  }
}

export async function test() {
  const k = omdbKey();
  if (k) {
    try {
      const d = await callOmdb({ i: 'tt0111161' });
      if (d && d.imdbRating && d.imdbRating !== 'N/A') {
        return { ok: true, provider: 'OMDb', sample: d.Title, imdb: d.imdbRating };
      }
    } catch { /* fallback */ }
  }
  
  // Test Cinemeta fallback
  const c = await callCinemeta('tt0111161', 'movie');
  if (c && c.imdbRating) {
    return { ok: true, provider: 'Cinemeta (Free IMDb)', sample: c.name, imdb: c.imdbRating };
  }
  throw new Error('Could not reach ratings provider');
}

// Return { rating, votes, imdbId } for an IMDb ID, cached for 24h.
export async function byImdbId(imdbId, media = 'movie') {
  if (!imdbId) return null;
  return cached(`rating:${imdbId}`, TTL_DAY, async () => {
    // 1) Try OMDb if key configured
    if (omdbKey()) {
      try {
        const d = await callOmdb({ i: imdbId });
        if (d && d.imdbRating && d.imdbRating !== 'N/A') {
          const rating = Number(d.imdbRating);
          const votes = d.imdbVotes && d.imdbVotes !== 'N/A' ? d.imdbVotes : null;
          return { rating, votes, imdbId, source: 'omdb' };
        }
      } catch { /* fallback to cinemeta */ }
    }

    // 2) Free Cinemeta fallback (official IMDb rating)
    try {
      const c = await callCinemeta(imdbId, media);
      if (c && c.imdbRating) {
        const rating = Number(c.imdbRating);
        return { rating, votes: c.imdbVotes || null, imdbId, source: 'cinemeta' };
      }
    } catch { /* ignore */ }

    return null;
  });
}

export default { test, byImdbId };
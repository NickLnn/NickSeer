// OMDb — free API (omdbapi.com) that returns the real IMDb rating for a title
// looked up by its IMDb ID. Used to show the IMDb badge in the detail view.
// If no OMDb key is set, callers simply skip the IMDb rating gracefully.
import { load } from '../config.js';
import { cached, TTL_DAY } from '../lib/cache.js';

function key() {
  const k = load().omdb?.apiKey;
  if (!k) throw new Error('omdb not configured');
  return k;
}

async function call(params) {
  const url = new URL('https://www.omdbapi.com/');
  url.searchParams.set('apikey', key());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`omdb ${res.status}`);
  const json = await res.json();
  if (json.Response === 'False') throw new Error(json.Error || 'omdb error');
  return json;
}

export async function test() {
  // A tiny known lookup validates the key.
  const d = await call({ i: 'tt0111161' });
  return { ok: true, sample: d.Title, imdb: d.imdbRating };
}

// Return { rating, votes, imdbId } for an IMDb ID, cached for 24h.
export async function byImdbId(imdbId) {
  if (!imdbId) return null;
  return cached(`omdb:${imdbId}`, TTL_DAY, async () => {
    const d = await call({ i: imdbId });
    const rating = d.imdbRating && d.imdbRating !== 'N/A' ? Number(d.imdbRating) : null;
    return { rating, votes: d.imdbVotes && d.imdbVotes !== 'N/A' ? d.imdbVotes : null, imdbId };
  });
}

export default { test, byImdbId };

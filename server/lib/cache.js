// Simple in-memory TTL cache. Everything cacheable (TMDB rows, IMDb Top 250,
// recommendations, Plex library scan, OMDb ratings) is wrapped through here
// with a default 24h lifetime, so content auto-refreshes once a day.
// Passing { force: true } (from a ?refresh=1 request) busts the entry.

const store = new Map(); // key -> { value, expires }
const DAY = 24 * 60 * 60 * 1000;

export function get(key) {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expires) { store.delete(key); return undefined; }
  return hit.value;
}

export function set(key, value, ttl = DAY) {
  store.set(key, { value, expires: Date.now() + ttl });
  return value;
}

export function del(key) { store.delete(key); }
export function clear() { store.clear(); }

// Wrap an async producer with caching. If force is true, ignore any cached
// value and recompute (then store the fresh one).
export async function cached(key, ttl, producer, force = false) {
  if (!force) {
    const hit = get(key);
    if (hit !== undefined) return hit;
  }
  const value = await producer();
  return set(key, value, ttl);
}

export function ageInfo(key) {
  const hit = store.get(key);
  if (!hit) return null;
  return { expiresIn: Math.max(0, hit.expires - Date.now()) };
}

export const TTL_DAY = DAY;
export const TTL_HOUR = 60 * 60 * 1000;

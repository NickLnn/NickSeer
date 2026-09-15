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
export function delPrefix(prefix) {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}
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

// ---------------------------------------------------------------------------
// Disk persistence
// ---------------------------------------------------------------------------
// The store is in-memory, so every container restart used to be a cold start
// for every user — the full TMDB fan-out had to run again before Home, Movies
// or AI Suggestions could paint. Snapshotting to /config lets a restart come
// back warm.
//
// Only an EXPLICIT ALLOWLIST is written. Some cached values are not plain JSON:
// `arr:monitored:*` holds a Set and a Map, which JSON.stringify silently
// flattens to `{}`, which would quietly break "already requested" detection on
// reload. `plex:*` and `collections:*` are excluded for the same reason and
// because they are cheap to rebuild against a local server. Everything listed
// below is verified plain-JSON and expensive to recompute (upstream API calls).
const PERSIST_PREFIXES = [
  'recs:',            // recommendation engine, per user
  'rows:curated:',    // Home curated rows
  'streaming:',       // streaming provider rows
  'imdb-top:',        // IMDb Top 250
  'ai-suggest:',      // AI Suggestions
  'new:',             // newly added per provider
  'anticipated:',     // coming soon
  'boxoffice:',       // weekend box office
  'poster:',          // title -> poster/tmdbId lookups
  'imdbid:',          // tmdb id -> imdb id
  'rating:',          // OMDb ratings
  'movie:financials:',
  'brand-logos',
  'public:trending-wallpaper:'
];

const persistable = (key) => PERSIST_PREFIXES.some((p) => key.startsWith(p));

// Returns a JSON string of every live, allowlisted entry, or null if empty.
export function snapshot() {
  const now = Date.now();
  const out = [];
  for (const [key, hit] of store) {
    if (!persistable(key)) continue;
    if (now > hit.expires) continue;
    out.push([key, hit.expires, hit.value]);
  }
  if (!out.length) return null;
  return JSON.stringify({ v: 1, saved: now, entries: out });
}

// Load a snapshot produced by snapshot(). Expired entries are dropped, and an
// existing in-memory entry always wins (it is newer than anything on disk).
// Returns the number of entries restored.
export function restore(json) {
  let parsed;
  try { parsed = JSON.parse(json); } catch { return 0; }
  if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.entries)) return 0;
  const now = Date.now();
  let n = 0;
  for (const entry of parsed.entries) {
    if (!Array.isArray(entry) || entry.length !== 3) continue;
    const [key, expires, value] = entry;
    if (typeof key !== 'string' || typeof expires !== 'number') continue;
    if (now > expires) continue;
    if (!persistable(key)) continue;
    if (store.has(key)) continue;
    store.set(key, { value, expires });
    n++;
  }
  return n;
}

export function size() { return store.size; }

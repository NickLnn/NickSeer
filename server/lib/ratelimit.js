// Tiny in-memory sliding-window rate limiter.
//
// The only limiter in the app was the login brute-force guard in routes/auth.js;
// every other endpoint was unlimited. Two of those matter:
//
//   - `?refresh=1` on /api/discover/* bypasses EVERY cache layer and triggers
//     the full upstream fan-out. Looped, it exhausts the TMDB quota and the app
//     breaks for everyone.
//   - POST /api/request drives real writes into Radarr/Sonarr.
//
// Single process, so a Map is sufficient. Buckets are pruned lazily on read and
// on a slow sweep, so an unbounded set of keys cannot grow the heap forever.

const buckets = new Map(); // key -> number[] (timestamps, ascending)

/**
 * Record an attempt and report whether it is allowed.
 * @param {string} key    caller identity, e.g. `force:alice`
 * @param {number} max    permitted hits per window
 * @param {number} windowMs sliding window size
 * @returns {boolean} true if allowed (and counted), false if over the limit
 */
export function allow(key, max, windowMs) {
  const now = Date.now();
  const cutoff = now - windowMs;
  const hits = (buckets.get(key) || []).filter((t) => t > cutoff);
  if (hits.length >= max) {
    buckets.set(key, hits); // keep the pruned list; do NOT count a rejected hit
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}

/** Seconds until the caller's next attempt would be permitted; 0 if allowed now. */
export function retryAfter(key, max, windowMs) {
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((t) => t > now - windowMs);
  if (hits.length < max) return 0;
  return Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000));
}

export function reset(key) { buckets.delete(key); }

// Drop buckets whose newest hit is older than an hour.
setInterval(() => {
  const cutoff = Date.now() - 3600000;
  for (const [k, hits] of buckets) {
    if (!hits.length || hits[hits.length - 1] < cutoff) buckets.delete(k);
  }
}, 600000).unref();

export default { allow, retryAfter, reset };

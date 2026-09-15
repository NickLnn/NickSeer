// Lets any route ask for a cache re-warm without importing index.js (which
// would be a circular import, since index.js mounts the routers).
//
// Saving Settings calls clearCache(), which empties the whole TTL store. Before
// this, nothing re-populated it: the boot pre-warm had already run, so the
// cache stayed cold until real user traffic slowly refilled it — meaning the
// next person to open Home paid the full upstream fan-out.

let warmFn = null;
let lastRun = 0;

// index.js registers its prewarm() here once at boot.
export function registerWarm(fn) { warmFn = fn; }

// Fire-and-forget. Rate limited because prewarm() rebuilds Home for every user,
// and an admin saving Settings several times in a row must not queue up several
// full fan-outs against TMDB.
const MIN_INTERVAL_MS = 5 * 60 * 1000;

export function triggerWarm(reason) {
  if (!warmFn) return false;
  const now = Date.now();
  if (now - lastRun < MIN_INTERVAL_MS) return false;
  lastRun = now;
  Promise.resolve()
    .then(() => warmFn(reason))
    .catch((e) => console.warn(`[warm] ${reason} re-warm failed:`, e.message));
  return true;
}

export default { registerWarm, triggerWarm };

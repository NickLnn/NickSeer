// NickSeer server — HARDENED boot. Every optional router is imported defensively
// so a missing file can NEVER crash the server (which was showing a blank app
// via a cached page while the container restart-looped).
//
// CHANGE IN THIS PATCH: mounts the new (additive) auth-roles.js router, which
// adds POST /api/auth/users/role so an admin can change an existing user's
// role later (Admin ⇄ Requester) — needed for "profiles are users, I decide
// who is requester / who is admin".
import express from './mini.js';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { load, update, CONFIG_DIR } from './config.js';
import { snapshot, restore } from './lib/cache.js';
import { registerWarm } from './lib/warm.js';
import authSvc from './services/auth.js';
import { startMonitoring } from './services/monitor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5056;

// ---------------------------------------------------------------------------
// Shared secrets for the machine-to-machine surfaces
// ---------------------------------------------------------------------------
// /api/v1/* (Overseerr emulation, used by Requestrr) and /api/v1/webhook
// (Radarr/Sonarr "on import") were previously fully unauthenticated. Generate
// a secret on first boot and print it once so it can be pasted into those
// tools. To debug a client that will not authenticate, set REQUESTRR_DEBUG=1
// and read requestrr_debug.log — there is deliberately no flag to disable the
// check, since that would silently reopen both surfaces.
function ensureIntegrationSecrets() {
  const c = load();
  const patch = {};
  if (!c.api?.key) patch.api = { key: crypto.randomBytes(24).toString('base64url') };
  if (!c.webhook?.secret) patch.webhook = { secret: crypto.randomBytes(24).toString('base64url') };
  if (Object.keys(patch).length) update(patch);

  const fresh = load();
  if (Object.keys(patch).length) {
    console.log('');
    console.log('  ┌────────────────────────────────────────────────────────────');
    console.log('  │ NickSeer generated new integration secrets.');
    console.log('  │');
    console.log('  │ Requestrr / Overseerr clients — send this header:');
    console.log(`  │   X-Api-Key: ${fresh.api.key}`);
    console.log('  │');
    console.log('  │ Radarr + Sonarr "On Import" webhook URL — append:');
    console.log(`  │   ?token=${fresh.webhook.secret}`);
    console.log('  │');
    console.log('  │ Both are stored in settings.json and shown masked in the UI.');
    console.log('  └────────────────────────────────────────────────────────────');
    console.log('');
  }
  return fresh;
}

app.use(express.json({ limit: '1mb' }));

// Safe dynamic import: returns the router or null (never throws).
async function tryRouter(rel) {
  try { const m = await import(rel); return m.default || null; }
  catch (e) { console.warn(`[boot] optional router ${rel} not loaded: ${e.message}`); return null; }
}

// Load all routers defensively (order preserved).
const authRouter = await tryRouter('./routes/auth.js');
const authRolesRouter = await tryRouter('./routes/auth-roles.js');
const publicRouter = await tryRouter('./routes/public.js');
const settingsRouter = await tryRouter('./routes/settings.js');
const discoverRouter = await tryRouter('./routes/discover.js');
const statusRouter = await tryRouter('./routes/status.js');
const requestRouter = await tryRouter('./routes/request.js');
const healthRouter = await tryRouter('./routes/health.js');
const requestsRouter = await tryRouter('./routes/requests.js');
const overseerrRouter = await tryRouter('./routes/overseerr.js');
const webhookRouter = await tryRouter('./routes/webhook.js');

// Hardened Auth Guard
app.use((req, res, next) => {
  const c = load();
  const p = req.path || '';
  if (!p.startsWith('/api')) return next();

  // ---- Overseerr-compatible surface -------------------------------------
  // Exempt from the Bearer-token guard because these endpoints are consumed
  // by machines (Requestrr), not browsers. They are NOT unauthenticated:
  // routes/overseerr.js enforces X-Api-Key on every request, and
  // routes/webhook.js enforces its own ?token= shared secret.
  if (p.startsWith('/api/v1')) return next();


  // ---- Internal cache pre-warm ------------------------------------------
  // prewarm() calls the discovery routes over loopback so it populates the
  // exact cache keys the real routes read. Accept it only from 127.0.0.1 AND
  // with the correct API key, so it is not reachable through the tunnel.
  if (req.headers['x-nickseer-warm'] === '1') {
    const fromLoopback = req.ip === '127.0.0.1' || req.ip === '::1';
    const expected = c.api?.key || '';
    const supplied = String(req.headers['x-api-key'] || '');
    if (fromLoopback && expected && supplied.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
      return next();
    }
  }

  if (!c.auth?.enabled) return next();
  if (p === '/api/health') return next();
  if (p.startsWith('/api/auth/login') || p.startsWith('/api/auth/status') || p.startsWith('/api/auth/profiles') || p.startsWith('/api/auth/plex')) return next();
  if (p.startsWith('/api/public')) return next();

  const tok = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  const u = authSvc.verifyToken(tok);
  if (!u) return res.status(401).json({ error: 'auth required' });

  // Admin-only endpoints protection
  if (p.startsWith('/api/settings') && p !== '/api/settings/status' && u.role !== 'admin') return res.status(403).json({ error: 'admin access required' });
  if (p.startsWith('/api/health-detail') && u.role !== 'admin') return res.status(403).json({ error: 'admin access required' });
  if (p.startsWith('/api/discover/live') && u.role !== 'admin') return res.status(403).json({ error: 'admin access required' });
  if ((p === '/api/auth/users' || p === '/api/auth/users/role' || p === '/api/auth/users/delete') && u.role !== 'admin') {
    return res.status(403).json({ error: 'admin access required' });
  }

  req.user = u;
  next();
});

if (authRouter) app.use('/api/auth', authRouter);
if (authRolesRouter) app.use('/api/auth', authRolesRouter);
if (publicRouter) app.use('/api/public', publicRouter);
if (settingsRouter) app.use('/api/settings', settingsRouter);
if (discoverRouter) app.use('/api/discover', discoverRouter);
if (statusRouter) app.use('/api/status', statusRouter);
if (requestRouter) app.use('/api/request', requestRouter);
if (healthRouter) app.use('/api/health-detail', healthRouter);
if (requestsRouter) app.use('/api/requests', requestsRouter);
if (webhookRouter) app.use('/api/v1/webhook', webhookRouter);
if (overseerrRouter) app.use('/api/v1', overseerrRouter);

app.get('/api/health', (req, res) => { const c = load(); res.json({ ok: true, app: c.app.name, configured: !!c.configured }); });

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

// Warm the cache keys the UI actually reads, in parallel, never throwing.
async function prewarm(reason) {
  const t0 = Date.now();
  const base = `http://127.0.0.1:${PORT}`;
  const key = load().api?.key || '';
  const tasks = [
    ['plex.libraryMap', async () => {
      const m = await import('./services/plex.js');
      const svc = m.default || m;
      return svc.libraryMap ? svc.libraryMap() : null;
    }],
    ['discover/rows:movie', () => fetch(`${base}/api/discover/rows?media=movie`, { headers: { 'x-api-key': key, 'x-nickseer-warm': '1' } })],
    ['discover/rows:tv', () => fetch(`${base}/api/discover/rows?media=tv`, { headers: { 'x-api-key': key, 'x-nickseer-warm': '1' } })],
    ['discover/streaming:movie', () => fetch(`${base}/api/discover/streaming?media=movie`, { headers: { 'x-api-key': key, 'x-nickseer-warm': '1' } })],
    // Home reads the recommendation engine, which was the ONE cache key the
    // warm-up never populated — so the first visitor of the day still waited
    // out the full per-user fan-out while the curated rows were already warm.
    // Warmed per user (the cache key is per user), one at a time so we don't
    // hammer TMDB with 12 parallel fan-outs.
    ['discover/home:all-users', async () => {
      const m = await import('./recommend/engine.js');
      const engine = m.default || m;
      const users = [null, ...authSvc.listUsers().map((u) => u.username)].slice(0, 13);
      for (const userId of users) {
        try { await engine.recommend({ userId: userId || undefined }); }
        catch (e) { console.warn(`[warm] home for ${userId || 'default'} failed: ${e.message}`); }
      }
      return users.length;
    }]
  ];
  const out = await Promise.allSettled(tasks.map(([, fn]) => fn()));
  out.forEach((r, i) => {
    if (r.status === 'rejected') console.warn(`[warm] ${tasks[i][0]} failed: ${r.reason?.message}`);
  });
  console.log(`[warm] ${reason} pre-warm finished in ${Date.now() - t0}ms`);
}

// ---------------------------------------------------------------------------
// Cache snapshot — survive restarts
// ---------------------------------------------------------------------------
// The TTL cache is in-memory, so before this every container restart was a
// cold start for every user. We snapshot the expensive, plain-JSON entries to
// /config and restore them at boot; the pre-warm below then finds most keys
// already populated and does almost no upstream work.
const CACHE_SNAPSHOT = path.join(CONFIG_DIR, 'cache.snapshot.json');

function loadCacheSnapshot() {
  try {
    if (!fs.existsSync(CACHE_SNAPSHOT)) return;
    const n = restore(fs.readFileSync(CACHE_SNAPSHOT, 'utf-8'));
    console.log(`[cache] restored ${n} entries from snapshot`);
  } catch (e) { console.warn('[cache] snapshot restore failed:', e.message); }
}

function saveCacheSnapshot(reason) {
  try {
    const json = snapshot();
    if (!json) return;
    // Atomic: write to a temp file then rename, so a crash mid-write cannot
    // leave a truncated snapshot that fails to parse on the next boot.
    const tmp = CACHE_SNAPSHOT + '.tmp';
    fs.writeFileSync(tmp, json, 'utf-8');
    fs.renameSync(tmp, CACHE_SNAPSHOT);
    console.log(`[cache] snapshot written (${reason}, ${Math.round(json.length / 1024)}KB)`);
  } catch (e) { console.warn('[cache] snapshot write failed:', e.message); }
}

registerWarm(prewarm);
loadCacheSnapshot();

ensureIntegrationSecrets();
const server = app.listen(PORT, () => {
  console.log(`NickSeer running on http://0.0.0.0:${PORT} (routers: ${[
  authRouter && 'auth', authRolesRouter && 'auth-roles', publicRouter && 'public', settingsRouter && 'settings', discoverRouter && 'discover',
  statusRouter && 'status', requestRouter && 'request', healthRouter && 'health-detail', requestsRouter && 'requests'
].filter(Boolean).join(', ')} )`);

  // Start background host health and thermal monitoring
  try {
    startMonitoring();
  } catch (e) {
    console.warn('[boot] background monitoring start failed:', e.message);
  }

  // Pre-warm caches in the background (non-blocking).
  //
  // The previous version warmed plex.libraryMap() and tmdb.trending() — but
  // the home view reads `rows:curated:*` (built by buildCuratedRows) and the
  // recommendation engine, so the first visitor still paid the full cold
  // fan-out. Warming through the loopback HTTP interface guarantees we
  // populate the exact cache keys the routes will later look up.
  setTimeout(() => { prewarm('boot').catch(() => {}); }, 1500);
  // Re-warm well inside the 24h TTL so it never expires under a live user.
  setInterval(() => { prewarm('scheduled').catch(() => {}); }, 6 * 60 * 60 * 1000).unref();
  // Snapshot every 30 min so an unclean kill (docker kill, power loss) still
  // comes back reasonably warm rather than losing the whole day's cache.
  setInterval(() => saveCacheSnapshot('interval'), 30 * 60 * 1000).unref();
  // And once shortly after the boot warm-up lands, so a fresh install gets a
  // snapshot without waiting half an hour.
  setTimeout(() => saveCacheSnapshot('post-warm'), 3 * 60 * 1000).unref();

    // 24-hour interval job to sync Plex
    setInterval(async () => {
      try {
        const plex = await import('./services/plex.js');
        const plexSvc = plex.default || plex;
        if (plexSvc.forceScan) {
          console.log('[sync] Running 24-hour scheduled Plex sync...');
          await plexSvc.forceScan();
          console.log('[sync] Scheduled Plex sync complete.');
        }
      } catch (e) { console.error('[sync] Scheduled Plex sync failed:', e.message); }
    }, 24 * 60 * 60 * 1000);

});
// Graceful shutdown handling for Docker / systemd
function handleShutdown(signal) {
  console.log(`[server] received ${signal}, closing gracefully...`);
  saveCacheSnapshot(signal);
  server.close(() => {
    console.log('[server] closed all active connections. Exiting.');
    process.exit(0);
  });
  // Force exit after 3s if hanging connections exist
  setTimeout(() => {
    console.warn('[server] forceful shutdown after timeout');
    process.exit(0);
  }, 3000).unref();
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
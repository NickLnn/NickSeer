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
import { fileURLToPath } from 'url';
import { load } from './config.js';
import authSvc from './services/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5056;

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

// Hardened Auth Guard
app.use((req, res, next) => {
  const c = load();
  const p = req.path || '';
  if (!c.auth?.enabled) return next();
  if (!p.startsWith('/api')) return next();
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

app.get('/api/health', (req, res) => { const c = load(); res.json({ ok: true, app: c.app.name, configured: !!c.configured }); });

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

load();
const server = app.listen(PORT, () => {
  console.log(`NickSeer running on http://0.0.0.0:${PORT} (routers: ${[
  authRouter && 'auth', authRolesRouter && 'auth-roles', publicRouter && 'public', settingsRouter && 'settings', discoverRouter && 'discover',
  statusRouter && 'status', requestRouter && 'request', healthRouter && 'health-detail', requestsRouter && 'requests'
].filter(Boolean).join(', ')} )`);

  // Pre-warm caches in the background (non-blocking)
  setTimeout(async () => {
    try {
      const plex = await import('./services/plex.js');
      const plexSvc = plex.default || plex;
      if (plexSvc.libraryMap) {
        console.log('[boot] pre-warming Plex library cache...');
        await plexSvc.libraryMap();
        console.log('[boot] Plex cache warm.');
      }
    } catch (e) { console.log('[boot] Plex pre-warm skipped:', e.message); }

    try {
      const tmdb = await import('./services/tmdb.js');
      const tmdbSvc = tmdb.default || tmdb;
      if (tmdbSvc.trending) {
        console.log('[boot] pre-warming TMDB trending...');
        await tmdbSvc.trending('movie', 'week');
        await tmdbSvc.trending('tv', 'week');
        console.log('[boot] TMDB trending cache warm.');
      }
    } catch (e) { console.log('[boot] TMDB pre-warm skipped:', e.message); }
  }, 2000);
});
// Graceful shutdown handling for Docker / systemd
function handleShutdown(signal) {
  console.log(`[server] received ${signal}, closing gracefully...`);
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
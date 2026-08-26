// NickSeer server — HARDENED boot. Every optional router is imported defensively
// so a missing file can NEVER crash the server (which was showing a blank app
// via a cached page while the container restart-looped).
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
const authRouter     = await tryRouter('./routes/auth.js');
const publicRouter   = await tryRouter('./routes/public.js');
const settingsRouter = await tryRouter('./routes/settings.js');
const discoverRouter = await tryRouter('./routes/discover.js');
const statusRouter   = await tryRouter('./routes/status.js');
const requestRouter  = await tryRouter('./routes/request.js');
const healthRouter   = await tryRouter('./routes/health.js');
const requestsRouter = await tryRouter('./routes/requests.js');

// Auth guard (only active when login is enabled).
app.use((req, res, next) => {
  const c = load();
  const p = req.path || '';
  if (!c.auth?.enabled) return next();
  if (!p.startsWith('/api')) return next();
  if (p === '/api/health') return next();
  if (p.startsWith('/api/auth')) return next();
  if (p.startsWith('/api/public')) return next();
  const tok = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  const u = authSvc.verifyToken(tok);
  if (!u) return res.status(401).json({ error: 'auth required' });
  if (p.startsWith('/api/settings') && req.method !== 'GET' && u.role !== 'admin') return res.status(403).json({ error: 'admin only' });
  req.user = u;
  next();
});

if (authRouter)     app.use('/api/auth', authRouter);
if (publicRouter)   app.use('/api/public', publicRouter);
if (settingsRouter) app.use('/api/settings', settingsRouter);
if (discoverRouter) app.use('/api/discover', discoverRouter);
if (statusRouter)   app.use('/api/status', statusRouter);
if (requestRouter)  app.use('/api/request', requestRouter);
if (healthRouter)   app.use('/api/health-detail', healthRouter);
if (requestsRouter) app.use('/api/requests', requestsRouter);

app.get('/api/health', (req, res) => { const c = load(); res.json({ ok: true, app: c.app.name, configured: !!c.configured }); });

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

load();
app.listen(PORT, () => console.log(`NickSeer running on http://0.0.0.0:${PORT} (routers: ${[
  authRouter && 'auth', publicRouter && 'public', settingsRouter && 'settings', discoverRouter && 'discover',
  statusRouter && 'status', requestRouter && 'request', healthRouter && 'health-detail', requestsRouter && 'requests'
].filter(Boolean).join(', ')})`));

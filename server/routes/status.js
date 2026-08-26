// Downloads & Health API + a Plex library sub-API (detail + force sync).
// Self-contained: imports only modules that already exist, so it won't crash
// even if optional auth features aren't installed.
import express from '../mini.js';
import sabnzbd from '../services/sabnzbd.js';
import arr from '../services/arr.js';
import gluetun from '../services/gluetun.js';
import plex from '../services/plex.js';
import { load } from '../config.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const c = load();
  const out = {};
  const jobs = [];
  if (c.services.sabnzbd?.url) jobs.push(sabnzbd.queue().then((q) => (out.sabnzbd = q)).catch((e) => (out.sabnzbd = { error: e.message })));
  if (c.services.gluetun?.url) jobs.push(gluetun.status().then((s) => (out.gluetun = s)).catch((e) => (out.gluetun = { error: e.message })));
  if (c.services.radarr?.url) jobs.push(arr.queue('radarr').then((q) => (out.radarr = summarizeArr(q))).catch((e) => (out.radarr = { error: e.message })));
  if (c.services.sonarr?.url) jobs.push(arr.queue('sonarr').then((q) => (out.sonarr = summarizeArr(q))).catch((e) => (out.sonarr = { error: e.message })));
  await Promise.all(jobs);
  res.json(out);
});

// Plex library detail (server name, per-section counts + matched %). Cached 24h.
router.get('/plex', async (req, res) => {
  const c = load();
  if (!c.services.plex?.url || !c.services.plex?.token) return res.status(200).json({ error: 'plex not configured' });
  try { res.json(await plex.libraryDetail(req.query.refresh === '1')); }
  catch (e) { res.status(200).json({ error: e.message }); }
});

// Force a Plex-side scan of all movie/show sections, then re-read fresh.
router.post('/plex/sync', async (req, res) => {
  const c = load();
  if (!c.services.plex?.url || !c.services.plex?.token) return res.status(200).json({ ok: false, error: 'plex not configured' });
  try { res.json(await plex.forceScan()); }
  catch (e) { res.status(200).json({ ok: false, error: e.message }); }
});

function summarizeArr(q) {
  const records = q.records || [];
  return { count: records.length, items: records.slice(0, 25).map((r) => ({ title: r.title || r.movie?.title || r.series?.title, status: r.status, progress: r.sizeleft != null && r.size ? Math.round((1 - r.sizeleft / r.size) * 100) : null, timeLeft: r.timeleft })) };
}

export default router;

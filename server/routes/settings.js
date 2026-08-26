// Settings + connection-testing endpoints. Powers the first-run wizard and
// the Settings page where the user enters THEIR keys. Also exposes a refresh
// endpoint to clear all caches on demand.
import express from '../mini.js';
import { load, update, redacted } from '../config.js';
import tmdb from '../services/tmdb.js';
import omdb from '../services/omdb.js';
import arr from '../services/arr.js';
import plex from '../services/plex.js';
import tautulli from '../services/tautulli.js';
import sabnzbd from '../services/sabnzbd.js';
import gluetun from '../services/gluetun.js';
import { clear as clearCache } from '../lib/cache.js';

const router = express.Router();

router.get('/', (req, res) => res.json(redacted()));
router.get('/status', (req, res) => res.json({ configured: !!load().configured }));

router.post('/', (req, res) => {
  const incoming = stripMasked(req.body || {});
  incoming.configured = true;
  const saved = update(incoming);
  clearCache(); // settings changed → rebuild everything fresh
  res.json({ ok: true, configured: saved.configured });
});

// Manual "refresh everything now" (in addition to the automatic 24h refresh).
router.post('/refresh', (req, res) => { clearCache(); res.json({ ok: true }); });

router.post('/test/:service', async (req, res) => {
  const svc = req.params.service;
  const body = stripMasked(req.body || {});
  if (Object.keys(body).length) update(body);
  try {
    let result;
    switch (svc) {
      case 'tmdb':     result = await tmdb.test(); break;
      case 'omdb':     result = await omdb.test(); break;
      case 'plex':     result = await plex.test(); break;
      case 'tautulli': result = await tautulli.test(); break;
      case 'radarr':   result = await arr.test('radarr'); break;
      case 'sonarr':   result = await arr.test('sonarr'); break;
      case 'sabnzbd':  result = await sabnzbd.test(); break;
      case 'gluetun':  result = await gluetun.test(); break;
      default: return res.status(400).json({ ok: false, error: 'unknown service' });
    }
    res.json({ ok: true, ...result });
  } catch (e) { res.status(200).json({ ok: false, error: e.message }); }
});

router.get('/arr/:kind/profiles', async (req, res) => { try { res.json(await arr.qualityProfiles(req.params.kind)); } catch (e) { res.status(200).json({ error: e.message }); } });
router.get('/arr/:kind/rootfolders', async (req, res) => { try { res.json(await arr.rootFolders(req.params.kind)); } catch (e) { res.status(200).json({ error: e.message }); } });

router.get('/users', async (req, res) => {
  try { const users = await tautulli.users(); res.json((users || []).filter((u) => u.user_id).map((u) => ({ id: u.user_id, name: u.friendly_name || u.username, thumb: u.thumb }))); }
  catch (e) { res.status(200).json({ error: e.message }); }
});

function stripMasked(obj) {
  if (Array.isArray(obj)) return obj.map(stripMasked);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) { if (typeof v === 'string' && v.startsWith('••••')) continue; out[k] = stripMasked(v); }
    return out;
  }
  return obj;
}

export default router;

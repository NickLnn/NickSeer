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


router.get('/plex/servers', async (req, res) => {
  try {
    const curSettings = load();
    const token = req.query.token || curSettings.services?.plex?.token || '';
    const curUrl = req.query.url || curSettings.services?.plex?.url || '';
    const servers = [];

    if (token) {
      try {
        const pUrl = 'https://plex.tv/api/v2/resources?includeHttps=1&X-Plex-Token=' + encodeURIComponent(token);
        const tvRes = await fetch(pUrl, {
          headers: {
            'X-Plex-Token': token,
            'X-Plex-Client-Identifier': 'nickseer-app-nas',
            'X-Plex-Product': 'NickSeer',
            'X-Plex-Version': '1.0.0',
            'Accept': 'application/json'
          },
          signal: AbortSignal.timeout(6000)
        });
        if (tvRes.ok) {
          const data = await tvRes.json();
          const raw = (data || []).filter(d => (d.provides || '').includes('server'));
          for (const s of raw) {
            const conns = s.connections || [];
            const localConn = conns.find(c => c.local)?.uri;
            const remoteConn = conns.find(c => !c.local && !c.relay)?.uri || conns.find(c => c.relay)?.uri || conns[0]?.uri;
            
            // Intelligent URI selection:
            // For owned server: prioritize local configured URL or localConn.
            // For shared/invited servers: prioritize remoteConn (public IP / plex.direct domain).
            let best = '';
            if (s.owned) {
              best = curUrl || localConn || remoteConn || '';
            } else {
              best = remoteConn || localConn || '';
            }

            servers.push({
              name: s.name,
              owned: !!s.owned,
              clientIdentifier: s.clientIdentifier || '',
              accessToken: s.accessToken || token,
              connections: conns,
              bestUri: best
            });
          }
        }
      } catch { /* ignore plex.tv error */ }
    }

    if (!servers.length && curUrl) {
      servers.push({
        name: curSettings.services?.plex?.server || 'Primary Plex Server',
        owned: true,
        clientIdentifier: '',
        accessToken: token,
        connections: [{ uri: curUrl, local: true }],
        bestUri: curUrl
      });
    }

    res.json({ ok: true, servers });
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message, servers: [] });
  }
});

router.get('/plex/sections', async (req, res) => {
  try {
    const custom = {};
    if (req.query.url) custom.url = req.query.url;
    if (req.query.token && req.query.token !== '__CURRENT__' && !req.query.token.startsWith('••••')) {
      custom.token = req.query.token;
    } else {
      custom.token = load().services?.plex?.token || '';
    }
    const data = await plex.testWithSections(custom);
    res.json(data);
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message, sections: [] });
  }
});

router.get('/arr/:kind/profiles', async (req, res) => { try { const custom = { url: req.query.url, apikey: req.query.apikey }; res.json(await arr.qualityProfiles(req.params.kind, custom)); } catch (e) { res.status(200).json({ error: e.message }); } });
router.get('/arr/:kind/rootfolders', async (req, res) => { try { const custom = { url: req.query.url, apikey: req.query.apikey }; res.json(await arr.rootFolders(req.params.kind, custom)); } catch (e) { res.status(200).json({ error: e.message }); } });

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

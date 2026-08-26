// health.js — per-service health checks. AI is probed with a SHORT 6s timeout
// so a slow/hanging local model can't leave the card "Checking services…".
import express from '../mini.js';
import { load } from '../config.js';
import tmdb from '../services/tmdb.js';
import omdb from '../services/omdb.js';
import plex from '../services/plex.js';
import tautulli from '../services/tautulli.js';
import arr from '../services/arr.js';
import sabnzbd from '../services/sabnzbd.js';
import gluetun from '../services/gluetun.js';
import { ping as aiPing } from '../recommend/ai.js';

const router = express.Router();

function withTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]); }
async function probe(name, configured, fn, ms = 6000) {
  if (!configured) return { name, state: 'off', detail: 'not configured' };
  try { const r = await withTimeout(fn(), ms); return { name, state: 'ok', detail: label(r) }; }
  catch (e) { return { name, state: 'bad', detail: String(e.message || e).slice(0, 120) }; }
}
function label(r) { if (!r || typeof r !== 'object') return 'connected'; if (r.version) return 'v' + r.version; if (r.server) return r.server; if (r.status) return r.status; if (r.sample) return 'model ok'; if (r.images) return 'API ok'; return 'connected'; }

router.get('/', async (req, res) => {
  const c = load(); const s = c.services;
  const checks = await Promise.all([
    probe('NickSeer', true, async () => ({ version: 'core' })),
    probe('TMDB', !!(c.tmdb?.apiKey || c.tmdb?.readToken), () => tmdb.test()),
    probe('OMDb (IMDb ratings)', !!c.omdb?.apiKey, () => omdb.test()),
    probe('Plex', !!(s.plex?.url && s.plex?.token), () => plex.test()),
    probe('Tautulli', !!(s.tautulli?.url && s.tautulli?.apikey), () => tautulli.test()),
    probe('Radarr', !!(s.radarr?.url && s.radarr?.apikey), () => arr.test('radarr')),
    probe('Sonarr', !!(s.sonarr?.url && s.sonarr?.apikey), () => arr.test('sonarr')),
    probe('SABnzbd', !!(s.sabnzbd?.url && s.sabnzbd?.apikey), () => sabnzbd.test()),
    probe('Gluetun VPN', !!s.gluetun?.url, () => gluetun.test()),
    // AI probed with a short 6s window; if it can't reply fast, show ✗ (not stuck).
    probe('AI (' + (c.ai?.provider || 'none') + ')', c.ai?.provider && c.ai.provider !== 'none', async () => { const p = await aiPing(5500); if (!p.ok) throw new Error(p.error || 'no response'); return { sample: p.sample }; }, 6500)
  ]);
  checks[0].detail = 'API responding';
  const summary = { ok: checks.filter((x) => x.state === 'ok').length, bad: checks.filter((x) => x.state === 'bad').length, off: checks.filter((x) => x.state === 'off').length };
  res.json({ checks, summary });
});

// Full-window AI test for the Settings button (give the model more time here).
router.get('/ai', async (req, res) => { try { res.json(await aiPing(Number(req.query.timeout) || 30000)); } catch (e) { res.status(200).json({ ok: false, error: e.message }); } });

export default router;

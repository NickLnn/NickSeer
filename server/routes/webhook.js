import express from '../mini.js';
import crypto from 'crypto';
import { load, setRequests } from '../config.js';
import tmdb from '../services/tmdb.js';
import * as telegram from '../services/telegram.js';
import * as discord from '../services/discord.js';

const router = express.Router();

router.post('/', async (req, res) => {
  // Shared secret. This endpoint flips a queued request to "available" and
  // fires Telegram/Discord notifications, so it must not be open to anyone
  // who can reach the hostname. Radarr and Sonarr both support a query
  // string on the webhook URL: .../api/v1/webhook?token=<secret>
  const secret = load().webhook?.secret || '';
  if (!secret) return res.status(503).json({ error: 'webhook secret not configured' });
  const supplied = String(req.query?.token || req.headers['x-webhook-token'] || '');
  const a = Buffer.from(supplied);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const payload = req.body;
    if (!payload || !payload.eventType) {
      return res.status(400).json({ error: 'Missing eventType' });
    }

    // We only care about Download/Import events
    if (payload.eventType !== 'Download') {
      return res.json({ ok: true, status: 'ignored', reason: 'Not a Download event' });
    }

    let tmdbId = null;
    let mediaType = null;
    let title = '';

    // Radarr Webhook
    if (payload.movie && payload.movie.tmdbId) {
      tmdbId = payload.movie.tmdbId;
      title = payload.movie.title;
      mediaType = 'movie';
    } 
    // Sonarr Webhook
    else if (payload.series && payload.series.tvdbId) {
      const tvdbId = payload.series.tvdbId;
      title = payload.series.title;
      mediaType = 'tv';
      
      // We must map TVDB ID to TMDB ID to match NickSeer requests
      const findRes = await tmdb.find(tvdbId, 'tvdb_id').catch(() => null);
      if (findRes && findRes.tv_results && findRes.tv_results.length > 0) {
        tmdbId = findRes.tv_results[0].id;
      } else {
        return res.status(404).json({ error: 'Could not map TVDB ID to TMDB ID' });
      }
    } else {
      return res.status(400).json({ error: 'Unrecognized payload structure (missing movie or series objects)' });
    }

    // Now find the pending/approved request in the queue
    const all = load().requests || [];
    const rq = all.find(r => 
      String(r.tmdbId) === String(tmdbId) && 
      (r.media === mediaType || (mediaType === 'tv' && r.media === 'show')) &&
      r.status !== 'available' && r.status !== 'declined'
    );

    if (rq) {
      rq.status = 'available';
      setRequests(all);
      
      // Fire notifications
      telegram.notify('available', rq);
      discord.notify('available', rq);
      
      return res.json({ ok: true, status: 'available', title: rq.title });
    }

    return res.json({ ok: true, status: 'ignored', reason: 'Request not found in queue or already available' });

  } catch (e) {
    console.error('[webhook] error processing payload:', e);
    res.status(500).json({ error: e.message });
  }
});

export default router;

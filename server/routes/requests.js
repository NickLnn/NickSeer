// Approvals queue. When "admin approves" is on, non-admin requests are stored
// as pending; an admin approves (→ sends to Radarr/Sonarr) or declines.
import express from '../mini.js';
import auth from '../services/auth.js';
import arr from '../services/arr.js';
import plex from '../services/plex.js';
import { load, setRequests, mutateRequests } from '../config.js';
import { notify } from '../services/telegram.js';
import { notify as discordNotify } from '../services/discord.js';

const router = express.Router();

function userFrom(req) {
  const tok = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  return auth.verifyToken(tok); // {username, role} or null
}
function isAlreadyExists(msg) { const m = String(msg || '').toLowerCase(); return m.includes('has already been added') || m.includes('movieexistsvalidator') || m.includes('seriesexistsvalidator'); }
function kindFor(media) { return media === 'tv' || media === 'show' ? 'sonarr' : 'radarr'; }

function formatPoster(p) {
  if (!p) return '';
  return p.startsWith('http') ? p : `https://image.tmdb.org/t/p/w500${p.startsWith('/') ? '' : '/'}${p}`;
}

let lastHealTime = 0;
async function healMissingPosters(requests) {
  // Throttle healing to at most once per 60 seconds
  if (Date.now() - lastHealTime < 60000) return;
  lastHealTime = Date.now();
  let changed = false;
  for (const rq of requests) {
    if (!rq.poster && (rq.tmdbId || rq.tvdbId)) {
      try {
        if (rq.media === 'tv' || rq.media === 'show') {
          if (rq.tvdbId) {
            const tmdb = (await import('../services/tmdb.js')).default;
            const findRes = await tmdb.find(rq.tvdbId, 'tvdb_id').catch(() => null);
            if (findRes?.tv_results?.[0]?.poster_path) {
              rq.poster = `https://image.tmdb.org/t/p/w500${findRes.tv_results[0].poster_path}`;
              changed = true;
              continue;
            }
          }
          if (rq.tmdbId) {
            const tmdb = (await import('../services/tmdb.js')).default;
            const tmdbRes = await tmdb.details('tv', rq.tmdbId).catch(() => null);
            if (tmdbRes?.poster_path) {
              rq.poster = `https://image.tmdb.org/t/p/w500${tmdbRes.poster_path}`;
              changed = true;
              continue;
            }
          }
          const sonarrMatch = await arr.lookup('sonarr', rq.tmdbId, { tvdbId: rq.tvdbId }).catch(() => null);
          const item = Array.isArray(sonarrMatch) ? sonarrMatch[0] : sonarrMatch;
          const pImg = item?.images?.find(x => x.coverType === 'poster') || item?.images?.[0];
          if (pImg?.remoteUrl) {
            rq.poster = pImg.remoteUrl;
            changed = true;
          }
        } else if (rq.tmdbId) {
          const tmdb = (await import('../services/tmdb.js')).default;
          const tmdbRes = await tmdb.details('movie', rq.tmdbId).catch(() => null);
          if (tmdbRes?.poster_path) {
            rq.poster = `https://image.tmdb.org/t/p/w500${tmdbRes.poster_path}`;
            changed = true;
          }
        }
      } catch {}
    } else if (rq.poster && !rq.poster.startsWith('http')) {
      rq.poster = formatPoster(rq.poster);
      changed = true;
    }
  }
  if (changed) {
    try { setRequests(requests); } catch {}
  }
}

// List requests (admin sees all; a user sees their own).
router.get('/', (req, res) => {
  const u = userFrom(req);
  const all = load().requests || [];

  // Background heal missing posters for existing requests
  healMissingPosters(all).catch(() => {});

  const mappedAll = all.map(r => ({ ...r, poster: formatPoster(r.poster) }));
  if (u && u.role === 'admin') return res.json({ ok: true, admin: true, requests: mappedAll });
  const mine = u ? mappedAll.filter((r) => r.by === u.username) : [];
  res.json({ ok: true, admin: false, requests: mine });
});

// Approve → actually add to Radarr/Sonarr.
router.post('/:id/approve', async (req, res) => {
  const u = userFrom(req);
  if (auth.isEnabled() && (!u || u.role !== 'admin')) return res.status(200).json({ ok: false, error: 'Admin only' });
  const all = load().requests || [];
  const rq = all.find((r) => r.id === req.params.id);
  if (!rq) return res.status(200).json({ ok: false, error: 'not found' });
  try {
    const result = await addNow(rq);
    rq.status = 'approved'; rq.decidedAt = Date.now(); rq.decidedBy = u ? u.username : 'admin';
    // addNow() above awaited Radarr/Sonarr for potentially seconds; `all` is now
    // stale. Re-read and apply the change to the live array instead.
    mutateRequests((cur) => { const t = cur.find((r) => r.id === rq.id); if (t) Object.assign(t, rq); });
    try { plex.invalidateLibrary(); } catch { /* ignore */ }
    notify('approved', rq); discordNotify('approved', rq);
    res.json({ ok: true, id: result.id });
  } catch (e) {
    if (isAlreadyExists(e.message)) { rq.status = 'approved'; rq.note = 'already in library'; mutateRequests((cur) => { const t = cur.find((r) => r.id === rq.id); if (t) Object.assign(t, rq); }); return res.json({ ok: true, exists: true }); }
    notify('failed', rq); discordNotify('failed', rq);
    res.status(200).json({ ok: false, error: e.message });
  }
});

router.post('/:id/decline', (req, res) => {
  const u = userFrom(req);
  if (auth.isEnabled() && (!u || u.role !== 'admin')) return res.status(200).json({ ok: false, error: 'Admin only' });
  const all = load().requests || [];
  const rq = all.find((r) => r.id === req.params.id);
  if (!rq) return res.status(200).json({ ok: false, error: 'not found' });
  rq.status = 'declined'; rq.decidedAt = Date.now(); rq.decidedBy = u ? u.username : 'admin';
  setRequests(all);
  notify('declined', rq); discordNotify('declined', rq);
  res.json({ ok: true });
});


// Edit a pending request's settings (admin only).
router.patch('/:id', (req, res) => {
  const u = userFrom(req);
  if (auth.isEnabled() && (!u || u.role !== 'admin')) return res.status(200).json({ ok: false, error: 'Admin only' });
  const all = load().requests || [];
  const rq = all.find((r) => r.id === req.params.id);
  if (!rq) return res.status(200).json({ ok: false, error: 'not found' });
  if (rq.status !== 'pending') return res.status(200).json({ ok: false, error: 'Only pending requests can be edited' });
  const { qualityProfileId, rootFolder, tags, newTags } = req.body || {};
  if (qualityProfileId !== undefined) rq.qualityProfileId = qualityProfileId;
  if (rootFolder !== undefined) rq.rootFolder = rootFolder;
  if (tags !== undefined) rq.tags = tags;
  if (newTags !== undefined) rq.newTags = newTags;
  setRequests(all);
  res.json({ ok: true, request: rq });
});
router.post('/clear', (req, res) => {
  const u = userFrom(req);
  if (auth.isEnabled() && (!u || u.role !== 'admin')) return res.status(200).json({ ok: false, error: 'Admin only' });
  setRequests((load().requests || []).filter((r) => r.status === 'pending'));
  res.json({ ok: true });
});

async function addNow(rq) {
  const kind = kindFor(rq.media);
  const tagIds = [...(rq.tags || [])];
  for (const label of (rq.newTags || [])) { if (!label) continue; const id = await arr.ensureTag(kind, label); if (!tagIds.includes(id)) tagIds.push(id); }
  const idToUse = (kind === 'sonarr' && rq.tvdbId) ? `tvdb:${rq.tvdbId}` : rq.tmdbId;
  return arr.add(kind, idToUse, { qualityProfileId: rq.qualityProfileId ? Number(rq.qualityProfileId) : undefined, rootFolder: rq.rootFolder || undefined, tags: tagIds, seasons: rq.seasons });
}

export { userFrom, isAlreadyExists, kindFor, addNow };
export default router;

import collections from '../services/collections.js';
// Requesting. The "admin approves" gate respects the auth.approvals TOGGLE
// (Settings → Users), not just whether login is required. If you're still
// seeing "will be approved automatically" for non-admins, this file MUST be
// in place AND the toggle (see auth-toggles.js) must be switched ON.
//
// Rule (mustQueue):
//   • Login not required at all           → always direct-add
//   • Login required, approvals toggle OFF → direct-add for everyone
//   • Login required, approvals toggle ON, requester is NOT admin → queue as pending
//   • Requester IS admin → always direct-add
import express from '../mini.js';
import arr from '../services/arr.js';
import tautulli from '../services/tautulli.js';
import plex from '../services/plex.js';
import auth from '../services/auth.js';
import { load, setRequests } from '../config.js';
import crypto from 'crypto';

const router = express.Router();
function kindFor(media) { return media === 'tv' || media === 'show' ? 'sonarr' : 'radarr'; }
function isAlreadyExists(msg) { const m = String(msg || '').toLowerCase(); return m.includes('has already been added') || m.includes('movieexistsvalidator') || m.includes('seriesexistsvalidator'); }
function userFrom(req) { const tok = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, ''); return auth.verifyToken(tok); }

function mustQueue(c, isAdmin) {
  if (!auth.isEnabled()) return false;
  if (isAdmin) return false;
  return !!c.auth?.approvals;
}

router.get('/options', async (req, res) => {
  const media = req.query.media || 'movie';
  const kind = kindFor(media);
  const c = load();
  const u = userFrom(req);
  const isAdmin = u && u.role === 'admin';
  const out = { kind, media, autoApprove: !mustQueue(c, isAdmin), servers: [{ id: kind, name: `${cap(kind)} (Default)` }], profiles: [], rootFolders: [], tags: [], requestAs: null };
  const s = c.services[kind];
  if (s?.url && s?.apikey) {
    const [profiles, roots, tags] = await Promise.all([arr.qualityProfiles(kind).catch(() => []), arr.rootFolders(kind).catch(() => []), arr.tags(kind).catch(() => [])]);
    out.profiles = (profiles || []).map((p) => ({ id: p.id, name: p.name }));
    out.rootFolders = (roots || []).map((f) => ({ path: f.path, label: `${f.path}${f.freeSpace ? ` (${fmt(f.freeSpace)})` : ''}` }));
    out.tags = (tags || []).map((t) => ({ id: t.id, label: t.label }));
    out.defaultProfileId = s.qualityProfileId ?? out.profiles[0]?.id ?? null;
    out.defaultRootFolder = s.rootFolder || out.rootFolders[0]?.path || '';
  } else out.error = `${cap(kind)} is not configured — add it in Settings first.`;
  if (u) out.requestAs = { name: u.username, email: '' };
  else { try { const users = await tautulli.users(); const owner = (users || []).find((x) => x.is_admin) || (users || [])[0]; if (owner) out.requestAs = { name: owner.friendly_name || owner.username, email: owner.email || '' }; } catch { /* optional */ } }
  res.json(out);
});

router.post('/', async (req, res) => {
  const { media, tmdbId, title, poster, qualityProfileId, rootFolder, tags = [], newTags = [], seasons } = req.body || {};
  if (!media || !tmdbId) return res.status(400).json({ ok: false, error: 'media and tmdbId required' });
  const kind = kindFor(media);
  const c = load();
  const u = userFrom(req);
  const isAdmin = u && u.role === 'admin';

  if (mustQueue(c, isAdmin)) {
    const all = load().requests || [];
    if (all.find((r) => r.status === 'pending' && String(r.tmdbId) === String(tmdbId) && r.media === media)) {
      return res.json({ ok: true, code: 'pending', already: true });
    }
    all.unshift({ id: crypto.randomUUID(), status: 'pending', media, tmdbId, title: title || '', poster: poster || '', by: u ? u.username : 'guest', at: Date.now(), qualityProfileId: qualityProfileId || null, rootFolder: rootFolder || '', tags, newTags, seasons });
    setRequests(all);
    return res.json({ ok: true, code: 'pending' });
  }

  try {
    const tagIds = [...tags];
    for (const label of newTags) { if (!label) continue; const id = await arr.ensureTag(kind, label); if (!tagIds.includes(id)) tagIds.push(id); }
    const result = await arr.add(kind, tmdbId, { qualityProfileId: qualityProfileId ? Number(qualityProfileId) : undefined, rootFolder: rootFolder || undefined, tags: tagIds, seasons });
    try { plex.invalidateLibrary(); } catch { /* ignore */ }
    res.json({ ok: true, kind, id: result.id, title: result.title || result.movie?.title });
  } catch (e) {
    if (isAlreadyExists(e.message)) return res.status(200).json({ ok: false, code: 'exists', kind, error: `Already added to ${cap(kind)}.` });
    res.status(200).json({ ok: false, error: e.message });
  }
});

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function fmt(bytes) { const gb = bytes / 1073741824; return gb > 1024 ? (gb / 1024).toFixed(2) + ' TB' : gb.toFixed(0) + ' GB'; }


router.post('/collection', async (req, res) => {
  const { collectionId, qualityProfileId, rootFolder, tags = [] } = req.body || {};
  if (!collectionId) return res.status(400).json({ ok: false, error: 'collectionId required' });
  
  try {
    const col = await collections.getCollection(collectionId);
    if (!col || !col.parts) return res.status(404).json({ ok: false, error: 'collection not found' });
    
    const missingParts = col.parts.filter(p => !p.inLibrary && !p.isPending);
    if (!missingParts.length) return res.json({ ok: true, requestedCount: 0, message: 'All movies already in library or requested' });

    const c = load();
    const u = userFrom(req);
    const isAdmin = u && u.role === 'admin';
    const kind = 'radarr';
    const isQueue = mustQueue(c, isAdmin);

    const results = [];
    const allReqs = isQueue ? (load().requests || []) : null;

    for (const part of missingParts) {
      if (isQueue) {
        if (!allReqs.find(r => r.status === 'pending' && String(r.tmdbId) === String(part.id) && r.media === 'movie')) {
          allReqs.unshift({
            id: crypto.randomUUID(),
            status: 'pending',
            media: 'movie',
            tmdbId: part.id,
            title: part.title || '',
            poster: part.poster || '',
            by: u ? u.username : 'guest',
            at: Date.now(),
            qualityProfileId: qualityProfileId || null,
            rootFolder: rootFolder || '',
            tags
          });
        }
        results.push({ id: part.id, title: part.title, status: 'pending' });
      } else {
        try {
          const added = await arr.add(kind, part.id, {
            qualityProfileId: qualityProfileId ? Number(qualityProfileId) : undefined,
            rootFolder: rootFolder || undefined,
            tags
          });
          results.push({ id: part.id, title: part.title, status: 'added', radarrId: added?.id });
        } catch (e) {
          if (isAlreadyExists(e.message)) {
            results.push({ id: part.id, title: part.title, status: 'exists' });
          } else {
            results.push({ id: part.id, title: part.title, status: 'error', error: e.message });
          }
        }
      }
    }

    if (isQueue) setRequests(allReqs);
    try { plex.invalidateLibrary(); } catch {}

    res.json({
      ok: true,
      collectionName: col.name,
      requestedCount: results.filter(r => r.status === 'added' || r.status === 'pending').length,
      results
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;

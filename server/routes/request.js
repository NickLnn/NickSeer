// Requesting. If "admin approves" is ON and the requester isn't an admin, the
// request is queued as PENDING (Approvals tab). Otherwise it's added directly.
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

router.get('/options', async (req, res) => {
  const media = req.query.media || 'movie';
  const kind = kindFor(media);
  const c = load();
  const out = { kind, media, autoApprove: !c.auth?.approvals, servers: [{ id: kind, name: `${cap(kind)} (Default)` }], profiles: [], rootFolders: [], tags: [], requestAs: null };
  const s = c.services[kind];
  if (s?.url && s?.apikey) {
    const [profiles, roots, tags] = await Promise.all([arr.qualityProfiles(kind).catch(() => []), arr.rootFolders(kind).catch(() => []), arr.tags(kind).catch(() => [])]);
    out.profiles = (profiles || []).map((p) => ({ id: p.id, name: p.name }));
    out.rootFolders = (roots || []).map((f) => ({ path: f.path, label: `${f.path}${f.freeSpace ? ` (${fmt(f.freeSpace)})` : ''}` }));
    out.tags = (tags || []).map((t) => ({ id: t.id, label: t.label }));
    out.defaultProfileId = s.qualityProfileId ?? out.profiles[0]?.id ?? null;
    out.defaultRootFolder = s.rootFolder || out.rootFolders[0]?.path || '';
  } else out.error = `${cap(kind)} is not configured — add it in Settings first.`;
  const u = userFrom(req);
  if (u) out.requestAs = { name: u.username, email: '' };
  else { try { const users = await tautulli.users(); const owner = (users || []).find((x) => x.is_admin) || (users || [])[0]; if (owner) out.requestAs = { name: owner.friendly_name || owner.username, email: owner.email || '' }; } catch { /* optional */ } }
  res.json(out);
});

router.post('/', async (req, res) => {
  const { media, tmdbId, title, poster, qualityProfileId, rootFolder, tags = [], newTags = [] } = req.body || {};
  if (!media || !tmdbId) return res.status(400).json({ ok: false, error: 'media and tmdbId required' });
  const kind = kindFor(media);
  const c = load();
  const u = userFrom(req);
  const approvalsOn = !!c.auth?.approvals;
  const isAdmin = u && u.role === 'admin';

  // Queue as pending when approvals are on and requester isn't an admin.
  if (approvalsOn && !isAdmin) {
    const all = load().requests || [];
    if (all.find((r) => r.status === 'pending' && String(r.tmdbId) === String(tmdbId) && r.media === media)) {
      return res.json({ ok: true, code: 'pending', already: true });
    }
    all.unshift({ id: crypto.randomUUID(), status: 'pending', media, tmdbId, title: title || '', poster: poster || '', by: u ? u.username : 'guest', at: Date.now(), qualityProfileId: qualityProfileId || null, rootFolder: rootFolder || '', tags, newTags });
    setRequests(all);
    return res.json({ ok: true, code: 'pending' });
  }

  // Direct add.
  try {
    const tagIds = [...tags];
    for (const label of newTags) { if (!label) continue; const id = await arr.ensureTag(kind, label); if (!tagIds.includes(id)) tagIds.push(id); }
    const result = await arr.add(kind, tmdbId, { qualityProfileId: qualityProfileId ? Number(qualityProfileId) : undefined, rootFolder: rootFolder || undefined, tags: tagIds });
    try { plex.invalidateLibrary(); } catch { /* ignore */ }
    res.json({ ok: true, kind, id: result.id, title: result.title || result.movie?.title });
  } catch (e) {
    if (isAlreadyExists(e.message)) return res.status(200).json({ ok: false, code: 'exists', kind, error: `Already added to ${cap(kind)}.` });
    res.status(200).json({ ok: false, error: e.message });
  }
});

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function fmt(bytes) { const gb = bytes / 1073741824; return gb > 1024 ? (gb / 1024).toFixed(2) + ' TB' : gb.toFixed(0) + ' GB'; }

export default router;

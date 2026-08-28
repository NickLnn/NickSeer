// Approvals queue. When "admin approves" is on, non-admin requests are stored
// as pending; an admin approves (→ sends to Radarr/Sonarr) or declines.
import express from '../mini.js';
import auth from '../services/auth.js';
import arr from '../services/arr.js';
import plex from '../services/plex.js';
import { load, setRequests } from '../config.js';

const router = express.Router();

function userFrom(req) {
  const tok = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  return auth.verifyToken(tok); // {username, role} or null
}
function isAlreadyExists(msg) { const m = String(msg || '').toLowerCase(); return m.includes('has already been added') || m.includes('movieexistsvalidator') || m.includes('seriesexistsvalidator'); }
function kindFor(media) { return media === 'tv' || media === 'show' ? 'sonarr' : 'radarr'; }

// List requests (admin sees all; a user sees their own).
router.get('/', (req, res) => {
  const u = userFrom(req);
  const all = load().requests || [];
  if (u && u.role === 'admin') return res.json({ ok: true, admin: true, requests: all });
  const mine = u ? all.filter((r) => r.by === u.username) : [];
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
    setRequests(all);
    try { plex.invalidateLibrary(); } catch { /* ignore */ }
    res.json({ ok: true, id: result.id });
  } catch (e) {
    if (isAlreadyExists(e.message)) { rq.status = 'approved'; rq.note = 'already in library'; setRequests(all); return res.json({ ok: true, exists: true }); }
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
  return arr.add(kind, rq.tmdbId, { qualityProfileId: rq.qualityProfileId ? Number(rq.qualityProfileId) : undefined, rootFolder: rq.rootFolder || undefined, tags: tagIds });
}

export { userFrom, isAlreadyExists, kindFor, addNow };
export default router;

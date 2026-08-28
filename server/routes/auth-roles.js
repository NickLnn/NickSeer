// auth-roles.js — adds the "change a user's role" endpoint (Admin ⇄ Requester).
// Creating a user with a role already worked; this lets an admin change an
// EXISTING user's role later (e.g. promote Babis to Admin, or demote someone
// back to Requester). Mounted at the same /api/auth base as the main auth
// router — purely additive, does not touch or duplicate any existing route.
import express from '../mini.js';
import auth from '../services/auth.js';

const router = express.Router();

function userFrom(req) {
  const tok = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  return auth.verifyToken(tok);
}

// POST /api/auth/users/role   { username, role: 'admin' | 'user' }
router.post('/users/role', (req, res) => {
  const u = userFrom(req);
  // Once login is required, only an admin may change roles. Before login is
  // enabled (initial setup), allow it so the very first admin can be fixed up
  // if they were created as a plain user by mistake.
  if (auth.isEnabled() && (!u || u.role !== 'admin')) {
    return res.status(200).json({ ok: false, error: 'Admin only' });
  }
  const { username, role } = req.body || {};
  if (!username || (role !== 'admin' && role !== 'user')) {
    return res.status(200).json({ ok: false, error: 'username and a valid role are required' });
  }
  try {
    const result = auth.setRole(username, role);
    res.json({ ok: true, user: result });
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message });
  }
});

export default router;

// Auth routes: local login, session check, admin user management, and
// "Sign in with Plex" (OAuth PIN flow that auto-provisions a NickSeer user).
import express from '../mini.js';
import auth from '../services/auth.js';
import plexauth from '../services/plexauth.js';
import { load, update } from '../config.js';

const router = express.Router();

// In-Memory Brute-Force Rate Limiter (5 attempts / 2 min -> 60s lock)
const failedLogins = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = failedLogins.get(ip);
  if (!entry) return null;
  if (entry.lockedUntil && entry.lockedUntil > now) {
    const remainingSec = Math.ceil((entry.lockedUntil - now) / 1000);
    return `Too many failed login attempts. Please wait ${remainingSec}s before retrying.`;
  }
  if (entry.lockedUntil && entry.lockedUntil <= now) {
    failedLogins.delete(ip);
  }
  return null;
}

function recordFailedLogin(ip) {
  const now = Date.now();
  const entry = failedLogins.get(ip) || { count: 0, firstAttempt: now };
  if (now - entry.firstAttempt > 120000) {
    entry.count = 0;
    entry.firstAttempt = now;
  }
  entry.count++;
  if (entry.count >= 5) {
    entry.lockedUntil = now + 60000; // 60s lockout
  }
  failedLogins.set(ip, entry);
}

function recordSuccessfulLogin(ip) {
  failedLogins.delete(ip);
}


router.get('/status', (req, res) => {
  const c = load();
  res.json({ enabled: auth.isEnabled(), hasAdmin: auth.hasAnyAdmin(), plexLogin: c.plexAuth?.enabled !== false, approvals: !!c.auth?.approvals });
});

router.post('/login', (req, res) => {
  const ip = req.ip || '127.0.0.1';
  const lockErr = checkRateLimit(ip);
  if (lockErr) return res.status(200).json({ ok: false, error: lockErr, rateLimited: true });

  const { username, password } = req.body || {};
  const r = auth.login(username, password);
  if (!r) {
    recordFailedLogin(ip);
    return res.status(200).json({ ok: false, error: 'Invalid username or password' });
  }
  recordSuccessfulLogin(ip);
  res.json({ ok: true, token: r.token, user: r.user });
});

router.get('/me', (req, res) => {
  const tok = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  const u = auth.verifyToken(tok);
  if (!u) return res.status(200).json({ ok: false });
  res.json({ ok: true, user: u });
});

// ---- Sign in with Plex ----
router.post('/plex/pin', async (req, res) => {
  try {
    const pin = await plexauth.createPin();
    const forwardUrl = (req.body && req.body.forwardUrl) || '';
    res.json({ ok: true, id: pin.id, code: pin.code, authUrl: plexauth.authUrl(pin.code, forwardUrl) });
  } catch (e) { res.status(200).json({ ok: false, error: e.message }); }
});

// Poll: once claimed, resolve the account and provision/sign-in a NickSeer user.
router.get('/plex/check/:id', async (req, res) => {
  try {
    const token = await plexauth.checkPin(req.params.id);
    if (!token) return res.json({ ok: true, pending: true });
    const account = await plexauth.accountFor(token);
    const { token: appToken, user } = auth.upsertPlexUser(account);
    res.json({ ok: true, pending: false, token: appToken, user });
  } catch (e) { res.status(200).json({ ok: false, error: e.message }); }
});

// Enable/disable Plex login (admin, or pre-auth bootstrap).
router.post('/plex/enable', (req, res) => {
  if (!requireAdmin(req, res)) return;
  update({ plexAuth: { enabled: !!(req.body || {}).enabled } });
  res.json({ ok: true, enabled: !!load().plexAuth?.enabled });
});

// ---- admin user management ----
function requireAdmin(req, res) {
  if (!auth.isEnabled()) return true; // pre-auth bootstrap
  const tok = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  const u = auth.verifyToken(tok);
  if (!u || u.role !== 'admin') { res.status(200).json({ ok: false, error: 'Admin only' }); return false; }
  return true;
}

router.get('/users', (req, res) => { if (!requireAdmin(req, res)) return; res.json({ ok: true, enabled: auth.isEnabled(), approvals: !!load().auth?.approvals, users: auth.listUsers() }); });
router.post('/users', (req, res) => { if (!requireAdmin(req, res)) return; try { const { username, password, role } = req.body || {}; res.json({ ok: true, user: auth.createUser({ username, password, role: role === 'admin' ? 'admin' : 'user' }) }); } catch (e) { res.status(200).json({ ok: false, error: e.message }); } });
router.post('/users/password', (req, res) => { if (!requireAdmin(req, res)) return; try { const { username, password } = req.body || {}; res.json({ ok: true, user: auth.setPassword(username, password) }); } catch (e) { res.status(200).json({ ok: false, error: e.message }); } });
router.post('/users/role', (req, res) => { if (!requireAdmin(req, res)) return; try { const { username, role } = req.body || {}; res.json({ ok: true, user: auth.setRole(username, role === 'admin' ? 'admin' : 'user') }); } catch (e) { res.status(200).json({ ok: false, error: e.message }); } });
router.post('/users/delete', (req, res) => { if (!requireAdmin(req, res)) return; try { auth.deleteUser((req.body || {}).username); res.json({ ok: true }); } catch (e) { res.status(200).json({ ok: false, error: e.message }); } });

router.post('/enable', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const enabled = !!(req.body || {}).enabled;
  if (enabled && !auth.hasAnyAdmin()) return res.status(200).json({ ok: false, error: 'Create an admin user first' });
  auth.ensureSecret(); update({ auth: { enabled } });
  res.json({ ok: true, enabled });
});

// Toggle the "admin approves requests" workflow.
router.post('/approvals', (req, res) => { if (!requireAdmin(req, res)) return; update({ auth: { approvals: !!(req.body || {}).approvals } }); res.json({ ok: true, approvals: !!load().auth?.approvals }); });

export default router;

// Auth routes: local login, session check, admin user management, and
// "Sign in with Plex" (OAuth PIN flow that auto-provisions a NickSeer user).
import express from '../mini.js';
import auth from '../services/auth.js';
import plexauth from '../services/plexauth.js';
import { load, update } from '../config.js';

const router = express.Router();

// In-Memory Brute-Force Rate Limiter (5 attempts / 2 min -> 60s lock)
// NOTE: this is only meaningful now that mini.js refuses to believe a
// client-supplied CF-Connecting-IP from an untrusted socket.
const failedLogins = new Map();
const RATE_MAP_MAX = 5000;

// The map was previously never swept, so entries accumulated until restart.
function sweepRateLimit(now) {
  for (const [key, entry] of failedLogins) {
    const expired = (!entry.lockedUntil || entry.lockedUntil <= now) &&
                    (now - entry.firstAttempt > 120000);
    if (expired) failedLogins.delete(key);
  }
  // Hard ceiling so a distributed attempt cannot grow this without bound.
  if (failedLogins.size > RATE_MAP_MAX) failedLogins.clear();
}

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
  sweepRateLimit(now);
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


// Unauthenticated (the login screen needs it to draw the profile picker).
// `role` is deliberately NOT returned: publishing which account is the admin
// hands an attacker the exact username to brute-force.
router.get('/profiles', (req, res) => {
  const c = load();
  const users = (c.auth?.users || []).map(u => ({
    id: u.username,
    name: u.username,
    thumb: u.thumb || '',
    isAccount: true,
    plex: !!u.plexToken
  }));
  res.json({ ok: true, profiles: users });
});

router.get('/status', (req, res) => {
  const c = load();
  res.json({ enabled: auth.isEnabled(), hasAdmin: auth.hasAnyAdmin(), plexLogin: c.plexAuth?.enabled !== false, approvals: !!c.auth?.approvals });
});

router.post('/login', async (req, res) => {
  const ip = req.ip || '127.0.0.1';
  const lockErr = checkRateLimit(ip);
  // Real status codes so Cloudflare Rate Limiting can count failures. The
  // login form reads the JSON body regardless of status, so the UI is
  // unaffected.
  if (lockErr) return res.status(429).json({ ok: false, error: lockErr, rateLimited: true });

  const { username, password } = req.body || {};
  const r = await auth.login(username, password);
  if (!r) {
    recordFailedLogin(ip);
    return res.status(401).json({ ok: false, error: 'Invalid username or password' });
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
// Import Plex friends / users as NickSeer accounts
router.post('/plex/import', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const curSettings = load();
    const token = curSettings.services?.plex?.token || '';
    if (!token) return res.status(200).json({ ok: false, error: 'Plex token not configured' });

    let count = 0;
    const existingUsers = new Set(auth.listUsers().map(u => u.username.toLowerCase()));

    // Query plex.tv friends
    try {
      const pUrl = 'https://plex.tv/api/v2/friends?X-Plex-Token=' + encodeURIComponent(token);
      const friendsRes = await fetch(pUrl, {
        headers: {
          'X-Plex-Token': token,
          'X-Plex-Client-Identifier': 'nickseer-app-nas',
          'X-Plex-Product': 'NickSeer',
          'X-Plex-Version': '1.0.0',
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(6000)
      });
      if (friendsRes.ok) {
        const friends = await friendsRes.json();
        for (const f of (friends || [])) {
          const name = (f.friendlyName || f.username || f.title || '').trim();
          if (name && !existingUsers.has(name.toLowerCase())) {
            await auth.createUser({ username: name, password: Math.random().toString(36).slice(-8), role: 'user' });
            existingUsers.add(name.toLowerCase());
            count++;
          }
        }
      }
    } catch { /* ignore friends error */ }

    // Also check PMS shared accounts
    try {
      const pmsUrl = (curSettings.services?.plex?.url || '').replace(/\/+$/, '') + '/accounts?X-Plex-Token=' + encodeURIComponent(token);
      const pmsRes = await fetch(pmsUrl, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(4000) });
      if (pmsRes.ok) {
        const pmsData = await pmsRes.json();
        const accounts = pmsData?.MediaContainer?.Account || [];
        for (const a of (Array.isArray(accounts) ? accounts : [accounts])) {
          const name = (a.name || a.username || '').trim();
          if (name && !existingUsers.has(name.toLowerCase())) {
            await auth.createUser({ username: name, password: Math.random().toString(36).slice(-8), role: 'user' });
            existingUsers.add(name.toLowerCase());
            count++;
          }
        }
      }
    } catch { /* ignore pms error */ }

    res.json({ ok: true, imported: count, users: auth.listUsers() });
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message });
  }
});

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
  if (!u || u.role !== 'admin') { res.status(403).json({ ok: false, error: 'Admin only' }); return false; }
  return true;
}

router.get('/users', (req, res) => { if (!requireAdmin(req, res)) return; res.json({ ok: true, enabled: auth.isEnabled(), approvals: !!load().auth?.approvals, users: auth.listUsers() }); });
router.post('/users', async (req, res) => { if (!requireAdmin(req, res)) return; try { const { username, password, role } = req.body || {}; res.json({ ok: true, user: await auth.createUser({ username, password, role: role === 'admin' ? 'admin' : 'user' }) }); } catch (e) { res.status(200).json({ ok: false, error: e.message }); } });
router.post('/users/password', async (req, res) => { if (!requireAdmin(req, res)) return; try { const { username, password } = req.body || {}; res.json({ ok: true, user: await auth.setPassword(username, password) }); } catch (e) { res.status(200).json({ ok: false, error: e.message }); } });
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

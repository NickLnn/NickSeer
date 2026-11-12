// Passkey (Face ID / Touch ID / Windows Hello) routes, mounted at
// /api/auth/passkey.
//   /login/*     unauthenticated (allow-listed in index.js) — the sign-in itself
//   everything else requires a session; a user manages only their own passkeys
import express from '../mini.js';
import auth from '../services/auth.js';
import passkey from '../services/passkey.js';
import { allow } from '../lib/ratelimit.js';

const router = express.Router();

function me(req) {
  if (req.user) return req.user;
  const tok = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  return tok ? auth.verifyToken(tok) : null;
}
// The browser's own Origin header; never a body field.
function originOf(req) {
  const o = String(req.headers.origin || '');
  if (!o) throw new Error('missing Origin header');
  return o;
}

router.post('/login/options', (req, res) => {
  if (!allow('pk-opt:' + req.ip, 30, 60000)) return res.status(429).json({ ok: false, error: 'Too many attempts — wait a minute.' });
  try { res.json({ ok: true, options: passkey.loginOptions(originOf(req)) }); }
  catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

router.post('/login/verify', (req, res) => {
  if (!allow('pk-login:' + req.ip, 10, 60000)) return res.status(429).json({ ok: false, error: 'Too many attempts — wait a minute.' });
  try {
    const username = passkey.loginVerify(req.body || {});
    const u = auth.findUser(username);
    // Account deleted since the passkey was made.
    if (!u) return res.status(401).json({ ok: false, error: 'This account no longer exists.' });
    res.json({ ok: true, token: auth.makeToken(u), user: { username: u.username, role: u.role || 'user' } });
  } catch (e) { res.status(401).json({ ok: false, error: e.message }); }
});

router.get('/list', (req, res) => {
  const u = me(req); if (!u) return res.status(401).json({ ok: false, error: 'Sign in first' });
  res.json({ ok: true, passkeys: passkey.list(u) });
});

router.post('/register/options', (req, res) => {
  const u = me(req); if (!u) return res.status(401).json({ ok: false, error: 'Sign in first' });
  try { res.json({ ok: true, options: passkey.registerOptions(u, originOf(req)) }); }
  catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

router.post('/register/verify', (req, res) => {
  const u = me(req); if (!u) return res.status(401).json({ ok: false, error: 'Sign in first' });
  try { res.json(passkey.registerVerify(u, req.body || {})); }
  catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

router.post('/remove', (req, res) => {
  const u = me(req); if (!u) return res.status(401).json({ ok: false, error: 'Sign in first' });
  res.json(passkey.removeAll(u));
});

export default router;

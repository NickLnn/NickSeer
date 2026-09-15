// auth.js — local accounts (scrypt) + HMAC tokens, plus Plex-user provisioning.
//
// AUDIT REMEDIATION (2026-09-09):
//  * ensureSecret() is memoized — it was calling load() (and therefore
//    statting settings.json) on every single token verification.
//  * verifyToken() now uses crypto.timingSafeEqual instead of `!==`, re-reads
//    the CURRENT role from config rather than trusting the claim, and checks a
//    per-user tokenVersion so role changes / password resets / deletions
//    immediately invalidate outstanding 30-day tokens.
//  * Password hashing moved from the blocking scryptSync to async scrypt, so a
//    login attempt no longer stalls the single-threaded event loop for ~100ms.
import crypto from 'crypto';
import { load, update } from '../config.js';

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

let _secret = null;
export function ensureSecret() {
  if (_secret) return _secret;
  const c = load();
  if (!c.auth?.secret) {
    _secret = crypto.randomBytes(32).toString('hex');
    update({ auth: { secret: _secret } });
    return _secret;
  }
  _secret = c.auth.secret;
  return _secret;
}

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------
function scryptAsync(password, salt, len = 64) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password), salt, len, (err, dk) => {
      if (err) reject(err); else resolve(dk);
    });
  });
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = (await scryptAsync(password, salt)).toString('hex');
  return { salt, hash };
}

export async function verifyPassword(password, salt, hash) {
  if (!salt || !hash) return false;
  const test = await scryptAsync(password, salt);
  const b = Buffer.from(hash, 'hex');
  return test.length === b.length && crypto.timingSafeEqual(test, b);
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------
function sign(b64) { return crypto.createHmac('sha256', ensureSecret()).update(b64).digest('base64url'); }

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function makeToken(user) {
  const payload = {
    u: user.username,
    r: user.role || 'user',
    // Bumped whenever the account's authority changes, so old tokens die.
    v: Number(user.tokenVersion) || 0,
    exp: Date.now() + TOKEN_TTL_MS
  };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${b64}.${sign(b64)}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [b64, sig] = token.split('.');
  if (!b64 || !sig) return null;
  if (!safeEqual(sign(b64), sig)) return null;
  try {
    const p = JSON.parse(Buffer.from(b64, 'base64url').toString());
    if (!p.exp || Date.now() > p.exp) return null;

    // Authority is re-read from config, never trusted from the claim: a user
    // demoted or deleted five minutes ago must not keep admin for 30 days.
    const current = findUser(p.u);
    if (!current) return null;
    if ((Number(current.tokenVersion) || 0) !== (Number(p.v) || 0)) return null;

    return { username: current.username, role: current.role || 'user' };
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
export function listUsers() { return (load().auth?.users || []).map((u) => ({ username: u.username, role: u.role || 'user', plex: !!u.plexId, thumb: u.thumb || '' })); }
export function findUser(username) { return (load().auth?.users || []).find((u) => u.username.toLowerCase() === String(username).toLowerCase()); }
export function isEnabled() { return !!load().auth?.enabled; }
export function approvalsOn() { return !!load().auth?.approvals; }
export function hasAnyAdmin() { return (load().auth?.users || []).some((u) => (u.role || 'user') === 'admin'); }

export async function createUser({ username, password, role = 'user' }) {
  username = String(username || '').trim();
  if (!username) throw new Error('username required');
  if (!password) throw new Error('password required');
  if (findUser(username)) throw new Error('user already exists');
  const { salt, hash } = await hashPassword(password);
  update({ auth: { users: [...(load().auth?.users || []), { username, role, salt, hash, tokenVersion: 0 }] } });
  return { username, role };
}

export async function setPassword(username, password) {
  const users = [...(load().auth?.users || [])];
  const i = users.findIndex((u) => u.username.toLowerCase() === String(username).toLowerCase());
  if (i < 0) throw new Error('user not found');
  const { salt, hash } = await hashPassword(password);
  // A password reset must terminate every existing session for that account.
  users[i] = { ...users[i], salt, hash, tokenVersion: (Number(users[i].tokenVersion) || 0) + 1 };
  update({ auth: { users } });
  return { username: users[i].username, role: users[i].role };
}

export function setRole(username, role) {
  const users = [...(load().auth?.users || [])];
  const i = users.findIndex((u) => u.username.toLowerCase() === String(username).toLowerCase());
  if (i < 0) throw new Error('user not found');
  // Demoting an admin must take effect now, not in 30 days.
  users[i] = { ...users[i], role, tokenVersion: (Number(users[i].tokenVersion) || 0) + 1 };
  update({ auth: { users } });
  return { username: users[i].username, role };
}

export function deleteUser(username) {
  update({ auth: { users: (load().auth?.users || []).filter((u) => u.username.toLowerCase() !== String(username).toLowerCase()) } });
  return { ok: true };
}

export async function login(username, password) {
  const u = findUser(username);
  if (!u) {
    // Burn comparable CPU on an unknown username so response time does not
    // reveal whether the account exists.
    await scryptAsync(String(password || ''), 'nickseer-dummy-salt');
    return null;
  }
  if (!(await verifyPassword(password, u.salt, u.hash))) return null;
  return { token: makeToken(u), user: { username: u.username, role: u.role || 'user' } };
}

// Provision (or update) a user from a Plex identity. First-ever user becomes
// admin; the rest are regular users. Stores plexId/thumb/plexToken (so they can
// browse their own Plex server later).
export function upsertPlexUser(account) {
  const users = [...(load().auth?.users || [])];
  let uname = account.username || ('plex_' + account.id.slice(-6));
  const existing = users.find((u) => u.plexId === account.id) || users.find((u) => u.username.toLowerCase() === uname.toLowerCase());
  const role = existing ? existing.role : (users.length === 0 ? 'admin' : 'user');
  let tokenVersion = 0;
  if (existing) {
    const i = users.indexOf(existing);
    tokenVersion = Number(existing.tokenVersion) || 0;
    users[i] = { ...existing, plexId: account.id, thumb: account.thumb || existing.thumb || '', plexToken: account.token, email: account.email || existing.email || '', tokenVersion };
    uname = existing.username;
  } else {
    // ensure unique username
    let n = uname, k = 1; while (users.find((u) => u.username.toLowerCase() === n.toLowerCase())) n = uname + (++k);
    users.push({ username: n, role, plexId: account.id, thumb: account.thumb || '', plexToken: account.token, email: account.email || '', tokenVersion: 0 });
    uname = n;
  }
  update({ auth: { users } });
  const user = { username: uname, role, tokenVersion };
  return { token: makeToken(user), user: { username: uname, role } };
}

export function findByPlexId(id) { return (load().auth?.users || []).find((u) => u.plexId === id); }

export default { ensureSecret, hashPassword, verifyPassword, makeToken, verifyToken, listUsers, findUser, isEnabled, approvalsOn, hasAnyAdmin, createUser, setPassword, setRole, deleteUser, login, upsertPlexUser, findByPlexId };

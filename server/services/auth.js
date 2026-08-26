// auth.js — local accounts (scrypt) + HMAC tokens, plus Plex-user provisioning.
import crypto from 'crypto';
import { load, update } from '../config.js';

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function ensureSecret() {
  const c = load();
  if (!c.auth?.secret) { const secret = crypto.randomBytes(32).toString('hex'); update({ auth: { secret } }); return secret; }
  return c.auth.secret;
}
export function hashPassword(password) { const salt = crypto.randomBytes(16).toString('hex'); const hash = crypto.scryptSync(String(password), salt, 64).toString('hex'); return { salt, hash }; }
export function verifyPassword(password, salt, hash) { if (!salt || !hash) return false; const test = crypto.scryptSync(String(password), salt, 64).toString('hex'); const a = Buffer.from(test, 'hex'); const b = Buffer.from(hash, 'hex'); return a.length === b.length && crypto.timingSafeEqual(a, b); }

function sign(b64) { return crypto.createHmac('sha256', ensureSecret()).update(b64).digest('base64url'); }
export function makeToken(user) { const payload = { u: user.username, r: user.role || 'user', exp: Date.now() + TOKEN_TTL_MS }; const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url'); return `${b64}.${sign(b64)}`; }
export function verifyToken(token) { if (!token || typeof token !== 'string' || !token.includes('.')) return null; const [b64, sig] = token.split('.'); if (sign(b64) !== sig) return null; try { const p = JSON.parse(Buffer.from(b64, 'base64url').toString()); if (!p.exp || Date.now() > p.exp) return null; return { username: p.u, role: p.r }; } catch { return null; } }

export function listUsers() { return (load().auth?.users || []).map((u) => ({ username: u.username, role: u.role || 'user', plex: !!u.plexId, thumb: u.thumb || '' })); }
export function findUser(username) { return (load().auth?.users || []).find((u) => u.username.toLowerCase() === String(username).toLowerCase()); }
export function isEnabled() { return !!load().auth?.enabled; }
export function approvalsOn() { return !!load().auth?.approvals; }
export function hasAnyAdmin() { return (load().auth?.users || []).some((u) => (u.role || 'user') === 'admin'); }

export function createUser({ username, password, role = 'user' }) {
  username = String(username || '').trim();
  if (!username) throw new Error('username required');
  if (!password) throw new Error('password required');
  if (findUser(username)) throw new Error('user already exists');
  const { salt, hash } = hashPassword(password);
  update({ auth: { users: [...(load().auth?.users || []), { username, role, salt, hash }] } });
  return { username, role };
}
export function setPassword(username, password) {
  const users = [...(load().auth?.users || [])];
  const i = users.findIndex((u) => u.username.toLowerCase() === String(username).toLowerCase());
  if (i < 0) throw new Error('user not found');
  const { salt, hash } = hashPassword(password);
  users[i] = { ...users[i], salt, hash }; update({ auth: { users } });
  return { username: users[i].username, role: users[i].role };
}
export function setRole(username, role) {
  const users = [...(load().auth?.users || [])];
  const i = users.findIndex((u) => u.username.toLowerCase() === String(username).toLowerCase());
  if (i < 0) throw new Error('user not found');
  users[i] = { ...users[i], role }; update({ auth: { users } });
  return { username: users[i].username, role };
}
export function deleteUser(username) { update({ auth: { users: (load().auth?.users || []).filter((u) => u.username.toLowerCase() !== String(username).toLowerCase()) } }); return { ok: true }; }
export function login(username, password) { const u = findUser(username); if (!u || !verifyPassword(password, u.salt, u.hash)) return null; return { token: makeToken(u), user: { username: u.username, role: u.role || 'user' } }; }

// Provision (or update) a user from a Plex identity. First-ever user becomes
// admin; the rest are regular users. Stores plexId/thumb/plexToken (so they can
// browse their own Plex server later).
export function upsertPlexUser(account) {
  const users = [...(load().auth?.users || [])];
  let uname = account.username || ('plex_' + account.id.slice(-6));
  const existing = users.find((u) => u.plexId === account.id) || users.find((u) => u.username.toLowerCase() === uname.toLowerCase());
  const role = existing ? existing.role : (users.length === 0 ? 'admin' : 'user');
  if (existing) {
    const i = users.indexOf(existing);
    users[i] = { ...existing, plexId: account.id, thumb: account.thumb || existing.thumb || '', plexToken: account.token, email: account.email || existing.email || '' };
    uname = existing.username;
  } else {
    // ensure unique username
    let n = uname, k = 1; while (users.find((u) => u.username.toLowerCase() === n.toLowerCase())) n = uname + (++k);
    users.push({ username: n, role, plexId: account.id, thumb: account.thumb || '', plexToken: account.token, email: account.email || '' });
    uname = n;
  }
  update({ auth: { users } });
  const user = { username: uname, role };
  return { token: makeToken(user), user };
}
export function findByPlexId(id) { return (load().auth?.users || []).find((u) => u.plexId === id); }

export default { ensureSecret, hashPassword, verifyPassword, makeToken, verifyToken, listUsers, findUser, isEnabled, approvalsOn, hasAnyAdmin, createUser, setPassword, setRole, deleteUser, login, upsertPlexUser, findByPlexId };

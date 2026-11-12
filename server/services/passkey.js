// passkey.js — WebAuthn (Face ID / Touch ID / Windows Hello) sign-in, no
// dependencies.
//
// Registration is only ever done by a user who is ALREADY signed in, for their
// own account, with attestation "none". The browser hands us the new public
// key directly (AuthenticatorAttestationResponse.getPublicKey(), SPKI DER), so
// there is no CBOR/attestation parsing here — with attestation "none" that
// parsing would add no security, only code.
//
// Sign-in verifies, per the WebAuthn spec (§7.2):
//   * clientDataJSON.type === "webauthn.get"
//   * clientDataJSON.challenge is one WE issued, unused, < 5 minutes old
//   * clientDataJSON.origin's host is the rpId the credential was created for
//   * authenticatorData.rpIdHash === SHA-256(that rpId)
//   * User Present and User Verified flags are set (Face ID actually ran)
//   * signature over authenticatorData || SHA-256(clientDataJSON) verifies
//     against the stored public key
//   * the signature counter did not go backwards
//
// The rpId is pinned at registration and read back from storage at sign-in, so
// the request's Host header is never part of the trust decision.
//
// Storage: <CONFIG_DIR>/passkeys.json (public keys only — nothing secret).
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { CONFIG_DIR } from '../config.js';

const FILE = path.join(CONFIG_DIR, 'passkeys.json');
const CHALLENGE_TTL = 5 * 60 * 1000;
const MAX_PER_USER = 10;
const b64u = (b) => Buffer.from(b).toString('base64url');
const unb64u = (s) => Buffer.from(String(s || ''), 'base64url');
const sha256 = (b) => crypto.createHash('sha256').update(b).digest();

let state = null;
function read() {
  if (state) return state;
  try { state = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { state = {}; }
  if (!Array.isArray(state.creds)) state.creds = [];
  return state;
}
function write() {
  try {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, FILE);
  } catch (e) { console.warn('[passkey] could not save passkeys.json:', e.message); }
}

// ---- challenges (single use, in memory) -------------------------------------
const challenges = new Map();
function newChallenge(kind, username = '') {
  const now = Date.now();
  for (const [k, v] of challenges) if (v.exp < now) challenges.delete(k);
  if (challenges.size > 2000) challenges.clear();
  const c = b64u(crypto.randomBytes(32));
  challenges.set(c, { kind, username, exp: now + CHALLENGE_TTL });
  return c;
}
function takeChallenge(c, kind) {
  const v = challenges.get(c);
  challenges.delete(c);                      // single use, even on failure
  if (!v || v.kind !== kind || v.exp < Date.now()) return null;
  return v;
}

// ---- helpers ----------------------------------------------------------------
// rpId = the site's hostname (no port). Taken from the Origin the browser
// reports, which is what the authenticator binds the credential to.
function rpIdFromOrigin(origin) {
  const u = new URL(origin);
  if (u.protocol !== 'https:' && u.hostname !== 'localhost') throw new Error('passkeys need https');
  return u.hostname;
}
function parseClientData(clientDataJSON, type) {
  const raw = unb64u(clientDataJSON);
  let cd; try { cd = JSON.parse(raw.toString('utf8')); } catch { throw new Error('bad clientData'); }
  if (cd.type !== type) throw new Error('wrong ceremony type');
  if (typeof cd.challenge !== 'string' || typeof cd.origin !== 'string') throw new Error('bad clientData');
  return { cd, raw };
}
function parseAuthData(authenticatorData) {
  const ad = unb64u(authenticatorData);
  if (ad.length < 37) throw new Error('bad authenticator data');
  const flags = ad[32];
  return { ad, rpIdHash: ad.subarray(0, 32), up: !!(flags & 0x01), uv: !!(flags & 0x04), counter: ad.readUInt32BE(33) };
}

// ---- registration (signed-in user only) -------------------------------------
export function registerOptions(user, origin) {
  const rpId = rpIdFromOrigin(origin);
  const mine = read().creds.filter((c) => c.user.toLowerCase() === user.username.toLowerCase());
  return {
    challenge: newChallenge('create', user.username),
    rp: { name: 'NickSeer', id: rpId },
    user: { id: b64u(sha256('nickseer-user:' + user.username.toLowerCase()).subarray(0, 16)), name: user.username, displayName: user.username },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    attestation: 'none',
    timeout: 60000,
    excludeCredentials: mine.map((c) => ({ type: 'public-key', id: c.id }))
  };
}

export function registerVerify(user, body) {
  const { cd } = parseClientData(body.clientDataJSON, 'webauthn.create');
  const ch = takeChallenge(cd.challenge, 'create');
  if (!ch || ch.username.toLowerCase() !== user.username.toLowerCase()) throw new Error('challenge expired — try again');
  const rpId = rpIdFromOrigin(cd.origin);
  const a = parseAuthData(body.authenticatorData);
  if (!a.rpIdHash.equals(sha256(rpId))) throw new Error('credential is for a different site');
  if (!a.up || !a.uv) throw new Error('Face ID / device unlock was not confirmed');
  const alg = Number(body.publicKeyAlgorithm);
  if (alg !== -7 && alg !== -257) throw new Error('unsupported key type');
  const spki = unb64u(body.publicKey);
  let key;
  try { key = crypto.createPublicKey({ key: spki, format: 'der', type: 'spki' }); } catch { throw new Error('bad public key'); }
  const kt = key.asymmetricKeyType;
  if ((alg === -7 && (kt !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1')) || (alg === -257 && kt !== 'rsa')) throw new Error('key does not match its algorithm');
  const id = String(body.id || '');
  if (!id || unb64u(id).length < 16) throw new Error('bad credential id');

  const s = read();
  if (s.creds.some((c) => c.id === id)) throw new Error('this passkey is already registered');
  const mine = s.creds.filter((c) => c.user.toLowerCase() === user.username.toLowerCase());
  if (mine.length >= MAX_PER_USER) throw new Error('too many passkeys on this account — remove one first');
  s.creds.push({ id, user: user.username, rpId, alg, spki: b64u(spki), counter: a.counter, name: String(body.name || 'Passkey').slice(0, 60), at: Date.now() });
  write();
  return { ok: true, count: mine.length + 1 };
}

// ---- sign-in (no session yet) -----------------------------------------------
export function loginOptions(origin) {
  return { challenge: newChallenge('get'), rpId: rpIdFromOrigin(origin), userVerification: 'required', timeout: 60000, allowCredentials: [] };
}

// Returns the username the assertion proves. Throws on any failure.
export function loginVerify(body) {
  const { cd, raw } = parseClientData(body.clientDataJSON, 'webauthn.get');
  if (!takeChallenge(cd.challenge, 'get')) throw new Error('challenge expired — try again');
  const s = read();
  const cred = s.creds.find((c) => c.id === String(body.id || ''));
  if (!cred) throw new Error('this passkey is not registered here');
  let host; try { host = new URL(cd.origin).hostname; } catch { throw new Error('bad origin'); }
  if (host !== cred.rpId) throw new Error('passkey belongs to a different site');
  const a = parseAuthData(body.authenticatorData);
  if (!a.rpIdHash.equals(sha256(cred.rpId))) throw new Error('passkey belongs to a different site');
  if (!a.up || !a.uv) throw new Error('Face ID / device unlock was not confirmed');
  const key = crypto.createPublicKey({ key: unb64u(cred.spki), format: 'der', type: 'spki' });
  const signed = Buffer.concat([a.ad, sha256(raw)]);
  let ok = false;
  try { ok = crypto.verify('sha256', signed, key, unb64u(body.signature)); } catch { ok = false; }
  if (!ok) throw new Error('signature check failed');
  // Synced passkeys (iCloud Keychain) always report 0; a real counter must grow.
  if ((a.counter !== 0 || cred.counter !== 0) && a.counter <= cred.counter) throw new Error('passkey counter went backwards');
  cred.counter = a.counter; cred.usedAt = Date.now();
  write();
  return cred.user;
}

// ---- management ---------------------------------------------------------------
export function list(user) {
  return read().creds.filter((c) => c.user.toLowerCase() === user.username.toLowerCase()).map((c) => ({ id: c.id, name: c.name, at: c.at, usedAt: c.usedAt || null }));
}
export function removeAll(user) {
  const s = read(); const before = s.creds.length;
  s.creds = s.creds.filter((c) => c.user.toLowerCase() !== user.username.toLowerCase());
  if (s.creds.length !== before) write();
  return { ok: true, removed: before - s.creds.length };
}

export default { registerOptions, registerVerify, loginOptions, loginVerify, list, removeAll };

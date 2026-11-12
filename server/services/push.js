// push.js — Web Push for the installed app, with no dependencies.
//
//   * VAPID (RFC 8292): an ES256 JWT that identifies this server to the push
//     service (Apple / Google / Mozilla).
//   * Payload encryption (RFC 8291, aes128gcm content coding, RFC 8188).
//
// State lives in <CONFIG_DIR>/push.json — the VAPID key pair and one entry per
// subscribed device. It is NOT part of settings.json, so it is never returned
// by the settings API and never shipped in a config export.
//
// Who gets what:
//   pending    -> admins            "New request"
//   approved   -> the requester     "Request approved"
//   declined   -> the requester     "Request declined"
//   available  -> the requester     "Now available"
//   failed     -> the requester + admins
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { CONFIG_DIR } from '../config.js';

const FILE = path.join(CONFIG_DIR, 'push.json');
const MAX_SUBS_PER_USER = 8;
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const unb64u = (s) => Buffer.from(String(s), 'base64url');

let state = null;
function read() {
  if (state) return state;
  try { state = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { state = {}; }
  if (!Array.isArray(state.subs)) state.subs = [];
  return state;
}
function write() {
  try {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, FILE);
  } catch (e) { console.warn('[push] could not save push.json:', e.message); }
}

// ---- VAPID keys ------------------------------------------------------------
function vapid() {
  const s = read();
  if (s.vapid?.publicKey && s.vapid?.privateJwk) return s.vapid;
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  // Uncompressed P-256 point: 0x04 || X || Y — the form browsers expect as
  // applicationServerKey.
  const raw = Buffer.concat([Buffer.from([4]), unb64u(jwk.x), unb64u(jwk.y)]);
  s.vapid = { publicKey: b64u(raw), privateJwk: privateKey.export({ format: 'jwk' }) };
  write();
  return s.vapid;
}
export function publicKey() { return vapid().publicKey; }

function vapidHeader(endpoint, subject) {
  const v = vapid();
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const key = crypto.createPrivateKey({ key: v.privateJwk, format: 'jwk' });
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${v.publicKey}`;
}

// ---- RFC 8291 encryption ---------------------------------------------------
function hkdf(salt, ikm, info, len) {
  return Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len));
}
// Exported for the unit test (test/push.test.mjs decrypts it back).
export function encrypt(payload, p256dh, authSecret) {
  const uaPublic = unb64u(p256dh);          // 65 bytes
  const auth = unb64u(authSecret);          // 16 bytes
  const ecdh = crypto.createECDH('prime256v1');
  const asPublic = ecdh.generateKeys();     // 65 bytes
  const shared = ecdh.computeSecret(uaPublic);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hkdf(auth, shared, keyInfo, 32);
  const salt = crypto.randomBytes(16);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  // 0x02 = final-record delimiter, no extra padding.
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

// ---- subscriptions ---------------------------------------------------------
// Only real push services. Without this the endpoint would be an arbitrary
// URL the server POSTs to on demand (SSRF) — it is supplied by the browser.
const PUSH_HOSTS = [/\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];
function validEndpoint(endpoint) {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch { return false; }
}

export function subscribe(user, sub) {
  if (!sub || !validEndpoint(sub.endpoint)) throw new Error('unsupported push endpoint');
  const p256dh = sub.keys?.p256dh, auth = sub.keys?.auth;
  if (!p256dh || !auth || unb64u(p256dh).length !== 65 || unb64u(auth).length !== 16) throw new Error('invalid subscription keys');
  const s = read();
  const username = String(user?.username || '');
  s.subs = s.subs.filter((x) => x.endpoint !== sub.endpoint);
  s.subs.push({ user: username, endpoint: sub.endpoint, p256dh, auth, at: Date.now() });
  // Oldest devices fall off, so a user re-installing the app cannot grow this forever.
  const mine = s.subs.filter((x) => x.user === username);
  if (mine.length > MAX_SUBS_PER_USER) {
    const drop = new Set(mine.slice(0, mine.length - MAX_SUBS_PER_USER).map((x) => x.endpoint));
    s.subs = s.subs.filter((x) => !drop.has(x.endpoint));
  }
  write();
  return { ok: true };
}
export function unsubscribe(user, endpoint) {
  const s = read();
  const username = String(user?.username || '');
  const before = s.subs.length;
  s.subs = s.subs.filter((x) => !(x.endpoint === endpoint && x.user === username));
  if (s.subs.length !== before) write();
  return { ok: true };
}
export function countFor(user) {
  const username = String(user?.username || '');
  return read().subs.filter((x) => x.user === username).length;
}

// ---- sending ---------------------------------------------------------------
async function sendOne(sub, message, subject) {
  const body = encrypt(JSON.stringify(message), sub.p256dh, sub.auth);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: vapidHeader(sub.endpoint, subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'normal'
    },
    body,
    signal: AbortSignal.timeout(8000)
  });
  return res.status;
}

export async function sendTo(usernames, message, { subject = 'mailto:admin@nickseer.invalid' } = {}) {
  const want = new Set([...usernames].map((u) => String(u).toLowerCase()));
  const s = read();
  const targets = s.subs.filter((x) => want.has(x.user.toLowerCase()));
  const dead = new Set();
  let sent = 0;
  await Promise.allSettled(targets.map(async (sub) => {
    try {
      const status = await sendOne(sub, message, subject);
      if (status === 404 || status === 410) dead.add(sub.endpoint);   // device unsubscribed
      else if (status >= 200 && status < 300) sent++;
      else console.warn(`[push] ${new URL(sub.endpoint).hostname} answered ${status}`);
    } catch (e) { console.warn('[push] send failed:', e.message); }
  }));
  if (dead.size) { s.subs = s.subs.filter((x) => !dead.has(x.endpoint)); write(); }
  return { targets: targets.length, sent, removed: dead.size };
}

// Maps the app's existing notification types (the same ones Telegram/Discord
// receive) onto push messages. `admins` is a list of admin usernames.
export function messageFor(type, d = {}) {
  const title = d.title || 'A title';
  const by = d.by || 'someone';
  switch (type) {
    case 'pending':   return { to: 'admins',    title: 'New request',       body: `${by} requested ${title}`,            tag: 'req-' + (d.id || title) };
    case 'approved':  return { to: 'requester', title: 'Request approved',  body: `${title} is on its way`,              tag: 'req-' + (d.id || title) };
    case 'declined':  return { to: 'requester', title: 'Request declined',  body: `${title} was declined`,               tag: 'req-' + (d.id || title) };
    case 'available': return { to: 'requester', title: 'Now available',     body: `${title} is ready to watch`,          tag: 'avail-' + title };
    case 'failed':    return { to: 'both',      title: 'Request failed',    body: `${title} could not be added`,         tag: 'fail-' + title };
    default: return null;
  }
}

export async function notify(type, d = {}, admins = []) {
  try {
    const m = messageFor(type, d);
    if (!m) return null;
    if (!read().subs.length) return null;
    const to = new Set();
    if (m.to === 'admins' || m.to === 'both') admins.forEach((a) => to.add(a));
    if ((m.to === 'requester' || m.to === 'both') && d.by) to.add(d.by);
    // Nobody needs a push about their own action.
    if (d.decidedBy && type !== 'available') to.delete(d.decidedBy);
    if (type === 'pending' && d.by) to.delete(d.by);
    if (!to.size) return null;
    return await sendTo(to, { title: m.title, body: m.body, tag: m.tag, url: '/#requests' });
  } catch (e) { console.warn('[push] notify failed:', e.message); return null; }
}

export default { publicKey, subscribe, unsubscribe, countFor, sendTo, notify, messageFor, encrypt };

// Round-trip test for server/services/push.js: plays the browser's side of
// RFC 8291 (decrypt) and the push service's side of RFC 8292 (verify the JWT).
//   node test/push.test.mjs
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'assert';

process.env.CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-push-'));
const push = (await import('../server/services/push.js')).default;

// --- a fake browser subscription
const ua = crypto.createECDH('prime256v1'); const uaPub = ua.generateKeys();
const auth = crypto.randomBytes(16);
const b64u = (b) => Buffer.from(b).toString('base64url');
const hkdf = (salt, ikm, info, len) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len));

// --- decrypt what the server produced
const msg = JSON.stringify({ title: 'Now available', body: 'Dune is ready to watch' });
const rec = push.encrypt(msg, b64u(uaPub), b64u(auth));
const salt = rec.subarray(0, 16), rs = rec.readUInt32BE(16), idlen = rec[20];
const asPub = rec.subarray(21, 21 + idlen), body = rec.subarray(21 + idlen);
assert.equal(rs, 4096); assert.equal(idlen, 65);
const shared = ua.computeSecret(asPub);
const ikm = hkdf(auth, shared, Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub]), 32);
const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
d.setAuthTag(body.subarray(body.length - 16));
const plain = Buffer.concat([d.update(body.subarray(0, body.length - 16)), d.final()]);
assert.equal(plain[plain.length - 1], 2, 'final-record delimiter');
assert.equal(plain.subarray(0, -1).toString(), msg);
console.log('ok  payload decrypts with the browser keys');

// --- subscription validation
const sub = { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: b64u(uaPub), auth: b64u(auth) } };
assert.throws(() => push.subscribe({ username: 'nick' }, { ...sub, endpoint: 'https://evil.example/x' }), /unsupported/);
assert.throws(() => push.subscribe({ username: 'nick' }, { ...sub, endpoint: 'http://web.push.apple.com/x' }), /unsupported/);
assert.throws(() => push.subscribe({ username: 'nick' }, { ...sub, keys: { p256dh: 'AAAA', auth: b64u(auth) } }), /invalid/);
push.subscribe({ username: 'nick' }, sub);
push.subscribe({ username: 'nick' }, sub);                      // same device twice = one entry
assert.equal(push.countFor({ username: 'nick' }), 1);
push.unsubscribe({ username: 'maria' }, sub.endpoint);          // someone else cannot remove it
assert.equal(push.countFor({ username: 'nick' }), 1);
console.log('ok  subscription rules');

// --- VAPID header + routing, with fetch intercepted (nothing leaves the machine)
const calls = [];
globalThis.fetch = async (url, init) => { calls.push({ url, init }); return { status: url.includes('gone') ? 410 : 201 }; };
push.subscribe({ username: 'maria' }, { ...sub, endpoint: 'https://fcm.googleapis.com/fcm/send/gone' });
let r = await push.notify('pending', { title: 'Dune', by: 'maria', id: 'r1' }, ['nick']);
assert.deepEqual({ t: r.targets, s: r.sent }, { t: 1, s: 1 });   // admin only, not the requester
assert.equal(calls[0].url, sub.endpoint);
const h = calls[0].init.headers;
assert.equal(h['Content-Encoding'], 'aes128gcm');
const m = /^vapid t=([^,]+), k=(.+)$/.exec(h.Authorization);
const [jh, jb, js] = m[1].split('.');
const k = Buffer.from(m[2], 'base64url');
const pub = crypto.createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: b64u(k.subarray(1, 33)), y: b64u(k.subarray(33, 65)) } });
assert.ok(crypto.verify('sha256', Buffer.from(`${jh}.${jb}`), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(js, 'base64url')), 'JWT signature');
const claims = JSON.parse(Buffer.from(jb, 'base64url'));
assert.equal(claims.aud, 'https://web.push.apple.com'); assert.ok(claims.exp > Date.now() / 1000);
assert.equal(m[2], push.publicKey());
console.log('ok  VAPID JWT verifies against the published key');

r = await push.notify('available', { title: 'Dune', by: 'maria' }, ['nick']);
assert.deepEqual({ t: r.targets, s: r.sent, x: r.removed }, { t: 1, s: 0, x: 1 });   // 410 => device dropped
assert.equal(push.countFor({ username: 'maria' }), 0);
assert.equal(await push.notify('approved', { title: 'Dune', by: 'nick', decidedBy: 'nick' }, ['nick']), null);  // own action
assert.equal(await push.notify('systemTemp', {}, ['nick']), null);
console.log('ok  routing, dead-device cleanup');

const saved = JSON.parse(fs.readFileSync(path.join(process.env.CONFIG_DIR, 'push.json'), 'utf8'));
assert.ok(saved.vapid.privateJwk.d && saved.subs.length === 1);
fs.rmSync(process.env.CONFIG_DIR, { recursive: true, force: true });
console.log('ALL PASS');

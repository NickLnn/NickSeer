// Plays the part of a browser + authenticator against server/services/passkey.js.
//   node test/passkey.test.mjs
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'assert';

process.env.CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-pk-'));
const pk = (await import('../server/services/passkey.js')).default;

const b64u = (b) => Buffer.from(b).toString('base64url');
const sha256 = (b) => crypto.createHash('sha256').update(b).digest();
const ORIGIN = 'https://seer.example.com';
const RP = 'seer.example.com';

function authData(rpId, { up = true, uv = true, counter = 0 } = {}) {
  const c = Buffer.alloc(4); c.writeUInt32BE(counter);
  return Buffer.concat([sha256(rpId), Buffer.from([(up ? 1 : 0) | (uv ? 4 : 0)]), c]);
}
const clientData = (type, challenge, origin = ORIGIN) => Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));

// A device with one key.
function device() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const id = b64u(crypto.randomBytes(32));
  return {
    id, privateKey,
    register(opts, over = {}) {
      return { id, name: 'iPhone', publicKeyAlgorithm: -7, publicKey: b64u(publicKey.export({ format: 'der', type: 'spki' })),
        clientDataJSON: b64u(clientData('webauthn.create', opts.challenge, over.origin)), authenticatorData: b64u(authData(over.rpId || RP, over)) };
    },
    assert(opts, over = {}) {
      const ad = authData(over.rpId || RP, over);
      const cd = clientData(over.type || 'webauthn.get', opts.challenge, over.origin);
      const signature = crypto.sign('sha256', Buffer.concat([ad, sha256(cd)]), over.key || privateKey);
      return { id: over.id || id, clientDataJSON: b64u(cd), authenticatorData: b64u(ad), signature: b64u(signature) };
    }
  };
}

const nick = { username: 'nick', role: 'admin' }, maria = { username: 'maria', role: 'user' };
const phone = device();

// --- registration
let o = pk.registerOptions(nick, ORIGIN);
assert.equal(o.rp.id, RP); assert.equal(o.authenticatorSelection.userVerification, 'required');
assert.throws(() => pk.registerVerify(maria, phone.register(o)), /challenge/);          // someone else's challenge
o = pk.registerOptions(nick, ORIGIN);
assert.throws(() => pk.registerVerify(nick, phone.register(o, { uv: false })), /not confirmed/);
o = pk.registerOptions(nick, ORIGIN);
assert.throws(() => pk.registerVerify(nick, phone.register(o, { rpId: 'evil.example' })), /different site/);
o = pk.registerOptions(nick, ORIGIN);
assert.equal(pk.registerVerify(nick, phone.register(o)).count, 1);
assert.throws(() => pk.registerVerify(nick, phone.register(o)), /challenge/);            // replayed challenge
o = pk.registerOptions(nick, ORIGIN);
assert.throws(() => pk.registerVerify(nick, phone.register(o)), /already registered/);
assert.equal(pk.registerOptions(nick, ORIGIN).excludeCredentials.length, 1);
assert.throws(() => pk.registerOptions(nick, 'http://192.168.1.5:5056'), /https/);
console.log('ok  registration rules');

// --- sign-in
const login = () => pk.loginOptions(ORIGIN);
assert.equal(pk.loginVerify(phone.assert(login())), 'nick');
console.log('ok  valid assertion signs in as the owner');

const bad = (over, re, label) => { assert.throws(() => pk.loginVerify(phone.assert(login(), over)), re, label); };
bad({ key: device().privateKey }, /signature/, 'wrong key');
bad({ id: b64u(crypto.randomBytes(32)) }, /not registered/, 'unknown credential');
bad({ origin: 'https://evil.example' }, /different site/, 'phishing origin');
bad({ rpId: 'evil.example' }, /different site/, 'rpIdHash mismatch');
bad({ uv: false }, /not confirmed/, 'no Face ID');
bad({ up: false }, /not confirmed/, 'no presence');
bad({ type: 'webauthn.create' }, /ceremony/, 'wrong type');
const used = login(); const a1 = phone.assert(used);
assert.equal(pk.loginVerify(a1), 'nick');
assert.throws(() => pk.loginVerify(a1), /challenge/, 'replay');
assert.throws(() => pk.loginVerify(phone.assert({ challenge: b64u(crypto.randomBytes(32)) })), /challenge/, 'forged challenge');
// tampered clientData after signing
const t = phone.assert(login()); t.clientDataJSON = b64u(Buffer.from(Buffer.from(t.clientDataJSON, 'base64url').toString().replace('false', 'true')));
assert.throws(() => pk.loginVerify(t), /signature/, 'tampered clientData');
console.log('ok  8 attack cases rejected');

// --- counter
assert.equal(pk.loginVerify(phone.assert(login(), { counter: 5 })), 'nick');
assert.throws(() => pk.loginVerify(phone.assert(login(), { counter: 5 })), /counter/);
assert.throws(() => pk.loginVerify(phone.assert(login(), { counter: 0 })), /counter/);
assert.equal(pk.loginVerify(phone.assert(login(), { counter: 6 })), 'nick');
console.log('ok  counter');

// --- management is per-user
assert.equal(pk.list(maria).length, 0); assert.equal(pk.list(nick).length, 1);
assert.equal(pk.removeAll(maria).removed, 0);
assert.equal(pk.removeAll(nick).removed, 1);
assert.throws(() => pk.loginVerify(phone.assert(login())), /not registered/);
const saved = fs.readFileSync(path.join(process.env.CONFIG_DIR, 'passkeys.json'), 'utf8');
assert.ok(!/"d"\s*:/.test(saved));
fs.rmSync(process.env.CONFIG_DIR, { recursive: true, force: true });
console.log('ALL PASS');

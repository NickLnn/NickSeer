// passkey-client.js — Face ID / Touch ID / Windows Hello sign-in (WebAuthn).
// Functions only, no side effects on import.
import { authToken } from './util.js';

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob(b64); const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out.buffer;
};
const post = (url, body, withAuth) => {
  const t = authToken();
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(withAuth && t ? { Authorization: 'Bearer ' + t } : {}) }, body: JSON.stringify(body || {}) }).then((r) => r.json());
};

// Needs https (or localhost) and a browser with WebAuthn.
export function passkeySupported() {
  return !!(window.isSecureContext && window.PublicKeyCredential && navigator.credentials);
}

function friendly(e) {
  if (e && e.name === 'NotAllowedError') return 'Cancelled.';
  if (e && e.name === 'InvalidStateError') return 'This device already has a passkey for this account.';
  return (e && e.message) || 'Something went wrong.';
}

// What to call it on this device.
export function passkeyLabel() {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'Face ID';
  if (/Mac/i.test(ua)) return 'Touch ID';
  if (/Windows/i.test(ua)) return 'Windows Hello';
  if (/Android/i.test(ua)) return 'fingerprint';
  return 'a passkey';
}

// Sign in. Resolves { ok, token, user } or { ok:false, error, cancelled }.
export async function passkeyLogin() {
  try {
    const o = await post('/api/auth/passkey/login/options');
    if (!o.ok) return { ok: false, error: o.error || 'Could not start' };
    const cred = await navigator.credentials.get({ publicKey: {
      challenge: unb64u(o.options.challenge), rpId: o.options.rpId,
      userVerification: o.options.userVerification, timeout: o.options.timeout, allowCredentials: []
    } });
    const r = cred.response;
    return await post('/api/auth/passkey/login/verify', {
      id: cred.id, clientDataJSON: b64u(r.clientDataJSON), authenticatorData: b64u(r.authenticatorData), signature: b64u(r.signature)
    });
  } catch (e) { return { ok: false, error: friendly(e), cancelled: e && e.name === 'NotAllowedError' }; }
}

// Add a passkey for the signed-in account on this device.
export async function passkeyRegister() {
  try {
    const o = await post('/api/auth/passkey/register/options', {}, true);
    if (!o.ok) return { ok: false, error: o.error || 'Could not start' };
    const p = o.options;
    const cred = await navigator.credentials.create({ publicKey: {
      challenge: unb64u(p.challenge), rp: p.rp,
      user: { id: unb64u(p.user.id), name: p.user.name, displayName: p.user.displayName },
      pubKeyCredParams: p.pubKeyCredParams, authenticatorSelection: p.authenticatorSelection,
      attestation: p.attestation, timeout: p.timeout,
      excludeCredentials: (p.excludeCredentials || []).map((c) => ({ type: 'public-key', id: unb64u(c.id) }))
    } });
    const r = cred.response;
    if (typeof r.getPublicKey !== 'function' || typeof r.getAuthenticatorData !== 'function') return { ok: false, error: 'This browser is too old for passkeys.' };
    return await post('/api/auth/passkey/register/verify', {
      id: cred.id, name: passkeyLabel(),
      clientDataJSON: b64u(r.clientDataJSON), authenticatorData: b64u(r.getAuthenticatorData()),
      publicKey: b64u(r.getPublicKey()), publicKeyAlgorithm: r.getPublicKeyAlgorithm()
    }, true);
  } catch (e) { return { ok: false, error: friendly(e), cancelled: e && e.name === 'NotAllowedError' }; }
}

export async function passkeyCount() {
  const t = authToken(); if (!t) return 0;
  try { const r = await fetch('/api/auth/passkey/list', { headers: { Authorization: 'Bearer ' + t } }).then((x) => x.json()); return r.ok ? r.passkeys.length : 0; }
  catch { return 0; }
}
export async function passkeyRemoveAll() { return post('/api/auth/passkey/remove', {}, true); }

export default { passkeySupported, passkeyLabel, passkeyLogin, passkeyRegister, passkeyCount, passkeyRemoveAll };

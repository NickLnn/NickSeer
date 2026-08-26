// plexauth.js — "Sign in with Plex" (OAuth PIN flow).
// 1) create a PIN → returns {id, code}; the UI redirects the browser to
//    app.plex.tv/auth#?clientID=...&code=...&forwardUrl=...
// 2) after the user approves, we poll the PIN by id → get the authToken
// 3) fetch the Plex account (username/email/thumb) with that token
// A NickSeer user is then auto-provisioned from the Plex identity.
import crypto from 'crypto';
import { load, update } from '../config.js';

const PLEX_API = 'https://plex.tv/api/v2';
const PRODUCT = 'NickSeer';

function clientId() {
  const c = load();
  if (c.plexAuth?.clientId) return c.plexAuth.clientId;
  const id = crypto.randomUUID();
  update({ plexAuth: { clientId: id } });
  return id;
}

function headers() {
  return {
    accept: 'application/json',
    'X-Plex-Product': PRODUCT,
    'X-Plex-Client-Identifier': clientId()
  };
}

// Step 1 — create a strong PIN.
export async function createPin() {
  const res = await fetch(`${PLEX_API}/pins?strong=true`, { method: 'POST', headers: headers() });
  if (!res.ok) throw new Error(`plex pins ${res.status}`);
  const data = await res.json();
  return { id: data.id, code: data.code, clientId: clientId(), product: PRODUCT };
}

// Step 2 — poll a PIN; returns authToken once claimed (else null).
export async function checkPin(id) {
  const url = new URL(`${PLEX_API}/pins/${id}`);
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`plex pin ${res.status}`);
  const data = await res.json();
  return data.authToken || null;
}

// Step 3 — resolve the Plex account for a token.
export async function accountFor(token) {
  const res = await fetch(`${PLEX_API}/user`, { headers: { ...headers(), 'X-Plex-Token': token } });
  if (!res.ok) throw new Error(`plex user ${res.status}`);
  const u = await res.json();
  return {
    id: String(u.id || u.uuid || ''),
    username: u.username || u.title || u.friendlyName || 'plexuser',
    email: u.email || '',
    thumb: u.thumb || '',
    token
  };
}

// Build the hosted auth URL the browser must visit.
export function authUrl(code, forwardUrl) {
  const params = new URLSearchParams();
  params.set('clientID', clientId());
  params.set('code', code);
  params.set('context[device][product]', PRODUCT);
  if (forwardUrl) params.set('forwardUrl', forwardUrl);
  return `https://app.plex.tv/auth#?${params.toString()}`;
}

export default { createPin, checkPin, accountFor, authUrl, clientId };

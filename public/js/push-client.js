// push-client.js — turns Web Push on/off for THIS device.
// Functions only, no side effects on import (menu.js imports it un-stamped).
import { authToken } from './util.js';

const hdrs = () => { const t = authToken(); return { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }; };

// 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on'
export async function pushStatus() {
  const hasSW = 'serviceWorker' in navigator;
  const hasPush = 'PushManager' in window && 'Notification' in window;
  if (!hasSW || !hasPush) {
    // iPhone/iPad only expose push to the app installed on the Home Screen.
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    return ios && !standalone ? 'needs-install' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    return sub && Notification.permission === 'granted' ? 'on' : 'off';
  } catch { return 'off'; }
}

function keyBytes(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob(b64); const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// MUST be called straight from a tap: iOS only shows the permission prompt
// while the gesture is live, so requestPermission() comes before any await.
export async function enablePush() {
  const ask = Notification.requestPermission();
  const perm = await ask;
  if (perm !== 'granted') return { ok: false, error: perm === 'denied' ? 'Notifications are blocked for NickSeer in this device’s settings.' : 'Permission was not given.' };
  const k = await fetch('/api/push/key', { headers: hdrs() }).then((r) => r.json());
  if (!k.ok) return { ok: false, error: k.error || 'Server has no push key' };
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(k.publicKey) });
  const r = await fetch('/api/push/subscribe', { method: 'POST', headers: hdrs(), body: JSON.stringify({ subscription: sub.toJSON() }) }).then((x) => x.json());
  if (!r.ok) return { ok: false, error: r.error || 'Could not register this device' };
  // Proves the whole chain end to end, right away.
  fetch('/api/push/test', { method: 'POST', headers: hdrs() }).catch(() => {});
  return { ok: true };
}

export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      await fetch('/api/push/unsubscribe', { method: 'POST', headers: hdrs(), body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
      await sub.unsubscribe();
    }
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

export default { pushStatus, enablePush, disablePush };

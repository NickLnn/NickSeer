// Gluetun — VPN health via its built-in control server (HTTP API on port 8000).
// Gluetun v3.40+ makes control-server routes private by default, so we send an
// API key (X-API-Key) or HTTP basic auth depending on what the user configured.
import { load } from '../config.js';

function cfg() {
  const { services } = load();
  const s = services.gluetun;
  if (!s || !s.url) throw new Error('gluetun not configured');
  return { base: s.url.replace(/\/+$/, ''), s };
}

function authHeaders(s) {
  const h = {};
  if (s.apikey) h['X-API-Key'] = s.apikey;
  else if (s.username && s.password) h['Authorization'] = 'Basic ' + Buffer.from(`${s.username}:${s.password}`).toString('base64');
  return h;
}

async function call(pathname) {
  const { base, s } = cfg();
  const res = await fetch(base + pathname, { headers: authHeaders(s) });
  if (res.status === 401 || res.status === 403) throw new Error(`${res.status}: Unauthorized — Gluetun needs an API key. Generate one with "docker run --rm qmcgaw/gluetun genkey" and set it on both Gluetun and here.`);
  if (!res.ok) throw new Error(`gluetun ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function test() {
  const ip = await call('/v1/publicip/ip');
  return { ok: true, status: ip?.public_ip ? 'connected' : 'unknown', ip: ip?.public_ip };
}

export async function status() {
  const out = { vpn: null, ip: null, city: null, country: null };
  try { const s = await call('/v1/openvpn/status'); out.vpn = s?.status; } catch { /* wireguard */ }
  try {
    const ip = await call('/v1/publicip/ip');
    out.ip = ip?.public_ip; out.city = ip?.city; out.country = ip?.country;
    if (out.vpn == null) out.vpn = ip?.public_ip ? 'running' : 'unknown';
  } catch (e) { if (out.vpn == null) throw e; }
  return out;
}

export default { test, status };

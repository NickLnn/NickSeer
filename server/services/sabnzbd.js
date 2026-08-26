// SABnzbd — Usenet download state for the live status dashboard.
// Returns the TOTAL aggregate download speed plus per-item progress.
import { load } from '../config.js';

function cfg() {
  const { services } = load();
  const s = services.sabnzbd;
  if (!s || !s.url || !s.apikey) throw new Error('sabnzbd not configured');
  return { base: s.url.replace(/\/+$/, ''), key: s.apikey };
}

async function call(mode, params = {}) {
  const { base, key } = cfg();
  const url = new URL(base + '/api');
  url.searchParams.set('apikey', key);
  url.searchParams.set('output', 'json');
  url.searchParams.set('mode', mode);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`sabnzbd ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function test() { const d = await call('version'); return { ok: true, version: d?.version }; }

export async function queue() {
  const data = await call('queue');
  const q = data?.queue || {};
  // SAB reports human speed (e.g. "95.0 M") and kbpersec (numeric KB/s).
  const kbps = Number(q.kbpersec || 0);
  return {
    status: q.status,
    speed: q.speed,                       // e.g. "95.0 M"
    speedBps: kbps * 1024,                // bytes/sec for our own formatting
    totalSpeed: formatSpeed(kbps),        // e.g. "95.0 MB/s"
    sizeLeft: q.sizeleft,
    timeLeft: q.timeleft,
    eta: q.eta,
    paused: q.paused,
    mbLeft: Number(q.mbleft || 0),
    count: (q.slots || []).length,
    slots: (q.slots || []).map((s) => ({
      name: s.filename, percent: Number(s.percentage), size: s.size, timeLeft: s.timeleft, status: s.status
    }))
  };
}

function formatSpeed(kbps) {
  if (!kbps) return '0 KB/s';
  if (kbps >= 1024) return (kbps / 1024).toFixed(1) + ' MB/s';
  return kbps.toFixed(0) + ' KB/s';
}

export default { test, queue };

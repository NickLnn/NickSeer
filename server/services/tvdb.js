// TVDB service helper for optional series metadata enrichment.
// This is intentionally lightweight: NickSeer does not require TVDB for
// normal operation, but it can keep a dedicated API key ready for external
// Requestrr/Overseerr compatibility and richer TV lookups.
import { load } from '../config.js';

function tvdbKey() {
  return load().tvdb?.apiKey || '';
}

async function fetchWithTimeout(url, opts = {}, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

export async function test() {
  const key = tvdbKey();
  if (!key) throw new Error('TVDB key not configured');

  const res = await fetchWithTimeout('https://api4.thetvdb.com/v4/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apikey: key })
  });

  if (!res.ok) {
    let detail = '';
    try { const data = await res.json(); detail = data?.error || data?.message || ''; } catch { detail = await res.text(); }
    throw new Error(detail || `TVDB auth failed (${res.status})`);
  }

  const data = await res.json();
  if (!data?.data?.token) {
    throw new Error('TVDB response did not include a token');
  }

  return { ok: true, provider: 'TVDB', sample: 'API authentication successful' };
}

export async function login() {
  const key = tvdbKey();
  if (!key) throw new Error('TVDB key not configured');

  const res = await fetchWithTimeout('https://api4.thetvdb.com/v4/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apikey: key })
  });

  if (!res.ok) {
    let detail = '';
    try { const data = await res.json(); detail = data?.error || data?.message || ''; } catch { detail = await res.text(); }
    throw new Error(detail || `TVDB login failed (${res.status})`);
  }

  const data = await res.json();
  return data?.data?.token || null;
}

export default { test, login };

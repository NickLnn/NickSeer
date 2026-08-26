// Plex — taste signal + library ownership + library detail (counts + matched %)
// + a force-scan trigger. Self-contained (config + cache lib only).
import { load } from '../config.js';
import { cached, TTL_DAY, del } from '../lib/cache.js';

function cfg() {
  const { services } = load();
  const s = services.plex;
  if (!s || !s.url || !s.token) throw new Error('plex not configured');
  return { base: s.url.replace(/\/+$/, ''), token: s.token };
}

async function call(pathname, params = {}) {
  const { base, token } = cfg();
  const url = new URL(base + pathname);
  url.searchParams.set('X-Plex-Token', token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`plex ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function test() { const data = await call('/'); const mc = data?.MediaContainer || {}; return { ok: true, server: mc.friendlyName, version: mc.version }; }
export const sections = () => call('/library/sections');

export async function history(limit = 300) {
  const data = await call('/status/sessions/history/all', { sort: 'viewedAt:desc', 'X-Plex-Container-Start': 0, 'X-Plex-Container-Size': limit });
  const items = data?.MediaContainer?.Metadata || [];
  return items.map((m) => ({ title: m.title || m.grandparentTitle, type: m.type === 'episode' ? 'show' : m.type, grandparentTitle: m.grandparentTitle, year: m.year, viewedAt: m.viewedAt, guid: m.guid }));
}

function tmdbIdFromItem(it) {
  for (const g of (it.Guid || [])) { const id = String(g.id || ''); if (id.startsWith('tmdb://')) return id.slice(7).split('?')[0]; }
  const p = String(it.guid || ''); const m = p.match(/themoviedb:\/\/(\d+)/) || p.match(/tmdb:\/\/(\d+)/); return m ? m[1] : null;
}

// Full scan → both the ownership map AND per-section detail with matched counts.
async function scan() {
  const map = {};
  const sectionsOut = [];
  let server = '';
  try {
    const root = await call('/'); server = root?.MediaContainer?.friendlyName || '';
    const secs = (await sections())?.MediaContainer?.Directory || [];
    for (const sec of secs) {
      if (!['movie', 'show'].includes(sec.type)) continue;
      const all = await call(`/library/sections/${sec.key}/all`, { includeGuids: 1 });
      const items = all?.MediaContainer?.Metadata || [];
      let matched = 0, episodes = 0;
      for (const it of items) {
        const id = tmdbIdFromItem(it);
        if (id) { matched++; map[String(id)] = { type: it.type === 'show' ? 'show' : 'movie', leafCount: Number(it.leafCount || 0), childCount: Number(it.childCount || 0) }; }
        if (it.type === 'show') episodes += Number(it.leafCount || 0);
      }
      sectionsOut.push({ key: sec.key, title: sec.title, type: sec.type, total: items.length, matched, episodes, percent: items.length ? Math.round((matched / items.length) * 100) : 0 });
    }
  } catch (e) { console.warn('[plex] scan failed:', e.message); }
  return { map, detail: { server, sections: sectionsOut, scannedAt: Date.now() } };
}

// Cache both the map and detail together (one scan feeds both).
async function scanCached(force) { return cached('plex:scan', TTL_DAY, scan, force); }

export async function libraryMap(force = false) { return (await scanCached(force)).map; }
export async function libraryTmdbIds(force = false) { return new Set(Object.keys(await libraryMap(force))); }
export async function libraryDetail(force = false) { return (await scanCached(force)).detail; }
export function invalidateLibrary() { del('plex:scan'); del('plex:librarymap'); del('plex:stats'); }

// Force a Plex-side refresh of every movie/show section, then bust our cache so
// the next read re-scans fresh.
export async function forceScan() {
  const secs = (await sections())?.MediaContainer?.Directory || [];
  const scanned = [];
  for (const sec of secs) {
    if (!['movie', 'show'].includes(sec.type)) continue;
    try { await call(`/library/sections/${sec.key}/refresh`); scanned.push(sec.title); } catch { /* ignore per-section */ }
  }
  invalidateLibrary();
  // Rebuild our detail cache immediately (best-effort).
  let detail = null;
  try { detail = await libraryDetail(true); } catch { /* ignore */ }
  return { ok: true, triggered: scanned, detail };
}

export default { test, sections, history, libraryMap, libraryTmdbIds, libraryDetail, invalidateLibrary, forceScan };

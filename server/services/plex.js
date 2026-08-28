// Plex — taste signal + library ownership + library detail (counts + matched %)
// + custom server/section filtering and force-scan trigger.
import { load } from '../config.js';
import { cached, TTL_DAY, del } from '../lib/cache.js';

function cfg(custom = {}) {
  if (custom.url && custom.token) return { base: custom.url.replace(/\/+$/, ''), token: custom.token };
  if (custom.url) return { base: custom.url.replace(/\/+$/, ''), token: load().services?.plex?.token || '' };
  const { services } = load();
  const s = services.plex;
  if (!s || !s.url || !s.token) throw new Error('plex not configured');
  return { base: s.url.replace(/\/+$/, ''), token: s.token };
}

async function call(pathname, params = {}, custom = {}) {
  const { base, token } = cfg(custom);
  const url = new URL(base + pathname);
  url.searchParams.set('X-Plex-Token', token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`plex ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function test(custom = {}) {
  const data = await call('/', {}, custom);
  const mc = data?.MediaContainer || {};
  return { ok: true, server: mc.friendlyName || 'Plex Server', version: mc.version };
}

export const sections = (custom = {}) => call('/library/sections', {}, custom);

export async function testWithSections(custom = {}) {
  const [testRes, secRes] = await Promise.all([
    test(custom),
    sections(custom).catch(() => ({ MediaContainer: { Directory: [] } }))
  ]);
  const rawDirs = secRes?.MediaContainer?.Directory || [];
  const validSections = rawDirs
    .filter(d => ['movie', 'show'].includes(d.type))
    .map(d => ({
      key: String(d.key),
      title: d.title,
      type: d.type
    }));
  return {
    ok: true,
    server: testRes.server,
    version: testRes.version,
    sections: validSections
  };
}

export async function history(limit = 300) {
  const data = await call('/status/sessions/history/all', { sort: 'viewedAt:desc', 'X-Plex-Container-Start': 0, 'X-Plex-Container-Size': limit });
  const items = data?.MediaContainer?.Metadata || [];
  return items.map((m) => ({ title: m.title || m.grandparentTitle, type: m.type === 'episode' ? 'show' : m.type, grandparentTitle: m.grandparentTitle, year: m.year, viewedAt: m.viewedAt, guid: m.guid }));
}

function tmdbIdFromItem(it) {
  for (const g of (it.Guid || [])) { const id = String(g.id || ''); if (id.startsWith('tmdb://')) return id.slice(7).split('?')[0]; }
  const p = String(it.guid || ''); const m = p.match(/themoviedb:\/\/(\d+)/) || p.match(/tmdb:\/\/(\d+)/); return m ? m[1] : null;
}

// Full scan — both the ownership map AND per-section detail with matched counts.
async function scan() {
  const map = {};
  const sectionsOut = [];
  let server = 'Plex';
  const { services } = load();
  const selectedLibs = services.plex?.selectedLibraries;

  try {
    const root = await call('/');
    server = root?.MediaContainer?.friendlyName || 'Plex';
    const secs = (await sections())?.MediaContainer?.Directory || [];

    for (const sec of secs) {
      if (!['movie', 'show'].includes(sec.type)) continue;

      // If user selected specific libraries in Settings, filter to only those
      if (Array.isArray(selectedLibs) && selectedLibs.length > 0) {
        const isSelected = selectedLibs.includes(String(sec.key)) || selectedLibs.includes(sec.title);
        if (!isSelected) continue;
      }

      const all = await call(`/library/sections/${sec.key}/all`, { includeGuids: 1 });
      const items = all?.MediaContainer?.Metadata || [];
      let matched = 0, episodes = 0;

      for (const it of items) {
        const id = tmdbIdFromItem(it);
        if (id) {
          matched++;
          map[String(id)] = {
            type: it.type === 'show' ? 'show' : 'movie',
            leafCount: Number(it.leafCount || 0),
            childCount: Number(it.childCount || 0),
            server,
            section: sec.title
          };
        }
        if (it.type === 'show') episodes += Number(it.leafCount || 0);
      }
      sectionsOut.push({
        key: sec.key,
        title: sec.title,
        type: sec.type,
        total: items.length,
        matched,
        episodes,
        percent: items.length ? Math.round((matched / items.length) * 100) : 0
      });
    }
  } catch (e) {
    console.warn('[plex] scan failed:', e.message);
  }
  return { map, detail: { server, sections: sectionsOut, scannedAt: Date.now() } };
}

// Cache both the map and detail together (one scan feeds both).
async function scanCached(force) { return cached('plex:scan', TTL_DAY, scan, force); }

export async function libraryMap(force = false) { return (await scanCached(force)).map; }
export async function libraryTmdbIds(force = false) { return new Set(Object.keys(await libraryMap(force))); }
export async function libraryDetail(force = false) { return (await scanCached(force)).detail; }
export function invalidateLibrary() { del('plex:scan'); del('plex:librarymap'); del('plex:stats'); }

export async function forceScan() {
  const secs = (await sections())?.MediaContainer?.Directory || [];
  const scanned = [];
  const { services } = load();
  const selectedLibs = services.plex?.selectedLibraries;

  for (const sec of secs) {
    if (!['movie', 'show'].includes(sec.type)) continue;
    if (Array.isArray(selectedLibs) && selectedLibs.length > 0) {
      const isSelected = selectedLibs.includes(String(sec.key)) || selectedLibs.includes(sec.title);
      if (!isSelected) continue;
    }
    try {
      await call(`/library/sections/${sec.key}/refresh`);
      scanned.push(sec.title);
    } catch { /* ignore per-section */ }
  }
  invalidateLibrary();
  let detail = null;
  try { detail = await libraryDetail(true); } catch { /* ignore */ }
  return { ok: true, triggered: scanned, detail };
}

export default { test, testWithSections, sections, history, libraryMap, libraryTmdbIds, libraryDetail, invalidateLibrary, forceScan };

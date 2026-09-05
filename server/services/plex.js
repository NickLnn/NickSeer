// Plex — taste signal + library ownership + library detail (counts + matched %)
// + custom server/section filtering and force-scan trigger.
import { load } from '../config.js';
import { cached, TTL_DAY, del, delPrefix } from '../lib/cache.js';

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

export function normalizeTitle(t) {
  return String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function cleanTitle(t) {
  let s = String(t || '').toLowerCase();
  s = s.replace(/episode\s+[ivxlcdm\d]+/gi, '');
  s = s.replace(/part\s+[ivxlcdm\d]+/gi, '');
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function extractIdsFromItem(it) {
  let tmdbId = null;
  let imdbId = null;
  let tvdbId = null;

  for (const g of (it.Guid || [])) {
    const id = String(g.id || '');
    if (id.startsWith('tmdb://') && !tmdbId) tmdbId = id.slice(7).split('?')[0];
    else if (id.startsWith('imdb://') && !imdbId) imdbId = id.slice(7).split('?')[0];
    else if (id.startsWith('tvdb://') && !tvdbId) tvdbId = id.slice(7).split('?')[0];
  }

  const p = String(it.guid || '');
  if (!tmdbId) {
    const m = p.match(/themoviedb:\/\/(\d+)/) || p.match(/tmdb:\/\/(\d+)/);
    if (m) tmdbId = m[1];
  }
  if (!imdbId) {
    const m = p.match(/imdb:\/\/([a-zA-Z0-9]+)/) || p.match(/com\.plexapp\.agents\.imdb:\/\/(tt\d+)/);
    if (m) imdbId = m[1];
  }
  if (!tvdbId) {
    const m = p.match(/tvdb:\/\/(\d+)/) || p.match(/thetvdb:\/\/(\d+)/) || p.match(/com\.plexapp\.agents\.thetvdb:\/\/(\d+)/);
    if (m) tvdbId = m[1];
  }

  return { tmdbId, imdbId, tvdbId };
}

// Full scan — both the ownership map AND per-section detail with matched counts.
async function scan() {
  const map = {};
  const sectionsOut = [];
  let server = 'Plex';
  let machineIdentifier = '';
  const { services } = load();
  const selectedLibs = services.plex?.selectedLibraries;

  try {
    const root = await call('/');
    server = root?.MediaContainer?.friendlyName || 'Plex';
    machineIdentifier = root?.MediaContainer?.machineIdentifier || '';
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
        const { tmdbId, imdbId, tvdbId } = extractIdsFromItem(it);
        const itemType = it.type === 'show' ? 'show' : 'movie';
        const typePrefix = it.type === 'show' ? 'tv:' : 'movie:';

        let itemYear = it.year ? String(it.year) : null;
        if (!itemYear && it.originallyAvailableAt) {
          itemYear = String(it.originallyAvailableAt).slice(0, 4);
        }
        if (!itemYear && Array.isArray(it.Media)) {
          for (const m of it.Media) {
            for (const p of (m.Part || [])) {
              const match = (p.file || '').match(/[\(\.\[\s](19\d\d|20\d\d)[\)\.\]\s]/);
              if (match) { itemYear = match[1]; break; }
            }
            if (itemYear) break;
          }
        }

        const entry = {
          ratingKey: it.ratingKey,
          key: it.key,
          guid: it.guid,
          type: itemType,
          title: it.title,
          year: itemYear,
          leafCount: Number(it.leafCount || 0),
          childCount: Number(it.childCount || 0),
          server,
          machineIdentifier,
          section: sec.title,
          collections: (it.Collection || []).map(c => c.tag).filter(Boolean)
        };

        let hasAnyMatch = false;

        if (tmdbId) {
          hasAnyMatch = true;
          map[typePrefix + tmdbId] = entry;
          if (!map[String(tmdbId)]) map[String(tmdbId)] = entry;
        }

        if (imdbId) {
          hasAnyMatch = true;
          map['imdb:' + imdbId] = entry;
        }

        if (tvdbId) {
          hasAnyMatch = true;
          map['tvdb:' + tvdbId] = entry;
        }

        const rawTitles = [it.title, it.originalTitle].filter(Boolean);
        for (const t of rawTitles) {
          const norm = normalizeTitle(t);
          const clean = cleanTitle(t);
          const variants = [...new Set([norm, clean].filter(Boolean))];

          for (const v of variants) {
            hasAnyMatch = true;
            map[`title:${typePrefix}${v}`] = entry;
            if (!map[`title:${v}`]) map[`title:${v}`] = entry;

            if (itemYear) {
              map[`title:${typePrefix}${v}:${itemYear}`] = entry;
              if (!map[`title:${v}:${itemYear}`]) map[`title:${v}:${itemYear}`] = entry;
            }
          }
        }

        if (hasAnyMatch) matched++;
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

export function isMediaInLibrary(map, query = {}) {
  if (!map || typeof map !== 'object') return false;
  const id = query.id != null ? String(query.id) : null;
  const media = query.media === 'tv' || query.media === 'show' ? 'tv' : 'movie';
  const typePrefix = media === 'tv' ? 'tv:' : 'movie:';

  // 1. Check primary prefixed key
  if (id && map[typePrefix + id]) return map[typePrefix + id];

  // 2. Check bare ID
  if (id && map[id]) return map[id];

  // 3. Check IMDb ID
  const imdbId = query.imdbId || query.imdb_id;
  if (imdbId && map['imdb:' + imdbId]) return map['imdb:' + imdbId];

  // 4. Check TVDB ID
  const tvdbId = query.tvdbId || query.tvdb_id;
  if (tvdbId && map['tvdb:' + tvdbId]) return map['tvdb:' + tvdbId];

  // 5. Check Title
  const y = String(query.year || query.releaseDate || query.firstAirDate || query.release_date || '').slice(0, 4);
  const titles = [query.title, query.name, query.originalTitle, query.original_title].filter(Boolean);
  if (titles.length > 0) {
    for (const t of titles) {
      const norm = normalizeTitle(t);
      const clean = cleanTitle(t);
      const variants = [...new Set([norm, clean].filter(Boolean))];

      for (const v of variants) {
        // 5a. Title + Exact Year
        if (y) {
          if (map[`title:${typePrefix}${v}:${y}`]) return map[`title:${typePrefix}${v}:${y}`];
          if (map[`title:${v}:${y}`]) return map[`title:${v}:${y}`];

          // 5b. Title + Adjacent Year (+-1 year tolerance)
          const numY = parseInt(y, 10);
          if (!isNaN(numY)) {
            if (map[`title:${typePrefix}${v}:${numY - 1}`]) return map[`title:${typePrefix}${v}:${numY - 1}`];
            if (map[`title:${v}:${numY - 1}`]) return map[`title:${v}:${numY - 1}`];
            if (map[`title:${typePrefix}${v}:${numY + 1}`]) return map[`title:${typePrefix}${v}:${numY + 1}`];
            if (map[`title:${v}:${numY + 1}`]) return map[`title:${v}:${numY + 1}`];
          }
        }

        // 5c. Title without year fallback (crucial when Plex metadata lacks year)
        if (map[`title:${typePrefix}${v}`]) return map[`title:${typePrefix}${v}`];
        if (map[`title:${v}`]) return map[`title:${v}`];
      }
    }
  }

  return false;
}

// Cache both the map and detail together (one scan feeds both).
async function scanCached(force) { return cached('plex:scan', TTL_DAY, scan, force); }

export async function libraryMap(force = false) { return (await scanCached(force)).map; }
export async function libraryTmdbIds(force = false) { return new Set(Object.keys(await libraryMap(force))); }
export async function libraryDetail(force = false) { return (await scanCached(force)).detail; }
export function invalidateLibrary() {
  del('plex:scan');
  del('plex:librarymap');
  del('plex:stats');
  delPrefix('collections:');
}

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

export default { test, testWithSections, sections, history, libraryMap, libraryTmdbIds, libraryDetail, invalidateLibrary, forceScan, isMediaInLibrary, normalizeTitle };




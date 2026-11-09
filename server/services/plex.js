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
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
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

// ---------------------------------------------------------------------------
// LIBRARY FILE DETAILS — what the title modal's "In Library" button shows.
// A single-item /library/metadata/{key} fetch includes every Media version,
// its Part (file) and all Streams (video / audio / subtitle). List endpoints
// such as /allLeaves do NOT include Streams, so a show returns a per-episode
// overview and each episode is fetched on demand for its tracks.
// Only the file's basename is ever returned — never the NAS path.
// ---------------------------------------------------------------------------
const n0 = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const base = (f) => String(f || '').split(/[\\/]/).pop();
const IMAGE_SUBS = new Set(['pgs', 'hdmv_pgs_subtitle', 'vobsub', 'dvd_subtitle', 'dvdsub', 'dvb_subtitle']);
function dynamicRange(v) {
  if (!v) return '';
  if (v.DOVIPresent || /dolby ?vision|dovi/i.test(v.displayTitle || '')) return v.colorTrc === 'smpte2084' || /hdr10/i.test(v.displayTitle || '') ? 'Dolby Vision · HDR10' : 'Dolby Vision';
  if (v.colorTrc === 'smpte2084') return /hdr10\+/i.test(v.displayTitle || '') ? 'HDR10+' : 'HDR10';
  if (v.colorTrc === 'arib-std-b67') return 'HLG';
  return 'SDR';
}
function streamsOf(media) {
  const all = (media.Part || []).flatMap((p) => p.Stream || []);
  const video = all.filter((s) => s.streamType === 1).map((s) => ({
    codec: String(s.codec || '').toUpperCase(), title: s.extendedDisplayTitle || s.displayTitle || '',
    profile: s.profile || '', level: s.level || '', width: n0(s.width), height: n0(s.height),
    bitrate: n0(s.bitrate), bitDepth: n0(s.bitDepth), fps: s.frameRate ? String(s.frameRate) : '',
    dynamicRange: dynamicRange(s), doviProfile: s.DOVIProfile || '', chroma: s.chromaSubsampling || '',
    scan: s.scanType || '', primaries: s.colorPrimaries || ''
  }));
  const audio = all.filter((s) => s.streamType === 2).map((s) => ({
    codec: String(s.codec || '').toUpperCase(), title: s.extendedDisplayTitle || s.displayTitle || '',
    language: s.language || s.languageTag || '', code: s.languageCode || '', channels: n0(s.channels),
    layout: s.audioChannelLayout || '', profile: s.profile || '', bitrate: n0(s.bitrate),
    sampleRate: n0(s.samplingRate), default: !!s.default, label: s.title || ''
  }));
  const subtitles = all.filter((s) => s.streamType === 3).map((s) => {
    const codec = String(s.codec || '').toLowerCase();
    return {
      codec: codec.toUpperCase(), title: s.extendedDisplayTitle || s.displayTitle || '',
      language: s.language || s.languageTag || 'Unknown', code: s.languageCode || '',
      label: s.title || '', forced: !!s.forced, default: !!s.default, hearingImpaired: !!s.hearingImpaired,
      // A stream with its own key is a sidecar file next to the video (.srt etc).
      external: !!s.key, image: IMAGE_SUBS.has(codec)
    };
  });
  return { video, audio, subtitles };
}
function versionOf(m) {
  const parts = (m.Part || []).map((p) => ({ file: base(p.file), size: n0(p.size), container: String(p.container || '').toUpperCase(), duration: n0(p.duration), optimized: !!p.optimizedForStreaming }));
  return {
    id: m.id, resolution: m.videoResolution || '', width: n0(m.width), height: n0(m.height),
    bitrate: n0(m.bitrate), container: String(m.container || '').toUpperCase(), duration: n0(m.duration),
    videoCodec: String(m.videoCodec || '').toUpperCase(), audioCodec: String(m.audioCodec || '').toUpperCase(),
    audioChannels: n0(m.audioChannels), fps: m.videoFrameRate || '', aspect: m.aspectRatio || '',
    edition: m.editionTitle || '', size: parts.reduce((a, p) => a + p.size, 0), parts, ...streamsOf(m)
  };
}
function itemMeta(it) {
  return {
    ratingKey: it.ratingKey, type: it.type, title: it.title, year: it.year || '',
    show: it.grandparentTitle || '', season: n0(it.parentIndex), episode: n0(it.index),
    edition: it.editionTitle || '', section: it.librarySectionTitle || '',
    addedAt: n0(it.addedAt), updatedAt: n0(it.updatedAt), lastViewedAt: n0(it.lastViewedAt),
    viewCount: n0(it.viewCount), duration: n0(it.duration), contentRating: it.contentRating || '', studio: it.studio || ''
  };
}

export async function itemFiles(ratingKey) {
  if (!/^\d+$/.test(String(ratingKey))) throw new Error('bad library key');
  const it = (await call(`/library/metadata/${ratingKey}`))?.MediaContainer?.Metadata?.[0];
  if (!it) throw new Error('not found in Plex');
  return mapItem(it);
}
export function mapItem(it) { return { ...itemMeta(it), versions: (it.Media || []).map(versionOf) }; }

export async function showFiles(ratingKey) {
  if (!/^\d+$/.test(String(ratingKey))) throw new Error('bad library key');
  const [show, leaves] = await Promise.all([
    call(`/library/metadata/${ratingKey}`).then((d) => d?.MediaContainer?.Metadata?.[0]),
    call(`/library/metadata/${ratingKey}/allLeaves`).then((d) => d?.MediaContainer?.Metadata || [])
  ]);
  if (!show) throw new Error('not found in Plex');
  return mapShow(show, leaves);
}
export function mapShow(show, leaves) {
  const seasons = new Map();
  const tally = { size: 0, resolutions: {}, videoCodecs: {}, audioCodecs: {} };
  for (const ep of leaves) {
    const m = (ep.Media || [])[0] || {};
    const size = (ep.Media || []).flatMap((x) => x.Part || []).reduce((a, p) => a + n0(p.size), 0);
    const row = {
      ratingKey: ep.ratingKey, season: n0(ep.parentIndex), episode: n0(ep.index), title: ep.title || '',
      resolution: m.videoResolution || '', videoCodec: String(m.videoCodec || '').toUpperCase(),
      audioCodec: String(m.audioCodec || '').toUpperCase(), audioChannels: n0(m.audioChannels),
      container: String(m.container || '').toUpperCase(), bitrate: n0(m.bitrate), duration: n0(ep.duration || m.duration),
      size, versions: (ep.Media || []).length, viewCount: n0(ep.viewCount), addedAt: n0(ep.addedAt)
    };
    tally.size += size;
    const bump = (o, k) => { if (k) o[k] = (o[k] || 0) + 1; };
    bump(tally.resolutions, row.resolution); bump(tally.videoCodecs, row.videoCodec); bump(tally.audioCodecs, row.audioCodec);
    if (!seasons.has(row.season)) seasons.set(row.season, { season: row.season, title: ep.parentTitle || `Season ${row.season}`, episodes: [] });
    seasons.get(row.season).episodes.push(row);
  }
  const list = [...seasons.values()].sort((a, b) => a.season - b.season);
  list.forEach((s) => { s.episodes.sort((a, b) => a.episode - b.episode); s.size = s.episodes.reduce((a, e) => a + e.size, 0); });
  return {
    ...itemMeta(show), episodes: leaves.length, watchedEpisodes: n0(show.viewedLeafCount), seasonCount: list.length,
    totals: tally, seasons: list
  };
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

export default { itemFiles, showFiles, test, testWithSections, sections, history, libraryMap, libraryTmdbIds, libraryDetail, invalidateLibrary, forceScan, isMediaInLibrary, normalizeTitle };




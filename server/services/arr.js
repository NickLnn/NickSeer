import { load } from '../config.js';
import { cached, TTL_HOUR, del, delPrefix } from '../lib/cache.js';

function cfg(kind, custom = {}) {
  const { services } = load();
  const s = services[kind] || {};
  const base = (custom.url || s.url || '').replace(/\/+$/, '');
  const key = custom.apikey || s.apikey || '';
  if (!base || !key) throw new Error(`${kind} not configured`);
  return { base, key, s };
}

async function call(kind, pathname, { method = 'GET', body, custom } = {}) {
  const { base, key } = cfg(kind, custom);
  const res = await fetch(`${base}/api/v3${pathname}`, {
    method, headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`${kind} ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

export async function test(kind, custom) {
  const status = await call(kind, '/system/status', { custom });
  return { ok: true, version: status.version, instance: status.instanceName };
}

export const qualityProfiles = (kind, custom) => call(kind, '/qualityprofile', { custom });
export const rootFolders = (kind, custom) => call(kind, '/rootfolder', { custom });
export const tags = (kind) => call(kind, '/tag');
export const queue = (kind) => call(kind, '/queue?pageSize=50&includeUnknownMovieItems=true&includeMovie=true');

export async function monitoredCatalog(kind, force = false) {
  return cached(`arr:monitored:${kind}`, TTL_HOUR / 2, async () => {
    try {
      if (kind === 'radarr') {
        const movies = await call('radarr', '/movie');
        const set = new Set();
        const titles = new Map();
        for (const m of (movies || [])) {
          if (m.tmdbId) set.add(String(m.tmdbId));
          if (m.title) titles.set(m.title.toLowerCase().replace(/[^a-z0-9]/g, ''), m.id);
        }
        return { set: Array.from(set), titles: Object.fromEntries(titles) };
      }
      if (kind === 'sonarr') {
        const series = await call('sonarr', '/series');
        const set = new Set();
        const titles = new Map();
        for (const s of (series || [])) {
          if (s.tvdbId) set.add(String(s.tvdbId));
          if (s.tmdbId) set.add(String(s.tmdbId));
          if (s.title) titles.set(s.title.toLowerCase().replace(/[^a-z0-9]/g, ''), s.id);
        }
        return { set: Array.from(set), titles: Object.fromEntries(titles) };
      }
    } catch {
      return { set: [], titles: {} };
    }
    return { set: [], titles: {} };
  }, force);
}

export async function monitoredSet(kind, force = false) {
  const cat = await monitoredCatalog(kind, force);
  return new Set(cat?.set || []);
}

export async function isMonitored(kind, query = {}) {
  const tmdbId = query.tmdbId ? String(query.tmdbId) : (query.id ? String(query.id) : null);
  const tvdbId = query.tvdbId ? String(query.tvdbId) : null;
  const titleNorm = query.title ? String(query.title).toLowerCase().replace(/[^a-z0-9]/g, '') : null;

  try {
    const cat = await monitoredCatalog(kind);
    const idSet = new Set(cat?.set || []);
    if (tmdbId && idSet.has(tmdbId)) return true;
    if (tvdbId && idSet.has(tvdbId)) return true;
    if (titleNorm && cat?.titles && cat.titles[titleNorm]) return true;
    return false;
  } catch {
    return false;
  }
}

export function invalidateCatalog(kind) {
  if (kind) {
    del(`arr:monitored:${kind}`);
  } else {
    del('arr:monitored:radarr');
    del('arr:monitored:sonarr');
  }
  delPrefix('collections:');
}

export function lookup(kind, tmdbId, extra = {}) {
  if (kind === 'radarr') return call('radarr', `/movie/lookup/tmdb?tmdbId=${tmdbId}`);
  const term = tmdbId ? `tmdb:${tmdbId}` : extra.tvdbId ? `tvdb:${extra.tvdbId}` : null;
  if (!term) throw new Error('Series lookup needs tmdbId or tvdbId');
  return call('sonarr', `/series/lookup?term=${encodeURIComponent(term)}`);
}

export async function ensureTag(kind, label) {
  const existing = await tags(kind);
  const found = (existing || []).find((t) => t.label.toLowerCase() === String(label).toLowerCase());
  if (found) return found.id;
  const created = await call(kind, '/tag', { method: 'POST', body: { label } });
  return created.id;
}

export async function add(kind, tmdbId, opts = {}) {
  const { s } = cfg(kind);
  const looked = await lookup(kind, tmdbId ?? opts.tmdbId ?? null, opts);
  const item = Array.isArray(looked) ? looked[0] : looked;
  if (!item) throw new Error('Title not found in ' + kind);
  const rootFolderPath = opts.rootFolder || s.rootFolder || (await rootFolders(kind))[0]?.path;
  const common = {
    qualityProfileId: opts.qualityProfileId || s.qualityProfileId || 1,
    rootFolderPath,
    monitored: true,
    tags: Array.isArray(opts.tags) ? opts.tags : [],
    addOptions: {
      searchForMovie: kind === 'radarr',
      searchForMissingEpisodes: kind === 'sonarr'
    }
  };

  let res;
  if (kind === 'radarr') {
    res = await call('radarr', '/movie', { method: 'POST', body: { ...item, ...common, minimumAvailability: 'released' } });
  } else {
    // Sonarr per-season monitoring selection
    let seasonsPayload = item.seasons || [];
    if (Array.isArray(opts.seasons) && opts.seasons.length > 0) {
      const chosenSet = new Set(opts.seasons.map(Number));
      seasonsPayload = seasonsPayload.map(sn => ({
        ...sn,
        monitored: chosenSet.has(Number(sn.seasonNumber))
      }));
    }

    res = await call('sonarr', '/series', {
      method: 'POST',
      body: {
        ...item,
        ...common,
        seasons: seasonsPayload,
        languageProfileId: 1,
        seasonFolder: true
      }
    });
  }

  try { invalidateCatalog(kind); } catch {}
  return res;
}

export default { test, qualityProfiles, rootFolders, tags, ensureTag, queue, lookup, add, monitoredCatalog, monitoredSet, isMonitored, invalidateCatalog };


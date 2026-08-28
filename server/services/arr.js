// Radarr + Sonarr share almost the same API (Servarr v3), so one module handles both.
import { load } from '../config.js';

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

export function lookup(kind, tmdbId) {
  if (kind === 'radarr') return call('radarr', `/movie/lookup/tmdb?tmdbId=${tmdbId}`);
  return call('sonarr', `/series/lookup?term=tmdb:${tmdbId}`);
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
  const looked = await lookup(kind, tmdbId);
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

  if (kind === 'radarr') {
    return call('radarr', '/movie', { method: 'POST', body: { ...item, ...common, minimumAvailability: 'released' } });
  }

  // Sonarr per-season monitoring selection
  let seasonsPayload = item.seasons || [];
  if (Array.isArray(opts.seasons) && opts.seasons.length > 0) {
    const chosenSet = new Set(opts.seasons.map(Number));
    seasonsPayload = seasonsPayload.map(sn => ({
      ...sn,
      monitored: chosenSet.has(Number(sn.seasonNumber))
    }));
  }

  return call('sonarr', '/series', {
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

export default { test, qualityProfiles, rootFolders, tags, ensureTag, queue, lookup, add };

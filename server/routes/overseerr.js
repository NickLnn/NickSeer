import express from '../mini.js';
import { load, setRequests } from '../config.js';
import crypto from 'crypto';
import auth from '../services/auth.js';
import tmdb from '../services/tmdb.js';
import arr from '../services/arr.js';
import * as telegram from '../services/telegram.js';
import * as discord from '../services/discord.js';
import fs from 'fs';

const router = express.Router();

// Request tracing. Was unconditional appendFileSync on EVERY /api/v1 call —
// a blocking write on the hot path, an unbounded file, and it recorded full
// request bodies in plaintext next to the source. Opt in with
// REQUESTRR_DEBUG=1 when you actually need to diagnose a payload.
if (process.env.REQUESTRR_DEBUG === '1') {
  router.use((req, res, next) => {
    try {
      fs.appendFile('requestrr_debug.log',
        `${new Date().toISOString()} | ${req.method} ${req.url} | Body: ${JSON.stringify(req.body)}\n`,
        () => {});
    } catch (e) { /* never let tracing break a request */ }
    next();
  });
}

// Middleware to validate X-Api-Key.
// Hardened: no hardcoded fallback (a publicly-known default key on any
// unconfigured install), and a constant-time comparison.
router.use((req, res, next) => {
  const cfg = load();
  const validKey = cfg.services?.overseerr?.apikey || cfg.api?.key || process.env.NICKSEER_API_KEY || '';
  if (!validKey) {
    return res.status(503).json({ error: 'Overseerr API key not configured' });
  }
  const providedKey = String(req.headers['x-api-key'] || '');
  const a = Buffer.from(providedKey);
  const b = Buffer.from(validKey);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
});

// 1. Settings Mock (Requestrr connection test)
router.get('/settings/main', (req, res) => {
  res.json({
    apiKey: req.headers['x-api-key'] || 'nickseer-requestrr-key',
    appLanguage: 'en',
    applicationTitle: 'NickSeer (Overseerr Mock)',
    applicationUrl: 'http://localhost:5056',
    trustProxy: false,
    csrfProtection: false,
    hideAvailable: false,
    localLogin: true,
    discoverRegion: 'US'
  });
});

// 2. Services Mock (Radarr / Sonarr)
router.get('/service/radarr', (req, res) => {
  const { services } = load();
  if (services.radarr?.url && services.radarr?.apikey) {
    res.json([{ id: 1, name: 'Radarr', isDefault: true, activeProfileId: 1, activeDirectory: '/' }]);
  } else {
    res.json([]);
  }
});
router.get('/service/radarr/:id', (req, res) => {
  res.json({
    server: { baseUrl: '' },
    profiles: [{ id: 1, name: 'Default Profile' }],
    rootFolders: [{ id: 1, path: '/movies' }],
    tags: []
  });
});


router.get('/service/sonarr', (req, res) => {
  const { services } = load();
  if (services.sonarr?.url && services.sonarr?.apikey) {
    res.json([{ id: 1, name: 'Sonarr', isDefault: true, activeProfileId: 1, activeDirectory: '/' }]);
  } else {
    res.json([]);
  }
});
router.get('/service/sonarr/:id', (req, res) => {
  res.json({
    server: { baseUrl: '' },
    profiles: [{ id: 1, name: 'Default Profile' }],
    rootFolders: [{ id: 1, path: '/tv' }],
    languageProfiles: [{ id: 1, name: 'English' }],
    tags: []
  });
});


// 3. User Mock
router.get('/user', (req, res) => {
  const { auth } = load();
  const users = auth?.users || [];
  
  // Format as Overseerr users. Permissions: 2 = Admin, 32 = Auto-Approve, 4 = Request
  const results = users.map((u, i) => ({
    id: i + 1,
    email: u.username + '@nickseer.local',
    username: u.username,
    plexUsername: u.username,
    permissions: 2 | 32 | 4,
    userType: 1,
    settings: { discordId: null, telegramChatId: null }
  }));
  
  // If no users, return a default admin
  if (results.length === 0) {
    results.push({
      id: 1,
      email: 'admin@nickseer.local',
      username: 'admin',
      plexUsername: 'admin',
      permissions: 2 | 32 | 4,
      userType: 1,
      settings: {}
    });
  }

  res.json({ pageInfo: { pages: 1, pageSize: 50, results: results.length, page: 1 }, results });
});

router.get('/user/:id', (req, res) => {
  res.json({
    id: Number(req.params.id) || 1,
    email: 'admin@nickseer.local',
    username: 'admin',
    permissions: 2 | 32 | 4,
    settings: {}
  });
});

router.get('/user/:id/settings/notifications', (req, res) => {
  res.json({ discordId: null, telegramChatId: null });
});

router.get('/user/:id/settings/permissions', (req, res) => {
  res.json({ permissions: 2 | 32 | 4 });
});

// 4. Search
router.get('/search', async (req, res) => {
  const query = req.query.query;
  if (!query) return res.json({ page: 1, totalPages: 1, totalResults: 0, results: [] });
  
  // Handle tvdb: ID search Requestrr uses
  if (query.startsWith('tvdb:')) {
    try {
      const tvdbId = query.split(':')[1];
      const tmdbRes = await tmdb.find(tvdbId, 'tvdb_id').catch(() => null);
      const tvResults = tmdbRes?.tv_results || [];
      if (tvResults.length) {
        const results = tvResults.map(r => ({
          ...r,
          id: r.id,
          title: r.name || r.title || '',
          name: r.name || r.title || '',
          posterPath: r.poster_path || '',
          backdropPath: r.backdrop_path || '',
          releaseDate: r.first_air_date || r.release_date || '',
          firstAirDate: r.first_air_date || r.release_date || '',
          mediaType: 'tv',
          seasons: [],
          mediaInfo: { status: 1, requests: [], seasons: [], tvdbId: Number(tvdbId), tmdbId: r.id },
          externalIds: { tvdbId: Number(tvdbId) }
        }));
        return res.json({ page: 1, totalPages: 1, totalResults: results.length, results });
      }

      // Fallback: lookup directly in Sonarr
      try {
        const sonarrLookup = await arr.lookup('sonarr', null, { tvdbId });
        const seriesList = Array.isArray(sonarrLookup) ? sonarrLookup : (sonarrLookup ? [sonarrLookup] : []);
        if (seriesList.length) {
          const results = seriesList.map(s => {
            const pImg = s.images?.find(x => x.coverType === 'poster') || s.images?.[0];
            return {
              id: Number(tvdbId),
              title: s.title || '',
              name: s.title || '',
              posterPath: pImg?.remoteUrl || pImg?.url || '',
              backdropPath: '',
              releaseDate: s.year ? `${s.year}-01-01` : '',
              firstAirDate: s.year ? `${s.year}-01-01` : '',
              mediaType: 'tv',
              seasons: (s.seasons || []).map(sn => ({ id: sn.seasonNumber, seasonNumber: sn.seasonNumber })),
              mediaInfo: { status: 1, requests: [], seasons: [], tvdbId: Number(tvdbId) },
              externalIds: { tvdbId: Number(tvdbId) }
            };
          });
          return res.json({ page: 1, totalPages: 1, totalResults: results.length, results });
        }
      } catch {}

      return res.json({ page: 1, totalPages: 1, totalResults: 0, results: [] });
    } catch(e) {
      return res.json({ page: 1, totalPages: 1, totalResults: 0, results: [] });
    }
  }
  
  try {
    const data = await tmdb.search(query, 'multi');
    // Overseerr wraps the results and adds mediaInfo
    const results = (data.results || []).map(r => {
      const isMovie = r.media_type === 'movie' || (r.title && !r.name);
      const title = r.title || r.name || '';
      const name = r.name || r.title || '';
      const releaseDate = r.release_date || r.first_air_date || '';
      const firstAirDate = r.first_air_date || r.release_date || '';
      return {
        ...r,
        id: r.id,
        title,
        name,
        posterPath: r.poster_path || '',
        backdropPath: r.backdrop_path || '',
        releaseDate,
        firstAirDate,
        mediaType: r.media_type || (isMovie ? 'movie' : 'tv'),
        seasons: [],
        mediaInfo: { status: 1, requests: [], seasons: [] }
      };
    });
    res.json({ page: 1, totalPages: 1, totalResults: results.length, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 5. Media Info (Movie / TV)
const getMediaInfo = async (media, id) => {
  try {
    const numericId = Number(id);
    if (!numericId && numericId !== 0) return null;

    let data = null;
    let tvdbId = null;

    if (media === 'tv') {
      // First check if numericId matches a known TVDB ID via tmdb.find
      try {
        const tmdbRes = await tmdb.find(numericId, 'tvdb_id');
        if (tmdbRes?.tv_results?.length) {
          const match = tmdbRes.tv_results[0];
          data = await tmdb.details('tv', match.id).catch(() => match);
          tvdbId = numericId;
        }
      } catch {}
    }

    if (!data) {
      try {
        data = await tmdb.details(media, numericId);
      } catch (e) {
        // If TMDB lookup failed for TV, check if id was actually a TVDB ID
        if (media === 'tv') {
          try {
            const tmdbRes = await tmdb.find(numericId, 'tvdb_id');
            if (tmdbRes?.tv_results?.length) {
              data = await tmdb.details('tv', tmdbRes.tv_results[0].id);
              tvdbId = numericId;
            }
          } catch {}
        }
      }
    }
    if (!data) return null;

    // Library availability check
    let status = 1; // 1 = Unknown, 2 = Pending, 3 = Processing, 4 = Partially Available, 5 = Available
    const { load: loadApp } = await import('../config.js');
    const cfg = loadApp();
    let map = {};
    try {
      const plexSvc = (await import('../services/plex.js')).default;
      if (typeof plexSvc.libraryMapSync === 'function') {
        map = plexSvc.libraryMapSync();
      } else if (typeof plexSvc.libraryMap === 'function') {
        map = await plexSvc.libraryMap(true);
      }
    } catch (e) {}

    if (map[`${media}:${data.id}`]) {
      status = 5; // Available
    }

    if (data.external_ids && data.external_ids.tvdb_id) {
      tvdbId = tvdbId || data.external_ids.tvdb_id;
    }

    // Match any existing requests in NickSeer queue
    const allRequests = cfg.requests || [];
    const matchingRequests = allRequests.filter(r => 
      r.media === media && (
        (data.id && String(r.tmdbId) === String(data.id)) ||
        (tvdbId && String(r.tvdbId) === String(tvdbId)) ||
        (numericId && String(r.tvdbId) === String(numericId))
      )
    );

    // If pending or approved requests exist and not in Plex, update status
    const hasPending = matchingRequests.some(r => r.status === 'pending');
    const hasApproved = matchingRequests.some(r => r.status === 'approved');
    if (status !== 5) {
      if (hasApproved) status = 3; // Processing
      else if (hasPending) status = 2; // Pending
    }

    // Map requests to Overseerr JSONRequest schema
    const mappedRequests = matchingRequests.map((r, idx) => ({
      id: idx + 1,
      status: r.status === 'approved' ? 2 : r.status === 'declined' ? 3 : 1, // MediaRequestStatus
      seasons: (r.seasons || []).map(s => ({
        id: typeof s === 'object' ? (s.id ?? 1) : Number(s),
        seasonNumber: typeof s === 'object' ? (s.seasonNumber ?? s.id ?? 1) : Number(s),
        status: r.status === 'approved' ? 5 : 2
      }))
    }));

    // Requested season numbers
    const reqSeasonNumbers = new Set(
      matchingRequests
        .filter(r => r.status === 'pending' || r.status === 'approved')
        .flatMap(r => (r.seasons || []).map(s => typeof s === 'object' ? (s.seasonNumber ?? s.id) : Number(s)))
    );

    const title = data.title || data.name || '';
    const name = data.name || data.title || '';
    const releaseDate = data.release_date || data.first_air_date || '';
    const firstAirDate = data.first_air_date || data.release_date || '';

    // Poster fallback for TV if TMDB has no poster
    let posterPath = data.poster_path || '';
    if (!posterPath && media === 'tv') {
      try {
        const sonarrMatch = await arr.lookup('sonarr', data.id, { tvdbId }).catch(() => null);
        const seriesItem = Array.isArray(sonarrMatch) ? sonarrMatch[0] : sonarrMatch;
        if (seriesItem?.images?.length) {
          const posterImg = seriesItem.images.find(img => img.coverType === 'poster') || seriesItem.images[0];
          if (posterImg?.remoteUrl) {
            posterPath = posterImg.remoteUrl;
          }
        }
      } catch {}
    }

    // Root seasons array
    const seasons = (data.seasons || []).map(s => ({
      id: s.id,
      seasonNumber: s.season_number,
      episodeCount: s.episode_count || 0,
      name: s.name || `Season ${s.season_number}`,
      overview: s.overview || '',
      posterPath: s.poster_path || '',
      airDate: s.air_date || '',
      status: (s.season_number > 0 && status === 5) ? 5 : (reqSeasonNumbers.has(s.season_number) ? 2 : 1)
    }));

    // mediaInfo seasons array
    const mediaInfoSeasons = (data.seasons || []).map(s => ({
      id: s.id,
      seasonNumber: s.season_number,
      status: (s.season_number > 0 && status === 5) ? 5 : (reqSeasonNumbers.has(s.season_number) ? 2 : 1)
    }));

    return {
      ...data,
      id: data.id,
      title,
      name,
      posterPath: posterPath || data.poster_path || '',
      backdropPath: data.backdrop_path || '',
      releaseDate,
      firstAirDate,
      overview: data.overview || '',
      status: data.status || '',
      inProduction: !!data.in_production,
      networks: (data.networks || []).map(n => ({ name: n.name, id: n.id })),
      seasons,
      mediaInfo: {
        id: data.id,
        status,
        status4k: 1,
        tmdbId: data.id,
        tvdbId: tvdbId ? Number(tvdbId) : null,
        requests: mappedRequests,
        seasons: mediaInfoSeasons
      },
      externalIds: {
        tvdbId: tvdbId ? Number(tvdbId) : null,
        imdbId: data.external_ids?.imdb_id || null
      }
    };
  } catch (e) {
    return null;
  }
};

router.get('/movie/:id', async (req, res) => {
  const data = await getMediaInfo('movie', req.params.id);
  if (!data) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

router.get('/tv/:id', async (req, res) => {
  const data = await getMediaInfo('tv', req.params.id);
  if (!data) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

// Helper to determine queueing
function mustQueue(c, isAdmin) {
  if (!auth.isEnabled()) return false;
  if (isAdmin) return false;
  return !!c.auth?.approvals;
}

// 6. Request
router.post('/request', async (req, res) => {
  let { mediaType, mediaId, seasons, tvdbId, title: bodyTitle, poster: bodyPoster } = req.body || {};
  
  // Support payload aliases
  mediaType = mediaType || req.body?.media_type || req.body?.type;
  mediaId = mediaId ?? req.body?.media_id ?? req.body?.tmdbId ?? req.body?.tmdb_id ?? req.body?.id;
  tvdbId = tvdbId ?? req.body?.tvdb_id ?? req.body?.theTvDbId ?? req.body?.thetvdbId;

  // Requestrr / external requesters might send variants of media types
  if (mediaType === 'series' || mediaType === 'show') mediaType = 'tv';
  if (mediaType === 'movies') mediaType = 'movie';

  // If tvdbId was provided but not mediaId, use tvdbId as mediaId
  if (!mediaId && tvdbId) mediaId = tvdbId;
  
  if (!mediaType || !mediaId) return res.status(400).json({ error: 'Missing mediaType or mediaId' });
  
  // Resolve User ID from Requestrr
  const xApiUser = req.headers['x-api-user'] || req.body?.userId;
  let username = 'Requestrr Bot';
  let userObj = null;
  
  const cfg = load();
  if (xApiUser) {
    const users = cfg.auth?.users || [];
    // ID is index + 1
    const idx = Number(xApiUser) - 1;
    if (idx >= 0 && idx < users.length) {
      userObj = users[idx];
      username = userObj.username;
    } else {
      username = `Requestrr User #${xApiUser}`;
    }
  }

  let title = bodyTitle || (mediaType === 'tv' ? `TV Show (ID: ${mediaId})` : `Movie (ID: ${mediaId})`);
  let poster = bodyPoster || req.body?.posterPath || req.body?.banner || '';
  let resolvedTmdbId = null;
  let resolvedTvdbId = tvdbId ? Number(tvdbId) : null;

  if (mediaType === 'tv') {
    // 1. Try resolving via tvdb_id on TMDB if candidate TVDB id exists
    const candidateTvdb = resolvedTvdbId || (Number(mediaId) > 0 ? Number(mediaId) : null);
    if (candidateTvdb) {
      try {
        const findRes = await tmdb.find(candidateTvdb, 'tvdb_id');
        if (findRes?.tv_results?.length) {
          const match = findRes.tv_results[0];
          resolvedTmdbId = match.id;
          resolvedTvdbId = candidateTvdb;
          title = match.name || match.title || title;
          if (!poster && match.poster_path) {
            poster = tmdb.img(match.poster_path) || '';
          }
        }
      } catch (e) {
        console.warn('[overseerr:request] tmdb.find by tvdb_id failed:', e.message);
      }
    }

    // 2. If not yet resolved or poster still empty, check tmdb.details
    if (!resolvedTmdbId) {
      try {
        const tmdbData = await tmdb.details('tv', mediaId);
        if (tmdbData) {
          resolvedTmdbId = tmdbData.id;
          title = tmdbData.name || tmdbData.title || title;
          if (!poster && tmdbData.poster_path) {
            poster = tmdb.img(tmdbData.poster_path) || '';
          }
          if (!resolvedTvdbId && tmdbData.external_ids?.tvdb_id) {
            resolvedTvdbId = Number(tmdbData.external_ids.tvdb_id);
          }
        }
      } catch (e) {
        console.warn('[overseerr:request] tmdb.details tv failed:', e.message);
      }
    }

    // 3. If poster is still empty, query Sonarr for TVDB artwork
    if (!poster) {
      try {
        const sonarrMatch = await arr.lookup('sonarr', resolvedTmdbId || mediaId, { tvdbId: resolvedTvdbId }).catch(() => null);
        const seriesItem = Array.isArray(sonarrMatch) ? sonarrMatch[0] : sonarrMatch;
        if (seriesItem) {
          if (title.startsWith('TV Show (ID:') || title.startsWith('TMDB ID:')) {
            title = seriesItem.title || title;
          }
          if (!resolvedTvdbId && seriesItem.tvdbId) resolvedTvdbId = seriesItem.tvdbId;
          if (seriesItem.images?.length) {
            const p = seriesItem.images.find(x => x.coverType === 'poster') || seriesItem.images.find(x => x.coverType === 'banner') || seriesItem.images[0];
            if (p?.remoteUrl || p?.url) {
              poster = p.remoteUrl || p.url;
            }
          }
        }
      } catch (e) {
        console.warn('[overseerr:request] sonarr poster fallback lookup failed:', e.message);
      }
    }

    if (!resolvedTmdbId) resolvedTmdbId = Number(mediaId) || mediaId;
  } else {
    // Movie flow
    resolvedTmdbId = Number(mediaId) || mediaId;
    try {
      const tmdbData = await tmdb.details('movie', mediaId);
      if (tmdbData) {
        title = tmdbData.title || tmdbData.name || title;
        if (!poster && tmdbData.poster_path) {
          poster = tmdb.img(tmdbData.poster_path) || '';
        }
      }
    } catch (e) {
      console.warn('[overseerr:request] tmdb movie details failed:', e.message);
    }
    if (!poster) {
      try {
        const radarrMatch = await arr.lookup('radarr', mediaId).catch(() => null);
        const movieItem = Array.isArray(radarrMatch) ? radarrMatch[0] : radarrMatch;
        if (movieItem?.images?.length) {
          const p = movieItem.images.find(x => x.coverType === 'poster') || movieItem.images[0];
          if (p?.remoteUrl || p?.url) poster = p.remoteUrl || p.url;
        }
      } catch {}
    }
  }

  // Ensure poster is a fully qualified URL
  if (poster && !poster.startsWith('http')) {
    poster = `https://image.tmdb.org/t/p/w500${poster.startsWith('/') ? '' : '/'}${poster}`;
  }

  const kind = mediaType === 'tv' ? 'sonarr' : 'radarr';
  const isAdmin = userObj && userObj.role === 'admin';
  
  if (mustQueue(cfg, isAdmin)) {
    const all = load().requests || [];
    if (all.find((r) => r.status === 'pending' && r.media === mediaType && (
      (resolvedTvdbId && r.tvdbId && String(r.tvdbId) === String(resolvedTvdbId)) ||
      (resolvedTmdbId && r.tmdbId && String(r.tmdbId) === String(resolvedTmdbId)) ||
      (String(r.tmdbId) === String(mediaId))
    ))) {
      return res.json({ id: Math.floor(Math.random() * 100000), status: 1, media: { tmdbId: resolvedTmdbId, status: 2 } });
    }
    
    const rq = {
      id: crypto.randomUUID(),
      status: 'pending',
      media: mediaType,
      tmdbId: resolvedTmdbId,
      tvdbId: resolvedTvdbId || null,
      title: title,
      poster: poster,
      by: username,
      at: Date.now(),
      qualityProfileId: null,
      rootFolder: '',
      tags: [],
      newTags: [],
      seasons: seasons || []
    };
    
    all.unshift(rq);
    setRequests(all);
    telegram.notify('pending', rq); discord.notify('pending', rq);
    return res.json({ id: Math.floor(Math.random() * 100000), status: 1, media: { tmdbId: resolvedTmdbId, status: 2 } });
  }
  
  try {
    const idToUse = (mediaType === 'tv' && resolvedTvdbId) ? `tvdb:${resolvedTvdbId}` : resolvedTmdbId;
    await arr.add(kind, idToUse, { seasons });
    telegram.notify('autoApproved', { title, poster, media: mediaType, tmdbId: resolvedTmdbId, tvdbId: resolvedTvdbId, by: username, seasons });
    discord.notify('autoApproved', { title, poster, media: mediaType, tmdbId: resolvedTmdbId, tvdbId: resolvedTvdbId, by: username, seasons });
    res.json({ id: Math.floor(Math.random() * 100000), status: 2, media: { tmdbId: resolvedTmdbId, status: 5 } }); // 5 = Available
  } catch (e) {
    if (e.message && e.message.toLowerCase().includes('already')) {
      telegram.notify('available', { title, poster, media: mediaType, tmdbId: resolvedTmdbId, tvdbId: resolvedTvdbId, by: username });
      discord.notify('available', { title, poster, media: mediaType, tmdbId: resolvedTmdbId, tvdbId: resolvedTvdbId, by: username });
      return res.json({ id: Math.floor(Math.random() * 100000), status: 2, media: { tmdbId: resolvedTmdbId, status: 3 } }); // 3 = Processing / Available
    }
    telegram.notify('failed', { title, poster, media: mediaType, tmdbId: resolvedTmdbId, tvdbId: resolvedTvdbId, by: username });
    discord.notify('failed', { title, poster, media: mediaType, tmdbId: resolvedTmdbId, tvdbId: resolvedTvdbId, by: username });
    res.status(500).json({ error: e.message });
  }
});

// 7. Issue Reporting
router.post('/issue', (req, res) => {
  const { mediaId, mediaType, title, issueType, message } = req.body;
  // Dispatch a telegram notification to the admin!
  telegram.notify('issue', { title: title || `TMDB ID: ${mediaId}`, media: mediaType, message, issueType });
  res.json({ id: Math.floor(Math.random() * 100000), status: 1 });
});


// Catch-all to prevent HTML fallback
router.use((req, res) => {
  res.status(404).json({ error: 'Not found in NickSeer Mock API' });
});

export default router;


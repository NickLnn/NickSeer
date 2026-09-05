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

router.use((req, res, next) => {
  try {
    fs.appendFileSync('requestrr_debug.log', `${new Date().toISOString()} | ${req.method} ${req.url} | Body: ${JSON.stringify(req.body)}\n`);
  } catch(e) {}
  next();
});

// Middleware to validate X-Api-Key
router.use((req, res, next) => {
  const { services } = load();
  const validKey = services.overseerr?.apikey || 'nickseer-requestrr-key';
  const providedKey = req.headers['x-api-key'];
  if (providedKey !== validKey) {
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
      const tmdbRes = await tmdb.find(tvdbId, 'tvdb_id');
      const tvResults = tmdbRes?.tv_results || [];
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
        mediaInfo: { status: 1, requests: [], seasons: [] }
      }));
      return res.json({ page: 1, totalPages: 1, totalResults: results.length, results });
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
    try {
      data = await tmdb.details(media, numericId);
    } catch (e) {
      // If TMDB lookup failed for TV, check if id was actually a TVDB ID
      if (media === 'tv') {
        try {
          const tmdbRes = await tmdb.find(numericId, 'tvdb_id');
          if (tmdbRes?.tv_results?.length) {
            data = await tmdb.details('tv', tmdbRes.tv_results[0].id);
          }
        } catch {}
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

    let tvdbId = null;
    if (data.external_ids && data.external_ids.tvdb_id) {
      tvdbId = data.external_ids.tvdb_id;
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
      posterPath: data.poster_path || '',
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
  let { mediaType, mediaId, seasons, tvdbId } = req.body;
  
  // Requestrr / external requesters might send variants of media types
  if (mediaType === 'series') mediaType = 'tv';
  if (mediaType === 'movies') mediaType = 'movie';
  
  if (!mediaType || !mediaId) return res.status(400).json({ error: 'Missing mediaType or mediaId' });
  
  // Resolve User ID from Requestrr
  const xApiUser = req.headers['x-api-user'] || req.body.userId;
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

    // Note: Overseerr doesn't pass the title in the POST body, only ID. We must fetch it!
  let title = `TMDB ID: ${mediaId}`;
  let poster = '';
  try {
    const tmdbData = await tmdb.details(mediaType === 'tv' ? 'tv' : 'movie', mediaId);
    if (tmdbData) {
      title = tmdbData.title || tmdbData.name || title;
      poster = tmdb.img(tmdbData.poster_path) || '';
    }
  } catch (e) {
    console.error('Failed to fetch TMDB details for Requestrr mock:', e.message);
  }
  const kind = mediaType === 'tv' ? 'sonarr' : 'radarr';
  const isAdmin = userObj && userObj.role === 'admin';
  
  if (mustQueue(cfg, isAdmin)) {
    const all = load().requests || [];
    if (all.find((r) => r.status === 'pending' && ((tvdbId && String(r.tvdbId) === String(tvdbId)) || (!tvdbId && String(r.tmdbId) === String(mediaId))) && r.media === mediaType)) {
      return res.json({ id: Math.floor(Math.random() * 100000), media: { tmdbId: mediaId, status: 2 } });
    }
    
    const rq = {
      id: crypto.randomUUID(),
      status: 'pending',
      media: mediaType,
      tmdbId: mediaId,
      tvdbId: tvdbId || null,
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
    return res.json({ id: Math.floor(Math.random() * 100000), status: 1, media: { tmdbId: mediaId, status: 2 } });
  }
  
  try {
    const idToUse = (mediaType === 'tv' && tvdbId) ? `tvdb:${tvdbId}` : mediaId;
    await arr.add(kind, idToUse, { seasons });
    telegram.notify('autoApproved', { title, poster, media: mediaType, tmdbId: mediaId, by: username, seasons }); discord.notify('autoApproved', { title, poster, media: mediaType, tmdbId: mediaId, by: username, seasons });
    res.json({ id: Math.floor(Math.random() * 100000), status: 2, media: { tmdbId: mediaId, status: 5 } }); // 5 = Available
  } catch (e) {
    if (e.message && e.message.toLowerCase().includes('already')) {
      telegram.notify('available', { title, poster, media: mediaType, tmdbId: mediaId, by: username }); discord.notify('available', { title, poster, media: mediaType, tmdbId: mediaId, by: username });
      return res.json({ id: Math.floor(Math.random() * 100000), status: 2, media: { tmdbId: mediaId, status: 3 } }); // 3 = Processing / Available
    }
    telegram.notify('failed', { title, poster, media: mediaType, tmdbId: mediaId, by: username }); discord.notify('failed', { title, poster, media: mediaType, tmdbId: mediaId, by: username });
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


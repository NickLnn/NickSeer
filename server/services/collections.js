import { load } from '../config.js';
import plex from './plex.js';
import arr from './arr.js';
import engine from '../recommend/engine.js';
import { cached, TTL_DAY, TTL_HOUR } from '../lib/cache.js';

function tmdbBase() {
  const c = load();
  return {
    apiKey: c.tmdb?.apiKey || '',
    language: c.tmdb?.language || 'en-US'
  };
}

const TOP_COLLECTION_IDS = [
  528,    // The Terminator Collection
  9485,   // The Fast and the Furious Collection
  8091,   // Alien Collection
  399,    // Predator Collection
  86311,  // The Avengers Collection
  1241,   // Harry Potter Collection
  119,    // The Lord of the Rings Collection
  2344,   // The Matrix Collection
  404609, // John Wick Collection
  87359,  // Mission: Impossible Collection
  263,    // The Dark Knight Collection
  556,    // Spider-Man (Original) Collection
  531241, // Spider-Man (MCU) Collection
  645,    // James Bond Collection
  84,     // Indiana Jones Collection
  328,    // Jurassic Park Collection
  10,     // Star Wars Collection
  295,    // Pirates of the Caribbean Collection
  1570,   // Die Hard Collection
  8945,   // Mad Max Collection
  1733,   // Planet of the Apes (Original) Collection
  7624,   // Planet of the Apes (Reboot) Collection
  253,    // Bourne Collection
  8650,   // Transformers Collection
  131635, // The Hunger Games Collection
  10194,  // Toy Story Collection
  2150,   // Shrek Collection
  86066,  // Despicable Me Collection
  2602,   // Scream Collection
  91361,  // Halloween Collection
  656,    // Saw Collection
  313086, // The Conjuring Collection
  9742,   // Bad Boys Collection
  86055,  // Men in Black Collection
  96403,  // Blade Runner Collection
  264,    // Back to the Future Collection
  230,    // The Godfather Collection
  435254, // Ghostbusters Collection
  403,    // Final Destination Collection
  8354,   // Ice Age Collection
  435259, // Kingsman Collection
  726871, // Dune Collection
  87096,  // Avatar Collection
  33514,  // The Twilight Saga
  1575,   // Rocky Collection
  544669, // Creed Collection
  529892, // The Equalizer Collection
  10814,  // Rush Hour Collection
  37,     // Ocean's Collection
  304,    // Austin Powers Collection
  87002,  // Night at the Museum Collection
  131292, // Captain America Collection
  131295, // Iron Man Collection
  131296, // Thor Collection
  284433, // Guardians of the Galaxy Collection
  618529, // Venom Collection
  74401,  // Insidious Collection
  573436, // Knives Out Collection
  9385,   // The Karate Kid Collection
  2588,   // Rambo Collection
  422834, // Jumanji Collection
  325,    // RoboCop Collection
  287693, // Deadpool Collection
  436735, // IT Collection
  108269, // The Hangover Collection
  1709    // X-Men Collection
];

function getWeekSeed() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now - start + ((start.getTimezoneOffset() - now.getTimezoneOffset()) * 60000);
  const oneWeek = 1000 * 60 * 60 * 24 * 7;
  const weekNumber = Math.floor(diff / oneWeek);
  return `${now.getFullYear()}-W${weekNumber}`;
}

function pseudoRandom(seedStr) {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = ((hash << 5) - hash) + seedStr.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs((Math.sin(hash) * 10000) % 1);
}

async function fetchTmdbCollection(id) {
  const { apiKey, language } = tmdbBase();
  if (!apiKey) throw new Error('TMDB not configured');
  const url = `https://api.themoviedb.org/3/collection/${id}?api_key=${apiKey}&language=${language}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

function img(path, size = 'w500') {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

export async function getCollection(id) {
  const [col, libMap, radarrSet] = await Promise.all([
    fetchTmdbCollection(id),
    plex.libraryMap().catch(() => ({})),
    arr.monitoredSet('radarr').catch(() => new Set())
  ]);

  if (!col) return null;

  const reqs = (load().requests || []).filter(r => r.status === 'pending');
  const pendingIds = new Set(reqs.map(r => String(r.tmdbId)));
  const pendingTitles = new Set(reqs.map(r => (r.title || '').toLowerCase()).filter(Boolean));

  const rawParts = (col.parts || []).sort((a, b) => {
    const da = a.release_date || '9999';
    const db = b.release_date || '9999';
    return da.localeCompare(db);
  });

  const parts = rawParts.map(p => {
    const inLibrary = Boolean(plex.isMediaInLibrary ? plex.isMediaInLibrary(libMap, {
      id: p.id,
      media: 'movie',
      title: p.title,
      originalTitle: p.original_title,
      year: (p.release_date || '').slice(0, 4),
      releaseDate: p.release_date
    }) : (libMap['movie:' + p.id] || libMap[String(p.id)]));

    const isPending = !inLibrary && (
      radarrSet.has(String(p.id)) ||
      pendingIds.has(String(p.id)) ||
      (p.title && pendingTitles.has(p.title.toLowerCase()))
    );

    return {
      id: p.id,
      media: 'movie',
      title: p.title,
      releaseDate: p.release_date || '',
      year: (p.release_date || '').slice(0, 4),
      overview: p.overview || '',
      poster: img(p.poster_path, 'w500'),
      backdrop: img(p.backdrop_path, 'original'),
      rating: p.vote_average ? Math.round(p.vote_average * 10) / 10 : null,
      voteCount: p.vote_count || 0,
      inLibrary,
      isPending
    };
  });

  const total = parts.length;
  const owned = parts.filter(p => p.inLibrary).length;
  const pending = parts.filter(p => p.isPending).length;
  const missing = Math.max(0, total - owned);
  const unrequested = Math.max(0, total - owned - pending);

  return {
    id: col.id,
    name: col.name,
    overview: col.overview || '',
    poster: img(col.poster_path, 'w500'),
    backdrop: img(col.backdrop_path, 'original'),
    total,
    owned,
    missing,
    pending,
    unrequested,
    completionPercent: total > 0 ? Math.round((owned / total) * 100) : 0,
    parts
  };
}

async function buildAllCollections(userId) {
  const { apiKey } = tmdbBase();
  if (!apiKey) return { incomplete: [], popular: [], completed: [], all: [] };

  const [libMap, userAffinity, radarrSet] = await Promise.all([
    plex.libraryMap().catch(() => ({})),
    engine.getUserGenreAffinity(userId).catch(() => new Map()),
    arr.monitoredSet('radarr').catch(() => new Set())
  ]);

  const reqs = (load().requests || []).filter(r => r.status === 'pending');
  const pendingIds = new Set(reqs.map(r => String(r.tmdbId)));
  const pendingTitles = new Set(reqs.map(r => (r.title || '').toLowerCase()).filter(Boolean));
  const weekSeed = getWeekSeed();

  const collections = [];

  // Fetch collections concurrently in batches of 10
  for (let i = 0; i < TOP_COLLECTION_IDS.length; i += 10) {
    const batch = TOP_COLLECTION_IDS.slice(i, i + 10);
    const results = await Promise.all(batch.map(id => fetchTmdbCollection(id).catch(() => null)));
    for (const col of results) {
      if (!col || !col.parts || col.parts.length === 0) continue;

      const rawParts = (col.parts || []).sort((a, b) => (a.release_date || '9999').localeCompare(b.release_date || '9999'));
      const genreSet = new Set();
      let totalRating = 0;
      let ratedCount = 0;

      const parts = rawParts.map(p => {
        (p.genre_ids || []).forEach(g => genreSet.add(g));
        if (p.vote_average) { totalRating += p.vote_average; ratedCount++; }
        const inLibrary = Boolean(plex.isMediaInLibrary ? plex.isMediaInLibrary(libMap, {
          id: p.id,
          media: 'movie',
          title: p.title,
          originalTitle: p.original_title,
          year: (p.release_date || '').slice(0, 4),
          releaseDate: p.release_date
        }) : (libMap['movie:' + p.id] || libMap[String(p.id)]));

        const isPending = !inLibrary && (
          radarrSet.has(String(p.id)) ||
          pendingIds.has(String(p.id)) ||
          (p.title && pendingTitles.has(p.title.toLowerCase()))
        );

        return {
          id: p.id,
          media: 'movie',
          title: p.title,
          releaseDate: p.release_date || '',
          year: (p.release_date || '').slice(0, 4),
          overview: p.overview || '',
          poster: img(p.poster_path, 'w500'),
          backdrop: img(p.backdrop_path, 'w1280'),
          rating: p.vote_average ? Math.round(p.vote_average * 10) / 10 : null,
          inLibrary,
          isPending
        };
      });

      const total = parts.length;
      const owned = parts.filter(p => p.inLibrary).length;
      const pending = parts.filter(p => p.isPending).length;
      const missing = Math.max(0, total - owned);
      const unrequested = Math.max(0, total - owned - pending);

      // Compute personalized taste score + weekly rotation jitter
      let tasteScore = 0;
      genreSet.forEach(g => {
        tasteScore += (userAffinity.get(g) || 0) * 1.8;
      });
      const avgRating = ratedCount > 0 ? (totalRating / ratedCount) : 6.0;
      const weeklyJitter = pseudoRandom(col.id + '_' + weekSeed + '_' + (userId || 'global')) * 3.5;
      const rankScore = tasteScore + (avgRating * 0.8) + weeklyJitter;

      collections.push({
        id: col.id,
        name: col.name,
        overview: col.overview || '',
        poster: img(col.poster_path, 'w500'),
        backdrop: img(col.backdrop_path, 'w1280'),
        total,
        owned,
        missing,
        pending,
        unrequested,
        completionPercent: total > 0 ? Math.round((owned / total) * 100) : 0,
        rankScore,
        parts
      });
    }
  }

  // 1. Incomplete: Franchises where user owns >= 1 and missing >= 1
  const incomplete = collections
    .filter(c => c.owned > 0 && c.missing > 0)
    .sort((a, b) => b.completionPercent - a.completionPercent || b.owned - a.owned);

  // 2. Completed: User owns all movies
  const completed = collections
    .filter(c => c.owned > 0 && c.missing === 0)
    .sort((a, b) => b.total - a.total);

  // 3. Popular / Recommended: Unowned franchises sorted by personal taste & weekly rotation
  const popular = collections
    .filter(c => c.owned === 0)
    .sort((a, b) => b.rankScore - a.rankScore);

  return {
    incomplete,
    popular,
    completed,
    week: weekSeed,
    user: userId || 'default',
    all: collections,
    summary: {
      totalCollections: collections.length,
      incompleteCount: incomplete.length,
      completedCount: completed.length
    }
  };
}

export async function getCollections(options = {}) {
  const userId = typeof options === 'string' ? options : (options?.userId || '');
  const force = typeof options === 'object' ? !!options.force : false;
  const weekSeed = getWeekSeed();
  const cacheKey = `collections:${userId || 'default'}:${weekSeed}`;
  return cached(cacheKey, TTL_HOUR * 3, () => buildAllCollections(userId), force);
}

export default { getCollection, getCollections };
